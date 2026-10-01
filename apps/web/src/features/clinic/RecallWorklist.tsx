import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import PhoneInTalkOutlinedIcon from "@mui/icons-material/PhoneInTalkOutlined";
import TaskAltOutlinedIcon from "@mui/icons-material/TaskAltOutlined";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../api/client";
import { businessTimeAfter } from "../../shared/businessDate";
import { useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";
import { patientReferenceLabel } from "./patientReference";

type RecallStatus =
  "all" | "due" | "upcoming" | "snoozed" | "excluded" | "completed";
type RecallAction =
  "record_outreach" | "snooze" | "exclude" | "complete" | "reopen";

type RecallItem = {
  id: number;
  patient: { id: number; display_name: string; reference: string };
  encounter: {
    id: number;
    site_id: number | null;
    started_at: string;
    href: string;
  };
  source_kind: "in_person" | "telehealth";
  status: Exclude<RecallStatus, "all">;
  clinical_state: "needed" | "arranged" | "completed";
  plan: string;
  source_due_at: string | null;
  effective_due_at: string | null;
  snoozed_until: string | null;
  outreach_count: number;
  latest_event_at: string | null;
  assigned_to_membership_id: number | null;
  assignee_label: string | null;
  version: number;
  updated_at: string;
};

type RecallEvent = {
  id: number;
  event_type:
    "outreach_recorded" | "snoozed" | "excluded" | "completed" | "reopened";
  occurred_at: string;
  previous_clinical_state: string;
  resulting_clinical_state: string;
  source_version: number;
  channel: string | null;
  reason: string | null;
  completion_evidence: string | null;
  snoozed_until: string | null;
  actor: { membership_id: number; display_name: string };
};

type RecallListResponse = {
  summary: Record<Exclude<RecallStatus, "all">, number>;
  recalls: RecallItem[];
  truncated: boolean;
  capabilities: { write: boolean };
  generated_at: string;
};

type RecallDetailResponse = {
  recall: RecallItem;
  history: RecallEvent[];
};

const statusLabels: Record<RecallStatus, string> = {
  all: "All",
  due: "Due",
  upcoming: "Upcoming",
  snoozed: "Snoozed",
  excluded: "Excluded",
  completed: "Completed",
};

const actionLabels: Record<RecallAction, string> = {
  record_outreach: "Record outreach attempt",
  snooze: "Snooze",
  exclude: "Exclude",
  complete: "Complete",
  reopen: "Reopen",
};

const eventLabels: Record<RecallEvent["event_type"], string> = {
  outreach_recorded: "Outreach recorded",
  snoozed: "Snoozed",
  excluded: "Excluded",
  completed: "Completed",
  reopened: "Reopened",
};

function formatDateTime(value: string | null) {
  if (!value) return "Due date not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function localDateTime(value?: string | null) {
  const date = value ? new Date(value) : businessTimeAfter(7 * 86_400_000);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.valueOf() - offset).toISOString().slice(0, 16);
}

function statusColor(
  status: RecallItem["status"],
): "default" | "error" | "warning" | "info" | "success" {
  if (status === "due") return "error";
  if (status === "snoozed") return "warning";
  if (status === "completed") return "success";
  if (status === "upcoming") return "info";
  return "default";
}

export function RecallWorklist() {
  const { capabilities } = useClinic();
  const canManage =
    capabilities.patients === true && capabilities.encounters === true;
  if (!canManage) return null;

  return <RecallWorklistContent />;
}

function RecallWorklistContent() {
  const { current_site } = useClinic();
  const [status, setStatus] = useState<RecallStatus>("due");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<RecallDetailResponse | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [action, setAction] = useState<RecallAction | null>(null);
  const [notice, setNotice] = useState("");
  const query = new URLSearchParams({ status });
  if (current_site?.id) query.set("site_id", String(current_site.id));
  const resource = useResource<RecallListResponse>(
    `/api/clinic/recalls?${query.toString()}`,
  );

  useEffect(() => {
    if (selectedId === null) {
      setDetail(null);
      setDetailError("");
      return;
    }
    const abort = new AbortController();
    setDetailLoading(true);
    setDetailError("");
    void api<RecallDetailResponse>(`/api/clinic/recalls/${selectedId}`, {
      signal: abort.signal,
    })
      .then((result) => {
        if (!abort.signal.aborted) setDetail(result);
      })
      .catch((reason: unknown) => {
        if (!abort.signal.aborted)
          setDetailError(
            reason instanceof Error
              ? reason.message
              : "The recall history could not be loaded.",
          );
      })
      .finally(() => {
        if (!abort.signal.aborted) setDetailLoading(false);
      });
    return () => abort.abort();
  }, [selectedId]);

  return (
    <Stack spacing={3}>
      <Box>
        <Typography component="h1" variant="h1">
          Recall worklist
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 760 }}>
          To create a recall, open a patient encounter and save Follow-up as
          Needed with the clinician-entered plan and due date. Work due dates
          here, document outreach, and keep deferrals and completion evidence
          with the patient record. This queue does not infer screening intervals
          or send messages.
        </Typography>
        <Button href="/clinic/patients" variant="outlined" sx={{ mt: 2 }}>
          Open patient register to record follow-up
        </Button>
      </Box>

      {notice && <Alert severity="success">{notice}</Alert>}
      {resource.data && (
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ flexWrap: "wrap" }}
          aria-label="Recall queue summary"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <Chip
            label={`${resource.data.summary.due} due now`}
            color={resource.data.summary.due > 0 ? "error" : "success"}
            size="small"
          />
          <Chip
            label={`${resource.data.summary.upcoming} upcoming`}
            color="info"
            size="small"
            variant="outlined"
          />
          <Chip
            label={`${resource.data.summary.snoozed} snoozed`}
            color="warning"
            size="small"
            variant="outlined"
          />
          <Chip
            label={
              resource.data.summary.due > 0
                ? "Next action: work due recalls first"
                : "No recalls are due now"
            }
            size="small"
            variant="outlined"
          />
        </Stack>
      )}
      <Paper component="section" variant="outlined">
        <Tabs
          value={status}
          onChange={(_, value: RecallStatus) => setStatus(value)}
          aria-label="Recall status filters"
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            px: { xs: 1, md: 2 },
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          {(Object.keys(statusLabels) as RecallStatus[]).map((value) => (
            <Tab
              key={value}
              value={value}
              label={`${statusLabels[value]}${value === "all" || !resource.data ? "" : ` (${resource.data.summary[value]})`}`}
            />
          ))}
        </Tabs>
        <Stack spacing={0} divider={<Divider flexItem />}>
          {!resource.data && !resource.error && (
            <Box sx={{ p: 3 }}>
              <Typography role="status">Loading recalls…</Typography>
            </Box>
          )}
          {resource.error && (
            <Alert
              severity="error"
              action={
                <Button color="inherit" onClick={resource.refresh}>
                  Retry
                </Button>
              }
              sx={{ borderRadius: 0 }}
            >
              {resource.error}
            </Alert>
          )}
          {resource.data?.recalls.length === 0 && (
            <Box sx={{ p: 3 }}>
              <Typography color="text.secondary">
                No recalls match this view.
              </Typography>
            </Box>
          )}
          {resource.data?.recalls.map((recall) => (
            <Box key={recall.id} sx={{ p: { xs: 2, md: 2.5 } }}>
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={2}
                sx={{
                  justifyContent: "space-between",
                  alignItems: { xs: "stretch", md: "flex-start" },
                }}
              >
                <Stack spacing={0.75} sx={{ minWidth: 0 }}>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center", flexWrap: "wrap" }}
                  >
                    <Typography component="h2" variant="h6">
                      {recall.patient.display_name}
                    </Typography>
                    <Chip
                      size="small"
                      color={statusColor(recall.status)}
                      label={statusLabels[recall.status]}
                    />
                    <Chip
                      size="small"
                      variant="outlined"
                      label={
                        recall.clinical_state === "arranged"
                          ? "Arranged"
                          : recall.clinical_state === "completed"
                            ? "Complete"
                            : "Needed"
                      }
                    />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {patientReferenceLabel(recall.patient.reference) ||
                      recall.patient.reference}
                    {" · "}Encounter{" "}
                    {formatDateTime(recall.encounter.started_at)}
                  </Typography>
                  <Typography sx={{ whiteSpace: "pre-wrap" }}>
                    {recall.plan}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Effective due: {formatDateTime(recall.effective_due_at)}
                    {recall.status === "snoozed" &&
                      " · based on the recorded snooze"}
                    {` · ${recall.outreach_count} outreach attempt${recall.outreach_count === 1 ? "" : "s"}`}
                  </Typography>
                  {recall.assignee_label && (
                    <Typography variant="body2" color="text.secondary">
                      Assigned to {recall.assignee_label}
                    </Typography>
                  )}
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  <Button href={recall.encounter.href} variant="outlined">
                    Open encounter
                  </Button>
                  <Button
                    startIcon={<HistoryOutlinedIcon />}
                    variant="contained"
                    onClick={() => setSelectedId(recall.id)}
                  >
                    Review history
                  </Button>
                </Stack>
              </Stack>
            </Box>
          ))}
        </Stack>
      </Paper>
      {resource.data?.truncated && (
        <Alert severity="info">
          This view shows the first 200 recalls. Narrow the status or location
          before continuing.
        </Alert>
      )}

      <Dialog
        open={selectedId !== null}
        onClose={() => !action && setSelectedId(null)}
        fullWidth
        maxWidth="md"
        aria-labelledby="recall-history-title"
      >
        <DialogTitle id="recall-history-title">
          {detail
            ? `${detail.recall.patient.display_name} recall`
            : "Recall history"}
        </DialogTitle>
        <DialogContent dividers>
          {detailLoading && (
            <CircularProgress aria-label="Loading recall history" />
          )}
          {detailError && <Alert severity="error">{detailError}</Alert>}
          {detail && (
            <Stack spacing={3}>
              <Box>
                <Typography variant="overline" color="text.secondary">
                  Clinician follow-up plan
                </Typography>
                <Typography sx={{ whiteSpace: "pre-wrap" }}>
                  {detail.recall.plan}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.75 }}
                >
                  Source due: {formatDateTime(detail.recall.source_due_at)} ·
                  Effective due:{" "}
                  {formatDateTime(detail.recall.effective_due_at)}
                </Typography>
              </Box>

              {resource.data?.capabilities.write && (
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ flexWrap: "wrap" }}
                  useFlexGap
                >
                  {["completed", "excluded", "snoozed"].includes(
                    detail.recall.status,
                  ) ? (
                    <Button
                      variant="outlined"
                      onClick={() => setAction("reopen")}
                    >
                      Reopen
                    </Button>
                  ) : (
                    <>
                      <Button
                        startIcon={<PhoneInTalkOutlinedIcon />}
                        variant="contained"
                        onClick={() => setAction("record_outreach")}
                      >
                        Record outreach
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={() => setAction("snooze")}
                      >
                        Snooze
                      </Button>
                      <Button
                        variant="outlined"
                        color="warning"
                        onClick={() => setAction("exclude")}
                      >
                        Exclude
                      </Button>
                      <Button
                        startIcon={<TaskAltOutlinedIcon />}
                        variant="outlined"
                        color="success"
                        onClick={() => setAction("complete")}
                      >
                        Complete
                      </Button>
                    </>
                  )}
                </Stack>
              )}

              <Box>
                <Typography component="h3" variant="h6" sx={{ mb: 1.5 }}>
                  History
                </Typography>
                {detail.history.length === 0 ? (
                  <Typography color="text.secondary">
                    No recall activity has been recorded.
                  </Typography>
                ) : (
                  <Stack spacing={2} divider={<Divider flexItem />}>
                    {detail.history.map((event) => (
                      <Box key={event.id}>
                        <Stack
                          direction="row"
                          spacing={1}
                          sx={{ alignItems: "center", flexWrap: "wrap" }}
                        >
                          <Typography sx={{ fontWeight: 700 }}>
                            {eventLabels[event.event_type]}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {formatDateTime(event.occurred_at)} ·{" "}
                            {event.actor.display_name}
                          </Typography>
                        </Stack>
                        {event.channel && (
                          <Typography variant="body2">
                            Channel: {event.channel.replaceAll("_", " ")}
                          </Typography>
                        )}
                        {event.reason && (
                          <Typography sx={{ whiteSpace: "pre-wrap" }}>
                            {event.reason}
                          </Typography>
                        )}
                        {event.completion_evidence && (
                          <Typography sx={{ whiteSpace: "pre-wrap" }}>
                            {event.completion_evidence}
                          </Typography>
                        )}
                        {event.snoozed_until && (
                          <Typography variant="body2">
                            Snoozed until {formatDateTime(event.snoozed_until)}
                          </Typography>
                        )}
                      </Box>
                    ))}
                  </Stack>
                )}
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedId(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      {detail && action && (
        <RecallActionDialog
          action={action}
          recall={detail.recall}
          onClose={() => setAction(null)}
          onSaved={(message, result) => {
            setNotice(message);
            setDetail(result);
            setAction(null);
            resource.refresh();
          }}
        />
      )}
    </Stack>
  );
}

function RecallActionDialog({
  action,
  recall,
  onClose,
  onSaved,
}: {
  action: RecallAction;
  recall: RecallItem;
  onClose: () => void;
  onSaved: (message: string, result: RecallDetailResponse) => void;
}) {
  const [channel, setChannel] = useState("phone");
  const [reason, setReason] = useState("");
  const [completionEvidence, setCompletionEvidence] = useState("");
  const [snoozedUntil, setSnoozedUntil] = useState(
    localDateTime(recall.effective_due_at),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [outcomeUnconfirmed, setOutcomeUnconfirmed] = useState(false);
  const requestKey = useRef(crypto.randomUUID());

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<RecallDetailResponse>(
        `/api/clinic/recalls/${recall.id}/events`,
        {
          method: "POST",
          body: {
            recall_event: {
              action,
              request_key: requestKey.current,
              expected_version: recall.version,
              channel: action === "record_outreach" ? channel : undefined,
              reason: [
                "record_outreach",
                "snooze",
                "exclude",
                "reopen",
              ].includes(action)
                ? reason.trim() || undefined
                : undefined,
              snoozed_until:
                action === "snooze" && snoozedUntil
                  ? new Date(snoozedUntil).toISOString()
                  : undefined,
              completion_evidence:
                action === "complete" ? completionEvidence.trim() : undefined,
            },
          },
        },
      );
      onSaved(
        action === "record_outreach"
          ? "The outreach attempt was recorded. No message was sent."
          : `The recall was ${action === "complete" ? "completed with evidence" : action === "exclude" ? "excluded" : action === "snooze" ? "snoozed" : "reopened"}.`,
        result,
      );
    } catch (reasonValue) {
      const unknown =
        reasonValue instanceof ApiError &&
        (reasonValue.code === "outcome_unconfirmed" ||
          reasonValue.status === 408 ||
          reasonValue.status >= 500);
      setOutcomeUnconfirmed(unknown);
      setError(
        unknown
          ? "The outcome is not confirmed. Retry this exact action before changing any details."
          : reasonValue instanceof Error
            ? reasonValue.message
            : "The recall action could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };

  const requiresReason =
    action === "snooze" || action === "exclude" || action === "reopen";
  const disabled =
    busy ||
    (requiresReason && !reason.trim()) ||
    (action === "complete" && !completionEvidence.trim()) ||
    (action === "snooze" && !snoozedUntil);

  return (
    <Dialog
      open
      onClose={() => !busy && !outcomeUnconfirmed && onClose()}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>{actionLabels[action]}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography color="text.secondary">
            {action === "record_outreach"
              ? "Record an attempt that already occurred. This action does not send a message."
              : action === "complete"
                ? "Completion also closes the authoritative encounter follow-up and requires outcome evidence."
                : action === "reopen"
                  ? recall.status === "completed"
                    ? "Reopening returns the authoritative encounter follow-up to needed."
                    : "Reopening returns this deferred recall to the active queue without changing its clinician-recorded follow-up state."
                  : "This changes the recall queue projection and preserves the clinician follow-up plan."}
          </Typography>
          {action === "record_outreach" && (
            <TextField
              select
              required
              label="Outreach channel"
              value={channel}
              disabled={outcomeUnconfirmed}
              onChange={(event) => setChannel(event.target.value)}
            >
              {[
                ["phone", "Phone"],
                ["sms", "Text message"],
                ["email", "Email"],
                ["portal", "Patient portal"],
                ["mail", "Mail"],
                ["in_person", "In person"],
                ["other", "Other"],
              ].map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
          )}
          {(requiresReason || action === "record_outreach") && (
            <TextField
              required={requiresReason}
              multiline
              minRows={3}
              label={
                action === "record_outreach"
                  ? "Attempt result or note (optional)"
                  : "Reason"
              }
              value={reason}
              disabled={outcomeUnconfirmed}
              onChange={(event) => setReason(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 1_000 } }}
            />
          )}
          {action === "snooze" && (
            <TextField
              required
              type="datetime-local"
              label="Snooze until"
              value={snoozedUntil}
              disabled={outcomeUnconfirmed}
              onChange={(event) => setSnoozedUntil(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          )}
          {action === "complete" && (
            <TextField
              required
              multiline
              minRows={4}
              label="Completion outcome"
              value={completionEvidence}
              disabled={outcomeUnconfirmed}
              onChange={(event) => setCompletionEvidence(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 4_000 } }}
            />
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={busy || outcomeUnconfirmed} onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={disabled}
          variant="contained"
          onClick={() => void submit()}
        >
          {busy
            ? "Saving…"
            : outcomeUnconfirmed
              ? "Retry same action"
              : actionLabels[action]}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
