'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <main className="state-page"><div className="state-card"><span className="error-icon"><AlertTriangle size={28} /></span><p className="eyebrow">TEMPORARY ERROR</p><h1>We couldn’t load this page.</h1><p>Check the database connection and try again.</p><button onClick={reset}><RotateCcw size={16} /> Try again</button></div></main>;
}
