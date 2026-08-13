import { NextResponse } from 'next/server';
import { getStats } from '@/lib/data';

export const runtime = 'nodejs';

export async function GET() {
  try {
    return NextResponse.json(await getStats(), { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' } });
  } catch (error) {
    console.error('Stats query failed', error);
    return NextResponse.json({ error: 'The agency database is temporarily unavailable' }, { status: 503 });
  }
}
