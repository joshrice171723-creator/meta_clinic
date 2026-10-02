export type SandboxAccountKey =
  "admin" | "front_desk" | "clinician" | "inventory" | "patient";

export const sandboxAccounts: { key: SandboxAccountKey; label: string }[] = [
  { key: "admin", label: "Admin" },
  { key: "front_desk", label: "Front Desk" },
  { key: "clinician", label: "Clinician" },
  { key: "inventory", label: "Inventory" },
  { key: "patient", label: "Patient" },
];

export type NavigationConfirmation = { handled: boolean; allowed: boolean };

// This request is transient correlation, never an authentication credential.
export function confirmSandboxNavigation(
  frame: Window | null | undefined,
  runId: string,
  userId: number | string,
  generation: number,
): Promise<boolean> {
  if (!frame) return Promise.resolve(false);
  const requestId = crypto.randomUUID();
  return new Promise((resolve) => {
    const finish = (allowed: boolean) => {
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
        data.type !== "demo:navigation-confirmed" ||
        data.requestId !== requestId ||
        data.generation !== generation ||
        data.runId !== runId ||
        data.userId !== userId
      )
        return;
      finish(data.allowed === true);
    };
    const timeout = window.setTimeout(() => finish(false), 5_000);
    window.addEventListener("message", receive);
    frame.postMessage(
      { type: "demo:confirm-navigation", requestId, generation, runId, userId },
      window.location.origin,
    );
  });
}
