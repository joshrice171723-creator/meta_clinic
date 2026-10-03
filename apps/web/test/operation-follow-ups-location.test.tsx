import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  cursor: 0,
  states: [] as any[],
  path: "",
  response: null as any,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: any) {
    const index = hooks.cursor++;
    if (!(index in hooks.states)) hooks.states[index] = initial;
    return [
      hooks.states[index],
      (value: any) => {
        hooks.states[index] = value;
      },
    ];
  },
}));
vi.mock("../src/features/clinic/Workspace", () => ({
  useClinic: () => ({
    capabilities: { staff_messaging_read: true },
    current_site: { id: 101, name: "Navigation Weight" },
    sites: [
      { id: 101, name: "Navigation Weight" },
      { id: 102, name: "Behavioral" },
    ],
  }),
}));
vi.mock("../src/shared/ui", () => ({
  useResource: (path: string) => {
    hooks.path = path;
    return { data: hooks.response, refresh: vi.fn() };
  },
}));
import { OperationFollowUps } from "../src/features/clinic/OperationFollowUps";

function elements(node: any): any[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node?.props) return [];
  return [node, ...elements(node.props.children)];
}
function text(node: any): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (node?.props) return text(node.props.children);
  return typeof node === "string" || typeof node === "number"
    ? String(node)
    : "";
}
function render() {
  hooks.cursor = 0;
  const worklist = OperationFollowUps()!;
  return (worklist.type as any)(worklist.props);
}
beforeEach(() => {
  hooks.states = [];
  const summary = { open: 2, mine: 0, overdue: 0, unassigned: 2 };
  hooks.response = {
    summary,
    encounter_summary: { ...summary, open: 0 },
    clinical_task_summary: summary,
    reminder_attention_count: null,
    encounter_follow_ups: [],
    requests: [
      {
        id: 1,
        conversation_id: 9,
        subject: "Contact",
        state: "open",
        due_at: null,
        source_site_id: 102,
        source_site_name: "Saved Behavioral",
      },
    ],
    clinical_tasks: [
      {
        id: 2,
        patient_display_name: "Example",
        patient_reference: "",
        state: "open",
        task_kind: "patient_call",
        pool_code: "front_desk",
        due_at: null,
        encounter_href: null,
        source_site_id: null,
        source_site_name: null,
      },
    ],
  };
});
describe("shared follow-up worklist location ownership", () => {
  it("uses an explicit location filter and can restore clinic-wide totals without changing navigation", () => {
    const tree = render();
    expect(hooks.path).toBe(
      "/api/clinic/operations/follow_ups?filter=all&site_id=101",
    );
    const select = elements(tree).find(
      (node) => node.props.label === "Follow-up location",
    );
    select.props.onChange({ target: { value: "" } });
    render();
    expect(hooks.path).toBe("/api/clinic/operations/follow_ups?filter=all");
    select.props.onChange({ target: { value: "102" } });
    render();
    expect(hooks.path).toBe(
      "/api/clinic/operations/follow_ups?filter=all&site_id=102",
    );
  });
  it("shows persisted request source and explicit shared tasks rather than assigning navigation provenance", () => {
    const tree = render();
    const labels = elements(tree)
      .filter((node) => node.props.variant === "body2")
      .map(text);
    expect(labels).toContain("Saved Behavioral");
    expect(labels.some((label) => label.includes("· Shared"))).toBe(true);
    expect(labels.some((label) => label.includes("Navigation Weight"))).toBe(
      false,
    );
  });
});
