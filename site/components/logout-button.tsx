'use client';
import { useState } from 'react';
import { memberMutation } from '@/lib/member-api';
import { Button } from '@/components/ui/button';
export function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function logout() {
    setBusy(true); setError('');
    try { await memberMutation('session', 'DELETE'); window.location.assign('/login'); }
    catch { setError('Sign-out failed. Please try again.'); setBusy(false); }
  }
  return <div><Button className="button button-outline" onClick={logout} disabled={busy}>{busy ? 'Signing out…' : 'Sign out'}</Button>{error && <p role="alert">{error}</p>}</div>;
}
