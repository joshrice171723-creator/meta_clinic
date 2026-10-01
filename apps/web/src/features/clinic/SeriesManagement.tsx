import { useEffect, useState } from "react";
import {
  Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, MenuItem, Stack, TextField, Typography,
} from "@mui/material";
import { api, ApiError } from "../../api/client";
import { businessNow } from "../../shared/businessDate";
import { useResource } from "../../shared/ui";

type Visit = {
  sequence: number;
  original_date: string;
  state: string;
  skip_reason: string | null;
  change_reason: string | null;
  appointment_id: number | null;
  starts_at: string | null;
  updated_at: string | null;
  appointment_status: string | null;
};
type Series = {
  id: number;
  timezone: string;
  interval_weeks: number;
  occurrences: Visit[];
  changes: { action: string; from_sequence: number; reason: string; created_at: string;
    written_by_membership_id: number }[];
};
type Change = {
  sequence: number;
  appointment_id: number;
  starts_at: string | null;
  expected_updated_at: string;
  conflict: string | null;
};
type Attempt = { action: "change_future" | "cancel_future"; body: object };

export function SeriesManagement({ active = true, seriesId, canChange, canCancel, onClose, onChanged }: {
  active?: boolean;
  seriesId: number | null;
  canChange: boolean;
  canCancel: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const resource = useResource<{ series: Series }>(
    `/api/clinic/appointment_series/${seriesId ?? ""}`,
    { enabled: seriesId !== null },
  );
  const series = resource.data?.series.id === seriesId ? resource.data.series : undefined;
  const [fromSequence, setFromSequence] = useState(1);
  const [localTime, setLocalTime] = useState("09:00");
  const [preview, setPreview] = useState<Change[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [reason, setReason] = useState("");
  const [attempt, setAttempt] = useState<Attempt | null>(null);

  useEffect(() => {
    setFromSequence(1);
    setPreview(null);
    setAcknowledged(false);
    setReason("");
    setAttempt(null);
    setError("");
  }, [seriesId]);

  const upcoming = (series?.occurrences ?? []).filter((visit) =>
    visit.appointment_id && visit.starts_at && visit.updated_at &&
    ["scheduled", "confirmed"].includes(visit.appointment_status ?? "") &&
    Date.parse(visit.starts_at) > businessNow().getTime(),
  );
  useEffect(() => {
    if (upcoming.length && !upcoming.some((visit) => visit.sequence === fromSequence))
      setFromSequence(upcoming[0].sequence);
  }, [series, fromSequence]);
  const selected = upcoming.find((visit) => visit.sequence === fromSequence);
  const selectedAndLater = upcoming.filter((visit) => visit.sequence >= fromSequence);
  const versions = selectedAndLater.map((visit) => ({
    appointment_id: visit.appointment_id,
    updated_at: visit.updated_at,
  }));
  const format = (value: string) => new Date(value).toLocaleString("en-US", {
    timeZone: series?.timezone, dateStyle: "medium", timeStyle: "short",
  });
  const currentTime = selected?.starts_at && series
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: series.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).format(new Date(selected.starts_at))
    : null;

  const close = () => {
    if (busy || attempt) return;
    onClose();
  };
  const loadPreview = async () => {
    if (!series || !selected || attempt) return;
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      const result = await api<{ occurrences: Change[] }>(
        `/api/clinic/appointment_series/${series.id}/preview_change`,
        { method: "POST", body: { change: { from_sequence: fromSequence, local_time: localTime } } },
      );
      setPreview(result.occurrences);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not preview future visits.");
    } finally {
      setBusy(false);
    }
  };
  const submit = async (next: Attempt) => {
    if (!series || busy) return;
    setBusy(true);
    setError("");
    setAttempt(next);
    try {
      await api(`/api/clinic/appointment_series/${series.id}/${next.action}`,
        { method: "POST", body: next.body });
      setAttempt(null);
      setPreview(null);
      setAcknowledged(false);
      setReason("");
      resource.refresh();
      onChanged();
    } catch (failure) {
      const uncertain = !(failure instanceof ApiError) || failure.status === 408 ||
        failure.status >= 500 || failure.code === "outcome_unconfirmed";
      if (!uncertain) {
        setAttempt(null);
        setPreview(null);
        resource.refresh();
      }
      setError(uncertain
        ? "The result is uncertain. Retry this exact request before making another series change."
        : failure instanceof Error ? failure.message : "Could not update the series.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={active && seriesId !== null} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>Recurring appointment series</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {resource.error && <Alert severity="error">{resource.error}</Alert>}
          {!series && !resource.error && <Typography>Loading series…</Typography>}
          {series && <>
            <Typography variant="body2">Every {series.interval_weeks} week{series.interval_weeks === 1 ? "" : "s"} · {series.timezone}</Typography>
            {series.occurrences.map((visit) => (
              <Typography key={visit.sequence} variant="body2">
                {visit.sequence}. {visit.starts_at ? format(visit.starts_at) : visit.original_date}
                {` · ${visit.appointment_status ?? visit.state}`}
                {visit.skip_reason ? ` · ${visit.skip_reason}` : ""}
                {visit.change_reason ? ` · ${visit.change_reason}` : ""}
              </Typography>
            ))}
            {series.changes.length > 0 && <>
              <Typography variant="subtitle2">Series history</Typography>
              {series.changes.map((change, index) => <Typography key={index} variant="body2">
                {format(change.created_at)} · {change.action === "cancel_future" ? "Cancelled" : "Changed"}
                {` visit ${change.from_sequence} and later · ${change.reason} · staff #${change.written_by_membership_id}`}
              </Typography>)}
            </>}
            {upcoming.length > 0 && (canChange || canCancel) && <>
              <TextField select fullWidth size="small" label="From this visit onward"
                value={selected ? fromSequence : upcoming[0].sequence}
                disabled={busy || Boolean(attempt)}
                onChange={(event) => {
                  setFromSequence(Number(event.target.value));
                  setPreview(null);
                  setAcknowledged(false);
                }}>
                {upcoming.map((visit) => <MenuItem key={visit.sequence} value={visit.sequence}>
                  Visit {visit.sequence} · {visit.starts_at ? format(visit.starts_at) : visit.original_date}
                </MenuItem>)}
              </TextField>
              <TextField label="Reason for this change" value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={busy || Boolean(attempt)}
                slotProps={{ htmlInput: { maxLength: 500 } }} />
              {canChange && <><TextField type="time" label="New local time" size="small"
                value={localTime || currentTime || "09:00"}
                disabled={busy || Boolean(attempt)}
                onChange={(event) => { setLocalTime(event.target.value); setPreview(null); }}
                slotProps={{ inputLabel: { shrink: true } }} />
              <Button variant="outlined" disabled={busy || Boolean(attempt)} onClick={() => void loadPreview()}>
                Preview future changes
              </Button>
              {preview?.map((visit) => <Typography key={visit.sequence} variant="body2" color={visit.conflict ? "error" : "text.primary"}>
                Visit {visit.sequence}: {visit.conflict ?? (visit.starts_at ? format(visit.starts_at) : "Choose another time")}
              </Typography>)}
              <Button variant="contained" disabled={busy || Boolean(attempt) || !reason.trim() || !preview?.length ||
                preview.some((visit) => visit.conflict || !visit.starts_at) ||
                preview.length !== selectedAndLater.length}
                onClick={() => void submit({ action: "change_future", body: { change: {
                  from_sequence: fromSequence, local_time: localTime,
                  expected_versions: versions, reason: reason.trim(), request_key: crypto.randomUUID(),
                } } })}>
                Save future changes
              </Button></>}
              {canCancel && <>
              <FormControlLabel control={<Checkbox checked={acknowledged}
                disabled={busy || Boolean(attempt)}
                onChange={(event) => setAcknowledged(event.target.checked)} />}
                label="I understand cancellation messages are not sent automatically" />
              <Button color="error" variant="outlined" disabled={busy || Boolean(attempt) || !acknowledged || !reason.trim()}
                onClick={() => void submit({ action: "cancel_future", body: { cancel: {
                  from_sequence: fromSequence, expected_versions: versions,
                  reason: reason.trim(), cancellation_message_acknowledged: true,
                  request_key: crypto.randomUUID(),
                } } })}>
                Cancel selected and later visits
              </Button>
              </>}
            </>}
            {upcoming.length === 0 && <Typography variant="body2">No future visits are available to change.</Typography>}
          </>}
          {error && <Alert severity="error">{error}</Alert>}
          {attempt && <Button disabled={busy} onClick={() => void submit(attempt)}>Retry exact request</Button>}
        </Stack>
      </DialogContent>
      <DialogActions><Button disabled={busy || Boolean(attempt)} onClick={close}>Close</Button></DialogActions>
    </Dialog>
  );
}
