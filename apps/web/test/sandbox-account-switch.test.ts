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
  const rejected = expect(result).rejects.toThrow(
    "did not confirm navigation in time",
  );
  vi.advanceTimersByTime(5_000);
  await rejected;
  reply();
  expect(listeners.size).toBe(0);
});

it("does not allow switching without the current frame", async () => {
  await expect(confirmSandboxNavigation(null, "run-1", 7, 3)).rejects.toThrow(
    "did not confirm navigation in time",
  );
  expect(frame.postMessage).not.toHaveBeenCalled();
});

it("allows time to read an acknowledged discard prompt without treating acknowledgment as approval", async () => {
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
  reply({ type: "demo:navigation-confirming" });
  vi.advanceTimersByTime(6_000);
  await Promise.resolve();
  expect(settled).toBe(false);
  reply();
  expect(await result).toBe(true);
});

it("does not allow spoofed acknowledgments to extend the deadline", async () => {
  const result = confirmSandboxNavigation(
    frame as unknown as Window,
    "run-1",
    7,
    3,
  );
  const rejected = expect(result).rejects.toThrow(
    "did not confirm navigation in time",
  );
  reply({ type: "demo:navigation-confirming", userId: 8 });
  reply({ type: "demo:navigation-confirming" }, {}, origin);
  reply(
    { type: "demo:navigation-confirming" },
    frame,
    "https://other.example.test",
  );
  vi.advanceTimersByTime(5_000);
  await rejected;
});

it("bounds an acknowledged request, ignores late approval and requires a fresh retry nonce", async () => {
  const result = confirmSandboxNavigation(
    frame as unknown as Window,
    "run-1",
    7,
    3,
  );
  const rejected = expect(result).rejects.toThrow(
    "did not confirm navigation in time",
  );
  reply({ type: "demo:navigation-confirming" });
  vi.advanceTimersByTime(55_000);
  reply({ type: "demo:navigation-confirming" });
  vi.advanceTimersByTime(5_000);
  await rejected;
  expect(listeners.size).toBe(0);
  const retry = confirmSandboxNavigation(
    frame as unknown as Window,
    "run-1",
    7,
    3,
  );
  reply(); // Old nonce cannot approve this retry.
  const fresh = frame.postMessage.mock.calls[1][0];
  reply({ requestId: fresh.requestId });
  expect(await retry).toBe(true);
  expect(listeners.size).toBe(0);
});
