import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Paper,
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
  patient_id: number;
  encounter_id: number;
  site_id: number;
  administered_by_membership_id: number;
  product: { id: number; name: string; ndc: string | null; stock_unit: string };
  dose_text: string;
  route_text: string;
  administration_site_text: string | null;
  quantity: string;
  stock_unit: string;
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
  can_administer: boolean;
  inventory_posting_available: boolean;
  administrations: MedicationAdministration[];
  eligible_batches: EligibleBatch[];
};

type AdministrationDraft = {
  allocations: { batch_id: number; quantity: string }[];
  administered_at: string;
  administration_site_text: string;
  dose_text: string;
  product_id: number;
  route_text: string;
};

type AdministrationAttempt = AdministrationDraft & { request_key: string };

type AdministrationScope = Pick<
  ClinicWorkspaceContext,
  "practice" | "user_id" | "membership_id"
>;

const pendingAdministrationAttempts = new Map<
  string,
  AdministrationAttempt
>();

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
  const canRead =
    context.capabilities.notes_read === true && context.capabilities.inventory;
  if (!canRead)
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
  return (
    <MedicationAdministrationPanel
      encounter={encounter}
      patient={patient}
      key={`${context.practice.id}:${patient.id}:${encounter.id}`}
      pendingScopeKey={administrationScopeKey(context, patient.id, encounter.id)}
      scopeKey={`${context.practice.id}:${patient.id}:${encounter.id}`}
      timezone={timezone}
      onChanged={onChanged}
    />
  );
}

function MedicationAdministrationPanel({
  encounter,
  patient,
  pendingScopeKey,
  scopeKey,
  timezone,
  onChanged,
}: {
  encounter: EncounterDetail;
  patient: Pick<Patient, "id" | "display_name">;
  pendingScopeKey: string;
  scopeKey: string;
  timezone: string;
  onChanged?: () => void;
}) {
  const resource = useResource<MedicationAdministrationResponse>(
    `/api/clinic/encounters/${encounter.id}/medication_administrations`,
  );
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [doseText, setDoseText] = useState("");
  const [routeText, setRouteText] = useState("");
  const [administrationSite, setAdministrationSite] = useState("");
  const [administeredAt, setAdministeredAt] = useState("");
  const [review, setReview] = useState<AdministrationDraft | null>(null);
  const [attempt, setAttempt] = useState<AdministrationAttempt | null>(
    () => pendingAdministrationAttempts.get(pendingScopeKey) ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const retained = pendingAdministrationAttempts.get(pendingScopeKey) ?? null;
    setQuantities({});
    setDoseText("");
    setRouteText("");
    setAdministrationSite("");
    setAdministeredAt("");
    setReview(retained);
    setAttempt(retained);
    setBusy(false);
    setError(
      retained
        ? "This medication administration has an unconfirmed outcome. Review the retained request and retry only its exact entries."
        : "",
    );
  }, [pendingScopeKey, scopeKey]);

  const selectedBatches = useMemo(
    () =>
      (resource.data?.eligible_batches ?? []).filter((batch) => {
        const quantity = quantities[batch.batch_id]?.trim() ?? "";
        return positiveStockQuantity(quantity, batch.quantity_scale);
      }),
    [quantities, resource.data?.eligible_batches],
  );
  const selectedProductIds = new Set(
    selectedBatches.map((batch) => batch.product_id),
  );
  const locked = attempt !== null || busy;

  const prepareReview = () => {
    if (!resource.data?.can_administer || locked) return;
    if (!doseText.trim() || !routeText.trim() || !administeredAt) {
      setError("Enter the dose, route, and administration time.");
      return;
    }
    const invalidBatch = resource.data.eligible_batches.find((batch) => {
      const quantity = quantities[batch.batch_id]?.trim();
      return (
        quantity !== undefined &&
        quantity !== "" &&
        (!positiveStockQuantity(quantity, batch.quantity_scale) ||
          !decimalNotGreaterThan(
            quantity,
            batch.available_quantity,
            batch.quantity_scale,
          ))
      );
    });
    if (invalidBatch) {
      setError(
        `Enter a positive quantity up to ${invalidBatch.available_quantity} ${invalidBatch.stock_unit} for lot ${invalidBatch.lot_number}.`,
      );
      return;
    }
    if (selectedBatches.length === 0) {
      setError("Enter a positive stock quantity for at least one actual lot.");
      return;
    }
    if (selectedProductIds.size !== 1) {
      setError("Select lots for one medication at a time.");
      return;
    }
    const administeredAtValue = new Date(administeredAt);
    if (!Number.isFinite(administeredAtValue.valueOf())) {
      setError("Enter a valid administration time.");
      return;
    }
    setError("");
    setReview({
      allocations: selectedBatches.map((batch) => ({
        batch_id: batch.batch_id,
        quantity: quantities[batch.batch_id].trim(),
      })),
      administered_at: administeredAtValue.toISOString(),
      administration_site_text: administrationSite.trim(),
      dose_text: doseText.trim(),
      product_id: selectedBatches[0].product_id,
      route_text: routeText.trim(),
    });
  };

  const recordAdministration = async () => {
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
          body: {
            medication_administration: {
              ...nextAttempt,
              administration_site_text:
                nextAttempt.administration_site_text || undefined,
            },
          },
        },
      );
      pendingAdministrationAttempts.delete(pendingScopeKey);
      setAttempt(null);
      setReview(null);
      setQuantities({});
      setDoseText("");
      setRouteText("");
      setAdministrationSite("");
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
            : "The medication administration could not be recorded."
          : `${reason instanceof Error ? reason.message : "The medication administration outcome could not be confirmed."} Retry only this exact administration after reviewing the recorded history.`,
      );
      resource.refresh();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  if (!resource.data)
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
              Loading eligible medication lots…
            </Typography>
          </Stack>
        )}
      </Paper>
    );

  const selectedProduct = selectedBatches[0]?.product_id;
  const reviewBatches = review
    ? resource.data.eligible_batches.filter((batch) =>
        review.allocations.some((allocation) => allocation.batch_id === batch.batch_id),
      )
    : [];
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
        {resource.data.site_id === null ? (
          <Alert severity="warning">
            This visit has no assigned site. Medication administration requires
            an encounter site. Review the visit location before recording a dose.
          </Alert>
        ) : !resource.data.inventory_posting_available ? (
          <Alert severity="warning">
            Inventory posting is not configured for this visit. Configure
            inventory before recording medication administration.
            <Button component="a" href="/clinic/inventory" size="small">
              Open inventory
            </Button>
          </Alert>
        ) : !resource.data.can_administer ? (
          <Alert severity="warning">
            This account cannot record medication administration for this visit.
          </Alert>
        ) : (
          <>
            <Alert severity="info">
              Select the actual lot or lots used, then enter the recorded stock
              quantity, dose, route, and administration time. No dose or lot is
              selected automatically.
            </Alert>
            {resource.data.eligible_batches.length === 0 ? (
              <Alert severity="info">
                No eligible medication lots are available at this visit site.
              </Alert>
            ) : (
              <Stack divider={<Divider flexItem />} spacing={1}>
                {resource.data.eligible_batches.map((batch) => {
                  const quantity = quantities[batch.batch_id] ?? "";
                  const selectedElsewhere =
                    selectedProduct !== undefined &&
                    selectedProduct !== batch.product_id;
                  return (
                    <Box
                      key={batch.batch_id}
                      sx={{ display: "grid", gap: 1, py: 1 }}
                    >
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={Object.prototype.hasOwnProperty.call(
                              quantities,
                              batch.batch_id,
                            )}
                            disabled={locked || selectedElsewhere}
                            onChange={(_event, checked) =>
                              setQuantities((current) => {
                                const next = { ...current };
                                if (checked) next[batch.batch_id] = "";
                                else delete next[batch.batch_id];
                                return next;
                              })
                            }
                          />
                        }
                        label={`${batch.product_name} · Lot ${batch.lot_number} · ${batch.location_name}`}
                      />
                      <Typography color="text.secondary" variant="body2">
                        Available {batch.available_quantity} {batch.stock_unit}
                        {batch.expires_on ? ` · Expires ${batch.expires_on}` : ""}
                      </Typography>
                      {Object.prototype.hasOwnProperty.call(
                        quantities,
                        batch.batch_id,
                      ) && (
                        <TextField
                          disabled={locked}
                          inputMode="decimal"
                          label={`Stock quantity (${batch.stock_unit})`}
                          onChange={(event) =>
                            setQuantities((current) => ({
                              ...current,
                              [batch.batch_id]: event.target.value,
                            }))
                          }
                          value={quantity}
                        />
                      )}
                    </Box>
                  );
                })}
              </Stack>
            )}
            <Box
              sx={{
                display: "grid",
                gap: 1.5,
                gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
              }}
            >
              <TextField
                disabled={locked}
                label="Dose given"
                onChange={(event) => setDoseText(event.target.value)}
                required
                value={doseText}
              />
              <TextField
                disabled={locked}
                label="Route"
                onChange={(event) => setRouteText(event.target.value)}
                required
                value={routeText}
              />
              <TextField
                disabled={locked}
                label="Administration time"
                onChange={(event) => setAdministeredAt(event.target.value)}
                required
                slotProps={{ inputLabel: { shrink: true } }}
                type="datetime-local"
                value={administeredAt}
              />
              <TextField
                disabled={locked}
                label="Body site (optional)"
                onChange={(event) => setAdministrationSite(event.target.value)}
                value={administrationSite}
              />
            </Box>
            {error && <Alert severity="error">{error}</Alert>}
            {attempt && (
              <Alert severity="warning">
                This administration has an unconfirmed outcome. The selected lots
                and entries are locked for an exact retry.
              </Alert>
            )}
            <Button
              disabled={locked || resource.data.eligible_batches.length === 0}
              onClick={prepareReview}
              sx={{ alignSelf: "flex-start" }}
              variant="contained"
            >
              Review administration
            </Button>
          </>
        )}
        {resource.data.administrations.length > 0 && (
          <>
            <Divider />
            <Box>
              <Typography variant="subtitle2">Recorded administrations</Typography>
              <Stack spacing={1} sx={{ mt: 1 }}>
                {resource.data.administrations.map((administration) => (
                  <Box key={administration.id} sx={{ py: 0.5 }}>
                    <Typography sx={{ fontWeight: 700 }} variant="body2">
                      {administration.product.name} · {administration.dose_text} · {administration.route_text}
                    </Typography>
                    <Typography color="text.secondary" variant="body2">
                      {administration.quantity} {administration.stock_unit} · {recordedDateTime(administration.administered_at, timezone)}
                      {administration.administration_site_text
                        ? ` · ${administration.administration_site_text}`
                        : ""}
                    </Typography>
                    <Typography color="text.secondary" variant="caption">
                      {administration.movements
                        .map(
                          (movement) =>
                            `Lot ${movement.lot_number} at ${movement.location_name}: ${movement.quantity} ${movement.stock_unit}`,
                        )
                        .join("; ")}
                    </Typography>
                  </Box>
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
        <DialogTitle>Review medication administration</DialogTitle>
        <DialogContent>
          {review && (
            <Stack spacing={1.5} sx={{ pt: 1 }}>
              <Typography>
                {patient.display_name} · Visit #{encounter.id}
              </Typography>
              <Typography color="text.secondary" variant="body2">
                Dose {review.dose_text} · Route {review.route_text} · {recordedDateTime(review.administered_at, timezone)}
                {review.administration_site_text
                  ? ` · ${review.administration_site_text}`
                  : ""}
              </Typography>
              <Typography variant="subtitle2">Selected lots</Typography>
              {reviewBatches.map((batch) => {
                const allocation = review.allocations.find(
                  (value) => value.batch_id === batch.batch_id,
                );
                return (
                  <Typography key={batch.batch_id} variant="body2">
                    {batch.product_name} · Lot {batch.lot_number} · {batch.location_name} · {allocation?.quantity} {batch.stock_unit}
                  </Typography>
                );
              })}
              {attempt && (
                <Alert severity="warning">
                  Retry submits the exact retained administration.
                </Alert>
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
            {busy
              ? "Recording…"
              : attempt
                ? "Retry exact administration"
                : "Record administration"}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
