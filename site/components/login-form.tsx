'use client';

import { useEffect, useState, type SubmitEvent } from 'react';
import { ArrowUpRight, LoaderCircle, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { memberMutation, memberRequest } from '@/lib/member-api';

export function LoginForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [developmentLogin, setDevelopmentLogin] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    memberRequest<{ development_login: boolean }>('csrf', { signal: controller.signal })
      .then(data => setDevelopmentLogin(data.development_login === true)).catch(() => {});
    return () => controller.abort();
  }, []);
  async function demoLogin() {
    setBusy(true); setError('');
    try {
      await memberMutation('development_session', 'POST');
      window.location.assign('/portal');
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'Demo login is unavailable.'); setBusy(false); }
  }
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try {
      await memberMutation('session', 'POST', { email_address: data.get('email'), password: data.get('password') });
      window.location.assign('/portal');
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'We couldn’t sign you in. Please try again.'); setBusy(false); }
  }
  return <div className="form-card login-card"><LockKeyhole aria-hidden="true" size={24} strokeWidth={1.4} /><h2>Welcome back.</h2><p className="form-intro">Use the account details provided by APPly.</p>
    {developmentLogin && <div className="demo-notice"><p>Local development · Try paperwork and training with a fresh synthetic client. No password needed.</p><Button className="form-submit" type="button" disabled={busy} onClick={demoLogin}>{busy ? 'Signing in…' : 'Continue as demo client'}</Button></div>}
    <form onSubmit={submit} aria-label="Member login">
      <div className="form-field"><Label htmlFor="login-email">Email address</Label><Input id="login-email" name="email" type="email" required autoComplete="username" maxLength={254} disabled={busy} /></div>
      <div className="form-field"><Label htmlFor="login-password">Password</Label><Input id="login-password" name="password" type="password" required autoComplete="current-password" maxLength={72} disabled={busy} /></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button className="form-submit" type="submit" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={17} aria-hidden="true" /> Signing in…</> : <>Sign in <ArrowUpRight size={18} aria-hidden="true" /></>}</Button>
      <p className="form-note">APPly provides your account after payment. No public signup. This is not a patient portal.</p>
    </form>
  </div>;
}
