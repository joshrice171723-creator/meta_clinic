import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScribeRecordingSessionInput } from "../src/features/scribe/ScribeRecordingProvider";

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

const apiMock = vi.hoisted(() => vi.fn());
const recording = vi.hoisted(() => ({
  session: null as null | Record<string, unknown>,
  state: {
    active: false,
    phase: "idle",
    recordingId: null,
    elapsedMs: 0,
    pendingChunks: 0,
    inputLevel: 0,
  },
  begin: vi.fn(
    (
      _input: ScribeRecordingSessionInput,
      _options?: { startRecording?: boolean },
    ) => true,
  ),
  reconcile: vi.fn(),
  finish: vi.fn(),
  terminateTelehealthCapture: vi.fn(),
  contextValue: "",
  setContextValue: vi.fn(),
  contextDirty: false,
  contextSaving: false,
  contextError: null,
  latestSavedContext: null,
  useLatestSavedContext: vi.fn(),
  keepTypedContext: vi.fn(),
  saveContext: vi.fn().mockResolvedValue(true),
}));

vi.mock("react", () => ({
  useCallback: <T,>(callback: T) => callback,
  useEffect: (effect: () => void | (() => void)) => hooks.effects.push(effect),
  useMemo: <T,>(factory: () => T) => factory(),
  useRef: <T,>(initial: T) => {
    const index = hooks.refCursor++;
    hooks.refs[index] ??= { current: initial };
    return hooks.refs[index] as { current: T };
  },
  useState: <T,>(initial: T | (() => T)) => {
    const index = hooks.stateCursor++;
    if (!hooks.states[index]) {
      const slot: StateSlot = {
        value: typeof initial === "function" ? (initial as () => T)() : initial,
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

vi.mock("@mui/material", () => ({
  Alert: "Alert",
  Box: "Box",
  Button: "Button",
  Chip: "Chip",
  CircularProgress: "CircularProgress",
  Dialog: "Dialog",
  DialogActions: "DialogActions",
  DialogContent: "DialogContent",
  DialogTitle: "DialogTitle",
  Divider: "Divider",
  FormControl: "FormControl",
  InputLabel: "InputLabel",
  LinearProgress: "LinearProgress",
  MenuItem: "MenuItem",
  Paper: "Paper",
  Select: "Select",
  Stack: "Stack",
  Step: "Step",
  StepLabel: "StepLabel",
  Stepper: "Stepper",
  TextField: "TextField",
  Typography: "Typography",
}));
vi.mock("@mui/icons-material/ArticleOutlined", () => ({
  default: "ArticleIcon",
}));
vi.mock("@mui/icons-material/CheckCircleOutlineOutlined", () => ({
  default: "CheckIcon",
}));
vi.mock("@mui/icons-material/FiberManualRecordOutlined", () => ({
  default: "RecordIcon",
}));
vi.mock("@mui/icons-material/PauseOutlined", () => ({ default: "PauseIcon" }));
vi.mock("@mui/icons-material/PlayArrowOutlined", () => ({
  default: "PlayIcon",
}));
vi.mock("@mui/icons-material/StopOutlined", () => ({ default: "StopIcon" }));
vi.mock("../src/api/client", () => ({ api: apiMock }));
vi.mock("../src/features/scribe/ScribeRecordingProvider", () => ({
  useScribeRecording: () => recording,
}));
vi.mock("../src/features/scribe/ScribeReviewWorkspace", () => ({
  ScribeReviewWorkspace: "ScribeReviewWorkspace",
}));
vi.mock("../src/features/telehealth/ScribeAudioBridge", () => ({
  attachScribeTracks: vi.fn(),
}));

import { ScribeInCall } from "../src/features/telehealth/ScribeInCall";

const baseProjection = {
  visit_public_id: "visit-1",
  visit_version: 7,
  patient_id: 41,
  clinical_encounter_id: 73,
  encounter_id: 91,
  encounter_version: 4,
  context_content: "",
  template_id: "soap",
  recording_policy: { title: "Recording permission", body: "Policy body" },
  consent: {
    purpose: "scribe_recording" as const,
    policy_version: 2,
    content_digest: "digest",
    state: "accepted" as const,
    required_participants: [
      {
        participant_id: 1,
        display_name: "Clinician",
        status: "accepted" as const,
      },
      {
        participant_id: 2,
        display_name: "Patient",
        status: "accepted" as const,
      },
    ],
  },
  capture: {
    owner_participant_id: null,
    epoch: 3,
    lease_expires_at: null,
  },
  limits: {
    max_duration_ms: 1_800_000,
    max_total_bytes: 31_457_280,
    max_chunks: 500,
    chunk_interval_ms: 2_000,
  },
  recordings: [] as Array<{
    id: number;
    status: string;
    source_id: number | null;
    segment_index: number;
    source_order: number;
  }>,
  sources: [] as Array<{
    id: number;
    recording_id: number;
    source_order: number;
    source_set_digest: string;
  }>,
  allowed_actions: ["start_capture"],
};

type ElementNode = {
  props?: { children?: unknown; onClick?: () => void; disabled?: boolean };
};

function findNode(root: unknown, text: string): ElementNode | null {
  if (!root || typeof root !== "object") return null;
  const node = root as ElementNode;
  if (node.props?.children === text) return node;
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findNode(child, text);
    if (found) return found;
  }
  return null;
}

function renderInCall() {
  hooks.stateCursor = 0;
  hooks.refCursor = 0;
  hooks.effects = [];
  const track = {
    id: "local-audio",
    kind: "audio",
    readyState: "live",
  } as MediaStreamTrack;
  return ScribeInCall({
    visitPublicId: "visit-1",
    clinicalEncounterId: 73,
    patientId: 41,
    callState: "joined",
    localAudioTrack: track,
    remoteAudioTracks: [],
  }) as unknown as ElementNode;
}

async function flushPromises() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

function beginInputAt(index: number) {
  const call = recording.begin.mock.calls[index];
  if (!call) throw new Error(`Expected Scribe begin call ${index}.`);
  return call[0];
}

function finalizedCallback(input: ScribeRecordingSessionInput) {
  if (!input.onSegmentFinalized)
    throw new Error("Expected an active segment finalization callback.");
  return input.onSegmentFinalized;
}

beforeEach(() => {
  hooks.stateCursor = 0;
  hooks.refCursor = 0;
  hooks.states = [];
  hooks.refs = [];
  hooks.effects = [];
  recording.session = null;
  recording.state.active = false;
  recording.state.phase = "idle";
  recording.state.recordingId = null;
  vi.clearAllMocks();
  recording.begin.mockReturnValue(true);
  recording.saveContext.mockResolvedValue(true);

  let renewalVersion = 8;
  apiMock.mockImplementation((path: string, options?: { method?: string }) => {
    if (path.endsWith("/scribe_context"))
      return Promise.resolve({ data: { scribe: baseProjection } });
    if (path === "/api/clinic/scribe/templates")
      return Promise.resolve({ templates: [{ id: "soap", status: "active" }] });
    if (path === "/api/clinic/scribe/encounters/91")
      return Promise.resolve({
        encounter: { id: 91, version: 4, template_id: "soap", drafts: [] },
      });
    if (path.endsWith("/start_scribe_capture"))
      return Promise.resolve({
        data: {
          scribe: {
            ...baseProjection,
            visit_version: renewalVersion,
            capture: {
              owner_participant_id: 1,
              owner_token: "owner-token",
              epoch: 4,
              lease_expires_at: "2026-09-08T12:01:00Z",
            },
          },
        },
      });
    if (path.endsWith("/renew_scribe_capture") && options?.method === "POST") {
      renewalVersion += 1;
      return Promise.resolve({
        data: {
          scribe: {
            ...baseProjection,
            visit_version: renewalVersion,
            capture: {
              owner_participant_id: 1,
              epoch: 4,
              lease_expires_at: "2026-09-08T12:01:30Z",
            },
          },
        },
      });
    }
    throw new Error(`Unexpected API request: ${path}`);
  });
});

describe("in-call Scribe segmented capture", () => {
  it("advances consecutive rollover provenance as segments 0/1/2 and source orders 1/2/3", async () => {
    renderInCall();
    for (const effect of hooks.effects) effect();
    await flushPromises();

    const ready = renderInCall();
    const start = findNode(ready, "Start recording");
    expect(start?.props?.disabled).toBe(false);
    start?.props?.onClick?.();
    await flushPromises();

    expect(recording.begin).toHaveBeenCalledTimes(2);
    let activeInput = beginInputAt(1);
    expect(activeInput.telehealthCapture).toMatchObject({
      captureEpoch: 4,
      segmentIndex: 0,
      sourceOrder: 1,
    });

    await finalizedCallback(activeInput)(101, "limit");
    activeInput = beginInputAt(2);
    expect(activeInput.telehealthCapture).toMatchObject({
      captureEpoch: 4,
      segmentIndex: 1,
      sourceOrder: 2,
    });

    await finalizedCallback(activeInput)(102, "limit");
    activeInput = beginInputAt(3);
    expect(activeInput.telehealthCapture).toMatchObject({
      captureEpoch: 4,
      segmentIndex: 2,
      sourceOrder: 3,
    });
  });
});
