export type HistoryKind = "allergies" | "medications" | "conditions";
export type ReviewTopic = HistoryKind | "care_needs";

export type HistoryRecordBase = {
  id: number;
  patient_id: number;
  recorded_at: string;
  last_reviewed_at: string | null;
  lock_version: number;
};

export type AllergyRecord = HistoryRecordBase & {
  allergen_name: string;
  reaction: string | null;
  category: string;
  clinical_status: string;
  verification_status: string;
  criticality: string;
  severity: string;
  onset_at: string | null;
};

export type MedicationRecord = HistoryRecordBase & {
  medication_name: string;
  dose_text: string | null;
  route_text: string | null;
  frequency_text: string | null;
  purpose: string | null;
  status: string;
  information_source: string;
  effective_from: string | null;
  effective_until: string | null;
  asserted_at: string | null;
};

export type ConditionRecord = HistoryRecordBase & {
  condition_name: string;
  care_instruction: string | null;
  clinical_status: string;
  verification_status: string;
  affects_current_care: boolean;
  onset_at: string | null;
  resolved_at: string | null;
};

export type HistoryRecord = AllergyRecord | MedicationRecord | ConditionRecord;

export type HistoryReview = {
  id: number;
  patient_id: number;
  encounter_id: number;
  topic: ReviewTopic;
  outcome: string;
  information_source: string;
  notes: string | null;
  reviewed_at: string;
};

export type ReportedIntakeConditions = {
  state: "available" | "not_recorded" | "restricted";
  source: { encounter_id: number; revision_id: number; version: number; recorded_at: string; recorder: string | null } | null;
  questions: Array<{ id: string; label: string; answer_state: string; source: string | null;
    entries: Array<{ name: string; kind?: string; current_status?: string; certainty?: string }> }>;
};

export type ClinicalHistoryResponse = {
  schema_version: "patient-clinical-history-v1";
  patient_id: number;
  encounter_id: number | null;
  can_write: boolean;
  allergies: AllergyRecord[];
  medications: MedicationRecord[];
  conditions: ConditionRecord[];
  reviews: Partial<Record<ReviewTopic, HistoryReview>>;
  reported_intake_conditions?: ReportedIntakeConditions;
};

export const HISTORY_LABELS: Record<HistoryKind, string> = {
  allergies: "Allergies",
  medications: "Medications",
  conditions: "Conditions",
};

export function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function recordTitle(kind: HistoryKind, record: HistoryRecord) {
  if (kind === "allergies") return (record as AllergyRecord).allergen_name;
  if (kind === "medications")
    return (record as MedicationRecord).medication_name;
  return (record as ConditionRecord).condition_name;
}

export function recordDetail(kind: HistoryKind, record: HistoryRecord) {
  if (kind === "allergies")
    return (record as AllergyRecord).reaction || "Reaction not recorded";
  if (kind === "medications") {
    const medication = record as MedicationRecord;
    return (
      [
        medication.dose_text,
        medication.route_text,
        medication.frequency_text,
        medication.purpose,
      ]
        .filter(Boolean)
        .join(" · ") || "Directions not recorded"
    );
  }
  return (
    (record as ConditionRecord).care_instruction ||
    "Care instruction not recorded"
  );
}
