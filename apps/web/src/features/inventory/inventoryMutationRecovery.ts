import { ApiError } from "../../api/client";
import type { Screen } from "./inventoryNavigation";

export type PendingInventoryMutation = {
  key: string;
  endpoint: string;
  intent: string;
};

export function inventoryMutationAttempt(
  pending: PendingInventoryMutation | null,
  endpoint: string,
  body: Record<string, unknown>,
  createKey: () => string = () => crypto.randomUUID(),
): PendingInventoryMutation | null {
  const intent = JSON.stringify({ endpoint, body });
  if (pending && (pending.endpoint !== endpoint || pending.intent !== intent))
    return null;
  return { key: pending?.key ?? createKey(), endpoint, intent };
}

export function inventoryOutcomeUnconfirmed(reason: unknown): boolean {
  return (
    !(reason instanceof ApiError) ||
    reason.code === "outcome_unconfirmed" ||
    reason.status === 408 ||
    reason.status >= 500 ||
    (reason.status === 409 && /outcome is unconfirmed/i.test(reason.message))
  );
}

export function inventoryUsesAcknowledgement(screen: Screen): boolean {
  return [
    "lots",
    "purchasing",
    "receiving",
    "replenishment",
    "purchase_order_new",
    "shipment_new",
    "exceptions",
    "recalls",
    "counts",
    "controlled",
    "activity",
  ].includes(screen);
}

export function inventoryMutationResponseOwned(
  owner: { mounted: boolean; scope: string },
  requestScope: string,
): boolean {
  return owner.mounted && owner.scope === requestScope;
}
