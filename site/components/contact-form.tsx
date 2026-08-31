'use client';

import { useState, type SubmitEvent } from 'react';
import { ArrowUpRight, Check, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { memberMutation } from '@/lib/member-api';

export function ContactForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [received, setReceived] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setError('');
    try {
      await memberMutation('contact_messages', 'POST', { contact_message: { name: data.get('name'), email: data.get('email'), message: data.get('message'), website: data.get('website') } });
      setReceived(true); form.reset();
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'Your message was not sent. Please try again.'); }
    finally { setBusy(false); }
  }

  return <div className="form-card">
    <p className="eyebrow">GET IN TOUCH</p>
    <h2>What are you thinking?</h2>
    <div aria-live="polite">{received && <div className="form-success"><Check size={20} aria-hidden="true" /><div><strong>Message received.</strong><p>Your inquiry is in our contact inbox. Thank you for reaching out.</p></div></div>}</div>
    {!received ? <form onSubmit={submit} aria-label="Contact APPly">
      <div className="form-field"><Label htmlFor="contact-name">Your name</Label><Input id="contact-name" name="name" autoComplete="name" required maxLength={100} disabled={busy} /></div>
      <div className="form-field"><Label htmlFor="contact-email">Email address</Label><Input id="contact-email" name="email" type="email" autoComplete="email" required maxLength={254} disabled={busy} /></div>
      <div className="form-field"><Label htmlFor="contact-message">How can we help?</Label><Textarea id="contact-message" name="message" required minLength={10} maxLength={4000} rows={6} disabled={busy} aria-describedby="contact-privacy" placeholder="Tell us about your clinic plans or your question." /></div>
      <div className="honeypot" aria-hidden="true"><label htmlFor="contact-website">Leave this field empty</label><input id="contact-website" name="website" tabIndex={-1} autoComplete="off" /></div>
      <p className="form-note" id="contact-privacy">Your name, email, and message will be sent to APPly and stored for responding to this inquiry. Please keep patient information and confidential records out of this form.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button type="submit" className="form-submit" disabled={busy}>{busy ? <><LoaderCircle className="spin" aria-hidden="true" size={17} /> Sending…</> : <>Send message <ArrowUpRight aria-hidden="true" size={18} /></>}</Button>
    </form> : <Button variant="outline" className="form-secondary" onClick={() => setReceived(false)}>Send another message</Button>}
  </div>;
}
