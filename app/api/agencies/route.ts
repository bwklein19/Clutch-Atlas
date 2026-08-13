import { NextResponse } from 'next/server';
import { z } from 'zod';
import { listAgencies } from '@/lib/data';

export const runtime = 'nodejs';

const querySchema = z.object({
  q: z.string().max(120).default(''),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  domains: z.enum(['all', 'found', 'missing']).default('all'),
  verified: z.enum(['all', 'true', 'false']).default('all'),
  sort: z.enum(['newest', 'name', 'rating', 'reviews']).default('newest')
});

export async function GET(request: Request) {
  const raw = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid search parameters' }, { status: 400 });
  try {
    const result = await listAgencies({ search: parsed.data.q, ...parsed.data });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=60' } });
  } catch (error) {
    console.error('Agency query failed', error);
    return NextResponse.json({ error: 'The agency database is temporarily unavailable' }, { status: 503 });
  }
}
