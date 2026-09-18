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

function renderWorkspace(roomId: number | null) {
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
          visit_modality: "in_person",
        } as unknown as EncounterDetail
      }
      observations={[]}
      careSummary={null}
    />,
  );
}

describe("NurseEncounterWorkspace", () => {
  it("uses server chunks, filters the active group, and surfaces room state", () => {
    const html = renderWorkspace(null);

    expect(html).toContain("Guided intake · staff assisted");
    expect(html).toContain("Today’s visit");
    expect(html).toContain("Measurements and weight");
    expect(html).toContain("What brings you in? status");
    expect(html).toContain("What would you like help with? status");
    expect(html).not.toContain("Current medicines and supplements status");
    expect(html).toContain("Room is still required.");
  });

  it("shows a recorded room when the encounter already has one", () => {
    expect(renderWorkspace(19)).toContain("Room recorded for this encounter.");
  });
});
