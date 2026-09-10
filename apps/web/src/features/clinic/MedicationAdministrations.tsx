import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import type {
  ClinicWorkspaceContext,
  EncounterDetail,
  Patient,
} from "../../api/contracts";
import { api, ApiError } from "../../api/client";
import { useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";

type CodeOption = { code: string; label: string };
type StaffOption = { id: number; label: string };
type EligibleOrder = {
  id: number;
  series_id: string;
  version_number: number;
  medication_name: string;
  dose_value: string | null;
  dose_unit_code: string | null;
  dose_text: string | null;
  route_code: string | null;
  route_text: string | null;
  frequency_text: string | null;
  scheduled_for: string | null;
  reason_text: string | null;
  instructions: string | null;
  ordered_by_membership_id: number;
  ordered_by_display: string;
  product: {
    id: number;
    name: string;
    generic_name: string | null;
    ndc: string | null;
    dosage_form: string | null;
    stock_unit: string;
  };
};
type EligibleBatch = {
  batch_id: number;
  product_id: number;
  product_name: string;
  ndc: string | null;
  stock_unit: string;
  available_quantity: string;
  quantity_scale: number;
  lot_id: number;
  lot_number: string;
  expires_on: string | null;
  location_id: number;
  location_name: string;
};
type MedicationAdministration = {
  id: number;
  medication_request_revision_id: number | null;
  ordered_by_membership_id: number | null;
  administered_by_membership_id: number;
  verified_by_membership_id: number | null;
  status: "completed" | "not_done";
  status_reason: string | null;
  product: { id: number; name: string; ndc: string | null; stock_unit: string };
  dose_text: string | null;
  route_text: string | null;
  administration_site_text: string | null;
  quantity: string | null;
  stock_unit: string;
  variance_reason: string | null;
  precheck_status: string;
  precheck_notes: string | null;
  verification_status: string;
  response_text: string | null;
  education_text: string | null;
  administered_at: string;
  recorded_at: string;
  movements: {
    id: number;
    batch_id: number;
    lot_id: number;
    lot_number: string;
    expires_on: string | null;
    location_id: number;
    location_name: string;
    quantity: string;
    stock_unit: string;
  }[];
};
type MedicationAdministrationResponse = {
  encounter_id: number;
  site_id: number | null;
  can_record_outcome: boolean;
  can_administer: boolean;
  inventory_posting_available: boolean;
  administrations: MedicationAdministration[];
  eligible_orders: EligibleOrder[];
  eligible_batches: EligibleBatch[];
  dose_units: CodeOption[];
  routes: CodeOption[];
  administration_sites: CodeOption[];
  verifier_options: StaffOption[];
};
type AdministrationDraft = {
  medication_request_revision_id: number;
  status: "completed" | "not_done";
  allocations: { batch_id: number; quantity: string }[];
  dose_value?: string;
  dose_unit_code?: string;
  route_code?: string;
  administration_site_code?: string;
  administration_site_text?: string;
  status_reason?: string;
  variance_reason?: string;
  precheck_status?: string;
  precheck_notes?: string;
  verification_status?: string;
  verified_by_membership_id?: number;
  response_text?: string;
  education_text?: string;
  administered_at: string;
};
type AdministrationAttempt = AdministrationDraft & { request_key: string };
type AdministrationScope = Pick<
  ClinicWorkspaceContext,
  "practice" | "user_id" | "membership_id"
>;

const pendingAdministrationAttempts = new Map<string, AdministrationAttempt>();

function administrationScopeKey(
  scope: AdministrationScope,
  patientId: number,
  encounterId: number,
) {
  return `${scope.practice.id}:${scope.user_id}:${scope.membership_id}:patient:${patientId}:encounter:${encounterId}`;
}

function recordedDateTime(value: string, timezone: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(date);
}

function administrationFailureIsDeterministic(reason: unknown) {
  return (
    reason instanceof ApiError &&
    (reason.status === 400 ||
      reason.status === 403 ||
      reason.status === 404 ||
      reason.status === 422 ||
      (reason.status === 409 && reason.code !== "outcome_unconfirmed"))
  );
}

function positiveStockQuantity(value: string, scale: number) {
  const fraction = scale > 0 ? `(?:\\.\\d{1,${scale}})?` : "";
  return (
    new RegExp(`^(?:0|[1-9]\\d*)${fraction}$`).test(value) &&
    !/^0+(?:\.0+)?$/.test(value)
  );
}

function decimalNotGreaterThan(value: string, limit: string, scale: number) {
  const scaledInteger = (decimal: string) => {
    const [whole, fraction = ""] = decimal.split(".");
    return BigInt(`${whole}${fraction.padEnd(scale, "0").slice(0, scale)}`);
  };
  return scaledInteger(value) <= scaledInteger(limit);
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

export function MedicationAdministrations({
  encounter,
  patient,
  timezone,
  onChanged,
}: {
  encounter: EncounterDetail;
  patient: Pick<Patient, "id" | "display_name">;
  timezone: string;
  onChanged?: () => void;
}) {
  const context = useClinic();
  if (context.capabilities.notes_read !== true) {
    return (
      <Paper component="section" variant="outlined" sx={{ p: 2 }}>
        <Typography component="h2" variant="subtitle2">
          Medication administration
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }} variant="body2">
          Medication administration is unavailable for this account.
        </Typography>
      </Paper>
    );
  }
  return (
    <MedicationAdministrationPanel
      encounter={encounter}
      patient={patient}
      key={`${context.practice.id}:${patient.id}:${encounter.id}`}
      pendingScopeKey={administrationScopeKey(context, patient.id, encounter.id)}
      timezone={timezone}
      onChanged={onChanged}
    />
  );
}

function MedicationAdministrationPanel({
  encounter,
  patient,
  pendingScopeKey,
  timezone,
  onChanged,
}: {
  encounter: EncounterDetail;
  patient: Pick<Patient, "id" | "display_name">;
  pendingScopeKey: string;
  timezone: string;
  onChanged?: () => void;
}) {
  const resource = useResource<MedicationAdministrationResponse>(
    `/api/clinic/encounters/${encounter.id}/medication_administrations`,
  );
  const [orderId, setOrderId] = useState("");
  const [status, setStatus] = useState<"completed" | "not_done">("completed");
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [doseValue, setDoseValue] = useState("");
  const [doseUnitCode, setDoseUnitCode] = useState("");
  const [routeCode, setRouteCode] = useState("");
  const [administrationSiteCode, setAdministrationSiteCode] = useState("");
  const [administrationSiteText, setAdministrationSiteText] = useState("");
  const [statusReason, setStatusReason] = useState("");
  const [varianceReason, setVarianceReason] = useState("");
  const [precheckStatus, setPrecheckStatus] = useState("");
  const [precheckNotes, setPrecheckNotes] = useState("");
  const [verificationStatus, setVerificationStatus] = useState("not_required");
  const [verifiedByMembershipId, setVerifiedByMembershipId] = useState("");
  const [responseText, setResponseText] = useState("");
  const [educationText, setEducationText] = useState("");
  const [administeredAt, setAdministeredAt] = useState("");
  const [review, setReview] = useState<AdministrationDraft | null>(null);
  const [attempt, setAttempt] = useState<AdministrationAttempt | null>(
    () => pendingAdministrationAttempts.get(pendingScopeKey) ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const retained = pendingAdministrationAttempts.get(pendingScopeKey) ?? null;
    setReview(retained);
    setAttempt(retained);
    setBusy(false);
    setError(
      retained
        ? "This medication outcome has an unconfirmed result. Review the retained request and retry only its exact entries."
        : "",
    );
  }, [pendingScopeKey]);

  const selectedOrder = resource.data?.eligible_orders.find(
    (order) => String(order.id) === orderId,
  );
  const orderBatches = useMemo(
    () =>
      (resource.data?.eligible_batches ?? []).filter(
        (batch) => batch.product_id === selectedOrder?.product.id,
      ),
    [resource.data?.eligible_batches, selectedOrder?.product.id],
  );
  const selectedBatches = orderBatches.filter((batch) =>
    Object.prototype.hasOwnProperty.call(quantities, batch.batch_id),
  );
  const locked = attempt !== null || busy;

  function selectOrder(order: EligibleOrder | null) {
    setOrderId(order ? String(order.id) : "");
    setDoseValue(order?.dose_value ?? "");
    setDoseUnitCode(order?.dose_unit_code ?? "");
    setRouteCode(order?.route_code ?? "");
    setQuantities({});
    setError("");
  }

  function prepareReview() {
    if (!resource.data?.can_record_outcome || locked || !selectedOrder) return;
    if (!administeredAt) {
      setError("Enter the outcome time.");
      return;
    }
    const occurredAt = new Date(administeredAt);
    if (!Number.isFinite(occurredAt.valueOf())) {
      setError("Enter a valid outcome time.");
      return;
    }
    if (status === "not_done") {
      if (!statusReason.trim()) {
        setError("Document why the medication was not given.");
        return;
      }
      setError("");
      setReview({
        medication_request_revision_id: selectedOrder.id,
        status,
        allocations: [],
        status_reason: statusReason.trim(),
        precheck_status: precheckStatus || "not_recorded",
        precheck_notes: precheckNotes.trim() || undefined,
        response_text: responseText.trim() || undefined,
        education_text: educationText.trim() || undefined,
        administered_at: occurredAt.toISOString(),
      });
      return;
    }
    if (!resource.data.can_administer) {
      setError("Inventory posting is required before a completed administration can be recorded.");
      return;
    }
    if (!doseValue.trim() || !doseUnitCode || !routeCode || !administrationSiteCode) {
      setError("Enter the actual dose and choose its unit, route, and administration site.");
      return;
    }
    if (!precheckStatus || !verificationStatus) {
      setError("Record the pre-check and verification outcomes.");
      return;
    }
    if (administrationSiteCode === "other" && !administrationSiteText.trim()) {
      setError("Document the other administration site.");
      return;
    }
    if (verificationStatus === "completed" && !verifiedByMembershipId) {
      setError("Choose the staff member who completed the independent verification.");
      return;
    }
    const invalidBatch = selectedBatches.find((batch) => {
      const quantity = quantities[batch.batch_id]?.trim() ?? "";
      return (
        !positiveStockQuantity(quantity, batch.quantity_scale) ||
        !decimalNotGreaterThan(
          quantity,
          batch.available_quantity,
          batch.quantity_scale,
        )
      );
    });
    if (invalidBatch) {
      setError(
        `Enter a positive quantity up to ${invalidBatch.available_quantity} ${invalidBatch.stock_unit} for lot ${invalidBatch.lot_number}.`,
      );
      return;
    }
    if (selectedBatches.length === 0) {
      setError("Choose at least one actual lot and enter the stock quantity used.");
      return;
    }
    setError("");
    setReview({
      medication_request_revision_id: selectedOrder.id,
      status,
      allocations: selectedBatches.map((batch) => ({
        batch_id: batch.batch_id,
        quantity: quantities[batch.batch_id].trim(),
      })),
      dose_value: doseValue.trim(),
      dose_unit_code: doseUnitCode,
      route_code: routeCode,
      administration_site_code: administrationSiteCode,
      administration_site_text:
        administrationSiteCode === "other" ? administrationSiteText.trim() : undefined,
      variance_reason: varianceReason.trim() || undefined,
      precheck_status: precheckStatus,
      precheck_notes: precheckNotes.trim() || undefined,
      verification_status: verificationStatus,
      verified_by_membership_id: verifiedByMembershipId
        ? Number(verifiedByMembershipId)
        : undefined,
      response_text: responseText.trim() || undefined,
      education_text: educationText.trim() || undefined,
      administered_at: occurredAt.toISOString(),
    });
  }

  async function recordAdministration() {
    const nextAttempt =
      attempt ??
      (review && {
        ...review,
        request_key: crypto.randomUUID(),
      });
    if (!nextAttempt || busy) return;
    pendingAdministrationAttempts.set(pendingScopeKey, nextAttempt);
    setAttempt(nextAttempt);
    setBusy(true);
    setError("");
    try {
      await api<{ medication_administration: MedicationAdministration }>(
        `/api/clinic/encounters/${encounter.id}/medication_administrations`,
        {
          method: "POST",
          body: { medication_administration: nextAttempt },
        },
      );
      pendingAdministrationAttempts.delete(pendingScopeKey);
      setAttempt(null);
      setReview(null);
      setOrderId("");
      setQuantities({});
      setDoseValue("");
      setDoseUnitCode("");
      setRouteCode("");
      setAdministrationSiteCode("");
      setAdministrationSiteText("");
      setStatusReason("");
      setVarianceReason("");
      setPrecheckStatus("");
      setPrecheckNotes("");
      setVerificationStatus("not_required");
      setVerifiedByMembershipId("");
      setResponseText("");
      setEducationText("");
      setAdministeredAt("");
      resource.refresh();
      onChanged?.();
    } catch (reason) {
      if (administrationFailureIsDeterministic(reason)) {
        pendingAdministrationAttempts.delete(pendingScopeKey);
        setAttempt(null);
        setReview(null);
      }
      setError(
        administrationFailureIsDeterministic(reason)
          ? reason instanceof Error
            ? reason.message
            : "The medication outcome could not be recorded."
          : `${reason instanceof Error ? reason.message : "The medication outcome could not be confirmed."} Retry only this exact outcome after reviewing the recorded history.`,
      );
      resource.refresh();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  if (!resource.data) {
    return (
      <Paper component="section" variant="outlined" sx={{ p: 2 }}>
        <Typography component="h2" variant="subtitle2">
          Medication administration
        </Typography>
        {resource.error ? (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {resource.error}
          </Alert>
        ) : (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 1.5 }}>
            <CircularProgress size={18} />
            <Typography color="text.secondary" variant="body2">
              Loading current medication orders…
            </Typography>
          </Stack>
        )}
      </Paper>
    );
  }

  const data = resource.data;
  const selectedReviewOrder = review
    ? data.eligible_orders.find(
        (order) => order.id === review.medication_request_revision_id,
      )
    : null;
  const reviewBatches = review
    ? data.eligible_batches.filter((batch) =>
        review.allocations.some(
          (allocation) => allocation.batch_id === batch.batch_id,
        ),
      )
    : [];
  const selectedVerifier = data.verifier_options.find(
    (option) => String(option.id) === verifiedByMembershipId,
  );

  return (
    <Paper component="section" variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Box>
          <Typography component="h2" variant="subtitle2">
            Medication administration
          </Typography>
          <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>
            {patient.display_name} · Visit #{encounter.id}
          </Typography>
        </Box>
        {!encounter.site_id ? (
          <Alert severity="warning">
            This visit has no assigned site. Review the visit location before recording a medication outcome.
          </Alert>
        ) : !data.can_record_outcome ? (
          <Alert severity="warning">
            This account cannot record medication outcomes for this visit.
          </Alert>
        ) : data.eligible_orders.length === 0 ? (
          <Alert severity="info">
            No current authorized medication orders are linked to clinic inventory. Create and authorize a
            catalog-linked medication order before recording administration.
          </Alert>
        ) : (
          <>
            <Alert severity="info">
              Start from the authorized order. Record the actual outcome, then choose the exact lot only when
              medication was given.
            </Alert>
            <Autocomplete
              disabled={locked}
              options={data.eligible_orders}
              value={selectedOrder ?? null}
              getOptionLabel={(order) =>
                [
                  order.medication_name,
                  order.dose_text,
                  order.route_text,
                  order.scheduled_for && recordedDateTime(order.scheduled_for, timezone),
                ]
                  .filter(Boolean)
                  .join(" · ")
              }
              isOptionEqualToValue={(option, value) => option.id === value.id}
              onChange={(_event, order) => selectOrder(order)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  required
                  label="Authorized medication order"
                  helperText="Search by medication, dose, route, or scheduled time."
                />
              )}
            />
            {selectedOrder && (
              <Paper variant="outlined" sx={{ p: 1.5 }}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between" }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {selectedOrder.product.name}
                    </Typography>
                    <Typography color="text.secondary" variant="body2">
                      Ordered by {selectedOrder.ordered_by_display} · revision {selectedOrder.version_number}
                    </Typography>
                    {(selectedOrder.reason_text || selectedOrder.instructions) && (
                      <Typography color="text.secondary" variant="caption">
                        {[selectedOrder.reason_text, selectedOrder.instructions].filter(Boolean).join(" · ")}
                      </Typography>
                    )}
                  </Box>
                  {selectedOrder.scheduled_for && (
                    <Chip label={`Due ${recordedDateTime(selectedOrder.scheduled_for, timezone)}`} size="small" />
                  )}
                </Stack>
              </Paper>
            )}
            <FormControl fullWidth disabled={locked || !selectedOrder}>
              <InputLabel id="medication-outcome-label">Outcome</InputLabel>
              <Select
                labelId="medication-outcome-label"
                label="Outcome"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as "completed" | "not_done");
                  setError("");
                }}
              >
                <MenuItem value="completed">Given</MenuItem>
                <MenuItem value="not_done">Not given / refused</MenuItem>
              </Select>
            </FormControl>
            {status === "not_done" ? (
              <TextField
                disabled={locked || !selectedOrder}
                label="Not-given reason"
                required
                multiline
                minRows={2}
                value={statusReason}
                onChange={(event) => setStatusReason(event.target.value)}
              />
            ) : (
              <>
                {!data.inventory_posting_available && (
                  <Alert severity="warning">
                    Inventory posting is not configured or available for this account. A not-given outcome can
                    still be recorded, but a completed administration cannot.
                    <Button component="a" href="/clinic/inventory" size="small">
                      Open inventory
                    </Button>
                  </Alert>
                )}
                <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
                  <TextField
                    disabled={locked || !selectedOrder}
                    inputMode="decimal"
                    label="Actual dose"
                    required
                    value={doseValue}
                    onChange={(event) => setDoseValue(event.target.value)}
                  />
                  <FormControl fullWidth required disabled={locked || !selectedOrder}>
                    <InputLabel id="medication-dose-unit-label">Dose unit</InputLabel>
                    <Select
                      labelId="medication-dose-unit-label"
                      label="Dose unit"
                      value={doseUnitCode}
                      onChange={(event) => setDoseUnitCode(event.target.value)}
                    >
                      {data.dose_units.map((option) => (
                        <MenuItem key={option.code} value={option.code}>{option.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl fullWidth required disabled={locked || !selectedOrder}>
                    <InputLabel id="medication-route-label">Route</InputLabel>
                    <Select
                      labelId="medication-route-label"
                      label="Route"
                      value={routeCode}
                      onChange={(event) => setRouteCode(event.target.value)}
                    >
                      {data.routes.map((option) => (
                        <MenuItem key={option.code} value={option.code}>{option.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl fullWidth required disabled={locked || !selectedOrder}>
                    <InputLabel id="medication-site-label">Administration site</InputLabel>
                    <Select
                      labelId="medication-site-label"
                      label="Administration site"
                      value={administrationSiteCode}
                      onChange={(event) => setAdministrationSiteCode(event.target.value)}
                    >
                      {data.administration_sites.map((option) => (
                        <MenuItem key={option.code} value={option.code}>{option.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  {administrationSiteCode === "other" && (
                    <TextField
                      disabled={locked}
                      label="Other administration site"
                      required
                      value={administrationSiteText}
                      onChange={(event) => setAdministrationSiteText(event.target.value)}
                    />
                  )}
                  <FormControl fullWidth required disabled={locked || !selectedOrder}>
                    <InputLabel id="medication-precheck-label">Medication pre-check</InputLabel>
                    <Select
                      labelId="medication-precheck-label"
                      label="Medication pre-check"
                      value={precheckStatus}
                      onChange={(event) => setPrecheckStatus(event.target.value)}
                    >
                      <MenuItem value="completed">Completed</MenuItem>
                      <MenuItem value="not_required">Not required by policy</MenuItem>
                      <MenuItem value="unable_to_complete">Unable to complete</MenuItem>
                    </Select>
                  </FormControl>
                  <FormControl fullWidth required disabled={locked || !selectedOrder}>
                    <InputLabel id="medication-verification-label">Independent verification</InputLabel>
                    <Select
                      labelId="medication-verification-label"
                      label="Independent verification"
                      value={verificationStatus}
                      onChange={(event) => {
                        setVerificationStatus(event.target.value);
                        if (event.target.value !== "completed") setVerifiedByMembershipId("");
                      }}
                    >
                      <MenuItem value="not_required">Not required by clinic policy</MenuItem>
                      <MenuItem value="completed">Completed</MenuItem>
                      <MenuItem value="unable_to_complete">Unable to complete</MenuItem>
                    </Select>
                  </FormControl>
                  {verificationStatus === "completed" && (
                    <FormControl fullWidth required disabled={locked}>
                      <InputLabel id="medication-verifier-label">Verified by</InputLabel>
                      <Select
                        labelId="medication-verifier-label"
                        label="Verified by"
                        value={verifiedByMembershipId}
                        onChange={(event) => setVerifiedByMembershipId(event.target.value)}
                      >
                        {data.verifier_options.map((option) => (
                          <MenuItem key={option.id} value={String(option.id)}>{option.label}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                </Box>
                <TextField
                  disabled={locked}
                  label="Pre-check notes"
                  multiline
                  minRows={2}
                  value={precheckNotes}
                  onChange={(event) => setPrecheckNotes(event.target.value)}
                />
                <TextField
                  disabled={locked}
                  label="Variance or safety exception"
                  multiline
                  minRows={2}
                  helperText="Required when the actual dose or route differs from the order, or a safety check could not be completed."
                  value={varianceReason}
                  onChange={(event) => setVarianceReason(event.target.value)}
                />
                <Autocomplete
                  multiple
                  disabled={locked || !selectedOrder || !data.can_administer}
                  options={orderBatches}
                  value={selectedBatches}
                  getOptionLabel={(batch) =>
                    `Lot ${batch.lot_number} · ${batch.location_name} · ${batch.available_quantity} ${batch.stock_unit} available`
                  }
                  isOptionEqualToValue={(option, value) => option.batch_id === value.batch_id}
                  onChange={(_event, batches) =>
                    setQuantities((current) =>
                      Object.fromEntries(
                        batches.map((batch) => [batch.batch_id, current[batch.batch_id] ?? ""]),
                      ),
                    )
                  }
                  renderInput={(params) => (
                    <TextField {...params} label="Medication lot used" required />
                  )}
                />
                {selectedBatches.map((batch) => (
                  <TextField
                    key={batch.batch_id}
                    disabled={locked}
                    inputMode="decimal"
                    label={`Stock quantity from lot ${batch.lot_number} (${batch.stock_unit})`}
                    required
                    helperText={`${batch.available_quantity} ${batch.stock_unit} available at ${batch.location_name}`}
                    value={quantities[batch.batch_id] ?? ""}
                    onChange={(event) =>
                      setQuantities((current) => ({
                        ...current,
                        [batch.batch_id]: event.target.value,
                      }))
                    }
                  />
                ))}
              </>
            )}
            <TextField
              disabled={locked || !selectedOrder}
              label={status === "completed" ? "Administration time (device local)" : "Outcome time (device local)"}
              required
              slotProps={{ inputLabel: { shrink: true } }}
              type="datetime-local"
              value={administeredAt}
              helperText={`Review will show clinic time (${timezone}).`}
              onChange={(event) => setAdministeredAt(event.target.value)}
            />
            <TextField
              disabled={locked || !selectedOrder}
              label="Response / reassessment"
              multiline
              minRows={2}
              value={responseText}
              onChange={(event) => setResponseText(event.target.value)}
            />
            <TextField
              disabled={locked || !selectedOrder}
              label="Education provided"
              multiline
              minRows={2}
              value={educationText}
              onChange={(event) => setEducationText(event.target.value)}
            />
            {error && <Alert severity={attempt ? "warning" : "error"}>{error}</Alert>}
            {attempt && (
              <Alert severity="warning">
                This outcome has an unconfirmed result. Its exact order, lot, and documentation are locked for retry.
              </Alert>
            )}
            <Button
              disabled={locked || !selectedOrder}
              onClick={prepareReview}
              sx={{ alignSelf: "flex-start" }}
              variant="contained"
            >
              Review medication outcome
            </Button>
          </>
        )}
        {data.administrations.length > 0 && (
          <>
            <Divider />
            <Box>
              <Typography variant="subtitle2">Recorded medication outcomes</Typography>
              <Stack spacing={1} sx={{ mt: 1 }}>
                {data.administrations.map((administration) => (
                  <Paper key={administration.id} variant="outlined" sx={{ p: 1.5 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                      <Typography sx={{ fontWeight: 700 }} variant="body2">
                        {administration.product.name}
                      </Typography>
                      <Chip
                        color={administration.status === "completed" ? "success" : "warning"}
                        label={administration.status === "completed" ? "Given" : "Not given"}
                        size="small"
                      />
                    </Stack>
                    <Typography color="text.secondary" variant="body2">
                      {administration.status === "completed"
                        ? [
                            administration.dose_text,
                            administration.route_text,
                            administration.administration_site_text,
                            administration.quantity &&
                              `${administration.quantity} ${administration.stock_unit} from stock`,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : administration.status_reason}
                    </Typography>
                    <Typography color="text.secondary" variant="caption">
                      {recordedDateTime(administration.administered_at, timezone)} · order revision{" "}
                      {administration.medication_request_revision_id ?? "legacy record"} · pre-check{" "}
                      {humanize(administration.precheck_status)} · verification{" "}
                      {humanize(administration.verification_status)}
                    </Typography>
                    {administration.movements.length > 0 && (
                      <Typography color="text.secondary" sx={{ display: "block" }} variant="caption">
                        {administration.movements
                          .map(
                            (movement) =>
                              `Lot ${movement.lot_number} at ${movement.location_name}: ${movement.quantity} ${movement.stock_unit}`,
                          )
                          .join("; ")}
                      </Typography>
                    )}
                    {(administration.response_text || administration.education_text) && (
                      <Typography color="text.secondary" sx={{ display: "block" }} variant="caption">
                        {[
                          administration.response_text &&
                            `Response: ${administration.response_text}`,
                          administration.education_text &&
                            `Education: ${administration.education_text}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </Typography>
                    )}
                  </Paper>
                ))}
              </Stack>
            </Box>
          </>
        )}
      </Stack>
      <Dialog
        fullWidth
        maxWidth="sm"
        onClose={() => !busy && !attempt && setReview(null)}
        open={review !== null}
      >
        <DialogTitle>Review medication outcome</DialogTitle>
        <DialogContent>
          {review && (
            <Stack spacing={1.5} sx={{ pt: 1 }}>
              <Typography>
                {patient.display_name} · Visit #{encounter.id}
              </Typography>
              <Typography sx={{ fontWeight: 700 }}>
                {selectedReviewOrder?.medication_name ?? "Authorized medication order"}
              </Typography>
              <Typography color="text.secondary" variant="body2">
                {review.status === "completed"
                  ? [
                      `Dose ${review.dose_value} ${data.dose_units.find((option) => option.code === review.dose_unit_code)?.label ?? review.dose_unit_code}`,
                      data.routes.find((option) => option.code === review.route_code)?.label,
                      data.administration_sites.find(
                        (option) => option.code === review.administration_site_code,
                      )?.label,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : `Not given: ${review.status_reason}`}
              </Typography>
              <Typography color="text.secondary" variant="body2">
                Clinic time ({timezone}): {recordedDateTime(review.administered_at, timezone)}
              </Typography>
              {review.status === "completed" && (
                <>
                  <Typography variant="subtitle2">Selected lots</Typography>
                  {reviewBatches.map((batch) => {
                    const allocation = review.allocations.find(
                      (value) => value.batch_id === batch.batch_id,
                    );
                    return (
                      <Typography key={batch.batch_id} variant="body2">
                        Lot {batch.lot_number} · {batch.location_name} · {allocation?.quantity}{" "}
                        {batch.stock_unit}
                      </Typography>
                    );
                  })}
                  <Typography color="text.secondary" variant="body2">
                    Pre-check {humanize(review.precheck_status ?? "not recorded")} · verification{" "}
                    {humanize(review.verification_status ?? "not recorded")}
                    {selectedVerifier ? ` by ${selectedVerifier.label}` : ""}
                  </Typography>
                </>
              )}
              {attempt && (
                <Alert severity="warning">Retry submits the exact retained medication outcome.</Alert>
              )}
              {error && <Alert severity="error">{error}</Alert>}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy || attempt !== null} onClick={() => setReview(null)}>
            Go back
          </Button>
          <Button disabled={busy} onClick={() => void recordAdministration()} variant="contained">
            {busy ? "Recording…" : attempt ? "Retry exact outcome" : "Record outcome"}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
