import { afterEach, expect, it, vi } from "vitest";
import { registerPatientDemoNavigation } from "../src/features/patientPortal/usePatientDemoNavigation";
import type { NavigationConfirmation } from "../src/features/demo/accountSwitch";

afterEach(() => vi.unstubAllGlobals());

function fixture(blocked = false, messages: string[] = [], consent = true) {
  const listeners = new Map<string, (event: Event) => void>();
  const confirm = vi.fn().mockReturnValue(consent);
  const parent = {};
  vi.stubGlobal("window", {
    parent,
    name: "clinic-demo-workspace",
    confirm,
    addEventListener: (name: string, read: (event: Event) => void) =>
      listeners.set(name, read),
    removeEventListener: (name: string) => listeners.delete(name),
    dispatchEvent: (event: CustomEvent) => {
      if (event.type === "demo:collect-navigation-blockers") {
        event.detail.blocked = blocked;
        event.detail.messages.push(...messages);
      }
      return true;
    },
  });
  const cleanup = registerPatientDemoNavigation();
  const detail: NavigationConfirmation = { handled: false, allowed: false };
  listeners.get("demo:confirm-local-navigation")!(
    new CustomEvent("demo:confirm-local-navigation", { detail }),
  );
  return { detail, confirm, cleanup, listeners };
}

it("registers the Patient listener and allows clean frames without a discard prompt", () => {
  const { detail, confirm, cleanup, listeners } = fixture();
  expect(detail).toEqual({ handled: true, allowed: true });
  expect(confirm).not.toHaveBeenCalled();
  cleanup();
  expect(listeners.size).toBe(0);
});
it("preserves dirty work when discard is declined", () => {
  const { detail, confirm } = fixture(
    false,
    ["Keep the unsaved intake"],
    false,
  );
  expect(detail).toEqual({ handled: true, allowed: false });
  expect(confirm).toHaveBeenCalledWith("Keep the unsaved intake");
});
it("never offers a discard escape for pending or unknown outcomes", () => {
  const { detail, confirm } = fixture(true, ["Unknown payment outcome"]);
  expect(detail).toEqual({ handled: true, allowed: false });
  expect(confirm).not.toHaveBeenCalled();
});
