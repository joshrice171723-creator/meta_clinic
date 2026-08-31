export type ProgressStatus = 'not_started' | 'started' | 'completed';
export const statusLabel: Record<ProgressStatus, string> = { not_started: 'Not started', started: 'Started', completed: 'Completed' };
export interface Paperwork {
  id: number; title: string; document_version: string; demo: boolean; status: ProgressStatus;
  started_at: string | null; signed_at: string | null; body?: string; content_digest?: string;
  signature_name?: string | null; signature_digest?: string | null; consent_version?: string | null;
}
