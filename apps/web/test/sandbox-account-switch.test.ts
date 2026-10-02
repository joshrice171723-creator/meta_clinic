import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { confirmSandboxNavigation } from "../src/features/demo/accountSwitch";

const listeners = new Set<(event: MessageEvent) => void>();
const frame = { postMessage: vi.fn() };
const origin = "http://localhost:3240";
const reply = (
  changes: Record<string, unknown> = {},
  source: unknown = frame,
  replyOrigin = origin,
) => {
  const request = frame.postMessage.mock.calls[0][0];
  const event = {
    source,
    origin: replyOrigin,
    data: {
      ...request,
      type: "demo:navigation-confirmed",
      allowed: true,
      ...changes,
    },
  } as MessageEvent;
  listeners.forEach((listener) => listener(event));
};

beforeEach(() => {
  vi.useFakeTimers();
  frame.postMessage.mockReset();
  listeners.clear();
  vi.stubGlobal("window", {
    location: { origin },
    setTimeout,
    clearTimeout,
    addEventListener: (_: string, listener: (event: MessageEvent) => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: (event: MessageEvent) => void) =>
      listeners.delete(listener),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("accepts only the current frame, origin, run, actor and generation", async () => {
  const result = confirmSandboxNavigation(
    frame as unknown as Window,
    "run-1",
    7,
    3,
  );
  let settled = false;
  void result.then(() => {
    settled = true;
  });
  reply({}, {}, origin);
  reply({}, frame, "https://other.example.test");
  reply({ runId: "old-run" });
  reply({ userId: 8 });
  reply({ generation: 2 });
  reply({ requestId: "old-request" });
  await Promise.resolve();
  expect(settled).toBe(false);
  reply();
  expect(await result).toBe(true);
  expect(listeners.size).toBe(0);
});

it("preserves the workspace when the existing blocker cancels", async () => {
  const result = confirmSandboxNavigation(
    frame as unknown as Window,
    "run-1",
    7,
    3,
  );
  reply({ allowed: false });
  expect(await result).toBe(false);
});

it("fails closed when the frame never confirms", async () => {
  const result = confirmSandboxNavigation(
    frame as unknown as Window,
    "run-1",
    7,
    3,
  );
  vi.advanceTimersByTime(5_000);
  expect(await result).toBe(false);
  expect(listeners.size).toBe(0);
});

it("does not allow switching without the current frame", async () => {
  expect(await confirmSandboxNavigation(null, "run-1", 7, 3)).toBe(false);
  expect(frame.postMessage).not.toHaveBeenCalled();
});
