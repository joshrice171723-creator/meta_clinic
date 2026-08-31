import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { railsRequest, sessionCookie } from './backend';
import type { ProgressStatus } from './portal';

export interface Member { id: number; email_address: string; admin: boolean; development_demo: boolean }
export interface Material { id: number; title: string; summary: string | null; body?: string; published_at: string; sample: boolean; status: ProgressStatus }

export async function protectedRequest(path: string) {
  const cookieJar = await cookies();
  return railsRequest(path, { headers: { Cookie: sessionCookie(cookieJar.toString()) } });
}
export async function currentMember(): Promise<Member | null> {
  let response: Response;
  try { response = await protectedRequest('session'); } catch { return null; }
  if (response.status === 401) redirect('/login');
  if (!response.ok) return null;
  return (await response.json() as { user: Member }).user;
}
