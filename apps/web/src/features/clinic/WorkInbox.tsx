import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import PaymentOutlinedIcon from "@mui/icons-material/PaymentOutlined";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api } from "../../api/client";
import type { ClinicalTask } from "../../api/contracts";
import type { EncounterFollowUpRecord } from "./EncounterFollowUp";
import { patientReferenceLabel } from "./patientReference";
import type { LabFollowUp } from "./PatientLabReports";
import { useClinic } from "./Workspace";

type AssignmentFilter = "all" | "mine" | "overdue";
type WorkType =
  | "all"
  | "intake"
  | "orders"
  | "results"
  | "documentation"
  | "billing"
  | "patient"
  | "staff";

type Summary = {
  open: number;
  overdue: number;
  mine: number;
  unassigned: number;
};

type StaffRequest = {
  id: number;
  conversation_id: number;
  subject: string;
  requested_action?: string | null;
  state: string;
  due_at: string | null;
  assignee_label?: string | null;
  assigned_to_me: boolean;
  overdue: boolean;
  assignee_membership_id: number | null;
  eligible_assignees: Array<{ membership_id: number; label: string }>;
  updated_at: string;
};

type EncounterFollowUpItem = EncounterFollowUpRecord & {
  patient_display_name: string;
  patient_reference: string;
  assigned_to_me: boolean;
  assignee_label: string | null;
  overdue: boolean;
  eligible_assignees: Array<{ membership_id: number; label: string }>;
};

type ClinicalTaskItem = ClinicalTask & {
  patient_display_name: string;
  patient_reference: string;
  assigned_to_me: boolean;
  assignee_label: string | null;
  overdue: boolean;
  encounter_href: string | null;
  eligible_assignees: Array<{ membership_id: number; label: string }>;
};

type FollowUpResponse = {
  summary: Summary;
  requests: StaffRequest[];
  encounter_summary: Summary;
  encounter_follow_ups: EncounterFollowUpItem[];
  clinical_task_summary: Summary;
  clinical_tasks: ClinicalTaskItem[];
  reminder_attention_count: number | null;
  actor_membership_id: number;
  can_manage_staff_requests: boolean;
  can_escalate_staff_requests: boolean;
};

type LabReviewItem = {
  patient: { id: number; display_name: string; reference: string | null };
  report_id: number;
  current_version: {
    id: number;
    title: string;
    status: string;
    result_priority: "routine" | "urgent" | "critical";
    issued_at: string | null;
    result_count: number;
  };
};

type LabReviewResponse = {
  items: LabReviewItem[];
  pagination: { page: number; per_page: number; total: number };
  can_review: boolean;
};

type LabFollowUpItem = {
  patient: { id: number; display_name: string; reference: string | null };
  report_id: number;
  version: {
    id: number;
    title: string;
    issued_at: string | null;
    result_priority: "routine" | "urgent" | "critical";
  };
  follow_up: LabFollowUp;
};

type LabFollowUpResponse = {
  items: LabFollowUpItem[];
  pagination: { page: number; per_page: number; total: number };
  can_complete: boolean;
};

type RefillRequest = {
  id: number;
  status: "pending" | "in_review" | "resolved" | "declined";
  requested_at: string;
  medication_name: string;
  pharmacy_destination: string;
  request_note: string | null;
  source: "patient" | "staff";
  patient: { id: number; display_name: string; reference: string };
};

type RefillResponse = { refill_requests: RefillRequest[] };

type WorkExceptionSource = {
  available: boolean;
  limit: number;
  returned_count: number;
  truncated: boolean;
  error: { code: string; message: string } | null;
};

type WorkExceptionsResponse = {
  schema_version: string;
  sources: {
    unsigned_notes: WorkExceptionSource;
    payment_exceptions: WorkExceptionSource;
  };
  unsigned_items: Array<{
    key: string;
    patient: { id: number; display_name: string; reference: string | null };
    site_id: number;
    clinical_encounter_id: number;
    note_id: number;
    note_revision_id: number;
    updated_at: string;
    status: string;
    priority: "routine" | "urgent" | "critical";
    next_action: string;
    owner: null;
    due_at: string | null;
    version: number;
    source: { type: string; id: number; href: string };
    actions: { managed_in_source: boolean; reason: string };
  }>;
  payment_exceptions: Array<{
    id: number;
    invoice_id: number;
    patient: {
      id: number;
      display_name: string;
      reference: string | null;
    } | null;
    site_id: number;
    encounter_id: number;
    status: "failed" | "needs_reconciliation";
    amount: string;
    currency: string;
    processor: string;
    updated_at: string;
    priority: "routine" | "urgent" | "critical";
    next_action: string;
    owner: null;
    due_at: string | null;
    version: string;
    source: { type: string; id: number; href: string };
    actions: { managed_in_source: boolean; reason: string };
  }>;
};

type SourceState<T> = {
  loading: boolean;
  data?: T;
  error?: string;
};

type InboxItem = {
  id: string;
  type: Exclude<WorkType, "all">;
  title: string;
  patient?: string;
  patientReference?: string | null;
  detail: string;
  status: string;
  dueAt: string | null;
  dateCaption: "Due" | "Reported" | "Requested" | "Updated";
  overdue: boolean;
  assignment?: string;
  href: string;
  action: string;
  priority?: "routine" | "urgent" | "critical";
  icon: "assignment" | "message" | "lab" | "note" | "payment";
  staffRequest?: StaffRequest;
  nextAction: string;
  owner: string;
  sourceLabel: string;
  mutation?:
    | { kind: "task"; task: ClinicalTaskItem }
    | { kind: "follow_up"; followUp: EncounterFollowUpItem }
    | { kind: "staff_request"; request: StaffRequest };
};

const taskLabels: Record<ClinicalTask["task_kind"], string> = {
  intake: "Complete intake",
  handoff: "Review encounter handoff",
  result_follow_up: "Follow up on result",
  patient_call: "Contact patient",
  order_execution: "Execute order",
  record_request: "Complete record request",
  staff_request: "Complete staff request",
};

const workTypeLabels: Record<WorkType, string> = {
  all: "All work",
  intake: "Intake & handoffs",
  orders: "Orders & referrals",
  results: "Results",
  documentation: "Documentation",
  billing: "Payments",
  patient: "Patient follow-up",
  staff: "Staff requests",
};

function dateLabel(value: string | null, fallback: string) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load this queue.";
}

function assignmentLabel(item: {
  assigned_to_me: boolean;
  assignee_label?: string | null;
  assigned_to_membership_id?: number | null;
}) {
  if (item.assigned_to_me) return "Assigned to you";
  if (item.assignee_label) return `Assigned to ${item.assignee_label}`;
  if (item.assigned_to_membership_id) return "Owner unavailable";
  return "Unassigned";
}

function taskType(task: ClinicalTaskItem): Exclude<WorkType, "all"> {
  if (task.task_kind === "intake" || task.task_kind === "handoff")
    return "intake";
  if (
    task.task_kind === "order_execution" ||
    task.source_kind === "medication_request" ||
    task.source_kind === "service_request"
  )
    return "orders";
  if (task.task_kind === "result_follow_up") return "results";
  if (task.task_kind === "patient_call") return "patient";
  return "staff";
}

function taskDetail(task: ClinicalTaskItem) {
  if (task.source_kind === "service_request")
    return "Service order or referral awaiting work";
  if (task.source_kind === "medication_request")
    return "Medication order awaiting work";
  return `${task.pool_code.replaceAll("_", " ")} work queue`;
}

function sortItems(items: InboxItem[]) {
  return items.sort((left, right) => {
    if (left.overdue !== right.overdue) return left.overdue ? -1 : 1;
    const leftDue = left.dueAt ? new Date(left.dueAt).getTime() : Infinity;
    const rightDue = right.dueAt ? new Date(right.dueAt).getTime() : Infinity;
    if (leftDue !== rightDue) return leftDue - rightDue;
    return left.title.localeCompare(right.title);
  });
}

function localDateTimeValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function mutationFailure(error: unknown) {
  const apiError = error instanceof ApiError ? error : undefined;
  const outcomeUnknown =
    apiError?.code === "outcome_unconfirmed" || (apiError?.status ?? 0) >= 500;
  const stale = apiError?.code === "stale_record";
  return {
    outcomeUnknown,
    message: outcomeUnknown
      ? "The outcome is unknown. Retry the exact action or refresh to reconcile it."
      : stale
        ? "This work changed elsewhere. Refresh before acting again."
        : errorMessage(error),
  };
}

function TaskActions({
  task,
  actorMembershipId,
  onChanged,
}: {
  task: ClinicalTaskItem;
  actorMembershipId: number;
  onChanged: () => void;
}) {
  const [assigneeId, setAssigneeId] = useState(
    task.assigned_to_membership_id?.toString() || "",
  );
  const [resolutionCode, setResolutionCode] = useState("completed");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const attempts = useRef(new Map<string, string>());

  async function transition(
    action: "claim" | "assign" | "start" | "complete",
    values: Record<string, unknown> = {},
  ) {
    const signature = JSON.stringify([action, values]);
    const requestKey = attempts.current.get(signature) || crypto.randomUUID();
    attempts.current.set(signature, requestKey);
    setBusy(action);
    setError("");
    try {
      await api(`/api/clinic/clinical_tasks/${task.id}`, {
        method: "PATCH",
        body: {
          task: {
            action,
            expected_version: task.version,
            request_key: requestKey,
            ...values,
          },
        },
      });
      attempts.current.delete(signature);
      onChanged();
    } catch (reason) {
      const failure = mutationFailure(reason);
      if (!failure.outcomeUnknown) attempts.current.delete(signature);
      setError(failure.message);
    } finally {
      setBusy("");
    }
  }

  const canClaim = task.state === "open" && !task.assigned_to_membership_id;
  const canResolve =
    task.assigned_to_membership_id === actorMembershipId &&
    ["claimed", "in_progress"].includes(task.state);
  const canStart =
    task.assigned_to_membership_id === actorMembershipId && task.state === "claimed";
  return (
    <Stack spacing={1} sx={{ mt: 1.5 }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} useFlexGap>
        {canClaim && (
          <Button
            size="small"
            variant="contained"
            disabled={Boolean(busy)}
            onClick={() => transition("claim")}
          >
            {busy === "claim" ? "Claiming…" : "Claim"}
          </Button>
        )}
        <FormControl size="small" sx={{ minWidth: 190 }}>
          <InputLabel id={`task-assignee-${task.id}`}>Owner</InputLabel>
          <Select
            labelId={`task-assignee-${task.id}`}
            label="Owner"
            value={assigneeId}
            onChange={(event) => setAssigneeId(String(event.target.value))}
          >
            {task.eligible_assignees.map((candidate) => (
              <MenuItem
                key={candidate.membership_id}
                value={candidate.membership_id.toString()}
              >
                {candidate.membership_id === actorMembershipId
                  ? `${candidate.label} (you)`
                  : candidate.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button
          size="small"
          variant="outlined"
          disabled={
            Boolean(busy) ||
            !assigneeId ||
            assigneeId === task.assigned_to_membership_id?.toString()
          }
          onClick={() =>
            transition("assign", {
              assignee_membership_id: Number(assigneeId),
            })
          }
        >
          {busy === "assign" ? "Transferring…" : "Transfer"}
        </Button>
      </Stack>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} useFlexGap>
        {canStart && (
          <Button
            size="small"
            variant="outlined"
            disabled={Boolean(busy)}
            onClick={() => transition("start")}
          >
            {busy === "start" ? "Starting…" : "Start"}
          </Button>
        )}
        {canResolve && (
          <>
            <FormControl size="small" sx={{ minWidth: 190 }}>
              <InputLabel id={`task-resolution-${task.id}`}>Resolution</InputLabel>
              <Select
                labelId={`task-resolution-${task.id}`}
                label="Resolution"
                value={resolutionCode}
                onChange={(event) => setResolutionCode(String(event.target.value))}
              >
                {[
                  ["completed", "Completed"],
                  ["unable_to_complete", "Unable to complete"],
                  ["no_action_needed", "No action needed"],
                  ["superseded", "Superseded"],
                ].map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              size="small"
              variant="outlined"
              disabled={Boolean(busy)}
              onClick={() => transition("complete", { resolution_code: resolutionCode })}
            >
              {busy === "complete" ? "Resolving…" : "Resolve"}
            </Button>
          </>
        )}
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}

function EncounterFollowUpActions({
  followUp,
  actorMembershipId,
  onChanged,
}: {
  followUp: EncounterFollowUpItem;
  actorMembershipId: number;
  onChanged: () => void;
}) {
  const [assigneeId, setAssigneeId] = useState(
    followUp.assigned_to_membership_id?.toString() || "",
  );
  const [outcome, setOutcome] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const attempts = useRef(new Map<string, string>());

  async function mutate(action: "assign" | "complete", values: Record<string, unknown> = {}) {
    const signature = JSON.stringify([action, values]);
    const requestKey = attempts.current.get(signature) || crypto.randomUUID();
    attempts.current.set(signature, requestKey);
    setBusy(action);
    setError("");
    try {
      if (action === "assign") {
        await api(`/api/clinic/encounters/${followUp.encounter_id}/follow_up`, {
          method: "PUT",
          body: {
            follow_up: {
              request_key: requestKey,
              expected_version: followUp.version,
              status: followUp.status,
              plan: followUp.plan,
              follow_up_appointment_id: followUp.follow_up_appointment?.id,
              due_at: followUp.due_at,
              assigned_to_membership_id: values.assigned_to_membership_id,
            },
          },
        });
      } else {
        await api(`/api/clinic/operations/encounter_follow_ups/${followUp.id}`, {
          method: "PATCH",
          body: {
            follow_up: {
              action: "complete",
              request_key: requestKey,
              expected_version: followUp.version,
              outcome,
            },
          },
        });
      }
      attempts.current.delete(signature);
      onChanged();
    } catch (reason) {
      const failure = mutationFailure(reason);
      if (!failure.outcomeUnknown) attempts.current.delete(signature);
      setError(failure.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <Stack spacing={1} sx={{ mt: 1.5 }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} useFlexGap>
        {!followUp.assigned_to_membership_id && (
          <Button
            size="small"
            variant="contained"
            disabled={Boolean(busy)}
            onClick={() =>
              mutate("assign", { assigned_to_membership_id: actorMembershipId })
            }
          >
            {busy === "assign" ? "Claiming…" : "Claim"}
          </Button>
        )}
        <FormControl size="small" sx={{ minWidth: 190 }}>
          <InputLabel id={`follow-up-assignee-${followUp.id}`}>Owner</InputLabel>
          <Select
            labelId={`follow-up-assignee-${followUp.id}`}
            label="Owner"
            value={assigneeId}
            onChange={(event) => setAssigneeId(String(event.target.value))}
          >
            {followUp.eligible_assignees.map((candidate) => (
              <MenuItem
                key={candidate.membership_id}
                value={candidate.membership_id.toString()}
              >
                {candidate.membership_id === actorMembershipId
                  ? `${candidate.label} (you)`
                  : candidate.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button
          size="small"
          variant="outlined"
          disabled={
            Boolean(busy) ||
            !assigneeId ||
            assigneeId === followUp.assigned_to_membership_id?.toString()
          }
          onClick={() =>
            mutate("assign", { assigned_to_membership_id: Number(assigneeId) })
          }
        >
          {busy === "assign" ? "Transferring…" : "Transfer"}
        </Button>
      </Stack>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} useFlexGap>
        <TextField
          size="small"
          label="Resolution outcome"
          value={outcome}
          onChange={(event) => setOutcome(event.target.value)}
          sx={{ minWidth: { sm: 280 } }}
        />
        <Button
          size="small"
          variant="outlined"
          disabled={Boolean(busy) || !outcome.trim()}
          onClick={() => mutate("complete")}
        >
          {busy === "complete" ? "Resolving…" : "Resolve"}
        </Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}

function StaffRequestActions({
  request,
  actorMembershipId,
  canManage,
  canEscalate,
  onChanged,
}: {
  request: StaffRequest;
  actorMembershipId: number;
  canManage: boolean;
  canEscalate: boolean;
  onChanged: () => void;
}) {
  const [assigneeId, setAssigneeId] = useState(
    request.assignee_membership_id?.toString() || "",
  );
  const [dueAt, setDueAt] = useState(localDateTimeValue(request.due_at));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const attempts = useRef(new Map<string, string>());

  async function manage(
    action: "claim" | "assign" | "schedule",
    values: Record<string, unknown> = {},
  ) {
    const signature = JSON.stringify([action, values]);
    const requestKey = attempts.current.get(signature) || crypto.randomUUID();
    attempts.current.set(signature, requestKey);
    setBusy(action);
    setError("");
    try {
      await api(`/api/clinic/staff-messaging/requests/${request.id}/manage`, {
        method: "PATCH",
        body: {
          management: {
            request_key: requestKey,
            action,
            ...values,
          },
        },
      });
      attempts.current.delete(signature);
      onChanged();
    } catch (reason) {
      const failure = mutationFailure(reason);
      if (!failure.outcomeUnknown) attempts.current.delete(signature);
      setError(failure.message);
    } finally {
      setBusy("");
    }
  }

  async function escalate() {
    const signature = "escalate";
    const requestKey = attempts.current.get(signature) || crypto.randomUUID();
    attempts.current.set(signature, requestKey);
    setBusy("escalate");
    setError("");
    try {
      await api(`/api/clinic/staff-messaging/requests/${request.id}/escalate`, {
        method: "POST",
        body: {
          escalation: {
            request_key: requestKey,
            trigger: request.overdue ? "overdue_recovery" : "manual",
          },
        },
      });
      attempts.current.delete(signature);
      onChanged();
    } catch (reason) {
      const failure = mutationFailure(reason);
      if (!failure.outcomeUnknown) attempts.current.delete(signature);
      setError(failure.message);
    } finally {
      setBusy("");
    }
  }

  if (!canManage && !canEscalate) return null;
  return (
    <Stack spacing={1} sx={{ mt: 1.5 }}>
      {canManage && (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} useFlexGap>
          {!request.assigned_to_me && (
            <Button
              size="small"
              variant="contained"
              disabled={Boolean(busy)}
              onClick={() => manage("claim")}
            >
              {busy === "claim" ? "Claiming…" : "Claim"}
            </Button>
          )}
          <FormControl size="small" sx={{ minWidth: 190 }}>
            <InputLabel id={`staff-assignee-${request.id}`}>Owner</InputLabel>
            <Select
              labelId={`staff-assignee-${request.id}`}
              label="Owner"
              value={assigneeId}
              onChange={(event) => setAssigneeId(String(event.target.value))}
            >
              {request.eligible_assignees.map((candidate) => (
                <MenuItem
                  key={candidate.membership_id}
                  value={candidate.membership_id.toString()}
                >
                  {candidate.membership_id === actorMembershipId
                    ? `${candidate.label} (you)`
                    : candidate.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            size="small"
            variant="outlined"
            disabled={
              Boolean(busy) ||
              !assigneeId ||
              assigneeId === request.assignee_membership_id?.toString()
            }
            onClick={() =>
              manage("assign", { assignee_membership_id: Number(assigneeId) })
            }
          >
            {busy === "assign" ? "Transferring…" : "Transfer"}
          </Button>
        </Stack>
      )}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} useFlexGap>
        {canManage && (
          <>
            <TextField
              size="small"
              type="datetime-local"
              label="Response target"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <Button
              size="small"
              variant="outlined"
              disabled={Boolean(busy) || !dueAt}
              onClick={() =>
                manage("schedule", { due_at: new Date(dueAt).toISOString() })
              }
            >
              {busy === "schedule" ? "Saving…" : "Set target"}
            </Button>
          </>
        )}
        {canEscalate && (
          <Button
            size="small"
            color={request.overdue ? "warning" : "primary"}
            variant={request.overdue ? "contained" : "outlined"}
            disabled={Boolean(busy)}
            onClick={escalate}
          >
            {busy === "escalate" ? "Escalating…" : "Escalate"}
          </Button>
        )}
      </Stack>
      {canManage && !["resolved", "declined", "expired"].includes(request.state) && (
        <Button
          size="small"
          variant="outlined"
          disabled={Boolean(busy)}
          onClick={async () => {
            const signature = "resolve";
            const requestKey = attempts.current.get(signature) || crypto.randomUUID();
            attempts.current.set(signature, requestKey);
            setBusy("resolve");
            setError("");
            try {
              await api(`/api/clinic/staff-messaging/requests/${request.id}/transition`, {
                method: "POST",
                body: {
                  transition: {
                    state: "resolved",
                    resolution_code: "completed",
                    request_key: requestKey,
                    expected_updated_at: request.updated_at,
                  },
                },
              });
              attempts.current.delete(signature);
              onChanged();
            } catch (reason) {
              const failure = mutationFailure(reason);
              if (!failure.outcomeUnknown) attempts.current.delete(signature);
              setError(failure.message);
            } finally {
              setBusy("");
            }
          }}
        >
          {busy === "resolve" ? "Resolving…" : "Resolve"}
        </Button>
      )}
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}

function InboxRow({
  item,
  work,
  onChanged,
}: {
  item: InboxItem;
  work?: FollowUpResponse;
  onChanged: () => void;
}) {
  const Icon =
    item.icon === "lab"
      ? ScienceOutlinedIcon
      : item.icon === "message"
        ? ForumOutlinedIcon
        : item.icon === "note"
          ? DescriptionOutlinedIcon
          : item.icon === "payment"
            ? PaymentOutlinedIcon
            : AssignmentOutlinedIcon;
  const reference = patientReferenceLabel(item.patientReference);
  return (
    <Box
      sx={{
        py: 2,
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "auto minmax(0, 1fr) auto" },
        gap: { xs: 1.25, md: 2 },
        alignItems: "center",
      }}
    >
      <Box
        sx={{
          display: { xs: "none", md: "grid" },
          placeItems: "center",
          width: 40,
          height: 40,
          borderRadius: 1.5,
          color: "primary.main",
          bgcolor: "action.hover",
        }}
      >
        <Icon fontSize="small" />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ flexWrap: "wrap", alignItems: "center" }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {item.title}
          </Typography>
          <Chip
            size="small"
            variant="outlined"
            label={item.status.replaceAll("_", " ")}
          />
          {item.overdue && (
            <Chip size="small" color="warning" label="Overdue" />
          )}
          {item.priority && (
            <Chip
              size="small"
              color={
                item.priority === "critical"
                  ? "error"
                  : item.priority === "urgent"
                    ? "warning"
                    : "default"
              }
              label={`Priority: ${item.priority}`}
            />
          )}
        </Stack>
        {item.patient && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {item.patient}
            {reference ? ` · ${reference}` : ""}
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {item.detail}
        </Typography>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={{ xs: 0.25, sm: 2 }}
          sx={{ mt: 0.5 }}
        >
          <Typography
            variant="body2"
            color={item.overdue ? "warning.main" : "text.secondary"}
          >
            {item.dateCaption}: {dateLabel(item.dueAt, "Not recorded")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Owner: {item.owner}
          </Typography>
        </Stack>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={{ xs: 0.25, sm: 2 }}
          sx={{ mt: 0.5 }}
        >
          <Typography variant="body2" color="text.secondary">
            Next action: {item.nextAction}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Source: {item.sourceLabel}
          </Typography>
        </Stack>
        {item.mutation?.kind === "task" && work && (
          <TaskActions
            task={item.mutation.task}
            actorMembershipId={work.actor_membership_id}
            onChanged={onChanged}
          />
        )}
        {item.mutation?.kind === "follow_up" && work && (
          <EncounterFollowUpActions
            followUp={item.mutation.followUp}
            actorMembershipId={work.actor_membership_id}
            onChanged={onChanged}
          />
        )}
        {item.mutation?.kind === "staff_request" && work && (
          <StaffRequestActions
            request={item.mutation.request}
            actorMembershipId={work.actor_membership_id}
            canManage={work.can_manage_staff_requests}
            canEscalate={work.can_escalate_staff_requests}
            onChanged={onChanged}
          />
        )}
        {!item.mutation && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
            This item is source-managed. Use the source link to complete it;
            the inbox will not imply completion here.
          </Typography>
        )}
      </Box>
      <Button
        variant="outlined"
        href={item.href}
        sx={{ justifySelf: { xs: "start", md: "end" } }}
      >
        {item.action}
      </Button>
    </Box>
  );
}

export function WorkInbox() {
  const { capabilities, current_site } = useClinic();
  const canLoadWork =
    capabilities.staff_messaging_read === true ||
    (capabilities.patients === true && capabilities.encounters === true);
  const canLoadLabs =
    capabilities.patients === true && capabilities.notes_read === true;
  const canLoadRefills =
    capabilities.patients === true &&
    (capabilities.clinical_records_read === true ||
      capabilities.medication_requests_write === true);
  const canLoadExceptions =
    (capabilities.patients === true && capabilities.notes_read === true) ||
    capabilities.billing_read === true;
  const [assignment, setAssignment] = useState<AssignmentFilter>("all");
  const [workType, setWorkType] = useState<WorkType>("all");
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [work, setWork] = useState<SourceState<FollowUpResponse>>({
    loading: canLoadWork,
  });
  const [labReviews, setLabReviews] = useState<SourceState<LabReviewResponse>>({
    loading: canLoadLabs,
  });
  const [labFollowUps, setLabFollowUps] = useState<
    SourceState<LabFollowUpResponse>
  >({ loading: canLoadLabs });
  const [refills, setRefills] = useState<SourceState<RefillResponse>>({
    loading: canLoadRefills,
  });
  const [exceptions, setExceptions] = useState<
    SourceState<WorkExceptionsResponse>
  >({ loading: canLoadExceptions });

  useEffect(() => {
    if (!canLoadWork) return;
    const abort = new AbortController();
    const params = new URLSearchParams({ filter: assignment });
    if (current_site?.id) params.set("site_id", String(current_site.id));
    setWork({ loading: true });
    api<FollowUpResponse>(`/api/clinic/operations/follow_ups?${params}`, {
      signal: abort.signal,
    })
      .then((data) => setWork({ loading: false, data }))
      .catch((error: unknown) => {
        if (!abort.signal.aborted)
          setWork({ loading: false, error: errorMessage(error) });
      });
    return () => abort.abort();
  }, [assignment, canLoadWork, current_site?.id, refreshRevision]);

  useEffect(() => {
    if (!canLoadLabs) return;
    const abort = new AbortController();
    setLabReviews((current) => ({
      ...current,
      loading: true,
      error: undefined,
    }));
    setLabFollowUps((current) => ({
      ...current,
      loading: true,
      error: undefined,
    }));
    api<LabReviewResponse>(
      "/api/clinic/lab_reports/review_queue?page=1&per_page=50",
      {
        signal: abort.signal,
      },
    )
      .then((data) => setLabReviews({ loading: false, data }))
      .catch((error: unknown) => {
        if (!abort.signal.aborted)
          setLabReviews({ loading: false, error: errorMessage(error) });
      });
    api<LabFollowUpResponse>(
      "/api/clinic/lab_reports/follow_up_queue?page=1&per_page=50",
      {
        signal: abort.signal,
      },
    )
      .then((data) => setLabFollowUps({ loading: false, data }))
      .catch((error: unknown) => {
        if (!abort.signal.aborted)
          setLabFollowUps({ loading: false, error: errorMessage(error) });
      });
    return () => abort.abort();
  }, [canLoadLabs, refreshRevision]);

  useEffect(() => {
    if (!canLoadRefills) return;
    const abort = new AbortController();
    setRefills((current) => ({ ...current, loading: true, error: undefined }));
    api<RefillResponse>("/api/clinic/refill_requests", { signal: abort.signal })
      .then((data) => setRefills({ loading: false, data }))
      .catch((error: unknown) => {
        if (!abort.signal.aborted)
          setRefills({ loading: false, error: errorMessage(error) });
      });
    return () => abort.abort();
  }, [canLoadRefills, refreshRevision]);

  useEffect(() => {
    if (!canLoadExceptions) return;
    const abort = new AbortController();
    const params = new URLSearchParams();
    if (current_site?.id) params.set("site_id", String(current_site.id));
    const queryString = params.toString();
    const query = queryString ? `?${queryString}` : "";
    setExceptions((current) => ({
      ...current,
      loading: true,
      error: undefined,
    }));
    api<WorkExceptionsResponse>(`/api/clinic/work_exceptions${query}`, {
      signal: abort.signal,
    })
      .then((data) => setExceptions({ loading: false, data }))
      .catch((error: unknown) => {
        if (!abort.signal.aborted)
          setExceptions({ loading: false, error: errorMessage(error) });
      });
    return () => abort.abort();
  }, [canLoadExceptions, current_site?.id, refreshRevision]);

  const items = useMemo(() => {
    const next: InboxItem[] = [];
    work.data?.clinical_tasks.forEach((task) => {
      if (!task.encounter_href) return;
      next.push({
        id: `task-${task.id}`,
        type: taskType(task),
        title: taskLabels[task.task_kind],
        patient: task.patient_display_name,
        patientReference: task.patient_reference,
        detail: taskDetail(task),
        status: task.state,
        dueAt: task.due_at,
        dateCaption: "Due",
        overdue: task.overdue,
        assignment: assignmentLabel(task),
        owner: assignmentLabel(task).replace(/^Assigned to /, ""),
        nextAction:
          task.state === "open"
            ? "Claim or transfer this task"
            : task.state === "claimed"
              ? "Start or resolve this task"
              : "Resolve this task",
        sourceLabel: "Clinical task",
        href: task.encounter_href,
        action: "Open work item",
        icon: "assignment",
        priority: "routine",
        mutation: { kind: "task", task },
      });
    });
    work.data?.encounter_follow_ups.forEach((followUp) => {
      next.push({
        id: `encounter-${followUp.id}`,
        type: "patient",
        title: "Encounter follow-up",
        patient: followUp.patient_display_name,
        patientReference: followUp.patient_reference,
        detail: followUp.plan || "Follow-up plan awaiting action",
        status: followUp.status,
        dueAt: followUp.due_at,
        dateCaption: "Due",
        overdue: followUp.overdue,
        assignment: assignmentLabel(followUp),
        owner: assignmentLabel(followUp).replace(/^Assigned to /, ""),
        nextAction: "Complete the follow-up and record the outcome",
        sourceLabel: "Encounter follow-up",
        href: `/clinic/patients/${followUp.patient_id}/encounters/${followUp.encounter_id}`,
        action: "Open encounter",
        icon: "assignment",
        priority: "routine",
        mutation: { kind: "follow_up", followUp },
      });
    });
    work.data?.requests.forEach((request) => {
      next.push({
        id: `staff-${request.id}`,
        type: "staff",
        title: request.requested_action || request.subject,
        detail: request.requested_action
          ? request.subject
          : "Staff request awaiting action",
        status: request.state,
        dueAt: request.due_at,
        dateCaption: "Due",
        overdue: request.overdue,
        assignment: assignmentLabel(request),
        owner: assignmentLabel(request).replace(/^Assigned to /, ""),
        nextAction: request.requested_action || "Respond to this staff request",
        sourceLabel: "Staff conversation",
        href: `/clinic/messages?conversation_id=${request.conversation_id}`,
        action: "Open conversation",
        icon: "message",
        staffRequest: request,
        priority: request.overdue ? "urgent" : "routine",
        mutation: { kind: "staff_request", request },
      });
    });

    if (assignment === "all") {
      labReviews.data?.items.forEach((item) => {
        const query = new URLSearchParams({
          lab_report_id: String(item.report_id),
          lab_version_id: String(item.current_version.id),
        });
        next.push({
          id: `lab-review-${item.report_id}-${item.current_version.id}`,
          type: "results",
          title: item.current_version.title,
          patient: item.patient.display_name,
          patientReference: item.patient.reference,
          detail: `${item.current_version.result_count} recorded ${item.current_version.result_count === 1 ? "result" : "results"} awaiting review`,
          status: "needs review",
          dueAt: item.current_version.issued_at,
          dateCaption: "Reported",
          overdue: false,
          owner: "Unassigned",
          nextAction: "Review the reported result",
          sourceLabel: "Lab report",
          href: `/clinic/patients/${item.patient.id}?${query}`,
          action: labReviews.data?.can_review ? "Review report" : "Open report",
          priority: item.current_version.result_priority,
          icon: "lab",
        });
      });
    }

    if (assignment !== "mine") {
      labFollowUps.data?.items.forEach((item) => {
        const dueAt = item.follow_up.due_at;
        const overdue = Boolean(
          dueAt && new Date(dueAt).getTime() < Date.now(),
        );
        if (assignment === "overdue" && !overdue) return;
        const query = new URLSearchParams({
          lab_report_id: String(item.report_id),
          lab_version_id: String(item.version.id),
        });
        next.push({
          id: `lab-follow-up-${item.follow_up.id}`,
          type: "results",
          title: item.version.title,
          patient: item.patient.display_name,
          patientReference: item.patient.reference,
          detail:
            item.follow_up.instructions ||
            "Lab result follow-up awaiting action",
          status: item.follow_up.state,
          dueAt,
          dateCaption: "Due",
          overdue,
          owner: "Unassigned",
          nextAction: item.follow_up.instructions || "Complete the result follow-up",
          sourceLabel: "Lab follow-up",
          href: `/clinic/patients/${item.patient.id}?${query}`,
          action: labFollowUps.data?.can_complete
            ? "Complete follow-up"
            : "Open report",
          priority: item.version.result_priority,
          icon: "lab",
        });
      });
    }

    if (assignment === "all") {
      refills.data?.refill_requests
        .filter(
          (request) =>
            request.status === "pending" || request.status === "in_review",
        )
        .forEach((request) => {
          next.push({
            id: `refill-${request.id}`,
            type: "orders",
            title: `Refill: ${request.medication_name}`,
            patient: request.patient.display_name,
            patientReference: request.patient.reference,
            detail: request.request_note
              ? `${request.pharmacy_destination} · ${request.request_note}`
              : `${request.pharmacy_destination} · ${request.source} request`,
            status: request.status,
            dueAt: request.requested_at,
            dateCaption: "Requested",
            overdue: false,
            owner: "Unassigned",
            nextAction: "Review the refill request",
            sourceLabel: "Refill request",
            href: "/clinic/refills",
            action: "Review refill",
            icon: "assignment",
            priority: "routine",
          });
        });
    }

    if (assignment === "all") {
      exceptions.data?.unsigned_items.forEach((item) => {
        next.push({
          id: item.key,
          type: "documentation",
          title: "Unsigned encounter note",
          patient: item.patient.display_name,
          patientReference: item.patient.reference,
          detail: "The current SOAP note revision is awaiting signature",
          status: "unsigned",
          dueAt: item.updated_at,
          dateCaption: "Updated",
          overdue: false,
          owner: "Unassigned",
          nextAction: item.next_action,
          sourceLabel: "Encounter note",
          href: item.source.href,
          action: "Open encounter",
          icon: "note",
          priority: item.priority,
        });
      });
      exceptions.data?.payment_exceptions.forEach((item) => {
        next.push({
          id: `payment-exception-${item.id}`,
          type: "billing",
          title:
            item.status === "failed"
              ? "Payment failed"
              : "Payment needs reconciliation",
          patient: item.patient?.display_name,
          patientReference: item.patient?.reference,
          detail: `${item.currency} ${item.amount} · invoice #${item.invoice_id}`,
          status: item.status,
          dueAt: item.updated_at,
          dateCaption: "Updated",
          overdue: false,
          owner: "Unassigned",
          nextAction: item.next_action,
          sourceLabel: "Payment collection",
          href: item.source.href,
          action: "Open billing",
          icon: "payment",
          priority: item.priority,
        });
      });
    }
    return sortItems(
      workType === "all" ? next : next.filter((item) => item.type === workType),
    );
  }, [
    assignment,
    exceptions.data,
    labFollowUps.data,
    labReviews.data,
    refills.data,
    work.data,
    workType,
  ]);

  const anyLoading =
    work.loading ||
    labReviews.loading ||
    labFollowUps.loading ||
    refills.loading ||
    exceptions.loading;
  const exceptionSourceErrors = exceptions.data
    ? Object.entries(exceptions.data.sources)
        .filter(([, source]) => Boolean(source.error))
        .map(([, source]) => source.error?.message)
        .filter((message): message is string => Boolean(message))
    : [];
  const sourceErrors = [
    work.error && "Assigned work",
    labReviews.error && "Lab review",
    labFollowUps.error && "Lab follow-up",
    refills.error && "Refill requests",
    exceptions.error && "Documentation and payment exceptions",
    ...exceptionSourceErrors,
  ].filter(Boolean);
  const returnedWorkCount = work.data
    ? work.data.requests.length +
      work.data.encounter_follow_ups.length +
      work.data.clinical_tasks.length
    : 0;
  const expectedWorkCount = work.data
    ? work.data.summary[assignment === "all" ? "open" : assignment] +
      work.data.encounter_summary[assignment === "all" ? "open" : assignment] +
      work.data.clinical_task_summary[
        assignment === "all" ? "open" : assignment
      ]
    : 0;
  const queuesTruncated =
    expectedWorkCount > returnedWorkCount ||
    (assignment === "all" &&
      ((labReviews.data?.pagination.total ?? 0) >
        (labReviews.data?.items.length ?? 0) ||
        (labFollowUps.data?.pagination.total ?? 0) >
          (labFollowUps.data?.items.length ?? 0) ||
        exceptions.data?.sources.unsigned_notes.truncated === true ||
        exceptions.data?.sources.payment_exceptions.truncated === true));
  const hasAnyAccess =
    canLoadWork || canLoadLabs || canLoadRefills || canLoadExceptions;

  if (!hasAnyAccess) {
    return (
      <Alert severity="info">
        Your clinic role does not include access to operational, clinical, or
        billing work queues.
      </Alert>
    );
  }

  return (
    <Stack spacing={2.5} sx={{ mb: 3.5 }}>
      <Box>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}
        >
          <Box>
            <Typography component="h1" variant="h4" sx={{ fontWeight: 750 }}>
              Work inbox
            </Typography>
            <Typography
              color="text.secondary"
              sx={{ mt: 0.5, maxWidth: "72ch" }}
            >
              Prioritize the work your role can access, then finish it in the
              patient record, encounter, billing workspace, or staff
              conversation.
            </Typography>
          </Box>
          <Button
            variant="outlined"
            onClick={() => setRefreshRevision((value) => value + 1)}
            disabled={anyLoading}
          >
            Refresh
          </Button>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {current_site
            ? current_site.name || current_site.code
            : "All accessible locations"}
        </Typography>
      </Box>

      {sourceErrors.length > 0 && (
        <Alert severity="warning">
          Some inbox sources are unavailable: {sourceErrors.join("; ")} The
          loaded rows remain visible, but this inbox is not a complete view.
        </Alert>
      )}
      {queuesTruncated && (
        <Alert severity="info">
          This view shows the first available items from one or more queues.
          Open the linked workspaces or dedicated Operations queues to continue
          the full list.
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
          value={assignment}
          onChange={(_, value: AssignmentFilter) => setAssignment(value)}
          aria-label="Work assignment filters"
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            px: { xs: 1, md: 2 },
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Tab value="all" label="All open" />
          <Tab value="mine" label="Mine" />
          <Tab value="overdue" label="Overdue" />
        </Tabs>
        <Box sx={{ p: { xs: 2, md: 2.5 } }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            sx={{
              alignItems: { sm: "center" },
              justifyContent: "space-between",
              mb: 1,
            }}
          >
            <Typography variant="body2" color="text.secondary">
              {anyLoading
                ? "Updating work queues…"
                : `${items.length} ${items.length === 1 ? "item" : "items"} shown`}
            </Typography>
            <FormControl
              size="small"
              sx={{ minWidth: { xs: "100%", sm: 220 } }}
            >
              <InputLabel id="work-type-filter-label">Work type</InputLabel>
              <Select
                labelId="work-type-filter-label"
                label="Work type"
                value={workType}
                onChange={(event) =>
                  setWorkType(event.target.value as WorkType)
                }
              >
                {(Object.keys(workTypeLabels) as WorkType[]).map((value) => (
                  <MenuItem key={value} value={value}>
                    {workTypeLabels[value]}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          {anyLoading && items.length === 0 && (
            <Stack
              direction="row"
              spacing={1.5}
              sx={{ py: 5, alignItems: "center", justifyContent: "center" }}
              role="status"
            >
              <CircularProgress size={20} />
              <Typography>Loading work inbox…</Typography>
            </Stack>
          )}
          {!anyLoading && items.length === 0 && sourceErrors.length === 0 && (
            <Box sx={{ py: 5, textAlign: "center" }}>
              <AssignmentOutlinedIcon
                sx={{ color: "text.disabled", fontSize: 42, mb: 1 }}
              />
              <Typography variant="h6">No matching work</Typography>
              <Typography color="text.secondary">
                Try another scope or work type. New authorized work will appear
                here when it is created.
              </Typography>
            </Box>
          )}
          {!anyLoading && items.length === 0 && sourceErrors.length > 0 && (
            <Box sx={{ py: 5, textAlign: "center" }}>
              <Typography variant="h6">
                No work is available from the loaded queues
              </Typography>
              <Typography color="text.secondary">
                Retry the unavailable sources before treating this view as
                clear.
              </Typography>
            </Box>
          )}
          {items.length > 0 && (
            <Stack divider={<Divider flexItem />}>
              {items.map((item) => (
                <InboxRow
                  key={item.id}
                  item={item}
                  work={work.data}
                  onChanged={() => setRefreshRevision((value) => value + 1)}
                />
              ))}
            </Stack>
          )}
        </Box>
      </Paper>
      <Typography variant="caption" color="text.secondary">
        Opening or refreshing this inbox does not complete, acknowledge, or
        change source work.
        {assignment === "mine"
          ? " Result queues without an assignee are excluded from Mine."
          : ""}
      </Typography>
    </Stack>
  );
}
