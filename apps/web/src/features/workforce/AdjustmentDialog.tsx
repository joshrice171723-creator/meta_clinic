import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { ApiError, api } from "../../api/client";
import type { Timecard } from "./clockTypes";
import { useClinicNavigation } from "../clinic/clinicNavigation";
import { useDemoNavigationBlocker } from "../demo/navigationBlockers";

export type CorrectionSite = { id: number; name: string; timezone: string };
type ClockOccurrence = "recorded" | "only" | "first" | "second";
type CorrectionAttempt = {
  timecard_version_id: number;
  correction_type: string;
  proposed_changes: {
    source_segment_id?: string;
    site_id?: number;
    started_at_utc?: string;
    ended_at_utc?: string;
    timezone?: string;
    local_start?: string;
    local_end?: string;
    start_occurrence?: string;
    end_occurrence?: string;
  };
  reason: string;
  source_lock_version: number;
  request_key: string;
};

function localInput(iso: string) {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function AdjustmentDialog({
  card,
  siteId,
  sites = [],
  open,
  onClose,
  onSaved,
}: {
  card: Timecard;
  siteId?: number;
  sites?: CorrectionSite[];
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { registerBlocker } = useClinicNavigation();
  const [correctionType, setCorrectionType] = useState<
    "add_segment" | "replace_segment" | "remove_segment"
  >("add_segment");
  const [sourceSegmentId, setSourceSegmentId] = useState("");
  const [startedAt, setStartedAt] = useState("");
  const [endedAt, setEndedAt] = useState("");
  const [startOccurrence, setStartOccurrence] =
    useState<ClockOccurrence>("only");
  const [endOccurrence, setEndOccurrence] = useState<ClockOccurrence>("only");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [pendingAttempt, setPendingAttempt] =
    useState<CorrectionAttempt | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState(() => {
    const sourceSiteId = card.snapshot.segments[0]?.site_id;
    return String(
      siteId ??
        (sites.some((site) => site.id === sourceSiteId)
          ? sourceSiteId
          : sites[0]?.id) ??
        sourceSiteId ??
        "",
    );
  });
  const controlsLocked = busy || pendingAttempt !== null;
  const leaveMessage = !open
    ? null
    : busy
      ? "A correction request is still saving."
      : pendingAttempt
        ? "This correction is unconfirmed. Closing loses its saved retry. Check correction history before submitting another request."
        : dirty
          ? "Discard the unsaved correction?"
          : null;
  useDemoNavigationBlocker(() => ({
    blocked: open && busy,
    message: leaveMessage,
  }));
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
  function close() {
    if (busy || (leaveMessage && !window.confirm(leaveMessage))) return;
    onClose();
  }
  useEffect(() => {
    if (open) setError("");
  }, [open]);

  const needsSource = correctionType !== "add_segment";
  const needsTimes = correctionType !== "remove_segment";
  const selected = card.snapshot.segments.find(
    (segment) => String(segment.id) === sourceSegmentId,
  );
  const correctionSiteId = needsSource
    ? selected?.site_id
    : selectedSiteId
      ? Number(selectedSiteId)
      : undefined;
  const originalStart =
    selected &&
    needsSource &&
    startOccurrence === "recorded" &&
    startedAt === localInput(selected.started_at_utc)
      ? selected.started_at_utc
      : undefined;
  const originalEnd =
    selected &&
    needsSource &&
    endOccurrence === "recorded" &&
    endedAt === localInput(selected.ended_at_utc)
      ? selected.ended_at_utc
      : undefined;
  const validTimes =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(startedAt) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(endedAt);
  const canSave =
    !controlsLocked &&
    reason.trim().length > 0 &&
    (!needsSource || Boolean(selected)) &&
    (!needsTimes || validTimes);
  const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  async function save() {
    if (busy || (!pendingAttempt && !canSave)) return;
    const recovering = pendingAttempt !== null;
    setBusy(true);
    setError("");
    try {
      const values: CorrectionAttempt = pendingAttempt || {
        timecard_version_id: card.id,
        correction_type: correctionType,
        proposed_changes: {
          source_segment_id: needsSource ? sourceSegmentId : undefined,
          site_id: correctionSiteId,
          started_at_utc: needsTimes ? originalStart : undefined,
          ended_at_utc: needsTimes ? originalEnd : undefined,
          timezone:
            needsTimes && (!originalStart || !originalEnd)
              ? deviceTimezone
              : undefined,
          local_start: needsTimes && !originalStart ? startedAt : undefined,
          local_end: needsTimes && !originalEnd ? endedAt : undefined,
          start_occurrence:
            needsTimes && !originalStart
              ? startOccurrence === "recorded"
                ? "only"
                : startOccurrence
              : undefined,
          end_occurrence:
            needsTimes && !originalEnd
              ? endOccurrence === "recorded"
                ? "only"
                : endOccurrence
              : undefined,
        },
        reason,
        source_lock_version: card.lock_version,
        request_key: crypto.randomUUID(),
      };
      setPendingAttempt(values);
      await api("/api/clinic/workforce/adjustments", {
        method: "POST",
        body: values,
      });
      setPendingAttempt(null);
      setDirty(false);
      setReason("");
      setStartedAt("");
      setEndedAt("");
      setStartOccurrence("only");
      setEndOccurrence("only");
      setSourceSegmentId("");
      onSaved();
      onClose();
    } catch (reasonValue) {
      const rejected =
        reasonValue instanceof ApiError &&
        reasonValue.status >= 400 &&
        reasonValue.status < 500 &&
        ![408, 429].includes(reasonValue.status) &&
        !["outcome_unconfirmed", "session_changed"].includes(
          reasonValue.code ?? "",
        );
      if (rejected && !recovering) setPendingAttempt(null);
      setError(
        `${reasonValue instanceof Error ? reasonValue.message : "Unable to confirm the correction."} ${rejected && !recovering ? "Review the details before submitting again." : "Retry the saved correction to confirm its original outcome."}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>Request a timecard correction</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity="info">
            The original clock punches stay unchanged. An approved request
            creates a new timecard version.
          </Alert>
          {error && <Alert severity="error">{error}</Alert>}
          {pendingAttempt && busy && (
            <Typography role="status">Saving correction request…</Typography>
          )}
          {pendingAttempt && !busy && (
            <Alert severity="warning">
              This correction is unconfirmed. The original details and retry key
              are retained; retry before changing them.
            </Alert>
          )}
          <TextField
            select
            label="Correction"
            disabled={controlsLocked}
            value={correctionType}
            onChange={(event) => {
              setCorrectionType(event.target.value as typeof correctionType);
              if (event.target.value === "add_segment") {
                setStartOccurrence("only");
                setEndOccurrence("only");
              }
              setDirty(true);
            }}
          >
            <MenuItem value="add_segment">Add missing time</MenuItem>
            <MenuItem value="replace_segment">Correct an interval</MenuItem>
            <MenuItem value="remove_segment">
              Mark an interval inactive
            </MenuItem>
          </TextField>
          {!needsSource && sites.length > 0 && (
            <TextField
              select
              label="Location for missing time"
              value={selectedSiteId}
              disabled={controlsLocked}
              onChange={(event) => {
                setSelectedSiteId(event.target.value);
                setDirty(true);
              }}
            >
              {sites.map((site) => (
                <MenuItem key={site.id} value={String(site.id)}>
                  {site.name}
                </MenuItem>
              ))}
            </TextField>
          )}
          {needsSource && (
            <TextField
              select
              label="Interval"
              disabled={controlsLocked}
              value={sourceSegmentId}
              onChange={(event) => {
                setSourceSegmentId(event.target.value);
                setDirty(true);
                const segment = card.snapshot.segments.find(
                  (item) => String(item.id) === event.target.value,
                );
                if (segment) {
                  setStartedAt(localInput(segment.started_at_utc));
                  setEndedAt(localInput(segment.ended_at_utc));
                  setStartOccurrence("recorded");
                  setEndOccurrence("recorded");
                }
              }}
              helperText={`Times shown in your device timezone (${deviceTimezone}).`}
            >
              {card.snapshot.segments.map((segment) => (
                <MenuItem key={segment.id} value={String(segment.id)}>
                  {new Date(segment.started_at_utc).toLocaleString()}–
                  {new Date(segment.ended_at_utc).toLocaleString()}
                </MenuItem>
              ))}
            </TextField>
          )}
          {needsTimes && (
            <>
              {needsSource && selected && (
                <Alert severity="info">
                  Keep the recorded occurrence to preserve an unchanged time's
                  precision. Edited times are checked in your device timezone.
                </Alert>
              )}
              <TextField
                label="Corrected start"
                disabled={controlsLocked}
                type="datetime-local"
                value={startedAt}
                onChange={(event) => {
                  setStartedAt(event.target.value);
                  setStartOccurrence("only");
                  setDirty(true);
                }}
                slotProps={{ inputLabel: { shrink: true } }}
                helperText={`Your device timezone (${deviceTimezone}).`}
              />
              <TextField
                select
                label="Start clock occurrence"
                disabled={controlsLocked}
                value={startOccurrence}
                onChange={(event) => {
                  setStartOccurrence(event.target.value as ClockOccurrence);
                  setDirty(true);
                }}
                helperText="Choose first or second only when the clock repeats this time."
              >
                {needsSource &&
                  selected &&
                  startedAt === localInput(selected.started_at_utc) && (
                    <MenuItem value="recorded">
                      Keep recorded occurrence and precision
                    </MenuItem>
                  )}
                <MenuItem value="only">Not repeated</MenuItem>
                <MenuItem value="first">First occurrence</MenuItem>
                <MenuItem value="second">Second occurrence</MenuItem>
              </TextField>
              <TextField
                label="Corrected end"
                disabled={controlsLocked}
                type="datetime-local"
                value={endedAt}
                onChange={(event) => {
                  setEndedAt(event.target.value);
                  setEndOccurrence("only");
                  setDirty(true);
                }}
                slotProps={{ inputLabel: { shrink: true } }}
                helperText={`Your device timezone (${deviceTimezone}). The resolved end must be after the start.`}
              />
              <TextField
                select
                label="End clock occurrence"
                disabled={controlsLocked}
                value={endOccurrence}
                onChange={(event) => {
                  setEndOccurrence(event.target.value as ClockOccurrence);
                  setDirty(true);
                }}
                helperText="Choose first or second only when the clock repeats this time."
              >
                {needsSource &&
                  selected &&
                  endedAt === localInput(selected.ended_at_utc) && (
                    <MenuItem value="recorded">
                      Keep recorded occurrence and precision
                    </MenuItem>
                  )}
                <MenuItem value="only">Not repeated</MenuItem>
                <MenuItem value="first">First occurrence</MenuItem>
                <MenuItem value="second">Second occurrence</MenuItem>
              </TextField>
            </>
          )}
          <TextField
            label="Reason"
            disabled={controlsLocked}
            multiline
            minRows={3}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setDirty(true);
            }}
            slotProps={{ htmlInput: { maxLength: 1000 } }}
            required
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => void save()}
          disabled={busy || (!pendingAttempt && !canSave)}
        >
          {busy
            ? "Submitting…"
            : pendingAttempt
              ? "Retry saved correction"
              : "Submit correction"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
