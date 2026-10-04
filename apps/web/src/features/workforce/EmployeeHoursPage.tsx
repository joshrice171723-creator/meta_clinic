import { useEffect, useMemo, useState } from "react";
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
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { ApiError, api } from "../../api/client";
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

export function EmployeeHoursPage() {
  const { registerBlocker } = useClinicNavigation();
  const {
    data,
    error: loadError,
    refresh,
  } = useResource<{
    timecards: Timecard[];
    correction_sites: CorrectionSite[];
  }>("/api/clinic/workforce/timecards?view=self");
  const corrections = useResource<{ adjustments: Adjustment[] }>(
    "/api/clinic/workforce/adjustments?view=self",
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
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
  const [historyCardId, setHistoryCardId] = useState<number | null>(null);
  const historyCard = data?.timecards.find((card) => card.id === historyCardId);
  function refreshRecords() {
    refresh();
    corrections.refresh();
  }

  const latestCards = useMemo(() => {
    const found = new Map<string, Timecard>();
    data?.timecards.forEach((card) => {
      if (!found.has(card.period_start)) found.set(card.period_start, card);
    });
    return [...found.values()];
  }, [data]);

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
      {pendingSubmission && (
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
      {latestCards.map((card) => (
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
      {data && !latestCards.length && (
        <Alert severity="info">
          No calculated timecards yet. Recalculate the current week after your
          first saved clock action.
        </Alert>
      )}
      <Stack component="section" aria-label="My correction history" spacing={2}>
        <Typography variant="h2">Correction history</Typography>
        <Typography color="text.secondary">
          Saved requests and review outcomes, including requests against earlier
          timecard versions. Times use your device timezone (
          {Intl.DateTimeFormat().resolvedOptions().timeZone}).
        </Typography>
        {!corrections.data ? (
          <LoadState error={corrections.error} onRetry={corrections.refresh} />
        ) : corrections.data.adjustments.length === 0 ? (
          <Typography color="text.secondary">
            No timecard corrections have been requested.
          </Typography>
        ) : (
          corrections.data.adjustments.map((adjustment) => {
            const result = data?.timecards.find(
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
                      onClick={() => setHistoryCardId(result.id)}
                    >
                      View resulting timecard · version {result.version_number}
                    </Button>
                  ) : (
                    adjustment.resulting_timecard_version_id && (
                      <Typography color="text.secondary">
                        The resulting timecard is not available in this view.
                        Refresh hours to check its current availability.
                      </Typography>
                    )
                  )}
                </Stack>
              </Paper>
            );
          })
        )}
      </Stack>
      <Dialog
        open={Boolean(historyCard)}
        onClose={() => setHistoryCardId(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Timecard created by the correction</DialogTitle>
        <DialogContent>
          {historyCard && <TimecardSummary card={historyCard} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryCardId(null)}>Close</Button>
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
