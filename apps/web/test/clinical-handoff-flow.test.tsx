import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NurseEncounterWorkspaceContent } from "../src/features/clinic/NurseEncounterWorkspace";
import { EXAMPLE_CARE_SUMMARIES } from "./trackingBoardCareFixtures";
import { ApiError } from "../src/api/client";

// Real handlers and in-memory hook/API state, with no browser or patient action.
const harness = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as any[],
  api: vi.fn(),
  refresh: vi.fn(),
  reviews: {} as any,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: any) {
    const index = harness.cursor++;
    if (!(index in harness.slots))
      harness.slots[index] =
        typeof initial === "function" ? initial() : initial;
    return [
      harness.slots[index],
      (value: any) => {
        harness.slots[index] =
          typeof value === "function" ? value(harness.slots[index]) : value;
      },
    ];
  },
  useRef(initial: any) {
    const index = harness.cursor++;
    return (harness.slots[index] ??= { current: initial });
  },
  useMemo: (factory: () => unknown) => factory(),
  useEffect: () => undefined,
}));
vi.mock("../src/api/client", async (original) => ({
  ...(await original<typeof import("../src/api/client")>()),
  api: harness.api,
}));
vi.mock("../src/features/clinic/Workspace", () => ({
  useClinic: () => ({ membership_id: 7 }),
}));
function nodes(node: ReactNode): any[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement(node)) return [];
  const props = node.props as any;
  return [props, ...nodes(props.children)];
}
const workspace = {
  schema_version: "nurse-workspace-v1",
  patient_id: 951,
  encounter_id: 952,
  intake: null,
  handoff: null,
  tasks: [],
  capabilities: {
    intake_write: true,
    handoff_request: true,
    handoff_respond: false,
    tasks_write: false,
    observations_write: false,
  },
};
function render() {
  harness.cursor = 0;
  return nodes(
    NurseEncounterWorkspaceContent({
      patient: { id: 951, display_name: "Synthetic handoff patient" } as any,
      encounter: {
        id: 952,
        patient_id: 951,
        site_id: 15,
        room_id: null,
        status: "open",
        visit_modality: "video",
      } as any,
      observations: [],
      careSummary: {
        ...EXAMPLE_CARE_SUMMARIES["EX-001"],
        patient_id: 951,
        encounter_id: 952,
        reviews: harness.reviews,
      } as any,
      resource: { data: workspace as any, refresh: harness.refresh },
      roomsResource: { data: { rooms: [] }, refresh: vi.fn() },
    }),
  );
}
function button(name: string) {
  const result = render().find((p) => p.children === name && p.onClick);
  if (!result) throw new Error(`Missing ${name}`);
  return result;
}
function change(label: string, value: string) {
  const result = render().find((p) => p.label === label && p.onChange);
  if (!result) throw new Error(`Missing ${label}`);
  result.onChange(value);
}
function prepare() {
  button("Clinician handoff").onClick();
  change("Patient identity", "confirmed");
  change("Visit reason", "confirmed");
  change("History review", "reviewed");
  change("Vitals", "not_applicable");
}
function receipt(input: any) {
  return {
    id: 953,
    patient_id: 951,
    encounter_id: 952,
    version: 1,
    ...input,
    recorded_at: "2030-02-04T10:00:00Z",
    recorded_by_membership_id: 7,
  };
}
beforeEach(() => {
  harness.slots = [];
  harness.api.mockReset();
  harness.refresh.mockReset();
  harness.reviews = {};
});

describe("207 preparation save readback", () => {
  it("renders a server validation rejection and keeps the unsaved preparation", async () => {
    prepare();
    harness.api.mockRejectedValueOnce(
      new ApiError(
        422,
        "Reviewed history must reference the reviews used for this intake.",
      ),
    );
    button("Save preparation").onClick();
    await vi.waitFor(() =>
      expect(
        render().some(
          (p) =>
            p.children ===
            "Reviewed history must reference the reviews used for this intake.",
        ),
      ).toBe(true),
    );
    expect(render().some((p) => p.label === "Unsaved changes")).toBe(true);
    expect(button("Request clinician handoff").disabled).toBe(true);
    expect(harness.refresh).not.toHaveBeenCalled();
    expect(harness.api.mock.calls[0][1].body.intake.history_review_ids).toEqual(
      [],
    );
  });
  it("uses the owned save receipt even when refresh retains version zero", async () => {
    prepare();
    harness.reviews = {
      allergies: { id: 961 },
      medications: { id: 962 },
      care_needs: { id: 963 },
    };
    harness.api.mockImplementationOnce(async (_path, options) => ({
      intake: receipt(options.body.intake),
    }));
    button("Save preparation").onClick();
    await vi.waitFor(() =>
      expect(
        render().some((p) => p.children === "Intake revision saved."),
      ).toBe(true),
    );
    expect(render().some((p) => p.label === "Saved")).toBe(true);
    expect(button("Save preparation").disabled).toBe(true);
    expect(harness.refresh).toHaveBeenCalledOnce();
    expect(harness.api.mock.calls[0][1].body.intake).toMatchObject({
      history_review_ids: [961, 962, 963],
      expected_version: 0,
    });
    expect(button("Request clinician handoff").disabled).toBe(true);
  });
  it("rejects a foreign encounter receipt without displaying save success", async () => {
    prepare();
    harness.api.mockResolvedValueOnce({
      intake: { ...receipt({}), encounter_id: 999 },
    });
    button("Save preparation").onClick();
    await vi.waitFor(() =>
      expect(
        render().some(
          (p) =>
            p.children ===
            "The saved intake response did not match this encounter.",
        ),
      ).toBe(true),
    );
    expect(render().some((p) => p.label === "Unsaved changes")).toBe(true);
    expect(harness.refresh).not.toHaveBeenCalled();
  });
});
describe("205 handoff prerequisites", () => {
  it("keeps handoff disabled with no linked history review evidence", () => {
    prepare();
    expect(
      render().some(
        (p) =>
          Array.isArray(p.children) &&
          p.children.join("") === "Review history evidence.",
      ),
    ).toBe(true);
    expect(
      render().some((p) => p.children === "Save as ready for clinician"),
    ).toBe(false);
    expect(button("Request clinician handoff").disabled).toBe(true);
    expect(harness.api).not.toHaveBeenCalled();
  });
  it("enables handoff only after a ready revision receipt and sends its exact identity", async () => {
    prepare();
    harness.reviews = {
      allergies: { id: 961 },
      medications: { id: 962 },
      care_needs: { id: 963 },
    };
    expect(button("Request clinician handoff").disabled).toBe(true);
    harness.api.mockImplementationOnce(async (_path, options) => ({
      intake: receipt(options.body.intake),
    }));
    button("Save as ready for clinician").onClick();
    await vi.waitFor(() =>
      expect(button("Request clinician handoff").disabled).toBe(false),
    );
    harness.api.mockResolvedValueOnce({
      handoff: { encounter_id: 952, state: "pending" },
    });
    button("Request clinician handoff").onClick();
    await vi.waitFor(() =>
      expect(
        render().some(
          (p) =>
            p.children ===
            "Handoff requested. It remains pending until a clinician accepts it.",
        ),
      ).toBe(true),
    );
    expect(harness.api.mock.calls[1][0]).toBe(
      "/api/clinic/patients/951/encounters/952/handoffs",
    );
    expect(harness.api.mock.calls[1][1].body.handoff.intake_revision_id).toBe(
      953,
    );
  });
});
