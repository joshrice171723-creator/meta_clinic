import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api, ApiError } from "../../../api/client";
import { LoadState } from "../../../shared/ui";
import { useClinicNavigation } from "../clinicNavigation";
import { entitlementOutcomeUnknown } from "./entitlementActions";
import type {
  PaidPeriodCandidate,
  PaidPeriodResolutionCase,
  PaidPeriodResolutionLedger,
  PaidPeriodResolutionRecord,
} from "./contracts";

type Attempt = Readonly<{
  subscriptionId: number;
  body: Readonly<{
    resolution: Readonly<{
      service_id: number;
      selected_paid_event_id: number;
      evidence_token: string;
      reason: string;
      request_key: string;
    }>;
  }>;
}>;

const positiveId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const timestamp = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  /(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
  Number.isFinite(Date.parse(value));
const text = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function validCandidate(value: PaidPeriodCandidate) {
  return (
    object(value) &&
    positiveId(value.id) &&
    timestamp(value.starts_at) &&
    timestamp(value.ends_at) &&
    Date.parse(value.starts_at) < Date.parse(value.ends_at) &&
    timestamp(value.recorded_at) &&
    object(value.details)
  );
}

function validRecord(value: PaidPeriodResolutionCase["resolution"]) {
  return (
    object(value) &&
    positiveId(value.id) &&
    positiveId(value.selected_paid_event_id) &&
    timestamp(value.effective_at) &&
    text(value.reason) &&
    positiveId(value.actor_id) &&
    timestamp(value.created_at)
  );
}

function validHistory(value: PaidPeriodResolutionRecord) {
  return (
    validRecord(value) &&
    positiveId(value.service_id) &&
    text(value.request_key) &&
    text(value.evidence_token) &&
    timestamp(value.overlap_start) &&
    timestamp(value.overlap_end) &&
    Date.parse(value.overlap_start) < Date.parse(value.overlap_end) &&
    Array.isArray(value.candidate_event_ids) &&
    value.candidate_event_ids.every(positiveId) &&
    value.candidate_event_ids.includes(value.selected_paid_event_id) &&
    object(value.evidence_snapshot) &&
    Array.isArray(value.evidence_snapshot.events) &&
    value.evidence_snapshot.events.every(validCandidate)
  );
}

function ledgerResponse(
  value: unknown,
  page: number,
): PaidPeriodResolutionLedger {
  const data = value as PaidPeriodResolutionLedger | null;
  if (
    !object(data) ||
    data.page !== page ||
    !Number.isSafeInteger(data.total_count) ||
    data.total_count < 0 ||
    !Number.isSafeInteger(data.total_pages) ||
    data.total_pages < 0 ||
    !Array.isArray(data.cases) ||
    !Array.isArray(data.history) ||
    !data.history.every(validHistory) ||
    !data.cases.every(
      (item) =>
        object(item) &&
        positiveId(item.service_id) &&
        text(item.name) &&
        ["unresolved", "resolved"].includes(item.status) &&
        text(item.evidence_token) &&
        timestamp(item.overlap_start) &&
        timestamp(item.overlap_end) &&
        Date.parse(item.overlap_start) < Date.parse(item.overlap_end) &&
        Array.isArray(item.candidates) &&
        item.candidates.length >= 2 &&
        item.candidates.every(validCandidate) &&
        Array.isArray(item.blockers) &&
        item.blockers.every(
          (blocker) =>
            object(blocker) &&
            positiveId(blocker.selected_paid_event_id) &&
            Array.isArray(blocker.entry_ids) &&
            blocker.entry_ids.every(positiveId),
        ) &&
        (item.status === "resolved"
          ? validRecord(item.resolution)
          : item.resolution === null),
    )
  ) {
    throw new Error(
      "Resolution records could not be verified for this page. Refresh before continuing.",
    );
  }
  return data;
}

function ownsRecord(record: PaidPeriodResolutionRecord, attempt: Attempt) {
  const expected = attempt.body.resolution;
  return (
    validHistory(record) &&
    record.service_id === expected.service_id &&
    record.selected_paid_event_id === expected.selected_paid_event_id &&
    record.evidence_token === expected.evidence_token &&
    record.reason === expected.reason &&
    record.request_key === expected.request_key
  );
}

function EventEvidence({ event }: { event: PaidPeriodCandidate }) {
  return (
    <Stack spacing={0.5} sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
      <Typography variant="body2">Paid event #{event.id}</Typography>
      <Typography variant="body2">
        Full period: {event.starts_at} through {event.ends_at} (end excluded).
      </Typography>
      <Typography variant="body2">Recorded: {event.recorded_at}</Typography>
      <Typography
        component="pre"
        variant="body2"
        sx={{ whiteSpace: "pre-wrap", m: 0 }}
      >
        Financial evidence: {JSON.stringify(event.details, null, 2)}
      </Typography>
    </Stack>
  );
}

export function PaidPeriodResolution({
  subscriptionId,
  canRecord,
  onResolved,
  onClose,
  onUnknownOutcomeChange,
}: {
  subscriptionId: number;
  canRecord: boolean;
  onResolved: () => void;
  onClose: () => void;
  onUnknownOutcomeChange?: (unknown: boolean) => void;
}) {
  const { registerBlocker } = useClinicNavigation();
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState({ version: 0, reconcile: false });
  const scope = `${subscriptionId}:${page}:${refresh.version}`;
  const [read, setRead] = useState<{
    scope: string;
    data?: PaidPeriodResolutionLedger;
    error?: string;
  }>({ scope });
  const [draft, setDraft] = useState<{
    serviceId: number;
    token: string;
    selected: string;
    reason: string;
  } | null>(null);
  const [confirmation, setConfirmation] = useState<Attempt | null>(null);
  const [pending, setPending] = useState<Attempt | null>(null);
  const pendingRef = useRef<Attempt | null>(null);
  const callbacks = useRef({ onResolved, onUnknownOutcomeChange });
  callbacks.current = { onResolved, onUnknownOutcomeChange };
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const data = read.scope === scope ? read.data : undefined;
  const confirmationCase =
    confirmation &&
    data?.cases.find(
      (item) =>
        item.service_id === confirmation.body.resolution.service_id &&
        item.evidence_token === confirmation.body.resolution.evidence_token,
    );
  const confirmationEvent = confirmationCase?.candidates.find(
    (event) =>
      event.id === confirmation?.body.resolution.selected_paid_event_id,
  );
  const locked = busy || pending !== null;
  const reload = (reconcile = false) =>
    setRefresh((value) => ({ version: value.version + 1, reconcile }));
  const rememberPending = (attempt: Attempt | null) => {
    pendingRef.current = attempt;
    setPending(attempt);
    callbacks.current.onUnknownOutcomeChange?.(attempt !== null);
  };

  useEffect(() => {
    const abort = new AbortController();
    const reconciliation = refresh.reconcile ? pendingRef.current : null;
    setRead({ scope });
    api(
      `/api/clinic/subscriptions/${subscriptionId}/paid_period_resolutions?page=${page}`,
      { signal: abort.signal },
    )
      .then((value) => {
        if (abort.signal.aborted) return;
        const ledger = ledgerResponse(value, page);
        setRead({ scope, data: ledger });
        if (
          reconciliation &&
          reconciliation.subscriptionId === subscriptionId &&
          pendingRef.current === reconciliation
        ) {
          const record = ledger.history.find((item) =>
            ownsRecord(item, reconciliation),
          );
          if (record) {
            pendingRef.current = null;
            setPending(null);
            callbacks.current.onUnknownOutcomeChange?.(false);
            setDraft(null);
            setError("");
            setNotice(
              `Confirmed saved resolution #${record.id} from this membership's history.`,
            );
            callbacks.current.onResolved();
          } else {
            setError(
              "This page does not confirm the exact saved request. Its outcome remains unknown; absence is not proof of rejection.",
            );
          }
        }
      })
      .catch((reason: unknown) => {
        if (!abort.signal.aborted)
          setRead({
            scope,
            error:
              reason instanceof Error
                ? reason.message
                : "Resolution records are unavailable.",
          });
      });
    return () => abort.abort();
  }, [subscriptionId, page, scope, refresh.reconcile]);

  useEffect(() => {
    if (!pending) return;
    const warning =
      "The paid-period resolution outcome is unknown. Confirm the saved record or retry the exact request before leaving.";
    const unregister = registerBlocker(() => warning);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = warning;
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [pending, registerBlocker]);

  const review = () => {
    if (locked || !canRecord || !draft || !data) return;
    const current = data.cases.find(
      (item) =>
        item.service_id === draft.serviceId &&
        item.evidence_token === draft.token,
    );
    const selected = Number(draft.selected);
    if (
      !current ||
      current.status !== "unresolved" ||
      !current.candidates.some((item) => item.id === selected) ||
      current.blockers.some(
        (item) =>
          item.selected_paid_event_id === selected && item.entry_ids.length > 0,
      ) ||
      !draft.reason.trim()
    ) {
      setError(
        "Select an available competing paid event and enter a reason against the current evidence.",
      );
      return;
    }
    setConfirmation(
      Object.freeze({
        subscriptionId,
        body: Object.freeze({
          resolution: Object.freeze({
            service_id: current.service_id,
            selected_paid_event_id: selected,
            evidence_token: current.evidence_token,
            reason: draft.reason.trim(),
            request_key: crypto.randomUUID(),
          }),
        }),
      }),
    );
    setError("");
  };

  const submit = async (attempt: Attempt) => {
    if (
      inFlight.current ||
      !canRecord ||
      attempt.subscriptionId !== subscriptionId
    )
      return;
    const prior = pendingRef.current;
    if (prior && prior !== attempt) return;
    if (!prior) {
      const expected = attempt.body.resolution;
      const current = data?.cases.find(
        (item) =>
          item.service_id === expected.service_id &&
          item.evidence_token === expected.evidence_token,
      );
      if (
        !current ||
        current.status !== "unresolved" ||
        !current.candidates.some(
          (item) => item.id === expected.selected_paid_event_id,
        ) ||
        current.blockers.some(
          (item) =>
            item.selected_paid_event_id === expected.selected_paid_event_id &&
            item.entry_ids.length > 0,
        )
      ) {
        setConfirmation(null);
        setError(
          "Refresh and review the current competing evidence before recording.",
        );
        return;
      }
    }
    inFlight.current = true;
    setBusy(true);
    rememberPending(attempt);
    setConfirmation(null);
    setError("");
    setNotice("");
    let saved: PaidPeriodResolutionRecord | undefined;
    try {
      const value = await api<{ resolution: PaidPeriodResolutionRecord }>(
        `/api/clinic/subscriptions/${attempt.subscriptionId}/paid_period_resolutions`,
        { method: "POST", body: attempt.body },
      );
      if (!value.resolution || !ownsRecord(value.resolution, attempt)) {
        throw new Error(
          "The response did not confirm this exact resolution request.",
        );
      }
      saved = value.resolution;
      rememberPending(null);
      setDraft(null);
      setNotice(
        `Recorded immutable resolution #${saved.id}; selected paid event #${saved.selected_paid_event_id}.`,
      );
    } catch (reason) {
      const unknown =
        prior ??
        (entitlementOutcomeUnknown(reason) ||
        (reason instanceof ApiError && reason.code === "session_changed")
          ? attempt
          : null);
      rememberPending(unknown);
      setError(
        `${reason instanceof Error ? reason.message : "The request was not confirmed."}${unknown ? " The exact request is retained and its outcome remains unknown." : " Refresh the evidence before reviewing another request."}`,
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
      reload();
    }
    if (saved) callbacks.current.onResolved();
  };

  return (
    <Dialog
      open
      fullWidth
      maxWidth="md"
      onClose={() => !locked && !confirmation && onClose()}
      aria-labelledby="paid-period-resolution-title"
    >
      <DialogTitle id="paid-period-resolution-title">
        Paid-period overlaps · Membership #{subscriptionId}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2">
            Review competing paid-period evidence before selecting the event
            that governs this service allowance. Original payment evidence and
            previous resolutions remain immutable.
          </Typography>
          {!canRecord && (
            <Alert severity="info">
              Read only. Your current permission does not allow recording a
              resolution.
            </Alert>
          )}
          {pending && (
            <Alert severity="warning">
              {busy
                ? "Recording the exact request; its outcome is not yet confirmed."
                : "The resolution outcome is unknown. Keep this dialog open until an owned response or an explicit lookup confirms the exact request."}
              <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
                Service #{pending.body.resolution.service_id} · Paid event #
                {pending.body.resolution.selected_paid_event_id} · Request key:{" "}
                {pending.body.resolution.request_key} · Evidence:{" "}
                {pending.body.resolution.evidence_token} · Reason:{" "}
                {pending.body.resolution.reason}
              </Typography>
              <Button
                color="inherit"
                disabled={busy || !canRecord}
                onClick={() => void submit(pending)}
              >
                Retry exact request
              </Button>
              {!canRecord && (
                <Typography variant="body2">
                  Retry is unavailable under your current permission. The
                  original request remains unresolved.
                </Typography>
              )}
            </Alert>
          )}
          {error && (
            <Alert severity={pending ? "warning" : "error"}>{error}</Alert>
          )}
          {notice && <Alert severity="success">{notice}</Alert>}
          {!data ? (
            <LoadState
              error={read.scope === scope ? read.error : undefined}
              onRetry={() => reload(true)}
            />
          ) : (
            <>
              {!data.cases.length && (
                <Typography>
                  No competing paid-period cases are recorded.
                </Typography>
              )}
              {data.cases.map((item) => {
                const editing =
                  draft?.serviceId === item.service_id &&
                  draft.token === item.evidence_token;
                return (
                  <Stack
                    key={`${item.service_id}:${item.evidence_token}`}
                    spacing={1.5}
                    sx={{ overflowWrap: "anywhere" }}
                  >
                    <Divider />
                    <Typography component="h4" variant="subtitle1">
                      {item.name} · Service #{item.service_id} · {item.status}
                    </Typography>
                    <Typography variant="body2">
                      Overlap: {item.overlap_start} through {item.overlap_end}{" "}
                      (end excluded).
                    </Typography>
                    {item.resolution && (
                      <Typography variant="body2">
                        Immutable resolution #{item.resolution.id}: selected
                        paid event #{item.resolution.selected_paid_event_id};
                        effective {item.resolution.effective_at}; reason:{" "}
                        {item.resolution.reason}; actor #
                        {item.resolution.actor_id}; recorded{" "}
                        {item.resolution.created_at}.
                      </Typography>
                    )}
                    <FormControl>
                      <FormLabel id={`paid-event-label-${item.service_id}`}>
                        Competing paid events
                      </FormLabel>
                      <RadioGroup
                        aria-labelledby={`paid-event-label-${item.service_id}`}
                        value={editing ? draft.selected : ""}
                        onChange={(_, selected) => {
                          if (
                            locked ||
                            confirmation ||
                            !canRecord ||
                            item.status !== "unresolved"
                          )
                            return;
                          setDraft({
                            serviceId: item.service_id,
                            token: item.evidence_token,
                            selected,
                            reason: editing ? draft.reason : "",
                          });
                          setError("");
                        }}
                      >
                        {item.candidates.map((event) => {
                          const blockers = item.blockers
                            .filter(
                              (blocker) =>
                                blocker.selected_paid_event_id === event.id,
                            )
                            .flatMap((blocker) => blocker.entry_ids);
                          return (
                            <Stack key={event.id} spacing={0.5} sx={{ py: 1 }}>
                              <FormControlLabel
                                value={String(event.id)}
                                control={<Radio />}
                                disabled={
                                  locked ||
                                  confirmation !== null ||
                                  !canRecord ||
                                  item.status !== "unresolved" ||
                                  blockers.length > 0
                                }
                                label={<EventEvidence event={event} />}
                                sx={{
                                  alignItems: "flex-start",
                                  m: 0,
                                  minWidth: 0,
                                  "& .MuiFormControlLabel-label": {
                                    minWidth: 0,
                                  },
                                }}
                              />
                              {blockers.length > 0 && (
                                <Alert severity="warning">
                                  Selecting paid event #{event.id} is blocked by
                                  original unreversed uses:{" "}
                                  {blockers.map((id) => `#${id}`).join(", ")}.
                                  Close this dialog and use the existing
                                  exact-use reversal in the package ledger, then
                                  refresh. This resolution does not reallocate
                                  uses.
                                </Alert>
                              )}
                            </Stack>
                          );
                        })}
                      </RadioGroup>
                    </FormControl>
                    {editing && item.status === "unresolved" && (
                      <Stack spacing={1}>
                        <TextField
                          label="Resolution reason"
                          required
                          multiline
                          minRows={2}
                          slotProps={{ htmlInput: { maxLength: 1000 } }}
                          helperText="Enter the evidence-based selection reason (at most 1,000 characters)."
                          value={draft.reason}
                          disabled={
                            locked || confirmation !== null || !canRecord
                          }
                          onChange={(event) =>
                            setDraft({ ...draft, reason: event.target.value })
                          }
                        />
                        <Button
                          variant="contained"
                          disabled={
                            locked ||
                            confirmation !== null ||
                            !canRecord ||
                            !draft.selected ||
                            !draft.reason.trim()
                          }
                          onClick={review}
                        >
                          Review resolution
                        </Button>
                        <Button
                          disabled={locked || confirmation !== null}
                          onClick={() => setDraft(null)}
                        >
                          Discard selection
                        </Button>
                      </Stack>
                    )}
                  </Stack>
                );
              })}
              <Divider />
              <Typography component="h4" variant="subtitle1">
                Immutable resolution history ({data.total_count})
              </Typography>
              {!data.history.length && (
                <Typography>No resolution history on this page.</Typography>
              )}
              {data.history.map((record) => (
                <Stack
                  key={record.id}
                  spacing={1}
                  sx={{ overflowWrap: "anywhere" }}
                >
                  <Typography variant="body2">
                    Resolution #{record.id} · Service #{record.service_id} ·
                    Selected paid event #{record.selected_paid_event_id} ·
                    Effective: {record.effective_at} · Reason: {record.reason} ·
                    Actor #{record.actor_id} · Recorded: {record.created_at}
                  </Typography>
                  <Typography variant="body2">
                    Original overlap: {record.overlap_start} through{" "}
                    {record.overlap_end} (end excluded). Competing event IDs:{" "}
                    {record.candidate_event_ids.join(", ")}.
                  </Typography>
                  {record.evidence_snapshot.events.map((event) => (
                    <EventEvidence key={event.id} event={event} />
                  ))}
                </Stack>
              ))}
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Button
                  disabled={
                    busy ||
                    confirmation !== null ||
                    (!pending && draft !== null) ||
                    page <= 1
                  }
                  onClick={() => {
                    setPage((value) => value - 1);
                    reload(true);
                  }}
                >
                  Previous history page
                </Button>
                <Typography variant="body2">
                  Page {data.page} of {Math.max(data.total_pages, 1)}
                </Typography>
                <Button
                  disabled={
                    busy ||
                    confirmation !== null ||
                    (!pending && draft !== null) ||
                    page >= data.total_pages
                  }
                  onClick={() => {
                    setPage((value) => value + 1);
                    reload(true);
                  }}
                >
                  Next history page
                </Button>
              </Stack>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button
          disabled={busy || confirmation !== null}
          onClick={() => reload(true)}
        >
          Refresh resolution records
        </Button>
        <Button
          disabled={locked || confirmation !== null}
          onClick={() => {
            setDraft(null);
            onClose();
          }}
        >
          Close
        </Button>
      </DialogActions>
      <Dialog
        open={confirmation !== null}
        fullWidth
        maxWidth="sm"
        onClose={() => setConfirmation(null)}
        aria-labelledby="confirm-paid-period-resolution-title"
      >
        <DialogTitle id="confirm-paid-period-resolution-title">
          Confirm paid-period selection
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography>
              Membership #{subscriptionId} · Service #
              {confirmation?.body.resolution.service_id} · Select paid event #
              {confirmation?.body.resolution.selected_paid_event_id}
            </Typography>
            {confirmationCase && (
              <Typography variant="body2">
                Overlap: {confirmationCase.overlap_start} through{" "}
                {confirmationCase.overlap_end} (end excluded).
              </Typography>
            )}
            {confirmationEvent && <EventEvidence event={confirmationEvent} />}
            <Typography sx={{ overflowWrap: "anywhere" }}>
              Reason: {confirmation?.body.resolution.reason}
            </Typography>
            <Typography variant="body2">
              Confirm that this exact paid event should govern this service
              allowance. The resolution and its evidence will be immutable.
              Existing uses remain attributed to their original window.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmation(null)}>Back to review</Button>
          <Button
            variant="contained"
            disabled={!canRecord || !data || busy}
            onClick={() => confirmation && void submit(confirmation)}
          >
            Confirm and record resolution
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
