import { useResource, Form } from "../../shared/ui";
import { api } from "../../api/client";
import { businessNow } from "../../shared/businessDate";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useClinic } from "./Workspace";
import { clinicDateValue } from "./frontDeskModel";
import type { Appointment, PatientReminder } from "../../api/contracts";
import { AppointmentReminderBatch } from "./AppointmentReminderBatch";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import SmsOutlinedIcon from "@mui/icons-material/SmsOutlined";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";

type Pagination = {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
};
type ReminderResponse = {
  reminders: PatientReminder[];
  pagination: Pagination;
};
type AppointmentResponse = {
  appointments: Appointment[];
  pagination: Pagination;
};
type StaffConversation = {
  id: number;
  title: string | null;
  kind: string;
  status: string;
  participants: { id: number; email: string; active: boolean }[];
};
type StaffConversationPagination = {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
};
type StaffConversationResponse = {
  conversations: StaffConversation[];
  pagination: StaffConversationPagination;
};

const HANDOFF_REASON_LABELS: Record<string, string> = {
  delivery_failed: "Delivery failed",
  delivery_unknown: "Delivery outcome uncertain",
  retry_exhausted: "Retry limit reached",
  request_help: "Help requested",
  request_reschedule: "Reschedule requested",
};

function StaffHandoffControl({
  reminder,
  conversations,
  currentMembershipId,
  onSuccess,
}: {
  reminder: PatientReminder;
  conversations: StaffConversation[];
  currentMembershipId: number;
  onSuccess: () => void;
}) {
  const activeConversations = conversations.filter(
    (conversation) => conversation.status === "active",
  );
  const [conversationId, setConversationId] = useState("");
  const selectedConversation = activeConversations.find(
    (conversation) => String(conversation.id) === conversationId,
  );
  const activeParticipants =
    selectedConversation?.participants.filter(
      (participant) => participant.active,
    ) || [];
  const [assigneeId, setAssigneeId] = useState("");

  useEffect(() => {
    if (conversationId && !selectedConversation) {
      setConversationId("");
      setAssigneeId("");
    }
  }, [conversationId, selectedConversation]);

  useEffect(() => {
    if (
      assigneeId &&
      !activeParticipants.some(
        (participant) => String(participant.id) === assigneeId,
      )
    ) {
      setAssigneeId("");
    }
  }, [activeParticipants, assigneeId]);

  if (!reminder.staff_handoff.eligible) return null;

  if (activeConversations.length === 0) {
    return (
      <Alert severity="info" sx={{ mt: 1.5 }}>
        Join an active staff conversation before creating this follow-up.
      </Alert>
    );
  }

  return (
    <Box sx={{ mt: 1.5, pt: 1.5, borderTop: "1px solid #e7eeeb" }}>
      <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
        {HANDOFF_REASON_LABELS[reminder.staff_handoff.reason_code || ""] ||
          "Staff follow-up available"}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Creates one redacted, assigned request in the selected staff
        conversation. Reminder details stay in this worklist.
      </Typography>
      <Form
        endpoint={`/api/clinic/reminders/${reminder.id}/staff_handoff`}
        submit="Create staff follow-up"
        onSuccess={onSuccess}
        transform={(values) => {
          const handoff = values.handoff as Record<string, unknown>;
          return {
            ...values,
            handoff: {
              ...handoff,
              due_at: new Date(String(handoff.due_at)).toISOString(),
            },
          };
        }}
      >
        {reminder.staff_handoff.source_type === "action" && (
          <input
            type="hidden"
            name="handoff[action_id]"
            value={reminder.staff_handoff.source_id || ""}
          />
        )}
        <TextField
          select
          required
          fullWidth
          size="small"
          name="handoff[conversation_id]"
          label="Staff conversation"
          value={conversationId}
          onChange={(event) => setConversationId(event.target.value)}
        >
          <MenuItem disabled value="">
            Choose a conversation
          </MenuItem>
          {activeConversations.map((conversation) => (
            <MenuItem key={conversation.id} value={String(conversation.id)}>
              {conversation.title ||
                `${conversation.kind.replaceAll("_", " ")} conversation #${conversation.id}`}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          required
          fullWidth
          size="small"
          name="handoff[assignee_membership_id]"
          label="Assigned staff member"
          value={assigneeId}
          disabled={!selectedConversation}
          onChange={(event) => setAssigneeId(event.target.value)}
        >
          <MenuItem disabled value="">
            Choose an assignee
          </MenuItem>
          {activeParticipants.map((participant) => (
            <MenuItem key={participant.id} value={String(participant.id)}>
              {participant.email}
              {participant.id === currentMembershipId ? " (you)" : ""}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          required
          fullWidth
          size="small"
          type="datetime-local"
          name="handoff[due_at]"
          label="Response due"
          slotProps={{ inputLabel: { shrink: true } }}
          helperText="Choose a future time within 30 days."
        />
      </Form>
    </Box>
  );
}

function PersistedStaffHandoff({
  reminder,
  currentMembershipId,
}: {
  reminder: PatientReminder;
  currentMembershipId: number;
}) {
  const request = reminder.staff_handoff.request;
  if (!request) return null;
  const assignedToCurrentMember =
    request.assignee_membership_id === currentMembershipId;
  const requiresNewFollowUp = ["declined", "expired"].includes(request.state);

  return (
    <Stack sx={{ mt: 1.5, gap: 1, alignItems: "flex-start" }}>
      <Stack
        direction="row"
        sx={{ gap: 1, alignItems: "center", flexWrap: "wrap" }}
      >
        <Chip
          size="small"
          variant="outlined"
          label={`Staff follow-up: ${request.state.replaceAll("_", " ")}`}
          color={requiresNewFollowUp ? "warning" : "default"}
        />
        <Typography variant="caption" color="text.secondary">
          {assignedToCurrentMember
            ? "Assigned to you"
            : request.assignee_membership_id
              ? `Assigned staff membership #${request.assignee_membership_id}`
              : "Unassigned"}
          {request.due_at ? ` · Due ${dateTimeLabel(request.due_at)}` : ""}
        </Typography>
      </Stack>
      {requiresNewFollowUp && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" href="/clinic/messages">
              Open staff messages
            </Button>
          }
        >
          This staff request ended without a recorded resolution. It remains in
          this worklist for clinic review.
        </Alert>
      )}
    </Stack>
  );
}

function ReminderRows({
  reminders,
  canRetry,
  conversations,
  currentMembershipId,
  attentionQueue = false,
  onRefresh,
}: {
  reminders: PatientReminder[];
  canRetry: boolean;
  conversations?: StaffConversation[];
  currentMembershipId: number;
  attentionQueue?: boolean;
  onRefresh: () => void;
}) {
  return (
    <Stack spacing={1.5}>
      {reminders.map((reminder) => (
        <Box key={reminder.id} sx={{ borderTop: "1px solid #e7eeeb", pt: 1.5 }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            sx={{
              gap: 1,
              justifyContent: { xs: "flex-start", sm: "space-between" },
            }}
          >
            <Box>
              <Typography sx={{ fontWeight: 700 }}>
                {reminder.patient.display_name} ·{" "}
                {reminder.category.replaceAll("_", " ")}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {reminder.local_schedule_label} ·{" "}
                {reminder.endpoint.masked_value}
              </Typography>
            </Box>
            <Chip
              size="small"
              label={reminder.status.replaceAll("_", " ")}
              color={
                reminder.status === "delivered"
                  ? "success"
                  : reminder.status === "failed"
                    ? "error"
                    : "default"
              }
            />
          </Stack>
          {canRetry && reminder.status === "failed" && (
            <Form
              endpoint={`/api/clinic/reminders/${reminder.id}/retry`}
              submit="Retry with policy check"
              retryKey
              className="pharmacy-form-grid"
              onSuccess={onRefresh}
            />
          )}
          <PersistedStaffHandoff
            reminder={reminder}
            currentMembershipId={currentMembershipId}
          />
          {attentionQueue && !reminder.staff_handoff.eligible && (
            <Alert severity="info" sx={{ mt: 1.5 }}>
              Staff follow-up details are outside your current conversation
              membership. Review this reminder with a staff messaging member.
            </Alert>
          )}
          {conversations && !reminder.staff_handoff.request && (
            <StaffHandoffControl
              reminder={reminder}
              conversations={conversations}
              currentMembershipId={currentMembershipId}
              onSuccess={onRefresh}
            />
          )}
        </Box>
      ))}
    </Stack>
  );
}

function HandoffEnabledReminderRows({
  reminders,
  canRetry,
  canCreateHandoff,
  currentMembershipId,
  onRefresh,
}: {
  reminders: PatientReminder[];
  canRetry: boolean;
  canCreateHandoff: boolean;
  currentMembershipId: number;
  onRefresh: () => void;
}) {
  if (!canCreateHandoff) {
    return (
      <>
        <Alert severity="info" sx={{ mb: 2 }}>
          You can review reminder exceptions. Creating a staff follow-up also
          requires reminder and staff messaging access.
        </Alert>
        <ReminderRows
          reminders={reminders}
          canRetry={canRetry}
          currentMembershipId={currentMembershipId}
          attentionQueue
          onRefresh={onRefresh}
        />
      </>
    );
  }

  return (
    <ConversationBackedReminderRows
      reminders={reminders}
      canRetry={canRetry}
      currentMembershipId={currentMembershipId}
      onRefresh={onRefresh}
    />
  );
}

function ConversationBackedReminderRows({
  reminders,
  canRetry,
  currentMembershipId,
  onRefresh,
}: {
  reminders: PatientReminder[];
  canRetry: boolean;
  currentMembershipId: number;
  onRefresh: () => void;
}) {
  const [conversationPage, setConversationPage] = useState(1);
  const conversations = useResource<StaffConversationResponse>(
    `/api/clinic/staff-messaging/conversations?per_page=100&page=${conversationPage}`,
  );
  if (!conversations.data && !conversations.error) {
    return (
      <>
        <Typography color="text.secondary" role="status" sx={{ mb: 2 }}>
          Loading staff conversations…
        </Typography>
        <ReminderRows
          reminders={reminders}
          canRetry={canRetry}
          currentMembershipId={currentMembershipId}
          attentionQueue
          onRefresh={onRefresh}
        />
      </>
    );
  }
  return (
    <>
      {conversations.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Staff conversations are unavailable. You can still review these
          reminder exceptions. {conversations.error}
        </Alert>
      )}
      {conversations.data && conversations.data.pagination.total_pages > 1 && (
        <Stack
          direction="row"
          spacing={1}
          sx={{ mb: 2, alignItems: "center" }}
          aria-label="Staff conversation pages"
        >
          <Button
            size="small"
            variant="outlined"
            disabled={conversationPage <= 1}
            onClick={() => setConversationPage((page) => page - 1)}
          >
            Previous conversations
          </Button>
          <Typography variant="body2" color="text.secondary">
            Page {conversations.data.pagination.page} of{" "}
            {conversations.data.pagination.total_pages}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            disabled={
              conversationPage >= conversations.data.pagination.total_pages
            }
            onClick={() => setConversationPage((page) => page + 1)}
          >
            More conversations
          </Button>
        </Stack>
      )}
      <ReminderRows
        reminders={reminders}
        canRetry={canRetry}
        conversations={conversations.data?.conversations}
        currentMembershipId={currentMembershipId}
        attentionQueue
        onRefresh={onRefresh}
      />
    </>
  );
}

function phoneLabel(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function appointmentLabel(appointment: Appointment, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(new Date(appointment.starts_at));
}

function dateTimeLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function reminderStatus(status: string) {
  const labels: Record<string, string> = {
    provider_accepted: "Accepted by provider",
    delivery_unknown: "Outcome needs review",
    failed: "Delivery failed",
    delivered: "Delivered",
    queued: "Queued",
    scheduled: "Scheduled",
    suppressed: "Not sent",
  };
  return labels[status] || status.replaceAll("_", " ");
}

function deliveryAttemptStatus(status: string) {
  const labels: Record<string, string> = {
    queued: "Queued",
    accepted: "Accepted by provider",
    delivered: "Delivered",
    failed: "Failed",
    gated: "Held by policy",
    unknown: "Outcome unknown",
    suppressed: "Suppressed",
    cancelled: "Cancelled",
  };
  return labels[status] || status.replaceAll("_", " ");
}

function deliveryAttemptColor(status: string) {
  if (status === "delivered") return "success" as const;
  if (status === "failed") return "error" as const;
  if (status === "unknown") return "warning" as const;
  return "default" as const;
}

function deliveryAttemptTime(label: string, value: string | null) {
  return `${label}: ${value ? dateTimeLabel(value) : "Not recorded"}`;
}

function DeliveryAttemptHistory({ reminder }: { reminder: PatientReminder }) {
  const attempts = reminder.delivery_attempts || [];
  if (attempts.length === 0) {
    return (
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mt: 1 }}
      >
        No delivery attempts recorded · {reminder.endpoint.masked_value}
      </Typography>
    );
  }

  return (
    <Accordion
      disableGutters
      elevation={0}
      variant="outlined"
      sx={{ mt: 1.5, maxWidth: "72ch", "&:before": { display: "none" } }}
    >
      <AccordionSummary expandIcon={<ExpandMoreOutlinedIcon />}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          Delivery attempts ({attempts.length})
        </Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>
        <Stack divider={<Divider flexItem />}>
          {attempts.map((attempt) => {
            const times = [
              deliveryAttemptTime("Queued", attempt.queued_at),
              deliveryAttemptTime("Accepted", attempt.accepted_at),
              deliveryAttemptTime("Completed", attempt.completed_at),
            ];
            return (
              <Box key={attempt.attempt_number} sx={{ py: 1.5 }}>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  sx={{
                    justifyContent: "space-between",
                    alignItems: { sm: "center" },
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    Attempt {attempt.attempt_number}
                  </Typography>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={deliveryAttemptStatus(attempt.status)}
                    color={deliveryAttemptColor(attempt.status)}
                  />
                </Stack>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.75 }}
                >
                  Provider:{" "}
                  {attempt.provider
                    ? attempt.provider.replaceAll("_", " ")
                    : "Not recorded"}{" "}
                  · Destination:{" "}
                  {attempt.masked_destination || reminder.endpoint.masked_value}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {times.join(" · ")}
                </Typography>
                {attempt.status === "accepted" && (
                  <Typography variant="body2" color="text.secondary">
                    Accepted by the provider; delivery is not confirmed.
                  </Typography>
                )}
                {attempt.status === "unknown" && (
                  <Typography variant="body2" color="text.secondary">
                    No confirmed delivery outcome is recorded.
                  </Typography>
                )}
                <Typography variant="body2" color="text.secondary">
                  Failure classification:{" "}
                  {attempt.failure_class
                    ? attempt.failure_class.replaceAll("_", " ")
                    : "None recorded"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Retryable: {attempt.retryable ? "Yes" : "No"}
                </Typography>
              </Box>
            );
          })}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}

function NeedsAttention({ query }: { query: string }) {
  const { capabilities, membership_id } = useClinic();
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({
    attention: "true",
    per_page: "25",
    page: String(page),
  });
  if (query.trim()) params.set("q", query.trim());
  const resource = useResource<ReminderResponse>(
    `/api/clinic/reminders?${params}`,
  );
  const reminders = resource.data?.reminders || [];
  const canCreateHandoff =
    capabilities.reminders_write === true &&
    capabilities.staff_messaging_read === true &&
    capabilities.staff_messaging_send === true;

  useEffect(() => setPage(1), [query]);

  if (!resource.data && !resource.error) {
    return (
      <Stack direction="row" sx={{ gap: 1.5, alignItems: "center", py: 5 }}>
        <CircularProgress size={20} />
        <Typography>Loading reminders that need attention…</Typography>
      </Stack>
    );
  }
  if (resource.error) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={resource.refresh}>
            Retry
          </Button>
        }
      >
        The reminder worklist could not be loaded. {resource.error}
      </Alert>
    );
  }
  if (reminders.length === 0) {
    return (
      <Box sx={{ py: 7, textAlign: "center" }}>
        <ReportProblemOutlinedIcon
          sx={{ fontSize: 40, color: "text.disabled", mb: 1 }}
        />
        <Typography variant="h6">No reminders need attention</Typography>
        <Typography color="text.secondary">
          Failed or uncertain deliveries and patient requests for help or
          rescheduling will appear here.
        </Typography>
      </Box>
    );
  }

  return (
    <>
      <Alert severity="info" icon={false} sx={{ mb: 2 }}>
        Assign each follow-up to an active staff conversation. Items leave this
        list after the linked staff request is resolved.
      </Alert>
      <HandoffEnabledReminderRows
        reminders={reminders}
        canRetry={capabilities.reminders_write === true}
        canCreateHandoff={canCreateHandoff}
        currentMembershipId={membership_id}
        onRefresh={resource.refresh}
      />
      {resource.data && resource.data.pagination.total_pages > 1 && (
        <Stack direction="row" sx={{ alignItems: "center", gap: 1, pt: 2 }}>
          <Button
            variant="outlined"
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </Button>
          <Typography variant="body2" color="text.secondary">
            Page {page} of {resource.data.pagination.total_pages} ·{" "}
            {resource.data.pagination.total} needing attention
          </Typography>
          <Button
            variant="outlined"
            disabled={page >= resource.data.pagination.total_pages}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </Button>
        </Stack>
      )}
    </>
  );
}

function MessageHistory({
  query,
  reminderId,
  patientId,
  appointmentId,
}: {
  query: string;
  reminderId: string | null;
  patientId: string | null;
  appointmentId: string | null;
}) {
  const { capabilities, membership_id } = useClinic();
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({
    history: reminderId ? "all" : "sent",
    per_page: "25",
    page: String(page),
  });
  if (query.trim()) params.set("q", query.trim());
  if (reminderId) params.set("reminder_id", reminderId);
  if (patientId) params.set("patient_id", patientId);
  const resource = useResource<ReminderResponse>(
    `/api/clinic/reminders?${params}`,
  );
  const reminders = resource.data?.reminders || [];

  useEffect(() => setPage(1), [query, reminderId, patientId, appointmentId]);

  if (!resource.data && !resource.error) {
    return (
      <Stack direction="row" sx={{ gap: 1.5, alignItems: "center", py: 5 }}>
        <CircularProgress size={20} />
        <Typography>Loading message history…</Typography>
      </Stack>
    );
  }
  if (resource.error) return <Alert severity="error">{resource.error}</Alert>;
  if (reminders.length === 0) {
    return (
      <Box sx={{ py: 7, textAlign: "center" }}>
        <HistoryOutlinedIcon
          sx={{ fontSize: 40, color: "text.disabled", mb: 1 }}
        />
        <Typography variant="h6">
          {reminderId
            ? "Selected reminder was not found"
            : "No messages with a recorded delivery attempt"}
        </Typography>
        <Typography color="text.secondary">
          {reminderId
            ? "It may have been removed or is outside your current clinic access."
            : "Messages appear here after a delivery attempt is recorded."}
        </Typography>
      </Box>
    );
  }

  return (
    <Stack divider={<Divider flexItem />}>
      {reminders.map((reminder) => {
        return (
          <Box key={reminder.id} sx={{ py: 2.5 }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              sx={{ justifyContent: "space-between", gap: 1.5 }}
            >
              <Box>
                <Typography sx={{ fontWeight: 700 }}>
                  {reminder.patient.display_name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {reminder.appointment
                    ? dateTimeLabel(reminder.appointment.starts_at)
                    : reminder.local_schedule_label}
                </Typography>
              </Box>
              <Chip
                size="small"
                variant="outlined"
                label={reminderStatus(reminder.status)}
                color={
                  reminder.status === "delivered"
                    ? "success"
                    : reminder.status === "failed"
                      ? "error"
                      : "default"
                }
              />
            </Stack>
            {appointmentId &&
              reminder.appointment?.id === Number(appointmentId) && (
                <Chip
                  size="small"
                  variant="outlined"
                  label="Selected appointment"
                  sx={{ mt: 1 }}
                />
              )}
            <Typography
              sx={{ mt: 1.5, maxWidth: "72ch", whiteSpace: "pre-wrap" }}
            >
              {reminder.content || reminder.safe_preview}
            </Typography>
            <DeliveryAttemptHistory reminder={reminder} />
            <PersistedStaffHandoff
              reminder={reminder}
              currentMembershipId={membership_id}
            />
            {capabilities.reminders_write && reminder.status === "failed" && (
              <Form
                endpoint={`/api/clinic/reminders/${reminder.id}/retry`}
                submit="Retry with policy check"
                retryKey
                onSuccess={resource.refresh}
              />
            )}
          </Box>
        );
      })}
      {resource.data && resource.data.pagination.total_pages > 1 && (
        <Stack direction="row" sx={{ alignItems: "center", gap: 1, pt: 2 }}>
          <Button
            variant="outlined"
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </Button>
          <Typography variant="body2" color="text.secondary">
            Page {page} of {resource.data.pagination.total_pages}
          </Typography>
          <Button
            variant="outlined"
            disabled={page >= resource.data.pagination.total_pages}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </Button>
        </Stack>
      )}
    </Stack>
  );
}

export function Reminders() {
  const clinic = useClinic();
  const searchParams = new URLSearchParams(window.location.search);
  const reminderIdParam = searchParams.get("reminder_id");
  const reminderId =
    reminderIdParam && /^[1-9]\d*$/.test(reminderIdParam)
      ? reminderIdParam
      : null;
  const patientIdParam = searchParams.get("patient_id");
  const patientId =
    patientIdParam && /^[1-9]\d*$/.test(patientIdParam) ? patientIdParam : null;
  const appointmentIdParam = searchParams.get("appointment_id");
  const appointmentId =
    appointmentIdParam && /^[1-9]\d*$/.test(appointmentIdParam)
      ? appointmentIdParam
      : null;
  const attentionView = searchParams.get("view") === "attention";
  const today = useMemo(
    () => clinicDateValue(businessNow(), clinic.practice.timezone),
    [clinic.practice.timezone],
  );
  const initialEnd = useMemo(() => {
    const value = new Date(`${today}T12:00:00Z`);
    value.setUTCDate(value.getUTCDate() + 14);
    return value.toISOString().slice(0, 10);
  }, [today]);
  const [tab, setTab] = useState(
    reminderId || patientId ? 2 : attentionView ? 1 : 0,
  );
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(initialEnd);
  const [patientQuery, setPatientQuery] = useState("");
  const deferredQuery = useDeferredValue(patientQuery);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [batchSelectedIds, setBatchSelectedIds] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const [createdReminderId, setCreatedReminderId] = useState<number | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const rangeError =
    !from || !to
      ? "Choose both a From and Through date."
      : from > to
        ? "Through must be on or after From."
        : "";

  const appointmentParams = new URLSearchParams({
    upcoming: "true",
    per_page: "100",
    from_date: from,
    through_date: to,
  });
  if (deferredQuery.trim()) appointmentParams.set("q", deferredQuery.trim());
  const appointmentsResource = useResource<AppointmentResponse>(
    `/api/clinic/appointments?${appointmentParams}`,
  );
  const appointments = appointmentsResource.data?.appointments || [];
  const selected =
    appointments.find((appointment) => appointment.id === selectedId) || null;

  useEffect(() => {
    if (
      selectedId &&
      !appointments.some((appointment) => appointment.id === selectedId)
    )
      setSelectedId(null);
  }, [appointments, selectedId]);

  useEffect(() => {
    setBatchSelectedIds((current) => {
      const availableIds = new Set(
        appointments.map((appointment) => appointment.id),
      );
      const next = current.filter((id) => availableIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [appointments]);

  useEffect(() => {
    if (!selected) return;
    setMessage(
      `This is a reminder from ${clinic.practice.name} about your appointment on ${appointmentLabel(selected, clinic.practice.timezone)}. Review and confirm it securely at ${window.location.origin}/patient-portal.`,
    );
    setNotice("");
    setError("");
    setCreatedReminderId(null);
  }, [clinic.practice.name, clinic.practice.timezone, selected]);

  async function queueReminder() {
    if (!selected || !message.trim() || rangeError) return;
    setBusy(true);
    setError("");
    setNotice("");
    let savedThisAttempt = false;
    try {
      let reminderIdToDispatch = createdReminderId;
      if (!reminderIdToDispatch) {
        const created = await api<{ id: number }>("/api/clinic/reminders", {
          method: "POST",
          body: {
            reminder: {
              request_key: crypto.randomUUID(),
              patient_id: selected.patient_id,
              appointment_id: selected.id,
              category: "appointment",
              channel: "sms",
              scheduled_at: businessNow().toISOString(),
              content: message.trim(),
            },
          },
        });
        reminderIdToDispatch = created.id;
        savedThisAttempt = true;
        setCreatedReminderId(created.id);
      }
      const dispatched = await api<{ reminder: PatientReminder }>(
        `/api/clinic/reminders/${reminderIdToDispatch}/dispatch`,
        { method: "POST" },
      );
      setNotice(
        dispatched.reminder.status === "provider_accepted"
          ? "The sandbox provider accepted this message. No real text was sent."
          : "The reminder is queued. Delivery will stay gated until a test provider is configured.",
      );
      setCreatedReminderId(null);
      setTab(2);
    } catch (caught) {
      setError(
        createdReminderId || savedThisAttempt
          ? `The reminder is saved, but sandbox delivery failed. Retry this same reminder. ${caught instanceof Error ? caught.message : ""}`
          : caught instanceof Error
            ? caught.message
            : "The reminder could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ maxWidth: 1280, mx: "auto" }}>
      <Box sx={{ mb: 3 }}>
        <Typography
          id="appointment-reminders-title"
          component="h1"
          variant="h3"
          sx={{ fontWeight: 700, letterSpacing: "-0.025em" }}
        >
          Appointment reminders
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 0.75, maxWidth: "72ch" }}>
          Schedule the fixed appointment text 24 hours before each visit, or
          compose a one-off message for review. Standard timing and copy are not
          configurable here; the server rechecks consent, verified destination,
          opt-outs, and quiet hours.
        </Typography>
      </Box>

      {reminderId && (
        <Alert
          severity="info"
          action={
            <Button color="inherit" size="small" href="/clinic/reminders">
              Clear selection
            </Button>
          }
          sx={{ mb: 2 }}
        >
          Showing the selected reminder.
        </Alert>
      )}
      {patientId && !reminderId && (
        <Alert
          severity="info"
          action={
            <Button color="inherit" size="small" href="/clinic/reminders">
              Clear selection
            </Button>
          }
          sx={{ mb: 2 }}
        >
          Review this patient’s message history before deciding whether another
          message is needed. Opening this page has not sent a message.
        </Alert>
      )}
      {notice && (
        <Alert severity="success" onClose={() => setNotice("")} sx={{ mb: 2 }}>
          {notice}
        </Alert>
      )}
      {error && (
        <Alert severity="error" onClose={() => setError("")} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Alert severity="info" sx={{ mb: 2 }}>
        <strong>Delivery history:</strong> statuses can include queued, accepted
        by the provider, delivered, failed, held by policy, unknown, suppressed,
        or cancelled. These are recorded delivery states; provider acceptance is
        not proof of delivery, and delivery is not proof that the patient read
        the message.
      </Alert>

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
          value={tab}
          onChange={(_, value: number) => setTab(value)}
          aria-label="Reminder workspace"
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            px: { xs: 1, md: 2 },
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Tab
            id="reminders-upcoming-tab"
            aria-controls="reminders-upcoming-panel"
            icon={<CalendarMonthOutlinedIcon />}
            iconPosition="start"
            label="Upcoming appointments"
          />
          <Tab
            id="reminders-attention-tab"
            aria-controls="reminders-attention-panel"
            icon={<ReportProblemOutlinedIcon />}
            iconPosition="start"
            label="Needs attention"
          />
          <Tab
            id="reminders-history-tab"
            aria-controls="reminders-history-panel"
            icon={<HistoryOutlinedIcon />}
            iconPosition="start"
            label="Message history"
          />
        </Tabs>

        <Box
          role="tabpanel"
          id={
            tab === 0
              ? "reminders-upcoming-panel"
              : tab === 1
                ? "reminders-attention-panel"
                : "reminders-history-panel"
          }
          aria-labelledby={
            tab === 0
              ? "reminders-upcoming-tab"
              : tab === 1
                ? "reminders-attention-tab"
                : "reminders-history-tab"
          }
          sx={{ p: { xs: 2, md: 3 } }}
        >
          <Stack
            direction={{ xs: "column", md: "row" }}
            sx={{ gap: 1, mb: 2.25 }}
          >
            {tab === 0 && (
              <>
                <TextField
                  size="small"
                  label="From"
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ width: { xs: "100%", md: 142 } }}
                  error={Boolean(rangeError)}
                />
                <TextField
                  size="small"
                  label="Through"
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ width: { xs: "100%", md: 142 } }}
                  error={Boolean(rangeError)}
                  helperText={rangeError || " "}
                />
              </>
            )}
            <TextField
              size="small"
              value={patientQuery}
              onChange={(event) => setPatientQuery(event.target.value)}
              label="Filter by patient"
              placeholder="Name or patient reference"
              sx={{ flex: 1, maxWidth: { md: 360 } }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchOutlinedIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
            />
          </Stack>

          {tab === 0 ? (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  md: selected ? "minmax(0, 1fr) minmax(320px, 0.72fr)" : "1fr",
                },
                gap: 3,
              }}
            >
              <Box>
                <Stack
                  direction="row"
                  sx={{
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    mb: 1.5,
                  }}
                >
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    On the schedule
                  </Typography>
                  {appointmentsResource.data && (
                    <Typography variant="body2" color="text.secondary">
                      {appointmentsResource.data.pagination.total} appointments
                    </Typography>
                  )}
                </Stack>
                {appointmentsResource.error && (
                  <Alert severity="error">{appointmentsResource.error}</Alert>
                )}
                {!appointmentsResource.data && !appointmentsResource.error && (
                  <Stack
                    direction="row"
                    sx={{ gap: 1.5, alignItems: "center", py: 5 }}
                  >
                    <CircularProgress size={20} />
                    <Typography>Loading appointments…</Typography>
                  </Stack>
                )}
                {appointmentsResource.data && appointments.length === 0 && (
                  <Box sx={{ py: 7, textAlign: "center" }}>
                    <CalendarMonthOutlinedIcon
                      sx={{ fontSize: 42, color: "text.disabled", mb: 1 }}
                    />
                    <Typography variant="h6">
                      No upcoming appointments in this range
                    </Typography>
                    <Typography color="text.secondary">
                      Adjust the dates or clear the patient filter.
                    </Typography>
                  </Box>
                )}
                {appointmentsResource.data && appointments.length > 0 && (
                  <AppointmentReminderBatch
                    appointments={appointments}
                    selectedIds={batchSelectedIds}
                    canSchedule={clinic.capabilities.reminders_write === true}
                    onClearSelection={() => setBatchSelectedIds([])}
                    onSelectAll={() =>
                      setBatchSelectedIds(
                        appointments.map((appointment) => appointment.id),
                      )
                    }
                  />
                )}
                <Stack divider={<Divider flexItem />}>
                  {appointments.map((appointment) => (
                    <Stack
                      key={appointment.id}
                      direction="row"
                      sx={{
                        alignItems: "center",
                        pr: 0.75,
                      }}
                    >
                      <Checkbox
                        checked={batchSelectedIds.includes(appointment.id)}
                        onChange={(event) => {
                          setBatchSelectedIds((current) =>
                            event.target.checked
                              ? [...current, appointment.id]
                              : current.filter((id) => id !== appointment.id),
                          );
                        }}
                        slotProps={{
                          input: {
                            "aria-label": `Select ${appointment.patient?.display_name || `patient ${appointment.patient_id}`} on ${appointmentLabel(appointment, clinic.practice.timezone)} for standard reminder planning`,
                          },
                        }}
                      />
                      <Button
                        onClick={() => setSelectedId(appointment.id)}
                        aria-pressed={selectedId === appointment.id}
                        sx={{
                          px: 1.5,
                          py: 1.75,
                          flex: 1,
                          justifyContent: "space-between",
                          textAlign: "left",
                          color: "text.primary",
                          borderRadius: 1,
                          bgcolor:
                            selectedId === appointment.id
                              ? "action.selected"
                              : "transparent",
                          "&:hover": { bgcolor: "action.hover" },
                        }}
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 700 }}>
                            {appointment.patient?.display_name ||
                              `Patient ${appointment.patient_id}`}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {appointmentLabel(
                              appointment,
                              clinic.practice.timezone,
                            )}
                            {appointment.patient?.phone
                              ? ` · ${phoneLabel(appointment.patient.phone)}`
                              : " · No verified phone on file"}
                          </Typography>
                        </Box>
                        <Chip
                          size="small"
                          variant="outlined"
                          label={appointment.status}
                          sx={{ ml: 2, flexShrink: 0 }}
                        />
                      </Button>
                    </Stack>
                  ))}
                </Stack>
                {appointmentsResource.data &&
                  appointmentsResource.data.pagination.total_pages > 1 && (
                    <Alert severity="info" sx={{ mt: 2 }}>
                      This range has more than 100 appointments. Narrow the
                      dates or patient filter to choose from the full schedule.
                    </Alert>
                  )}
              </Box>

              {selected && (
                <Paper
                  component="section"
                  elevation={0}
                  sx={{
                    p: 2.5,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 2,
                    alignSelf: "start",
                    position: { md: "sticky" },
                    top: { md: 24 },
                  }}
                >
                  <Stack
                    direction="row"
                    sx={{ alignItems: "center", gap: 1, mb: 0.75 }}
                  >
                    <SmsOutlinedIcon color="primary" />
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      Compose text
                    </Typography>
                  </Stack>
                  <Typography sx={{ fontWeight: 700 }}>
                    {selected.patient?.display_name}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mb: 2 }}
                  >
                    {appointmentLabel(selected, clinic.practice.timezone)}
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 2 }}>
                    <strong>Text will go to:</strong>{" "}
                    {selected.patient?.phone
                      ? phoneLabel(selected.patient.phone)
                      : "No verified phone on file"}
                  </Typography>
                  <TextField
                    multiline
                    minRows={6}
                    fullWidth
                    label="Message"
                    value={message}
                    disabled={busy || createdReminderId !== null}
                    onChange={(event) => setMessage(event.target.value)}
                    slotProps={{ htmlInput: { maxLength: 480 } }}
                    helperText={`${message.length}/480 characters · Avoid diagnoses, test results, or treatment details.`}
                  />
                  <Alert severity="warning" icon={false} sx={{ mt: 2 }}>
                    Sandbox mode — no real SMS is sent. A verified mobile number
                    and reminder consent are still rechecked by the server.
                  </Alert>
                  <Button
                    fullWidth
                    variant="contained"
                    size="large"
                    disabled={
                      busy ||
                      !message.trim() ||
                      Boolean(rangeError) ||
                      !clinic.capabilities.reminders_write
                    }
                    onClick={queueReminder}
                    sx={{ mt: 2 }}
                  >
                    {busy
                      ? "Sending…"
                      : createdReminderId
                        ? "Retry sandbox delivery"
                        : "Send sandbox reminder"}
                  </Button>
                  {!clinic.capabilities.reminders_write && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", mt: 1 }}
                    >
                      Your role can review appointments but cannot send
                      reminders.
                    </Typography>
                  )}
                </Paper>
              )}
            </Box>
          ) : tab === 1 ? (
            <NeedsAttention query={deferredQuery} />
          ) : (
            <MessageHistory
              query={deferredQuery}
              reminderId={reminderId}
              patientId={patientId}
              appointmentId={appointmentId}
            />
          )}
        </Box>
      </Paper>
    </Box>
  );
}
