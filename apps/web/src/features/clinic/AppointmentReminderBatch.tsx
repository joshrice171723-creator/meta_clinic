import { api } from "../../api/client";
import type { Appointment } from "../../api/contracts";
import { patientReferenceLabel } from "./patientReference";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";

type PreviewItem = {
  appointment_id: number;
  patient: { id: number; display_name: string; reference: string };
  starts_at: string;
  scheduled_at: string | null;
  timezone: string;
  masked_destination: string | null;
  message: string | null;
  status: "ready" | "already_scheduled" | "unavailable";
  reason: string | null;
  preview_digest: string | null;
};

type BatchPreview = { items: PreviewItem[]; ready_count: number; configuration: { enabled: boolean; lead_hours: number; revision: number } };
type ScheduleResult = {
  appointment_id: number;
  status: "scheduled" | "already_scheduled" | "skipped";
  reminder_id: number | null;
  reason: string | null;
};
type BatchSchedule = { results: ScheduleResult[] };

function dateTimeLabel(value: string, timeZone?: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: timeZone ? "short" : undefined,
  }).format(new Date(value));
}

function previewStatus(item: PreviewItem) {
  if (item.status === "ready") return "Ready";
  if (item.status === "already_scheduled") return "Already scheduled";
  return "Unavailable";
}

export function AppointmentReminderBatch({
  appointments,
  selectedIds,
  canSchedule,
  onClearSelection,
  onSelectAll,
}: {
  appointments: Appointment[];
  selectedIds: number[];
  canSchedule: boolean;
  onClearSelection: () => void;
  onSelectAll: () => void;
}) {
  const [preview, setPreview] = useState<BatchPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [scheduleError, setScheduleError] = useState("");
  const [results, setResults] = useState<BatchSchedule | null>(null);
  const [busy, setBusy] = useState<"preview" | "schedule" | null>(null);
  const scheduleInFlight = useRef(false);
  const previewGeneration = useRef(0);
  const selectionKey = selectedIds
    .slice()
    .sort((left, right) => left - right)
    .join(",");
  const currentSelectionKey = useRef(selectionKey);
  currentSelectionKey.current = selectionKey;

  const selectedAppointments = useMemo(
    () =>
      appointments.filter((appointment) =>
        selectedIds.includes(appointment.id),
      ),
    [appointments, selectedIds],
  );

  useEffect(() => {
    previewGeneration.current += 1;
    setPreview(null);
    setPreviewError("");
    setScheduleError("");
    setResults(null);
    setBusy(null);
  }, [selectedIds]);

  async function requestPreview() {
    if (!canSchedule || selectedIds.length === 0) return;
    const requestSelectionKey = selectionKey;
    const requestGeneration = previewGeneration.current;
    const appointmentIds = [...selectedIds];
    setBusy("preview");
    setPreviewError("");
    setScheduleError("");
    setResults(null);
    try {
      const value = await api<BatchPreview>(
        "/api/clinic/reminders/batch_preview",
        {
          method: "POST",
          body: { appointment_ids: appointmentIds },
        },
      );
      if (
        currentSelectionKey.current === requestSelectionKey &&
        previewGeneration.current === requestGeneration
      ) {
        setPreview(value);
      }
    } catch (error) {
      if (
        currentSelectionKey.current === requestSelectionKey &&
        previewGeneration.current === requestGeneration
      ) {
        setPreviewError(
          error instanceof Error
            ? error.message
            : "The reminder preview could not be loaded.",
        );
      }
    } finally {
      if (
        currentSelectionKey.current === requestSelectionKey &&
        previewGeneration.current === requestGeneration
      ) {
        setBusy(null);
      }
    }
  }

  async function schedule() {
    if (!preview || preview.ready_count === 0 || scheduleInFlight.current)
      return;
    const items = preview.items.flatMap((item) =>
      item.status === "ready" && item.preview_digest
        ? [
            {
              appointment_id: item.appointment_id,
              preview_digest: item.preview_digest,
            },
          ]
        : [],
    );
    if (items.length === 0) return;
    scheduleInFlight.current = true;
    setBusy("schedule");
    setScheduleError("");
    try {
      const value = await api<BatchSchedule>(
        "/api/clinic/reminders/batch_schedule",
        {
          method: "POST",
          body: { items },
        },
      );
      setResults(value);
    } catch (error) {
      setScheduleError(
        error instanceof Error
          ? error.message
          : "The selected reminders could not be scheduled.",
      );
    } finally {
      scheduleInFlight.current = false;
      setBusy(null);
    }
  }

  const previewByAppointment = new Map(
    (preview?.items || []).map((item) => [item.appointment_id, item]),
  );

  return (
    <Box
      component="section"
      sx={{ mb: 2.5 }}
      aria-labelledby="batch-reminders-title"
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{
          alignItems: { sm: "center" },
          justifyContent: "space-between",
          gap: 1.25,
          mb: 1,
        }}
      >
        <Box>
          <Typography
            id="batch-reminders-title"
            variant="subtitle1"
            sx={{ fontWeight: 700 }}
          >
            Plan standard reminders
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Select from the {appointments.length} displayed appointments (up to
            100), then review the messages and delivery eligibility before
            scheduling.
          </Typography>
        </Box>
        <Stack direction="row" sx={{ gap: 1, flexShrink: 0 }}>
          <FormControlLabel
            label="Select all displayed"
            control={
              <Checkbox
                size="small"
                checked={
                  appointments.length > 0 &&
                  selectedIds.length === appointments.length
                }
                indeterminate={
                  selectedIds.length > 0 &&
                  selectedIds.length < appointments.length
                }
                disabled={busy !== null || appointments.length === 0}
                onChange={(event) => {
                  if (event.target.checked) onSelectAll();
                  else onClearSelection();
                }}
                slotProps={{
                  input: {
                    "aria-label": `Select all ${appointments.length} displayed appointments`,
                  },
                }}
              />
            }
            sx={{ mr: 0 }}
          />
          {selectedIds.length > 0 && (
            <Button
              size="small"
              onClick={onClearSelection}
              disabled={busy !== null}
            >
              Clear selection
            </Button>
          )}
          <Button
            variant="outlined"
            size="small"
            onClick={() => void requestPreview()}
            disabled={!canSchedule || selectedIds.length === 0 || busy !== null}
          >
            {busy === "preview"
              ? "Checking…"
              : `Preview ${selectedIds.length || ""} reminder${selectedIds.length === 1 ? "" : "s"}`}
          </Button>
        </Stack>
      </Stack>
      {!canSchedule && (
        <Typography variant="caption" color="text.secondary">
          Your role can review appointments but cannot schedule reminders.
        </Typography>
      )}
      {previewError && (
        <Alert
          severity="error"
          sx={{ mt: 1.25 }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => void requestPreview()}
            >
              Retry
            </Button>
          }
        >
          {previewError}
        </Alert>
      )}
      {selectedAppointments.length === 0 && !previewError && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.25 }}>
          Use the checkboxes beside appointments to plan more than one reminder
          at a time.
        </Typography>
      )}

      <Dialog
        open={preview !== null}
        fullWidth
        maxWidth="md"
        onClose={() => !busy && setPreview(null)}
      >
        <DialogTitle>Review reminder schedule</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="info">
              Ready reminders are scheduled for {preview?.configuration?.lead_hours ?? 24} hours before the appointment.
              They are not sent now. If an appointment moves, its scheduled
              message is cancelled; preview and schedule the updated visit
              again.
            </Alert>
            {preview && (
              <Table
                size="small"
                aria-label="Appointment reminder schedule preview"
              >
                <TableHead>
                  <TableRow>
                    <TableCell>Appointment</TableCell>
                    <TableCell>Scheduled message</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {preview.items.map((item) => (
                    <TableRow key={item.appointment_id}>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {item.patient.display_name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {patientReferenceLabel(item.patient.reference)
                            ? `${patientReferenceLabel(item.patient.reference)} · `
                            : ""}
                          {dateTimeLabel(item.starts_at, item.timezone)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {item.scheduled_at ? (
                          <>
                            <Typography variant="body2">
                              {dateTimeLabel(item.scheduled_at, item.timezone)}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {item.masked_destination ||
                                "Destination unavailable"}
                            </Typography>
                            {item.message && (
                              <Typography
                                variant="caption"
                                sx={{
                                  display: "block",
                                  mt: 0.5,
                                  whiteSpace: "pre-wrap",
                                }}
                              >
                                {item.message}
                              </Typography>
                            )}
                          </>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            No scheduled message
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          variant="outlined"
                          label={previewStatus(item)}
                          color={
                            item.status === "ready"
                              ? "success"
                              : item.status === "unavailable"
                                ? "warning"
                                : "default"
                          }
                        />
                        {item.reason && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: "block", mt: 0.5 }}
                          >
                            {item.reason}
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {scheduleError && (
              <Alert
                severity="error"
                action={
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() => void schedule()}
                  >
                    Retry
                  </Button>
                }
              >
                {scheduleError}
              </Alert>
            )}
            {results && (
              <>
                <Divider />
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Scheduling results
                </Typography>
                <Table
                  size="small"
                  aria-label="Appointment reminder scheduling results"
                >
                  <TableHead>
                    <TableRow>
                      <TableCell>Appointment</TableCell>
                      <TableCell>Outcome</TableCell>
                      <TableCell>History</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {results.results.map((result) => {
                      const item = previewByAppointment.get(
                        result.appointment_id,
                      );
                      return (
                        <TableRow key={result.appointment_id}>
                          <TableCell>
                            {item?.patient.display_name ||
                              "Appointment details unavailable"}
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">
                              {result.status.replaceAll("_", " ")}
                            </Typography>
                            {result.reason && (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                {result.reason}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            {result.reminder_id ? (
                              <Button
                                size="small"
                                href={`/clinic/reminders?reminder_id=${result.reminder_id}`}
                              >
                                Open history
                              </Button>
                            ) : (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                No reminder record returned
                              </Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreview(null)} disabled={busy !== null}>
            Close
          </Button>
          {!results && (
            <Button
              variant="contained"
              onClick={() => void schedule()}
              disabled={busy !== null || !preview || preview.ready_count === 0}
            >
              {busy === "schedule" ? (
                <CircularProgress size={18} color="inherit" />
              ) : (
                `Schedule ${preview?.ready_count || 0} ready reminder${preview?.ready_count === 1 ? "" : "s"}`
              )}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
