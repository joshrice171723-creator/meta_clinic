import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  EncounterDetail,
  NurseWorkspace,
  Patient,
} from "../src/api/contracts";
import {
  allIntakeChunksConfirmed,
  intakeGroupProgressLabel,
  intakeRevisionContinuity,
  NurseEncounterWorkspace,
} from "../src/features/clinic/NurseEncounterWorkspace";

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

    expect(html).toContain("Rooming &amp; intake");
    expect(html).toContain("Today’s visit");
    expect(html).toContain('id="intake-group-today_visit"');
    expect(html).toContain("Visit reason &amp; goals");
    expect(html).toContain("Symptoms &amp; changes");
    expect(html).toContain("What brings you in?");
    expect(html).toContain("What would you like help with?");
    expect(html).toContain("Choose a response");
    expect(html).not.toContain("What brings you in? status");
    expect(html).toContain("Room is still required.");
  });

  it("keeps later save stages hidden until their prerequisite is recorded", () => {
    const html = renderWorkspace(19);

    expect(
      allIntakeChunksConfirmed(
        fixtures.workspace.questionnaire_form!.chunks,
        [],
      ),
    ).toBe(false);
    expect(
      allIntakeChunksConfirmed(
        fixtures.workspace.questionnaire_form!.chunks,
        fixtures.workspace.questionnaire_form!.chunks.map(
          (chunk) => chunk.index,
        ),
      ),
    ).toBe(true);
    expect(html).toContain("Save &amp; continue");
    expect(html).not.toContain("Intake revision");
    expect(html).not.toContain("Request clinician handoff");
    expect(html).not.toContain("No handoff has been requested.");
  });

  it("uses the server group count in compact section navigation", () => {
    const html = renderWorkspace(19);

    expect(html).toContain("0 of 11 groups saved");
    expect(html).toContain("Save each group to unlock the next.");
    expect(html).toMatch(
      /<button(?=[^>]*aria-expanded="false")(?=[^>]*id="intake-group-patient_coordination")[^>]*>/,
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).not.toContain("Current medicines and supplements</label>");
    expect(html).toContain("Today’s visit");
    expect(html).not.toContain('aria-label="Intake question groups"');
  });

  it("shows a recorded room when the encounter already has one", () => {
    expect(renderWorkspace(19)).toContain("Room recorded for this encounter.");
  });

  it("keeps assigned follow-up separate from ordinary intake data entry", () => {
    const originalReviewItems = fixtures.workspace.review_items;
    const originalTasks = fixtures.workspace.tasks;
    const originalCapabilities = fixtures.workspace.capabilities;
    fixtures.workspace.review_items = [
      {
        question_id: "disclosures",
        label: "Required disclosures",
        category: "evidence",
        task_id: 7,
        state: "open",
        pool_code: "clinical",
        assigned_to_membership_id: null,
        reason:
          "Confirm the source, date and availability of the referenced evidence.",
        next_action:
          "Claim the review task, clarify the response, and record the outcome.",
        source_revision_version: 21,
        recorded_at: "2026-09-21T00:00:00Z",
        resolution_code: null,
      },
      {
        question_id: "prior_treatments",
        label: "Previous treatments and medicines",
        category: "support",
        task_id: 8,
        state: "open",
        pool_code: "front_desk",
        assigned_to_membership_id: null,
        reason: "A support preference or barrier needs coordination.",
        next_action:
          "Claim the support task and coordinate the requested help.",
        source_revision_version: 21,
        recorded_at: "2026-09-21T00:00:00Z",
        resolution_code: null,
      },
      {
        question_id: "patient_confirmation",
        label: "Patient confirmation of recorded answers",
        category: "evidence",
        task_id: 9,
        state: "open",
        pool_code: "clinical",
        assigned_to_membership_id: null,
        reason:
          "Confirm the source, date and availability of the referenced evidence.",
        next_action:
          "Claim the review task, clarify the response, and record the outcome.",
        source_revision_version: 21,
        recorded_at: "2026-09-21T00:00:00Z",
        resolution_code: null,
      },
    ];
    fixtures.workspace.tasks = [
      { id: 7, task_kind: "intake", state: "open", pool_code: "clinical" },
      { id: 8, task_kind: "intake", state: "open", pool_code: "front_desk" },
      { id: 9, task_kind: "intake", state: "open", pool_code: "clinical" },
    ] as NurseWorkspace["tasks"];
    fixtures.workspace.capabilities = {
      ...fixtures.workspace.capabilities,
      tasks_write: true,
    };
    try {
      const html = renderWorkspace(19);
      expect(html).not.toContain("Intake review queue");
      expect(html).not.toContain("Support coordination");
      expect(html).toContain("Follow-up work (3)");
      expect(html).toContain("Required disclosures");
      expect(html).toContain('id="preparation-panel-followup"');
      expect(html).toContain('hidden=""');
      expect(html).not.toContain("Finish intake");
      expect(html).not.toContain("Claim the review task");
    } finally {
      fixtures.workspace.review_items = originalReviewItems;
      fixtures.workspace.tasks = originalTasks;
      fixtures.workspace.capabilities = originalCapabilities;
    }
  });

  it("does not require a physical room for a video encounter", () => {
    const html = renderWorkspace(null, "video");
    expect(html).not.toContain("Room is still required.");
    expect(html).not.toContain("Record the room first.");
    expect(html).toContain("0 of 11 groups saved");
  });

  it("makes a superseded handoff visible without discarding its ownership", () => {
    const originalIntake = fixtures.workspace.intake;
    const originalHandoff = fixtures.workspace.handoff;
    fixtures.workspace.intake = {
      id: 22,
      patient_id: 121,
      encounter_id: 37,
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

  it.each(["cancelled", "rejected", "completed"] as const)(
    "offers a new review after a %s handoff while retaining its revision reference",
    (state) => {
      const originalHandoff = fixtures.workspace.handoff;
      fixtures.workspace.handoff = {
        id: 7,
        intake_revision_id: 21,
        state,
        requested_by_membership_id: 7,
      } as NurseWorkspace["handoff"];
      try {
        const html = renderWorkspace(19);
        expect(html).toContain("Bound to intake revision");
        expect(html).toContain("Request clinician handoff");
        expect(html).not.toContain("Cancel handoff");
      } finally {
        fixtures.workspace.handoff = originalHandoff;
      }
    },
  );
});

describe("intake revision continuity", () => {
  const revision = (version: number, encounterId = 37) =>
    ({
      id: 20 + version,
      patient_id: 121,
      encounter_id: encounterId,
      version,
      status: "incomplete",
    }) as NonNullable<NurseWorkspace["intake"]>;

  const state = (
    overrides: Partial<Parameters<typeof intakeRevisionContinuity>[0]> = {},
  ) =>
    intakeRevisionContinuity({
      received: revision(1),
      saved: null,
      patientId: 121,
      encounterId: 37,
      editedVersion: 1,
      dirty: false,
      ...overrides,
    });

  it("retains the edited version when a newer snapshot arrives with unsaved answers", () => {
    const result = state({ received: revision(2), dirty: true });
    expect(result.expectedVersion).toBe(1);
    expect(result.intake?.version).toBe(2);
    expect(result.conflict).toBe(true);
  });

  it("detects a first saved revision arriving while a new draft is being edited", () => {
    const result = state({ editedVersion: null, dirty: true });
    expect(result.expectedVersion).toBe(0);
    expect(result.conflict).toBe(true);
  });

  it("uses the save receipt while the refresh still contains the superseded intake", () => {
    const saved = revision(2);
    const result = state({ saved, editedVersion: 2 });
    expect(result.intake).toBe(saved);
    expect(result.expectedVersion).toBe(2);
    expect(result.conflict).toBe(false);
    expect(result.intake?.id).not.toBe(revision(1).id);
  });

  it("allows a newer server revision to replace an older save receipt", () => {
    const received = revision(3);
    expect(state({ received, saved: revision(2) }).intake).toBe(received);
  });

  it("excludes receipts from the previous chart and wrong-patient snapshots", () => {
    expect(state({ saved: revision(5, 38) }).intake?.version).toBe(1);
    const received = { ...revision(6), patient_id: 122 };
    expect(state({ received, saved: revision(5, 38) }).intake).toBeNull();
  });

  it("permits clean hydration and preserves version zero for a new intake", () => {
    expect(state({ received: revision(2) }).conflict).toBe(false);
    const result = state({ received: null, editedVersion: null, dirty: true });
    expect(result.expectedVersion).toBe(0);
    expect(result.conflict).toBe(false);
  });
});

it.each([
  [0, 0, "0 of 0 groups"],
  [0, 1, "0 of 1 group"],
  [1, 1, "1 of 1 group"],
  [3, 11, "3 of 11 groups"],
])("keeps progress spacing for %s saved of %s", (saved, total, prefix) => {
  expect(intakeGroupProgressLabel(Number(saved), Number(total))).toBe(
    `${prefix} saved · Save each group to unlock the next.`,
  );
});
