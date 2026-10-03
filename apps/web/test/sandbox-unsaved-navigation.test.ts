import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { confirmClinicNavigation } from "../src/features/clinic/clinicNavigation";
import { confirmUnregisteredDemoNavigation } from "../src/features/demo/DemoFrameBoundary";

const dispatch = vi.fn();
const confirm = vi.fn();
beforeEach(() => {
  dispatch.mockReset().mockReturnValue(true);
  confirm.mockReset().mockReturnValue(true);
  vi.stubGlobal("window", { dispatchEvent: dispatch, confirm });
});
afterEach(() => vi.unstubAllGlobals());

it("honors beforeunload-only dirty forms during a sandbox switch", () => {
  dispatch.mockReturnValue(false);
  confirm.mockReturnValue(false);
  expect(confirmClinicNavigation([], true)).toBe(false);
  expect(dispatch.mock.calls[0][0].type).toBe("beforeunload");
  expect(confirm).toHaveBeenCalledOnce();
  expect(confirm.mock.calls[0][0]).toContain("unsaved changes");
});

it("combines registered blockers and beforeunload into one confirmation", () => {
  dispatch.mockReturnValue(false);
  expect(
    confirmClinicNavigation(
      ["Prescription save is uncertain", "Prescription save is uncertain"],
      true,
    ),
  ).toBe(true);
  expect(confirm).toHaveBeenCalledExactlyOnceWith(
    "Prescription save is uncertain",
  );
});

it("cancellation of a registered blocker keeps the workspace", () => {
  confirm.mockReturnValue(false);
  expect(confirmClinicNavigation(["Keep this draft"], true)).toBe(false);
});

it("clean frames need no prompt and ordinary navigation retains its existing behavior", () => {
  expect(confirmClinicNavigation([], true)).toBe(true);
  expect(confirm).not.toHaveBeenCalled();
  dispatch.mockClear();
  expect(confirmClinicNavigation(["Existing draft"])).toBe(true);
  expect(dispatch).not.toHaveBeenCalled();
});

it("clean patient frames do not prompt for untouched autofilled fields", () => {
  confirm.mockReturnValue(false);
  expect(confirmUnregisteredDemoNavigation()).toBe(true);
  expect(confirm).not.toHaveBeenCalled();
});

it("pending or uncertain patient submissions veto switching without a discard escape", () => {
  expect(
    confirmUnregisteredDemoNavigation({
      blocked: true,
      messages: ["Patient draft"],
    }),
  ).toBe(false);
  expect(confirm).not.toHaveBeenCalled();
  expect(dispatch).not.toHaveBeenCalled();
});

it("the patient's actual dirty draft message supplies the discard prompt", () => {
  confirm.mockReturnValue(false);
  expect(
    confirmUnregisteredDemoNavigation({
      blocked: false,
      messages: ["Discard your unsaved patient intake and visit note?"],
    }),
  ).toBe(false);
  expect(confirm).toHaveBeenCalledExactlyOnceWith(
    "Discard your unsaved patient intake and visit note?",
  );
});
