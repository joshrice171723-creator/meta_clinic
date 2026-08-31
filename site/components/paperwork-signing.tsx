'use client';
import { useState, type SubmitEvent } from 'react';
import { Check, Download, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ProgressBadge } from '@/components/progress-badge';
import { memberMutation } from '@/lib/member-api';
import type { Paperwork } from '@/lib/portal';

export function PaperworkSigning({ initial, developmentDemo = false }: { initial: Paperwork; developmentDemo?: boolean }) {
  const [document, setDocument] = useState(initial);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function begin() {
    setBusy(true); setError('');
    try { const data = await memberMutation<{ paperwork: Paperwork }>(`paperworks/${document.id}/start`, 'POST'); setDocument(data.paperwork); }
    catch (issue) { setError(issue instanceof Error ? issue.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  async function sign(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setError('');
    try {
      const result = await memberMutation<{ paperwork: Paperwork }>(`paperworks/${document.id}/sign`, 'POST', { signature_name: data.get('signature_name'), password: data.get('password'), consent, content_digest: document.content_digest });
      form.reset(); setDocument(result.paperwork);
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  function download() {
    const receipt = ['APPly — demonstration signing record', document.title, `Version: ${document.document_version}`, '', document.body, '', `Demonstration name: ${document.signature_name}`, `Recorded at (UTC): ${document.signed_at}`, `Document SHA-256: ${document.content_digest}`, `Record SHA-256: ${document.signature_digest}`, `Consent wording: ${document.consent_version}`, '', 'Demonstration only. Not submitted to any institution.'].join('\n');
    const url = URL.createObjectURL(new Blob([receipt], { type: 'text/plain;charset=utf-8' }));
    const anchor = window.document.createElement('a'); anchor.href = url; anchor.download = `apply-demo-record-${document.id}.txt`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="paperwork-detail">
    <div className="document-title"><div><p className="eyebrow">{document.demo ? 'DEMONSTRATION DOCUMENT' : 'ASSIGNED PAPERWORK'}</p><h1>{document.title}</h1><p>Version {document.document_version}</p></div><ProgressBadge status={document.status} /></div>
    {document.demo && <p className="demo-notice">Try the workflow with a fictional name. This sample is not legal paperwork and will not be submitted anywhere.{developmentDemo && ' Local development walkthrough: no password confirmation is needed.'}</p>}
    <div className="signing-layout"><article className="document-paper"><div className="document-paper-brand">APPly <span>DOCUMENT REVIEW</span></div><div className="material-body">{document.body}</div></article>
    <aside className="signing-panel" aria-label="Document signing">
      {document.status === 'completed' ? <div className="signature-receipt" aria-live="polite"><Check size={30} aria-hidden="true" /><h2>All set.</h2><p>Your demonstration signature has been recorded.</p><dl><dt>Name entered</dt><dd>{document.signature_name}</dd><dt>Recorded</dt><dd>{new Date(document.signed_at!).toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT</dd><dt>Document version</dt><dd>{document.document_version}</dd></dl><Button className="form-submit" onClick={download}><Download size={16} aria-hidden="true" /> Save demo record</Button><p className="form-note">No institution has received or approved this document.</p></div> :
      !document.demo ? <><h2>Signing is not enabled.</h2><p>Real paperwork requires the reviewed packet and approved document workflow.</p></> :
      document.status === 'not_started' ? <><PenLine size={26} aria-hidden="true" /><h2>Start with a review.</h2><p>Read the document, then begin to save your progress. You can return before signing.</p><Button className="form-submit" disabled={busy} onClick={begin}>{busy ? 'Saving…' : 'Begin review'}</Button></> :
      <form onSubmit={sign} aria-label="Demonstration document signature"><h2>Ready to sign?</h2><p>For this walkthrough, enter a fictional name.</p><div className="form-field"><Label htmlFor="signature-name">Demonstration name</Label><Input id="signature-name" name="signature_name" required minLength={2} maxLength={120} autoComplete="off" disabled={busy} placeholder="e.g. Alex Example" /></div><div className="consent-field"><Checkbox id="signature-consent" checked={consent} onCheckedChange={setConsent} disabled={busy} /><Label htmlFor="signature-consent">I have reviewed this version and intend to record a demonstration signature. I understand it has no legal or submission effect.</Label></div>{!developmentDemo && <div className="form-field"><Label htmlFor="signature-password">Confirm your account password</Label><Input id="signature-password" name="password" type="password" required autoComplete="current-password" maxLength={72} disabled={busy} /></div>}<Button className="form-submit" type="submit" disabled={!consent || busy}>{busy ? 'Recording…' : 'Sign demo document'}</Button><p className="form-note">This records the account, document version, consent wording, and time. Completed records cannot be edited in this portal.</p></form>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </aside></div>
  </div>;
}
