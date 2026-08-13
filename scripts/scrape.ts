import { loadEnvConfig } from '@next/env';
import { MongoClient, type AnyBulkWriteOperation } from 'mongodb';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import { fetchProviders, type McpProvider } from './mcp';
import type { AgencyDocument, ScrapeStateDocument } from '../lib/types';

loadEnvConfig(process.cwd());

const cli = new Set(process.argv.slice(2));
const env = z.object({
  SCRAPE_MONGODB_URI: z.string().min(1).optional(),
  MONGODB_URI: z.string().min(1).optional(),
  CLUTCH_MCP_URL: z.string().url().default('https://bot.clutch.co/mcp'),
  CLUTCH_SERVICE: z.string().min(1).default('Advertising'),
  SCRAPER_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(500),
  SCRAPER_DELAY_MS: z.coerce.number().int().min(250).default(1000)
}).parse(process.env);

const configuredMongoUri = env.SCRAPE_MONGODB_URI || env.MONGODB_URI;
if (!configuredMongoUri) throw new Error('Set SCRAPE_MONGODB_URI or MONGODB_URI in .env.local');
const mongoUri: string = configuredMongoUri;
const mcpUrl = validateMcpUrl(env.CLUTCH_MCP_URL);
const stateId = 'clutch-agencies' as const;
let stopRequested = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { stopRequested = true; });

async function main() {
  const client = new MongoClient(mongoUri, { maxPoolSize: 8, serverSelectionTimeoutMS: 10_000, retryWrites: true });
  await client.connect();
  const dbName = new URL(mongoUri).pathname.replace(/^\//, '') || 'clutch_atlas';
  const db = client.db(dbName);
  const agencies = db.collection<AgencyDocument>('agencies');
  const states = db.collection<ScrapeStateDocument>('scrape_state');
  await Promise.all([
    agencies.createIndex({ clutchProfileUrl: 1 }, { unique: true }),
    agencies.createIndex({ clutchProviderId: 1 }, { unique: true, sparse: true }),
    agencies.createIndex({ slug: 1 }, { unique: true, sparse: true }),
    agencies.createIndex({ name: 'text', domain: 'text', location: 'text' }, { name: 'agency_search' }),
    agencies.createIndex({ name: 1 }),
    agencies.createIndex({ domain: 1 }),
    agencies.createIndex({ rating: -1, reviewCount: -1 }),
    agencies.createIndex({ lastSeenAt: -1 })
  ]);

  if (cli.has('--clear')) {
    const result = await agencies.deleteMany({});
    await states.deleteOne({ _id: stateId });
    console.log(`Cleared ${result.deletedCount.toLocaleString()} agency records.`);
  } else if (cli.has('--reset')) {
    await states.deleteOne({ _id: stateId });
    console.log('Reset the MCP cursor; existing agencies and captured domains are retained.');
  }

  let previous = await states.findOne({ _id: stateId });
  if (previous && previous.sourceMode !== 'mcp') {
    console.log('Migrating the old HTML cursor to Clutch’s official MCP feed; existing records are retained.');
    await states.deleteOne({ _id: stateId });
    previous = null;
  }
  if (previous?.status === 'completed' && !cli.has('--reset') && !cli.has('--clear')) {
    console.log('The full Advertising directory is already complete. Use npm run scrape -- --reset to refresh it.');
    await client.close();
    return;
  }

  let offset = previous?.nextOffset || 0;
  await states.updateOne({ _id: stateId }, {
    $set: {
      status: 'running', sourceMode: 'mcp', startUrl: mcpUrl, nextUrl: mcpUrl,
      currentPage: Math.floor(offset / env.SCRAPER_BATCH_SIZE) + 1,
      nextOffset: offset, batchSize: env.SCRAPER_BATCH_SIZE,
      updatedAt: new Date(), completedAt: null, lastError: null
    },
    $setOnInsert: { pagesVisited: 0, recordsProcessed: 0, directoryTotal: null, startedAt: new Date() }
  }, { upsert: true });

  try {
    while (!stopRequested) {
      const batchNumber = Math.floor(offset / env.SCRAPER_BATCH_SIZE) + 1;
      console.log(`Batch ${batchNumber.toLocaleString()} · offset ${offset.toLocaleString()} · requesting up to ${env.SCRAPER_BATCH_SIZE}`);
      const payload = await fetchWithRetry(offset);
      const providers = payload.providers || [];
      const now = new Date();

      if (!providers.length) {
        const total = await agencies.estimatedDocumentCount();
        await states.updateOne({ _id: stateId }, { $set: { status: 'completed', nextUrl: null, nextOffset: offset, directoryTotal: total, updatedAt: now, completedAt: now, lastError: null } });
        console.log(`Complete. Saved ${total.toLocaleString()} unique agency profiles.`);
        break;
      }

      const result = await agencies.bulkWrite(providers.map((provider) => upsertOperation(provider, payload.page_url, now)), { ordered: false });
      offset += providers.length;
      const finished = providers.length < env.SCRAPER_BATCH_SIZE;
      const total = await agencies.estimatedDocumentCount();
      const paused = cli.has('--once');
      await states.updateOne({ _id: stateId }, {
        $set: {
          status: finished ? 'completed' : paused ? 'paused' : 'running',
          nextUrl: finished ? null : mcpUrl,
          nextOffset: offset,
          currentPage: Math.floor(offset / env.SCRAPER_BATCH_SIZE) + 1,
          directoryTotal: finished ? offset : null,
          updatedAt: now,
          completedAt: finished ? now : null,
          lastError: null
        },
        $inc: { pagesVisited: 1, recordsProcessed: providers.length }
      });
      console.log(`  ${providers.length} profiles · ${result.upsertedCount} new · ${total.toLocaleString()} unique saved`);

      if (finished) {
        console.log(`Complete. Official MCP feed ended at ${offset.toLocaleString()} Advertising providers.`);
        break;
      }
      if (paused) {
        console.log('Diagnostic one-batch run complete. Run npm run scrape to resume without a limit.');
        break;
      }
      await sleep(env.SCRAPER_DELAY_MS);
    }

    if (stopRequested) {
      await states.updateOne({ _id: stateId }, { $set: { status: 'paused', nextOffset: offset, updatedAt: new Date(), lastError: null } });
      console.log('\nStopped at a safe checkpoint. Run npm run scrape to resume.');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown collector failure';
    await states.updateOne({ _id: stateId }, { $set: { status: 'failed', nextOffset: offset, updatedAt: new Date(), lastError: message } });
    console.error(`\nFailed: ${message}`);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

async function fetchWithRetry(offset: number) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await fetchProviders(mcpUrl, { service: env.CLUTCH_SERVICE, offset, limit: env.SCRAPER_BATCH_SIZE });
    } catch (error) {
      lastError = error;
      if (attempt < 4) {
        const wait = attempt * 3000;
        console.warn(`  MCP request failed (attempt ${attempt}/4); retrying in ${wait / 1000}s`);
        await sleep(wait);
      }
    }
  }
  throw lastError;
}

function upsertOperation(provider: McpProvider, pageUrl: string | undefined, now: Date): AnyBulkWriteOperation<AgencyDocument> {
  const publicProfileUrl = validProfileUrl(provider.url);
  const profileUrl = publicProfileUrl || `https://clutch.co/agencies#provider-${provider.id}`;
  const slug = publicProfileUrl ? new URL(publicProfileUrl).pathname.split('/').filter(Boolean).at(-1)! : `provider-${provider.id}`;
  const services = [...new Set((provider.certifications || []).filter((item) => item.type === 'Service Line').map((item) => item.name))].slice(0, 20);
  const focusAreas = [...new Set((provider.certifications || []).filter((item) => item.type === 'Focus Area').map((item) => item.name))].slice(0, 40);
  const reviewMetrics = provider.aggregated_review_metrics;
  const set: Partial<AgencyDocument> = {
    clutchProviderId: provider.id, clutchProfileUrl: profileUrl,
    name: provider.title.trim(), slug, sourceListingUrl: pageUrl || 'https://clutch.co/agencies',
    rating: finite(provider.rating), reviewCount: integer(provider.reviews_number),
    verified: Boolean(provider.verification_level && provider.verification_level !== 'unverified'), services, focusAreas,
    description: textOrNull(provider.generated_summary),
    logoUrl: textOrNull(provider.logo),
    officeLocations: cleanList(provider.office_locations, 50),
    pricingSummary: textOrNull(provider.pricing_summary),
    verificationLevel: textOrNull(provider.verification_level),
    verificationStatus: textOrNull(provider.verification_status),
    clutchGuarantee: provider.clutch_guarantee === true,
    costAverageScore: finite(provider.cost_average_score),
    verifiedReviewCount: integer(reviewMetrics?.count_verified),
    recentReviewCount: integer(reviewMetrics?.recent_reviews),
    mostCommonProjectSize: textOrNull(reviewMetrics?.most_common_project_size),
    lastSeenAt: now, updatedAt: now
  };
  const insert: Partial<AgencyDocument> = {
    domain: null, websiteUrl: null, websiteStatus: 'missing',
    employeeRange: null, firstSeenAt: now, createdAt: now
  };
  if (provider.location?.trim()) set.location = provider.location.trim(); else insert.location = null;
  if (provider.min_project_size != null) set.minProjectSize = `$${Math.round(provider.min_project_size).toLocaleString('en-US')}+`; else insert.minProjectSize = null;
  if (provider.hourly_rate && provider.hourly_rate !== 'Unknown') set.hourlyRate = provider.hourly_rate; else insert.hourlyRate = null;
  return { updateOne: { filter: { $or: [{ clutchProviderId: provider.id }, { clutchProfileUrl: profileUrl }] }, update: { $set: set, $setOnInsert: insert }, upsert: true } };
}

function validateMcpUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.hostname !== 'bot.clutch.co' || url.pathname !== '/mcp') throw new Error('CLUTCH_MCP_URL must be https://bot.clutch.co/mcp');
  return url.toString();
}

function validProfileUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== 'clutch.co' || !url.pathname.startsWith('/profile/')) return null;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function finite(value: number | null | undefined) { return Number.isFinite(value) ? Number(value) : null; }
function integer(value: number | null | undefined) { return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null; }
function textOrNull(value: string | null | undefined) { return value?.trim() || null; }
function cleanList(value: string[] | null | undefined, limit: number) { return [...new Set((value || []).map((item) => item.trim()).filter(Boolean))].slice(0, limit); }

main().catch((error: unknown) => {
  console.error(`Failed to start collector: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});
