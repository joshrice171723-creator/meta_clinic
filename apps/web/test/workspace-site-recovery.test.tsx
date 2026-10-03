import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";

const mock = vi.hoisted(() => ({
  cursor: 0,
  refCursor: 0,
  states: [] as { value: any }[],
  refs: [] as { current: any }[],
  effects: [] as (() => void | (() => void))[],
  context: null as any,
  api: vi.fn(),
  refresh: vi.fn(),
  navigate: vi.fn(),
  confirm: vi.fn(),
  bindSite: vi.fn(),
  announce: vi.fn(),
  watch: vi.fn(() => () => {}),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: any) => {
    const slot = (mock.states[mock.cursor++] ??= {
      value: typeof initial === "function" ? initial() : initial,
    });
    return [
      slot.value,
      (value: any) => {
        slot.value = typeof value === "function" ? value(slot.value) : value;
      },
    ];
  },
  useRef: (initial: any) =>
    (mock.refs[mock.refCursor++] ??= { current: initial }),
  useEffect: (effect: () => void | (() => void)) => {
    mock.effects.push(effect);
  },
  useLayoutEffect: () => {},
}));
vi.mock("@mui/material", async (original) => ({
  ...(await original<typeof import("@mui/material")>()),
  Alert: "Alert",
  Button: "Button",
  Typography: "Typography",
}));
vi.mock("../src/api/client", async (original) => ({
  ...(await original<typeof import("../src/api/client")>()),
  api: (...args: any[]) => mock.api(...args),
  setClinicSite: (id: number) => mock.bindSite(id),
  announceClinicLocationChange: () => mock.announce(),
  watchClinicLocationChanges: () => mock.watch(),
}));
vi.mock("../src/shared/ui", () => ({
  useResource: (path: string) => ({
    data: path === "/api/clinic/context" ? mock.context : {},
    refresh: mock.refresh,
  }),
  LoadState: "LoadState",
  Form: "Form",
}));
vi.mock("../src/features/clinic/Appearance", async (original) => ({
  ...(await original<typeof import("../src/features/clinic/Appearance")>()),
  useClinicAppearance: () => ({}),
  ClinicAppearanceScope: "ClinicAppearanceScope",
}));
vi.mock("../src/features/clinic/clinicNavigation", () => ({
  useClinicNavigation: () => ({
    navigate: mock.navigate,
    confirmNavigation: mock.confirm,
  }),
  clinicTarget: () => null,
}));
vi.mock("../src/features/clinic/ClinicFrame", () => ({
  ClinicFrame: "ClinicFrame",
  ClinicRailContext: "ClinicRailContext",
}));
import { CLINIC_LOCATION_CHANGED_EVENT } from "../src/api/client";
import { Workspace } from "../src/features/clinic/Workspace";

let cleanups: (() => void)[];
const child = createElement("textarea", {
  defaultValue: "Unsaved private analysis",
});
const reload = vi.fn();
function elements(node: any): any[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || !node.props) return [];
  return [node, ...elements(node.props.children)];
}
function render(path = "/clinic/patients/7/encounters/8", runEffects = false) {
  mock.cursor = mock.refCursor = 0;
  mock.effects = [];
  const tree = Workspace({ user: { id: 71 } as any, path, children: child });
  if (runEffects)
    for (const effect of mock.effects) {
      const cleanup = effect();
      if (cleanup) cleanups.push(cleanup);
    }
  return tree;
}
beforeEach(() => {
  cleanups = [];
  mock.states = [];
  mock.refs = [];
  mock.api.mockReset();
  mock.refresh.mockClear();
  mock.navigate.mockClear();
  mock.confirm.mockReset().mockReturnValue(false);
  mock.bindSite.mockClear();
  mock.announce.mockClear();
  reload.mockClear();
  const sites = [
    { id: 101, code: "W", name: "Weight", finalized: true },
    { id: 102, code: "B", name: "Behavioral", finalized: true },
  ];
  mock.context = {
    user_id: 71,
    membership_id: 91,
    schema_version: "clinic-context-v1",
    policy_version: "clinic-authorization-v1",
    current_site: sites[0],
    sites,
    credentials: [],
    practice: { id: 81, name: "Clinic", timezone: "UTC" },
    capabilities: { patients: true, notes_read: true },
    features: {
      configured: true,
      finalized: true,
      site_specialty_configured: true,
    },
  };
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), {
      location: { pathname: "/clinic", reload },
    }),
  );
  vi.stubGlobal("document", { getElementById: () => null });
});
afterEach(() => {
  cleanups.forEach((cleanup) => cleanup());
  vi.unstubAllGlobals();
});

describe("workspace location recovery and historical origin", () => {
  it("retains the same chart element on context rejection and respects its unsaved-work guard", () => {
    render("/clinic/patients/7", true);
    window.dispatchEvent(new Event(CLINIC_LOCATION_CHANGED_EVENT));
    const tree = render("/clinic/patients/7");
    expect(elements(tree)).toContain(child);
    const action = elements(tree).find(
      (node) =>
        node.type === "Button" && node.props.children === "Reload location",
    );
    expect(action).toBeDefined();
    action.props.onClick();
    expect(mock.confirm).toHaveBeenCalledWith({ includeBeforeUnload: true });
    expect(reload).not.toHaveBeenCalled();
    expect(elements(render())).toContain(child);
    mock.confirm.mockReturnValue(true);
    action.props.onClick();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("reconciles a saved encounter without refreshing or changing the editor subtree identity", async () => {
    const before = render(undefined, true);
    const providerKey = elements(before).find((node) =>
      node.key?.includes("/clinic/patients/7/encounters/8"),
    )!.key;
    window.dispatchEvent(new Event(CLINIC_LOCATION_CHANGED_EVENT));
    const current = { ...mock.context, current_site: mock.context.sites[1] };
    mock.api
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce({
        encounter: { id: 8, patient_id: 7, site_id: "101" },
      });
    const action = elements(render()).find(
      (node) => node.props.children === "Reconcile location",
    );
    action.props.onClick();
    await vi.waitFor(() => expect(mock.bindSite).toHaveBeenCalledWith(102));
    expect(mock.api.mock.calls).toEqual([
      ["/api/clinic/context"],
      [
        "/api/clinic/encounters/8?patient_id=7",
        { locationRecoverySiteId: 102 },
      ],
    ]);
    expect(mock.refresh).not.toHaveBeenCalled();
    expect(mock.confirm).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(elements(render())).toContain(child);
    expect(elements(render()).some((node) => node.key === providerKey)).toBe(
      true,
    );
    expect(
      elements(render()).find((node) => node.type === "ClinicFrame").props
        .selectedLocationId,
    ).toBe(102);
  });

  it.each(["user_id", "membership_id", "practice", "capabilities"])(
    "retains the editor and fence when recovered %s changes",
    async (field) => {
      render(undefined, true);
      window.dispatchEvent(new Event(CLINIC_LOCATION_CHANGED_EVENT));
      const current = {
        ...mock.context,
        [field]:
          field === "practice"
            ? { id: 999 }
            : field === "capabilities"
              ? { patients: false, notes_read: false }
              : 999,
      };
      mock.api.mockResolvedValueOnce(current);
      elements(render())
        .find((node) => node.props.children === "Reconcile location")
        .props.onClick();
      await vi.waitFor(() =>
        expect(
          elements(render()).some(
            (node) =>
              typeof node.props.children === "string" &&
              node.props.children.includes("account or clinic context"),
          ),
        ).toBe(true),
      );
      expect(mock.bindSite).not.toHaveBeenCalled();
      expect(mock.api).toHaveBeenCalledOnce();
      expect(elements(render())).toContain(child);
      expect(
        elements(render()).some(
          (node) => node.props.children === "Reconcile location",
        ),
      ).toBe(true);
    },
  );

  it.each([
    "denied",
    "wrong_patient",
    "wrong_encounter",
    "inaccessible_source_site",
  ])("does not reopen saving when the saved source is %s", async (reason) => {
    render(undefined, true);
    window.dispatchEvent(new Event(CLINIC_LOCATION_CHANGED_EVENT));
    mock.api.mockResolvedValueOnce({
      ...mock.context,
      current_site: mock.context.sites[1],
    });
    if (reason === "denied")
      mock.api.mockRejectedValueOnce(new Error("Source location denied"));
    else
      mock.api.mockResolvedValueOnce({
        encounter: {
          id: reason === "wrong_encounter" ? 9 : 8,
          patient_id: reason === "wrong_patient" ? 9 : 7,
          site_id: reason === "inaccessible_source_site" ? "999" : "101",
        },
      });
    elements(render())
      .find((node) => node.props.children === "Reconcile location")
      .props.onClick();
    await vi.waitFor(() => expect(mock.api).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    expect(mock.bindSite).not.toHaveBeenCalled();
    expect(elements(render())).toContain(child);
    expect(reload).not.toHaveBeenCalled();
  });

  it("does not submit or discard a location switch rejected by the draft guard", () => {
    const frame = elements(render()).find(
      (node) => node.type === "ClinicFrame",
    );
    frame.props.onLocationChange(102);
    expect(mock.confirm).toHaveBeenCalledOnce();
    expect(mock.api).not.toHaveBeenCalled();
    expect(mock.bindSite).not.toHaveBeenCalled();
    expect(elements(render())).toContain(child);
  });

  it("keeps work on a server-denied switch and binds only an accepted switch before refreshing", async () => {
    mock.confirm.mockReturnValue(true);
    mock.api.mockRejectedValueOnce(new Error("Location denied"));
    elements(render())
      .find((node) => node.type === "ClinicFrame")
      .props.onLocationChange(102);
    await vi.waitFor(() =>
      expect(
        elements(render()).some(
          (node) => node.props.children === "Location denied",
        ),
      ).toBe(true),
    );
    expect(elements(render())).toContain(child);
    expect(mock.bindSite).not.toHaveBeenCalled();
    mock.api.mockResolvedValueOnce({ current_site: { id: 102 } });
    elements(render())
      .find((node) => node.type === "ClinicFrame")
      .props.onLocationChange(102);
    await vi.waitFor(() => expect(mock.bindSite).toHaveBeenCalledWith(102));
    expect(mock.announce).toHaveBeenCalledOnce();
    expect(mock.refresh).toHaveBeenCalled();
    expect(elements(render())).not.toContain(child);
    mock.context = { ...mock.context, current_site: mock.context.sites[1] };
    expect(elements(render())).toContain(child);
  });

  it("keeps saved encounter routes reachable from unfinished navigation setup but gates new work", () => {
    mock.context.features = {
      configured: false,
      finalized: false,
      site_specialty_configured: false,
    };
    mock.context.current_site = {
      ...mock.context.current_site,
      finalized: false,
    };
    expect(elements(render())).toContain(child);
    expect(elements(render("/clinic/schedule"))).not.toContain(child);
    expect(elements(render("/clinic/setup"))).toContain(child);
  });
});
