import { loadEnvConfig } from '@next/env';
import { MongoClient, type Filter } from 'mongodb';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import type { AgencyDocument } from '../lib/types';

loadEnvConfig(process.cwd());

const cli = new Set(process.argv.slice(2));
const limitArg = process.argv.find((value) => value.startsWith('--limit='));
const env = z.object({
  SCRAPE_MONGODB_URI: z.string().min(1).optional(),
  MONGODB_URI: z.string().min(1).optional(),
  DOMAIN_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(4),
  DOMAIN_BATCH_DELAY_MS: z.coerce.number().int().min(100).default(500),
  DOMAIN_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).default(15_000)
}).parse(process.env);

const configuredMongoUri = env.SCRAPE_MONGODB_URI || env.MONGODB_URI;
if (!configuredMongoUri) throw new Error('Set SCRAPE_MONGODB_URI or MONGODB_URI in .env.local');
const mongoUri: string = configuredMongoUri;
const runLimit = limitArg ? z.coerce.number().int().min(1).parse(limitArg.slice(8)) : Number.POSITIVE_INFINITY;
let stopRequested = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { stopRequested = true; });

async function main() {
  const client = new MongoClient(mongoUri, { maxPoolSize: 8, serverSelectionTimeoutMS: 10_000, retryWrites: true });
  await client.connect();
  const dbName = new URL(mongoUri).pathname.replace(/^\//, '') || 'clutch_atlas';
  const agencies = client.db(dbName).collection<AgencyDocument>('agencies');
  await agencies.createIndex({ domainLookupStatus: 1, clutchProviderId: 1 });

  const filter: Filter<AgencyDocument> = cli.has('--refresh')
    ? { clutchProviderId: { $exists: true } }
    : { clutchProviderId: { $exists: true }, websiteStatus: 'missing', domainLookupStatus: { $nin: ['resolved', 'unavailable'] } };
  const total = Math.min(await agencies.countDocuments(filter), runLimit);
  if (!total) {
    console.log('All eligible Clutch provider domains have already been checked. Use --refresh to resolve them again.');
    await client.close();
    return;
  }

  console.log(`Resolving ${total.toLocaleString()} company websites from r.clutch.co with concurrency ${env.DOMAIN_CONCURRENCY}.`);
  let checked = 0;
  let found = 0;
  let unavailable = 0;
  let failed = 0;
  let lastId = 0;

  try {
    while (!stopRequested && checked < total) {
      const remaining = Math.min(env.DOMAIN_CONCURRENCY, total - checked);
      const items = await agencies.find({ ...filter, clutchProviderId: { $gt: lastId } }, { projection: { _id: 1, clutchProviderId: 1 } }).sort({ clutchProviderId: 1 }).limit(remaining).toArray();
      if (!items.length) break;
      const results = await Promise.all(items.map(async (agency) => ({ agency, resolution: await resolveWithRetry(agency.clutchProviderId!) })));

      for (const { agency, resolution } of results) {
        lastId = Math.max(lastId, agency.clutchProviderId!);
        const now = new Date();
        if (resolution.url) {
          await agencies.updateOne({ _id: agency._id }, { $set: {
            domain: domainFromUrl(resolution.url), websiteUrl: resolution.url, websiteStatus: 'found',
            websiteSource: 'clutch_redirect', domainLookupStatus: 'resolved', domainLookupAt: now,
            domainLookupError: null, updatedAt: now
          } });
          found += 1;
        } else {
          const status = resolution.retryable ? 'failed' : 'unavailable';
          await agencies.updateOne({ _id: agency._id }, { $set: {
            domainLookupStatus: status, domainLookupAt: now, domainLookupError: resolution.error, updatedAt: now
          } });
          if (status === 'failed') failed += 1; else unavailable += 1;
        }
        checked += 1;
      }
      if (checked % 100 === 0 || checked === total) console.log(`  ${checked.toLocaleString()} / ${total.toLocaleString()} checked · ${found.toLocaleString()} found · ${unavailable.toLocaleString()} unavailable · ${failed.toLocaleString()} retryable failures`);
      if (!stopRequested && checked < total) await sleep(env.DOMAIN_BATCH_DELAY_MS);
    }
  } finally {
    await client.close();
  }

  if (stopRequested) console.log('\nStopped safely. Run npm run enrich:domains to resume remaining providers.');
  else console.log(`Domain enrichment complete: ${found.toLocaleString()} websites found, ${unavailable.toLocaleString()} unavailable, ${failed.toLocaleString()} retryable failures.`);
}

async function resolveWithRetry(providerId: number) {
  let lastError = 'Unknown redirect failure';
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const result = await resolveProviderWebsite(providerId);
      if (!result.retryable) return result;
      lastError = result.error;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown redirect failure';
    }
    if (attempt < 4) await sleep(attempt * 1000);
  }
  return { url: null, retryable: true, error: lastError };
}

export async function resolveProviderWebsite(providerId: number) {
  const response = await fetch(`https://r.clutch.co/redirect?pid=${encodeURIComponent(providerId)}`, {
    redirect: 'manual', headers: { Accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(env.DOMAIN_REQUEST_TIMEOUT_MS)
  });
  const location = response.headers.get('location');
  if (response.status === 404 || response.status === 410 || (response.status === 400 && !location)) return { url: null, retryable: false, error: `No website redirect (HTTP ${response.status})` };
  if (response.status === 429 || response.status >= 500) return { url: null, retryable: true, error: `Redirect service HTTP ${response.status}` };
  if (!location) return { url: null, retryable: response.status >= 400, error: `No Location header (HTTP ${response.status})` };
  const url = safeDestination(location);
  return url ? { url, retryable: false, error: '' } : { url: null, retryable: false, error: 'Redirect destination was not a valid external HTTP(S) URL' };
}

function safeDestination(raw: string) {
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    if (host === 'clutch.co' || host.endsWith('.clutch.co')) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function domainFromUrl(raw: string) { return new URL(raw).hostname.toLowerCase().replace(/^www\./, ''); }

if (/[/\\]domains\.ts$/.test(process.argv[1] || '')) {
  main().catch((error: unknown) => {
    console.error(`Failed to enrich domains: ${error instanceof Error ? error.message : 'unknown error'}`);
    process.exitCode = 1;
  });
}
