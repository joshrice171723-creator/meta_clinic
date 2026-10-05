import { useEffect, useMemo, useRef, useState } from "react";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  ApiError,
  api,
  CLINIC_LOCATION_CHANGED_EVENT,
  SESSION_CHANGED_EVENT,
} from "../../api/client";
import { LoadState, useResource } from "../../shared/ui";
import type { Adjustment, Timecard } from "./clockTypes";
import {
  formatDisplayDate,
  formatDisplayDateTime,
} from "../../shared/dateTime";
import { AdjustmentDialog, type CorrectionSite } from "./AdjustmentDialog";
import { TimecardSummary } from "./TimecardSummary";
import { useClinicNavigation } from "../clinic/clinicNavigation";
import { useDemoNavigationBlocker } from "../demo/navigationBlockers";

function workweekKey(period: { period_start: string; period_end: string }) {
  return `${period.period_start}|${period.period_end}`;
}

type HoursData = {
  timecards: Timecard[];
  correction_sites: CorrectionSite[];
  next_timecard_before_id: string | null;
};

export function EmployeeHoursPage() {
  const { registerBlocker } = useClinicNavigation();
  const {
    data,
    error: loadError,
    refresh,
  } = useResource<HoursData>("/api/clinic/workforce/timecards?view=self");
  const corrections = useResource<{ adjustments: Adjustment[] }>(
    "/api/clinic/workforce/adjustments?view=self",
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [workweek, setWorkweek] = useState("all");
  const [correctionStatus, setCorrectionStatus] = useState("all");
  const [pendingSubmission, setPendingSubmission] = useState<Timecard | null>(
    null,
  );
  const controlsLocked = busy || pendingSubmission !== null;
  const leaveMessage = busy
    ? "A timecard action is still saving."
    : pendingSubmission
      ? "Timecard submission is unconfirmed. Leaving loses its saved retry."
      : null;
  useDemoNavigationBlocker(() => ({ blocked: busy, message: leaveMessage }));
  useEffect(() => {
    if (!leaveMessage) return;
    const unregister = registerBlocker(() => leaveMessage, {
      preventNavigation: busy,
    });
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = leaveMessage;
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", unload);
    };
  }, [leaveMessage, busy, registerBlocker]);
  const [correctionCard, setCorrectionCard] = useState<Timecard | null>(null);
  const [historyCard, setHistoryCard] = useState<Timecard | null>(null);
  const [historyCardLoading, setHistoryCardLoading] = useState(false);
  const [olderTimecards, setOlderTimecards] = useState<Timecard[]>([]);
  const [nextTimecardBeforeId, setNextTimecardBeforeId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const historyRequest = useRef<AbortController | null>(null);
  const detailRequest = useRef<AbortController | null>(null);
  const allTimecards = useMemo(
    () => (data ? [...data.timecards, ...olderTimecards] : []),
    [data, olderTimecards],
  );
  useEffect(() => {
    historyRequest.current?.abort();
    historyRequest.current = null;
    setOlderTimecards([]);
    setNextTimecardBeforeId(data?.next_timecard_before_id ?? null);
    setHistoryLoading(false);
    setHistoryError("");
  }, [data]);
  useEffect(() => {
    const cancelHistory = () => {
      historyRequest.current?.abort();
      historyRequest.current = null;
      detailRequest.current?.abort();
      detailRequest.current = null;
      setHistoryLoading(false);
      setHistoryCardLoading(false);
      setHistoryCard(null);
      setOlderTimecards([]);
      setNextTimecardBeforeId(null);
      setHistoryError("");
    };
    window.addEventListener(SESSION_CHANGED_EVENT, cancelHistory);
    window.addEventListener(CLINIC_LOCATION_CHANGED_EVENT, cancelHistory);
    return () => {
      cancelHistory();
      window.removeEventListener(SESSION_CHANGED_EVENT, cancelHistory);
      window.removeEventListener(CLINIC_LOCATION_CHANGED_EVENT, cancelHistory);
    };
  }, []);
  function refreshRecords() {
    historyRequest.current?.abort();
    historyRequest.current = null;
    detailRequest.current?.abort();
    detailRequest.current = null;
    setHistoryCardLoading(false);
    setOlderTimecards([]);
    setNextTimecardBeforeId(null);
    setHistoryLoading(false);
    setHistoryError("");
    refresh();
    corrections.refresh();
  }

  const latestCards = useMemo(() => {
    const found = new Map<string, Timecard>();
    allTimecards.forEach((card) => {
      if (!found.has(card.period_start)) found.set(card.period_start, card);
    });
    return [...found.values()];
  }, [allTimecards]);
  const workweeks = [
    ...new Map(
      [...latestCards, ...(corrections.data?.adjustments ?? [])].map(
        (period) => [workweekKey(period), period],
      ),
    ).entries(),
  ].sort(([, left], [, right]) =>
    right.period_start.localeCompare(left.period_start),
  );
  const visibleCards = latestCards.filter(
    (card) => workweek === "all" || workweekKey(card) === workweek,
  );
  const visibleCorrections =
    corrections.data?.adjustments.filter(
      (adjustment) =>
        (workweek === "all" || workweekKey(adjustment) === workweek) &&
        (correctionStatus === "all" || adjustment.status === correctionStatus),
    ) ?? [];

  async function calculate() {
    if (controlsLocked || !data) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/api/clinic/workforce/timecards/calculate", {
        method: "POST",
        body: {},
      });
      setNotice(
        "Current hours recalculated from saved punches and approved corrections.",
      );
      refreshRecords();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to calculate current hours.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit(card: Timecard, recovering = false) {
    if (
      busy ||
      (!recovering &&
        (pendingSubmission || !data || card.workflow?.can_submit !== true))
    )
      return;
    setPendingSubmission(card);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/clinic/workforce/timecards/${card.id}/submit`, {
        method: "POST",
        body: { lock_version: card.lock_version },
      });
      setPendingSubmission(null);
      setNotice("Timecard submitted for review.");
      refreshRecords();
    } catch (reason) {
      const rejected =
        reason instanceof ApiError &&
        reason.status >= 400 &&
        reason.status < 500 &&
        ![408, 429].includes(reason.status) &&
        !["outcome_unconfirmed", "session_changed"].includes(reason.code ?? "");
      if (rejected && !recovering) setPendingSubmission(null);
      setError(
        `${reason instanceof Error ? reason.message : "Unable to confirm timecard submission."} ${rejected && !recovering ? "Refresh and review the card before trying again." : "Retry the saved submission to confirm its original outcome."}`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadOlderTimecards() {
    if (!nextTimecardBeforeId || historyRequest.current) return;
    const controller = new AbortController();
    historyRequest.current = controller;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const result = await api<HoursData>(
        `/api/clinic/workforce/timecards?view=self&before_timecard_id=${encodeURIComponent(nextTimecardBeforeId)}`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setOlderTimecards((current) => [...current, ...result.timecards]);
      setNextTimecardBeforeId(result.next_timecard_before_id);
    } catch (reason) {
      if (!controller.signal.aborted)
        setHistoryError(
          reason instanceof Error
            ? reason.message
            : "Unable to load older timecards.",
        );
    } finally {
      if (historyRequest.current === controller) {
        historyRequest.current = null;
        setHistoryLoading(false);
      }
    }
  }

  async function openHistoryCard(id: number) {
    const loaded = allTimecards.find((card) => card.id === id);
    if (loaded) {
      setHistoryCard(loaded);
      return;
    }
    const controller = new AbortController();
    detailRequest.current?.abort();
    detailRequest.current = controller;
    setHistoryCardLoading(true);
    try {
      const result = await api<{ timecard: Timecard }>(
        `/api/clinic/workforce/timecards/${id}?view=self`,
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) setHistoryCard(result.timecard);
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load the resulting timecard.",
        );
    } finally {
      if (detailRequest.current === controller) {
        detailRequest.current = null;
        setHistoryCardLoading(false);
      }
    }
  }

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ justifyContent: "space-between", alignItems: { sm: "flex-end" } }}
      >
        <Box>
          <Typography variant="overline" color="text.secondary">
            WORKFORCE
          </Typography>
          <Typography variant="h1">My hours</Typography>
          <Typography color="text.secondary">
            Saved punches are shown exactly; rounding and paid-break rules are
            shown separately in each calculated period.
          </Typography>
        </Box>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <Button disabled={busy} onClick={refreshRecords}>
            Refresh hours and corrections
          </Button>
          <Button
            variant="outlined"
            startIcon={<RefreshOutlinedIcon />}
            disabled={controlsLocked || !data}
            onClick={() => void calculate()}
          >
            Recalculate current week
          </Button>
        </Stack>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{ gap: 2, flexWrap: "wrap" }}
      >
        <TextField
          select
          label="Workweek for hours and corrections"
          value={workweek}
          onChange={(event) => setWorkweek(event.target.value)}
          sx={{ minWidth: { sm: 280 } }}
        >
          <MenuItem value="all">All available workweeks</MenuItem>
          {workweek !== "all" &&
            !workweeks.some(([key]) => key === workweek) && (
              <MenuItem value={workweek}>
                Selected workweek is unavailable
              </MenuItem>
            )}
          {workweeks.map(([key, period]) => (
            <MenuItem key={key} value={key}>
              Starting {formatDisplayDate(period.period_start)}
            </MenuItem>
          ))}
        </TextField>
        {(workweek !== "all" || correctionStatus !== "all") && (
          <Button
            onClick={() => {
              setWorkweek("all");
              setCorrectionStatus("all");
            }}
          >
            Clear history filters
          </Button>
        )}
      </Stack>
      {pendingSubmission && busy && (
        <Typography role="status">Submitting timecard…</Typography>
      )}
      {pendingSubmission && !busy && (
        <Alert severity="warning">
          Submission for the week starting{" "}
          {formatDisplayDate(pendingSubmission.period_start)}, version{" "}
          {pendingSubmission.version_number}, is unconfirmed.
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{ mt: 1 }}
          >
            <Button
              disabled={busy}
              onClick={() => void submit(pendingSubmission, true)}
            >
              Retry saved submission
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                if (
                  !window.confirm(
                    "Stop retrying this submission? It may already be saved. Refresh and review its current status before submitting again.",
                  )
                )
                  return;
                setPendingSubmission(null);
                refreshRecords();
              }}
            >
              Stop retrying and refresh
            </Button>
          </Stack>
        </Alert>
      )}
      {!data && <LoadState error={loadError} onRetry={refresh} />}
      {data && latestCards.length > 0 && (
        <Typography role="status" color="text.secondary">
          Showing {visibleCards.length} of {latestCards.length} loaded
          timecards.
        </Typography>
      )}
      {visibleCards.map((card) => (
        <TimecardSummary
          key={card.id}
          card={card}
          corrections={corrections.data?.adjustments.filter(
            (adjustment) =>
              adjustment.resulting_timecard_version_id === card.id,
          )}
          actions={
            <>
              <Button
                disabled={
                  controlsLocked ||
                  card.workflow?.can_submit !== true ||
                  card.unresolved_exceptions.length > 0
                }
                variant="contained"
                onClick={() => void submit(card)}
              >
                Submit for review
              </Button>
              <Button
                disabled={controlsLocked || card.status === "superseded"}
                onClick={() => setCorrectionCard(card)}
              >
                Request correction
              </Button>
            </>
          }
        />
      ))}
      {historyError && <Alert severity="error">{historyError}</Alert>}
      {nextTimecardBeforeId && (
        <Button
          disabled={historyLoading}
          onClick={() => void loadOlderTimecards()}
          sx={{ alignSelf: "start" }}
        >
          {historyLoading
            ? "Loading older timecards…"
            : historyError
              ? "Retry loading older timecards"
              : "Load older timecards"}
        </Button>
      )}
      {data && !latestCards.length && (
        <Alert severity="info">
          No calculated timecards yet. Recalculate the current week after your
          first saved clock action.
        </Alert>
      )}
      {data && latestCards.length > 0 && !visibleCards.length && (
        <Alert severity="info">
          No calculated timecard is available for this workweek.
        </Alert>
      )}
      <Stack component="section" aria-label="My correction history" spacing={2}>
        <Typography variant="h2">Correction history</Typography>
        <Typography color="text.secondary">
          Saved requests and review outcomes, including requests against earlier
          timecard versions. Times use your device timezone (
          {Intl.DateTimeFormat().resolvedOptions().timeZone}).
        </Typography>
        <TextField
          select
          label="Correction status"
          value={correctionStatus}
          onChange={(event) => setCorrectionStatus(event.target.value)}
          sx={{ maxWidth: 320 }}
        >
          <MenuItem value="all">All correction statuses</MenuItem>
          <MenuItem value="submitted">Awaiting review</MenuItem>
          <MenuItem value="approved">Approved</MenuItem>
          <MenuItem value="denied">Denied</MenuItem>
        </TextField>
        {corrections.data && corrections.data.adjustments.length > 0 && (
          <Typography role="status" color="text.secondary">
            Showing {visibleCorrections.length} of{" "}
            {corrections.data.adjustments.length} correction requests.
          </Typography>
        )}
        {!corrections.data ? (
          <LoadState error={corrections.error} onRetry={corrections.refresh} />
        ) : corrections.data.adjustments.length === 0 ? (
          <Typography color="text.secondary">
            No timecard corrections have been requested.
          </Typography>
        ) : visibleCorrections.length === 0 ? (
          <Typography color="text.secondary">
            No corrections match these history filters.
          </Typography>
        ) : (
          visibleCorrections.map((adjustment) => {
            const result = allTimecards.find(
              (card) => card.id === adjustment.resulting_timecard_version_id,
            );
            const proposed = adjustment.proposed_changes;
            return (
              <Paper variant="outlined" sx={{ p: 2 }} key={adjustment.id}>
                <Stack spacing={1}>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1}
                    sx={{ justifyContent: "space-between" }}
                  >
                    <Typography variant="h3">
                      {
                        {
                          add_segment: "Add missing time",
                          replace_segment: "Correct an interval",
                          remove_segment: "Remove an interval",
                        }[adjustment.correction_type]
                      }
                    </Typography>
                    <Chip
                      size="small"
                      sx={{ alignSelf: "start" }}
                      label={
                        adjustment.status === "submitted"
                          ? "Awaiting review"
                          : adjustment.status === "approved"
                            ? "Approved"
                            : "Denied"
                      }
                      color={
                        adjustment.status === "approved"
                          ? "success"
                          : adjustment.status === "submitted"
                            ? "info"
                            : "default"
                      }
                    />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    Week starting {formatDisplayDate(adjustment.period_start)} ·
                    requested {formatDisplayDateTime(adjustment.requested_at)}
                  </Typography>
                  {adjustment.source_interval && (
                    <Typography variant="body2">
                      Original interval:{" "}
                      {formatDisplayDateTime(
                        adjustment.source_interval.started_at_utc,
                      )}{" "}
                      –{" "}
                      {formatDisplayDateTime(
                        adjustment.source_interval.ended_at_utc,
                      )}
                    </Typography>
                  )}
                  {proposed.started_at_utc && proposed.ended_at_utc && (
                    <Typography variant="body2">
                      Requested interval:{" "}
                      {formatDisplayDateTime(String(proposed.started_at_utc))} –{" "}
                      {formatDisplayDateTime(String(proposed.ended_at_utc))}
                    </Typography>
                  )}
                  <Typography sx={{ whiteSpace: "pre-wrap" }}>
                    Reason: {adjustment.reason}
                  </Typography>
                  {adjustment.decision_reason && (
                    <Typography sx={{ whiteSpace: "pre-wrap" }}>
                      Review reason: {adjustment.decision_reason}
                    </Typography>
                  )}
                  {adjustment.reviewed_at && (
                    <Typography variant="body2" color="text.secondary">
                      Reviewed {formatDisplayDateTime(adjustment.reviewed_at)}
                    </Typography>
                  )}
                  {result ? (
                    <Button
                      sx={{ alignSelf: "start" }}
                      onClick={() => void openHistoryCard(result.id)}
                    >
                      View resulting timecard · version {result.version_number}
                    </Button>
                  ) : adjustment.resulting_timecard_version_id ? (
                    <Button
                      sx={{ alignSelf: "start" }}
                      onClick={() =>
                        void openHistoryCard(
                          adjustment.resulting_timecard_version_id!,
                        )
                      }
                    >
                      View resulting timecard
                    </Button>
                  ) : null}
                </Stack>
              </Paper>
            );
          })
        )}
      </Stack>
      <Dialog
        open={Boolean(historyCard) || historyCardLoading}
        onClose={() => {
          detailRequest.current?.abort();
          detailRequest.current = null;
          setHistoryCardLoading(false);
          setHistoryCard(null);
        }}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Timecard created by the correction</DialogTitle>
        <DialogContent>
          {historyCardLoading ? (
            <Typography role="status">Loading resulting timecard…</Typography>
          ) : (
            historyCard && <TimecardSummary card={historyCard} />
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              detailRequest.current?.abort();
              detailRequest.current = null;
              setHistoryCardLoading(false);
              setHistoryCard(null);
            }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
      {correctionCard && data && (
        <AdjustmentDialog
          card={correctionCard}
          sites={data.correction_sites}
          open={true}
          onClose={() => setCorrectionCard(null)}
          onSaved={() => {
            setNotice("Correction request submitted.");
            refreshRecords();
          }}
        />
      )}
    </Stack>
  );
}
