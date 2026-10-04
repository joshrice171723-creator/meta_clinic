import { useEffect, useRef, useState } from "react";
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
} from "@mui/material";
import { api } from "../../api/client";
import type { Timecard } from "./clockTypes";

function localInput(iso: string) {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function AdjustmentDialog({
  card,
  siteId,
  open,
  onClose,
  onSaved,
}: {
  card: Timecard;
  siteId?: number;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [correctionType, setCorrectionType] = useState<
    "add_segment" | "replace_segment" | "remove_segment"
  >("add_segment");
  const [sourceSegmentId, setSourceSegmentId] = useState("");
  const [startedAt, setStartedAt] = useState("");
  const [endedAt, setEndedAt] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const attempts = useRef(new Map<string, string>());
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
    : (siteId ?? card.snapshot.segments[0]?.site_id);
  const validTimes =
    Number.isFinite(new Date(startedAt).getTime()) &&
    Number.isFinite(new Date(endedAt).getTime()) &&
    new Date(endedAt).getTime() > new Date(startedAt).getTime();
  const canSave =
    !busy &&
    reason.trim().length > 0 &&
    (!needsSource || Boolean(selected)) &&
    (!needsTimes || validTimes);
  const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError("");
    try {
      const values = {
        timecard_version_id: card.id,
        correction_type: correctionType,
        proposed_changes: {
          source_segment_id: needsSource ? sourceSegmentId : undefined,
          site_id: correctionSiteId,
          started_at_utc: needsTimes
            ? new Date(startedAt).toISOString()
            : undefined,
          ended_at_utc: needsTimes
            ? new Date(endedAt).toISOString()
            : undefined,
        },
        reason,
        source_lock_version: card.lock_version,
      };
      const signature = JSON.stringify(values);
      const requestKey = attempts.current.get(signature) ?? crypto.randomUUID();
      attempts.current.set(signature, requestKey);
      await api("/api/clinic/workforce/adjustments", {
        method: "POST",
        body: { ...values, request_key: requestKey },
      });
      attempts.current.delete(signature);
      setReason("");
      setStartedAt("");
      setEndedAt("");
      setSourceSegmentId("");
      onSaved();
      onClose();
    } catch (reasonValue) {
      setError(
        reasonValue instanceof Error
          ? reasonValue.message
          : "Unable to request the correction.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>Request a timecard correction</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity="info">
            The original clock punches stay unchanged. An approved request
            creates a new timecard version.
          </Alert>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            select
            label="Correction"
            disabled={busy}
            value={correctionType}
            onChange={(event) =>
              setCorrectionType(event.target.value as typeof correctionType)
            }
          >
            <MenuItem value="add_segment">Add missing time</MenuItem>
            <MenuItem value="replace_segment">Correct an interval</MenuItem>
            <MenuItem value="remove_segment">
              Mark an interval inactive
            </MenuItem>
          </TextField>
          {needsSource && (
            <TextField
              select
              label="Interval"
              disabled={busy}
              value={sourceSegmentId}
              onChange={(event) => {
                setSourceSegmentId(event.target.value);
                const segment = card.snapshot.segments.find(
                  (item) => String(item.id) === event.target.value,
                );
                if (segment) {
                  setStartedAt(localInput(segment.started_at_utc));
                  setEndedAt(localInput(segment.ended_at_utc));
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
              <TextField
                label="Corrected start"
                disabled={busy}
                type="datetime-local"
                value={startedAt}
                onChange={(event) => setStartedAt(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                helperText={`Your device timezone (${deviceTimezone}).`}
              />
              <TextField
                label="Corrected end"
                disabled={busy}
                type="datetime-local"
                value={endedAt}
                onChange={(event) => setEndedAt(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                error={Boolean(startedAt && endedAt && !validTimes)}
                helperText={
                  startedAt && endedAt && !validTimes
                    ? "End must be after the start."
                    : `Your device timezone (${deviceTimezone}).`
                }
              />
            </>
          )}
          <TextField
            label="Reason"
            disabled={busy}
            multiline
            minRows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            slotProps={{ htmlInput: { maxLength: 1000 } }}
            required
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => void save()}
          disabled={!canSave}
        >
          {busy ? "Submitting…" : "Submit correction"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
