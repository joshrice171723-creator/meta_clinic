export type SandboxAccountKey =
  "admin" | "manager" | "front_desk" | "clinician" | "inventory" | "patient";

export const sandboxAccounts: { key: SandboxAccountKey; label: string }[] = [
  { key: "admin", label: "Admin" },
  { key: "manager", label: "Manager" },
  { key: "front_desk", label: "Front Desk" },
  { key: "clinician", label: "Clinician" },
  { key: "inventory", label: "Inventory" },
  { key: "patient", label: "Patient" },
];

export type NavigationConfirmation = { handled: boolean; allowed: boolean };

export class NavigationConfirmationTimeout extends Error {
  constructor() {
    super(
      "The workspace did not confirm navigation in time. Your current account and work are still open. Check the workspace, then retry confirmation.",
    );
  }
}

// This request is transient correlation, never an authentication credential.
export function confirmSandboxNavigation(
  frame: Window | null | undefined,
  runId: string,
  userId: number | string,
  generation: number,
): Promise<boolean> {
  if (!frame) return Promise.reject(new NavigationConfirmationTimeout());
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    let settled = false;
    let acknowledged = false;
    const expire = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", receive);
      reject(new NavigationConfirmationTimeout());
    };
    const finish = (allowed: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      window.removeEventListener("message", receive);
      resolve(allowed);
    };
    const receive = (event: MessageEvent<unknown>) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== frame ||
        !event.data ||
        typeof event.data !== "object"
      )
        return;
      const data = event.data as Record<string, unknown>;
      if (
        (data.type !== "demo:navigation-confirmed" &&
          data.type !== "demo:navigation-confirming") ||
        data.requestId !== requestId ||
        data.generation !== generation ||
        data.runId !== runId ||
        data.userId !== userId
      )
        return;
      if (data.type === "demo:navigation-confirming") {
        if (!acknowledged) {
          acknowledged = true;
          window.clearTimeout(timeout);
          // Give an explicit discard prompt time to be read, without accepting
          // replies indefinitely or extending the deadline on repeated messages.
          timeout = window.setTimeout(expire, 60_000);
        }
        return;
      }
      finish(data.allowed === true);
    };
    let timeout = window.setTimeout(expire, 5_000);
    window.addEventListener("message", receive);
    frame.postMessage(
      { type: "demo:confirm-navigation", requestId, generation, runId, userId },
      window.location.origin,
    );
  });
}
