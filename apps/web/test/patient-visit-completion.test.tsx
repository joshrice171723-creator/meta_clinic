import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PatientTelehealthCompletion,
  TelehealthAppointmentSummary,
} from "../src/features/telehealth/types";

type StateSlot = {
  value: unknown;
  setter: ReturnType<typeof vi.fn>;
};

const hooks = vi.hoisted(() => ({
  cursor: 0,
  states: [] as StateSlot[],
}));

vi.mock("react", () => ({
  useState: <T,>(initial: T | (() => T)) => {
    const index = hooks.cursor++;
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

type ElementNode = {
  type: unknown;
  props: Record<string, unknown> & { children?: unknown };
};

vi.mock("react/jsx-runtime", () => {
  const renderElement = (type: unknown, props: Record<string, unknown>) => {
    if (typeof type === "function") return type(props);
    return { type, props };
  };
  return {
    Fragment: "Fragment",
    jsx: renderElement,
    jsxs: renderElement,
  };
});

vi.mock("@mui/material", () => ({
  Alert: "Alert",
  Box: "Box",
  Button: "Button",
  Chip: "Chip",
  CircularProgress: "CircularProgress",
  Divider: "Divider",
  Paper: "Paper",
  Stack: "Stack",
  Typography: "Typography",
}));
vi.mock("@mui/icons-material/AssignmentTurnedInOutlined", () => ({
  default: "AssignmentTurnedInIcon",
}));
vi.mock("@mui/icons-material/EventBusyOutlined", () => ({
  default: "EventBusyIcon",
}));
vi.mock("@mui/icons-material/ScheduleOutlined", () => ({
  default: "ScheduleIcon",
}));
vi.mock("@mui/icons-material/SupportAgentOutlined", () => ({
  default: "SupportAgentIcon",
}));

import {
  PatientVisitCompletion,
  type PatientVisitCompletionProps,
} from "../src/features/telehealth/PatientVisitCompletion";

const pendingCompletion: PatientTelehealthCompletion = {
  status: "pending",
  outcome: null,
  instructions: null,
  follow_up_status: null,
  follow_up_plan: null,
  follow_up_appointment: null,
  published_at: null,
};

const readyCompletion: PatientTelehealthCompletion = {
  status: "ready",
  outcome: "completed",
  instructions: "Continue the released care plan.",
  follow_up_status: "needed",
  follow_up_plan: "Call the clinic in two weeks.",
  follow_up_appointment: null,
  published_at: "2030-04-05T16:30:00Z",
};

const arrangedAppointment: TelehealthAppointmentSummary = {
  id: 812,
  starts_at: "2030-04-19T15:00:00Z",
  ends_at: "2030-04-19T15:30:00Z",
  timezone: "America/Chicago",
  visit_modality: "video",
  site_id: 2,
  clinician_membership_id: 9,
  clinician: { membership_id: 9, display_name: "Jordan Clinician" },
  patient: { id: 41, display_name: "Portal Patient" },
};

function render(
  overrides: Partial<PatientVisitCompletionProps> = {},
): ElementNode {
  hooks.cursor = 0;
  return PatientVisitCompletion({
    visitStatus: "ended",
    completion: pendingCompletion,
    support: { label: "Call the clinic", phone: "+1 (555) 010-1212" },
    onRefresh: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as unknown as ElementNode;
}

function walk(value: unknown, visit: (node: ElementNode) => void) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, visit));
    return;
  }
  const node = value as ElementNode;
  if (!node.props) return;
  if (typeof node.type === "function") {
    walk(node.type(node.props), visit);
    return;
  }
  visit(node);
  walk(node.props.children, visit);
}

function visibleText(root: ElementNode) {
  const values: string[] = [];
  const collect = (value: unknown) => {
    if (typeof value === "string" || typeof value === "number") {
      values.push(String(value));
      return;
    }
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    const node = value as ElementNode;
    if (typeof node.type === "function") {
      collect(node.type(node.props));
      return;
    }
    if (typeof node.props?.label === "string") values.push(node.props.label);
    collect(node.props?.children);
  };
  collect(root);
  return values.join(" ");
}

function nodesWithHref(root: ElementNode) {
  const nodes: ElementNode[] = [];
  walk(root, (node) => {
    if (typeof node.props.href === "string") nodes.push(node);
  });
  return nodes;
}

function nodeWithText(root: ElementNode, text: string): ElementNode | null {
  const matches: ElementNode[] = [];
  walk(root, (node) => {
    if (visibleText(node) === text) matches.push(node);
  });
  return matches[0] ?? null;
}

async function flushPromises() {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

beforeEach(() => {
  hooks.cursor = 0;
  hooks.states = [];
  vi.clearAllMocks();
});

describe("patient telehealth completion", () => {
  it("never renders unreleased fields injected into a pending projection", () => {
    const injectedPending = {
      ...pendingCompletion,
      instructions: "UNRELEASED PATIENT INSTRUCTIONS",
      follow_up_plan: "UNRELEASED FOLLOW-UP PLAN",
    } as PatientTelehealthCompletion;

    const text = visibleText(render({ completion: injectedPending }));

    expect(text).toContain("has not released finalized patient instructions");
    expect(text).not.toContain("UNRELEASED PATIENT INSTRUCTIONS");
    expect(text).not.toContain("UNRELEASED FOLLOW-UP PLAN");
  });

  it("describes an ending visit without claiming that it has ended", () => {
    const text = visibleText(
      render({ visitStatus: "ending", completion: null }),
    );

    expect(text).toContain("Your video visit is ending");
    expect(text).toContain("confirming that the call has ended");
    expect(text).not.toContain("Your video visit has ended");
    expect(text).not.toContain("The call is closed");
  });

  it("renders only the published patient instructions and follow-up for a ready ended visit", () => {
    const text = visibleText(render({ completion: readyCompletion }));

    expect(text).toContain("Your video visit has ended");
    expect(text).toContain("Visit completed");
    expect(text).toContain("Continue the released care plan.");
    expect(text).toContain("Call the clinic in two weeks.");
    expect(text).toContain("Released");
  });

  it("shows an arranged appointment date only when an appointment is present", () => {
    const arrangedWithoutAppointment: PatientTelehealthCompletion = {
      ...readyCompletion,
      follow_up_status: "arranged",
      follow_up_plan: "A follow-up has been arranged.",
      follow_up_appointment: null,
    };
    expect(
      visibleText(render({ completion: arrangedWithoutAppointment })),
    ).not.toContain("Follow-up appointment");

    const arrangedWithAppointment: PatientTelehealthCompletion = {
      ...arrangedWithoutAppointment,
      follow_up_appointment: arrangedAppointment,
    };
    const text = visibleText(render({ completion: arrangedWithAppointment }));
    expect(text).toContain("Follow-up appointment");
    expect(text).toContain("2030");
    expect(text).toContain("Jordan Clinician");
  });

  it("uses safe configured phone and HTTPS contacts and rejects unsafe URLs", () => {
    const phoneLinks = nodesWithHref(
      render({
        support: { label: "Call the clinic", phone: "+1 (555) 010-1212" },
      }),
    ).map((node) => node.props.href);
    expect(phoneLinks).toContain("tel:+15550101212");

    const webLinks = nodesWithHref(
      render({
        support: {
          label: "Clinic support",
          phone: null,
          url: "https://clinic.example.test/help",
        },
      }),
    ).map((node) => node.props.href);
    expect(webLinks).toContain("https://clinic.example.test/help");

    const unsafeLinks = nodesWithHref(
      render({
        support: {
          label: "Clinic support",
          phone: null,
          url: "javascript:alert(1)",
        },
      }),
    ).map((node) => node.props.href);
    expect(unsafeLinks).not.toContain("javascript:alert(1)");
    expect(unsafeLinks).toEqual(["/patient-portal#appointments"]);
  });

  it("surfaces refresh failure without claiming newer information was loaded", async () => {
    const onRefresh = vi.fn().mockRejectedValue(new Error("Connection lost"));
    let tree = render({ onRefresh });
    const refresh = nodeWithText(tree, "Check for updates");
    expect(refresh).not.toBeNull();

    (refresh?.props.onClick as (() => void) | undefined)?.();
    await flushPromises();
    tree = render({ onRefresh });
    const text = visibleText(tree);

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(text).toContain("Connection lost");
    expect(text).not.toContain("Up to date");
    expect(text).not.toContain("Updated successfully");
  });
});
