import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ClinicRealtimeNotice,
  ClinicRealtimeProvider,
  useClinicRealtimeTopic,
} from "../src/features/clinic/ClinicRealtime";

// Execute the real connection loop and topic fallback with synthetic streams.
const hooks = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as any[],
  effects: [] as (() => (() => void) | void)[],
  context: null as any,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: any) {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = initial;
    return [
      hooks.slots[index],
      (value: any) => {
        hooks.slots[index] =
          typeof value === "function" ? value(hooks.slots[index]) : value;
      },
    ];
  },
  useRef(initial: any) {
    const index = hooks.cursor++;
    return (hooks.slots[index] ??= { current: initial });
  },
  useCallback: (callback: any) => callback,
  useContext: () => hooks.context,
  useEffect: (effect: any) => {
    hooks.effects.push(effect);
  },
}));
vi.mock("../src/api/client", () => ({
  clinicRealtimeSession: () => ({ enabled: true, headers: {} }),
  SESSION_CHANGED_EVENT: "synthetic-session-change",
}));
let cleanups: (() => void)[];
function renderProvider() {
  hooks.cursor = 0;
  hooks.effects = [];
  const element = ClinicRealtimeProvider({ children: null });
  hooks.context = element.props.value;
  return hooks.context;
}
beforeEach(() => {
  hooks.slots = [];
  hooks.effects = [];
  cleanups = [];
  vi.useFakeTimers();
  vi.stubGlobal("window", {
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("document", {
    visibilityState: "visible",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});
afterEach(() => {
  cleanups.reverse().forEach((cleanup) => cleanup());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function runEffects() {
  for (const effect of hooks.effects) {
    const cleanup = effect();
    if (cleanup) cleanups.push(cleanup);
  }
}

describe("211 reconnect reporting and fallback", () => {
  it("keeps degradation visible until a successful stream connection, then removes the notice", async () => {
    let endRead!: (value: { done: true }) => void;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, body: null })
      .mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: () =>
              new Promise((resolve) => {
                endRead = resolve;
              }),
          }),
        },
      });
    vi.stubGlobal("fetch", fetch);
    renderProvider().subscribe("tracking_board", () => {});
    renderProvider();
    runEffects();
    await Promise.resolve();
    await Promise.resolve();
    expect(renderProvider().state).toBe("reconnecting");
    expect(ClinicRealtimeNotice()).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(renderProvider().state).toBe("connected");
    expect(ClinicRealtimeNotice()).toBeNull();
    expect(fetch.mock.calls[0][1]).toMatchObject({
      credentials: "same-origin",
      cache: "no-store",
    });
    cleanups
      .splice(0)
      .reverse()
      .forEach((cleanup) => cleanup());
    endRead({ done: true });
  });
  it("refreshes visible disconnected views periodically and on visibility, stopping at authorization loss", () => {
    const refresh = vi.fn();
    let visibility!: () => void;
    (document.addEventListener as any).mockImplementation(
      (name: string, callback: () => void) => {
        if (name === "visibilitychange") visibility = callback;
      },
    );
    function topic(state: string) {
      hooks.context = {
        state,
        subscriptionCount: 1,
        subscribe: () => () => {},
      };
      hooks.cursor = 100;
      hooks.effects = [];
      useClinicRealtimeTopic("tracking_board", refresh, {
        fallbackIntervalMs: 45000,
        freshnessIntervalMs: 45000,
      });
      runEffects();
    }
    topic("reconnecting");
    vi.advanceTimersByTime(45000);
    expect(refresh).toHaveBeenCalledTimes(1);
    visibility();
    expect(refresh).toHaveBeenCalledTimes(2);
    cleanups
      .splice(0)
      .reverse()
      .forEach((cleanup) => cleanup());
    topic("authorization_required");
    vi.advanceTimersByTime(90000);
    visibility();
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
