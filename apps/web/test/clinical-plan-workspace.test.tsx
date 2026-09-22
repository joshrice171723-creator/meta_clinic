import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  ClinicalPlanWorkspace as ClinicalPlanWorkspaceContract,
  EncounterDetail,
  Patient,
} from "../src/api/contracts";
import {
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
  useResource: () => ({
    data: fixtures.workspace,
    error: "",
    refresh: vi.fn(),
  }),
}));

vi.mock("../src/features/clinic/Workspace", () => ({
  useClinic: () => ({ practice: { timezone: "UTC" } }),
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
        options: ["calculated", "clinician_entered", "imported", "unknown"],
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
