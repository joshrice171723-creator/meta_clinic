import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
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
import { useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";
import { useClinicNavigation } from "./clinicNavigation";
import { ClinicalPlanClosurePanel } from "./ClinicalPlanClosurePanel";

type ResourceKind = keyof ClinicalPlanWorkspaceContract["records"];
type ClinicalRecord =
  | MedicationRequestRevision
  | ServiceRequestRevision
  | EncounterDiagnosisRevision
  | ProcedureRevision
  | CarePlanRevision
  | CareGoalRevision
  | ImmunizationRevision;
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
      transmission_state: "not_requested",
      inventory_product_id: "",
      medication_name: "",
      dose_value: "",
      dose_unit_code: "",
      route_code: "",
      frequency_text: "",
      quantity_text: "",
      scheduled_for: "",
      reason_text: "",
      instructions: "",
    },
    statuses: ["draft", "authorized", "on_hold", "completed", "cancelled", "entered_in_error"],
    fields: [
      { name: "medication_name", label: "Medication name", required: true },
      { name: "intent", label: "Intent", options: ["proposal", "plan", "order"] },
      { name: "dose_value", label: "Dose amount" },
      { name: "dose_unit_code", label: "Dose unit", options: [] },
      { name: "route_code", label: "Route", options: [] },
      { name: "frequency_text", label: "Frequency" },
      { name: "quantity_text", label: "Quantity" },
      { name: "scheduled_for", label: "Scheduled for", type: "datetime-local" },
      { name: "reason_text", label: "Reason / indication", multiline: true },
      { name: "instructions", label: "Instructions", multiline: true },
      {
        name: "transmission_state",
        label: "Pharmacy transmission",
        options: ["not_requested", "pending", "accepted", "rejected", "failed", "unknown"],
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
    },
    statuses: ["draft", "active", "on_hold", "completed", "cancelled", "entered_in_error"],
    fields: [
      {
        name: "request_kind",
        label: "Request type",
        options: ["lab", "imaging", "procedure", "referral", "therapy", "other"],
      },
      { name: "requested_display", label: "Requested service", required: true },
      { name: "intent", label: "Intent", options: ["proposal", "plan", "order"] },
      { name: "priority", label: "Recorded priority", options: ["routine", "urgent", "asap", "stat"] },
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
    statuses: ["draft", "provisional", "confirmed", "refuted", "resolved", "entered_in_error"],
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
    statuses: ["planned", "in_progress", "completed", "not_done", "entered_in_error"],
    fields: [
      { name: "procedure_display", label: "Procedure", required: true },
      { name: "code_system", label: "Code system" },
      { name: "procedure_code", label: "Code" },
      { name: "performed_at", label: "Performed at", type: "datetime-local" },
      { name: "outcome_text", label: "Outcome", multiline: true },
      {
        name: "complication_state",
        label: "Complications",
        options: ["not_assessed", "none_reported", "known", "unknown", "unable_to_obtain"],
      },
      { name: "complication_text", label: "Complication details", multiline: true },
    ],
  },
  care_plans: {
    label: "Care plans",
    singular: "care plan",
    root: "care_plan",
    initial: { status: "draft", title: "", description: "", starts_on: "", ends_on: "" },
    statuses: ["draft", "active", "on_hold", "completed", "cancelled", "entered_in_error"],
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
    initial: { status: "proposed", care_plan_revision_id: "", description: "", outcome_text: "", target_on: "" },
    statuses: ["proposed", "active", "achieved", "not_achieved", "cancelled", "entered_in_error"],
    fields: [
      { name: "description", label: "Goal", required: true, multiline: true },
      { name: "target_on", label: "Target date", type: "date" },
      { name: "outcome_text", label: "Outcome", multiline: true },
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
      lot_number: "",
      dose_text: "",
      route_text: "",
      administration_site_text: "",
      administered_at: "",
      occurrence_source: "administered_here",
      refusal_reason: "",
      source_document_id: "",
    },
    statuses: ["planned", "completed", "not_done", "entered_in_error"],
    fields: [
      { name: "vaccine_name", label: "Vaccine", required: true },
      { name: "cvx_code", label: "CVX code" },
      { name: "manufacturer", label: "Manufacturer" },
      { name: "lot_number", label: "Lot number" },
      { name: "dose_text", label: "Dose" },
      { name: "route_text", label: "Route" },
      { name: "administration_site_text", label: "Administration site" },
      { name: "administered_at", label: "Administered at", type: "datetime-local" },
      {
        name: "occurrence_source",
        label: "Information source",
        options: ["administered_here", "patient_reported", "external_record", "registry"],
      },
      { name: "refusal_reason", label: "Not-given reason", multiline: true },
    ],
  },
};

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

function recordTitle(kind: ResourceKind, record: ClinicalRecord) {
  if (kind === "medication_requests") return (record as MedicationRequestRevision).medication_name;
  if (kind === "service_requests") return (record as ServiceRequestRevision).requested_display;
  if (kind === "diagnoses") return (record as EncounterDiagnosisRevision).diagnosis_display;
  if (kind === "procedures") return (record as ProcedureRevision).procedure_display;
  if (kind === "care_plans") return (record as CarePlanRevision).title;
  if (kind === "care_goals") return (record as CareGoalRevision).description;
  return (record as ImmunizationRevision).vaccine_name;
}

function recordDetails(kind: ResourceKind, record: ClinicalRecord) {
  if (kind === "medication_requests") {
    const value = record as MedicationRequestRevision;
    return [value.dose_text, value.route_text, value.frequency_text, `Transmission: ${humanize(value.transmission_state)}`]
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
    return [value.starts_on && `Starts ${value.starts_on}`, value.ends_on && `Review ${value.ends_on}`]
      .filter(Boolean)
      .join(" · ");
  }
  if (kind === "care_goals") {
    const value = record as CareGoalRevision;
    return value.target_on ? `Target ${value.target_on}` : "No target date recorded";
  }
  const value = record as ImmunizationRevision;
  return [
    humanize(value.occurrence_source),
    value.administered_at && new Date(value.administered_at).toLocaleDateString(),
    value.lot_number && `Lot ${value.lot_number}`,
  ].filter(Boolean).join(" · ");
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
}: {
  patient: Pick<Patient, "id" | "display_name">;
  encounter: EncounterDetail;
}) {
  const clinic = useClinic();
  const { registerBlocker } = useClinicNavigation();
  const base = `/api/clinic/patients/${patient.id}/encounters/${encounter.id}`;
  const workspace = useResource<ClinicalPlanWorkspaceContract>(`${base}/clinical_plan_workspace`, {
    retainDataOnRefresh: true,
  });
  const [kind, setKind] = useState<ResourceKind>("medication_requests");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ClinicalRecord | null>(null);
  const [form, setForm] = useState<FormState>(RESOURCE_META.medication_requests.initial);
  const [baseline, setBaseline] = useState<FormState>(RESOURCE_META.medication_requests.initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingAttempt, setPendingAttempt] = useState<PendingAttempt | null>(null);
  const dirty = dialogOpen && JSON.stringify(form) !== JSON.stringify(baseline);
  const meta = RESOURCE_META[kind];
  const records = workspace.data?.records[kind] ?? [];
  const carePlans = workspace.data?.records.care_plans ?? [];
  const serviceRequests = workspace.data?.records.service_requests ?? [];

  useEffect(
    () =>
      registerBlocker(() => {
        if (pendingAttempt) return "A clinical record outcome is unknown. Reconcile or retry it before leaving.";
        if (dirty) return "Unsaved clinical record changes will be lost. Leave this chart?";
        return null;
      }),
    [dirty, pendingAttempt, registerBlocker],
  );

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
    if (nextKind === "care_goals" && carePlans[0]) initial.care_plan_revision_id = String(carePlans[0].id);
    if (nextKind === "procedures") {
      const linkedRequest = serviceRequests.find((request) => request.request_kind === "procedure");
      if (linkedRequest) initial.service_request_revision_id = String(linkedRequest.id);
    }
    setKind(nextKind);
    setEditing(null);
    setForm(initial);
    setBaseline(initial);
    setError("");
    setNotice("");
    setDialogOpen(true);
  }

  function openEdit(record: ClinicalRecord) {
    const initial = recordForm(kind, record);
    setEditing(record);
    setForm(initial);
    setBaseline(initial);
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
        (attempt.seriesId !== null && returned.series_id !== attempt.seriesId) ||
        (attempt.expectedVersion !== null && returned.version_number !== attempt.expectedVersion + 1)
      ) {
        throw new Error("The saved clinical record response did not match this patient and encounter.");
      }
      setPendingAttempt(null);
      setDialogOpen(false);
      setEditing(null);
      setNotice(`${humanize(RESOURCE_META[attempt.kind].singular)} saved.`);
      workspace.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : `Unable to save this ${meta.singular}.`;
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

  function save() {
    const requiredMissing = meta.fields.some((field) => field.required && !form[field.name]?.trim());
    if (requiredMissing) {
      setError("Complete the required fields before saving.");
      return;
    }
    const payload = Object.fromEntries(
      Object.entries(form).map(([name, value]) => [
        name,
        name.endsWith("_at") && value ? new Date(value).toISOString() : value,
      ]),
    );
    const requestKey = crypto.randomUUID();
    const path = editing ? `${base}/${kind}/${editing.series_id}` : `${base}/${kind}`;
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
      <Paper id="clinical-plan-workspace" tabIndex={-1} variant="outlined" sx={{ p: 2 }}>
        <Typography component="h2" variant="subtitle2">
          Orders, diagnoses, procedures, and care plans
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }} variant="body2">
          {workspace.error ? workspace.error : "Loading clinical plan records…"}
        </Typography>
        {workspace.error && (
          <Button size="small" sx={{ mt: 1 }} onClick={() => void workspace.refresh()}>
            Try again
          </Button>
        )}
      </Paper>
    );
  }
  const data = workspace.data;

  return (
    <Paper id="clinical-plan-workspace" tabIndex={-1} variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Box>
          <Typography component="h2" variant="subtitle2">
            Orders, diagnoses, procedures, and care plans
          </Typography>
          <Typography color="text.secondary" variant="body2">
            Every save creates a new attributed revision. Recorded priority and status are not decision support.
          </Typography>
        </Box>
        {notice && <Alert severity="success">{notice}</Alert>}
        {data.truncated[kind] && (
          <Alert severity="info">Showing the 200 most recently recorded {meta.label.toLowerCase()}.</Alert>
        )}
        {error && <Alert severity={pendingAttempt ? "warning" : "error"}>{error}</Alert>}
        {pendingAttempt && (
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button disabled={busy} variant="contained" onClick={() => void execute(pendingAttempt)}>
              Retry exact request
            </Button>
            <Button disabled={busy} onClick={() => void workspace.refresh()}>
              Refresh records first
            </Button>
          </Stack>
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
          {(Object.keys(RESOURCE_META) as ResourceKind[]).map((resourceKind) => (
            <Tab
              key={resourceKind}
              value={resourceKind}
              label={`${RESOURCE_META[resourceKind].label} (${data.records[resourceKind].length})`}
            />
          ))}
        </Tabs>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}>
          <Button
            variant="contained"
            disabled={!data.capabilities[kind] || pendingAttempt !== null || encounter.status !== "open"}
            onClick={() => openCreate()}
          >
            Add {meta.singular}
          </Button>
          {Object.entries(statusCounts).map(([status, count]) => (
            <Chip key={status} size="small" variant="outlined" label={`${humanize(status)} ${count}`} />
          ))}
        </Stack>
        {kind === "care_goals" && carePlans.length === 0 && (
          <Alert severity="info" action={<Button onClick={() => openCreate("care_plans")}>Create plan</Button>}>
            Create a care plan before adding a goal.
          </Alert>
        )}
        {records.length === 0 ? (
          <Typography color="text.secondary" variant="body2">
            No {meta.label.toLowerCase()} are recorded for this encounter.
          </Typography>
        ) : (
          <Stack spacing={1}>
            {records.map((record) => (
              <Paper key={record.series_id} variant="outlined" sx={{ p: 1.5 }}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ justifyContent: "space-between" }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {recordTitle(kind, record)}
                      </Typography>
                      <Chip size="small" label={humanize(record.status)} />
                      <Chip size="small" variant="outlined" label={`Revision ${record.version_number}`} />
                    </Stack>
                    <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>
                      {recordDetails(kind, record) || "No additional details recorded"}
                    </Typography>
                    <Typography color="text.secondary" variant="caption">
                      Recorded {new Intl.DateTimeFormat(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: clinic.practice.timezone,
                      }).format(new Date(record.recorded_at))}
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={!data.capabilities[kind] || pendingAttempt !== null || encounter.status !== "open"}
                    onClick={() => openEdit(record)}
                    sx={{ alignSelf: { xs: "stretch", sm: "center" } }}
                  >
                    Revise
                  </Button>
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}
        <ClinicalPlanClosurePanel
          data={data}
          base={base}
          disabled={pendingAttempt !== null || encounter.status !== "open"}
          refresh={workspace.refresh}
        />
      </Stack>

      <Dialog open={dialogOpen} onClose={() => !busy && !pendingAttempt && setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? `Revise ${meta.singular}` : `Add ${meta.singular}`}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {editing ? (
              <FormControl fullWidth>
                <InputLabel id="clinical-record-status-label">Status</InputLabel>
                <Select
                  labelId="clinical-record-status-label"
                  label="Status"
                  value={form.status ?? meta.initial.status}
                  onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                >
                  {[editing.status, ...editing.allowed_statuses].map((status) => (
                    <MenuItem key={status} value={status}>
                      {humanize(status)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : (
              <Alert severity="info">This record starts as {humanize(meta.initial.status)} and changes through explicit revisions.</Alert>
            )}
            {kind === "care_goals" && (
              <FormControl fullWidth required>
                <InputLabel id="care-goal-plan-label">Care plan</InputLabel>
                <Select
                  labelId="care-goal-plan-label"
                  label="Care plan"
                  value={form.care_plan_revision_id ?? ""}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, care_plan_revision_id: event.target.value }))
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
                <InputLabel id="procedure-request-label">Linked procedure order</InputLabel>
                <Select
                  labelId="procedure-request-label"
                  label="Linked procedure order"
                  value={form.service_request_revision_id ?? ""}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, service_request_revision_id: event.target.value }))
                  }
                >
                  <MenuItem value="">No linked order</MenuItem>
                  {serviceRequests
                    .filter((request) => request.request_kind === "procedure")
                    .map((request) => (
                      <MenuItem key={request.id} value={String(request.id)}>
                        {request.requested_display} · revision {request.version_number}
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            )}
            {kind === "medication_requests" && (
              <Autocomplete
                options={data.medication_products}
                value={data.medication_products.find((product) => String(product.id) === form.inventory_product_id) ?? null}
                getOptionLabel={(product) =>
                  [product.name, product.generic_name, product.dosage_form, product.ndc && `NDC ${product.ndc}`]
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
            {meta.fields.map((field) => {
              const dynamicOptions = kind === "medication_requests" && field.name === "dose_unit_code"
                ? data.medication_order_options.dose_units
                : kind === "medication_requests" && field.name === "route_code"
                  ? data.medication_order_options.routes
                  : null;
              return field.options || dynamicOptions ? (
                <FormControl key={field.name} fullWidth required={field.required}>
                  <InputLabel id={`clinical-${field.name}-label`}>{field.label}</InputLabel>
                  <Select
                    labelId={`clinical-${field.name}-label`}
                    label={field.label}
                    value={form[field.name] ?? ""}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, [field.name]: event.target.value }))
                    }
                  >
                    {(dynamicOptions ?? field.options?.map((option) => ({ code: option, label: humanize(option) })) ?? [])
                      .map((option) => (
                      <MenuItem key={option.code} value={option.code}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ) : (
                <TextField
                  key={field.name}
                  label={field.label}
                  required={field.required}
                  multiline={field.multiline}
                  minRows={field.multiline ? 2 : undefined}
                  type={field.type ?? "text"}
                  value={form[field.name] ?? ""}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, [field.name]: event.target.value }))
                  }
                  slotProps={field.type && field.type !== "text" ? { inputLabel: { shrink: true } } : undefined}
                  fullWidth
                />
              );
            })}
            {kind === "medication_requests" && (
              <Alert severity="info">
                Authorized records and pharmacy transmission states are separate. MC does not claim transmission from this screen.
              </Alert>
            )}
            {kind === "diagnoses" && (
              <Alert severity="info">
                Draft and provisional diagnoses remain visibly distinct from confirmed diagnoses.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy || pendingAttempt !== null} onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          <Button disabled={busy || pendingAttempt !== null || !dirty} variant="contained" onClick={save}>
            {busy ? "Saving…" : "Save revision"}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
