import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MemberShell, ConnectionNotice } from '@/components/member-shell';
import { PaperworkSigning } from '@/components/paperwork-signing';
import { currentMember, protectedRequest } from '@/lib/member-server';
import type { Paperwork } from '@/lib/portal';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Review your document — APPly', robots: { index: false, follow: false }, openGraph: { images: [] }, twitter: { images: [] } };
export default async function PaperworkDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentMember();
  if (!user) return <MemberShell><ConnectionNotice /></MemberShell>;
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id)) notFound();
  let response: Response;
  try { response = await protectedRequest(`paperworks/${id}`); } catch { return <MemberShell><ConnectionNotice /></MemberShell>; }
  if (response.status === 404) notFound();
  if (!response.ok) return <MemberShell><ConnectionNotice /></MemberShell>;
  const { paperwork } = await response.json() as { paperwork: Paperwork };
  return <MemberShell active="paperwork"><a className="text-link" href="/paperwork">← All paperwork</a><PaperworkSigning initial={paperwork} developmentDemo={user.development_demo} /></MemberShell>;
}
