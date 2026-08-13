import { connection } from 'next/server';
import { Database } from 'lucide-react';
import { listAgencies } from '@/lib/data';
import AgencyExplorer from './ui/AgencyExplorer';

export default async function HomePage() {
  await connection();
  let data;
  let databaseError = '';
  try {
    data = await listAgencies({ limit: 50 });
  } catch (error) {
    databaseError = error instanceof Error ? error.message : 'Database unavailable';
    data = { agencies: [], page: 1, limit: 50, total: 0, pages: 1 };
  }

  return <main className="simple-main">
    <nav className="nav-shell">
      <a className="brand" href="/"><span className="brand-mark"><i /><i /><i /></span><span>Clutch <b>Atlas</b></span></a>
    </nav>
    <section className="simple-shell">
      {databaseError && <div className="database-error"><Database size={20} /><div><b>Database connection required</b><span>{databaseError}. Set MONGODB_URI in Vercel or .env.local.</span></div></div>}
      <AgencyExplorer initial={data} />
    </section>
  </main>;
}
