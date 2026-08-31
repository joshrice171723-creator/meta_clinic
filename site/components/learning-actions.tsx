'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ProgressBadge } from '@/components/progress-badge';
import { memberMutation } from '@/lib/member-api';
import type { ProgressStatus } from '@/lib/portal';
export function LearningActions({ id, initialStatus }: { id: number; initialStatus: ProgressStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function update() {
    setBusy(true); setError('');
    try { const data = await memberMutation<{ status: ProgressStatus }>(`materials/${id}/${status === 'not_started' ? 'start' : 'complete'}`, 'POST'); setStatus(data.status); }
    catch (issue) { setError(issue instanceof Error ? issue.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  return <div className="learning-actions"><ProgressBadge status={status} />{status !== 'completed' && <Button className="button button-dark" disabled={busy} onClick={update}>{busy ? 'Saving…' : status === 'not_started' ? 'Start this guide' : 'Mark as complete'}</Button>}{status === 'completed' && <p>You’ve marked this guide complete. You can revisit it anytime.</p>}{error && <p role="alert" className="form-error">{error}</p>}</div>;
}
