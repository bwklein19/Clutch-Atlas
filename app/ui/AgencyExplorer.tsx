'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, ExternalLink, Loader2, Search, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';
import type { PublicAgency } from '@/lib/types';

interface Result { agencies: PublicAgency[]; page: number; limit: number; total: number; pages: number }

export default function AgencyExplorer({ initial }: { initial: Result }) {
  const [result, setResult] = useState(initial);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [domains, setDomains] = useState('all');
  const [verified, setVerified] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => { setQuery(search.trim()); setPage(1); }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const params = useMemo(() => new URLSearchParams({ q: query, domains, verified, sort, page: String(page), limit: '50' }), [query, domains, verified, sort, page]);
  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/agencies?${params}`, { signal, cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not load agencies');
      setResult(body);
    } catch (cause) {
      if ((cause as Error).name !== 'AbortError') setError(cause instanceof Error ? cause.message : 'Could not load agencies');
    } finally { if (!signal.aborted) setLoading(false); }
  }, [params]);

  useEffect(() => {
    const controller = new AbortController();
    if (query || domains !== 'all' || verified !== 'all' || sort !== 'newest' || page !== 1) void load(controller.signal);
    else setResult(initial);
    return () => controller.abort();
  }, [load, initial, query, domains, verified, sort, page]);

  function reset() { setSearch(''); setQuery(''); setDomains('all'); setVerified('all'); setSort('newest'); setPage(1); }
  const filtered = query || domains !== 'all' || verified !== 'all';

  return <section className="directory-panel">
    <div className="directory-head">
      <div><h1>Agency directory</h1><p>{result.total.toLocaleString()} companies</p></div>
    </div>
    <div className="toolbar">
      <label className="search-input"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search company, domain, or location…" />{search && <button onClick={() => setSearch('')} aria-label="Clear search"><X size={15} /></button>}</label>
      <div className="filters"><span><SlidersHorizontal size={16} /> Filters</span><select value={domains} onChange={(e) => { setDomains(e.target.value); setPage(1); }}><option value="all">All domains</option><option value="found">Has domain</option><option value="missing">Missing domain</option></select><select value={verified} onChange={(e) => { setVerified(e.target.value); setPage(1); }}><option value="all">Any verification</option><option value="true">Verified</option><option value="false">Not verified</option></select><select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}><option value="newest">Recently collected</option><option value="name">Company A–Z</option><option value="rating">Highest rated</option><option value="reviews">Most reviewed</option></select>{filtered && <button className="reset-button" onClick={reset}>Reset</button>}</div>
    </div>
    {error && <div className="inline-error">{error}</div>}
    <div className={`results ${loading ? 'loading' : ''}`}>
      {loading && <div className="loading-overlay"><Loader2 className="spin" size={25} /></div>}
      {!result.agencies.length ? <Empty /> : <AgencyTable agencies={result.agencies} />}
    </div>
    <div className="pagination"><span>Page <b>{result.page.toLocaleString()}</b> of {result.pages.toLocaleString()}</span><div><button disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}><ArrowLeft size={17} />Previous</button><button disabled={page >= result.pages || loading} onClick={() => setPage((value) => value + 1)}>Next<ArrowRight size={17} /></button></div></div>
  </section>;
}

function AgencyTable({ agencies }: { agencies: PublicAgency[] }) {
  return <div className="table-scroll"><table><thead><tr><th>Company</th><th>Domain</th><th>Location</th><th>Rating</th><th>Reviews</th><th /></tr></thead><tbody>{agencies.map((agency) => <tr key={agency.id}><td><div className="company-cell"><Avatar name={agency.name} logoUrl={agency.logoUrl} /><div><a href={`/agencies/${agency.slug}`}>{agency.name}</a>{agency.verified && <span><ShieldCheck size={11} />Verified</span>}</div></div></td><td>{agency.domain ? <a className="domain" href={agency.websiteUrl || `https://${agency.domain}`} target="_blank" rel="noreferrer">{agency.domain}<ExternalLink size={12} /></a> : <span className="muted">—</span>}</td><td>{agency.location || '—'}</td><td>{agency.rating?.toFixed(1) || '—'}</td><td>{agency.reviewCount?.toLocaleString() || '—'}</td><td><a className="row-arrow" href={`/agencies/${agency.slug}`}><ArrowRight size={16} /></a></td></tr>)}</tbody></table></div>;
}

function Avatar({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  const palettes = [['#315bea', '#718cff'], ['#7552d6', '#a487ef'], ['#008d78', '#42b7a4'], ['#d46238', '#e99a79'], ['#2e79ad', '#67a6d3']];
  const index = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palettes.length;
  return <span className={`avatar ${logoUrl ? 'has-logo' : ''}`} style={logoUrl ? undefined : { background: `linear-gradient(145deg, ${palettes[index]![0]}, ${palettes[index]![1]})` }}>{logoUrl ? <img src={logoUrl} alt="" loading="lazy" /> : name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()}</span>;
}

function Empty() { return <div className="empty"><span><Building2 size={25} /></span><h3>No companies found</h3><p>Try a broader search or clear the active filters.</p></div>; }
