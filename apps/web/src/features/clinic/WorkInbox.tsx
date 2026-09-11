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
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
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
};

type EncounterFollowUpItem = EncounterFollowUpRecord & {
  patient_display_name: string;
  patient_reference: string;
  assigned_to_me: boolean;
  assignee_label: string | null;
  overdue: boolean;
};

type ClinicalTaskItem = ClinicalTask & {
  patient_display_name: string;
  patient_reference: string;
  assigned_to_me: boolean;
  assignee_label: string | null;
  overdue: boolean;
  encounter_href: string | null;
};

type FollowUpResponse = {
  summary: Summary;
  requests: StaffRequest[];
  encounter_summary: Summary;
  encounter_follow_ups: EncounterFollowUpItem[];
  clinical_task_summary: Summary;
  clinical_tasks: ClinicalTaskItem[];
  reminder_attention_count: number | null;
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
};

type WorkExceptionsResponse = {
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
    owner: null;
    due_at: null;
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
    owner: null;
    due_at: null;
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
}) {
  if (item.assigned_to_me) return "Assigned to you";
  if (item.assignee_label) return `Assigned to ${item.assignee_label}`;
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

function InboxRow({ item }: { item: InboxItem }) {
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
          {item.priority && item.priority !== "routine" && (
            <Chip
              size="small"
              color={item.priority === "critical" ? "error" : "warning"}
              label={`${item.priority} result`}
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
          {item.assignment && (
            <Typography variant="body2" color="text.secondary">
              {item.assignment}
            </Typography>
          )}
        </Stack>
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
        href: task.encounter_href,
        action: "Open work item",
        icon: "assignment",
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
        href: `/clinic/patients/${followUp.patient_id}/encounters/${followUp.encounter_id}`,
        action: "Open encounter",
        icon: "assignment",
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
        href: `/clinic/messages?conversation_id=${request.conversation_id}`,
        action: "Open conversation",
        icon: "message",
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
            href: "/clinic/refills",
            action: "Review refill",
            icon: "assignment",
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
          href: `/clinic/patients/${item.patient.id}/encounters/${item.clinical_encounter_id}`,
          action: "Open encounter",
          icon: "note",
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
          href: item.patient
            ? `/clinic/billing/patients?patient_id=${item.patient.id}`
            : "/clinic/billing",
          action: "Open billing",
          icon: "payment",
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
  const sourceErrors = [
    work.error && "Assigned work",
    labReviews.error && "Lab review",
    labFollowUps.error && "Lab follow-up",
    refills.error && "Refill requests",
    exceptions.error && "Documentation and payment exceptions",
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
          {sourceErrors.join(" and ")}{" "}
          {sourceErrors.length === 1 ? "is" : "are"} unavailable. The inbox
          below may be incomplete.
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
                <InboxRow key={item.id} item={item} />
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
