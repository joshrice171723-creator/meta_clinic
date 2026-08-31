import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MemberShell, ConnectionNotice } from '@/components/member-shell';
import { LearningActions } from '@/components/learning-actions';
import { currentMember, protectedRequest, type Material } from '@/lib/member-server';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Training guide — APPly', robots: { index: false, follow: false }, openGraph: { images: [] }, twitter: { images: [] } };
export default async function TrainingDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentMember();
  if (!user) return <MemberShell><ConnectionNotice /></MemberShell>;
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id)) notFound();
  let response: Response;
  try { response = await protectedRequest(`materials/${id}`); } catch { return <MemberShell><ConnectionNotice /></MemberShell>; }
  if (response.status === 404) notFound();
  if (!response.ok) return <MemberShell><ConnectionNotice /></MemberShell>;
  const { material } = await response.json() as { material: Material };
  return <MemberShell active="training"><a className="text-link" href="/training">← All training</a><div className="lesson-detail"><p className="eyebrow">{material.sample ? 'SAMPLE WRITTEN GUIDE' : 'WRITTEN GUIDE'}</p><h1>{material.title}</h1><p className="lesson-summary">{material.summary}</p>{material.sample && <p className="demo-notice">Illustrative operations content for this prototype. Kevin’s reviewed material will replace or supplement these samples.</p>}<LearningActions id={material.id} initialStatus={material.status} /><article className="material-body lesson-body">{material.body}</article></div></MemberShell>;
}
