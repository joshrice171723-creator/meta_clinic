import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  ClinicalPlanWorkspace as ClinicalPlanWorkspaceContract,
  EncounterDetail,
  Patient,
} from "../src/api/contracts";
import {
  clinicalPlanTaskTarget,
  clinicalPlanCreateBlockedReasons,
  clinicalPlanResourceMeta,
  ClinicalPlanWorkspace,
} from "../src/features/clinic/ClinicalPlanWorkspace";

const fixtures = vi.hoisted(() => ({
  workspace: {
    records: {
      medication_requests: [],
      service_requests: [],
      diagnoses: [],
      procedures: [],
      care_plans: [],
      care_goals: [],
      immunizations: [],
      assessments: [],
    },
    truncated: {
      medication_requests: false,
      service_requests: false,
      diagnoses: false,
      procedures: false,
      care_plans: false,
      care_goals: false,
      immunizations: false,
      assessments: false,
    },
    capabilities: {
      medication_requests: false,
      service_requests: false,
      diagnoses: false,
      procedures: false,
      care_plans: false,
      care_goals: false,
      immunizations: false,
      assessments: false,
    },
    medication_products: [],
    medication_order_options: { dose_units: [], routes: [] },
    assessment_scope: [],
    new_work: {},
    prior_orders: [],
    prior_care: [
      {
        kind: "care_plans",
        id: 19,
        revision: 3,
        encounter_id: 41,
        recorded_at: "2026-09-22T14:00:00Z",
        status: "active",
        label: "Synthetic continuity plan",
        outcome: null,
      },
    ],
  } as unknown as ClinicalPlanWorkspaceContract,
}));

vi.mock("../src/shared/ui", () => ({
  useResource: (path: string, options?: { enabled?: boolean }) => ({
    data:
      options?.enabled === false
        ? undefined
        : path.endsWith("/events")
          ? { attempts: [] }
          : fixtures.workspace,
    error: "",
    refresh: vi.fn(),
  }),
}));

vi.mock("../src/features/clinic/Workspace", () => ({
  useClinic: () => ({
    practice: { timezone: "UTC" },
    capabilities: { facilities_read: false },
  }),
}));

vi.mock("../src/features/clinic/clinicNavigation", () => ({
  useClinicNavigation: () => ({ registerBlocker: () => () => undefined }),
}));

vi.mock("../src/features/clinic/ClinicalPlanClosurePanel", () => ({
  ClinicalPlanClosurePanel: () => null,
}));

vi.mock("../src/features/clinic/PrescriptionFulfillmentPanel", () => ({
  PrescriptionFulfillmentPanel: () => null,
}));

describe("ClinicalPlanWorkspace", () => {
  it("explains every existing create prerequisite without confusing visit state with configuration", () => {
    const encounter = {
      status: "completed",
      ended_at: "2026-09-28T12:00:00Z",
      site_id: null,
    } as EncounterDetail;
    const data = {
      ...fixtures.workspace,
      new_work: { medication_requests: false },
    } as ClinicalPlanWorkspaceContract;
    const reasons = clinicalPlanCreateBlockedReasons(
      data,
      encounter,
      "medication_requests",
      true,
    );
    expect(reasons.join(" ")).toContain("open encounter that has not ended");
    expect(reasons.join(" ")).toContain("Assign a facility");
    expect(reasons.join(" ")).toContain("do not have permission");
    expect(reasons.join(" ")).toContain("pending clinical record save");
    expect(reasons.join(" ")).toContain("service is disabled for new work");
    const allowed = {
      ...fixtures.workspace,
      capabilities: {
        ...fixtures.workspace.capabilities,
        medication_requests: true,
      },
    };
    expect(
      clinicalPlanCreateBlockedReasons(
        allowed,
        {
          status: "open",
          ended_at: null,
          site_id: "1",
        } as EncounterDetail,
        "medication_requests",
      ),
    ).toEqual([]);
  });

  it("associates the disabled Add control with its specific reasons", () => {
    const html = renderToStaticMarkup(
      <ClinicalPlanWorkspace
        patient={{ id: 8, display_name: "Synthetic Patient" }}
        encounter={
          {
            id: 72,
            status: "completed",
            ended_at: null,
            site_id: "1",
          } as EncounterDetail
        }
      />,
    );
    expect(html).toContain('aria-describedby="clinical-plan-create-reasons"');
    expect(html).toContain("open encounter that has not ended");
    expect(html).toContain(
      "do not have permission to add medication request records",
    );
    expect(html).not.toContain("This service is disabled for new work");
  });

  it("keeps substitution unresolved until an explicit prescription choice", () => {
    const meta = clinicalPlanResourceMeta.medication_requests;
    expect(meta.initial.substitution_instruction).toBe("");
    expect(meta.fields).toContainEqual({
      name: "substitution_instruction",
      label: "Substitution instruction",
      options: ["", "allowed", "not_allowed"],
    });
  });
  it("parses an exact Patient Flow order target", () => {
    expect(
      clinicalPlanTaskTarget(
        "?focus=clinical-plan-workspace&order_kind=medication_request&order_series_id=series-7&task_id=42",
      ),
    ).toEqual({
      kind: "medication_requests",
      seriesId: "series-7",
      taskId: 42,
    });
    expect(
      clinicalPlanTaskTarget(
        "?focus=clinical-plan-workspace&order_kind=diagnosis&order_series_id=series-7&task_id=42",
      ),
    ).toBeNull();
  });

  it("keeps care-goal outcome provenance controls explicit and source-bounded", () => {
    const fields = clinicalPlanResourceMeta.care_goals.fields;

    expect(fields).toContainEqual(
      expect.objectContaining({
        name: "outcome_source",
        label: "Outcome source",
        options: [
          "patient_reported",
          "clinician_observed",
          "proxy_reported",
          "imported",
          "unknown",
        ],
      }),
    );
    expect(fields).toContainEqual(
      expect.objectContaining({
        name: "outcome_recorded_at",
        label: "Outcome reported or observed at",
        type: "datetime-local",
      }),
    );
  });

  it("keeps assessment score provenance explicit and source-bounded", () => {
    const fields = clinicalPlanResourceMeta.assessments.fields;

    expect(fields).toContainEqual(
      expect.objectContaining({
        name: "score_source",
        label: "Score source",
        options: ["clinician_entered", "imported", "unknown"],
      }),
    );
    expect(fields).toContainEqual(
      expect.objectContaining({
        name: "score_recorded_at",
        label: "Score recorded at",
        type: "datetime-local",
      }),
    );
  });

  it("defaults immunization entry to a historical record while administration is unavailable", () => {
    expect(clinicalPlanResourceMeta.immunizations.initial).toMatchObject({
      occurrence_source: "patient_reported",
    });
  });

  it("shows accessible prior care with its source visit instead of copying it", () => {
    const html = renderToStaticMarkup(
      <ClinicalPlanWorkspace
        patient={{ id: 8, display_name: "Synthetic Patient" } as Patient}
        encounter={{ id: 72, status: "open" } as EncounterDetail}
      />,
    );

    expect(html).toContain("Care plans and goals from previous visits");
    expect(html).toContain("Synthetic continuity plan");
    expect(html).toContain("revision 3");
    expect(html).toContain("this visit does not create a copy");
    expect(html).toContain(
      "/clinic/patients/8/encounters/41?focus=clinical-plan-workspace",
    );
    expect(html).toContain("Review source visit 41");
  });
});
