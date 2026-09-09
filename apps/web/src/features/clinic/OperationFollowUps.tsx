import AssignmentLateOutlinedIcon from "@mui/icons-material/AssignmentLateOutlined";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
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
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../api/client";
import { useResource } from "../../shared/ui";
import type { EncounterFollowUpRecord } from "./EncounterFollowUp";
import { patientReferenceLabel } from "./patientReference";
import { useWorkingDraft } from "./useWorkingDraft";
import { useClinic } from "./Workspace";

type FollowUpFilter = "all" | "mine" | "overdue" | "unassigned";
type FollowUpRequest = {
  id: number;
  conversation_id: number;
  subject: string;
  requested_action?: string | null;
  state: string;
  due_at: string | null;
  assignee_label?: string | null;
  assigned_to_me: boolean;
  overdue: boolean;
};
type FollowUpResponse = {
  summary: { open: number; overdue: number; mine: number; unassigned: number };
  requests: FollowUpRequest[];
  encounter_summary: { open: number; overdue: number; mine: number; unassigned: number };
  encounter_follow_ups: EncounterFollowUpWorkItem[];
  reminder_attention_count: number | null;
};
type EncounterFollowUpWorkItem = EncounterFollowUpRecord & {
  patient_display_name: string;
  patient_reference: string;
  assigned_to_me: boolean;
  assignee_label: string | null;
  overdue: boolean;
};

const filters: {
  value: FollowUpFilter;
  label: string;
  summaryKey: keyof FollowUpResponse["summary"];
}[] = [
  { value: "all", label: "Open", summaryKey: "open" },
  { value: "mine", label: "Mine", summaryKey: "mine" },
  { value: "overdue", label: "Overdue", summaryKey: "overdue" },
  { value: "unassigned", label: "Unassigned", summaryKey: "unassigned" },
];

function dateLabel(value: string | null) {
  if (!value) return "No due date";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function EncounterFollowUpItem({
  followUp,
  onChanged,
}: {
  followUp: EncounterFollowUpWorkItem;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestKeyRef = useRef<string | null>(null);
  const recovery = useWorkingDraft<{
    action: "complete";
    followUpId: number;
    requestKey: string;
    expectedVersion: number;
    outcome: string;
  }>({
    kind: "follow_up",
    patientId: followUp.patient_id,
    encounterId: followUp.encounter_id,
  });

  useEffect(() => {
    const restored = recovery.restored;
    if (!recovery.ready || !restored || restored.followUpId !== followUp.id) return;
    requestKeyRef.current = restored.requestKey;
    setOutcome(restored.outcome);
    setError(
      "A saved completion attempt was restored. Refresh this worklist before retrying the same completion.",
    );
    setOpen(true);
  }, [followUp.id, recovery.ready, recovery.restored]);

  const complete = async () => {
    if (busy || !outcome.trim()) {
      if (!outcome.trim()) setError("Record the follow-up outcome.");
      return;
    }
    const requestKey = requestKeyRef.current ?? crypto.randomUUID();
    const attempt = {
      action: "complete" as const,
      followUpId: followUp.id,
      requestKey,
      expectedVersion: followUp.version,
      outcome: outcome.trim(),
    };
    if (!(await recovery.save(attempt))) {
      setError(recovery.error || "The completion attempt could not be saved for recovery.");
      return;
    }
    requestKeyRef.current = requestKey;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ follow_up: EncounterFollowUpRecord }>(
        `/api/clinic/operations/encounter_follow_ups/${followUp.id}`,
        {
          method: "PATCH",
          body: {
            follow_up: {
              action: "complete",
              request_key: requestKey,
              expected_version: followUp.version,
              outcome: attempt.outcome,
            },
          },
        },
      );
      if (
        result.follow_up.id !== followUp.id ||
        result.follow_up.encounter_id !== followUp.encounter_id ||
        result.follow_up.status !== "completed"
      ) throw new Error("The completed follow-up did not match this work item.");
      requestKeyRef.current = null;
      if (!(await recovery.clear())) {
        setError(
          recovery.error ||
            "The follow-up completed, but its recovery record could not be cleared. Refresh before another action.",
        );
        return;
      }
      setOpen(false);
      setOutcome("");
      onChanged();
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : reason instanceof Error
            ? reason.message
            : "The completion outcome could not be confirmed.",
      );
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ py: 2, display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) auto" }, gap: 2, alignItems: "center" }}>
      <Box sx={{ minWidth: 0 }}>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{followUp.patient_display_name}</Typography>
          <Chip size="small" color={followUp.status === "needed" ? "warning" : "info"} label={followUp.status.replaceAll("_", " ")} />
          {followUp.overdue && <Chip size="small" color="warning" label="Overdue" />}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {patientReferenceLabel(followUp.patient_reference)} · Encounter #{followUp.encounter_id} · {followUp.source_kind.replaceAll("_", " ")}
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.75 }}>{followUp.plan}</Typography>
        <Typography variant="body2" color={followUp.overdue ? "warning.main" : "text.secondary"} sx={{ mt: 0.5 }}>
          Due: {dateLabel(followUp.due_at)} · {followUp.assigned_to_me ? "Assigned to you" : followUp.assignee_label ? `Assigned to ${followUp.assignee_label}` : "Unassigned"}
        </Typography>
      </Box>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifySelf: { xs: "start", md: "end" } }}>
        <Button variant="outlined" href={`/clinic/patients/${followUp.patient_id}/encounters/${followUp.encounter_id}`}>Open encounter</Button>
        <Button variant="contained" onClick={() => setOpen(true)}>Complete</Button>
      </Stack>
      <Dialog open={open} onClose={() => !busy && !requestKeyRef.current && setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Complete encounter follow-up</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5}>
            <Typography>{followUp.patient_display_name} · Encounter #{followUp.encounter_id}</Typography>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="Outcome" multiline minRows={4} value={outcome} disabled={busy}
              onChange={(event) => setOutcome(event.target.value)} slotProps={{ htmlInput: { maxLength: 4000 } }} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy || requestKeyRef.current !== null} onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={busy} onClick={() => void complete()}>
            {busy ? "Completing…" : requestKeyRef.current ? "Retry same completion" : "Complete follow-up"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export function OperationFollowUps() {
  const { capabilities } = useClinic();
  if (
    capabilities.staff_messaging_read !== true &&
    !(capabilities.patients === true && capabilities.encounters === true)
  ) return null;
  return <FollowUpWorklist />;
}

function FollowUpWorklist() {
  const { current_site } = useClinic();
  const [filter, setFilter] = useState<FollowUpFilter>("all");
  const params = new URLSearchParams({ filter });
  if (current_site?.id) params.set("site_id", String(current_site.id));
  const resource = useResource<FollowUpResponse>(
    `/api/clinic/operations/follow_ups?${params.toString()}`,
  );
  const response = resource.data;
  const summaryKey = filter === "all" ? "open" : filter;
  const filteredCount = response
    ? response.summary[summaryKey] + response.encounter_summary[summaryKey]
    : undefined;

  return (
    <Stack spacing={2.5} sx={{ mb: 3.5 }}>
      <Box>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Typography component="h2" variant="h5" sx={{ fontWeight: 700 }}>
            Follow-up worklist
          </Typography>
          <Button onClick={resource.refresh}>Refresh</Button>
        </Stack>
        <Typography color="text.secondary" sx={{ mt: 0.5, maxWidth: "70ch" }}>
          Resolve encounter follow-up plans and open staff requests from one
          operational queue.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {current_site ? current_site.name || current_site.code : "All accessible locations"} · Your active conversations
        </Typography>
      </Box>
      {response?.reminder_attention_count !== null &&
        response?.reminder_attention_count !== undefined && (
          <Alert
            severity={response.reminder_attention_count > 0 ? "warning" : "info"}
            icon={<NotificationsNoneOutlinedIcon />}
            action={
              <Button color="inherit" size="small" href="/clinic/reminders?view=attention">
                Review reminders
              </Button>
            }
          >
            {response.reminder_attention_count > 0
              ? `${response.reminder_attention_count} reminder${response.reminder_attention_count === 1 ? " needs" : "s need"} attention.`
              : "No reminders need attention."}
          </Alert>
        )}
      <Paper
        elevation={0}
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <Tabs
          value={filter}
          onChange={(_, value: FollowUpFilter) => setFilter(value)}
          aria-label="Follow-up request filters"
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            px: { xs: 1, md: 2 },
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          {filters.map((item) => (
            <Tab
              key={item.value}
              value={item.value}
              label={`${item.label}${response ? ` (${response.summary[item.summaryKey] + response.encounter_summary[item.summaryKey]})` : ""}`}
            />
          ))}
        </Tabs>
        <Box sx={{ p: { xs: 2, md: 2.5 } }}>
          {!response && !resource.error && (
            <Stack direction="row" spacing={1.5} sx={{ py: 4, alignItems: "center" }} role="status">
              <CircularProgress size={20} />
              <Typography>Loading follow-up requests…</Typography>
            </Stack>
          )}
          {resource.error && (
            <Alert
              severity="error"
              action={<Button color="inherit" size="small" onClick={resource.refresh}>Retry</Button>}
            >
              The follow-up worklist could not be loaded. {resource.error}
            </Alert>
          )}
          {response && response.requests.length === 0 && response.encounter_follow_ups.length === 0 && (
            <Box sx={{ py: 5, textAlign: "center" }}>
              <AssignmentLateOutlinedIcon sx={{ color: "text.disabled", fontSize: 40, mb: 1 }} />
              <Typography variant="h6">
                No {filter === "all" ? "open" : filters.find((item) => item.value === filter)?.label.toLowerCase()} follow-ups
              </Typography>
              <Typography color="text.secondary">
                New encounter plans and conversation requests you can access will appear here.
              </Typography>
            </Box>
          )}
          {response && (response.requests.length > 0 || response.encounter_follow_ups.length > 0) && (
            <Stack divider={<Divider flexItem />}>
              <Typography variant="body2" color="text.secondary">
                Showing {response.requests.length + response.encounter_follow_ups.length} of {filteredCount} follow-ups.
              </Typography>
              {response.encounter_follow_ups.map((followUp) => (
                <EncounterFollowUpItem key={followUp.id} followUp={followUp} onChanged={resource.refresh} />
              ))}
              {response.requests.map((request) => (
                <Box
                  key={request.id}
                  sx={{
                    py: 2,
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) auto" },
                    gap: 2,
                    alignItems: "center",
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        {request.requested_action || request.subject}
                      </Typography>
                      <Chip size="small" variant="outlined" label={request.state.replaceAll("_", " ")} />
                      {request.overdue && <Chip size="small" color="warning" label="Overdue" />}
                    </Stack>
                    {request.requested_action && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {request.subject}
                      </Typography>
                    )}
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 0.25, sm: 2 }} sx={{ mt: 0.75 }}>
                      <Typography variant="body2" color={request.overdue ? "warning.main" : "text.secondary"}>
                        Due: {dateLabel(request.due_at)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {request.assigned_to_me ? "Assigned to you" : request.assignee_label ? `Assigned to ${request.assignee_label}` : "Unassigned"}
                      </Typography>
                    </Stack>
                  </Box>
                  <Button
                    variant="outlined"
                    href={`/clinic/messages?conversation_id=${request.conversation_id}`}
                    startIcon={<ForumOutlinedIcon />}
                    sx={{ justifySelf: { xs: "start", md: "end" } }}
                  >
                    Open conversation
                  </Button>
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </Paper>
    </Stack>
  );
}
