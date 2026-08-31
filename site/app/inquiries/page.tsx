import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MemberShell, ConnectionNotice } from '@/components/member-shell';
import { LogoutButton } from '@/components/logout-button';
import { currentMember, protectedRequest } from '@/lib/member-server';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Contact inbox — APPly', robots: { index: false, follow: false } };
interface Inquiry { id: number; name: string; email: string; message: string; created_at: string }
export default async function InquiriesPage({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  const user = await currentMember();
  if (!user) return <MemberShell><ConnectionNotice /></MemberShell>;
  if (!user.admin) notFound();
  const { before } = await searchParams;
  if (before && !/^[1-9]\d*$/.test(before)) notFound();
  let data: { inquiries: Inquiry[]; next_cursor: number | null };
  try {
    const response = await protectedRequest('inquiries' + (before ? `?before=${before}` : ''));
    if (!response.ok) throw new Error('unavailable');
    data = await response.json();
  } catch { return <MemberShell><ConnectionNotice /></MemberShell>; }
  return <MemberShell><div className="member-heading"><div><p className="eyebrow">APPly ADMINISTRATION</p><h1>New conversations.</h1><p>Contact inquiries, newest first. No automatic email notifications are configured.</p><a href="/materials" className="text-link">← Member materials</a></div><LogoutButton /></div>
    {data.inquiries.length === 0 ? <div className="empty-materials"><h2>No inquiries yet.</h2><p>Messages submitted through the contact page will appear here.</p></div> :
      <div className="inquiry-list">{data.inquiries.map(item => <article className="inquiry-card" key={item.id}><div className="inquiry-meta"><h2>{item.name}</h2><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleDateString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium' })}</time></div><a href={`mailto:${encodeURIComponent(item.email)}`}>{item.email}</a><p className="inquiry-message">{item.message}</p></article>)}</div>}
    {data.next_cursor && <a className="text-link" href={`/inquiries?before=${data.next_cursor}`}>Older inquiries →</a>}
  </MemberShell>;
}
