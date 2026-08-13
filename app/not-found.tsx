import { ArrowLeft, Building2 } from 'lucide-react';

export default function NotFound() {
  return <main className="state-page"><div className="state-card"><span><Building2 size={28} /></span><p className="eyebrow">404 · NOT FOUND</p><h1>That company isn’t here.</h1><p>It may have moved, or it has not been collected yet.</p><a href="/"><ArrowLeft size={16} /> Return to the directory</a></div></main>;
}
