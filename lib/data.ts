import type { Filter, Sort } from 'mongodb';
import { getDatabase } from './mongodb';
import { serializeAgency, type AgencyDocument, type ScrapeStateDocument } from './types';

export type AgencySort = 'newest' | 'name' | 'rating' | 'reviews';

export function buildAgencyFilter(search: string, domains: string, verified: string): Filter<AgencyDocument> {
  const filter: Filter<AgencyDocument> = { clutchProviderId: { $exists: true } };
  if (search.trim()) filter.$text = { $search: search.trim() };
  if (domains === 'found') filter.websiteStatus = 'found';
  if (domains === 'missing') filter.websiteStatus = 'missing';
  if (verified === 'true') filter.verified = true;
  if (verified === 'false') filter.verified = false;
  return filter;
}

export async function listAgencies(options: {
  page?: number;
  limit?: number;
  search?: string;
  domains?: string;
  verified?: string;
  sort?: AgencySort;
}) {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 24));
  const filter = buildAgencyFilter(options.search || '', options.domains || 'all', options.verified || 'all');
  const sorts: Record<AgencySort, Sort> = {
    newest: { lastSeenAt: -1, _id: 1 },
    name: { name: 1, _id: 1 },
    rating: { rating: -1, reviewCount: -1, _id: 1 },
    reviews: { reviewCount: -1, rating: -1, _id: 1 }
  };
  const db = await getDatabase();
  const collection = db.collection<AgencyDocument>('agencies');
  const projection = { sourceListingUrl: 0, createdAt: 0, updatedAt: 0, firstSeenAt: 0 };
  const [items, total] = await Promise.all([
    collection.find(filter, { projection }).sort(sorts[options.sort || 'newest']).skip((page - 1) * limit).limit(limit).toArray(),
    collection.countDocuments(filter)
  ]);
  return { agencies: items.map(serializeAgency), page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) };
}

export async function getStats() {
  const db = await getDatabase();
  const agencies = db.collection<AgencyDocument>('agencies');
  const [facet] = await agencies.aggregate<{
    total: { value: number }[];
    domains: { value: number }[];
    verified: { value: number }[];
    locations: { value: number }[];
  }>([
  { $match: { clutchProviderId: { $exists: true } } },
  {
    $facet: {
      total: [{ $count: 'value' }],
      domains: [{ $match: { websiteStatus: 'found' } }, { $count: 'value' }],
      verified: [{ $match: { verified: true } }, { $count: 'value' }],
      locations: [{ $match: { location: { $type: 'string', $ne: '' } } }, { $count: 'value' }]
    }
  }]).toArray();
  const state = await db.collection<ScrapeStateDocument>('scrape_state').findOne({ _id: 'clutch-agencies' });
  return {
    total: facet?.total[0]?.value || 0,
    domains: facet?.domains[0]?.value || 0,
    verified: facet?.verified[0]?.value || 0,
    locations: facet?.locations[0]?.value || 0,
    scrape: state ? {
      status: state.status,
      pagesVisited: state.pagesVisited,
      directoryTotal: state.directoryTotal,
      updatedAt: state.updatedAt.toISOString(),
      lastError: state.lastError
    } : null
  };
}

export async function getAgency(slug: string) {
  const db = await getDatabase();
  const item = await db.collection<AgencyDocument>('agencies').findOne({ slug });
  return item ? serializeAgency(item) : null;
}
