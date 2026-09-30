import {
  Alert,
  Autocomplete,
  Box,
  Button,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../api/client";
import type { MedicationRequestRevision } from "../../api/contracts";

type Event = {
  id: number;
  medication_request_revision_id: number;
  prior_event_id: number | null;
  kind: string;
  source: string;
  note: string | null;
  recorded_at: string;
};
type PharmacyDestination = {
  id: number;
  name: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state_code: string;
  postal_code: string;
  phone_number: string | null;
  pharmacy_identifier: string | null;
  active: boolean;
};
type Preparation = {
  id: number;
  medication_request_revision_id: number;
  pharmacy_destination_id: number;
  review_event_id: number;
  payload_digest: string;
  prepared_at: string;
  source: "local_preparation";
  state: "prepared" | "submitted";
  current: boolean;
  submission_attempt_id: number | null;
  submission_outcome: string | null;
  mode: "standard" | "controlled_test";
  signer_snapshot: Record<string, string>;
  reviewer_snapshot: Record<string, string>;
  destination_snapshot: Pick<
    PharmacyDestination,
    "id" | "name" | "city" | "state_code" | "postal_code"
  >;
};
type TransmissionAttempt = {
  id: number;
  medication_request_revision_id: number;
  pharmacy_destination_id: number;
  prescription_event_id: number;
  adapter: "simulated_pharmacy_network";
  mode: "standard" | "controlled_test";
  outcome: string;
  request_key: string;
  source: "simulation" | null;
  transaction_type: "NewRx" | null;
  schema_version: string | null;
  payload_digest: string | null;
  correlation_id: string | null;
  review_event_id: number | null;
  prior_attempt_id: number | null;
  preparation_id: number | null;
  signer_snapshot: Record<string, string>;
  reviewer_snapshot: Record<string, string>;
  destination_snapshot: Pick<
    PharmacyDestination,
    "id" | "name" | "city" | "state_code" | "postal_code"
  >;
  submitted_at: string;
};

export function PrescriptionAttemptEvidence({
  attempt,
}: {
  attempt: TransmissionAttempt;
}) {
  return (
    <Typography variant="body2">
      Simulated pharmacy network · {attempt.mode.replaceAll("_", " ")} ·{" "}
      {attempt.outcome.replaceAll("_", " ")} ·{" "}
      {attempt.destination_snapshot.name} ·{" "}
      {new Date(attempt.submitted_at).toLocaleString()}
      {attempt.review_event_id && attempt.correlation_id
        ? ` · ${attempt.transaction_type} · version record ${attempt.medication_request_revision_id} · review #${attempt.review_event_id} · correlation ${attempt.correlation_id}${attempt.prior_attempt_id ? ` · follows attempt #${attempt.prior_attempt_id}` : ""}`
        : " · Historical attempt provenance unavailable"}
      {attempt.preparation_id
        ? ` · preparation #${attempt.preparation_id}`
        : " · Historical preparation unavailable"}
      {attempt.mode === "controlled_test" &&
        ` · signer ${attempt.signer_snapshot.state ?? "unknown"} · reviewer ${attempt.reviewer_snapshot.state ?? "unknown"}`}
    </Typography>
  );
}
type LifecycleRequest = {
  id: number;
  transmission_attempt_id: number;
  medication_request_revision_id: number;
  action: "cancel" | "fill_notice";
  state: string;
  source: "local_request";
  requested_at: string;
  correlation_id: string;
  attempt_correlation_id: string;
  owner: string;
};
type ResponseEvent = {
  id: number;
  transmission_attempt_id: number;
  medication_request_revision_id: number;
  lifecycle_request_id: number | null;
  event_kind: "received" | "local_outcome";
  source: "simulation";
  source_identity: "simulated_pharmacy_network";
  source_message_id: string | null;
  transaction_type: "NewRx" | "CancelRx" | "RxFill";
  outcome: string;
  response_code: string | null;
  response_text: string | null;
  received_at: string | null;
  recorded_at: string;
  attempt_correlation_id: string;
  lifecycle_correlation_id: string | null;
  resolution_event_id: number | null;
};
type Dispense = {
  id: number;
  original_dispense_id: number | null;
  status: string;
  quantity: string;
  stock_unit: string;
  reason: string | null;
  handed_over_at: string;
};
type Evidence = {
  events: Event[];
  dispenses: Dispense[];
  remaining_quantity: string | null;
  transmission_available: true;
  attempts: TransmissionAttempt[];
  preparations: Preparation[];
  lifecycle_requests?: LifecycleRequest[];
  response_events?: ResponseEvent[];
};
type Batch = {
  batch_id: number;
  product_id: number;
  lot_number: string;
  available_quantity: string;
  stock_unit: string;
  expires_on: string;
};

export function PrescriptionFulfillmentPanel({
  patientId,
  encounterId,
  orders,
  canWrite,
  preferredOrderId,
}: {
  patientId: number;
  encounterId: number;
  orders: MedicationRequestRevision[];
  canWrite: boolean;
  preferredOrderId?: number;
}) {
  const [orderId, setOrderId] = useState(
    preferredOrderId && orders.some((order) => order.id === preferredOrderId)
      ? preferredOrderId
      : (orders[0]?.id ?? 0),
  );
  const [evidence, setEvidence] = useState<Evidence>();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [canDispense, setCanDispense] = useState(false);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [quantity, setQuantity] = useState("");
  const [when, setWhen] = useState("");
  const [note, setNote] = useState("");
  const [scenario, setScenario] = useState("failure_before_send");
  const [simulationMode, setSimulationMode] = useState<
    "standard" | "controlled_test"
  >("standard");
  const [signerState, setSignerState] = useState("active");
  const [reviewerState, setReviewerState] = useState("active");
  const [destinations, setDestinations] = useState<PharmacyDestination[]>([]);
  const [destination, setDestination] = useState<PharmacyDestination | null>(
    null,
  );
  const [destinationForm, setDestinationForm] = useState({
    name: "",
    address_line1: "",
    city: "",
    state_code: "",
    postal_code: "",
  });
  const [destinationAttempt, setDestinationAttempt] = useState<{
    form: typeof destinationForm;
    requestKey: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [pending, setPending] = useState<{
    path: string;
    body: unknown;
  } | null>(null);
  const generation = useRef(0);
  const order = orders.find((row) => row.id === orderId);
  const path = `/api/clinic/patients/${patientId}/medication_requests/${orderId}`;
  const pendingPath = useRef(path);
  useEffect(() => {
    if (preferredOrderId && orders.some((row) => row.id === preferredOrderId)) {
      setOrderId(preferredOrderId);
    } else if (!orders.some((row) => row.id === orderId)) {
      setOrderId(orders[0]?.id ?? 0);
    }
  }, [orders, orderId, preferredOrderId]);
  useEffect(() => {
    const controller = new AbortController();
    generation.current += 1;
    setEvidence(undefined);
    setError("");
    if (pendingPath.current !== path) {
      pendingPath.current = path;
      setPending(null);
    }
    setNote("");
    setBatch(null);
    setQuantity("");
    setWhen("");
    setBusy(false);
    void api<Evidence>(`${path}/events`, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setEvidence(result);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Prescription history is unavailable.",
          );
      });
    return () => controller.abort();
  }, [path, reload]);
  useEffect(() => {
    const controller = new AbortController();
    void api<{ eligible_batches: Batch[]; can_administer: boolean }>(
      `/api/clinic/encounters/${encounterId}/medication_administrations`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setBatches(result.eligible_batches);
          setCanDispense(result.can_administer);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setBatches([]);
          setCanDispense(false);
        }
      });
    return () => controller.abort();
  }, [encounterId, reload]);
  useEffect(() => {
    const controller = new AbortController();
    void api<{ pharmacy_destinations: PharmacyDestination[] }>(
      "/api/clinic/pharmacy_destinations",
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted)
          setDestinations(result.pharmacy_destinations);
      })
      .catch(() => {
        if (!controller.signal.aborted) setDestinations([]);
      });
    return () => controller.abort();
  }, [reload]);
  async function execute(attempt: { path: string; body: unknown }) {
    const started = generation.current;
    setBusy(true);
    setError("");
    setPending(attempt);
    try {
      await api(attempt.path, { method: "POST", body: attempt.body });
      if (started === generation.current) {
        setPending(null);
        setReload((value) => value + 1);
      }
    } catch (reason) {
      if (started === generation.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "Outcome is not confirmed. Refresh or retry this exact request.",
        );
    } finally {
      if (started === generation.current) setBusy(false);
    }
  }
  function event(kind: string, source: string, prior?: Event) {
    void execute({
      path: `${path}/events`,
      body: {
        prescription_event: {
          kind,
          source,
          prior_event_id: prior?.id,
          note,
          request_key: crypto.randomUUID(),
        },
      },
    });
  }
  function prepare() {
    if (!destination) return;
    void execute({
      path: `${path}/prepare`,
      body: {
        prescription_preparation: {
          pharmacy_destination_id: destination.id,
          mode: simulationMode,
          signer_state:
            simulationMode === "controlled_test" ? signerState : undefined,
          reviewer_state:
            simulationMode === "controlled_test" ? reviewerState : undefined,
          request_key: crypto.randomUUID(),
        },
      },
    });
  }
  function submit() {
    if (!destination || !preparation) {
      setError(
        "Save a current preparation for this prescription and pharmacy first.",
      );
      return;
    }
    void execute({
      path: `${path}/submit`,
      body: {
        prescription_submission: {
          preparation_id: preparation.id,
          pharmacy_destination_id: destination.id,
          scenario,
          mode: simulationMode,
          signer_state:
            simulationMode === "controlled_test" ? signerState : undefined,
          reviewer_state:
            simulationMode === "controlled_test" ? reviewerState : undefined,
          request_key: crypto.randomUUID(),
        },
      },
    });
  }
  function requestLifecycle(action: "cancel" | "fill_notice", attempt: TransmissionAttempt) {
    void execute({
      path: `${path}/lifecycle_requests`,
      body: {
        prescription_lifecycle_request: {
          attempt_id: attempt.id,
          action,
          request_key: crypto.randomUUID(),
        },
      },
    });
  }
  function receiveResponse(attemptId: number, scenario: string, request?: LifecycleRequest) {
    void execute({
      path: `${path}/simulated_responses`,
      body: {
        prescription_response: {
          attempt_id: attemptId,
          lifecycle_request_id: request?.id,
          scenario,
          request_key: crypto.randomUUID(),
        },
      },
    });
  }
  async function createDestination() {
    const started = generation.current;
    const attempt = destinationAttempt ?? {
      form: { ...destinationForm },
      requestKey: crypto.randomUUID(),
    };
    setDestinationAttempt(attempt);
    setBusy(true);
    setError("");
    try {
      const result = await api<{ pharmacy_destination: PharmacyDestination }>(
        "/api/clinic/pharmacy_destinations",
        {
          method: "POST",
          body: {
            pharmacy_destination: {
              ...attempt.form,
              request_key: attempt.requestKey,
            },
          },
        },
      );
      if (started === generation.current) {
        setDestinationAttempt(null);
        setDestinations((current) =>
          current.some((item) => item.id === result.pharmacy_destination.id)
            ? current
            : [...current, result.pharmacy_destination],
        );
        setDestination(result.pharmacy_destination);
        setDestinationForm({
          name: "",
          address_line1: "",
          city: "",
          state_code: "",
          postal_code: "",
        });
      }
    } catch (reason) {
      if (started === generation.current) {
        if (
          reason instanceof ApiError &&
          reason.status >= 400 &&
          reason.status < 500
        )
          setDestinationAttempt(null);
        setError(
          reason instanceof Error
            ? reason.message
            : "The pharmacy destination could not be saved.",
        );
      }
    } finally {
      if (started === generation.current) setBusy(false);
    }
  }
  function dispense(status: string, originalId?: number) {
    const timestamp = new Date(when);
    if (!when || !Number.isFinite(timestamp.getTime())) {
      setError("Record the actual handover or correction time.");
      return;
    }
    void execute({
      path: `${path}/dispenses`,
      body: {
        dispense: {
          status,
          original_dispense_id: originalId,
          batch_id: batch?.batch_id,
          quantity,
          reason: note,
          handed_over_at: timestamp.toISOString(),
          request_key: crypto.randomUUID(),
        },
      },
    });
  }
  const latest = evidence?.events
    .filter((event) => event.kind !== "review")
    .at(-1);
  const unresolved =
    latest &&
    [
      "unknown",
      "acknowledged",
      "accepted",
      "outcome_unknown",
      "rejected",
      "unavailable",
      "revoked",
      "duplicate",
    ].includes(latest.kind);
  const latestAttempt = evidence?.attempts.find(
    (attempt) => attempt.prescription_event_id === latest?.id,
  );
  const submissionResponse = (evidence?.response_events ?? []).find(
    (response) => response.transmission_attempt_id === latestAttempt?.id &&
      response.transaction_type === "NewRx" && response.event_kind === "received",
  );
  const effectiveOutcome = submissionResponse?.outcome ?? latestAttempt?.outcome ?? latest?.kind;
  const cancellationPending = (evidence?.lifecycle_requests ?? []).some(
    (request) => request.action === "cancel" && ["pending", "outcome_unknown"].includes(request.state),
  );
  const preparation = evidence?.preparations
    ?.filter(
      (item) =>
        item.current &&
        item.state === "prepared" &&
        item.medication_request_revision_id === orderId &&
        item.pharmacy_destination_id === destination?.id &&
        item.mode === simulationMode &&
        (simulationMode === "standard" ||
          (item.signer_snapshot.state === signerState &&
            item.reviewer_snapshot.state === reviewerState)),
    )
    .at(-1);
  const currentReview = evidence?.events.filter(
    (item) => item.kind === "review" && item.source === "manual" &&
      item.medication_request_revision_id === orderId,
  ).at(-1);
  const reviewed = currentReview && (!latest ||
    !["cancelled", "confirmed_not_sent"].includes(latest.kind) || currentReview.id > latest.id);
  const unavailable = busy || pending !== null || !evidence;
  const disabled = unavailable || !canWrite;
  const substitutionUnresolved =
    order?.fulfillment_route === "outside_pharmacy" &&
    !["allowed", "not_allowed"].includes(order.substitution_instruction ?? "");
  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h6">
          Prescription review and fulfillment
        </Typography>
        <TextField
          select
          label="Prescription version"
          value={orderId}
          disabled={busy || pending !== null}
          onChange={(event) => setOrderId(Number(event.target.value))}
        >
          {orders.map((row) => (
            <MenuItem key={row.id} value={row.id}>
              {row.medication_name} · version {row.version_number} ·{" "}
              {row.status}
            </MenuItem>
          ))}
        </TextField>
        <Alert severity="info">
          Simulated pharmacy network — no pharmacy connection. No prescription
          was transmitted externally.
        </Alert>
        {error && <Alert severity="warning">{error}</Alert>}
        {pending && (
          <Stack direction="row" spacing={1}>
            <Button disabled={busy} onClick={() => void execute(pending)}>
              Retry exact request
            </Button>
            <Button
              disabled={busy}
              onClick={() => setReload((value) => value + 1)}
            >
              Refresh evidence
            </Button>
          </Stack>
        )}
        {order && (
          <Typography>
            {order.medication_strength} {order.medication_form} ·{" "}
            {order.dose_text} · {order.route_text} · {order.frequency_text}
            <br />
            {order.instructions}
            <br />
            Quantity {order.prescribed_quantity ?? "not recorded"}{" "}
            {order.quantity_unit} · Refills {order.refills ?? "not recorded"}
            <br />
            Substitution:{" "}
            {order.substitution_instruction === "allowed"
              ? "Allowed"
              : order.substitution_instruction === "not_allowed"
                ? "Not allowed"
                : "Unresolved — choose before review or submission"}
            <br />
            {order.fulfillment_route?.replaceAll("_", " ") ??
              "Fulfillment not selected"}{" "}
            · {order.pharmacy_name} {order.pharmacy_location}
          </Typography>
        )}
        <TextField
          label="Review, reconciliation or partial-handover note"
          value={note}
          multiline
          disabled={busy || pending !== null}
          onChange={(event) => setNote(event.target.value)}
        />
        <Button
          disabled={disabled || !!unresolved || substitutionUnresolved}
          onClick={() => event("review", "manual")}
        >
          Confirm current prescription review
        </Button>
        {unresolved ? (
          <Box>
            <Alert severity="warning">
              Confirm the previous prescription outcome before changing or
              repeating fulfillment.
            </Alert>
            {!["acknowledged", "accepted"].includes(effectiveOutcome ?? "") && (
              <Button
                disabled={disabled || cancellationPending || !note.trim()}
                onClick={() =>
                  event("confirmed_not_sent", latest.source, latest)
                }
              >
                Record confirmed not sent
              </Button>
            )}
            {!latestAttempt?.correlation_id && (
              <Button
                disabled={disabled || cancellationPending || !note.trim()}
                onClick={() => event("cancelled", latest.source, latest)}
              >
                Record confirmed cancellation
              </Button>
            )}
          </Box>
        ) : order?.fulfillment_route === "outside_pharmacy" ? (
          <Stack spacing={1}>
            <Autocomplete
              options={destinations}
              value={destination}
              onChange={(_event, value) => setDestination(value)}
              getOptionLabel={(item) =>
                `${item.name} · ${item.city}, ${item.state_code} ${item.postal_code}`
              }
              renderInput={(params) => (
                <TextField {...params} label="Pharmacy destination" />
              )}
            />
            <Typography variant="body2" color="text.secondary">
              Add a pharmacy destination when it is not already listed.
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <TextField
                label="Pharmacy name"
                value={destinationForm.name}
                disabled={destinationAttempt !== null}
                onChange={(event) =>
                  setDestinationForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
              <TextField
                label="Address"
                value={destinationForm.address_line1}
                disabled={destinationAttempt !== null}
                onChange={(event) =>
                  setDestinationForm((current) => ({
                    ...current,
                    address_line1: event.target.value,
                  }))
                }
              />
              <TextField
                label="City"
                value={destinationForm.city}
                disabled={destinationAttempt !== null}
                onChange={(event) =>
                  setDestinationForm((current) => ({
                    ...current,
                    city: event.target.value,
                  }))
                }
              />
              <TextField
                label="State"
                value={destinationForm.state_code}
                disabled={destinationAttempt !== null}
                onChange={(event) =>
                  setDestinationForm((current) => ({
                    ...current,
                    state_code: event.target.value.toUpperCase(),
                  }))
                }
              />
              <TextField
                label="Postal code"
                value={destinationForm.postal_code}
                disabled={destinationAttempt !== null}
                onChange={(event) =>
                  setDestinationForm((current) => ({
                    ...current,
                    postal_code: event.target.value,
                  }))
                }
              />
            </Stack>
            <Button
              disabled={
                busy ||
                !canWrite ||
                Object.values(destinationAttempt?.form ?? destinationForm).some(
                  (value) => !value.trim(),
                )
              }
              onClick={() => void createDestination()}
            >
              {destinationAttempt
                ? "Retry exact pharmacy save"
                : "Save pharmacy destination"}
            </Button>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <TextField
                select
                label="Simulation mode"
                value={simulationMode}
                onChange={(event) =>
                  setSimulationMode(
                    event.target.value as "standard" | "controlled_test",
                  )
                }
              >
                <MenuItem value="standard">
                  Standard simulated pharmacy
                </MenuItem>
                <MenuItem value="controlled_test">
                  Controlled prescription test mode
                </MenuItem>
              </TextField>
              {simulationMode === "controlled_test" && (
                <>
                  <TextField
                    select
                    label="Synthetic signer state"
                    value={signerState}
                    onChange={(event) => setSignerState(event.target.value)}
                  >
                    <MenuItem value="active">Active</MenuItem>
                    <MenuItem value="revoked">Revoked</MenuItem>
                  </TextField>
                  <TextField
                    select
                    label="Synthetic reviewer state"
                    value={reviewerState}
                    onChange={(event) => setReviewerState(event.target.value)}
                  >
                    <MenuItem value="active">Active</MenuItem>
                    <MenuItem value="revoked">Revoked</MenuItem>
                  </TextField>
                </>
              )}
              <TextField
                select
                label="Simulator outcome"
                value={scenario}
                onChange={(event) => setScenario(event.target.value)}
              >
                {[
                  "failure_before_send",
                  "rejected",
                  "acknowledged",
                  "unknown",
                  "accepted",
                  "unavailable",
                  "revoked",
                  "duplicate",
                  "outcome_unknown",
                ].map((value) => (
                  <MenuItem key={value} value={value}>
                    {value.replaceAll("_", " ")}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                disabled={
                  disabled ||
                  !destination ||
                  !reviewed ||
                  substitutionUnresolved ||
                  !!preparation
                }
                onClick={prepare}
              >
                Save prescription preparation
              </Button>
              <Button
                disabled={
                  disabled || !destination || !preparation || substitutionUnresolved
                }
                onClick={submit}
              >
                Submit to pharmacy (simulated)
              </Button>
            </Stack>
          </Stack>
        ) : (
          <Alert severity="info">
            Outside-pharmacy fulfillment is required before a pharmacy
            submission can be simulated.
          </Alert>
        )}
        {latestAttempt?.correlation_id && unresolved && (
          <Stack spacing={1}>
            <Typography variant="subtitle1">
              Local response and lifecycle simulation · attempt #{latestAttempt.id}
            </Typography>
            {!submissionResponse && ["unknown", "outcome_unknown"].includes(latestAttempt.outcome) && (
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                <Button disabled={disabled} onClick={() => receiveResponse(latestAttempt.id, "acknowledged")}>
                  Record simulated acknowledgment response
                </Button>
                <Button disabled={disabled} onClick={() => receiveResponse(latestAttempt.id, "rejected")}>
                  Record simulated rejection response
                </Button>
              </Stack>
            )}
            {["acknowledged", "accepted"].includes(effectiveOutcome ?? "") && (
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                <Button
                  disabled={disabled || cancellationPending}
                  onClick={() => requestLifecycle("cancel", latestAttempt)}
                >
                  Save local cancellation request
                </Button>
                <Button
                  disabled={disabled || (evidence?.lifecycle_requests ?? []).some((request) =>
                    request.transmission_attempt_id === latestAttempt.id && request.action === "fill_notice" &&
                    ["pending", "outcome_unknown"].includes(request.state))}
                  onClick={() => requestLifecycle("fill_notice", latestAttempt)}
                >
                  Save simulated fill-notice request
                </Button>
              </Stack>
            )}
          </Stack>
        )}
        {(evidence?.lifecycle_requests ?? []).map((request) => {
          const originalStillOpen = latestAttempt?.id === request.transmission_attempt_id;
          const superseded = (evidence?.lifecycle_requests ?? []).some((other) =>
            other.transmission_attempt_id === request.transmission_attempt_id &&
            other.action === request.action && other.id > request.id,
          );
          const canRecordResult = originalStillOpen && !superseded &&
            ["pending", "outcome_unknown", "unavailable"].includes(request.state);
          return (
            <Stack key={request.id} spacing={1}>
              <Typography variant="body2">
                Local {request.action === "cancel" ? "cancellation" : "fill-notice simulation"} request #{request.id} ·{" "}
                {request.state.replaceAll("_", " ")} · attempt #{request.transmission_attempt_id} ·{" "}
                {new Date(request.requested_at).toLocaleString()} · correlation {request.correlation_id} · {request.owner}
                {(!originalStillOpen || superseded) && " · Original attempt or request is reconciled/superseded; history retained"}
              </Typography>
              {canRecordResult && (
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                  {(request.action === "cancel"
                    ? [
                        ["cancellation_acknowledged", "Simulate cancellation acknowledgment"],
                        ["cancellation_rejected", "Simulate cancellation rejection"],
                        ["unknown", "Simulate cancellation outcome unknown"],
                        ["unavailable", "Simulate cancellation response unavailable"],
                      ]
                    : [
                        ["fill_notice", "Simulate RxFill notice"],
                        ["unknown", "Simulate notice outcome unknown"],
                        ["unavailable", "Simulate notice unavailable"],
                      ]
                  ).map(([scenario, label]) => (
                    <Button key={scenario}
                      disabled={disabled || (request.state === "outcome_unknown" && scenario === "unavailable")}
                      onClick={() => receiveResponse(request.transmission_attempt_id, scenario, request)}>
                      {label}
                    </Button>
                  ))}
                </Stack>
              )}
            </Stack>
          );
        })}
        {(evidence?.response_events ?? []).map((response) => (
          <Typography key={response.id} variant="body2" sx={{ overflowWrap: "anywhere" }}>
            {response.event_kind === "received" ? "Received simulation" : "Local simulator outcome; no response received"} ·{" "}
            {response.transaction_type} · {response.outcome.replaceAll("_", " ")} · attempt #{response.transmission_attempt_id} ·{" "}
            version record {response.medication_request_revision_id} · source {response.source_identity} ·{" "}
            {response.received_at
              ? new Date(response.received_at).toLocaleString()
              : `Received time unknown · local outcome recorded ${new Date(response.recorded_at).toLocaleString()}`} ·{" "}
            original correlation {response.attempt_correlation_id}
            {response.lifecycle_correlation_id && ` · request correlation ${response.lifecycle_correlation_id}`}
            {response.source_message_id && ` · simulator message ${response.source_message_id}`}
            {response.response_code && ` · ${response.response_code}`}
            {response.response_text && ` · ${response.response_text}`}
            {response.resolution_event_id && ` · linked simulated cancellation event #${response.resolution_event_id}`}
          </Typography>
        ))}
        {evidence?.preparations?.map((item) => (
          <Typography key={item.id} variant="body2">
            Preparation #{item.id} · version record{" "}
            {item.medication_request_revision_id} · review #{item.review_event_id} ·{" "}
            {item.destination_snapshot.name} ·{" "}
            {new Date(item.prepared_at).toLocaleString()} ·{" "}
            {item.state === "submitted"
              ? `Linked simulated attempt #${item.submission_attempt_id}: ${item.submission_outcome?.replaceAll("_", " ")}`
              : item.current
                ? "Prepared locally; not submitted"
                : "Source changed; prepare again"}
          </Typography>
        ))}
        {evidence?.attempts.map((attempt) => (
          <PrescriptionAttemptEvidence key={attempt.id} attempt={attempt} />
        ))}
        {evidence?.events.map((item) => (
          <Typography key={item.id} variant="body2">
            {item.source === "simulation" ? "Simulation" : "Manual evidence"} ·{" "}
            {item.kind.replaceAll("_", " ")} · version record{" "}
            {item.medication_request_revision_id} ·{" "}
            {new Date(item.recorded_at).toLocaleString()}
            {item.prior_event_id
              ? ` · Reconciles event #${item.prior_event_id}`
              : ""}
            {item.note ? ` · ${item.note}` : ""}
          </Typography>
        ))}
        {order?.fulfillment_route === "take_home" && (
          <Stack spacing={1}>
            <Typography variant="subtitle1">
              Take-home handover · Remaining{" "}
              {evidence?.remaining_quantity ?? "unavailable"}{" "}
              {order.quantity_unit}
            </Typography>
            <Autocomplete
              options={batches.filter(
                (item) => item.product_id === order.inventory_product_id,
              )}
              value={batch}
              onChange={(_event, value) => setBatch(value)}
              getOptionLabel={(item) =>
                `Lot ${item.lot_number} · ${item.available_quantity} ${item.stock_unit} · expires ${item.expires_on}`
              }
              renderInput={(params) => (
                <TextField {...params} label="Stock lot" />
              )}
            />
            <TextField
              label="Quantity handed over"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
            <TextField
              label="Actual handover or correction time"
              type="datetime-local"
              slotProps={{ inputLabel: { shrink: true } }}
              value={when}
              onChange={(event) => setWhen(event.target.value)}
            />
            <Button
              disabled={unavailable || !canDispense || !!unresolved}
              onClick={() => dispense("handed_over")}
            >
              Record take-home handover
            </Button>
            <Button
              disabled={unavailable || !canDispense || !note.trim()}
              onClick={() => dispense("not_done")}
            >
              Record not handed over
            </Button>
            {evidence?.dispenses.map((item) => (
              <Box key={item.id}>
                <Typography>
                  {item.status.replaceAll("_", " ")} · {item.quantity}{" "}
                  {item.stock_unit} ·{" "}
                  {new Date(item.handed_over_at).toLocaleString()} ·{" "}
                  {item.reason}
                </Typography>
                {item.status === "handed_over" &&
                  !evidence.dispenses.some(
                    (other) => other.original_dispense_id === item.id,
                  ) && (
                    <Button
                      disabled={unavailable || !canDispense || !note.trim()}
                      onClick={() => dispense("reversed", item.id)}
                    >
                      Reverse this recorded handover
                    </Button>
                  )}
              </Box>
            ))}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
