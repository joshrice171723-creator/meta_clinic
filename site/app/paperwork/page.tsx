import type { Metadata } from 'next';
import { ArrowUpRight, FileText } from 'lucide-react';
import { MemberShell, ConnectionNotice } from '@/components/member-shell';
import { ProgressBadge } from '@/components/progress-badge';
import { currentMember, protectedRequest } from '@/lib/member-server';
import type { Paperwork } from '@/lib/portal';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Paperwork — APPly', robots: { index: false, follow: false }, alternates: { canonical: '/paperwork' } };
export default async function PaperworkPage() {
  const user = await currentMember();
  if (!user) return <MemberShell><ConnectionNotice /></MemberShell>;
  let paperworks: Paperwork[];
  try {
    const response = await protectedRequest('paperworks');
    if (!response.ok) throw new Error('unavailable');
    paperworks = (await response.json() as { paperworks: Paperwork[] }).paperworks;
  } catch { return <MemberShell><ConnectionNotice /></MemberShell>; }
  return <MemberShell active="paperwork"><div className="section-page-heading"><p className="eyebrow">01 / MAKE IT OFFICIAL</p><h1>Your paperwork.<br /><em>A clear next step.</em></h1><p>Review and sign the documents assigned to your account. Your progress is saved as you go.</p></div>
    <div className="paperwork-summary"><span>{paperworks.filter(item => item.status === 'completed').length} of {paperworks.length} completed</span><p>“Completed” means signed here—not submitted, accepted, or approved by an institution.</p></div>
    {paperworks.length ? <div className="document-list">{paperworks.map(item => <a href={`/paperwork/${item.id}`} className="document-row" key={item.id}><FileText size={23} strokeWidth={1.4} aria-hidden="true" /><div className="document-description"><h2>{item.title}</h2><p>{item.demo ? 'Demo document · use a fictional name' : 'Assigned document'} · {item.document_version}</p></div><ProgressBadge status={item.status} /><ArrowUpRight size={18} aria-hidden="true" /></a>)}</div> : <div className="empty-materials"><FileText size={30} aria-hidden="true" /><h2>Your packet is on its way.</h2><p>No documents have been assigned yet. Your reviewed clinic paperwork will appear here when it’s ready.</p></div>}
    <p className="portal-boundary">The current signing flow is a demonstration only. Actual packet documents, signature requirements, PDF generation, institutional submission, and feedback tracking will be added after review.</p>
  </MemberShell>;
}
