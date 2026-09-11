import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type {
  ClinicRefillRequest,
  Patient,
  PatientCareSummary,
} from "../../api/contracts";
import { api, ApiError } from "../../api/client";
import { useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";
import { patientReferenceLabel } from "./patientReference";

type Decision = "approved" | "changed" | "declined";

const statusLabels: Record<ClinicRefillRequest["status"], string> = {
  pending: "Pending",
  in_review: "In review",
  resolved: "Completed",
  declined: "Declined",
};

export function RefillRequestQueue() {
  const { capabilities, current_clinician_profile_id: clinicianProfileId } =
    useClinic();
  const canManage =
    capabilities.patients === true &&
    capabilities.medication_requests_write === true;
  const canDecide = canManage && clinicianProfileId !== null;
  const requests = useResource<{ refill_requests: ClinicRefillRequest[] }>(
    "/api/clinic/refill_requests",
  );
  const [patientQuery, setPatientQuery] = useState("");
  const [patientOptions, setPatientOptions] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientLoading, setPatientLoading] = useState(false);
  const [medicationName, setMedicationName] = useState("");
  const [pharmacyDestination, setPharmacyDestination] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [outcomes, setOutcomes] = useState<
    Record<
      number,
      {
        patientMessage: string;
        reconciliationAcknowledged: boolean;
        reconciliationNote: string;
      }
    >
  >({});
  const [medicationSummaries, setMedicationSummaries] = useState<
    Record<
      number,
      { data?: PatientCareSummary; error?: string; loading?: boolean }
    >
  >({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const attempts = useRef(new Map<string, string>());

  useEffect(() => {
    const query = patientQuery.trim();
    if (!canManage || query.length < 2) {
      setPatientOptions([]);
      setPatientLoading(false);
      return;
    }
    let active = true;
    const timeout = window.setTimeout(() => {
      setPatientLoading(true);
      void api<{ patients: Patient[] }>(
        `/api/clinic/patients/lookup?q=${encodeURIComponent(query)}&per_page=20`,
      )
        .then((result) => {
          if (active) setPatientOptions(result.patients);
        })
        .catch(() => {
          if (active) setPatientOptions([]);
        })
        .finally(() => {
          if (active) setPatientLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [canManage, patientQuery]);

  const sortedRequests = useMemo(
    () => requests.data?.refill_requests ?? [],
    [requests.data],
  );

  const createRequest = async () => {
    if (!canManage || !selectedPatient || busyKey) return;
    const values = {
      patientId: selectedPatient.id,
      medicationName: medicationName.trim(),
      pharmacyDestination: pharmacyDestination.trim(),
      requestNote: requestNote.trim(),
    };
    if (!values.medicationName || !values.pharmacyDestination) return;
    const signature = JSON.stringify(values);
    const requestKey = attempts.current.get(signature) ?? crypto.randomUUID();
    attempts.current.set(signature, requestKey);
    setBusyKey("create");
    setError("");
    setNotice("");
    try {
      await api("/api/clinic/refill_requests", {
        method: "POST",
        body: {
          refill_request: {
            request_key: requestKey,
            patient_id: values.patientId,
            medication_name: values.medicationName,
            pharmacy_destination: values.pharmacyDestination,
            request_note: values.requestNote || undefined,
          },
        },
      });
      attempts.current.delete(signature);
      setSelectedPatient(null);
      setPatientQuery("");
      setMedicationName("");
      setPharmacyDestination("");
      setRequestNote("");
      setNotice(
        "The refill request was opened and is visible in the patient portal.",
      );
      requests.refresh();
    } catch (reason) {
      setMutationError(reason, "The refill request could not be opened.");
    } finally {
      setBusyKey(null);
    }
  };

  const setMutationError = (reason: unknown, fallback: string) => {
    const unknown =
      reason instanceof ApiError &&
      (reason.status === 408 ||
        reason.status >= 500 ||
        reason.code === "outcome_unconfirmed");
    setError(
      unknown
        ? "The outcome is not confirmed. Retry the same action before changing any details."
        : reason instanceof Error
          ? reason.message
          : fallback,
    );
  };

  const transition = async (
    request: ClinicRefillRequest,
    status: "in_review" | "resolved" | "declined",
    decision?: Decision,
  ) => {
    if (!canManage || busyKey) return;
    const outcome = outcomes[request.id] ?? {
      patientMessage: "",
      reconciliationAcknowledged: false,
      reconciliationNote: "",
    };
    const signature = JSON.stringify({
      requestId: request.id,
      status,
      decision,
      ...outcome,
    });
    const requestKey = attempts.current.get(signature) ?? crypto.randomUUID();
    attempts.current.set(signature, requestKey);
    setBusyKey(`transition:${request.id}`);
    setError("");
    setNotice("");
    try {
      await api(`/api/clinic/refill_requests/${request.id}/transition`, {
        method: "POST",
        body: {
          refill_request: {
            request_key: requestKey,
            status,
            decision,
            patient_message: decision
              ? outcome.patientMessage.trim()
              : undefined,
            reconciliation_acknowledged: decision
              ? outcome.reconciliationAcknowledged
              : undefined,
            reconciliation_note:
              decision && outcome.reconciliationNote.trim()
                ? outcome.reconciliationNote.trim()
                : undefined,
          },
        },
      });
      attempts.current.delete(signature);
      setNotice(
        status === "in_review"
          ? `Refill request #${request.id} is now in clinical review.`
          : `The ${decision} decision is now visible in the patient portal.`,
      );
      requests.refresh();
    } catch (reason) {
      setMutationError(reason, "The refill request could not be updated.");
    } finally {
      setBusyKey(null);
    }
  };

  const updateOutcome = (
    id: number,
    change: Partial<{
      patientMessage: string;
      reconciliationAcknowledged: boolean;
      reconciliationNote: string;
    }>,
  ) => {
    setOutcomes((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? {
          patientMessage: "",
          reconciliationAcknowledged: false,
          reconciliationNote: "",
        }),
        ...change,
      },
    }));
  };

  const loadMedicationSummary = async (request: ClinicRefillRequest) => {
    setMedicationSummaries((current) => ({
      ...current,
      [request.id]: { loading: true },
    }));
    try {
      const data = await api<PatientCareSummary>(
        `/api/clinic/patients/${request.patient.id}/care_summary`,
      );
      setMedicationSummaries((current) => ({
        ...current,
        [request.id]: { data },
      }));
    } catch (reason) {
      setMedicationSummaries((current) => ({
        ...current,
        [request.id]: {
          error:
            reason instanceof Error
              ? reason.message
              : "Medication history could not be loaded.",
        },
      }));
    }
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography component="h1" variant="h1">
          Refill requests
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 760 }}>
          Review patient medication and pharmacy details, record the clinical
          decision, and return an outcome to the patient portal. This queue does
          not create or transmit a prescription.
        </Typography>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}

      {canManage && (
        <Paper
          component="section"
          variant="outlined"
          sx={{ p: { xs: 2, md: 3 } }}
        >
          <Stack spacing={2}>
            <Box>
              <Typography component="h2" variant="h5">
                Open a request for a patient
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.5 }}
              >
                The patient must already have active portal access so the
                outcome has a secure destination.
              </Typography>
            </Box>
            <Autocomplete
              options={patientOptions}
              value={selectedPatient}
              inputValue={patientQuery}
              loading={patientLoading}
              filterOptions={(options) => options}
              getOptionLabel={(patient) =>
                `${patient.display_name} · ${patientReferenceLabel(patient.reference) || patient.reference}`
              }
              isOptionEqualToValue={(option, value) => option.id === value.id}
              onChange={(_, patient) => setSelectedPatient(patient)}
              onInputChange={(_, value) => setPatientQuery(value)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  required
                  label="Patient"
                  helperText="Enter at least two characters of the patient name or clinic reference."
                />
              )}
            />
            <TextField
              required
              fullWidth
              label="Medication name"
              value={medicationName}
              onChange={(event) => setMedicationName(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 240 } }}
            />
            <TextField
              required
              fullWidth
              label="Pharmacy destination"
              value={pharmacyDestination}
              onChange={(event) => setPharmacyDestination(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />
            <TextField
              fullWidth
              multiline
              minRows={2}
              label="Request note (optional)"
              value={requestNote}
              onChange={(event) => setRequestNote(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 2_000 } }}
            />
            <Button
              variant="contained"
              sx={{ alignSelf: "flex-start" }}
              disabled={
                busyKey !== null ||
                !selectedPatient ||
                !medicationName.trim() ||
                !pharmacyDestination.trim()
              }
              onClick={() => void createRequest()}
              startIcon={
                busyKey === "create" ? (
                  <CircularProgress size={18} color="inherit" />
                ) : undefined
              }
            >
              Open refill request
            </Button>
          </Stack>
        </Paper>
      )}

      <Paper
        component="section"
        variant="outlined"
        sx={{ p: { xs: 2, md: 3 } }}
      >
        <Stack spacing={2}>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", justifyContent: "space-between" }}
          >
            <Typography component="h2" variant="h5">
              Request queue
            </Typography>
            <Button size="small" onClick={requests.refresh}>
              Refresh
            </Button>
          </Stack>
          {!requests.data && !requests.error && (
            <Typography role="status">Loading refill requests…</Typography>
          )}
          {requests.error && (
            <Alert
              severity="error"
              action={
                <Button color="inherit" size="small" onClick={requests.refresh}>
                  Retry
                </Button>
              }
            >
              {requests.error}
            </Alert>
          )}
          {sortedRequests.length === 0 && requests.data && (
            <Typography color="text.secondary">No refill requests.</Typography>
          )}
          {sortedRequests.map((request) => {
            const terminal =
              request.status === "resolved" || request.status === "declined";
            const outcome = outcomes[request.id] ?? {
              patientMessage: "",
              reconciliationAcknowledged: false,
              reconciliationNote: "",
            };
            const busy = busyKey === `transition:${request.id}`;
            const medicationSummary = medicationSummaries[request.id];
            return (
              <Box
                key={request.id}
                sx={{ borderTop: "1px solid", borderColor: "divider", pt: 2 }}
              >
                <Stack spacing={1.5}>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center", flexWrap: "wrap" }}
                  >
                    <Typography sx={{ fontWeight: 700 }}>
                      {request.patient.display_name}
                      {patientReferenceLabel(request.patient.reference) &&
                        ` · ${patientReferenceLabel(request.patient.reference)}`}
                    </Typography>
                    <Chip label={statusLabels[request.status]} size="small" />
                  </Stack>
                  <Typography>
                    {request.medication_name ||
                      "Medication details unavailable"}
                  </Typography>
                  {request.pharmacy_destination && (
                    <Typography variant="body2">
                      Pharmacy: {request.pharmacy_destination}
                    </Typography>
                  )}
                  {request.request_note && (
                    <Typography sx={{ whiteSpace: "pre-wrap" }}>
                      {request.request_note}
                    </Typography>
                  )}
                  <Typography variant="body2" color="text.secondary">
                    Request #{request.id} · Opened by{" "}
                    {request.source === "staff" ? "clinic staff" : "patient"} ·{" "}
                    {new Intl.DateTimeFormat(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(request.requested_at))}
                  </Typography>

                  {terminal && request.patient_message && (
                    <Alert
                      severity={
                        request.status === "declined" ? "info" : "success"
                      }
                    >
                      {request.patient_message}
                      {request.reviewed_by && (
                        <Typography variant="caption" sx={{ display: "block" }}>
                          Reviewed by {request.reviewed_by.display_name}
                        </Typography>
                      )}
                    </Alert>
                  )}

                  {canManage && !terminal && (
                    <>
                      {!canDecide && (
                        <Alert severity="info">
                          A named clinician profile is required to approve,
                          change, or decline a refill request. You can still
                          place it in clinical review.
                        </Alert>
                      )}
                      {!medicationSummary?.data && (
                        <Button
                          variant="outlined"
                          sx={{ alignSelf: "flex-start" }}
                          disabled={medicationSummary?.loading === true}
                          onClick={() => void loadMedicationSummary(request)}
                          startIcon={
                            medicationSummary?.loading ? (
                              <CircularProgress size={18} color="inherit" />
                            ) : undefined
                          }
                        >
                          {medicationSummary?.error
                            ? "Retry medication history"
                            : "Review medication history"}
                        </Button>
                      )}
                      {medicationSummary?.error && (
                        <Alert severity="error">
                          {medicationSummary.error}
                        </Alert>
                      )}
                      {medicationSummary?.data && (
                        <Paper
                          variant="outlined"
                          sx={{ p: 2, bgcolor: "action.hover" }}
                        >
                          <Stack spacing={0.75}>
                            <Typography variant="subtitle2">
                              Current medication history
                            </Typography>
                            {medicationSummary.data.medications.items.length ===
                            0 ? (
                              <Typography
                                variant="body2"
                                color="text.secondary"
                              >
                                Medication history state:{" "}
                                {medicationSummary.data.medications.state.replaceAll(
                                  "_",
                                  " ",
                                )}
                                .
                              </Typography>
                            ) : (
                              medicationSummary.data.medications.items.map(
                                (medication) => (
                                  <Box key={medication.id}>
                                    <Typography
                                      variant="body2"
                                      sx={{ fontWeight: 700 }}
                                    >
                                      {medication.medication}
                                    </Typography>
                                    <Typography
                                      variant="caption"
                                      color="text.secondary"
                                    >
                                      {[
                                        medication.dose,
                                        medication.route,
                                        medication.frequency,
                                      ]
                                        .filter(Boolean)
                                        .join(" · ") ||
                                        "Dose, route, and frequency not recorded"}
                                    </Typography>
                                  </Box>
                                ),
                              )
                            )}
                          </Stack>
                        </Paper>
                      )}
                      <TextField
                        fullWidth
                        required
                        multiline
                        minRows={2}
                        label="Patient-visible outcome"
                        value={outcome.patientMessage}
                        onChange={(event) =>
                          updateOutcome(request.id, {
                            patientMessage: event.target.value,
                          })
                        }
                        helperText="Required for approve, change, or decline."
                        slotProps={{ htmlInput: { maxLength: 600 } }}
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={outcome.reconciliationAcknowledged}
                            disabled={!medicationSummary?.data}
                            onChange={(event) =>
                              updateOutcome(request.id, {
                                reconciliationAcknowledged:
                                  event.target.checked,
                              })
                            }
                          />
                        }
                        label="I reviewed the current medication history and reconciled the requested plan."
                      />
                      <TextField
                        fullWidth
                        label="Reconciliation note (optional)"
                        value={outcome.reconciliationNote}
                        onChange={(event) =>
                          updateOutcome(request.id, {
                            reconciliationNote: event.target.value,
                          })
                        }
                        slotProps={{ htmlInput: { maxLength: 200 } }}
                      />
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1}
                      >
                        {request.status === "pending" && (
                          <Button
                            disabled={busyKey !== null}
                            onClick={() =>
                              void transition(request, "in_review")
                            }
                          >
                            Start clinical review
                          </Button>
                        )}
                        <Button
                          variant="contained"
                          disabled={
                            busyKey !== null ||
                            !canDecide ||
                            !outcome.patientMessage.trim() ||
                            !medicationSummary?.data ||
                            !outcome.reconciliationAcknowledged
                          }
                          onClick={() =>
                            void transition(request, "resolved", "approved")
                          }
                        >
                          Approve request
                        </Button>
                        <Button
                          variant="outlined"
                          disabled={
                            busyKey !== null ||
                            !canDecide ||
                            !outcome.patientMessage.trim() ||
                            !medicationSummary?.data ||
                            !outcome.reconciliationAcknowledged
                          }
                          onClick={() =>
                            void transition(request, "resolved", "changed")
                          }
                        >
                          Record changed plan
                        </Button>
                        <Button
                          color="inherit"
                          disabled={
                            busyKey !== null ||
                            !canDecide ||
                            !outcome.patientMessage.trim()
                          }
                          onClick={() =>
                            void transition(request, "declined", "declined")
                          }
                        >
                          Decline request
                        </Button>
                      </Stack>
                      {busy && (
                        <Typography role="status">Saving decision…</Typography>
                      )}
                    </>
                  )}
                </Stack>
              </Box>
            );
          })}
        </Stack>
      </Paper>
    </Stack>
  );
}
