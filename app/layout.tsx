import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Clutch Atlas — Agency Directory',
  description: 'Search and explore a structured directory of Clutch agency profiles.',
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
