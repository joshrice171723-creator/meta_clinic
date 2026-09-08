import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  TelehealthEnvelope,
  TelehealthVisit,
} from "../src/features/telehealth/types";

type EffectSlot = {
  deps?: readonly unknown[];
  next?: () => void | (() => void);
  cleanup?: () => void;
};

const hooks = vi.hoisted(() => ({
  stateCursor: 0,
  refCursor: 0,
  memoCursor: 0,
  effectCursor: 0,
  states: [] as Array<{ value: unknown }>,
  refs: [] as Array<{ current: unknown }>,
  memos: [] as Array<{ deps: readonly unknown[]; value: unknown }>,
  effects: [] as EffectSlot[],
}));

const apiMocks = vi.hoisted(() => ({
  loadVisit: vi.fn(),
  loadPatientVisit: vi.fn(),
}));

const sessionMocks = vi.hoisted(() => ({
  reconcileAuthorization: vi.fn().mockResolvedValue(undefined),
  handleAuthorizationFailure: vi.fn().mockResolvedValue(undefined),
}));

function sameDeps(
  previous: readonly unknown[] | undefined,
  next: readonly unknown[] | undefined,
) {
  return (
    previous?.length === next?.length &&
    previous?.every((value, index) => Object.is(value, next?.[index]))
  );
}

vi.mock("react", () => ({
  useState: <T>(initial: T | (() => T)) => {
    const index = hooks.stateCursor++;
    hooks.states[index] ??= {
      value: typeof initial === "function" ? (initial as () => T)() : initial,
    };
    const slot = hooks.states[index];
    const set = (next: T | ((current: T) => T)) => {
      slot.value =
        typeof next === "function"
          ? (next as (current: T) => T)(slot.value as T)
          : next;
    };
    return [slot.value as T, set] as const;
  },
  useRef: <T>(initial: T) => {
    const index = hooks.refCursor++;
    hooks.refs[index] ??= { current: initial };
    return hooks.refs[index] as { current: T };
  },
  useMemo: <T>(factory: () => T, deps: readonly unknown[]) => {
    const index = hooks.memoCursor++;
    const slot = hooks.memos[index];
    if (!slot || !sameDeps(slot.deps, deps))
      hooks.memos[index] = { deps, value: factory() };
    return hooks.memos[index].value as T;
  },
  useCallback: <T>(callback: T, deps: readonly unknown[]) => {
    const index = hooks.memoCursor++;
    const slot = hooks.memos[index];
    if (!slot || !sameDeps(slot.deps, deps))
      hooks.memos[index] = { deps, value: callback };
    return hooks.memos[index].value as T;
  },
  useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => {
    const index = hooks.effectCursor++;
    const slot = (hooks.effects[index] ??= {});
    if (!sameDeps(slot.deps, deps)) {
      slot.deps = deps;
      slot.next = effect;
    }
  },
}));

vi.mock("../src/features/telehealth/api", () => apiMocks);
vi.mock("../src/features/telehealth/TelehealthSessionProvider", () => ({
  useOptionalTelehealthSession: () => sessionMocks,
}));

import { ApiError } from "../src/api/client";
import { useTelehealthDevices } from "../src/features/telehealth/useTelehealthDevices";
import { useTelehealthVisit } from "../src/features/telehealth/useTelehealthVisit";
import { useVisiblePolling } from "../src/features/telehealth/useVisiblePolling";

function beginRender() {
  hooks.stateCursor = 0;
  hooks.refCursor = 0;
  hooks.memoCursor = 0;
  hooks.effectCursor = 0;
}

function commitEffects() {
  for (const slot of hooks.effects) {
    if (!slot.next) continue;
    slot.cleanup?.();
    const effect = slot.next;
    slot.next = undefined;
    const cleanup = effect();
    slot.cleanup = typeof cleanup === "function" ? cleanup : undefined;
  }
}

function unmount() {
  for (const slot of hooks.effects) slot.cleanup?.();
  hooks.effects = [];
}

function resetHooks() {
  unmount();
  hooks.states = [];
  hooks.refs = [];
  hooks.memos = [];
  beginRender();
}

function renderHook<T>(hook: () => T) {
  beginRender();
  const value = hook();
  commitEffects();
  return value;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function envelope(publicId: string, version = 1) {
  return {
    data: {
      public_id: publicId,
      status: "in_progress",
      access_generation: 1,
      appointment: {
        id: 1,
        starts_at: "2026-09-08T12:00:00Z",
        ends_at: "2026-09-08T12:30:00Z",
        timezone: "America/Chicago",
        visit_modality: "video",
        site_id: 1,
        clinician_membership_id: 1,
        patient: { id: 1, display_name: "Patient" },
      },
      encounter_id: 1,
      policy: {
        version: 1,
        title: "Video visit",
        body: "Consent",
        instructions: "Join when admitted.",
        allow_audio_only: true,
        allow_staff_screen_share: true,
        scribe_enabled: false,
        require_location: true,
        require_callback: true,
      },
      preparation: { complete: true, verified: true, reasons: [] },
      room: { status: "active" },
      participants: [],
      eligible_staff: [],
      scribe: {
        consent_state: "not_requested",
        capture: { epoch: 0 },
      },
      updated_at: "2026-09-08T12:00:00Z",
    },
    as_of: "2026-09-08T12:00:00Z",
    version,
    allowed_actions: [],
  } as TelehealthEnvelope<TelehealthVisit>;
}

let visibility: DocumentVisibilityState;
let documentTarget: EventTarget;
let locationReplace: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetHooks();
  vi.useFakeTimers();
  visibility = "visible";
  documentTarget = new EventTarget();
  Object.defineProperty(documentTarget, "visibilityState", {
    get: () => visibility,
  });
  locationReplace = vi.fn();
  vi.stubGlobal("document", documentTarget);
  vi.stubGlobal("window", {
    setTimeout: (callback: TimerHandler, delay?: number) =>
      setTimeout(callback, delay),
    clearTimeout: (timer: number) => clearTimeout(timer),
    location: {
      pathname: "/clinic/telehealth/11111111-1111-4111-8111-111111111111",
      replace: locationReplace,
    },
  });
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  apiMocks.loadVisit.mockReset();
  apiMocks.loadPatientVisit.mockReset();
  sessionMocks.reconcileAuthorization.mockClear();
  sessionMocks.handleAuthorizationFailure.mockClear();
});

afterEach(() => {
  resetHooks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useVisiblePolling", () => {
  it("keeps polling after repeated refresh failures", async () => {
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("still offline"))
      .mockResolvedValue(undefined);

    renderHook(() => useVisiblePolling(refresh, true, 100));
    await vi.advanceTimersByTimeAsync(300);

    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("pauses while hidden and refreshes immediately when visible", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    visibility = "hidden";
    renderHook(() => useVisiblePolling(refresh, true, 100));

    await vi.advanceTimersByTimeAsync(500);
    expect(refresh).not.toHaveBeenCalled();

    visibility = "visible";
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("does not reschedule when disposed during an in-flight refresh", async () => {
    const request = deferred<void>();
    const refresh = vi.fn(() => request.promise);
    renderHook(() => useVisiblePolling(refresh, true, 100));

    await vi.advanceTimersByTimeAsync(100);
    expect(refresh).toHaveBeenCalledTimes(1);
    unmount();
    request.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("useTelehealthVisit", () => {
  it("never exposes the previous visit projection after the visit changes", async () => {
    apiMocks.loadVisit.mockResolvedValueOnce(envelope("visit-a"));
    renderHook(() => useTelehealthVisit("staff", "visit-a"));
    await Promise.resolve();
    await Promise.resolve();
    const current = renderHook(() => useTelehealthVisit("staff", "visit-a"));
    expect(current.response?.data.public_id).toBe("visit-a");

    apiMocks.loadVisit.mockReturnValueOnce(new Promise(() => undefined));
    const changed = renderHook(() => useTelehealthVisit("staff", "visit-b"));

    expect(changed.response).toBeUndefined();
  });

  it("clears protected visit data after a 403 response", async () => {
    apiMocks.loadVisit.mockResolvedValueOnce(envelope("visit-a"));
    renderHook(() => useTelehealthVisit("staff", "visit-a"));
    await Promise.resolve();
    await Promise.resolve();
    const loaded = renderHook(() => useTelehealthVisit("staff", "visit-a"));

    apiMocks.loadVisit.mockRejectedValueOnce(
      new ApiError(403, "Access denied"),
    );
    await loaded.refresh();
    const denied = renderHook(() => useTelehealthVisit("staff", "visit-a"));

    expect(denied.response).toBeUndefined();
    expect(denied.error).toBe("Access denied");
    expect(sessionMocks.handleAuthorizationFailure).toHaveBeenCalledWith(
      "visit-a",
      403,
    );
  });

  it("preserves the current telehealth route in the 401 sign-in destination", async () => {
    apiMocks.loadVisit.mockRejectedValueOnce(
      new ApiError(401, "Please sign in again"),
    );
    renderHook(() =>
      useTelehealthVisit("staff", "11111111-1111-4111-8111-111111111111"),
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(locationReplace).toHaveBeenCalledWith(
      "/login?next=%2Fclinic%2Ftelehealth%2F11111111-1111-4111-8111-111111111111",
    );
  });

  it("does not let an older fetch overwrite a newer mutation response", async () => {
    const request = deferred<TelehealthEnvelope<TelehealthVisit>>();
    apiMocks.loadVisit.mockReturnValueOnce(request.promise);
    const result = renderHook(() => useTelehealthVisit("staff", "visit-a"));
    const mutation = envelope("visit-a", 9);

    result.setResponse(mutation);
    request.resolve(envelope("visit-a", 2));
    await Promise.resolve();
    await Promise.resolve();
    const current = renderHook(() => useTelehealthVisit("staff", "visit-a"));

    expect(current.response?.version).toBe(9);
  });
});

describe("useTelehealthDevices", () => {
  function mediaRequest() {
    const request = deferred<MediaStream>();
    const stop = vi.fn();
    const stream = {
      getTracks: () => [{ stop }],
      getAudioTracks: () => [],
      getVideoTracks: () => [],
    } as unknown as MediaStream;
    vi.stubGlobal("navigator", {
      mediaDevices: {
        enumerateDevices: vi.fn().mockResolvedValue([]),
        getUserMedia: vi.fn(() => request.promise),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
    return { request, stream, stop };
  }

  it("stops a stream that arrives after the device check was stopped", async () => {
    const media = mediaRequest();
    const result = renderHook(() => useTelehealthDevices());
    const enable = result.enable();
    result.stop();
    media.request.resolve(media.stream);
    await enable;
    const settled = renderHook(() => useTelehealthDevices());

    expect(media.stop).toHaveBeenCalledTimes(1);
    expect(settled.stream).toBeNull();
    expect(settled.running).toBe(false);
  });

  it("stops a stream that arrives after the device check unmounts", async () => {
    const media = mediaRequest();
    const result = renderHook(() => useTelehealthDevices());
    const enable = result.enable();
    unmount();
    media.request.resolve(media.stream);
    await enable;

    expect(media.stop).toHaveBeenCalledTimes(1);
  });
});
