import type { ObjectId } from 'mongodb';

export interface AgencyDocument {
  _id?: ObjectId;
  clutchProviderId?: number;
  name: string;
  slug: string;
  domain: string | null;
  websiteUrl: string | null;
  websiteStatus: 'found' | 'missing';
  websiteSource?: 'directory_card' | 'clutch_redirect';
  domainLookupStatus?: 'resolved' | 'unavailable' | 'failed';
  domainLookupAt?: Date | null;
  domainLookupError?: string | null;
  clutchProfileUrl: string;
  sourceListingUrl: string;
  location: string | null;
  rating: number | null;
  reviewCount: number | null;
  minProjectSize: string | null;
  hourlyRate: string | null;
  employeeRange: string | null;
  verified: boolean;
  services: string[];
  focusAreas?: string[];
  description?: string | null;
  logoUrl?: string | null;
  officeLocations?: string[];
  pricingSummary?: string | null;
  verificationLevel?: string | null;
  verificationStatus?: string | null;
  clutchGuarantee?: boolean;
  costAverageScore?: number | null;
  verifiedReviewCount?: number | null;
  recentReviewCount?: number | null;
  mostCommonProjectSize?: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicAgency {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  websiteUrl: string | null;
  clutchProfileUrl: string;
  location: string | null;
  rating: number | null;
  reviewCount: number | null;
  minProjectSize: string | null;
  hourlyRate: string | null;
  employeeRange: string | null;
  verified: boolean;
  services: string[];
  focusAreas: string[];
  description: string | null;
  logoUrl: string | null;
  officeLocations: string[];
  pricingSummary: string | null;
  verificationLevel: string | null;
  verificationStatus: string | null;
  clutchGuarantee: boolean;
  costAverageScore: number | null;
  verifiedReviewCount: number | null;
  recentReviewCount: number | null;
  mostCommonProjectSize: string | null;
  lastSeenAt: string;
}

export interface ScrapeStateDocument {
  _id: 'clutch-agencies';
  status: 'idle' | 'running' | 'paused' | 'blocked' | 'completed' | 'failed';
  startUrl: string;
  nextUrl: string | null;
  currentPage: number;
  pagesVisited: number;
  recordsProcessed: number;
  directoryTotal: number | null;
  startedAt: Date | null;
  updatedAt: Date;
  completedAt: Date | null;
  lastError: string | null;
  sourceMode?: 'html' | 'mcp';
  nextOffset?: number;
  batchSize?: number;
}

export function serializeAgency(agency: AgencyDocument): PublicAgency {
  return {
    id: agency._id?.toString() || agency.slug,
    name: agency.name,
    slug: agency.slug,
    domain: agency.domain,
    websiteUrl: safeHttpUrl(agency.websiteUrl),
    clutchProfileUrl: safeClutchUrl(agency.clutchProfileUrl) || 'https://clutch.co/agencies',
    location: agency.location,
    rating: agency.rating,
    reviewCount: agency.reviewCount,
    minProjectSize: agency.minProjectSize,
    hourlyRate: agency.hourlyRate,
    employeeRange: agency.employeeRange,
    verified: agency.verified,
    services: agency.services || [],
    focusAreas: agency.focusAreas || [],
    description: agency.description || null,
    logoUrl: safeLogoUrl(agency.logoUrl),
    officeLocations: agency.officeLocations || [],
    pricingSummary: agency.pricingSummary || null,
    verificationLevel: agency.verificationLevel || null,
    verificationStatus: agency.verificationStatus || null,
    clutchGuarantee: agency.clutchGuarantee || false,
    costAverageScore: agency.costAverageScore ?? null,
    verifiedReviewCount: agency.verifiedReviewCount ?? null,
    recentReviewCount: agency.recentReviewCount ?? null,
    mostCommonProjectSize: agency.mostCommonProjectSize || null,
    lastSeenAt: agency.lastSeenAt.toISOString()
  };
}

function safeHttpUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeClutchUrl(value: string) {
  const url = safeHttpUrl(value);
  if (!url) return null;
  const hostname = new URL(url).hostname;
  return hostname === 'clutch.co' || hostname.endsWith('.clutch.co') ? url : null;
}

function safeLogoUrl(value?: string | null) {
  const url = safeHttpUrl(value || null);
  if (!url) return null;
  return new URL(url).hostname === 'img.shgstatic.com' ? url : null;
}
