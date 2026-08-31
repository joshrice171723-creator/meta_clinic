import type { Metadata } from 'next';
import { ArrowUpRight, BookOpen, Video } from 'lucide-react';
import { MemberShell, ConnectionNotice } from '@/components/member-shell';
import { ProgressBadge } from '@/components/progress-badge';
import { currentMember, protectedRequest, type Material } from '@/lib/member-server';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Onboarding & Training — APPly', robots: { index: false, follow: false }, alternates: { canonical: '/training' } };
export default async function TrainingPage() {
  const user = await currentMember();
  if (!user) return <MemberShell><ConnectionNotice /></MemberShell>;
  let materials: Material[];
  try {
    const response = await protectedRequest('materials');
    if (!response.ok) throw new Error('unavailable');
    materials = (await response.json() as { materials: Material[] }).materials;
  } catch { return <MemberShell><ConnectionNotice /></MemberShell>; }
  return <MemberShell active="training"><div className="section-page-heading"><p className="eyebrow">02 / GET YOUR BEARINGS</p><h1>Practical knowledge.<br /><em>A more confident start.</em></h1><p>Work through the guides at your own pace. Your progress is saved to your account.</p></div>
    <div className="training-heading"><h2>Written guides</h2><p>{materials.filter(item => item.status === 'completed').length} of {materials.length} completed</p></div>
    {materials.length ? <div className="resource-list">{materials.map(material => <a className="resource-card lesson-card" href={`/training/${material.id}`} key={material.id}><div className="lesson-card-top"><BookOpen size={23} strokeWidth={1.4} aria-hidden="true" /><ProgressBadge status={material.status} /></div><p className="eyebrow">{material.sample ? 'SAMPLE GUIDE' : 'WRITTEN GUIDE'}</p><h2>{material.title}</h2><p>{material.summary}</p><span className="text-link">{material.status === 'completed' ? 'Revisit guide' : material.status === 'started' ? 'Continue reading' : 'Open guide'} <ArrowUpRight size={15} aria-hidden="true" /></span></a>)}</div> : <div className="empty-materials"><h2>Your library is taking shape.</h2><p>Written guides will appear here as they’re published.</p></div>}
    <div className="video-coming"><Video size={31} strokeWidth={1.4} aria-hidden="true" /><div><p className="eyebrow">COMING LATER</p><h2>Learn directly from Kevin.</h2><p>Video walkthroughs and mentorship resources will live here when they’re ready. No videos have been published yet.</p></div></div>
    <p className="portal-boundary">The sample guides demonstrate the learning experience. They are not Kevin’s reviewed training, legal advice, clinical instructions, or evidence of clinic readiness.</p>
  </MemberShell>;
}
