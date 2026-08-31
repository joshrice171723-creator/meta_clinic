import type { Metadata } from 'next';
import { ArrowUpRight, FilePenLine, BookOpen, ArrowRight } from 'lucide-react';
import { MemberShell, ConnectionNotice } from '@/components/member-shell';
import { currentMember, protectedRequest, type Material } from '@/lib/member-server';
import type { Paperwork } from '@/lib/portal';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your launch — APPly', robots: { index: false, follow: false }, alternates: { canonical: '/portal' } };
export default async function PortalPage() {
  const user = await currentMember();
  if (!user) return <MemberShell><ConnectionNotice /></MemberShell>;
  let paperwork: Paperwork[]; let training: Material[];
  try {
    const [documents, lessons] = await Promise.all([protectedRequest('paperworks'), protectedRequest('materials')]);
    if (!documents.ok || !lessons.ok) throw new Error('unavailable');
    paperwork = (await documents.json() as { paperworks: Paperwork[] }).paperworks;
    training = (await lessons.json() as { materials: Material[] }).materials;
  } catch { return <MemberShell><ConnectionNotice /></MemberShell>; }
  const documentsComplete = paperwork.filter(item => item.status === 'completed').length;
  const trainingComplete = training.filter(item => item.status === 'completed').length;
  return <MemberShell active="overview">
    {user.development_demo && <p className="demo-notice">Local demo client · Explore sample paperwork and training. Progress is saved for this session; signing out and entering again starts a fresh demo. Use fictional information only.</p>}
    <div className="portal-intro"><p className="eyebrow">YOUR APPly WORKSPACE</p><h1>Your next chapter.<br /><em>One step at a time.</em></h1><p>The paperwork to move forward. The know-how to feel prepared.</p></div>
    <div className="portal-modules">
      <a href="/paperwork" className="portal-module"><span className="module-icon"><FilePenLine size={29} strokeWidth={1.4} aria-hidden="true" /></span><span className="module-number">01 / MAKE IT OFFICIAL</span><h2>Paperwork</h2><p>Review your assigned documents, pick up where you left off, and keep track of what’s signed.</p><div className="module-progress"><span>{documentsComplete} of {paperwork.length} completed</span><span>Review & sign <ArrowUpRight size={17} aria-hidden="true" /></span></div></a>
      <a href="/training" className="portal-module training-module"><span className="module-icon"><BookOpen size={29} strokeWidth={1.4} aria-hidden="true" /></span><span className="module-number">02 / GET YOUR BEARINGS</span><h2>Onboarding<br />& Training</h2><p>Practical guides now, with Kevin’s written resources and video walkthroughs to follow.</p><div className="module-progress"><span>{trainingComplete} of {training.length} completed</span><span>Start learning <ArrowUpRight size={17} aria-hidden="true" /></span></div></a>
    </div>
    <div className="portal-bottom"><div><h2>Need a hand?</h2><p>You don’t have to figure out your next step alone.</p></div><a className="text-link" href="/contact">Contact APPly <ArrowRight size={16} aria-hidden="true" /></a></div>
    <p className="portal-boundary">This is your launch and learning workspace—not an EHR. Patient records stay outside this portal. SharePoint setup will be mapped separately.</p>
    {user.admin && <p><a className="text-link" href="/inquiries">Administration: contact inbox →</a></p>}
  </MemberShell>;
}
