import { beforeEach, describe, expect, it, vi } from "vitest";
const hooks = vi.hoisted(() => ({
  stateCursor: 0,
  refCursor: 0,
  states: [] as Array<{ value: unknown }>,
  refs: [] as Array<{ current: unknown }>,
  effects: [] as Array<() => void | (() => void)>,
}));
const api = vi.hoisted(() => ({
  loadTelehealthSettings: vi.fn(),
  saveTelehealthSettingsDraft: vi.fn(),
  publishTelehealthSettings: vi.fn(),
  disableNewTelehealthVisits: vi.fn(),
  checkTelehealthConnection: vi.fn(),
  requestKey: vi.fn(() => "request-key"),
}));
const navigation = vi.hoisted(() => ({
  navigate: vi.fn(),
  registerBlocker: vi.fn(() => () => undefined),
}));

vi.mock("react", () => ({
  useCallback: (callback: unknown) => callback,
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
  Dialog: "Dialog",
  DialogActions: "DialogActions",
  DialogContent: "DialogContent",
  DialogContentText: "DialogContentText",
  DialogTitle: "DialogTitle",
  Divider: "Divider",
  FormControlLabel: "FormControlLabel",
  Paper: "Paper",
  Switch: "Switch",
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
vi.mock("@mui/icons-material/DeleteOutlineOutlined", () => ({
  default: "DeleteOutlineOutlinedIcon",
}));
vi.mock("../src/features/clinic/clinicNavigation", () => ({
  useClinicNavigation: () => navigation,
}));
vi.mock("../src/features/telehealth/api", () => api);

vi.mock("../src/features/clinic/Workspace", () => ({
  useClinic: () => ({
    capabilities: { telehealth_configure: true },
    practice: { id: 1, name: "Synthetic clinic" },
  }),
}));
import { TelehealthSettings } from "../src/features/telehealth/TelehealthSettings";

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

function saved(rules: unknown[] = []) {
  return {
    version: 0,
    allowed_actions: ["telehealth.configure"],
    data: {
      enabled: false,
      provider_account_ref: null,
      health_status: "not_configured",
      draft: {
        consent_title: "",
        consent_body: "",
        locale: "en-US",
        patient_instructions: "",
        support_label: "",
        join_early_minutes: 15,
        join_late_minutes: 30,
        max_room_minutes: 120,
        grant_ttl_seconds: 120,
        checkin_max_age_minutes: 240,
        require_location: true,
        require_callback: true,
      },
      visit_type_rules: rules,
      options: {
        visit_types: [{ id: 41, name: "Verification Visit" }],
        sites: [{ id: 71, name: "Verification Test Location" }],
      },
    },
  };
}
function render() {
  hooks.stateCursor = hooks.refCursor = 0;
  hooks.effects = [];
  return TelehealthSettings() as Node;
}
async function mount() {
  hooks.states = [];
  hooks.refs = [];
  render();
  hooks.effects[0]();
  await Promise.resolve();
  await Promise.resolve();
  return render();
}
function editRule() {
  let root = render();
  (button(root, "Add eligibility rule").props!.onClick as () => void)();
  for (const [label, value] of [
    ["Visit type", "41"],
    ["Site", "71"],
    ["Allowed region codes", "US-TX"],
  ]) {
    root = render();
    (byLabel(root, label).props!.onChange as (event: unknown) => void)({
      target: { value },
    });
  }
  root = render();
  const control = byLabel(root, "Enabled").props!.control as Node;
  (control.props!.onChange as (event: unknown, checked: boolean) => void)(
    null,
    true,
  );
  return render();
}
async function save(root: Node) {
  (button(root, "Save draft").props!.onClick as () => void)();
  await Promise.resolve();
  await Promise.resolve();
  return render();
}
beforeEach(() => {
  vi.clearAllMocks();
});

describe("Muse235 telehealth draft outcome", () => {
  it("renders a rejected save as an error, preserves edits only until remount, and never confirms success", async () => {
    api.loadTelehealthSettings.mockResolvedValue(saved());
    api.saveTelehealthSettingsDraft.mockRejectedValue(
      new Error("Consent title can't be blank"),
    );
    await mount();
    const root = await save(editRule());
    const alerts = descendants(root).filter((node) => node.type === "Alert");
    expect(alerts.some((node) => node.props?.severity === "success")).toBe(
      false,
    );
    expect(
      alerts.find((node) => node.props?.severity === "error")?.props?.children,
    ).toBeDefined();
    expect(text(root)).toContain("Your draft remains here.");
    expect(text(root)).not.toContain("Draft saved.");
    expect(byLabel(root, "Allowed region codes").props?.value).toBe("US-TX");
    expect(text(await mount())).toContain(
      "No visit types are enabled for video.",
    );
  });
  it("sends the selected rule and displays accepted server rules after remount", async () => {
    api.loadTelehealthSettings.mockResolvedValue(saved());
    await mount();
    api.saveTelehealthSettingsDraft.mockImplementation(
      async (_version, _settings, _draft, rules) => {
        const response = saved(rules);
        api.loadTelehealthSettings.mockResolvedValue(response);
        return response;
      },
    );
    const root = await save(editRule());
    expect(api.saveTelehealthSettingsDraft.mock.calls[0][3]).toEqual([
      expect.objectContaining({
        visit_type_id: 41,
        site_id: 71,
        allowed_region_codes: ["US-TX"],
        enabled: true,
      }),
    ]);
    expect(text(root)).toContain("Draft saved.");
    expect(byLabel(await mount(), "Allowed region codes").props?.value).toBe(
      "US-TX",
    );
  });
});
