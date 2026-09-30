/**
 * Read-only future server projection, not a browser identity/control grant.
 * The server must bind Muse to a verified principal and issue immutable,
 * uniquely identified receipts after authenticating that principal. Room
 * labels, owner-posted messages, QA timestamps and visitor input are not receipts.
 * No backend supplies this projection yet; actor writes remain unavailable.
 */
export type MuseReceipt = Readonly<{
  id: string;
  authenticatedActorId: string;
  receivedAtMs: number;
}>;
export type MuseCheckIn = Readonly<{
  musePrincipalId: string;
  receipt?: MuseReceipt;
  cadenceMs?: number;
}>;

function matches(
  receipt: MuseReceipt | undefined,
  principal: string,
  now: number,
) {
  return !!(
    principal.trim() &&
    receipt?.id.trim() &&
    receipt.authenticatedActorId === principal &&
    Number.isFinite(receipt.receivedAtMs) &&
    receipt.receivedAtMs >= 0 &&
    Number.isFinite(now) &&
    receipt.receivedAtMs <= now
  );
}

/** Reject replayed IDs/older receipts; refreshing an ID cannot change its clock. */
export function acceptMuseReceipt(
  previous: MuseReceipt | undefined,
  incoming: MuseReceipt | undefined,
  principal: string,
  now: number,
): MuseReceipt | undefined {
  if (!matches(incoming, principal, now)) return undefined;
  if (
    matches(previous, principal, now) &&
    (incoming!.id === previous!.id ||
      incoming!.receivedAtMs <= previous!.receivedAtMs)
  )
    return previous;
  return incoming;
}

export function museCountdown(
  receipt: MuseReceipt | undefined,
  principal: string,
  cadenceMs: number | undefined,
  now: number,
) {
  if (!matches(receipt, principal, now))
    return { label: "Not connected", fraction: 0, remainingMs: 0 };
  if (!Number.isFinite(cadenceMs) || !cadenceMs || cadenceMs <= 0)
    return { label: "No schedule", fraction: 0, remainingMs: 0 };
  const remainingMs = Math.max(0, receipt!.receivedAtMs + cadenceMs - now);
  // One clock tick at the deadline reads Due now, then changes to Overdue.
  const overdueMs = now - (receipt!.receivedAtMs + cadenceMs);
  const label =
    remainingMs > 0
      ? `${Math.ceil(remainingMs / 1000)}s until next check-in`
      : overdueMs < 1000
        ? "Due now"
        : "Overdue";
  return { label, fraction: remainingMs / cadenceMs, remainingMs };
}
