import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TelehealthVisit } from "../src/features/telehealth/types";

type StateSlot = {
  value: unknown;
  setter: ReturnType<typeof vi.fn>;
};

const hooks = vi.hoisted(() => ({
  stateCursor: 0,
  refCursor: 0,
  states: [] as StateSlot[],
  refs: [] as { current: unknown }[],
  effects: [] as Array<() => void | (() => void)>,
}));

const apiMocks = vi.hoisted(() => ({
  requestStaffJoinGrant: vi.fn(),
  requestPatientJoinGrant: vi.fn(),
  loadVisit: vi.fn(),
  loadPatientVisit: vi.fn(),
  leaveStaffVisit: vi.fn(),
  leavePatientVisit: vi.fn(),
}));

const mediaMocks = vi.hoisted(() => ({
  createAdapter: vi.fn(),
  instances: [] as Array<{
    join: ReturnType<typeof vi.fn>;
    leave: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    ejectParticipant: ReturnType<typeof vi.fn>;
    ejectAllRemoteParticipants: ReturnType<typeof vi.fn>;
  }>,
}));

const terminateTelehealthCapture = vi.hoisted(() => vi.fn());

vi.mock("react", () => ({
  createContext: (initial: unknown) => ({ initial }),
  useCallback: <T,>(callback: T) => callback,
  useContext: () => null,
  useEffect: (effect: () => void | (() => void)) => hooks.effects.push(effect),
  useMemo: <T,>(factory: () => T) => factory(),
  useRef: <T,>(initial: T) => {
    const index = hooks.refCursor++;
    hooks.refs[index] ??= { current: initial };
    return hooks.refs[index] as { current: T };
  },
  useState: <T,>(initial: T) => {
    const index = hooks.stateCursor++;
    if (!hooks.states[index]) {
      const slot: StateSlot = {
        value: initial,
        setter: vi.fn((next: T | ((current: T) => T)) => {
          slot.value =
            typeof next === "function"
              ? (next as (current: T) => T)(slot.value as T)
              : next;
        }),
      };
      hooks.states[index] = slot;
    }
    const slot = hooks.states[index];
    return [slot.value as T, slot.setter] as const;
  },
}));

vi.mock("react/jsx-runtime", () => ({
  Fragment: Symbol("Fragment"),
  jsx: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
  jsxs: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
}));

vi.mock("../src/features/telehealth/api", () => apiMocks);

vi.mock("../src/features/telehealth/mediaAdapter", () => ({
  createTelehealthMediaAdapter: mediaMocks.createAdapter,
}));

function createMediaAdapter() {
  return new (class {
    join = vi.fn().mockResolvedValue(undefined);
    leave = vi.fn().mockResolvedValue(undefined);
    destroy = vi.fn().mockResolvedValue(undefined);
    setMicrophone = vi.fn().mockResolvedValue(undefined);
    setCamera = vi.fn().mockResolvedValue(undefined);
    selectInputDevice = vi.fn().mockResolvedValue(undefined);
    startScreenShare = vi.fn().mockResolvedValue(undefined);
    stopScreenShare = vi.fn().mockResolvedValue(undefined);
    ejectParticipant = vi.fn().mockReturnValue(true);
    ejectAllRemoteParticipants = vi.fn().mockReturnValue(2);

    constructor() {
      mediaMocks.instances.push(this);
    }
  })();
}

vi.mock("../src/features/scribe/ScribeRecordingProvider", () => ({
  useOptionalScribeRecording: () => ({ terminateTelehealthCapture }),
}));

import { TelehealthSessionProvider } from "../src/features/telehealth/TelehealthSessionProvider";

const grantEnvelope = {
  data: {
    join_grant: {
      token: "ephemeral-provider-token",
      room_name: "apply-visit-1",
      room_url: null,
      expires_at: "2026-09-08T12:05:00Z",
      provider: "twilio" as const,
      participant: {
        id: "app-participant-1",
        provider_subject_id: "provider-subject-1",
      },
      room: { expires_at: "2026-09-08T13:00:00Z" },
    },
  },
  as_of: "2026-09-08T12:00:00Z",
  version: 7,
  allowed_actions: [],
};

function visit(participantStatus: "admitted" | "removed" = "admitted") {
  return {
    public_id: "visit-1",
    status: "in_progress",
    access_state: "join",
    access_generation: 1,
    appointment: {
      id: 91,
      starts_at: "2026-09-08T12:00:00Z",
      ends_at: "2026-09-08T12:30:00Z",
      timezone: "America/Chicago",
      visit_modality: "video",
      site_id: 4,
      clinician_membership_id: 12,
      patient: { id: 41, display_name: "Patient One" },
    },
    encounter_id: 73,
    policy: {
      version: 3,
      title: "Video visit consent",
      body: "Consent body",
      instructions: "Join when admitted.",
      allow_audio_only: true,
      allow_staff_screen_share: true,
      scribe_enabled: true,
      require_location: true,
      require_callback: true,
    },
    preparation: { complete: true, verified: true, reasons: [] },
    room: { status: "active", expires_at: "2026-09-08T13:00:00Z" },
    participants: [
      {
        id: "app-participant-1",
        provider_subject_id: "provider-subject-1",
        role: "clinician",
        status: participantStatus,
        is_current: true,
        media_present: participantStatus !== "removed",
      },
    ],
    eligible_staff: [],
    scribe: {
      consent_state: "accepted",
      capture: { epoch: 1 },
    },
    updated_at: "2026-09-08T12:00:00Z",
  } as TelehealthVisit;
}

type ProviderHarnessValue = {
  join: (input: {
    actor: "staff" | "patient";
    visitId: string;
    version: number;
    patientId: number;
    patientName: string;
    encounterId: number | null;
    returnPath: string;
    audioOnly?: boolean;
  }) => Promise<void>;
  reconcileAuthorization: (
    visit: TelehealthVisit,
    version: number,
  ) => Promise<void>;
  handleAuthorizationFailure: (
    visitId: string,
    status: number,
  ) => Promise<void>;
  leave: (notifyServer?: boolean) => Promise<void>;
  registerVisitPolling: (visitId: string) => () => void;
};

function renderProvider() {
  hooks.stateCursor = 0;
  hooks.refCursor = 0;
  hooks.effects = [];
  const element = TelehealthSessionProvider({
    contextKey: "user:1:practice:2",
    children: null,
  }) as unknown as { props: { value: ProviderHarnessValue } };
  return element.props.value;
}

async function joinStaff() {
  const provider = renderProvider();
  await provider.join({
    actor: "staff",
    visitId: "visit-1",
    version: 6,
    patientId: 41,
    patientName: "Patient One",
    encounterId: 73,
    returnPath: "/clinic/patients/41/encounters/73/telehealth",
  });
  return renderProvider();
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

let visibility: DocumentVisibilityState;
let documentTarget: EventTarget;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-08T12:00:00Z"));
  hooks.stateCursor = 0;
  hooks.refCursor = 0;
  hooks.states = [];
  hooks.refs = [];
  hooks.effects = [];
  mediaMocks.instances = [];
  vi.clearAllMocks();
  mediaMocks.createAdapter.mockImplementation(async () => createMediaAdapter());
  apiMocks.requestStaffJoinGrant.mockResolvedValue(grantEnvelope);
  apiMocks.requestPatientJoinGrant.mockResolvedValue(grantEnvelope);
  apiMocks.leaveStaffVisit.mockResolvedValue(undefined);
  apiMocks.leavePatientVisit.mockResolvedValue(undefined);
  visibility = "visible";
  documentTarget = new EventTarget();
  Object.defineProperty(documentTarget, "visibilityState", {
    get: () => visibility,
  });
  vi.stubGlobal("document", documentTarget);
  vi.stubGlobal("window", {
    setTimeout: (callback: () => void, delay?: number) =>
      setTimeout(callback, delay) as unknown as number,
    clearTimeout: (timer: number) => clearTimeout(timer),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    location: {
      pathname: "/clinic/patients/41/encounters/73/telehealth",
      search: "",
      replace: vi.fn(),
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("persistent telehealth session authorization", () => {
  it("passes the Twilio room name and keeps the grant credential out of session state", async () => {
    await joinStaff();
    const adapter = mediaMocks.instances[0];
    const active = hooks.states[0].value;

    expect(adapter.join).toHaveBeenCalledWith({
      roomName: "apply-visit-1",
      token: "ephemeral-provider-token",
      videoEnabled: true,
    });
    expect(active).toMatchObject({
      visitId: "visit-1",
      participantId: "app-participant-1",
      providerSubjectId: "provider-subject-1",
      patientId: 41,
    });
    expect(JSON.stringify(active)).not.toContain("ephemeral-provider-token");
    expect(active).not.toHaveProperty("roomUrl");
  });

  it("disposes a lazy adapter that resolves after leave invalidates its join", async () => {
    const adapter = createMediaAdapter();
    const factory = deferred<typeof adapter>();
    mediaMocks.createAdapter.mockReturnValueOnce(factory.promise);
    const provider = renderProvider();
    const joining = provider.join({
      actor: "staff",
      visitId: "visit-1",
      version: 6,
      patientId: 41,
      patientName: "Patient One",
      encounterId: 73,
      returnPath: "/clinic/patients/41/encounters/73/telehealth",
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(mediaMocks.createAdapter).toHaveBeenCalledTimes(1);

    await provider.leave();
    factory.resolve(adapter);
    await joining;

    expect(adapter.destroy).toHaveBeenCalledTimes(1);
    expect(adapter.join).not.toHaveBeenCalled();
    expect(hooks.states[0].value).toBeNull();
  });

  it("disposes a lazy adapter that resolves after the provider unmounts", async () => {
    const adapter = createMediaAdapter();
    const factory = deferred<typeof adapter>();
    mediaMocks.createAdapter.mockReturnValueOnce(factory.promise);
    const provider = renderProvider();
    const joining = provider.join({
      actor: "staff",
      visitId: "visit-1",
      version: 6,
      patientId: 41,
      patientName: "Patient One",
      encounterId: 73,
      returnPath: "/clinic/patients/41/encounters/73/telehealth",
    });

    await Promise.resolve();
    await Promise.resolve();
    const cleanups = hooks.effects
      .map((effect) => effect())
      .filter(
        (cleanup): cleanup is () => void => typeof cleanup === "function",
      );
    expect(cleanups).toHaveLength(1);
    cleanups[0]();

    factory.resolve(adapter);
    await joining;

    expect(adapter.destroy).toHaveBeenCalledTimes(1);
    expect(adapter.join).not.toHaveBeenCalled();
  });

  it("stops Scribe before media when the canonical participant is removed", async () => {
    const provider = await joinStaff();
    const adapter = mediaMocks.instances[0];

    await provider.reconcileAuthorization(visit("removed"), 8);

    expect(terminateTelehealthCapture).toHaveBeenCalledWith(
      "visit-1",
      expect.stringContaining("authorization ended"),
    );
    expect(adapter.leave).toHaveBeenCalledTimes(1);
    expect(terminateTelehealthCapture.mock.invocationCallOrder[0]).toBeLessThan(
      adapter.leave.mock.invocationCallOrder[0],
    );
    expect(hooks.states[0].value).toBeNull();
    expect(apiMocks.leaveStaffVisit).not.toHaveBeenCalled();
  });

  it("clears protected media immediately on an authorization response", async () => {
    const provider = await joinStaff();
    const adapter = mediaMocks.instances[0];

    await provider.handleAuthorizationFailure("visit-1", 401);

    expect(adapter.leave).toHaveBeenCalledTimes(1);
    expect(hooks.states[0].value).toBeNull();
    expect(window.location.replace).toHaveBeenCalledWith(
      "/login?return_to=%2Fclinic%2Fpatients%2F41%2Fencounters%2F73%2Ftelehealth",
    );
  });

  it("disconnects after the bounded authorization freshness window", async () => {
    apiMocks.loadVisit.mockRejectedValue(new TypeError("Network unavailable"));
    await joinStaff();
    const adapter = mediaMocks.instances[0];

    for (const effect of hooks.effects) effect();
    await vi.advanceTimersByTimeAsync(20_000);

    expect(apiMocks.loadVisit).toHaveBeenCalled();
    expect(adapter.leave).toHaveBeenCalledTimes(1);
    expect(hooks.states[0].value).toBeNull();
    expect(
      hooks.states.some((slot) =>
        String(slot.value).includes("could not be rechecked in time"),
      ),
    ).toBe(true);
  });

  it("lets the visible visit page own polling, resumes the fallback when hidden, and retains the 20 second disconnect bound", async () => {
    const provider = await joinStaff();
    const adapter = mediaMocks.instances[0];
    const unregister = provider.registerVisitPolling("visit-1");
    apiMocks.loadVisit.mockRejectedValue(new TypeError("Network unavailable"));

    for (const effect of hooks.effects) effect();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(apiMocks.loadVisit).not.toHaveBeenCalled();

    visibility = "hidden";
    await vi.advanceTimersByTimeAsync(5_000);
    expect(apiMocks.loadVisit).toHaveBeenCalledTimes(1);

    visibility = "visible";
    await vi.advanceTimersByTimeAsync(10_000);
    expect(adapter.leave).toHaveBeenCalledTimes(1);
    expect(hooks.states[0].value).toBeNull();
    unregister();
  });

  it("keeps the active snapshot identity for an unchanged authorization response", async () => {
    const provider = await joinStaff();
    const active = hooks.states[0].value;

    await provider.reconcileAuthorization(visit(), 7);

    expect(hooks.states[0].value).toBe(active);
  });
});
