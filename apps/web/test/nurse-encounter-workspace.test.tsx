import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  EncounterDetail,
  NurseWorkspace,
  Patient,
} from "../src/api/contracts";
import { NurseEncounterWorkspace } from "../src/features/clinic/NurseEncounterWorkspace";

const fixtures = vi.hoisted(() => ({
  workspace: {
    schema_version: "nurse-workspace-v1",
    patient_id: 121,
    encounter_id: 37,
    intake: null,
    handoff: null,
    tasks: [],
    questionnaire_form: {
      id: "meta-clinic-previsit-v3",
      version: 1,
      fields: [
        { id: "visit_reason", label: "What brings you in?", reusable: false },
        {
          id: "symptoms",
          label: "Symptoms and when they started",
          reusable: false,
        },
        {
          id: "goals",
          label: "What would you like help with?",
          reusable: false,
        },
        {
          id: "care_needs",
          label: "Communication, accessibility or other care needs",
          reusable: true,
        },
        { id: "telehealth_location", label: "Video location", reusable: false },
        {
          id: "medications",
          label: "Current medicines and supplements",
          reusable: true,
        },
        { id: "allergies", label: "Allergies and reactions", reusable: true },
        {
          id: "history",
          label: "Health history and recent changes",
          reusable: true,
        },
        {
          id: "prior_approaches",
          label: "What have you tried?",
          reusable: true,
        },
        { id: "procedures", label: "Previous procedures", reusable: true },
        { id: "barriers", label: "Plan barriers", reusable: false },
        { id: "height", label: "Current height", reusable: false },
        { id: "weight", label: "Current weight", reusable: false },
        {
          id: "treatment_product_class",
          label: "Treatment product or class being discussed",
          reusable: false,
          choices: ["glp1", "other_prescription", "unknown"],
        },
        {
          id: "pregnancy_status",
          label: "Current pregnancy status",
          reusable: false,
          choices: ["pregnant", "not_pregnant", "unsure", "declined"],
        },
        {
          id: "nutrition_pattern",
          label: "Meal pattern",
          reusable: false,
          choices: ["regular_meals", "variable_meals", "unknown"],
        },
        {
          id: "activity_capacity",
          label: "Activity and movement capacity",
          reusable: false,
          choices: ["independent", "limited", "unknown"],
        },
        {
          id: "outside_records_state",
          label: "Outside records",
          reusable: false,
          choices: ["not_requested", "received", "unknown"],
        },
        {
          id: "patient_confirmation_state",
          label: "Patient confirmation of recorded answers",
          reusable: false,
          choices: ["confirmed", "needs_correction", "unknown"],
        },
        {
          id: "follow_up_context",
          label: "Follow-up context",
          reusable: false,
          choices: ["initial_visit", "follow_up", "unknown"],
        },
      ],
      answer_states: [
        "unanswered",
        "answered",
        "not_asked",
        "unknown",
        "declined",
        "not_applicable",
        "negative",
      ],
      provenance: ["patient_reported", "staff_recorded"],
      medication_options: [],
      chunks: [
        {
          index: 0,
          id: "today_visit",
          label: "Today’s visit",
          description: "Why the patient is here and what they want help with.",
          fields: ["visit_reason", "symptoms", "goals"],
        },
        {
          index: 1,
          id: "patient_coordination",
          label: "Patient and coordination",
          description:
            "Confirm chart context and capture encounter-specific needs.",
          fields: ["care_needs", "telehealth_location"],
        },
        {
          index: 2,
          id: "safety_history",
          label: "Safety and history",
          description: "Medicines, allergies, and relevant health history.",
          fields: ["medications", "allergies", "history"],
        },
        {
          index: 3,
          id: "prior_approaches",
          label: "What has been tried",
          description:
            "Previous approaches, procedures, and barriers to the plan.",
          fields: ["prior_approaches", "procedures", "barriers"],
        },
        {
          index: 4,
          id: "measurements",
          label: "Measurements and weight",
          description: "Record dated measurements and review calculated BMI.",
          fields: ["height", "weight"],
        },
        {
          index: 5,
          id: "reproductive_product_safety",
          label: "Reproductive and product safety",
          description:
            "Record applicable reproductive context and route product-specific questions for review.",
          fields: [
            "treatment_product_class",
            "pregnancy_status",
            "pregnancy_plans",
            "breastfeeding_status",
            "contraception_context",
            "product_safety_review",
          ],
        },
        {
          index: 6,
          id: "nutrition_support",
          label: "Nutrition and sensitive support",
          description:
            "Capture food patterns and support context with explicit privacy and decline states.",
          fields: ["nutrition_pattern"],
        },
        {
          index: 7,
          id: "activity_sleep_barriers",
          label: "Activity, sleep, and barriers",
          description:
            "Record function, sleep, access, and support needs without a readiness score.",
          fields: ["activity_capacity"],
        },
        {
          index: 8,
          id: "records_consent_admin",
          label: "Records, consent, and admin",
          description:
            "Track evidence sources, consent context, privacy, coverage, and disclosures separately.",
          fields: ["outside_records_state"],
        },
        {
          index: 9,
          id: "confirmation_clinician_review",
          label: "Confirmation and clinician review",
          description:
            "Confirm what was recorded and make unresolved ownership visible without implying clinical approval.",
          fields: ["patient_confirmation_state"],
        },
        {
          index: 10,
          id: "follow_up_change",
          label: "Follow-up and change",
          description:
            "Capture longitudinal change, response, access, support, and patient questions.",
          fields: ["follow_up_context"],
        },
      ],
    },
    capabilities: {
      intake_write: true,
      handoff_request: true,
      handoff_respond: false,
      tasks_write: false,
      observations_write: false,
    },
  } as NurseWorkspace,
  rooms: { rooms: [{ id: 19, site_id: 15, code: "EXAM-1" }] },
}));

vi.mock("../src/shared/ui", () => ({
  useResource: (path: string) => ({
    data: path.includes("nurse_workspace")
      ? fixtures.workspace
      : fixtures.rooms,
    error: "",
    refresh: vi.fn(),
  }),
}));

vi.mock("../src/features/clinic/Workspace", () => ({
  useClinic: () => ({ membership_id: 7 }),
}));

function renderWorkspace(roomId: number | null, visitModality = "in_person") {
  return renderToStaticMarkup(
    <NurseEncounterWorkspace
      patient={{ id: 121, display_name: "Synthetic Patient" } as Patient}
      encounter={
        {
          id: 37,
          patient_id: 121,
          site_id: 15,
          room_id: roomId,
          status: "open",
          visit_modality: visitModality,
        } as unknown as EncounterDetail
      }
      observations={[]}
      careSummary={null}
    />,
  );
}

describe("NurseEncounterWorkspace", () => {
  it("uses server chunks, exposes normal answers directly, and surfaces room state", () => {
    const html = renderWorkspace(null);

    expect(html).toContain("Guided intake · staff assisted");
    expect(html).toContain("Today’s visit");
    expect(html).toContain("Measurements and weight");
    expect(html).toContain("What brings you in?");
    expect(html).toContain("What would you like help with?");
    expect(html).toContain("Record an exception");
    expect(html).not.toContain("What brings you in? status");
    expect(html).toContain("Room is still required.");
  });

  it("renders the server-provided M7-M12 group definitions", () => {
    const html = renderWorkspace(19);

    expect(html).toContain("Reproductive and product safety");
    expect(html).toContain("Nutrition and sensitive support");
    expect(html).toContain("Confirmation and clinician review");
    expect(html).toContain("Follow-up and change");
  });

  it("shows a recorded room when the encounter already has one", () => {
    expect(renderWorkspace(19)).toContain("Room recorded for this encounter.");
  });

  it("does not require a physical room for a video encounter", () => {
    const html = renderWorkspace(null, "video");
    expect(html).not.toContain("Room is still required.");
    expect(html).not.toContain("Record the room first.");
    expect(html).toContain("Group 1 of 11");
  });

  it("makes a superseded handoff visible without discarding its ownership", () => {
    const originalIntake = fixtures.workspace.intake;
    const originalHandoff = fixtures.workspace.handoff;
    fixtures.workspace.intake = {
      id: 22,
      version: 2,
      status: "incomplete",
    } as NurseWorkspace["intake"];
    fixtures.workspace.handoff = {
      id: 7,
      intake_revision_id: 21,
      state: "pending",
      requested_by_membership_id: 7,
    } as NurseWorkspace["handoff"];
    try {
      const html = renderWorkspace(19);
      expect(html).toContain(
        "Intake changed after this handoff was requested.",
      );
      expect(html).toContain("Cancel handoff");
      expect(html).toContain("Bound to intake revision");
    } finally {
      fixtures.workspace.intake = originalIntake;
      fixtures.workspace.handoff = originalHandoff;
    }
  });
});
