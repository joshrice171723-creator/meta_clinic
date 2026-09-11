import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  TelehealthEnvelope,
  TelehealthMutationData,
  TelehealthVisit,
} from "../src/features/telehealth/types";

const hooks = vi.hoisted(() => ({
  stateCursor: 0,
  refCursor: 0,
  states: [] as Array<{ value: unknown }>,
  refs: [] as Array<{ current: unknown }>,
  effects: [] as Array<() => void | (() => void)>,
}));
const api = vi.hoisted(() => ({
  saveVisitWrapUp: vi.fn(),
  finalizeVisitWrapUp: vi.fn(),
  requestKey: vi.fn(() => "request-key"),
}));
const navigation = vi.hoisted(() => ({
  navigate: vi.fn(),
  registerBlocker: vi.fn(() => () => undefined),
}));

vi.mock("react", () => ({
  useEffect: (effect: () => void | (() => void)) => hooks.effects.push(effect),
  useRef: <T,>(initial: T) => {
    const index = hooks.refCursor++;
    hooks.refs[index] ??= { current: initial };
    return hooks.refs[index] as { current: T };
  },
  useState: <T,>(initial: T | (() => T)) => {
    const index = hooks.stateCursor++;
    hooks.states[index] ??= {
      value: typeof initial === "function" ? (initial as () => T)() : initial,
    };
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
  Fragment: "Fragment",
  jsx: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
  jsxs: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
}));
vi.mock("@mui/material", () => ({
  Accordion: "Accordion",
  AccordionDetails: "AccordionDetails",
  AccordionSummary: "AccordionSummary",
  Alert: "Alert",
  Box: "Box",
  Button: "Button",
  Chip: "Chip",
  MenuItem: "MenuItem",
  Stack: "Stack",
  TextField: "TextField",
  Typography: "Typography",
}));
vi.mock("@mui/icons-material/ExpandMoreOutlined", () => ({
  default: "ExpandMoreOutlinedIcon",
}));
vi.mock("../src/features/clinic/clinicNavigation", () => ({
  useClinicNavigation: () => navigation,
}));
vi.mock("../src/features/telehealth/api", () => api);

import { VisitWrapUp } from "../src/features/telehealth/VisitWrapUp";

type Node = {
  type?: unknown;
  props?: Record<string, unknown> & { children?: unknown };
};

function descendants(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(descendants);
  if (!value || typeof value !== "object") return [];
  const node = value as Node;
  return [node, ...descendants(node.props?.children)];
}

function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join("");
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (!value || typeof value !== "object") return "";
  return text((value as Node).props?.children);
}

function byLabel(root: Node, label: string) {
  const node = descendants(root).find((item) => item.props?.label === label);
  if (!node) throw new Error(`Missing field: ${label}`);
  return node;
}

function button(root: Node, label: string) {
  const node = descendants(root).find(
    (item) => item.type === "Button" && text(item) === label,
  );
  if (!node) throw new Error(`Missing button: ${label}`);
  return node;
}

function wrapUp() {
  return {
    id: 5,
    status: "draft",
    outcome: "completed",
    clinician_notes: "Saved note",
    patient_instructions: "Saved instructions",
    instruction_note_revision_id: null,
    follow_up_status: "none",
    follow_up_plan: "",
    follow_up_appointment: null,
    scribe_review_status: "reviewed",
    scribe_snapshot: {
      encounter_id: 73,
      encounter_status: "open",
      draft_id: null,
      draft_status: null,
      export_id: null,
      export_state: null,
      encounter_note_id: 8,
      encounter_note_revision_id: 21,
    },
    publication_state: "draft",
    finalized_at: null,
    finalized_by_membership_id: null,
    version: 1,
  } satisfies NonNullable<TelehealthVisit["wrap_up"]>;
}

function visit(saved = wrapUp()): TelehealthVisit {
  return {
    public_id: "visit-1",
    status: "ended",
    access_generation: 1,
    appointment: {
      id: 91,
      starts_at: "2026-09-08T12:00:00Z",
      ends_at: "2026-09-08T12:30:00Z",
      timezone: "America/Chicago",
      visit_modality: "video",
      site_id: 4,
      clinician_membership_id: 12,
      patient: { id: 41, display_name: "Patient" },
    },
    encounter_id: 73,
    policy: {
      version: 3,
      title: "Video visit",
      body: "Consent",
      instructions: "Join when admitted.",
      allow_audio_only: true,
      allow_staff_screen_share: true,
      scribe_enabled: true,
      require_location: true,
      require_callback: true,
    },
    preparation: { complete: true, verified: true, reasons: [] },
    room: { status: "ended" },
    participants: [],
    eligible_staff: [],
    scribe: { consent_state: "accepted", capture: { epoch: 1 } },
    wrap_up: saved,
    wrap_up_options: {
      instruction_revisions: [
        {
          id: 22,
          patient_instructions: "Take one tablet with food.",
          signed_at: "2026-09-08T12:45:00Z",
        },
      ],
      follow_up_appointments: [],
      blockers: [],
    },
    updated_at: "2026-09-08T12:45:00Z",
  };
}

function mutation(next: TelehealthVisit, version: number) {
  return {
    data: { visit: next },
    as_of: "2026-09-08T12:46:00Z",
    version,
    allowed_actions: [],
  } as TelehealthEnvelope<TelehealthMutationData>;
}

const baseProps = {
  allowedActions: ["telehealth.save_wrap_up", "telehealth.finalize_wrap_up"],
  onSaved: vi.fn(),
  onRefresh: vi.fn().mockResolvedValue(undefined),
  onReviewScribe: vi.fn(),
};

function render(
  nextVisit = visit(),
  version = 1,
  allowedActions = baseProps.allowedActions,
) {
  hooks.stateCursor = 0;
  hooks.refCursor = 0;
  hooks.effects = [];
  const root = VisitWrapUp({
    ...baseProps,
    visit: nextVisit,
    version,
    allowedActions,
  }) as unknown as Node;
  const effects = hooks.effects;
  hooks.effects = [];
  for (const effect of effects) effect();
  return root;
}

beforeEach(() => {
  hooks.states = [];
  hooks.refs = [];
  hooks.effects = [];
  vi.clearAllMocks();
  api.requestKey.mockReturnValue("request-key");
  baseProps.onRefresh.mockResolvedValue(undefined);
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setTimeout: (callback: () => void) => {
      callback();
      return 1;
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("visit wrap-up safeguards", () => {
  it("keeps local edits through polling and requires conflict acknowledgement", () => {
    let root = render();
    const notes = byLabel(root, "Clinician wrap-up notes");
    (notes.props?.onChange as (event: unknown) => void)({
      target: { value: "Keep this local edit" },
    });

    root = render(
      visit({ ...wrapUp(), clinician_notes: "New server note", version: 2 }),
      2,
    );

    expect(byLabel(root, "Clinician wrap-up notes").props?.value).toBe(
      "Keep this local edit",
    );
    expect(text(root)).toContain(
      "The visit was updated while you were editing",
    );
    expect(button(root, "Save wrap-up draft").props?.disabled).toBe(true);

    (button(root, "Keep my edits").props?.onClick as () => void)();
    root = render(visit({ ...wrapUp(), version: 2 }), 2);
    expect(byLabel(root, "Clinician wrap-up notes").props?.value).toBe(
      "Keep this local edit",
    );
    expect(button(root, "Save wrap-up draft").props?.disabled).toBe(false);
  });

  it("does not navigate to the chart when saving fails", async () => {
    let root = render();
    (
      byLabel(root, "Clinician wrap-up notes").props?.onChange as (
        event: unknown,
      ) => void
    )({ target: { value: "Unsaved note" } });
    root = render();
    api.saveVisitWrapUp.mockRejectedValueOnce(new Error("Save unavailable"));

    await (
      button(root, "Save draft and open encounter").props
        ?.onClick as () => Promise<void>
    )();
    root = render();

    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(byLabel(root, "Clinician wrap-up notes").props?.value).toBe(
      "Unsaved note",
    );
    expect(text(root)).toContain("Save unavailable");
  });

  it("enables finalization only after save and current server permission", async () => {
    let root = render(visit(), 1, ["telehealth.save_wrap_up"]);
    expect(button(root, "Finalize wrap-up").props?.disabled).toBe(true);
    (
      byLabel(root, "Clinician wrap-up notes").props?.onChange as (
        event: unknown,
      ) => void
    )({ target: { value: "Ready to save" } });
    root = render();
    expect(button(root, "Finalize wrap-up").props?.disabled).toBe(true);

    const savedVisit = visit({ ...wrapUp(), clinician_notes: "Ready to save" });
    api.saveVisitWrapUp.mockResolvedValueOnce(mutation(savedVisit, 2));
    await (
      button(root, "Save wrap-up draft").props?.onClick as () => Promise<void>
    )();
    root = render(savedVisit, 2, ["telehealth.save_wrap_up"]);
    expect(button(root, "Finalize wrap-up").props?.disabled).toBe(true);

    root = render(savedVisit, 2, [
      "telehealth.save_wrap_up",
      "telehealth.finalize_wrap_up",
    ]);
    expect(button(root, "Finalize wrap-up").props?.disabled).toBe(false);
  });

  it("copies patient instructions from the selected signed revision", () => {
    let root = render();
    (
      byLabel(root, "Signed patient instructions").props?.onChange as (
        event: unknown,
      ) => void
    )({ target: { value: "22" } });
    root = render();

    expect(byLabel(root, "Patient instructions").props?.value).toBe(
      "Take one tablet with food.",
    );
    expect(byLabel(root, "Patient instructions").props?.disabled).toBe(true);
  });
});
