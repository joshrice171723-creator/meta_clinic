import type { PatientCareSummary } from "../../api/contracts";

type Allergy = PatientCareSummary["allergies"]["items"][number];
type Medication = PatientCareSummary["medications"]["items"][number];
type CareNeed = PatientCareSummary["care_needs"]["items"][number];
type Condition = PatientCareSummary["current_care_conditions"]["items"][number];
type Precaution = PatientCareSummary["precautions"]["items"][number];

const recordedAt = "2026-08-31T09:30:00-05:00";
const allergy = (id: number, allergen: string, reaction: string): Allergy => ({
  id,
  allergen,
  reaction,
  category: "medication",
  criticality: null,
  severity: null,
  clinical_status: "active",
  verification_status: "confirmed",
  onset_at: null,
  recorded_at: recordedAt,
  last_reviewed_at: recordedAt,
  lock_version: 0,
});
const medication = (id: number, name: string): Medication => ({
  id,
  medication: name,
  dose: "10 mg",
  route: "By mouth",
  frequency: "Daily",
  purpose: null,
  status: "active",
  information_source: "patient",
  effective_from: recordedAt,
  effective_until: null,
  asserted_at: recordedAt,
  recorded_at: recordedAt,
  last_reconciled_at: recordedAt,
  lock_version: 0,
});
const careNeed = (id: number, description: string): CareNeed => ({
  id,
  category: "mobility",
  code: "wheelchair_access",
  description,
  instructions: "Use the accessible entrance",
  status: "active",
  effective_from: recordedAt,
  effective_until: null,
  recorded_at: recordedAt,
  last_reviewed_at: recordedAt,
  lock_version: 0,
});
const condition = (id: number, name: string): Condition => ({
  id,
  condition: name,
  clinical_status: "active",
  verification_status: "confirmed",
  instruction: "Review the charted care instruction",
  onset_at: null,
  recorded_at: recordedAt,
  last_reviewed_at: recordedAt,
  lock_version: 0,
});
const precaution = (id: number): Precaution => ({
  id,
  type: "droplet",
  evidence_status: "suspected",
  status: "active",
  instructions: "Use the current droplet precautions",
  recorded_at: recordedAt,
  last_reassessed_at: recordedAt,
  lock_version: 0,
});

function summary({
  allergies = [],
  medications = [],
  interpreter = false,
  careNeeds = [],
  conditions = [],
  precautions = [],
  reviewNeededTopics = [],
}: {
  allergies?: Allergy[];
  medications?: Medication[];
  interpreter?: boolean;
  careNeeds?: CareNeed[];
  conditions?: Condition[];
  precautions?: Precaution[];
  reviewNeededTopics?: ("allergies" | "medications" | "care_needs")[];
} = {}): PatientCareSummary {
  const review = (topic: "allergies" | "medications" | "care_needs") =>
    reviewNeededTopics.includes(topic)
      ? ({ state: "not_reviewed" } as const)
      : ({
          state:
            topic === "allergies"
              ? allergies.length
                ? "current_list_confirmed"
                : "none_reported"
              : topic === "medications"
                ? medications.length
                  ? "current_list_confirmed"
                  : "none_reported"
                : careNeeds.length
                  ? "current_list_confirmed"
                  : "none_reported",
          information_source: "patient",
          reviewed_at: recordedAt,
        } as const);
  const collectionState = (
    topic: "allergies" | "medications" | "care_needs",
  ) =>
    reviewNeededTopics.includes(topic)
      ? "not_recorded"
      : topic === "allergies"
        ? allergies.length
          ? "known"
          : "none_reported"
        : topic === "medications"
          ? medications.length
            ? "known"
            : "none_reported"
          : careNeeds.length
            ? "known"
            : "none_reported";
  return {
    schema_version: "patient-care-summary-v1",
    patient_id: 0,
    encounter_id: 0,
    as_of: "2026-08-31T10:20:00-05:00",
    allergies: {
      state: collectionState("allergies"),
      active_count: allergies.length,
      items: allergies,
    },
    medications: {
      state: collectionState("medications"),
      active_count: medications.length,
      items: medications,
    },
    communication: {
      state: interpreter ? "known" : "none_reported",
      primary_language: interpreter ? "Spanish" : "English",
      interpreter_required: interpreter,
      needs: [],
    },
    care_needs: {
      state: collectionState("care_needs"),
      active_count: careNeeds.length,
      items: careNeeds,
    },
    current_care_conditions: {
      state: conditions.length ? "known" : "not_recorded",
      active_count: conditions.length,
      items: conditions,
    },
    precautions: {
      state: precautions.length ? "known" : "none_active",
      active_count: precautions.length,
      items: precautions,
    },
    reviews: {
      allergies: review("allergies"),
      medications: review("medications"),
      care_needs: review("care_needs"),
    },
    review_needed: reviewNeededTopics.length > 0,
    review_needed_topics: reviewNeededTopics,
  };
}

// Wholly synthetic board-only summaries. They are never mapped to API record IDs.
export const EXAMPLE_CARE_SUMMARIES: Readonly<
  Record<string, PatientCareSummary>
> = {
  "EX-001": summary(),
  "EX-002": summary({
    reviewNeededTopics: ["allergies", "medications", "care_needs"],
  }),
  "EX-003": summary({
    allergies: [allergy(1, "Amoxicillin", "Localized rash")],
    medications: [medication(2, "Lisinopril")],
    interpreter: true,
  }),
  "EX-004": summary(),
  "EX-005": summary({
    allergies: [allergy(3, "Medical adhesive", "Skin irritation")],
    precautions: [precaution(4)],
  }),
  "EX-006": summary({
    medications: [medication(5, "Metformin")],
    careNeeds: [careNeed(6, "Wheelchair access requested")],
    conditions: [condition(7, "Hypertension")],
  }),
};
