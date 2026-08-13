import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { ArrowLeft, Building2, CalendarDays, ExternalLink, Globe2, MapPin, ShieldCheck, Star, Users } from 'lucide-react';
import { getAgency } from '@/lib/data';

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();
  const agency = await getAgency((await params).slug).catch(() => null);
  return agency ? { title: `${agency.name} — Clutch Atlas`, description: `Company profile and website for ${agency.name}.` } : { title: 'Agency not found — Clutch Atlas' };
}

export default async function AgencyPage({ params }: Props) {
  await connection();
  const agency = await getAgency((await params).slug);
  if (!agency) notFound();

  return <main className="profile-page">
    <nav className="nav-shell">
      <a className="brand" href="/"><span className="brand-mark"><i /><i /><i /></span><span>Clutch <b>Atlas</b></span></a>
      <a className="back-link" href="/"><ArrowLeft size={16} /> Directory</a>
    </nav>
    <section className="profile-hero">
      <div className="profile-wrap">
        <a href="/" className="breadcrumb"><ArrowLeft size={15} /> All companies</a>
        <div className="profile-heading">
          <span className={`profile-avatar ${agency.logoUrl ? 'has-logo' : ''}`}>{agency.logoUrl ? <img src={agency.logoUrl} alt="" /> : initials(agency.name)}</span>
          <div><div className="profile-kicker">AGENCY PROFILE</div><h1>{agency.name}</h1><div className="profile-meta">
            {agency.verified && <span className="profile-verified"><ShieldCheck size={14} /> Verified profile</span>}
            {agency.location && <span><MapPin size={14} /> {agency.location}</span>}
            {agency.rating != null && <span><Star size={14} fill="currentColor" /> {agency.rating.toFixed(1)} · {agency.reviewCount?.toLocaleString() || 0} reviews</span>}
          </div></div>
        </div>
      </div>
    </section>
    <section className="profile-wrap profile-content">
      <div className="profile-main">
        {agency.description && <article className="profile-card profile-about"><div className="section-label">About the company</div><p>{agency.description}</p></article>}
        <article className="profile-card">
          <div className="section-label">Company overview</div>
          <div className="detail-grid">
            <Detail icon={<Globe2 />} label="Domain" value={agency.domain || 'Not available'} />
            <Detail icon={<MapPin />} label="Location" value={agency.location || 'Not listed'} />
            <Detail icon={<Users />} label="Team size" value={agency.employeeRange || 'Not listed'} />
            <Detail icon={<Building2 />} label="Minimum project" value={agency.minProjectSize || 'Not listed'} />
            <Detail icon={<Star />} label="Hourly rate" value={agency.hourlyRate || 'Not listed'} />
            <Detail icon={<Star />} label="Value rating" value={agency.costAverageScore != null ? `${agency.costAverageScore.toFixed(1)} / 5` : 'Not listed'} />
            <Detail icon={<Building2 />} label="Typical project" value={agency.mostCommonProjectSize || 'Not listed'} />
            <Detail icon={<CalendarDays />} label="Last collected" value={new Date(agency.lastSeenAt).toLocaleDateString('en-US', { dateStyle: 'medium' })} />
          </div>
        </article>
        <article className="profile-card">
          <div className="section-label">Services</div>
          <div className="profile-services">{agency.services.length ? agency.services.map((service) => <span key={service}>{service}</span>) : <p>No service breakdown was listed on the directory card.</p>}</div>
          {!!agency.focusAreas.length && <><div className="section-label sub-label">Specialties</div><div className="profile-services subtle">{agency.focusAreas.map((focus) => <span key={focus}>{focus}</span>)}</div></>}
        </article>
        {!!agency.officeLocations.length && <article className="profile-card"><div className="section-label">Office locations</div><div className="location-list">{agency.officeLocations.map((location) => <span key={location}><MapPin size={14} />{location}</span>)}</div></article>}
        {agency.pricingSummary && <article className="profile-card profile-about"><div className="section-label">Pricing insight</div><p>{agency.pricingSummary}</p></article>}
      </div>
      <aside className="profile-side">
        <div className="action-card"><h2>Visit this company</h2><p>Open the provider’s website or verify the source listing on Clutch.</p>
          {agency.websiteUrl && <a className="primary-action" href={agency.websiteUrl} target="_blank" rel="noopener noreferrer">Company website <ExternalLink size={16} /></a>}
          <a className="secondary-action" href={agency.clutchProfileUrl} target="_blank" rel="noopener noreferrer">View on Clutch <ExternalLink size={15} /></a>
        </div>
        <div className="source-note"><ShieldCheck size={18} /><div><b>Source transparency</b><p>This profile reflects public directory data at the time shown. Verify details before making a business decision.</p></div></div>
        {agency.verificationStatus && <div className="source-note verification-note"><ShieldCheck size={18} /><div><b>{agency.verificationLevel || 'Verification status'}</b><p>{agency.verificationStatus}</p></div></div>}
      </aside>
    </section>
  </main>;
}

function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="detail-item"><span>{icon}</span><div><small>{label}</small><b>{value}</b></div></div>;
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
}
