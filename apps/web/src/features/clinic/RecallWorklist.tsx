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
import type { Patient } from "../../api/contracts";
import { businessTimeAfter } from "../../shared/businessDate";
import { LoadState, useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";
import { patientReferenceLabel } from "./patientReference";
import { useClinicNavigation } from "./clinicNavigation";

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

export function PatientCareGaps({ patientId }: { patientId: number }) {
  const { capabilities } = useClinic();
  const canRead =
    capabilities.patients === true && capabilities.encounters === true;
  const resource = useResource<RecallListResponse>(
    `/api/clinic/recalls?status=all&patient_id=${patientId}`,
    { enabled: canRead },
  );
  const data = resource.data;
  const openCount = data
    ? data.summary.due + data.summary.upcoming + data.summary.snoozed
    : null;
  const open =
    data?.recalls.filter((recall) =>
      ["due", "upcoming", "snoozed"].includes(recall.status),
    ) ?? [];
  const href = `/clinic/recalls?patient_id=${patientId}&status=all`;
  return (
    <Paper component="section" variant="outlined" sx={{ p: 1.5 }}>
      <Stack spacing={1}>
        <Typography component="h3" variant="h6">
          Care gaps
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Recorded encounter follow-ups and recall worklist status.
        </Typography>
        {!canRead ? (
          <Typography>
            Recall records are not available for your account.
          </Typography>
        ) : resource.error || !data ? (
          <LoadState error={resource.error} onRetry={resource.refresh} />
        ) : (
          <>
            {openCount === 0 ? (
              <Typography>
                No open care gaps in the recorded recall worklist.
              </Typography>
            ) : (
              <Typography>
                {data.summary.due} due now · {data.summary.upcoming} upcoming ·{" "}
                {data.summary.snoozed} snoozed
              </Typography>
            )}
            {open.map((recall) => (
              <Box key={recall.id}>
                <Typography sx={{ whiteSpace: "pre-wrap" }}>
                  {recall.plan}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {statusLabels[recall.status]} · Worklist due:{" "}
                  {formatDateTime(recall.effective_due_at)}
                </Typography>
                <Button size="small" href={recall.encounter.href}>
                  Review encounter follow-up
                </Button>
              </Box>
            ))}
            {data.summary.excluded > 0 && (
              <Typography variant="body2">
                {data.summary.excluded} excluded from the active worklist;
                follow-up remains in the encounter.
              </Typography>
            )}
            {data.truncated && (
              <Alert severity="info">
                Only the first 200 recall records are shown. The counts include
                all authorized records.
              </Alert>
            )}
            <Button size="small" href={href}>
              Review patient recalls
            </Button>
            <Button size="small" onClick={resource.refresh}>
              Refresh care gaps
            </Button>
          </>
        )}
      </Stack>
    </Paper>
  );
}

function RecallWorklistContent() {
  const { current_site } = useClinic();
  const search = new URLSearchParams(window.location.search);
  const patientId = search.get("patient_id");
  const selectedPatientId =
    patientId && /^[1-9]\d*$/.test(patientId) ? patientId : null;
  const [status, setStatus] = useState<RecallStatus>(() =>
    selectedPatientId && search.get("status") === "all" ? "all" : "due",
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<RecallDetailResponse | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [action, setAction] = useState<RecallAction | null>(null);
  const [outreachId, setOutreachId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const query = new URLSearchParams({ status });
  if (current_site?.id) query.set("site_id", String(current_site.id));
  if (selectedPatientId) query.set("patient_id", selectedPatientId);
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
          Needed with the clinician-entered plan and due date. Review due work
          here, record outreach that already happened, or update the worklist
          status. The queue does not infer screening intervals or send messages.
        </Typography>
        <Button href="/clinic/patients" variant="outlined" sx={{ mt: 2 }}>
          Open patient register to record follow-up
        </Button>
      </Box>

      {notice && <Alert severity="success">{notice}</Alert>}
      {selectedPatientId && (
        <Alert
          severity="info"
          action={<Button href="/clinic/recalls">Show all patients</Button>}
        >
          Showing recalls for the selected patient.
        </Alert>
      )}
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
              disabled={outreachId !== null}
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
                    Worklist due: {formatDateTime(recall.effective_due_at)}
                    {recall.status === "snoozed" &&
                      " · set by the recorded snooze"}
                    {` · ${recall.outreach_count} outreach attempt${recall.outreach_count === 1 ? "" : "s"}`}
                  </Typography>
                  {recall.assignee_label && (
                    <Typography variant="body2" color="text.secondary">
                      Assigned to {recall.assignee_label}
                    </Typography>
                  )}
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  <Button href={recall.encounter.href} variant="contained">
                    Review encounter follow-up
                  </Button>
                  {resource.data?.capabilities.write &&
                    !["completed", "excluded", "snoozed"].includes(
                      recall.status,
                    ) && (
                      <Button
                        startIcon={<PhoneInTalkOutlinedIcon />}
                        variant="outlined"
                        disabled={outreachId !== null}
                        onClick={() => {
                          setNotice("");
                          setOutreachId(recall.id);
                        }}
                      >
                        Log outreach attempt
                      </Button>
                    )}
                  <Button
                    startIcon={<HistoryOutlinedIcon />}
                    variant="text"
                    disabled={outreachId !== null}
                    onClick={() => setSelectedId(recall.id)}
                  >
                    Review history
                  </Button>
                </Stack>
              </Stack>
              {outreachId === recall.id && (
                <InlineRecallOutreach
                  recallId={recall.id}
                  onClose={() => setOutreachId(null)}
                  onSaved={(message) => {
                    setNotice(message);
                    setOutreachId(null);
                    resource.refresh();
                  }}
                />
              )}
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
                  Clinician follow-up due:{" "}
                  {formatDateTime(detail.recall.source_due_at)} · Worklist due:{" "}
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

function InlineRecallOutreach({
  recallId,
  onClose,
  onSaved,
}: {
  recallId: number;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const resource = useResource<RecallDetailResponse>(
    `/api/clinic/recalls/${recallId}`,
  );
  if (!resource.data || resource.data.recall.id !== recallId) {
    return (
      <Stack spacing={1} sx={{ mt: 2 }}>
        {resource.error ? (
          <Alert
            severity="error"
            action={<Button onClick={resource.refresh}>Retry</Button>}
          >
            {resource.error}
          </Alert>
        ) : (
          <Typography role="status">Loading current recall.</Typography>
        )}
        <Button onClick={onClose}>Cancel</Button>
      </Stack>
    );
  }
  if (
    ["completed", "excluded", "snoozed"].includes(resource.data.recall.status)
  ) {
    return (
      <Alert
        severity="info"
        sx={{ mt: 2 }}
        action={<Button onClick={onClose}>Close</Button>}
      >
        This recall has changed. Review its current history before logging
        outreach.
      </Alert>
    );
  }
  return (
    <RecallActionDialog
      inline
      action="record_outreach"
      recall={resource.data.recall}
      onClose={onClose}
      onSaved={(message) => onSaved(message)}
    />
  );
}

function RecallContactPreference({ patientId }: { patientId: number }) {
  const resource = useResource<{ patient: Patient }>(
    `/api/clinic/patients/${patientId}`,
  );
  if (resource.error)
    return (
      <Alert
        severity="warning"
        action={<Button onClick={resource.refresh}>Retry</Button>}
      >
        Contact preferences unavailable. Review the patient record before any
        new contact.
      </Alert>
    );
  if (!resource.data)
    return <Typography role="status">Loading contact preferences.</Typography>;
  if (resource.data.patient.id !== patientId)
    return (
      <Alert severity="warning">
        Contact preferences could not be confirmed.
      </Alert>
    );
  const preference = resource.data.patient.communication_preference;
  return (
    <Box>
      <Typography variant="body2">
        Recorded preferred channel:{" "}
        {preference?.preferred_contact_method || "Not recorded"}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        General communication consent:{" "}
        {preference
          ? preference.general_communications_consent
            ? "Consented"
            : "Not consented"
          : "Not recorded"}
        . Reminder consent:{" "}
        {preference
          ? preference.appointment_reminders_consent
            ? "Consented"
            : "Not consented"
          : "Not recorded"}
        .
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Confirm permission and the appropriate contact details in the patient
        record before new outreach.
      </Typography>
      <Button href={`/clinic/patients/${patientId}`} size="small">
        Review patient contact details and permissions
      </Button>
    </Box>
  );
}

function RecallActionDialog({
  action,
  recall,
  onClose,
  onSaved,
  inline = false,
}: {
  action: RecallAction;
  recall: RecallItem;
  onClose: () => void;
  onSaved: (message: string, result: RecallDetailResponse) => void;
  inline?: boolean;
}) {
  const [channel, setChannel] = useState("");
  const [reason, setReason] = useState("");
  const [completionEvidence, setCompletionEvidence] = useState("");
  const [snoozedUntil, setSnoozedUntil] = useState(
    localDateTime(recall.effective_due_at),
  );
  const initialSnoozedUntil = useRef(snoozedUntil);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [outcomeUnconfirmed, setOutcomeUnconfirmed] = useState(false);
  const requestKey = useRef(crypto.randomUUID());
  const { registerBlocker } = useClinicNavigation();
  const dirty =
    Boolean(channel || reason || completionEvidence) ||
    (action === "snooze" && snoozedUntil !== initialSnoozedUntil.current);
  useEffect(() => {
    if (!dirty && !busy && !outcomeUnconfirmed) return;
    const warning =
      busy || outcomeUnconfirmed
        ? "The recall action may be unresolved. Reconcile the same action before leaving."
        : "Leave and discard this unsaved recall action?";
    const unregister = registerBlocker(() => warning);
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = warning;
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", unload);
    };
  }, [dirty, busy, outcomeUnconfirmed, registerBlocker]);
  const close = () => {
    if (
      !busy &&
      !outcomeUnconfirmed &&
      (!dirty || window.confirm("Discard this unsaved recall action?"))
    )
      onClose();
  };

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
      if (
        result.recall.id !== recall.id ||
        result.recall.patient.id !== recall.patient.id ||
        result.recall.encounter.id !== recall.encounter.id ||
        !Number.isInteger(result.recall.version) ||
        result.recall.version <= recall.version
      ) {
        throw new ApiError(
          502,
          "The saved recall could not be confirmed.",
          "outcome_unconfirmed",
        );
      }
      onSaved(
        action === "record_outreach"
          ? "The outreach attempt was recorded. No message was sent."
          : `The recall was ${action === "complete" ? "completed with evidence" : action === "exclude" ? "excluded" : action === "snooze" ? "snoozed" : "reopened"}.`,
        result,
      );
    } catch (reasonValue) {
      const unknown =
        !(reasonValue instanceof ApiError) ||
        reasonValue.code === "outcome_unconfirmed" ||
        reasonValue.status === 408 ||
        reasonValue.status >= 500;
      setOutcomeUnconfirmed((current) => current || unknown);
      setError(
        unknown || outcomeUnconfirmed
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
    (action === "record_outreach" && !channel) ||
    (requiresReason && !reason.trim()) ||
    (action === "complete" && !completionEvidence.trim()) ||
    (action === "snooze" && !snoozedUntil);

  const content = (
    <>
      <DialogTitle>{actionLabels[action]}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Box>
            <Typography sx={{ fontWeight: 700 }}>
              {recall.patient.display_name} ·{" "}
              {patientReferenceLabel(recall.patient.reference) ||
                recall.patient.reference}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Source:{" "}
              {recall.source_kind === "telehealth" ? "Telehealth" : "In-person"}{" "}
              encounter {formatDateTime(recall.encounter.started_at)}
            </Typography>
            <Typography sx={{ whiteSpace: "pre-wrap" }}>
              {recall.plan}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Source due: {formatDateTime(recall.source_due_at)} · Effective
              due: {formatDateTime(recall.effective_due_at)}
            </Typography>
          </Box>
          {action === "record_outreach" && (
            <RecallContactPreference patientId={recall.patient.id} />
          )}
          <Typography color="text.secondary">
            {action === "record_outreach"
              ? "Record an attempt that already occurred. This action does not send a message."
              : action === "complete"
                ? "Completion also closes the authoritative encounter follow-up and requires outcome evidence."
                : action === "reopen"
                  ? recall.status === "completed"
                    ? "Reopening returns the authoritative encounter follow-up to needed."
                    : "Reopening returns this deferred recall to the active queue without changing its clinician-recorded follow-up state."
                  : action === "snooze"
                    ? "Snoozing moves this item out of the due queue until the chosen date and time. " +
                      "The clinician-entered plan and due date stay unchanged."
                    : action === "exclude"
                      ? "Excluding removes this item from the active worklist. " +
                        "The clinician follow-up stays in the encounter and can be reopened."
                      : "This changes the recall queue projection and preserves the clinician follow-up plan."}
          </Typography>
          {action === "record_outreach" && (
            <TextField
              select
              required
              label="Outreach channel"
              value={channel}
              disabled={busy || outcomeUnconfirmed}
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
              disabled={busy || outcomeUnconfirmed}
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
              disabled={busy || outcomeUnconfirmed}
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
              disabled={busy || outcomeUnconfirmed}
              onChange={(event) => setCompletionEvidence(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 4_000 } }}
            />
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={busy || outcomeUnconfirmed} onClick={close}>
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
    </>
  );
  return inline ? (
    <Paper
      component="section"
      variant="outlined"
      aria-label="Log outreach attempt"
      sx={{ mt: 2 }}
    >
      {content}
    </Paper>
  ) : (
    <Dialog open onClose={close} fullWidth maxWidth="sm">
      {content}
    </Dialog>
  );
}
