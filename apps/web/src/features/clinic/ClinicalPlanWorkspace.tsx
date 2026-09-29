import {
  Alert,
  AlertTitle,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import type {
  AssessmentRevision,
  CareGoalRevision,
  CarePlanRevision,
  ClinicalPlanWorkspace as ClinicalPlanWorkspaceContract,
  ClinicalRevisionBase,
  EncounterDetail,
  EncounterDiagnosisRevision,
  ImmunizationRevision,
  MedicationRequestRevision,
  Patient,
  ProcedureRevision,
  ServiceRequestRevision,
} from "../../api/contracts";
import { api, ApiError } from "../../api/client";
import { LoadState, useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";
import { useClinicNavigation } from "./clinicNavigation";
import { ClinicalPlanClosurePanel } from "./ClinicalPlanClosurePanel";
import { PrescriptionFulfillmentPanel } from "./PrescriptionFulfillmentPanel";

type ResourceKind = keyof ClinicalPlanWorkspaceContract["records"];
type ClinicalRecord =
  | MedicationRequestRevision
  | ServiceRequestRevision
  | EncounterDiagnosisRevision
  | ProcedureRevision
  | CarePlanRevision
  | CareGoalRevision
  | ImmunizationRevision
  | AssessmentRevision;
type FormState = Record<string, string>;
type FieldDefinition = {
  name: string;
  label: string;
  required?: boolean;
  multiline?: boolean;
  type?: "text" | "date" | "datetime-local";
  options?: readonly string[];
};
type PendingAttempt = {
  kind: ResourceKind;
  path: string;
  method: "POST" | "PATCH";
  body: Record<string, unknown>;
  seriesId: string | null;
  expectedVersion: number | null;
};

export type ClinicalPlanTaskTarget = {
  kind: "medication_requests" | "service_requests";
  seriesId: string;
  taskId: number;
};

export function clinicalPlanTaskTarget(
  search = typeof window === "undefined" ? "" : window.location.search,
): ClinicalPlanTaskTarget | null {
  const params = new URLSearchParams(search);
  const sourceKind = params.get("order_kind");
  const seriesId = params.get("order_series_id")?.trim();
  const taskId = Number(params.get("task_id"));
  const kind =
    sourceKind === "medication_request"
      ? "medication_requests"
      : sourceKind === "service_request"
        ? "service_requests"
        : null;
  if (!kind || !seriesId || !Number.isSafeInteger(taskId) || taskId <= 0)
    return null;
  return { kind, seriesId, taskId };
}

const RESOURCE_META: Record<
  ResourceKind,
  {
    label: string;
    singular: string;
    root: string;
    initial: FormState;
    statuses: readonly string[];
    fields: readonly FieldDefinition[];
  }
> = {
  medication_requests: {
    label: "Medications",
    singular: "medication request",
    root: "medication_request",
    initial: {
      status: "draft",
      intent: "order",
      inventory_product_id: "",
      medication_name: "",
      dose_value: "",
      dose_unit_code: "",
      route_code: "",
      frequency_text: "",
      quantity_text: "",
      fulfillment_route: "",
      medication_strength: "",
      medication_form: "",
      medication_code_system: "",
      medication_code: "",
      medication_code_version: "",
      catalog_source: "",
      pharmacy_name: "",
      pharmacy_location: "",
      pharmacy_identifier: "",
      prescribed_quantity: "",
      quantity_unit: "",
      refills: "",
      starts_on: "",
      duration_text: "",
      scheduled_for: "",
      reason_text: "",
      instructions: "",
      completion_exception: "",
    },
    statuses: [
      "draft",
      "authorized",
      "on_hold",
      "completed",
      "cancelled",
      "entered_in_error",
    ],
    fields: [
      { name: "medication_name", label: "Medication name", required: true },
      {
        name: "intent",
        label: "Intent",
        options: ["proposal", "plan", "order"],
      },
      { name: "dose_value", label: "Dose amount" },
      { name: "dose_unit_code", label: "Dose unit", options: [] },
      { name: "route_code", label: "Route", options: [] },
      { name: "frequency_text", label: "Frequency" },
      { name: "quantity_text", label: "Quantity" },
      { name: "scheduled_for", label: "Scheduled for", type: "datetime-local" },
      { name: "reason_text", label: "Reason / indication", multiline: true },
      { name: "instructions", label: "Instructions", multiline: true },
      {
        name: "fulfillment_route",
        label: "Fulfillment",
        options: ["outside_pharmacy", "take_home", "administration"],
      },
      { name: "medication_strength", label: "Strength" },
      { name: "medication_form", label: "Form" },
      { name: "medication_code_system", label: "Medication code system" },
      { name: "medication_code", label: "Medication code" },
      { name: "medication_code_version", label: "Terminology version" },
      { name: "catalog_source", label: "Medication source" },
      { name: "prescribed_quantity", label: "Prescribed quantity" },
      { name: "quantity_unit", label: "Quantity unit" },
      { name: "refills", label: "Refills" },
      { name: "starts_on", label: "Start date, when applicable", type: "date" },
      { name: "duration_text", label: "Duration, when applicable" },
      { name: "pharmacy_name", label: "Pharmacy name" },
      { name: "pharmacy_location", label: "Pharmacy location" },
      {
        name: "pharmacy_identifier",
        label: "Verified pharmacy identifier, if available",
      },
    ],
  },
  service_requests: {
    label: "Orders & referrals",
    singular: "service request",
    root: "service_request",
    initial: {
      status: "draft",
      request_kind: "referral",
      intent: "order",
      priority: "routine",
      requested_display: "",
      requested_code_system: "",
      requested_code: "",
      destination: "",
      reason_text: "",
      due_at: "",
      completion_exception: "",
    },
    statuses: [
      "draft",
      "active",
      "on_hold",
      "completed",
      "cancelled",
      "entered_in_error",
    ],
    fields: [
      {
        name: "request_kind",
        label: "Request type",
        options: [
          "lab",
          "imaging",
          "procedure",
          "referral",
          "therapy",
          "other",
        ],
      },
      { name: "requested_display", label: "Requested service", required: true },
      {
        name: "intent",
        label: "Intent",
        options: ["proposal", "plan", "order"],
      },
      {
        name: "priority",
        label: "Recorded priority",
        options: ["routine", "urgent", "asap", "stat"],
      },
      { name: "destination", label: "Destination" },
      { name: "reason_text", label: "Reason", multiline: true },
      { name: "requested_code_system", label: "Code system" },
      { name: "requested_code", label: "Code" },
      { name: "due_at", label: "Due", type: "datetime-local" },
    ],
  },
  diagnoses: {
    label: "Diagnoses",
    singular: "encounter diagnosis",
    root: "diagnosis",
    initial: {
      status: "draft",
      classification: "primary",
      diagnosis_display: "",
      code_system: "",
      diagnosis_code: "",
      clinical_note: "",
    },
    statuses: [
      "draft",
      "provisional",
      "confirmed",
      "refuted",
      "resolved",
      "entered_in_error",
    ],
    fields: [
      { name: "diagnosis_display", label: "Diagnosis", required: true },
      {
        name: "classification",
        label: "Classification",
        options: ["primary", "secondary", "differential", "historical"],
      },
      { name: "code_system", label: "Code system" },
      { name: "diagnosis_code", label: "Code" },
      { name: "clinical_note", label: "Clinical note", multiline: true },
    ],
  },
  procedures: {
    label: "Procedures",
    singular: "procedure outcome",
    root: "procedure",
    initial: {
      status: "planned",
      procedure_display: "",
      code_system: "",
      procedure_code: "",
      performed_at: "",
      outcome_text: "",
      complication_state: "not_assessed",
      complication_text: "",
      service_request_revision_id: "",
    },
    statuses: [
      "planned",
      "in_progress",
      "completed",
      "not_done",
      "entered_in_error",
    ],
    fields: [
      { name: "procedure_display", label: "Procedure", required: true },
      { name: "code_system", label: "Code system" },
      { name: "procedure_code", label: "Code" },
      { name: "performed_at", label: "Performed at", type: "datetime-local" },
      { name: "outcome_text", label: "Outcome", multiline: true },
      {
        name: "complication_state",
        label: "Complications",
        options: [
          "not_assessed",
          "none_reported",
          "known",
          "unknown",
          "unable_to_obtain",
        ],
      },
      {
        name: "complication_text",
        label: "Complication details",
        multiline: true,
      },
    ],
  },
  care_plans: {
    label: "Care plans",
    singular: "care plan",
    root: "care_plan",
    initial: {
      status: "draft",
      title: "",
      description: "",
      starts_on: "",
      ends_on: "",
    },
    statuses: [
      "draft",
      "active",
      "on_hold",
      "completed",
      "cancelled",
      "entered_in_error",
    ],
    fields: [
      { name: "title", label: "Plan title", required: true },
      { name: "description", label: "Plan details", multiline: true },
      { name: "starts_on", label: "Starts", type: "date" },
      { name: "ends_on", label: "Review or end date", type: "date" },
    ],
  },
  care_goals: {
    label: "Goals",
    singular: "care goal",
    root: "care_goal",
    initial: {
      status: "proposed",
      care_plan_revision_id: "",
      description: "",
      outcome_text: "",
      outcome_source: "",
      outcome_recorded_at: "",
      target_on: "",
    },
    statuses: [
      "proposed",
      "active",
      "achieved",
      "not_achieved",
      "cancelled",
      "entered_in_error",
    ],
    fields: [
      { name: "description", label: "Goal", required: true, multiline: true },
      { name: "target_on", label: "Target date", type: "date" },
      { name: "outcome_text", label: "Outcome", multiline: true },
      {
        name: "outcome_source",
        label: "Outcome source",
        options: [
          "patient_reported",
          "clinician_observed",
          "proxy_reported",
          "imported",
          "unknown",
        ],
      },
      {
        name: "outcome_recorded_at",
        label: "Outcome reported or observed at",
        type: "datetime-local",
      },
    ],
  },
  immunizations: {
    label: "Immunizations",
    singular: "immunization",
    root: "immunization",
    initial: {
      status: "planned",
      vaccine_name: "",
      cvx_code: "",
      manufacturer: "",
      manufacturer_mvx_code: "",
      lot_number: "",
      lot_expiration_date: "",
      dose_text: "",
      route_text: "",
      administration_site_text: "",
      administered_at: "",
      occurrence_source: "patient_reported",
      refusal_reason: "",
      source_document_id: "",
      medication_administration_id: "",
      vis_edition_date: "",
      vis_given_date: "",
    },
    statuses: ["planned", "completed", "not_done", "entered_in_error"],
    fields: [
      { name: "vaccine_name", label: "Vaccine", required: true },
      { name: "cvx_code", label: "CVX code" },
      { name: "manufacturer", label: "Manufacturer name" },
      { name: "manufacturer_mvx_code", label: "MVX code (optional)" },
      { name: "lot_number", label: "Lot number" },
      { name: "lot_expiration_date", label: "Lot expiration", type: "date" },
      { name: "dose_text", label: "Dose" },
      { name: "route_text", label: "Route" },
      { name: "administration_site_text", label: "Administration site" },
      {
        name: "administered_at",
        label: "Administered at",
        type: "datetime-local",
      },
      { name: "vis_edition_date", label: "VIS edition date", type: "date" },
      { name: "vis_given_date", label: "VIS date given", type: "date" },
      {
        name: "occurrence_source",
        label: "Information source",
        options: [
          "administered_here",
          "patient_reported",
          "external_record",
          "registry",
        ],
      },
      { name: "refusal_reason", label: "Not-given reason", multiline: true },
    ],
  },
  assessments: {
    label: "Assessments",
    singular: "assessment",
    root: "assessment",
    initial: {
      status: "in_progress",
      category: "",
      instrument_name: "",
      instrument_version: "",
      score_value: "",
      score_source: "",
      score_recorded_at: "",
      interpretation: "",
      response_summary: "",
      follow_up_plan: "",
      assessed_at: "",
      response_source: "",
      assessment_state: "not_assessed",
      reviewer_membership_id: "",
      reviewed_at: "",
    },
    statuses: ["in_progress", "completed", "entered_in_error"],
    fields: [
      {
        name: "category",
        label: "Assessment category",
        required: true,
        options: [],
      },
      { name: "instrument_name", label: "Instrument name", required: true },
      { name: "instrument_version", label: "Instrument version" },
      { name: "score_value", label: "Recorded score" },
      {
        name: "score_source",
        label: "Score source",
        options: ["calculated", "clinician_entered", "imported", "unknown"],
      },
      {
        name: "score_recorded_at",
        label: "Score recorded at",
        type: "datetime-local",
      },
      {
        name: "interpretation",
        label: "Recorded interpretation",
        multiline: true,
      },
      {
        name: "response_summary",
        label: "Responses and observations",
        multiline: true,
      },
      {
        name: "response_source",
        label: "Response source",
        options: [
          "patient_reported",
          "clinician_observed",
          "proxy_reported",
          "imported",
          "unknown",
        ],
      },
      {
        name: "assessment_state",
        label: "Assessment state",
        options: ["not_assessed", "unknown", "assessed"],
      },
      { name: "reviewer_membership_id", label: "Reviewer membership ID" },
      { name: "reviewed_at", label: "Reviewed at", type: "datetime-local" },
      { name: "follow_up_plan", label: "Follow-up plan", multiline: true },
      { name: "assessed_at", label: "Assessed at", type: "datetime-local" },
    ],
  },
};

export { RESOURCE_META as clinicalPlanResourceMeta };

function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function recordTitle(kind: ResourceKind, record: ClinicalRecord) {
  if (kind === "medication_requests")
    return (record as MedicationRequestRevision).medication_name;
  if (kind === "service_requests")
    return (record as ServiceRequestRevision).requested_display;
  if (kind === "diagnoses")
    return (record as EncounterDiagnosisRevision).diagnosis_display;
  if (kind === "procedures")
    return (record as ProcedureRevision).procedure_display;
  if (kind === "care_plans") return (record as CarePlanRevision).title;
  if (kind === "care_goals") return (record as CareGoalRevision).description;
  if (kind === "immunizations")
    return (record as ImmunizationRevision).vaccine_name;
  return (record as AssessmentRevision).instrument_name;
}

function recordDetails(kind: ResourceKind, record: ClinicalRecord) {
  if (kind === "medication_requests") {
    const value = record as MedicationRequestRevision;
    return [
      value.dose_text,
      value.route_text,
      value.frequency_text,
      "Transmission unavailable",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (kind === "service_requests") {
    const value = record as ServiceRequestRevision;
    return `${humanize(value.request_kind)} · ${humanize(value.priority)}${value.destination ? ` · ${value.destination}` : ""}`;
  }
  if (kind === "diagnoses") {
    const value = record as EncounterDiagnosisRevision;
    return `${humanize(value.classification)}${value.diagnosis_code ? ` · ${value.diagnosis_code}` : ""}`;
  }
  if (kind === "procedures") {
    const value = record as ProcedureRevision;
    return `Complications: ${humanize(value.complication_state)}`;
  }
  if (kind === "care_plans") {
    const value = record as CarePlanRevision;
    return [
      value.starts_on && `Starts ${value.starts_on}`,
      value.ends_on && `Review ${value.ends_on}`,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (kind === "care_goals") {
    const value = record as CareGoalRevision;
    return value.target_on
      ? `Target ${value.target_on}`
      : "No target date recorded";
  }
  if (kind === "immunizations") {
    const value = record as ImmunizationRevision;
    return [
      humanize(value.occurrence_source),
      value.status === "not_done" && value.refusal_reason
        ? `Not given: ${value.refusal_reason}`
        : value.medication_administration_id
          ? "Clinic administration linked"
          : null,
      value.administered_at &&
        new Date(value.administered_at).toLocaleDateString(),
      value.manufacturer &&
        `${value.manufacturer}${value.manufacturer_mvx_code ? ` (${value.manufacturer_mvx_code})` : ""}`,
      value.lot_number && `Lot ${value.lot_number}`,
      value.lot_expiration_date && `Expires ${value.lot_expiration_date}`,
      value.vaccinator_label && `Given by ${value.vaccinator_label}`,
      value.administering_site_label && value.administering_site_label,
      value.vis_given_date &&
        `VIS ${value.vis_edition_date} given ${value.vis_given_date}`,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  const value = record as AssessmentRevision;
  return [
    humanize(value.category),
    value.score_value && `Score ${value.score_value}`,
    value.score_source && `Score source: ${humanize(value.score_source)}`,
    value.score_recorded_at &&
      `Score recorded ${new Date(value.score_recorded_at).toLocaleDateString()}`,
    value.assessed_at && new Date(value.assessed_at).toLocaleDateString(),
  ]
    .filter(Boolean)
    .join(" · ");
}

function recordForm(kind: ResourceKind, record: ClinicalRecord): FormState {
  const meta = RESOURCE_META[kind];
  const values = record as unknown as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(meta.initial).map((name) => {
      const raw = values[name];
      const value = raw == null ? "" : String(raw);
      return [name, name.endsWith("_at") && value ? value.slice(0, 16) : value];
    }),
  );
}

export function ClinicalPlanWorkspace({
  patient,
  encounter,
  onChanged,
}: {
  patient: Pick<Patient, "id" | "display_name">;
  encounter: EncounterDetail;
  onChanged?: () => void;
}) {
  const clinic = useClinic();
  const { registerBlocker } = useClinicNavigation();
  const base = `/api/clinic/patients/${patient.id}/encounters/${encounter.id}`;
  const workspace = useResource<ClinicalPlanWorkspaceContract>(
    `${base}/clinical_plan_workspace`,
    {
      retainDataOnRefresh: true,
    },
  );
  const reviewParams = new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search,
  );
  const requestedRevision = Number(
    reviewParams.get("medication_request_revision_id"),
  );
  const requestedAttempt = Number(reviewParams.get("prescription_attempt_id"));
  const reviewRevisionId =
    Number.isSafeInteger(requestedRevision) &&
    requestedRevision > 0 &&
    Number.isSafeInteger(requestedAttempt) &&
    requestedAttempt > 0
      ? requestedRevision
      : null;
  const reviewAttemptId = reviewRevisionId ? requestedAttempt : null;
  const attemptReview = useResource<{
    order_encounter_id: number;
    attempts: { id: number; outcome: string; submitted_at: string }[];
  }>(
    `/api/clinic/patients/${patient.id}/medication_requests/${reviewRevisionId}/events`,
    { enabled: reviewRevisionId !== null },
  );
  const [kind, setKind] = useState<ResourceKind>("medication_requests");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ClinicalRecord | null>(null);
  const [form, setForm] = useState<FormState>(
    RESOURCE_META.medication_requests.initial,
  );
  const [baseline, setBaseline] = useState<FormState>(
    RESOURCE_META.medication_requests.initial,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingAttempt, setPendingAttempt] = useState<PendingAttempt | null>(
    null,
  );
  const dirty = dialogOpen && JSON.stringify(form) !== JSON.stringify(baseline);
  const meta = RESOURCE_META[kind];
  const records = workspace.data?.records[kind] ?? [];
  const taskTarget = clinicalPlanTaskTarget();
  const taskRecord =
    taskTarget?.kind === kind
      ? records.find((record) => record.series_id === taskTarget.seriesId)
      : undefined;
  const carePlans = workspace.data?.records.care_plans ?? [];
  const serviceRequests = workspace.data?.records.service_requests ?? [];
  const immunizationAdminEvidenceRequired =
    kind === "immunizations" &&
    form.status === "completed" &&
    form.occurrence_source === "administered_here";
  const immunizationAdministrationEnabled =
    workspace.data?.immunization_administration_enabled === true;

  useEffect(
    () =>
      registerBlocker(() => {
        if (pendingAttempt)
          return "A clinical record outcome is unknown. Reconcile or retry it before leaving.";
        if (dirty)
          return "Unsaved clinical record changes will be lost. Leave this chart?";
        return null;
      }),
    [dirty, pendingAttempt, registerBlocker],
  );

  useEffect(() => {
    if (reviewRevisionId && kind !== "medication_requests")
      setKind("medication_requests");
  }, [kind, reviewRevisionId]);

  useEffect(() => {
    if (!workspace.data || !taskTarget) return;
    if (kind !== taskTarget.kind) {
      setKind(taskTarget.kind);
      return;
    }
    const timer = window.setTimeout(() => {
      const target = document.getElementById(
        `clinical-plan-record-${taskTarget.seriesId}`,
      );
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [kind, taskTarget?.kind, taskTarget?.seriesId, workspace.data]);

  const statusCounts = useMemo(
    () =>
      records.reduce<Record<string, number>>((counts, record) => {
        counts[record.status] = (counts[record.status] ?? 0) + 1;
        return counts;
      }, {}),
    [records],
  );

  function openCreate(nextKind = kind) {
    const initial = { ...RESOURCE_META[nextKind].initial };
    if (nextKind === "assessments" && workspace.data?.assessment_scope[0]) {
      initial.category = workspace.data.assessment_scope[0];
    }
    if (nextKind === "care_goals" && carePlans[0])
      initial.care_plan_revision_id = String(carePlans[0].id);
    if (nextKind === "procedures") {
      const linkedRequest = serviceRequests.find(
        (request) => request.request_kind === "procedure",
      );
      if (linkedRequest)
        initial.service_request_revision_id = String(linkedRequest.id);
    }
    setKind(nextKind);
    setEditing(null);
    setForm(initial);
    setBaseline(initial);
    setError("");
    setNotice("");
    setDialogOpen(true);
  }

  function openEdit(record: ClinicalRecord, overrides: FormState = {}) {
    const original = recordForm(kind, record);
    const initial = { ...original, ...overrides };
    setEditing(record);
    setForm(initial);
    setBaseline(original);
    setError("");
    setNotice("");
    setDialogOpen(true);
  }

  async function execute(attempt: PendingAttempt) {
    setBusy(true);
    setError("");
    try {
      const response = await api<Record<string, ClinicalRecord>>(attempt.path, {
        method: attempt.method,
        body: attempt.body,
      });
      const returned = response[RESOURCE_META[attempt.kind].root];
      if (
        !returned ||
        returned.patient_id !== patient.id ||
        returned.encounter_id !== encounter.id ||
        (attempt.seriesId !== null &&
          returned.series_id !== attempt.seriesId) ||
        (attempt.expectedVersion !== null &&
          returned.version_number !== attempt.expectedVersion + 1)
      ) {
        throw new Error(
          "The saved clinical record response did not match this patient and encounter.",
        );
      }
      setPendingAttempt(null);
      setDialogOpen(false);
      setEditing(null);
      setNotice(`${humanize(RESOURCE_META[attempt.kind].singular)} saved.`);
      workspace.refresh();
      onChanged?.();
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : `Unable to save this ${meta.singular}.`;
      setError(message);
      const outcomeUnknown =
        !(caught instanceof ApiError) ||
        caught.status === 408 ||
        caught.status >= 500 ||
        caught.code === "outcome_unconfirmed";
      if (outcomeUnknown) setPendingAttempt(attempt);
    } finally {
      setBusy(false);
    }
  }

  function reconcileCompletion(record: ClinicalRecord) {
    void execute({
      kind,
      path: `${base}/${kind}/${record.series_id}`,
      method: "PATCH",
      seriesId: record.series_id,
      expectedVersion: record.version_number,
      body: {
        [meta.root]: {
          reconcile_completion: true,
          expected_version: record.version_number,
          request_key: crypto.randomUUID(),
        },
      },
    });
  }

  function save() {
    const requiredMissing = meta.fields.some(
      (field) => field.required && !form[field.name]?.trim(),
    );
    if (requiredMissing) {
      setError("Complete the required fields before saving.");
      return;
    }
    if (
      kind === "assessments" &&
      form.status === "completed" &&
      (form.assessment_state !== "assessed" ||
        !form.assessed_at ||
        !form.response_summary?.trim() ||
        !form.response_source)
    ) {
      setError(
        "Mark the assessment as assessed and enter when it was completed, its response source, and its responses or observations.",
      );
      return;
    }
    if (
      kind === "assessments" &&
      Boolean(form.score_source) !== Boolean(form.score_recorded_at)
    ) {
      setError("Enter a score source and when it was recorded together.");
      return;
    }
    if (
      kind === "assessments" &&
      form.score_source &&
      !form.score_value?.trim()
    ) {
      setError("Enter the recorded score before recording its provenance.");
      return;
    }
    if (
      kind === "care_goals" &&
      Boolean(form.outcome_source) !== Boolean(form.outcome_recorded_at)
    ) {
      setError(
        "Enter an outcome source and when it was reported or observed together.",
      );
      return;
    }
    if (
      kind === "immunizations" &&
      form.status === "completed" &&
      form.occurrence_source === "administered_here" &&
      !immunizationAdministrationEnabled
    ) {
      setError(
        "Clinic-administered immunizations are not enabled for this clinic. Record a historical or external record instead.",
      );
      return;
    }
    if (
      kind === "immunizations" &&
      form.status === "completed" &&
      form.occurrence_source === "administered_here" &&
      !form.medication_administration_id
    ) {
      setError(
        "Choose the completed medication administration that used clinic stock.",
      );
      return;
    }
    if (kind === "immunizations" && form.status === "completed") {
      if (!form.administered_at) {
        setError("Enter when the vaccine was administered.");
        return;
      }
      if (!form.cvx_code?.trim()) {
        setError("Enter the CVX code for a completed immunization.");
        return;
      }
      if (
        form.occurrence_source === "administered_here" &&
        !form.lot_number?.trim()
      ) {
        setError("Enter the lot number used by the linked administration.");
        return;
      }
      if (
        form.occurrence_source === "administered_here" &&
        !form.manufacturer?.trim()
      ) {
        setError("Enter the vaccine manufacturer name.");
        return;
      }
      if (
        form.occurrence_source === "administered_here" &&
        !form.lot_expiration_date
      ) {
        setError("Choose an administration with recorded lot expiration.");
        return;
      }
      if (form.cvx_code && !/^\d{1,3}$/.test(form.cvx_code.trim())) {
        setError("CVX code must contain one to three digits.");
        return;
      }
      if (
        form.manufacturer_mvx_code &&
        !/^[A-Za-z0-9]{2,3}$/.test(form.manufacturer_mvx_code.trim())
      ) {
        setError("MVX code must contain two or three letters or digits.");
        return;
      }
      if (Boolean(form.vis_edition_date) !== Boolean(form.vis_given_date)) {
        setError(
          "Record both VIS dates, or leave both blank when no VIS applies.",
        );
        return;
      }
    }
    if (
      kind === "immunizations" &&
      form.status === "not_done" &&
      !form.refusal_reason?.trim()
    ) {
      setError("Record why the immunization was not given.");
      return;
    }
    const payload = Object.fromEntries(
      Object.entries(form).map(([name, value]) => [
        name,
        meta.fields.find((field) => field.name === name)?.type ===
          "datetime-local" && value
          ? new Date(value).toISOString()
          : value,
      ]),
    );
    const requestKey = crypto.randomUUID();
    const path = editing
      ? `${base}/${kind}/${editing.series_id}`
      : `${base}/${kind}`;
    const body = {
      [meta.root]: {
        ...payload,
        ...(editing ? { expected_version: editing.version_number } : {}),
        request_key: requestKey,
      },
    };
    void execute({
      kind,
      path,
      method: editing ? "PATCH" : "POST",
      body,
      seriesId: editing?.series_id ?? null,
      expectedVersion: editing?.version_number ?? null,
    });
  }

  if (!workspace.data) {
    return (
      <Paper
        id="clinical-plan-workspace"
        tabIndex={-1}
        variant="outlined"
        sx={{ p: 2 }}
      >
        <Typography component="h2" variant="subtitle2">
          Orders, diagnoses, procedures, care plans, and assessments
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }} variant="body2">
          {workspace.error ? workspace.error : "Loading clinical plan records…"}
        </Typography>
        {workspace.error && (
          <Button
            size="small"
            sx={{ mt: 1 }}
            onClick={() => void workspace.refresh()}
          >
            Try again
          </Button>
        )}
      </Paper>
    );
  }
  const data = workspace.data;
  const encounterWritable =
    encounter.status === "open" &&
    encounter.ended_at === null &&
    Boolean(encounter.site_id);
  const canCreateRecord = (targetKind: ResourceKind) =>
    data.capabilities[targetKind] &&
    data.new_work?.[targetKind] !== false &&
    pendingAttempt === null &&
    encounterWritable &&
    (targetKind !== "assessments" || data.assessment_scope.length > 0);
  const carePlanCreateBlockedReason =
    encounter.status !== "open" || encounter.ended_at !== null
      ? "Reopen the encounter before creating a care plan."
      : !encounter.site_id
        ? "Assign a facility to the encounter before creating a care plan."
        : !data.capabilities.care_plans
          ? "You do not have permission to create a care plan."
          : pendingAttempt
            ? "Resolve the pending clinical record save before creating a care plan."
            : data.new_work?.care_plans === false
              ? "Care plans are unavailable for new work in this encounter."
              : null;
  const reviewedAttempt = attemptReview.data?.attempts.find(
    (item) => item.id === reviewAttemptId,
  );

  return (
    <Paper
      id="clinical-plan-workspace"
      tabIndex={-1}
      variant="outlined"
      sx={{ p: 2 }}
    >
      <Stack spacing={2}>
        <Box>
          <Typography component="h2" variant="subtitle2">
            Orders, diagnoses, procedures, care plans, and assessments
          </Typography>
          <Typography color="text.secondary" variant="body2">
            Every save creates a new attributed revision. Recorded priority and
            status are not decision support.
          </Typography>
        </Box>
        {reviewAttemptId &&
          (!attemptReview.data ? (
            <LoadState
              error={attemptReview.error}
              onRetry={attemptReview.refresh}
            />
          ) : attemptReview.data.order_encounter_id !== encounter.id ? (
            <Alert severity="warning">
              This attempt belongs to another encounter.
            </Alert>
          ) : reviewedAttempt ? (
            <Alert severity="info">
              Simulated prescription attempt #{reviewedAttempt.id} · request
              revision #{reviewRevisionId} ·{" "}
              {reviewedAttempt.outcome.replaceAll("_", " ")} · recorded{" "}
              {new Date(reviewedAttempt.submitted_at).toLocaleString()}. Review
              its history before another submission.
            </Alert>
          ) : (
            <Alert severity="warning">
              The linked attempt was not found in this request revision.
            </Alert>
          ))}
        {notice && <Alert severity="success">{notice}</Alert>}
        {data.truncated[kind] && (
          <Alert severity="info">
            Showing the 200 most recently recorded {meta.label.toLowerCase()}.
          </Alert>
        )}
        {error && (
          <Alert severity={pendingAttempt ? "warning" : "error"}>{error}</Alert>
        )}
        {taskTarget?.kind === kind &&
          (taskRecord ? (
            <Alert severity="info">
              <AlertTitle>Finish this Patient Flow task</AlertTitle>
              Select <strong>Complete Patient Flow task</strong> on the
              highlighted {RESOURCE_META[taskTarget.kind].singular}, confirm the
              status is Completed, and save the revision. Completion needs a
              linked fulfillment record. If one cannot be linked, explain what
              established completion in the Completion exception field.
              {taskTarget.kind === "medication_requests" && (
                <>
                  {" "}
                  First reconcile any pending simulated prescription outcome in
                  Prescription review and fulfillment below.
                </>
              )}
            </Alert>
          ) : (
            <Alert severity="warning">
              The order linked from Patient Flow is unavailable in the current
              workspace. Refresh the record before taking action.
            </Alert>
          ))}
        {pendingAttempt && (
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button
              disabled={busy}
              variant="contained"
              onClick={() => void execute(pendingAttempt)}
            >
              Retry exact request
            </Button>
            <Button disabled={busy} onClick={() => void workspace.refresh()}>
              Refresh records first
            </Button>
          </Stack>
        )}
        {data.weight_context && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h3">Goals and weight history</Typography>
            <Typography variant="body2">
              Patient-reported context remains separate from clinical findings.
              Original dates, units and form revisions are retained.
            </Typography>
            {data.weight_context.length === 0 && (
              <Typography>No submitted intake yet.</Typography>
            )}
            {data.weight_context.map((item) => (
              <Stack key={item.note_id} sx={{ mt: 1 }}>
                <Typography>
                  {item.goals || "Goal not recorded"} ·{" "}
                  {item.weight || "Weight not recorded"}
                </Typography>
                {item.progress && <Typography>{item.progress}</Typography>}
                <Typography variant="caption">
                  {item.recorded_at} · {item.form_id} · response {item.note_id},
                  revision {item.revision} · patient reported
                </Typography>
              </Stack>
            ))}
          </Paper>
        )}
        {!!data.prior_care?.length && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography component="h3" variant="subtitle2">
              Care plans and goals from previous visits
            </Typography>
            <Typography variant="body2">
              Up to 20 latest accessible source records. Open the original visit
              to review or update its plan or goal; this visit does not create a
              copy.
            </Typography>
            {data.prior_care.map((item) => (
              <Stack key={`${item.kind}-${item.id}`} spacing={1} sx={{ mt: 2 }}>
                <Typography>
                  {item.label} · {humanize(item.status)} · revision{" "}
                  {item.revision}
                </Typography>
                {item.outcome && (
                  <Typography variant="body2">{item.outcome}</Typography>
                )}
                <Typography variant="caption">
                  Recorded {item.recorded_at} · visit {item.encounter_id}
                </Typography>
                <Button
                  size="small"
                  href={`/clinic/patients/${patient.id}/encounters/${item.encounter_id}?focus=clinical-plan-workspace`}
                >
                  Review source visit {item.encounter_id}
                </Button>
              </Stack>
            ))}
          </Paper>
        )}
        {!!data.prior_orders?.length && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h3">Orders from previous visits</Typography>
            <Typography variant="body2">
              Recent source revisions; open the original visit to review or
              resolve its work.
            </Typography>
            {data.prior_orders.map((order) => (
              <Stack
                key={`${order.kind}-${order.id}`}
                direction={{ xs: "column", sm: "row" }}
                sx={{ mt: 1, alignItems: { sm: "center" } }}
              >
                <Typography>
                  {order.label} · {humanize(order.status)} · revision{" "}
                  {order.revision}
                </Typography>
                <Button
                  size="small"
                  href={`/clinic/patients/${patient.id}/encounters/${order.encounter_id}`}
                >
                  Open visit {order.encounter_id}
                </Button>
              </Stack>
            ))}
          </Paper>
        )}
        <Tabs
          value={kind}
          onChange={(_event, value: ResourceKind) => {
            setKind(value);
            setNotice("");
            setError("");
          }}
          variant="scrollable"
          scrollButtons="auto"
          aria-label="Clinical plan record types"
        >
          {(Object.keys(RESOURCE_META) as ResourceKind[]).map(
            (resourceKind) => (
              <Tab
                key={resourceKind}
                value={resourceKind}
                label={`${RESOURCE_META[resourceKind].label} (${data.records[resourceKind].length})`}
              />
            ),
          )}
        </Tabs>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          sx={{ alignItems: { sm: "center" } }}
        >
          <Button
            variant="contained"
            disabled={!canCreateRecord(kind)}
            onClick={() => openCreate()}
          >
            Add {meta.singular}
          </Button>
          {Object.entries(statusCounts).map(([status, count]) => (
            <Chip
              key={status}
              size="small"
              variant="outlined"
              label={`${humanize(status)} ${count}`}
            />
          ))}
        </Stack>
        {data.new_work?.[kind] === false && (
          <Alert severity="info">
            This service is disabled for new work. Ask the clinic configuration
            team about availability. Existing records remain available for
            authorized review and reconciliation; unrelated care can continue.
          </Alert>
        )}
        {kind === "care_goals" && carePlans.length === 0 && (
          <Alert
            severity="info"
            action={
              <Button
                disabled={!canCreateRecord("care_plans")}
                onClick={() => openCreate("care_plans")}
              >
                Create plan
              </Button>
            }
          >
            {carePlanCreateBlockedReason ??
              "Create a care plan before adding a goal."}
          </Alert>
        )}
        {kind === "assessments" && data.assessment_scope.length === 0 && (
          <Alert severity="info">
            Clinic Setup exposes categories only. Before recording a completed
            assessment, document its instrument and version, when it was
            administered, and the responses or observations. Category selection
            does not configure a scoring or follow-up rule.
          </Alert>
        )}
        {records.length === 0 ? (
          <Typography color="text.secondary" variant="body2">
            No {meta.label.toLowerCase()} are recorded for this encounter.
          </Typography>
        ) : (
          <Stack spacing={1}>
            {records.map((record) => {
              const isTaskRecord =
                taskTarget?.kind === kind &&
                taskTarget.seriesId === record.series_id;
              return (
                <Paper
                  key={record.series_id}
                  id={`clinical-plan-record-${record.series_id}`}
                  tabIndex={isTaskRecord ? -1 : undefined}
                  aria-label={
                    isTaskRecord
                      ? `Patient Flow order: ${recordTitle(kind, record)}`
                      : undefined
                  }
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    ...(isTaskRecord
                      ? {
                          borderColor: "primary.main",
                          bgcolor: "action.selected",
                        }
                      : {}),
                  }}
                >
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1.5}
                    sx={{ justifyContent: "space-between" }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: "center", flexWrap: "wrap" }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {recordTitle(kind, record)}
                        </Typography>
                        <Chip size="small" label={humanize(record.status)} />
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`Revision ${record.version_number}`}
                        />
                      </Stack>
                      <Typography
                        color="text.secondary"
                        variant="body2"
                        sx={{ mt: 0.5 }}
                      >
                        {recordDetails(kind, record) ||
                          "No additional details recorded"}
                      </Typography>
                      <Typography color="text.secondary" variant="caption">
                        Recorded{" "}
                        {new Intl.DateTimeFormat(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: clinic.practice.timezone,
                        }).format(new Date(record.recorded_at))}
                      </Typography>
                    </Box>
                    <Stack
                      spacing={1}
                      sx={{ alignSelf: { xs: "stretch", sm: "center" } }}
                    >
                      {isTaskRecord &&
                        record.allowed_statuses.includes("completed") && (
                          <>
                            <Button
                              size="small"
                              variant="contained"
                              disabled={
                                !data.capabilities[kind] ||
                                busy ||
                                pendingAttempt !== null
                              }
                              onClick={() =>
                                openEdit(record, { status: "completed" })
                              }
                              sx={{
                                alignSelf: { xs: "stretch", sm: "center" },
                              }}
                            >
                              Complete Patient Flow task
                            </Button>
                            <Typography
                              color="text.secondary"
                              variant="caption"
                              sx={{ maxWidth: 240 }}
                            >
                              Saving the completed revision removes this order
                              from Patient Flow.
                            </Typography>
                          </>
                        )}
                      {record.completion_reconciliation_required && (
                        <>
                          <Typography variant="caption">
                            Updated fulfillment needs completion review.
                          </Typography>
                          <Button
                            size="small"
                            disabled={
                              !data.capabilities[kind] ||
                              busy ||
                              pendingAttempt !== null
                            }
                            onClick={() => reconcileCompletion(record)}
                          >
                            Reconcile completion
                          </Button>
                        </>
                      )}
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={
                          !data.capabilities[kind] ||
                          busy ||
                          pendingAttempt !== null ||
                          (encounter.status !== "open" &&
                            ![
                              "medication_requests",
                              "service_requests",
                            ].includes(kind))
                        }
                        onClick={() => openEdit(record)}
                        sx={{ alignSelf: { xs: "stretch", sm: "center" } }}
                      >
                        Revise
                      </Button>
                    </Stack>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        )}
        <ClinicalPlanClosurePanel
          data={data}
          base={base}
          disabled={busy || pendingAttempt !== null}
          refresh={workspace.refresh}
        />
      </Stack>

      {kind === "medication_requests" &&
        data.records.medication_requests.length > 0 && (
          <PrescriptionFulfillmentPanel
            key={`${patient.id}-${encounter.id}`}
            patientId={patient.id}
            encounterId={encounter.id}
            orders={data.records.medication_requests}
            canWrite={data.capabilities.medication_requests}
            preferredOrderId={
              data.records.medication_requests.some(
                (record) => record.id === reviewRevisionId,
              )
                ? (reviewRevisionId ?? undefined)
                : taskTarget?.kind === "medication_requests"
                  ? taskRecord?.id
                  : undefined
            }
          />
        )}
      <Dialog
        open={dialogOpen}
        onClose={() => !busy && !pendingAttempt && setDialogOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {editing &&
          taskTarget?.kind === kind &&
          taskTarget.seriesId === editing.series_id &&
          form.status === "completed"
            ? "Complete Patient Flow task"
            : editing
              ? `Revise ${meta.singular}`
              : `Add ${meta.singular}`}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && (
              <Alert severity={pendingAttempt ? "warning" : "error"}>
                {error}
              </Alert>
            )}
            {editing &&
              taskTarget?.kind === kind &&
              taskTarget.seriesId === editing.series_id &&
              form.status === "completed" && (
                <Alert severity="info">
                  Saving this revision as Completed closes the linked order task
                  and removes it from Patient Flow.
                </Alert>
              )}
            {editing ? (
              <FormControl fullWidth>
                <InputLabel id="clinical-record-status-label">
                  Status
                </InputLabel>
                <Select
                  labelId="clinical-record-status-label"
                  label="Status"
                  value={form.status ?? meta.initial.status}
                  onChange={(event) =>
                    setForm((current) => {
                      const status = event.target.value;
                      return {
                        ...current,
                        status,
                        ...(kind === "immunizations" &&
                        ["planned", "not_done"].includes(status)
                          ? {
                              medication_administration_id: "",
                              lot_number: "",
                              lot_expiration_date: "",
                              administered_at: "",
                              dose_text: "",
                              route_text: "",
                              administration_site_text: "",
                              vis_edition_date: "",
                              vis_given_date: "",
                            }
                          : {}),
                        ...(kind === "immunizations" && status !== "not_done"
                          ? { refusal_reason: "" }
                          : {}),
                      };
                    })
                  }
                >
                  {[editing.status, ...editing.allowed_statuses].map(
                    (status) => (
                      <MenuItem key={status} value={status}>
                        {humanize(status)}
                      </MenuItem>
                    ),
                  )}
                </Select>
              </FormControl>
            ) : (
              <Alert severity="info">
                This record starts as {humanize(meta.initial.status)} and
                changes through explicit revisions.
              </Alert>
            )}
            {kind === "care_goals" && (
              <FormControl fullWidth required>
                <InputLabel id="care-goal-plan-label">Care plan</InputLabel>
                <Select
                  labelId="care-goal-plan-label"
                  label="Care plan"
                  value={form.care_plan_revision_id ?? ""}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      care_plan_revision_id: event.target.value,
                    }))
                  }
                >
                  {carePlans.map((plan) => (
                    <MenuItem key={plan.id} value={String(plan.id)}>
                      {plan.title} · revision {plan.version_number}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            {kind === "procedures" && (
              <FormControl fullWidth>
                <InputLabel id="procedure-request-label">
                  Linked procedure order
                </InputLabel>
                <Select
                  labelId="procedure-request-label"
                  label="Linked procedure order"
                  value={form.service_request_revision_id ?? ""}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      service_request_revision_id: event.target.value,
                    }))
                  }
                >
                  <MenuItem value="">No linked order</MenuItem>
                  {serviceRequests
                    .filter((request) => request.request_kind === "procedure")
                    .map((request) => (
                      <MenuItem key={request.id} value={String(request.id)}>
                        {request.requested_display} · revision{" "}
                        {request.version_number}
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            )}
            {kind === "medication_requests" && (
              <Autocomplete
                options={data.medication_products}
                value={
                  data.medication_products.find(
                    (product) =>
                      String(product.id) === form.inventory_product_id,
                  ) ?? null
                }
                getOptionLabel={(product) =>
                  [
                    product.name,
                    product.generic_name,
                    product.dosage_form,
                    product.ndc && `NDC ${product.ndc}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                }
                isOptionEqualToValue={(option, value) => option.id === value.id}
                onChange={(_event, product) =>
                  setForm((current) => ({
                    ...current,
                    inventory_product_id: product ? String(product.id) : "",
                    medication_name: product?.name ?? current.medication_name,
                  }))
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Clinic medication catalog"
                    helperText="Required before this order can be selected for in-office administration."
                  />
                )}
              />
            )}
            {(kind === "medication_requests" || kind === "service_requests") &&
              editing &&
              form.status === "completed" && (
                <TextField
                  label="Completion exception"
                  helperText="Use only when the fulfillment record cannot be linked. Record what established completion."
                  multiline
                  minRows={2}
                  value={form.completion_exception ?? ""}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      completion_exception: event.target.value,
                    }))
                  }
                  fullWidth
                />
              )}
            {kind === "immunizations" &&
              (immunizationAdminEvidenceRequired ||
                Boolean(form.medication_administration_id)) && (
                <FormControl
                  fullWidth
                  required={immunizationAdminEvidenceRequired}
                  error={
                    immunizationAdminEvidenceRequired &&
                    !form.medication_administration_id
                  }
                >
                  <InputLabel id="immunization-administration-label">
                    Clinic administration record
                  </InputLabel>
                  <Select
                    labelId="immunization-administration-label"
                    label="Clinic administration record"
                    value={form.medication_administration_id ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      const administration =
                        data.available_link_targets.medication_administration.find(
                          (candidate) => String(candidate.id) === value,
                        );
                      setForm((current) => ({
                        ...current,
                        medication_administration_id: value,
                        ...(administration
                          ? {
                              lot_number: administration.lot_number,
                              lot_expiration_date:
                                administration.lot_expiration_date,
                              administered_at:
                                administration.administered_at.slice(0, 16),
                              dose_text: administration.dose_text,
                              route_text: administration.route_text,
                              administration_site_text:
                                administration.administration_site_text ?? "",
                            }
                          : {}),
                      }));
                    }}
                  >
                    {!immunizationAdminEvidenceRequired && (
                      <MenuItem value="">
                        No clinic administration record
                      </MenuItem>
                    )}
                    {immunizationAdminEvidenceRequired && (
                      <MenuItem value="" disabled>
                        Select a completed stock-linked administration
                      </MenuItem>
                    )}
                    {data.available_link_targets.medication_administration.map(
                      (administration) => (
                        <MenuItem
                          key={administration.id}
                          value={String(administration.id)}
                        >
                          {administration.label}
                        </MenuItem>
                      ),
                    )}
                  </Select>
                  <FormHelperText>
                    {data.available_link_targets.medication_administration
                      .length === 0
                      ? "Record the completed medication administration first; this list excludes not-given and non-stock outcomes."
                      : "Uses the existing medication administration and its inventory movement; saving this record does not post stock again."}
                  </FormHelperText>
                </FormControl>
              )}
            {kind === "immunizations" &&
              ["external_record", "registry"].includes(
                form.occurrence_source,
              ) && (
                <FormControl fullWidth>
                  <InputLabel id="immunization-source-document-label">
                    Source document
                  </InputLabel>
                  <Select
                    labelId="immunization-source-document-label"
                    label="Source document"
                    value={form.source_document_id ?? ""}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        source_document_id: event.target.value,
                      }))
                    }
                  >
                    <MenuItem value="">No linked source document</MenuItem>
                    {data.available_link_targets.document.map((document) => (
                      <MenuItem key={document.id} value={String(document.id)}>
                        {document.label}
                      </MenuItem>
                    ))}
                  </Select>
                  <FormHelperText>
                    Optional evidence for an external or registry-reported
                    record.
                  </FormHelperText>
                </FormControl>
              )}
            {meta.fields.map((field) => {
              const dynamicOptions =
                kind === "medication_requests" &&
                field.name === "dose_unit_code"
                  ? data.medication_order_options.dose_units
                  : kind === "medication_requests" &&
                      field.name === "route_code"
                    ? data.medication_order_options.routes
                    : kind === "assessments" && field.name === "category"
                      ? data.assessment_scope.map((code) => ({
                          code,
                          label: humanize(code),
                        }))
                      : null;
              const required =
                field.required ||
                (kind === "immunizations" &&
                  ((field.name === "occurrence_source" &&
                    form.status !== "entered_in_error") ||
                    (field.name === "refusal_reason" &&
                      form.status === "not_done") ||
                    (field.name === "administered_at" &&
                      form.status === "completed") ||
                    (field.name === "cvx_code" &&
                      ["completed", "not_done"].includes(form.status)) ||
                    (field.name === "lot_number" &&
                      immunizationAdminEvidenceRequired) ||
                    (field.name === "manufacturer" &&
                      immunizationAdminEvidenceRequired) ||
                    (field.name === "lot_expiration_date" &&
                      immunizationAdminEvidenceRequired)));
              const administrationDerived =
                immunizationAdminEvidenceRequired &&
                [
                  "lot_number",
                  "lot_expiration_date",
                  "dose_text",
                  "route_text",
                  "administration_site_text",
                  "administered_at",
                ].includes(field.name);
              return field.options || dynamicOptions ? (
                <FormControl key={field.name} fullWidth required={required}>
                  <InputLabel id={`clinical-${field.name}-label`}>
                    {field.label}
                  </InputLabel>
                  <Select
                    labelId={`clinical-${field.name}-label`}
                    label={field.label}
                    value={form[field.name] ?? ""}
                    onChange={(event) =>
                      setForm((current) => {
                        const value = event.target.value;
                        if (
                          kind === "immunizations" &&
                          field.name === "occurrence_source"
                        ) {
                          return {
                            ...current,
                            occurrence_source: value,
                            ...(value !== "administered_here"
                              ? {
                                  medication_administration_id: "",
                                  lot_number: "",
                                  lot_expiration_date: "",
                                  administered_at: "",
                                  dose_text: "",
                                  route_text: "",
                                  administration_site_text: "",
                                  vis_edition_date: "",
                                  vis_given_date: "",
                                }
                              : {}),
                          };
                        }
                        return { ...current, [field.name]: value };
                      })
                    }
                  >
                    {(
                      dynamicOptions ??
                      field.options?.map((option) => ({
                        code: option,
                        label: humanize(option),
                      })) ??
                      []
                    ).map((option) => (
                      <MenuItem
                        key={option.code}
                        value={option.code}
                        disabled={
                          kind === "immunizations" &&
                          field.name === "occurrence_source" &&
                          option.code === "administered_here" &&
                          !immunizationAdministrationEnabled
                        }
                      >
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ) : (
                <TextField
                  key={field.name}
                  label={field.label}
                  required={required}
                  multiline={field.multiline}
                  minRows={field.multiline ? 2 : undefined}
                  type={field.type ?? "text"}
                  disabled={administrationDerived}
                  value={form[field.name] ?? ""}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      [field.name]: event.target.value,
                    }))
                  }
                  slotProps={
                    field.type && field.type !== "text"
                      ? { inputLabel: { shrink: true } }
                      : undefined
                  }
                  fullWidth
                />
              );
            })}
            {kind === "medication_requests" && (
              <Alert severity="info">
                Authorized records and pharmacy transmission states are
                separate. MC does not claim transmission from this screen.
              </Alert>
            )}
            {kind === "diagnoses" && (
              <Alert severity="info">
                Draft and provisional diagnoses remain visibly distinct from
                confirmed diagnoses.
              </Alert>
            )}
            {(kind === "medication_requests" || kind === "service_requests") &&
              editing && (
                <Alert severity="info">
                  Completing an order requires linked fulfillment evidence. Use
                  Completion exception only when the expected result cannot be
                  linked, and record what established that the work was
                  complete.
                </Alert>
              )}
            {kind === "immunizations" && (
              <Alert severity="info">
                {immunizationAdministrationEnabled
                  ? "An immunization administered here must reference its completed medication administration so the dose and clinic-stock movement remain connected. Manufacturer and expiration evidence are required; VIS dates are recorded together when a VIS applies."
                  : "Clinic-administered immunizations are unavailable until clinic scope, sites, personnel, and review are configured. Historical, external, and registry records remain available."}{" "}
                CVX and optional MVX entries are format-checked only.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            disabled={busy || pendingAttempt !== null}
            onClick={() => setDialogOpen(false)}
          >
            Cancel
          </Button>
          <Button
            disabled={busy || pendingAttempt !== null || !dirty}
            variant="contained"
            onClick={save}
          >
            {busy ? "Saving…" : "Save revision"}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
