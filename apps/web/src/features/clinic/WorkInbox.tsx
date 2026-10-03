import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import PaymentOutlinedIcon from "@mui/icons-material/PaymentOutlined";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api } from "../../api/client";
import { useDemoNavigationBlocker } from "../demo/navigationBlockers";
import type {
  Appointment,
  ClinicalTask,
  ClinicalTaskMutationReceipt,
  Pagination,
} from "../../api/contracts";
import { isBeforeBusinessTime } from "../../shared/businessDate";
import type { EncounterFollowUpRecord } from "./EncounterFollowUp";
import { patientReferenceLabel } from "./patientReference";
import { ClinicEmptyState } from "./ClinicEmptyState";
import {
  canClaimPatientFlowTask,
  confirmedPatientFlowClaim,
  patientFlowScheduleHref,
} from "./patientFlowActions";
import type { LabFollowUp } from "./PatientLabReports";
import { useClinic } from "./Workspace";
import { useClinicNavigation } from "./clinicNavigation";
import { PrescriptionReconciliationWorklist } from "./PrescriptionReconciliationWorklist";
import { useClinicRealtimeTopic } from "./ClinicRealtime";
import {
  freshInboxPages,
  inboxPageCount,
  usePagedInboxSource,
  type InboxPage,
} from "./workInboxPaging";

type AssignmentFilter = "all" | "mine" | "overdue" | "offboarded";
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
  source_label?: string | null;
  source_note?: string | null;
  patient_display_name: string;
  patient_reference: string;
  assigned_to_me: boolean;
  assignee_label: string | null;
  overdue: boolean;
  encounter_href: string | null;
  patient_href: string;
  eligible_assignees: Array<{ membership_id: number; label: string }>;
  has_recorded_appointment?: boolean;
};

type FollowUpResponse = {
  staff_requests_page: InboxPage;
  encounter_follow_ups_page: InboxPage;
  renewal_exceptions_page: InboxPage;
  renewal_exceptions_truncated?: boolean;
  renewal_exceptions?: Array<{
    id: number;
    agreement_id: number;
    patient_id: number;
    patient_display_name: string;
    patient_reference: string | null;
    status: string;
    invoice_status: string | null;
    amount_due: string | null;
    currency: string;
    updated_at: string;
    owner: string;
    assignment_exception: string | null;
    next_action: string;
    href: string;
  }>;
  summary: Summary;
  requests: StaffRequest[];
  encounter_summary: Summary;
  encounter_follow_ups: EncounterFollowUpItem[];
  clinical_task_summary: Summary;
  clinical_tasks: ClinicalTaskItem[];
  offboarded_tasks_page: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
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
type CallbackRequest = {
  id: number;
  status: string;
  content: string;
  requested_at: string;
  reviewed_at: string | null;
  review_note: string | null;
  patient: { id: number; display_name: string; reference: string | null };
};

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

type PatientFlowColumn = "new" | "active" | "scheduling";

const patientFlowColumns: Array<{
  id: PatientFlowColumn;
  title: string;
  description: string;
}> = [
  {
    id: "new",
    title: "New",
    description: "Newly created work that still needs an owner.",
  },
  {
    id: "active",
    title: "In progress",
    description: "A staff member is actively working the next step.",
  },
  {
    id: "scheduling",
    title: "Ready to schedule",
    description: "Onboarding is ready for the clinic scheduling workflow.",
  },
];

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
  callbackRequest?: CallbackRequest;
  nextAction: string;
  owner: string;
  sourceLabel: string;
  scheduleReady?: boolean;
  patientFlowHidden?: boolean;
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

function taskTitle(task: ClinicalTaskItem) {
  return task.task_kind === "patient_call" &&
    task.source_type === "manual" &&
    task.pool_code === "front_desk"
    ? "Complete initial contact"
    : taskLabels[task.task_kind];
}

function taskNextAction(task: ClinicalTaskItem) {
  if (
    task.task_kind === "patient_call" &&
    task.source_type === "manual" &&
    task.pool_code === "front_desk" &&
    task.state === "open"
  ) {
    if (task.has_recorded_appointment)
      return "Complete the initial contact record; appointment already scheduled";
    return "Complete initial contact and schedule the first appointment";
  }
  if (task.pending_assignee_membership_id)
    return "Accept the requested transfer; current coverage remains responsible";
  if (task.source_managed) return "Continue in the source workspace";
  if (task.waiting_reason)
    return "Review prerequisite work; other tasks remain available";
  if (task.state === "open") return "Claim or transfer this task";
  if (task.state === "claimed") return "Start or resolve this task";
  return "Resolve this task";
}

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

function itemDateLabel(item: InboxItem) {
  return item.dateCaption === "Due" && !item.dueAt
    ? "No due date"
    : `${item.dateCaption}: ${dateLabel(item.dueAt, "Not recorded")}`;
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

function taskAction(task: ClinicalTaskItem) {
  return task.source_managed && task.task_kind === "order_execution"
    ? "Open order follow-up"
    : "Open work item";
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

function patientFlowColumn(item: InboxItem): PatientFlowColumn {
  if (item.scheduleReady) return "scheduling";
  if (item.type === "patient") return "scheduling";
  if (["claimed", "in_progress", "in review"].includes(item.status))
    return "active";
  return "new";
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
    !apiError ||
    apiError.status === 408 ||
    apiError.code === "outcome_unconfirmed" ||
    apiError.status >= 500;
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

type PatientFlowTaskAction =
  | "claim"
  | "assign"
  | "accept_transfer"
  | "reject_transfer"
  | "dependencies"
  | "start"
  | "complete";

type PatientFlowTaskController = {
  busy: string;
  error: string;
  inFlight: { current: boolean };
  attempts: { current: Map<string, { key: string; version: number }> };
  unknownAttempt: {
    action: PatientFlowTaskAction;
    values: Record<string, unknown>;
    task: ClinicalTaskItem;
    actorMembershipId: number;
  } | null;
  listeners: Set<() => void>;
  notify: () => void;
};

function createPatientFlowTaskController(onChange: () => void = () => {}) {
  const controller: PatientFlowTaskController = {
    busy: "",
    error: "",
    inFlight: { current: false },
    attempts: { current: new Map() },
    unknownAttempt: null,
    listeners: new Set(),
    notify: () => {
      for (const update of controller.listeners) update();
      onChange();
    },
  };
  return controller;
}

function TaskActions({
  task,
  actorMembershipId,
  availableTasks,
  onChanged,
  claimOnly = false,
  hideClaim = false,
  controller,
}: {
  task: ClinicalTaskItem;
  actorMembershipId: number;
  availableTasks: ClinicalTaskItem[];
  onChanged: (message?: string) => void;
  claimOnly?: boolean;
  hideClaim?: boolean;
  controller?: PatientFlowTaskController;
}) {
  const [assigneeId, setAssigneeId] = useState(
    task.assigned_to_membership_id?.toString() || "",
  );
  const [resolutionCode, setResolutionCode] = useState("");
  const [dependencyIds, setDependencyIds] = useState<number[]>(
    task.dependency_ids || [],
  );
  const [showDependencies, setShowDependencies] = useState(false);
  const [localBusy, setLocalBusy] = useState("");
  const [localError, setLocalError] = useState("");
  const [, redraw] = useState(0);
  const localAttempts = useRef(
    new Map<string, { key: string; version: number }>(),
  );
  const localInFlight = useRef(false);
  const attempts = controller?.attempts ?? localAttempts;
  const inFlight = controller?.inFlight ?? localInFlight;
  const busy = controller?.busy ?? localBusy;
  const error = controller?.error ?? localError;
  const actionLocked = Boolean(busy || controller?.unknownAttempt);
  useEffect(() => {
    if (!controller) return;
    const update = () => redraw((value) => value + 1);
    controller.listeners.add(update);
    return () => {
      controller.listeners.delete(update);
    };
  }, [controller]);
  const setBusy = (value: string) => {
    if (!controller) return setLocalBusy(value);
    controller.busy = value;
    controller.notify();
  };
  const setError = (value: string) => {
    if (!controller) return setLocalError(value);
    controller.error = value;
    controller.notify();
  };

  async function transition(
    action: PatientFlowTaskAction,
    values: Record<string, unknown> = {},
    exactRetry = false,
  ) {
    const unresolved = controller?.unknownAttempt;
    if (inFlight.current || (unresolved && !exactRetry)) return;
    if (unresolved && unresolved.actorMembershipId !== actorMembershipId)
      return;
    // Unknown retries use the original reviewed task, payload, key and version.
    const reviewedTask = unresolved?.task ?? task;
    if (unresolved) {
      action = unresolved.action;
      values = unresolved.values;
    }
    inFlight.current = true;
    const signature = JSON.stringify([action, values]);
    const attempt = attempts.current.get(signature) || {
      key: crypto.randomUUID(),
      version: reviewedTask.version,
    };
    attempts.current.set(signature, attempt);
    setBusy(action);
    setError("");
    try {
      const response = await api<{
        task: ClinicalTaskItem;
        task_receipt?: ClinicalTaskMutationReceipt;
      }>(`/api/clinic/clinical_tasks/${reviewedTask.id}`, {
        method: "PATCH",
        body: {
          task: {
            action,
            expected_version: attempt.version,
            request_key: attempt.key,
            ...values,
          },
        },
      });
      if (
        response.task?.id !== reviewedTask.id ||
        !Number.isSafeInteger(response.task.version) ||
        response.task.version <= attempt.version ||
        (action === "claim" &&
          !confirmedPatientFlowClaim(
            reviewedTask,
            response.task,
            response.task_receipt,
            attempt,
            actorMembershipId,
          )) ||
        (action === "complete" && response.task.state !== "completed")
      )
        throw new ApiError(
          503,
          "The task update was not confirmed. Refresh before retrying.",
          "outcome_unconfirmed",
        );
      attempts.current.delete(signature);
      if (controller) controller.unknownAttempt = null;
      onChanged(
        action === "complete"
          ? "Clinical task resolved."
          : action === "claim"
            ? "Work claimed."
            : undefined,
      );
    } catch (reason) {
      const failure = mutationFailure(reason);
      const unknown =
        failure.outcomeUnknown ||
        Boolean(
          controller &&
          (unresolved || (reason instanceof ApiError && reason.status === 408)),
        );
      if (controller && unknown) {
        controller.unknownAttempt ??= {
          action,
          values: structuredClone(values),
          task: reviewedTask,
          actorMembershipId,
        };
      }
      if (!unknown) attempts.current.delete(signature);
      setError(
        controller && unknown
          ? "The outcome is unknown. Conflicting task actions are locked; retry the exact task action to confirm it."
          : failure.message,
      );
    } finally {
      inFlight.current = false;
      setBusy("");
    }
  }

  const errorNotice = error && (
    <Alert
      severity="error"
      action={
        controller?.unknownAttempt ? (
          <Button
            color="inherit"
            disabled={Boolean(busy)}
            onClick={() => {
              const pending = controller.unknownAttempt;
              if (pending)
                void transition(pending.action, pending.values, true);
            }}
          >
            Retry exact task action
          </Button>
        ) : undefined
      }
    >
      {error}
    </Alert>
  );
  const canClaim = canClaimPatientFlowTask(task, actorMembershipId);
  const claimControl = !hideClaim && canClaim && (
    <Button
      size="small"
      variant={claimOnly ? "outlined" : "contained"}
      disabled={actionLocked}
      sx={{ minHeight: 44, whiteSpace: "nowrap", alignSelf: "start" }}
      onClick={() => transition("claim")}
    >
      {busy === "claim"
        ? "Claiming…"
        : task.owner_unavailable
          ? "Claim coverage"
          : "Claim work"}
    </Button>
  );
  if (claimOnly)
    return (
      <Stack spacing={1} sx={{ mt: 1.5 }}>
        {claimControl}
        {errorNotice}
      </Stack>
    );
  const canResolve =
    task.assigned_to_membership_id === actorMembershipId &&
    ["claimed", "in_progress"].includes(task.state) &&
    !task.source_managed &&
    !task.waiting_reason;
  const canStart =
    task.assigned_to_membership_id === actorMembershipId &&
    task.state === "claimed" &&
    !task.waiting_reason;
  return (
    <Stack spacing={1} sx={{ mt: 1.5 }}>
      {task.assignment_exception && (
        <Alert severity="warning">{task.assignment_exception}</Alert>
      )}
      {task.waiting_reason && (
        <Alert severity="info">
          {task.waiting_reason} Ownership and unrelated work remain available.
        </Alert>
      )}
      {task.pending_assignee_membership_id && (
        <Alert severity="info">
          This handoff is awaiting acceptance. Current coverage remains
          responsible. Requested owner:{" "}
          {task.eligible_assignees.find(
            (candidate) =>
              candidate.membership_id === task.pending_assignee_membership_id,
          )?.label || "no longer eligible; request another transfer"}
          .
          {task.pending_assignee_membership_id === actorMembershipId && (
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Button
                disabled={actionLocked}
                onClick={() => transition("accept_transfer")}
              >
                Accept transfer
              </Button>
              <Button
                disabled={actionLocked}
                onClick={() => transition("reject_transfer")}
              >
                Decline transfer
              </Button>
            </Stack>
          )}
        </Alert>
      )}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        useFlexGap
        sx={{ flexWrap: "wrap", alignItems: "stretch" }}
      >
        {claimControl}
        <FormControl
          size="small"
          sx={{ minWidth: { xs: "100%", sm: 190 }, flex: "1 1 190px" }}
        >
          <InputLabel id={`task-assignee-${task.id}`}>Owner</InputLabel>
          <Select
            labelId={`task-assignee-${task.id}`}
            label="Owner"
            disabled={actionLocked}
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
            actionLocked ||
            !assigneeId ||
            assigneeId === task.assigned_to_membership_id?.toString()
          }
          onClick={() =>
            transition("assign", {
              assignee_membership_id: Number(assigneeId),
            })
          }
          sx={{ minHeight: 40, whiteSpace: "nowrap", flex: "0 0 auto" }}
        >
          {busy === "assign" ? "Requesting…" : "Request transfer"}
        </Button>
      </Stack>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        useFlexGap
        sx={{ flexWrap: "wrap", alignItems: "stretch" }}
      >
        {canStart && (
          <Button
            size="small"
            variant="outlined"
            disabled={actionLocked}
            sx={{ minHeight: 40, whiteSpace: "nowrap", flex: "0 0 auto" }}
            onClick={() => transition("start")}
          >
            {busy === "start" ? "Starting…" : "Start"}
          </Button>
        )}
        {canResolve && (
          <>
            <FormControl
              size="small"
              sx={{ minWidth: { xs: "100%", sm: 190 }, flex: "1 1 190px" }}
            >
              <InputLabel id={`task-resolution-${task.id}`}>
                Resolution
              </InputLabel>
              <Select
                labelId={`task-resolution-${task.id}`}
                label="Resolution"
                disabled={actionLocked}
                value={resolutionCode}
                onChange={(event) =>
                  setResolutionCode(String(event.target.value))
                }
              >
                <MenuItem value="" disabled>
                  Select a resolution
                </MenuItem>
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
              disabled={actionLocked || !resolutionCode}
              sx={{ minHeight: 40, whiteSpace: "nowrap", flex: "0 0 auto" }}
              onClick={() =>
                transition("complete", { resolution_code: resolutionCode })
              }
            >
              {busy === "complete" ? "Resolving…" : "Resolve"}
            </Button>
          </>
        )}
      </Stack>
      {errorNotice}
      {task.source_managed && (
        <Typography variant="caption">
          Completion is recorded in the linked source workspace.
        </Typography>
      )}
      <Button
        size="small"
        sx={{ alignSelf: "flex-start" }}
        disabled={actionLocked}
        onClick={() => setShowDependencies(!showDependencies)}
      >
        {showDependencies ? "Hide prerequisites" : "Manage prerequisites"}
      </Button>
      {showDependencies && (
        <Stack spacing={1}>
          <FormControl size="small">
            <InputLabel id={`task-dependencies-${task.id}`}>
              Work required before starting
            </InputLabel>
            <Select
              multiple
              labelId={`task-dependencies-${task.id}`}
              label="Work required before starting"
              disabled={actionLocked}
              value={dependencyIds}
              onChange={(event) =>
                setDependencyIds(
                  Array.from(event.target.value as number[]).map(Number),
                )
              }
            >
              {availableTasks
                .filter(
                  (candidate) =>
                    candidate.patient_id === task.patient_id &&
                    candidate.id !== task.id,
                )
                .map((candidate) => (
                  <MenuItem key={candidate.id} value={candidate.id}>
                    {taskLabels[candidate.task_kind]} ·{" "}
                    {candidate.source_type.replaceAll("_", " ")} · #
                    {candidate.id}
                  </MenuItem>
                ))}
              {dependencyIds
                .filter(
                  (id) =>
                    !availableTasks.some((candidate) => candidate.id === id),
                )
                .map((id) => (
                  <MenuItem key={id} value={id}>
                    Recorded prerequisite #{id}
                  </MenuItem>
                ))}
            </Select>
          </FormControl>
          <Typography variant="caption">
            Only this task's start and completion wait. Use the source workspace
            for clinical decisions.
          </Typography>
          <Button
            disabled={actionLocked}
            onClick={() =>
              transition("dependencies", { dependency_ids: dependencyIds })
            }
          >
            Save prerequisites
          </Button>
        </Stack>
      )}
      {Boolean(task.history?.length) && (
        <Typography variant="caption" color="text.secondary">
          Latest responsibility event:{" "}
          {task.history?.at(-1)?.action.replaceAll("_", " ")}
        </Typography>
      )}
    </Stack>
  );
}

type FollowUpAttempt = {
  action: "assign" | "complete";
  path: string;
  method: string;
  body: { follow_up: Record<string, unknown> };
  followUp: EncounterFollowUpItem;
  actorMembershipId: number;
};
type FollowUpController = {
  attempt: FollowUpAttempt | null;
  inFlight: boolean;
  busy: string;
  error: string;
  listeners: Set<() => void>;
  notify: () => void;
};
function createFollowUpController(onChange: () => void = () => {}) {
  const controller: FollowUpController = {
    attempt: null,
    inFlight: false,
    busy: "",
    error: "",
    listeners: new Set(),
    notify: () => {
      controller.listeners.forEach((listener) => listener());
      onChange();
    },
  };
  return controller;
}

function EncounterFollowUpActions({
  followUp,
  actorMembershipId,
  onChanged,
  controller: sharedController,
}: {
  followUp: EncounterFollowUpItem;
  actorMembershipId: number;
  onChanged: () => void;
  controller?: FollowUpController;
}) {
  const [assigneeId, setAssigneeId] = useState(
    followUp.assigned_to_membership_id?.toString() || "",
  );
  const [outcome, setOutcome] = useState("");
  const localController = useRef<FollowUpController | null>(null);
  if (!localController.current)
    localController.current = createFollowUpController();
  const controller = sharedController ?? localController.current;
  const [, redraw] = useState(0);
  useEffect(() => {
    const update = () => redraw((value) => value + 1);
    controller.listeners.add(update);
    return () => {
      controller.listeners.delete(update);
    };
  }, [controller]);
  const pendingAttempt = controller.attempt;
  const busy = controller.busy;
  const error = controller.error;

  async function mutate(
    action: "assign" | "complete",
    values: Record<string, unknown> = {},
    exactRetry = false,
  ) {
    if (controller.inFlight || (controller.attempt && !exactRetry)) return;
    const attempt = controller.attempt ?? {
      action,
      followUp: structuredClone(followUp),
      actorMembershipId,
      path:
        action === "assign"
          ? `/api/clinic/encounters/${followUp.encounter_id}/follow_up`
          : `/api/clinic/operations/encounter_follow_ups/${followUp.id}`,
      method: action === "assign" ? "PUT" : "PATCH",
      body: {
        follow_up:
          action === "assign"
            ? {
                request_key: crypto.randomUUID(),
                expected_version: followUp.version,
                status: followUp.status,
                plan: followUp.plan,
                follow_up_appointment_id: followUp.follow_up_appointment?.id,
                due_at: followUp.due_at,
                assigned_to_membership_id: values.assigned_to_membership_id,
              }
            : {
                action: "complete",
                request_key: crypto.randomUUID(),
                expected_version: followUp.version,
                outcome,
              },
      },
    };
    controller.inFlight = true;
    controller.attempt = attempt;
    controller.busy = attempt.action;
    controller.error = "";
    controller.notify();
    try {
      await api(attempt.path, { method: attempt.method, body: attempt.body });
      controller.attempt = null;
      onChanged();
    } catch (reason) {
      const failure = mutationFailure(reason);
      if (!failure.outcomeUnknown && !exactRetry) controller.attempt = null;
      controller.error = failure.message;
    } finally {
      controller.inFlight = false;
      controller.busy = "";
      controller.notify();
    }
  }

  return (
    <Stack spacing={1} sx={{ mt: 1.5 }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} useFlexGap>
        {!followUp.assigned_to_membership_id && (
          <Button
            size="small"
            variant="contained"
            disabled={Boolean(busy) || Boolean(pendingAttempt)}
            onClick={() =>
              mutate("assign", { assigned_to_membership_id: actorMembershipId })
            }
          >
            {busy === "assign" ? "Claiming…" : "Claim"}
          </Button>
        )}
        <FormControl size="small" sx={{ minWidth: 190 }}>
          <InputLabel id={`follow-up-assignee-${followUp.id}`}>
            Owner
          </InputLabel>
          <Select
            labelId={`follow-up-assignee-${followUp.id}`}
            label="Owner"
            value={assigneeId}
            disabled={Boolean(busy) || Boolean(pendingAttempt)}
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
            Boolean(pendingAttempt) ||
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
          value={
            pendingAttempt?.action === "complete"
              ? String(pendingAttempt.body.follow_up.outcome ?? "")
              : outcome
          }
          disabled={Boolean(busy) || Boolean(pendingAttempt)}
          onChange={(event) => setOutcome(event.target.value)}
          sx={{ minWidth: { sm: 280 } }}
        />
        <Button
          size="small"
          variant="outlined"
          disabled={Boolean(busy) || Boolean(pendingAttempt) || !outcome.trim()}
          onClick={() => mutate("complete")}
        >
          {busy === "complete" ? "Resolving…" : "Resolve"}
        </Button>
      </Stack>
      {pendingAttempt && !busy && (
        <Button onClick={() => void mutate(pendingAttempt.action, {}, true)}>
          Retry exact follow-up action
        </Button>
      )}
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
      {canManage &&
        !["resolved", "declined", "expired"].includes(request.state) && (
          <Button
            size="small"
            variant="outlined"
            disabled={Boolean(busy)}
            onClick={async () => {
              const signature = "resolve";
              const requestKey =
                attempts.current.get(signature) || crypto.randomUUID();
              attempts.current.set(signature, requestKey);
              setBusy("resolve");
              setError("");
              try {
                await api(
                  `/api/clinic/staff-messaging/requests/${request.id}/transition`,
                  {
                    method: "POST",
                    body: {
                      transition: {
                        state: "resolved",
                        resolution_code: "completed",
                        request_key: requestKey,
                        expected_updated_at: request.updated_at,
                      },
                    },
                  },
                );
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

function CallbackActions({
  request,
  onChanged,
}: {
  request: CallbackRequest;
  onChanged: () => void;
}) {
  const { capabilities } = useClinic();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const attempts = useRef(new Map<string, string>());
  if (!capabilities.appointments) return null;
  async function transition(status: "in_review" | "resolved" | "declined") {
    if (busy) return;
    if (status !== "in_review" && !note.trim()) {
      setError("Record the contact outcome before closing this request.");
      return;
    }
    const signature = JSON.stringify([status, note.trim()]);
    const key = attempts.current.get(signature) || crypto.randomUUID();
    attempts.current.set(signature, key);
    setBusy(true);
    setError("");
    try {
      const result = await api<{ callback_request: CallbackRequest }>(
        `/api/clinic/callback_requests/${request.id}/transition`,
        {
          method: "POST",
          body: {
            callback_request: {
              request_key: key,
              status,
              review_note: note.trim(),
            },
          },
        },
      );
      if (
        result.callback_request.id !== request.id ||
        result.callback_request.status !== status
      )
        throw new Error(
          "The callback update was not confirmed. Refresh before retrying.",
        );
      attempts.current.delete(signature);
      onChanged();
    } catch (reason) {
      const failure = mutationFailure(reason);
      if (!failure.outcomeUnknown) attempts.current.delete(signature);
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Stack spacing={1} sx={{ mt: 1.5 }}>
      <TextField
        size="small"
        label="Contact outcome"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        slotProps={{ htmlInput: { maxLength: 1000 } }}
      />
      <Stack direction="row" spacing={1}>
        {request.status === "pending" && (
          <Button disabled={busy} onClick={() => transition("in_review")}>
            Start callback
          </Button>
        )}
        <Button disabled={busy} onClick={() => transition("resolved")}>
          Record completion
        </Button>
        <Button disabled={busy} onClick={() => transition("declined")}>
          Unable to complete
        </Button>
      </Stack>
      <Typography variant="caption">
        An attempted call is not confirmed contact. Record the actual outcome.
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}

function InboxRow({
  item,
  work,
  onChanged,
  hideTaskClaim = false,
  taskController,
  followUpController,
}: {
  item: InboxItem;
  work?: FollowUpResponse;
  onChanged: (message?: string) => void;
  hideTaskClaim?: boolean;
  taskController?: PatientFlowTaskController;
  followUpController?: FollowUpController;
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
        gridTemplateColumns: "minmax(0, 1fr)",
        gap: { xs: 1.25, md: 2 },
        alignItems: "center",
      }}
    >
      <Box
        sx={{
          display: "none",
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
          direction="column"
          spacing={{ xs: 0.25, sm: 2 }}
          sx={{ mt: 0.5 }}
        >
          <Typography
            variant="body2"
            color={item.overdue ? "warning.main" : "text.secondary"}
          >
            {itemDateLabel(item)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Owner: {item.owner}
          </Typography>
        </Stack>
        <Stack
          direction="column"
          spacing={{ xs: 0.25, sm: 2 }}
          sx={{ mt: 0.5 }}
        >
          <Typography variant="body2" color="text.secondary">
            Next action: {item.nextAction}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Source: {item.sourceLabel.replaceAll("_", " ")}
          </Typography>
        </Stack>
        {item.callbackRequest && (
          <CallbackActions
            request={item.callbackRequest}
            onChanged={onChanged}
          />
        )}
        {item.mutation?.kind === "task" && work && (
          <TaskActions
            task={item.mutation.task}
            actorMembershipId={work.actor_membership_id}
            availableTasks={work.clinical_tasks}
            onChanged={onChanged}
            hideClaim={hideTaskClaim}
            controller={taskController}
          />
        )}
        {item.mutation?.kind === "follow_up" && work && (
          <EncounterFollowUpActions
            followUp={item.mutation.followUp}
            controller={followUpController}
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
            This item is source-managed. Use the source link to complete it; the
            inbox will not imply completion here.
          </Typography>
        )}
      </Box>
      <Button
        variant="outlined"
        sx={{
          gridColumn: "1",
          justifySelf: { xs: "start", md: "start" },
          mt: { xs: 0.5, md: 1 },
          minHeight: 44,
          whiteSpace: "nowrap",
        }}
        href={item.href}
      >
        {item.action}
      </Button>
    </Box>
  );
}

function PatientFlowCard({
  item,
  work,
  onChanged,
  taskController,
  followUpController,
}: {
  item: InboxItem;
  work?: FollowUpResponse;
  onChanged: (message?: string) => void;
  taskController?: PatientFlowTaskController;
  followUpController?: FollowUpController;
}) {
  const context = useClinic();
  const localController = useRef<PatientFlowTaskController | null>(null);
  if (!localController.current)
    localController.current = createPatientFlowTaskController();
  const sharedController = taskController ?? localController.current;
  const task = item.mutation?.kind === "task" ? item.mutation.task : undefined;
  const scheduleHref = patientFlowScheduleHref(task, context);
  return (
    <Card variant="outlined" sx={{ minWidth: 0 }}>
      <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Stack spacing={0.75} sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {item.patient || item.title}
          </Typography>
          {item.patient && (
            <Typography variant="body2">{item.title}</Typography>
          )}
          {item.overdue && (
            <Chip
              size="small"
              color="warning"
              label="Overdue"
              sx={{ alignSelf: "start" }}
            />
          )}
          <Typography variant="body2" color="text.secondary">
            {item.nextAction}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {itemDateLabel(item)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Owner: {item.owner}
          </Typography>
          <Button
            href={item.href}
            variant={scheduleHref ? "outlined" : "contained"}
            sx={{ alignSelf: "start", minHeight: 44 }}
          >
            {item.action}
          </Button>
        </Stack>
        {scheduleHref && (
          <Button
            href={scheduleHref}
            variant="contained"
            fullWidth
            sx={{ mt: 2, minHeight: 44 }}
          >
            Schedule first appointment
          </Button>
        )}
        {task && work && (
          <TaskActions
            task={task}
            actorMembershipId={work.actor_membership_id}
            availableTasks={work.clinical_tasks}
            onChanged={onChanged}
            claimOnly
            controller={sharedController}
          />
        )}
        <Box
          component="details"
          sx={{
            mt: 2,
            "& summary": { cursor: "pointer", color: "primary.main" },
          }}
        >
          <Typography component="summary" variant="body2">
            Actions and details
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Source: {item.sourceLabel.replaceAll("_", " ")}
          </Typography>
          {item.patientReference && (
            <Typography
              variant="body2"
              sx={{ mt: 1, overflowWrap: "anywhere" }}
            >
              Chart reference: {patientReferenceLabel(item.patientReference)}
            </Typography>
          )}
          <InboxRow
            item={item}
            work={work}
            onChanged={onChanged}
            hideTaskClaim
            taskController={sharedController}
            followUpController={followUpController}
          />
        </Box>
      </CardContent>
    </Card>
  );
}

function QueuePageControls({
  label,
  page,
  requestedPage,
  loading,
  error,
  onPage,
  onRetry,
}: {
  label: string;
  page?: InboxPage;
  requestedPage: number;
  loading: boolean;
  error?: string;
  onPage: (page: number) => void;
  onRetry: () => void;
}) {
  const currentPage = page?.page ?? requestedPage;
  return (
    <Stack
      direction="row"
      spacing={1}
      useFlexGap
      sx={{ alignItems: "center", flexWrap: "wrap" }}
    >
      <Typography variant="body2" role="status">
        {label}:{" "}
        {loading
          ? `Loading page ${requestedPage}…`
          : error
            ? `Page ${requestedPage} unavailable`
            : page
              ? `${page.total} source items · Page ${page.page} of ${inboxPageCount(page)}`
              : "Unavailable"}
      </Typography>
      <Button
        size="small"
        aria-label={`Previous ${label} page`}
        disabled={loading || currentPage <= 1}
        onClick={() => onPage(currentPage - 1)}
      >
        Previous
      </Button>
      <Button
        size="small"
        aria-label={`Next ${label} page`}
        disabled={
          loading ||
          Boolean(error) ||
          !page ||
          currentPage >= inboxPageCount(page)
        }
        onClick={() => onPage(currentPage + 1)}
      >
        Next
      </Button>
      {error && (
        <Button
          size="small"
          onClick={onRetry}
          aria-label={`Retry ${label} page`}
        >
          Retry page
        </Button>
      )}
    </Stack>
  );
}

export function WorkInbox() {
  const { capabilities, current_site, practice, user_id } = useClinic();
  const scope = JSON.stringify([
    practice.id,
    user_id,
    current_site?.id,
    capabilities,
  ]);
  return <ScopedWorkInbox key={scope} />;
}

function ScopedWorkInbox() {
  const { capabilities, current_site, practice, user_id } = useClinic();
  const { registerBlocker } = useClinicNavigation();
  // Scope survives filters/pages and card movement between columns, but remains
  // isolated by the existing practice/user/site/capability WorkInbox key.
  const taskControllers = useRef(new Map<number, PatientFlowTaskController>());
  const followUpControllers = useRef(new Map<number, FollowUpController>());
  const [, redrawTaskOutcomes] = useState(0);
  const taskController = (taskId: number) => {
    let controller = taskControllers.current.get(taskId);
    if (!controller) {
      controller = createPatientFlowTaskController(() =>
        redrawTaskOutcomes((value) => value + 1),
      );
      taskControllers.current.set(taskId, controller);
    }
    return controller;
  };
  const followUpController = (followUpId: number) => {
    let controller = followUpControllers.current.get(followUpId);
    if (!controller) {
      controller = createFollowUpController(() =>
        redrawTaskOutcomes((value) => value + 1),
      );
      followUpControllers.current.set(followUpId, controller);
    }
    return controller;
  };
  useEffect(() => {
    const warning = () =>
      [...taskControllers.current.values()].some(
        (controller) =>
          controller.inFlight.current || controller.unknownAttempt !== null,
      ) ||
      [...followUpControllers.current.values()].some(
        (controller) => controller.attempt !== null,
      )
        ? "A Patient Flow task or follow-up is pending or unconfirmed. Confirm its exact outcome before leaving."
        : null;
    const unregister = registerBlocker(warning, { preventNavigation: true });
    const beforeUnload = (event: BeforeUnloadEvent) => {
      const message = warning();
      if (!message) return;
      event.preventDefault();
      event.returnValue = message;
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [registerBlocker]);
  useDemoNavigationBlocker(() => {
    const blocked =
      [...taskControllers.current.values()].some(
        (controller) =>
          controller.inFlight.current || controller.unknownAttempt !== null,
      ) ||
      [...followUpControllers.current.values()].some(
        (controller) => controller.attempt !== null,
      );
    return {
      blocked,
      message: blocked
        ? "A Patient Flow task or follow-up is pending or unconfirmed. Confirm its exact outcome before leaving."
        : null,
    };
  });
  const canLoadWork =
    capabilities.billing_read === true ||
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
  const canLoadScheduledVisits =
    capabilities.patients === true && capabilities.appointments_read === true;
  const canLoadCallbacks = capabilities.appointments_read === true;
  const [callbacks, setCallbacks] = useState<
    SourceState<{ callback_requests: CallbackRequest[] }>
  >({ loading: canLoadCallbacks });
  const [assignment, setAssignment] = useState<AssignmentFilter>(() =>
    new URLSearchParams(window.location.search).get("assignment") ===
    "offboarded"
      ? "offboarded"
      : "all",
  );
  const [offboardedPage, setOffboardedPage] = useState(1);
  const [workType, setWorkType] = useState<WorkType>("all");
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [notice, setNotice] = useState("");
  const filterScope = `${assignment}:${workType}`;
  const [pageState, setPageState] = useState(() =>
    freshInboxPages(filterScope),
  );
  const pages =
    pageState.scope === filterScope ? pageState : freshInboxPages(filterScope);
  function changePage(
    queue: "staff" | "encounters" | "renewals" | "labReview" | "labFollowUp",
    page: number,
  ) {
    setPageState({ ...pages, [queue]: page });
  }
  const workParams = new URLSearchParams({
    filter: assignment,
    page: String(offboardedPage),
    staff_requests_page: String(pages.staff),
    encounter_follow_ups_page: String(pages.encounters),
    renewal_exceptions_page: String(pages.renewals),
  });
  if (current_site?.id) workParams.set("site_id", String(current_site.id));
  const work = usePagedInboxSource<FollowUpResponse>(
    `/api/clinic/operations/follow_ups?${workParams}`,
    canLoadWork,
    refreshRevision,
    filterScope,
  );
  const labReviews = usePagedInboxSource<LabReviewResponse>(
    `/api/clinic/lab_reports/review_queue?page=${pages.labReview}&per_page=50`,
    canLoadLabs,
    refreshRevision,
    filterScope,
  );
  const labFollowUps = usePagedInboxSource<LabFollowUpResponse>(
    `/api/clinic/lab_reports/follow_up_queue?page=${pages.labFollowUp}&per_page=50`,
    canLoadLabs,
    refreshRevision,
    filterScope,
  );
  const [refills, setRefills] = useState<SourceState<RefillResponse>>({
    loading: canLoadRefills,
  });
  const [exceptions, setExceptions] = useState<
    SourceState<WorkExceptionsResponse>
  >({ loading: canLoadExceptions });
  const [scheduledVisits, setScheduledVisits] = useState<
    SourceState<{ appointments: Appointment[]; has_more: boolean }>
  >({ loading: canLoadScheduledVisits });

  useClinicRealtimeTopic(
    "work_inbox",
    () => setRefreshRevision((value) => value + 1),
    {
      enabled:
        canLoadWork ||
        canLoadLabs ||
        canLoadRefills ||
        canLoadExceptions ||
        canLoadScheduledVisits ||
        canLoadCallbacks,
      fallbackIntervalMs: 15_000,
      freshnessIntervalMs: 60_000,
    },
  );

  useEffect(() => {
    if (!canLoadCallbacks) return;
    const abort = new AbortController();
    setCallbacks((current) => ({
      ...current,
      loading: true,
      error: undefined,
    }));
    api<{ callback_requests: CallbackRequest[] }>(
      "/api/clinic/callback_requests",
      { signal: abort.signal },
    )
      .then((data) => setCallbacks({ loading: false, data }))
      .catch((error: unknown) => {
        if (!abort.signal.aborted)
          setCallbacks({ loading: false, error: errorMessage(error) });
      });
    return () => abort.abort();
  }, [canLoadCallbacks, refreshRevision]);

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

  useEffect(() => {
    if (!canLoadScheduledVisits) return;
    const abort = new AbortController();
    setScheduledVisits((current) => ({
      ...current,
      loading: true,
      error: undefined,
    }));
    const params = new URLSearchParams({
      upcoming: "true",
      per_page: "100",
      page: "1",
    });
    if (current_site?.id) params.set("site_id", String(current_site.id));
    api<{
      appointments: Appointment[];
      pagination: Pagination;
    }>(`/api/clinic/appointments?${params}`, { signal: abort.signal })
      .then((response) => {
        if (!abort.signal.aborted)
          setScheduledVisits({
            loading: false,
            data: {
              appointments: response.appointments,
              has_more: response.pagination.total_pages > 1,
            },
          });
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted)
          setScheduledVisits({ loading: false, error: errorMessage(error) });
      });
    return () => abort.abort();
  }, [canLoadScheduledVisits, refreshRevision, current_site?.id]);

  const items = useMemo(() => {
    const next: InboxItem[] = [];
    if (assignment === "all") {
      callbacks.data?.callback_requests
        .filter((request) => ["pending", "in_review"].includes(request.status))
        .forEach((request) => {
          next.push({
            id: `callback-${request.id}`,
            type: "patient",
            title: "Callback requested",
            patient: request.patient.display_name,
            patientReference: request.patient.reference,
            detail: request.content,
            status: request.status,
            dueAt: request.requested_at,
            dateCaption: "Requested",
            overdue: false,
            owner: "Front desk team",
            nextAction: "Contact the patient and record the outcome",
            sourceLabel: "Patient callback request",
            href: `/clinic/patients/${request.patient.id}`,
            action: "Open patient",
            icon: "message",
            callbackRequest: request,
          });
        });
      work.data?.renewal_exceptions?.forEach((renewal) =>
        next.push({
          id: `renewal-${renewal.id}`,
          type: "billing",
          title: "Membership renewal needs attention",
          patient: renewal.patient_display_name,
          patientReference: renewal.patient_reference,
          detail: [
            renewal.amount_due
              ? `${renewal.currency} ${renewal.amount_due}`
              : "Amount not confirmed",
            renewal.assignment_exception,
          ]
            .filter(Boolean)
            .join(" · "),
          status: renewal.status,
          dueAt: renewal.updated_at,
          dateCaption: "Updated",
          overdue: false,
          owner: renewal.owner,
          nextAction: renewal.next_action,
          sourceLabel: "Membership renewal",
          href: renewal.href,
          action: "Open membership billing",
          icon: "payment",
        }),
      );
    }
    work.data?.clinical_tasks.forEach((task) => {
      const initialContactTask =
        task.task_kind === "patient_call" &&
        task.source_type === "manual" &&
        task.pool_code === "front_desk" &&
        task.encounter_id === null;
      next.push({
        id: `task-${task.id}`,
        type: taskType(task),
        title: taskTitle(task),
        patient: task.patient_display_name,
        patientReference: task.patient_reference,
        detail: [
          task.source_note || taskDetail(task),
          task.waiting_reason,
          task.assignment_exception,
        ]
          .filter(Boolean)
          .join(" "),
        status: task.state,
        dueAt: task.due_at,
        dateCaption: "Due",
        overdue: task.overdue,
        assignment: assignmentLabel(task),
        owner: task.assigned_to_membership_id
          ? assignmentLabel(task).replace(/^Assigned to /, "")
          : `${task.pool_code.replaceAll("_", " ")} team`,
        nextAction: taskNextAction(task),
        sourceLabel: task.source_label || "Clinical task",
        scheduleReady: initialContactTask && !task.has_recorded_appointment,
        patientFlowHidden:
          initialContactTask && Boolean(task.has_recorded_appointment),
        href: task.encounter_href || task.patient_href,
        action: taskAction(task),
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

    if (assignment === "all" || assignment === "overdue") {
      labFollowUps.data?.items.forEach((item) => {
        const dueAt = item.follow_up.due_at;
        const overdue = Boolean(dueAt && isBeforeBusinessTime(dueAt));
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
          nextAction:
            item.follow_up.instructions || "Complete the result follow-up",
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
          href: `/clinic/billing?invoice_id=${item.invoice_id}`,
          action: "Open invoice",
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
    callbacks.data,
    exceptions.data,
    labFollowUps.data,
    labReviews.data,
    refills.data,
    work.data,
    workType,
  ]);

  const anyLoading =
    assignment === "offboarded"
      ? work.loading
      : callbacks.loading ||
        work.loading ||
        labReviews.loading ||
        labFollowUps.loading ||
        refills.loading ||
        exceptions.loading ||
        scheduledVisits.loading;
  const exceptionSourceErrors = exceptions.data
    ? Object.entries(exceptions.data.sources)
        .filter(([, source]) => Boolean(source.error))
        .map(([name]) =>
          name === "unsigned_notes" ? "Unsigned notes" : "Payment exceptions",
        )
    : [];
  const sourceErrors = (
    assignment === "offboarded"
      ? [work.error && "Assigned work"]
      : [
          callbacks.error && "Callback requests",
          work.error && "Assigned work",
          labReviews.error && "Lab review",
          labFollowUps.error && "Lab follow-up",
          refills.error && "Refill requests",
          exceptions.error && "Documentation and payment exceptions",
          scheduledVisits.error && "Scheduled visits",
          ...exceptionSourceErrors,
        ]
  ).filter(Boolean);
  const sourceFeeds = [
    { label: "Assigned work", enabled: canLoadWork, state: work },
    ...(assignment === "offboarded"
      ? []
      : [
          {
            label: "Callback requests",
            enabled: canLoadCallbacks,
            state: callbacks,
          },
          { label: "Lab review", enabled: canLoadLabs, state: labReviews },
          { label: "Lab follow-up", enabled: canLoadLabs, state: labFollowUps },
          { label: "Refill requests", enabled: canLoadRefills, state: refills },
          {
            label: "Documentation and payment exceptions",
            enabled: canLoadExceptions,
            state: exceptions,
          },
          {
            label: "Scheduled visits",
            enabled: canLoadScheduledVisits,
            state: scheduledVisits,
          },
        ]),
  ].filter((source) => source.enabled);
  const queuesTruncated =
    (assignment !== "offboarded" &&
      work.data &&
      work.data.clinical_task_summary[
        assignment === "all" ? "open" : assignment
      ] > work.data.clinical_tasks.length) ||
    (assignment === "all" &&
      (exceptions.data?.sources.unsigned_notes.truncated === true ||
        exceptions.data?.sources.payment_exceptions.truncated === true));
  const hasAnyAccess =
    canLoadCallbacks ||
    canLoadWork ||
    canLoadLabs ||
    canLoadRefills ||
    canLoadExceptions ||
    canLoadScheduledVisits;
  const hasOtherSourcePages = Boolean(
    (work.data &&
      (work.data.staff_requests_page.total > work.data.requests.length ||
        work.data.encounter_follow_ups_page.total >
          work.data.encounter_follow_ups.length ||
        work.data.renewal_exceptions_page.total >
          (work.data.renewal_exceptions?.length ?? 0) ||
        (assignment === "offboarded" &&
          work.data.offboarded_tasks_page.total >
            work.data.clinical_tasks.length))) ||
    (assignment === "all" &&
      labReviews.data &&
      labReviews.data.pagination.total > labReviews.data.items.length) ||
    ((assignment === "all" || assignment === "overdue") &&
      labFollowUps.data &&
      labFollowUps.data.pagination.total > labFollowUps.data.items.length),
  );

  const flowItems = useMemo(
    () =>
      items
        .filter((item) => !item.patientFlowHidden)
        .reduce<Record<PatientFlowColumn, InboxItem[]>>(
          (columns, item) => {
            columns[patientFlowColumn(item)].push(item);
            return columns;
          },
          { new: [], active: [], scheduling: [] },
        ),
    [items],
  );
  const patientFlowItemCount = patientFlowColumns.reduce(
    (count, column) => count + flowItems[column.id].length,
    0,
  );
  const scheduledAppointmentCount =
    scheduledVisits.data?.appointments.filter(
      (visit) =>
        !visit.encounter_id &&
        ["scheduled", "confirmed"].includes(visit.status),
    ).length ?? 0;

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
      {notice && <Alert severity="success">{notice}</Alert>}
      {[...taskControllers.current.values()].some(
        (controller) => controller.unknownAttempt,
      ) ||
      [...followUpControllers.current.values()].some(
        (controller) => controller.attempt && !controller.busy,
      ) ? (
        <Paper
          component="section"
          variant="outlined"
          sx={{ p: 2 }}
          aria-label="Unconfirmed inbox actions"
        >
          <Typography component="h2" variant="h6">
            Confirm unresolved work
          </Typography>
          <Typography variant="body2">
            These exact actions remain available even when a refreshed queue or
            filter no longer shows their rows.
          </Typography>
          {[...taskControllers.current.entries()].map(([id, controller]) => {
            const pending = controller.unknownAttempt;
            return pending ? (
              <Box key={`task-${id}`} sx={{ mt: 2 }}>
                <Typography>
                  {pending.task.patient_display_name} —{" "}
                  {taskTitle(pending.task)}
                </Typography>
                <TaskActions
                  task={pending.task}
                  actorMembershipId={pending.actorMembershipId}
                  availableTasks={work.data?.clinical_tasks ?? []}
                  controller={controller}
                  onChanged={(message) => {
                    setNotice(message ?? "");
                    setRefreshRevision((value) => value + 1);
                  }}
                />
              </Box>
            ) : null;
          })}
          {[...followUpControllers.current.entries()].map(
            ([id, controller]) => {
              const pending = controller.attempt;
              return pending && !controller.busy ? (
                <Box key={`follow-up-${id}`} sx={{ mt: 2 }}>
                  <Typography>
                    {pending.followUp.patient_display_name} — Encounter
                    follow-up
                  </Typography>
                  <EncounterFollowUpActions
                    followUp={pending.followUp}
                    actorMembershipId={pending.actorMembershipId}
                    controller={controller}
                    onChanged={() => setRefreshRevision((value) => value + 1)}
                  />
                </Box>
              ) : null;
            },
          )}
        </Paper>
      ) : null}
      <Box>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}
        >
          <Box>
            <Typography component="h1" variant="h1">
              Patient Flow
            </Typography>
            <Typography
              color="text.secondary"
              sx={{ mt: 0.5, maxWidth: "72ch" }}
            >
              Review open work, assign an owner and choose the next action.
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
      {scheduledVisits.data?.has_more && (
        <Alert severity="info" role="status">
          Appointment summary limited to 100 records. Open Schedule for all
          dates.
        </Alert>
      )}

      {sourceErrors.length > 0 && (
        <Alert
          severity="warning"
          action={
            <Button
              color="inherit"
              disabled={anyLoading}
              onClick={() => setRefreshRevision((value) => value + 1)}
            >
              Retry source reads
            </Button>
          }
        >
          Unavailable sources: {sourceErrors.join("; ")}. Their current workload
          is unknown. Loaded rows remain visible; Patient Flow coverage is
          incomplete.
        </Alert>
      )}
      {queuesTruncated && (
        <Alert severity="info">
          Some additional clinical tasks or exception sources have a limited
          inbox preview. Open the linked workspaces or dedicated Operations
          queues to continue the full list.
        </Alert>
      )}

      <Box component="details">
        <Typography
          component="summary"
          variant="body2"
          sx={{ cursor: "pointer" }}
        >
          Source feeds
        </Typography>
        <Stack spacing={0.5} sx={{ mt: 1 }}>
          {sourceFeeds.map(({ label, state }) => (
            <Typography key={label} variant="body2" color="text.secondary">
              {label}:{" "}
              {state.loading
                ? "Updating; current coverage pending"
                : state.error || !state.data
                  ? "Unavailable; current workload unknown"
                  : label === "Documentation and payment exceptions" &&
                      exceptionSourceErrors.length > 0
                    ? "Partially loaded; unavailable workload unknown"
                    : "Loaded accessible queues; limits and filters apply"}
            </Typography>
          ))}
        </Stack>
      </Box>
      <Box
        sx={{
          minWidth: 0,
        }}
      >
        <Tabs
          value={assignment}
          onChange={(_, value: AssignmentFilter) => {
            setAssignment(value);
            setOffboardedPage(1);
            setPageState(freshInboxPages(`${value}:${workType}`));
            const url = new URL(window.location.href);
            if (value === "offboarded")
              url.searchParams.set("assignment", value);
            else url.searchParams.delete("assignment");
            window.history.replaceState(window.history.state, "", url);
          }}
          aria-label="Work assignment filters"
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            px: 0,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Tab value="all" label="All open" />
          <Tab value="mine" label="Mine" />
          <Tab value="overdue" label="Overdue" />
          <Tab value="offboarded" label="Revoked owner work" />
        </Tabs>
        <Box sx={{ pt: 2 }}>
          {assignment === "offboarded" && work.data && (
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: "center", mb: 2 }}
            >
              <Typography variant="body2" aria-live="polite">
                {work.data.offboarded_tasks_page.total} active tasks assigned to
                revoked accounts
                {work.data.offboarded_tasks_page.total_pages > 1 &&
                  ` · Page ${work.data.offboarded_tasks_page.page} of ${work.data.offboarded_tasks_page.total_pages}`}
              </Typography>
              {work.data.offboarded_tasks_page.total_pages > 1 && (
                <>
                  <Button
                    disabled={
                      work.loading || work.data.offboarded_tasks_page.page <= 1
                    }
                    onClick={() =>
                      setOffboardedPage(
                        work.data!.offboarded_tasks_page.page - 1,
                      )
                    }
                  >
                    Previous
                  </Button>
                  <Button
                    disabled={
                      work.data.offboarded_tasks_page.page >=
                      work.data.offboarded_tasks_page.total_pages
                    }
                    onClick={() =>
                      setOffboardedPage(
                        work.data!.offboarded_tasks_page.page + 1,
                      )
                    }
                  >
                    Next
                  </Button>
                </>
              )}
            </Stack>
          )}
          {assignment !== "offboarded" && hasOtherSourcePages && (
            <Accordion
              disableGutters
              elevation={0}
              sx={{
                mb: 2,
                bgcolor: "transparent",
                boxShadow: "none",
                "&::before": { display: "none" },
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{
                  px: 0,
                  minHeight: 44,
                  "&.Mui-expanded": { minHeight: 44 },
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  More queue pages
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 0, pt: 0, pb: 1 }}>
                <Stack spacing={1} sx={{ pt: 1 }}>
                  {canLoadWork && (
                    <>
                      <QueuePageControls
                        label="Staff requests"
                        page={work.data?.staff_requests_page}
                        requestedPage={pages.staff}
                        loading={work.loading}
                        error={work.error}
                        onPage={(page) => changePage("staff", page)}
                        onRetry={() =>
                          setRefreshRevision((value) => value + 1)
                        }
                      />
                      <QueuePageControls
                        label="Encounter follow-ups"
                        page={work.data?.encounter_follow_ups_page}
                        requestedPage={pages.encounters}
                        loading={work.loading}
                        error={work.error}
                        onPage={(page) => changePage("encounters", page)}
                        onRetry={() =>
                          setRefreshRevision((value) => value + 1)
                        }
                      />
                      {assignment === "all" && !current_site && (
                        <QueuePageControls
                          label="Renewal exceptions"
                          page={work.data?.renewal_exceptions_page}
                          requestedPage={pages.renewals}
                          loading={work.loading}
                          error={work.error}
                          onPage={(page) => changePage("renewals", page)}
                          onRetry={() =>
                            setRefreshRevision((value) => value + 1)
                          }
                        />
                      )}
                    </>
                  )}
                  {canLoadLabs && assignment === "all" && (
                    <QueuePageControls
                      label="Lab review"
                      page={labReviews.data?.pagination}
                      requestedPage={pages.labReview}
                      loading={labReviews.loading}
                      error={labReviews.error}
                      onPage={(page) => changePage("labReview", page)}
                      onRetry={() => setRefreshRevision((value) => value + 1)}
                    />
                  )}
                  {canLoadLabs &&
                    (assignment === "all" || assignment === "overdue") && (
                      <QueuePageControls
                        label="Lab follow-up"
                        page={labFollowUps.data?.pagination}
                        requestedPage={pages.labFollowUp}
                        loading={labFollowUps.loading}
                        error={labFollowUps.error}
                        onPage={(page) => changePage("labFollowUp", page)}
                        onRetry={() =>
                          setRefreshRevision((value) => value + 1)
                        }
                      />
                    )}
                </Stack>
              </AccordionDetails>
            </Accordion>
          )}
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
                : `${patientFlowItemCount} triage ${patientFlowItemCount === 1 ? "item" : "items"} shown`}
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
                onChange={(event) => {
                  const value = event.target.value as WorkType;
                  setWorkType(value);
                  setOffboardedPage(1);
                  setPageState(freshInboxPages(`${assignment}:${value}`));
                }}
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
          {!anyLoading &&
            patientFlowItemCount === 0 &&
            sourceErrors.length === 0 && (
              <ClinicEmptyState
                title={
                  hasOtherSourcePages
                    ? "No matching work on the loaded pages"
                    : "No matching work"
                }
                description={
                  hasOtherSourcePages
                    ? "Filters apply to the loaded pages. Open More queue pages to check the remaining work."
                    : "Try another scope or work type. New authorized work will appear here when it is created."
                }
              />
            )}
          {!anyLoading &&
            patientFlowItemCount === 0 &&
            sourceErrors.length > 0 && (
              <ClinicEmptyState
                title="No work is available from the loaded queues"
                description="Retry the unavailable sources before treating this view as clear."
              />
            )}
          {canLoadScheduledVisits && (
            <Accordion
              disableGutters
              elevation={0}
              sx={{
                mb: 2,
                bgcolor: "transparent",
                boxShadow: "none",
                "&::before": { display: "none" },
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{
                  px: 0,
                  minHeight: 44,
                  "&.Mui-expanded": { minHeight: 44 },
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Upcoming appointment summary
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 0, pt: 0, pb: 1 }}>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1.5}
                  sx={{
                    alignItems: { sm: "center" },
                    justifyContent: "space-between",
                    pt: 1,
                  }}
                >
                  <Box>
                    <Typography
                      id="patient-flow-scheduled-summary"
                      component="h2"
                      variant="h4"
                    >
                      Upcoming appointments
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {scheduledVisits.loading && !scheduledVisits.data
                        ? "Loading appointment summary."
                        : scheduledVisits.error
                          ? "Appointment summary unavailable. Refresh or open Schedule to review appointments."
                          : `${scheduledAppointmentCount} scheduled or confirmed appointments without an encounter among the first 100 upcoming records. This summary is independent of Patient Flow assignment and work type filters.`}
                    </Typography>
                  </Box>
                  <Button
                    href="/clinic/schedule"
                    variant="outlined"
                    sx={{ flexShrink: 0 }}
                  >
                    Open Schedule
                  </Button>
                </Stack>
              </AccordionDetails>
            </Accordion>
          )}
          {patientFlowItemCount > 0 && (
            <Box
              aria-label="Patient Flow board"
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "minmax(0, 1fr)",
                  md: "repeat(2, minmax(0, 1fr))",
                  xl: "repeat(3, minmax(0, 1fr))",
                },
                gap: 2,
                alignItems: "start",
              }}
            >
              {patientFlowColumns.map((column) => (
                <Box
                  key={column.id}
                  component="section"
                  aria-labelledby={`patient-flow-${column.id}`}
                  sx={{
                    p: 0,
                    display: "flex",
                    flexDirection: "column",
                    minWidth: 0,
                    minHeight: 0,
                    height: {
                      xs: "min(46dvh, 24rem)",
                      md: "min(62dvh, 38rem)",
                    },
                  }}
                >
                  <Stack spacing={1.25} sx={{ minHeight: 0, flex: 1 }}>
                    <Box sx={{ flex: "0 0 auto" }}>
                      <Stack
                        direction="row"
                        sx={{
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 1,
                        }}
                      >
                        <Typography
                          id={`patient-flow-${column.id}`}
                          component="h2"
                          variant="subtitle1"
                          sx={{ fontWeight: 750 }}
                        >
                          {column.title}
                        </Typography>
                        <Chip
                          size="small"
                          label={flowItems[column.id].length}
                        />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {column.description}
                      </Typography>
                    </Box>
                    <Box
                      role="region"
                      aria-label={`${column.title} patient flow items`}
                      tabIndex={0}
                      sx={{
                        flex: "1 1 auto",
                        minHeight: 0,
                        overflowY: "auto",
                        overflowX: "hidden",
                        overscrollBehaviorY: "auto",
                        scrollbarGutter: "stable",
                        "&:focus-visible": {
                          outline: "2px solid",
                          outlineColor: "primary.main",
                          outlineOffset: -2,
                        },
                      }}
                    >
                      {flowItems[column.id].length === 0 ? (
                        <ClinicEmptyState
                          title="No patients in this stage"
                          compact
                        />
                      ) : (
                        <Stack spacing={1.25}>
                          {flowItems[column.id].map((item) => (
                            <PatientFlowCard
                              key={item.id}
                              item={item}
                              work={work.data}
                              taskController={
                                item.mutation?.kind === "task"
                                  ? taskController(item.mutation.task.id)
                                  : undefined
                              }
                              followUpController={
                                item.mutation?.kind === "follow_up"
                                  ? followUpController(
                                      item.mutation.followUp.id,
                                    )
                                  : undefined
                              }
                              onChanged={(message) => {
                                setNotice(message ?? "");
                                setRefreshRevision((value) => value + 1);
                              }}
                            />
                          ))}
                        </Stack>
                      )}
                    </Box>
                  </Stack>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>
      <PrescriptionReconciliationWorklist
        practiceId={practice.id}
        actorId={user_id}
        siteId={current_site?.id ?? null}
        enabled={
          capabilities.patients === true &&
          capabilities.clinical_records_read === true
        }
      />
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
