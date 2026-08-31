import { Check, Circle, CircleDashed } from 'lucide-react';
import { statusLabel, type ProgressStatus } from '@/lib/portal';
export function ProgressBadge({ status }: { status: ProgressStatus }) {
  const Icon = status === 'completed' ? Check : status === 'started' ? CircleDashed : Circle;
  return <span className={`status-badge status-${status}`}><Icon size={13} aria-hidden="true" />{statusLabel[status]}</span>;
}
