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
} from "@mui/material";
import { api } from "../../api/client";
import type { Timecard } from "./clockTypes";

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
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (open) {
      setError("");
      setRequestKey(crypto.randomUUID());
    }
  }, [open]);

  async function save() {
    setBusy(true);
    setError("");
    try {
      const selected = card.snapshot.segments.find(
        (segment) => String(segment.id) === sourceSegmentId,
      );
      await api("/api/clinic/workforce/adjustments", {
        method: "POST",
        body: {
          timecard_version_id: card.id,
          correction_type: correctionType,
          proposed_changes: {
            source_segment_id: sourceSegmentId || undefined,
            site_id:
              siteId ?? selected?.site_id ?? card.snapshot.segments[0]?.site_id,
            started_at_utc:
              correctionType === "remove_segment"
                ? undefined
                : new Date(startedAt).toISOString(),
            ended_at_utc:
              correctionType === "remove_segment"
                ? undefined
                : new Date(endedAt).toISOString(),
          },
          reason,
          request_key: requestKey,
          source_lock_version: card.lock_version,
        },
      });
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

  const needsSource = correctionType !== "add_segment";
  const needsTimes = correctionType !== "remove_segment";
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
              value={sourceSegmentId}
              onChange={(event) => setSourceSegmentId(event.target.value)}
            >
              {card.snapshot.segments.map((segment) => (
                <MenuItem key={segment.id} value={String(segment.id)}>
                  {segment.local_date} ·{" "}
                  {new Date(segment.started_at_utc).toLocaleTimeString()}–
                  {new Date(segment.ended_at_utc).toLocaleTimeString()}
                </MenuItem>
              ))}
            </TextField>
          )}
          {needsTimes && (
            <>
              <TextField
                label="Corrected start"
                type="datetime-local"
                value={startedAt}
                onChange={(event) => setStartedAt(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label="Corrected end"
                type="datetime-local"
                value={endedAt}
                onChange={(event) => setEndedAt(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </>
          )}
          <TextField
            label="Reason"
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
          disabled={
            busy ||
            !reason.trim() ||
            (needsSource && !sourceSegmentId) ||
            (needsTimes && (!startedAt || !endedAt))
          }
        >
          {busy ? "Submitting…" : "Submit correction"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
