import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/api/client";

type StateSlot = { value: unknown };
const hooks = vi.hoisted(() => ({
  stateCursor: 0,
  refCursor: 0,
  states: [] as StateSlot[],
  refs: [] as Array<{ current: unknown }>,
}));
const api = vi.hoisted(() => ({
  requestStaffJoinGrant: vi.fn(),
  requestPatientJoinGrant: vi.fn(),
  loadVisit: vi.fn(),
  loadPatientVisit: vi.fn(),
  leaveStaffVisit: vi.fn().mockResolvedValue(undefined),
  leavePatientVisit: vi.fn().mockResolvedValue(undefined),
}));
const media = vi.hoisted(() => ({
  instances: [] as Array<{
    join: ReturnType<typeof vi.fn>;
    leave: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }>,
  callbacks: [] as Array<{
    onState: (
      state: "joining" | "joined" | "reconnecting" | "ended" | "error",
    ) => void;
  }>,
}));
const terminateCapture = vi.hoisted(() => vi.fn());

vi.mock("react", () => ({
  createContext: (initial: unknown) => ({ initial }),
  useCallback: <T,>(callback: T) => callback,
  useContext: () => null,
  useEffect: () => undefined,
  useMemo: <T,>(factory: () => T) => factory(),
  useRef: <T,>(initial: T) => {
    const index = hooks.refCursor++;
    hooks.refs[index] ??= { current: initial };
    return hooks.refs[index] as { current: T };
  },
  useState: <T,>(initial: T) => {
    const index = hooks.stateCursor++;
    hooks.states[index] ??= { value: initial };
    const slot = hooks.states[index];
    return [
      slot.value as T,
      (next: T | ((current: T) => T)) => {
        slot.value =
          typeof next === "function"
            ? (next as (current: T) => T)(slot.value as T)
            : next;
      },
    ] as const;
  },
}));
vi.mock("react/jsx-runtime", () => ({
  Fragment: Symbol("Fragment"),
  jsx: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
  jsxs: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
}));
vi.mock("../src/features/telehealth/api", () => api);
vi.mock("../src/features/telehealth/mediaAdapter", () => ({
  createTelehealthMediaAdapter: vi.fn(
    (
      _provider: "twilio" | "daily",
      callbacks: (typeof media.callbacks)[number],
    ) => {
      media.callbacks.push(callbacks);
      return new (class {
        join = vi.fn().mockResolvedValue(undefined);
        leave = vi.fn().mockResolvedValue(undefined);
        destroy = vi.fn().mockResolvedValue(undefined);
        setMicrophone = vi.fn();
        setCamera = vi.fn();
        selectInputDevice = vi.fn();
        startScreenShare = vi.fn();
        stopScreenShare = vi.fn();
        ejectParticipant = vi.fn();
        ejectAllRemoteParticipants = vi.fn();
        constructor() {
          media.instances.push(this);
        }
      })();
    },
  ),
}));
vi.mock("../src/features/scribe/ScribeRecordingProvider", () => ({
  useOptionalScribeRecording: () => ({
    terminateTelehealthCapture: terminateCapture,
  }),
}));

import { TelehealthSessionProvider } from "../src/features/telehealth/TelehealthSessionProvider";

type ProviderValue = {
  active: {
    visitId: string;
    encounterId: number | null;
    patientId: number;
    returnPath: string;
    version: number;
  } | null;
  callState:
    | "idle"
    | "joining"
    | "joined"
    | "reconnecting"
    | "leaving"
    | "ended"
    | "error";
  error: string | null;
  join: (input: {
    actor: "staff";
    visitId: string;
    version: number;
    patientId: number;
    patientName: string;
    encounterId: number;
    returnPath: string;
  }) => Promise<void>;
  retryConnection: () => Promise<void>;
};

function grant(token: string, version: number, participant: string) {
  return {
    data: {
      join_grant: {
        token,
        room_name: "apply-visit-1",
        room_url: null,
        expires_at: "2026-09-08T12:05:00Z",
        provider: "twilio",
        participant: {
          id: participant,
          provider_subject_id: `subject-${participant}`,
        },
        room: { expires_at: "2026-09-08T13:00:00Z" },
      },
    },
    as_of: "2026-09-08T12:00:00Z",
    version,
    allowed_actions: [],
  };
}

function renderProvider() {
  hooks.stateCursor = 0;
  hooks.refCursor = 0;
  const element = TelehealthSessionProvider({
    contextKey: "staff:1:practice:2",
    children: null,
  }) as unknown as { props: { value: ProviderValue } };
  return element.props.value;
}

async function joinedProvider() {
  api.requestStaffJoinGrant.mockResolvedValueOnce(
    grant("initial-token", 7, "participant-1"),
  );
  const provider = renderProvider();
  await provider.join({
    actor: "staff",
    visitId: "visit-1",
    version: 6,
    patientId: 41,
    patientName: "Patient",
    encounterId: 73,
    returnPath: "/clinic/patients/41/encounters/73/telehealth",
  });
  return renderProvider();
}

beforeEach(() => {
  hooks.states = [];
  hooks.refs = [];
  media.instances = [];
  media.callbacks = [];
  vi.clearAllMocks();
  api.leaveStaffVisit.mockResolvedValue(undefined);
  api.leavePatientVisit.mockResolvedValue(undefined);
  vi.stubGlobal("window", {
    location: { pathname: "/clinic", search: "", replace: vi.fn() },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("telehealth connection recovery", () => {
  it("recovers an unexpected provider disconnect with a fresh grant for the same encounter", async () => {
    const provider = await joinedProvider();
    media.callbacks[0].onState("ended");

    const disconnected = renderProvider();
    expect(disconnected.callState).toBe("error");
    expect(disconnected.error).toContain("video call disconnected");
    expect(disconnected.active).toMatchObject({
      visitId: "visit-1",
      encounterId: 73,
      patientId: 41,
    });

    api.requestStaffJoinGrant.mockResolvedValueOnce(
      grant("recovered-token", 9, "participant-2"),
    );
    await disconnected.retryConnection();

    const recovered = renderProvider();
    expect(media.instances[0].destroy).toHaveBeenCalledTimes(1);
    expect(api.requestStaffJoinGrant).toHaveBeenLastCalledWith("visit-1", 7);
    expect(media.instances[1].join).toHaveBeenCalledWith({
      roomName: "apply-visit-1",
      token: "recovered-token",
    });
    expect(recovered.active).toMatchObject({
      visitId: "visit-1",
      encounterId: 73,
      patientId: 41,
      returnPath: "/clinic/patients/41/encounters/73/telehealth",
      version: 9,
    });
  });

  it("tears down old media before using a fresh grant for the same encounter", async () => {
    const provider = await joinedProvider();
    const oldAdapter = media.instances[0];
    api.requestStaffJoinGrant.mockResolvedValueOnce(
      grant("fresh-token", 9, "participant-2"),
    );

    await provider.retryConnection();
    const recovered = renderProvider();

    const freshAdapter = media.instances[1];
    expect(oldAdapter.destroy).toHaveBeenCalledTimes(1);
    expect(freshAdapter).toBeDefined();
    expect(terminateCapture).toHaveBeenCalledWith(
      "visit-1",
      expect.stringContaining("restarting"),
    );
    expect(oldAdapter.destroy.mock.invocationCallOrder[0]).toBeLessThan(
      api.requestStaffJoinGrant.mock.invocationCallOrder[1],
    );
    expect(oldAdapter.join).toHaveBeenCalledTimes(1);
    expect(freshAdapter.join).toHaveBeenCalledWith({
      roomName: "apply-visit-1",
      token: "fresh-token",
    });
    expect(recovered.active).toMatchObject({
      encounterId: 73,
      patientId: 41,
      returnPath: "/clinic/patients/41/encounters/73/telehealth",
      version: 9,
    });
  });

  it("coalesces duplicate retry clicks into one grant request", async () => {
    const provider = await joinedProvider();
    let resolveGrant!: (value: ReturnType<typeof grant>) => void;
    api.requestStaffJoinGrant.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveGrant = resolve;
      }),
    );

    const first = provider.retryConnection();
    const duplicate = provider.retryConnection();
    await Promise.resolve();
    await Promise.resolve();
    expect(api.requestStaffJoinGrant).toHaveBeenCalledTimes(2);
    resolveGrant(grant("fresh-token", 9, "participant-2"));
    await Promise.all([first, duplicate]);

    expect(media.instances).toHaveLength(2);
    expect(media.instances[0].destroy).toHaveBeenCalledTimes(1);
    expect(media.instances[0].join).toHaveBeenCalledTimes(1);
    expect(media.instances[1].join).toHaveBeenCalledWith({
      roomName: "apply-visit-1",
      token: "fresh-token",
    });
  });

  it("disconnects and clears the session when fresh authorization is denied", async () => {
    const provider = await joinedProvider();
    const adapter = media.instances[0];
    api.requestStaffJoinGrant.mockRejectedValueOnce(
      new ApiError(403, "Access denied"),
    );

    await provider.retryConnection();
    const denied = renderProvider();

    expect(adapter.destroy).toHaveBeenCalledTimes(1);
    expect(adapter.join).toHaveBeenCalledTimes(1);
    expect(media.instances).toHaveLength(1);
    expect(denied.active).toBeNull();
  });
});
