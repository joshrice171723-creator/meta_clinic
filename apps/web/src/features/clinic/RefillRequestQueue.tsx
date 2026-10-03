import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type {
  ClinicRefillRequest,
  Encounter,
  Patient,
  PatientCareSummary,
} from "../../api/contracts";
import { api, ApiError } from "../../api/client";
import { useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";
import { patientReferenceLabel } from "./patientReference";
import {
  refillApprovalAttempt,
  refillApprovalReady,
  submitRefillApproval,
  type RefillReviewResult,
} from "./refillReviewBatch";

type Decision = "approved" | "changed" | "declined";
type CreateAttempt = {
  signature: string;
  patientLabel: string;
  body: Readonly<{
    refill_request: Readonly<{
      request_key: string;
      patient_id: number;
      medication_name: string;
      pharmacy_destination: string;
      medication_request_series_id: string | undefined;
      request_note: string | undefined;
    }>;
  }>;
  uncertain: boolean;
};
type PriorPrescription = {
  id: number;
  series_id: string;
  version_number: number;
  status: string;
  medication_name: string;
  pharmacy_name: string | null;
  pharmacy_location: string | null;
  recorded_at: string;
};

const statusLabels: Record<ClinicRefillRequest["status"], string> = {
  pending: "Pending",
  in_review: "In review",
  resolved: "Completed",
  declined: "Declined",
};

export function RefillRequestQueue() {
  const clinic = useClinic();
  const { capabilities, current_clinician_profile_id: clinicianProfileId } =
    clinic;
  const canManage =
    capabilities.patients === true &&
    capabilities.medication_requests_write === true;
  const canDecide = canManage && clinicianProfileId !== null;
  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [requestPage, setRequestPage] = useState(1);
  const [deliveryFilter, setDeliveryFilter] = useState<"all" | "failed">("all");
  const requests = useResource<{
    refill_requests: ClinicRefillRequest[];
    pagination: { page: number; per_page: number; total: number };
  }>(
    `/api/clinic/refill_requests?page=${requestPage}&per_page=25${deliveryFilter === "failed" ? "&delivery=failed" : ""}`,
    { retainDataOnRefresh: true },
  );
  const [patientQuery, setPatientQuery] = useState("");
  const [patientOptions, setPatientOptions] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientLoading, setPatientLoading] = useState(false);
  const [medicationName, setMedicationName] = useState("");
  const [pharmacyDestination, setPharmacyDestination] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [priorPrescriptions, setPriorPrescriptions] = useState<
    PriorPrescription[]
  >([]);
  const [priorPrescription, setPriorPrescription] =
    useState<PriorPrescription | null>(null);
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
      {
        data?: PatientCareSummary;
        encounters?: Encounter[];
        error?: string;
        loading?: boolean;
      }
    >
  >({});
  const [encounterSelections, setEncounterSelections] = useState<
    Record<number, number | "">
  >({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const attempts = useRef(new Map<string, string>());
  const createAttempt = useRef<CreateAttempt | null>(null);
  const createInFlight = useRef(false);
  const createAllowed = useRef(canManage);
  createAllowed.current = canManage;
  const [createRetryPending, setCreateRetryPending] = useState(false);
  const [selectedRequests, setSelectedRequests] = useState<number[]>([]);
  const [batchResults, setBatchResults] = useState<
    Record<number, RefillReviewResult>
  >({});
  const batchInFlight = useRef(false);
  const decisionContext = `${clinic.user_id}:${clinic.practice?.id}:${clinic.authorization_generation}:${clinicianProfileId}:${canDecide}`;
  const currentDecisionContext = useRef(decisionContext);
  currentDecisionContext.current = decisionContext;
  useEffect(() => {
    currentDecisionContext.current = decisionContext;
    setSelectedRequests([]);
    setBatchResults({});
    setOutcomes({});
    setMedicationSummaries({});
    setEncounterSelections({});
    return () => {
      currentDecisionContext.current = "";
    };
  }, [decisionContext]);

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
  useEffect(() => {
    if (!selectedPatient || !canManage) {
      setPriorPrescriptions([]);
      setPriorPrescription(null);
      return;
    }
    const controller = new AbortController();
    void api<{ prescription_orders: PriorPrescription[] }>(
      `/api/clinic/patients/${selectedPatient.id}/medication_request_series`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted)
          setPriorPrescriptions(result.prescription_orders);
      })
      .catch(() => {
        if (!controller.signal.aborted) setPriorPrescriptions([]);
      });
    return () => controller.abort();
  }, [canManage, selectedPatient]);

  const sortedRequests = useMemo(
    () => requests.data?.refill_requests ?? [],
    [requests.data],
  );
  const requestSummary = useMemo(
    () =>
      sortedRequests.reduce(
        (summary, request) => {
          summary[request.status] += 1;
          if (request.response_delivery_state === "failed")
            summary.deliveryFailures += 1;
          return summary;
        },
        {
          pending: 0,
          in_review: 0,
          resolved: 0,
          declined: 0,
          deliveryFailures: 0,
        },
      ),
    [sortedRequests],
  );

  const createRequest = async () => {
    if (
      !createAllowed.current ||
      busyKey ||
      createInFlight.current ||
      batchInFlight.current
    )
      return;
    let attempt = createAttempt.current;
    if (!attempt) {
      if (!selectedPatient) return;
      const values = {
        patientId: selectedPatient.id,
        medicationName: medicationName.trim(),
        pharmacyDestination: pharmacyDestination.trim(),
        medicationRequestSeriesId: priorPrescription?.series_id,
        requestNote: requestNote.trim(),
      };
      if (!values.medicationName || !values.pharmacyDestination) return;
      const signature = JSON.stringify(values);
      const requestKey = attempts.current.get(signature) ?? crypto.randomUUID();
      attempts.current.set(signature, requestKey);
      attempt = {
        signature,
        patientLabel: `${selectedPatient.display_name} - ${patientReferenceLabel(selectedPatient.reference) || selectedPatient.reference}`,
        body: Object.freeze({
          refill_request: Object.freeze({
            request_key: requestKey,
            patient_id: values.patientId,
            medication_name: values.medicationName,
            pharmacy_destination: values.pharmacyDestination,
            medication_request_series_id: values.medicationRequestSeriesId,
            request_note: values.requestNote || undefined,
          }),
        }),
        uncertain: false,
      };
      createAttempt.current = attempt;
    }
    createInFlight.current = true;
    setCreateFormOpen(true);
    setBusyKey("create");
    setError("");
    setNotice("");
    try {
      const result = await api<{ refill_request: ClinicRefillRequest }>(
        "/api/clinic/refill_requests",
        { method: "POST", body: attempt.body },
      );
      const saved = result?.refill_request;
      const submitted = attempt.body.refill_request;
      if (
        saved?.patient?.id !== submitted.patient_id ||
        saved.medication_name !== submitted.medication_name ||
        saved.pharmacy_destination !== submitted.pharmacy_destination ||
        (saved.request_note ?? "") !== (submitted.request_note ?? "") ||
        saved.source !== "staff"
      ) {
        throw new ApiError(
          502,
          "The saved refill request could not be matched to this attempt.",
          "outcome_unconfirmed",
        );
      }
      attempts.current.delete(attempt.signature);
      createAttempt.current = null;
      setCreateRetryPending(false);
      setSelectedPatient(null);
      setPatientQuery("");
      setMedicationName("");
      setPharmacyDestination("");
      setPriorPrescription(null);
      setRequestNote("");
      setNotice("The refill request was opened for clinical review.");
      requests.refresh();
    } catch (reason) {
      const unknown =
        !(reason instanceof ApiError) ||
        reason.status === 408 ||
        reason.status >= 500 ||
        reason.code === "outcome_unconfirmed";
      // A later rejection cannot resolve an earlier uncertain write.
      attempt.uncertain ||= unknown;
      if (attempt.uncertain) {
        setCreateRetryPending(true);
      } else {
        attempts.current.delete(attempt.signature);
        createAttempt.current = null;
        setCreateRetryPending(false);
      }
      setError(
        unknown
          ? "The refill request outcome is not confirmed. Retry the same request before opening another."
          : reason instanceof Error
            ? reason.message
            : "The refill request could not be opened.",
      );
    } finally {
      createInFlight.current = false;
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
    if (
      !canManage ||
      busyKey ||
      batchInFlight.current ||
      batchResults[request.id]?.state === "saved" ||
      batchResults[request.id]?.state === "unknown"
    )
      return;
    const outcome = outcomes[request.id] ?? {
      patientMessage: "",
      reconciliationAcknowledged: false,
      reconciliationNote: "",
    };
    const signature = JSON.stringify({
      requestId: request.id,
      status,
      decision,
      encounterId: encounterSelections[request.id] || null,
      ...outcome,
    });
    const requestKey = attempts.current.get(signature) ?? crypto.randomUUID();
    attempts.current.set(signature, requestKey);
    setBusyKey(`transition:${request.id}`);
    setError("");
    setNotice("");
    try {
      const result = await api<{ refill_request: ClinicRefillRequest }>(
        `/api/clinic/refill_requests/${request.id}/transition`,
        {
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
              encounter_id:
                status === "resolved"
                  ? encounterSelections[request.id] || undefined
                  : undefined,
            },
          },
        },
      );
      attempts.current.delete(signature);
      const delivery = result.refill_request.response_delivery_state;
      setNotice(
        status === "in_review"
          ? `Refill request #${request.id} is now in clinical review.`
          : delivery === "delivered"
            ? `The ${decision} decision was saved and delivered in the patient portal.`
            : `The ${decision} decision was saved. Portal delivery needs staff follow-up.`,
      );
      requests.refresh();
    } catch (reason) {
      setMutationError(reason, "The refill request could not be updated.");
    } finally {
      setBusyKey(null);
    }
  };

  const retryDelivery = async (request: ClinicRefillRequest) => {
    if (!canManage || busyKey || batchInFlight.current) return;
    const signature = `retry-delivery:${request.id}`;
    const requestKey = attempts.current.get(signature) ?? crypto.randomUUID();
    attempts.current.set(signature, requestKey);
    setBusyKey(signature);
    setError("");
    setNotice("");
    try {
      const result = await api<{ refill_request: ClinicRefillRequest }>(
        `/api/clinic/refill_requests/${request.id}/retry_delivery`,
        {
          method: "POST",
          body: { delivery: { request_key: requestKey } },
        },
      );
      attempts.current.delete(signature);
      setNotice(
        result.refill_request.response_delivery_state === "delivered"
          ? `Refill response #${request.id} was delivered in the patient portal.`
          : `Refill response #${request.id} still has no active portal destination.`,
      );
      if (deliveryFilter === "failed") setRequestPage(1);
      requests.refresh();
    } catch (reason) {
      setMutationError(reason, "The refill response could not be delivered.");
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
        ...("patientMessage" in change || "reconciliationNote" in change
          ? { reconciliationAcknowledged: false }
          : {}),
      },
    }));
  };

  const loadMedicationSummary = async (request: ClinicRefillRequest) => {
    const context = currentDecisionContext.current;
    updateOutcome(request.id, { reconciliationAcknowledged: false });
    setMedicationSummaries((current) => ({
      ...current,
      [request.id]: { loading: true },
    }));
    try {
      const [data, encounterPage] = await Promise.all([
        api<PatientCareSummary>(
          `/api/clinic/patients/${request.patient.id}/care_summary`,
        ),
        api<{ encounters: Encounter[] }>(
          `/api/clinic/encounters?patient_id=${request.patient.id}&status=open&per_page=50`,
        ),
      ]);
      if (currentDecisionContext.current !== context) return;
      if (data.patient_id !== request.patient.id)
        throw new Error("Medication history did not match this patient.");
      const encounters = encounterPage.encounters.filter(
        (encounter) =>
          encounter.site_id != null &&
          encounter.patient_id === request.patient.id &&
          encounter.status === "open",
      );
      setMedicationSummaries((current) => ({
        ...current,
        [request.id]: { data, encounters },
      }));
      if (encounters.length === 1)
        setEncounterSelections((current) => ({
          ...current,
          [request.id]: encounters[0].id,
        }));
    } catch (reason) {
      if (currentDecisionContext.current !== context) return;
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

  const selected = sortedRequests.filter((request) =>
    selectedRequests.includes(request.id),
  );
  const batchReady =
    canDecide &&
    !requests.error &&
    selected.length > 0 &&
    selected.length === selectedRequests.length &&
    selected.every(
      (request) =>
        !batchResults[request.id] &&
        refillApprovalReady(
          request,
          outcomes[request.id],
          medicationSummaries[request.id]?.data,
          medicationSummaries[request.id]?.encounters,
          encounterSelections[request.id],
        ),
    );

  const submitBatch = async (retry?: RefillReviewResult) => {
    if (
      !canDecide ||
      busyKey ||
      batchInFlight.current ||
      (retry
        ? retry.state === "saved" ||
          retry.attempt.clinicianProfileId !== clinicianProfileId
        : !batchReady)
    )
      return;
    const context = currentDecisionContext.current;
    const batch = retry
      ? [retry.attempt]
      : selected.map((request) =>
          refillApprovalAttempt(
            request,
            outcomes[request.id],
            Number(encounterSelections[request.id]),
            clinicianProfileId!,
          ),
        );
    batchInFlight.current = true;
    setBusyKey("batch");
    setError("");
    setNotice("");
    try {
      for (const attempt of batch) {
        // A changed account/authority stops unsent decisions and ignores old responses.
        if (currentDecisionContext.current !== context) break;
        const result = await submitRefillApproval(
          attempt,
          api,
          retry?.state === "unknown",
        );
        if (currentDecisionContext.current !== context) break;
        setBatchResults((current) => ({
          ...current,
          [attempt.request.id]: result,
        }));
        setSelectedRequests((current) =>
          current.filter((id) => id !== attempt.request.id),
        );
      }
      if (currentDecisionContext.current === context) requests.refresh();
    } finally {
      batchInFlight.current = false;
      setBusyKey(null);
    }
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography component="h1" variant="h1">
          Refill requests
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 760 }}>
          Review the request, record the decision, and send the patient outcome.
        </Typography>
      </Box>
      <Accordion disableGutters elevation={0} variant="outlined">
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography component="span" variant="body2">
            Refill workflow details
          </Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0 }}>
          <Typography variant="body2" color="text.secondary">
            Approval creates an authorized medication order in the selected
            encounter. Pharmacy transmission follows in a separate workflow.
          </Typography>
        </AccordionDetails>
      </Accordion>
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}
      {canDecide && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={1}>
            <Typography component="h2" variant="h5">
              Batch clinician review
            </Typography>
            <Typography variant="body2">
              Select requests individually to open their medication histories.
              Review each patient, encounter and response, then attest to each
              plan before submitting.
            </Typography>
            <Button
              variant="contained"
              disabled={busyKey !== null || !batchReady}
              onClick={() => void submitBatch()}
            >
              Approve selected reviewed requests ({selectedRequests.length})
            </Button>
            {selectedRequests.length > 0 && !batchReady && (
              <Typography variant="body2">
                Each selected request needs matching medication history, an open
                encounter, a patient response and reconciliation before
                approval.
              </Typography>
            )}
            {busyKey === "batch" && (
              <Typography role="status">
                Submitting reviewed requests individually.
              </Typography>
            )}
            {Object.values(batchResults).map((result) => (
              <Alert
                key={result.attempt.request.id}
                severity={
                  result.state === "saved"
                    ? "success"
                    : result.state === "unknown"
                      ? "warning"
                      : "error"
                }
              >
                Request #{result.attempt.request.id} ·{" "}
                {result.attempt.request.patient.display_name} ·{" "}
                {patientReferenceLabel(
                  result.attempt.request.patient.reference,
                ) || result.attempt.request.patient.reference}{" "}
                · {result.attempt.request.medication_name} · Encounter #
                {result.attempt.body.refill_request.encounter_id}:{" "}
                {result.message}
                {result.state !== "saved" && (
                  <Button
                    color="inherit"
                    disabled={busyKey !== null}
                    onClick={() => void submitBatch(result)}
                  >
                    Retry exact decision #{result.attempt.request.id}
                  </Button>
                )}
                {result.state === "failed" && (
                  <Button
                    color="inherit"
                    disabled={busyKey !== null}
                    onClick={() => {
                      setBatchResults((current) => {
                        const next = { ...current };
                        delete next[result.attempt.request.id];
                        return next;
                      });
                      updateOutcome(result.attempt.request.id, {
                        reconciliationAcknowledged: false,
                      });
                    }}
                  >
                    Edit and review again #{result.attempt.request.id}
                  </Button>
                )}
              </Alert>
            ))}
          </Stack>
        </Paper>
      )}
      {canManage && createRetryPending && createAttempt.current && (
        <Alert severity="warning">
          The outcome for {createAttempt.current.patientLabel}:{" "}
          {createAttempt.current.body.refill_request.medication_name} at{" "}
          {createAttempt.current.body.refill_request.pharmacy_destination}{" "}
          remains unconfirmed. Retry the same refill request. Edits below are
          not sent by this retry.
        </Alert>
      )}
      {requests.data && (
        <>
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{ flexWrap: "wrap" }}
            aria-label="Refill queue summary"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <Chip
              label={`${requestSummary.pending} pending`}
              color={requestSummary.pending > 0 ? "warning" : "success"}
              size="small"
            />
            <Chip
              label={`${requestSummary.in_review} in review`}
              color="info"
              size="small"
              variant="outlined"
            />
            <Chip
              label={`${requestSummary.deliveryFailures} delivery follow-up`}
              color={requestSummary.deliveryFailures > 0 ? "error" : "default"}
              size="small"
              variant="outlined"
            />
            <Chip
              label="Next action: clinician review"
              size="small"
              variant="outlined"
            />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Counts reflect this page of {requests.data.pagination.total}{" "}
            matching requests.
          </Typography>
        </>
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
            <Button
              size="small"
              disabled={busyKey !== null}
              onClick={requests.refresh}
            >
              Refresh
            </Button>
          </Stack>
          <TextField
            select
            label="Show requests"
            disabled={busyKey !== null || selectedRequests.length > 0}
            value={deliveryFilter}
            onChange={(event) => {
              setDeliveryFilter(event.target.value as "all" | "failed");
              setRequestPage(1);
            }}
            sx={{ maxWidth: 280 }}
          >
            <MenuItem value="all">All refill requests</MenuItem>
            <MenuItem value="failed">Portal delivery follow-up</MenuItem>
          </TextField>
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
            <Typography color="text.secondary">
              No matching refill requests.
            </Typography>
          )}
          {requests.data && requests.data.pagination.total > 25 && (
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Button
                size="small"
                disabled={
                  busyKey !== null ||
                  selectedRequests.length > 0 ||
                  requestPage <= 1
                }
                onClick={() => setRequestPage((page) => page - 1)}
              >
                Previous
              </Button>
              <Typography variant="body2">
                Page {requests.data.pagination.page} of{" "}
                {Math.ceil(
                  requests.data.pagination.total /
                    requests.data.pagination.per_page,
                )}
              </Typography>
              <Button
                size="small"
                disabled={
                  busyKey !== null ||
                  selectedRequests.length > 0 ||
                  requestPage * requests.data.pagination.per_page >=
                    requests.data.pagination.total
                }
                onClick={() => setRequestPage((page) => page + 1)}
              >
                Next
              </Button>
            </Stack>
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
            const decisionLocked =
              busyKey !== null || !!batchResults[request.id];
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
                    {canDecide && !terminal && (
                      <Checkbox
                        checked={selectedRequests.includes(request.id)}
                        disabled={decisionLocked || !!batchResults[request.id]}
                        slotProps={{
                          input: {
                            "aria-label": `Select request #${request.id} for ${request.patient.display_name} for batch review`,
                          },
                        }}
                        onChange={(_, checked) => {
                          setSelectedRequests((current) =>
                            checked
                              ? [...current, request.id]
                              : current.filter((id) => id !== request.id),
                          );
                          if (
                            checked &&
                            !medicationSummary?.data &&
                            !medicationSummary?.loading
                          )
                            void loadMedicationSummary(request);
                        }}
                      />
                    )}
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
                  {terminal && request.response_delivery_state === "failed" && (
                    <Alert severity="warning">
                      The decision is saved, but no active patient portal
                      destination was available. Contact the patient through an
                      approved clinic channel.
                      {canManage && (
                        <Button
                          color="inherit"
                          size="small"
                          sx={{ ml: 1 }}
                          disabled={busyKey === `retry-delivery:${request.id}`}
                          onClick={() => void retryDelivery(request)}
                        >
                          {busyKey === `retry-delivery:${request.id}`
                            ? "Retrying…"
                            : "Retry portal delivery"}
                        </Button>
                      )}
                    </Alert>
                  )}
                  {terminal && request.medication_request_revision_id && (
                    <Typography variant="body2" color="text.secondary">
                      Medication order revision #
                      {request.medication_request_revision_id} is linked to
                      encounter #{request.source_encounter_id}.
                    </Typography>
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
                      {medicationSummary?.data && (
                        <TextField
                          select
                          fullWidth
                          required
                          disabled={decisionLocked}
                          label="Encounter for the medication order"
                          value={encounterSelections[request.id] ?? ""}
                          onChange={(event) => {
                            updateOutcome(request.id, {
                              reconciliationAcknowledged: false,
                            });
                            setEncounterSelections((current) => ({
                              ...current,
                              [request.id]: Number(event.target.value),
                            }));
                          }}
                          helperText={
                            medicationSummary.encounters?.length
                              ? "Approvals and changed plans create an authoritative medication order in this open encounter."
                              : "Open an encounter with a facility before approving or changing the refill plan."
                          }
                        >
                          {(medicationSummary.encounters ?? []).map(
                            (encounter) => (
                              <MenuItem key={encounter.id} value={encounter.id}>
                                Encounter #{encounter.id} ·{" "}
                                {new Intl.DateTimeFormat(undefined, {
                                  dateStyle: "medium",
                                }).format(new Date(encounter.started_at))}
                              </MenuItem>
                            ),
                          )}
                        </TextField>
                      )}
                      <TextField
                        fullWidth
                        required
                        multiline
                        disabled={decisionLocked}
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
                            disabled={
                              decisionLocked || !medicationSummary?.data
                            }
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
                        disabled={decisionLocked}
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
                            disabled={
                              decisionLocked ||
                              selectedRequests.includes(request.id)
                            }
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
                            decisionLocked ||
                            selectedRequests.includes(request.id) ||
                            !canDecide ||
                            !outcome.patientMessage.trim() ||
                            !medicationSummary?.data ||
                            !encounterSelections[request.id] ||
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
                            decisionLocked ||
                            selectedRequests.includes(request.id) ||
                            !canDecide ||
                            !outcome.patientMessage.trim() ||
                            !medicationSummary?.data ||
                            !encounterSelections[request.id] ||
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
                            decisionLocked ||
                            selectedRequests.includes(request.id) ||
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
      {canManage && (
        <Accordion
          disableGutters
          elevation={0}
          variant="outlined"
          expanded={createFormOpen || createRetryPending}
          onChange={(_, expanded) => {
            if (
              !expanded &&
              (busyKey === "create" || createRetryPending || error !== "")
            )
              return;
            setCreateFormOpen(expanded);
          }}
          slotProps={{
            heading: { component: "h2" },
            transition: { unmountOnExit: false },
          }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            id="refill-create-header"
            aria-controls="refill-create-content"
            sx={{ px: { xs: 2, md: 3 }, minHeight: 44 }}
          >
            <Typography component="span" variant="h5">
              Open a request for a patient
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ p: { xs: 2, md: 3 }, pt: 0 }}>
            <Stack spacing={2}>
              <Box>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.5 }}
                >
                  Staff can open the request even when the patient has no portal
                  account. The saved decision will show whether portal delivery
                  succeeded or needs staff follow-up.
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
              <Autocomplete
                options={priorPrescriptions}
                value={priorPrescription}
                onChange={(_event, value) => {
                  setPriorPrescription(value);
                  if (value) {
                    setMedicationName(value.medication_name);
                    setPharmacyDestination(
                      [value.pharmacy_name, value.pharmacy_location]
                        .filter(Boolean)
                        .join(" · "),
                    );
                  }
                }}
                getOptionLabel={(order) =>
                  `${order.medication_name} · version ${order.version_number} · ${order.status}`
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Prior prescription (optional)"
                    helperText="Selecting one links this refill to the prior prescription series and copies its destination for review."
                  />
                )}
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
                  (!createRetryPending &&
                    (!selectedPatient ||
                      !medicationName.trim() ||
                      !pharmacyDestination.trim()))
                }
                onClick={() => void createRequest()}
                startIcon={
                  busyKey === "create" ? (
                    <CircularProgress size={18} color="inherit" />
                  ) : undefined
                }
              >
                {createRetryPending
                  ? "Retry same refill request"
                  : "Open refill request"}
              </Button>
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}
    </Stack>
  );
}
