import { useResource, Form, Field } from "../../shared/ui";
import { useEffect, useState } from "react";
import { useClinic } from "./Workspace";
import type { PatientReminder } from "../../api/contracts";
import {
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

type ReminderResponse = { reminders: PatientReminder[]; pagination: { page: number; total_pages: number } };
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
  onSuccess,
}: {
  reminder: PatientReminder;
  conversations: StaffConversation[];
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

function PersistedStaffHandoff({ reminder }: { reminder: PatientReminder }) {
  const request = reminder.staff_handoff.request;
  if (!request) return null;

  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.5 }}>
      <Chip
        size="small"
        variant="outlined"
        label={`Staff follow-up: ${request.state.replaceAll("_", " ")}`}
      />
      <Typography variant="caption" color="text.secondary">
        Assigned staff membership #{request.assignee_membership_id}
      </Typography>
    </Stack>
  );
}

function ReminderRows({
  reminders,
  canRetry,
  conversations,
  onRefresh,
}: {
  reminders: PatientReminder[];
  canRetry: boolean;
  conversations?: StaffConversation[];
  onRefresh: () => void;
}) {
  return (
    <Stack spacing={1.5}>
      {reminders.map((reminder) => (
        <Box
          key={reminder.id}
          sx={{ borderTop: "1px solid #e7eeeb", pt: 1.5 }}
        >
          <Stack
            direction={{ xs: "column", sm: "row" }}
            sx={{
              gap: 1,
              justifyContent: { xs: "flex-start", sm: "space-between" },
            }}
          >
            <Box>
              <Typography sx={{ fontWeight: 700 }}>
                Reminder #{reminder.id} · {reminder.category.replaceAll("_", " ")}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {reminder.local_schedule_label} · {reminder.endpoint.masked_value} · patient #{reminder.patient_id}
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
          <PersistedStaffHandoff reminder={reminder} />
          {conversations && !reminder.staff_handoff.request && (
            <StaffHandoffControl
              reminder={reminder}
              conversations={conversations}
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
  onRefresh,
}: {
  reminders: PatientReminder[];
  canRetry: boolean;
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
          onRefresh={onRefresh}
        />
      </>
    );
  }
  return (
    <>
      {conversations.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Staff conversations are unavailable. {conversations.error}
        </Alert>
      )}
      {conversations.data && conversations.data.pagination.total_pages > 1 && (
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{ mb: 2 }}
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
            Page {conversations.data.pagination.page} of {conversations.data.pagination.total_pages}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            disabled={conversationPage >= conversations.data.pagination.total_pages}
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
        onRefresh={onRefresh}
      />
    </>
  );
}

export function Reminders() {
  const { capabilities } = useClinic();
  const [recoveryNotice, setRecoveryNotice] = useState("");
  const [reminderPage, setReminderPage] = useState(1);
  const reminderIdParam = new URLSearchParams(window.location.search).get(
    "reminder_id",
  );
  const reminderId =
    reminderIdParam && /^[1-9]\d*$/.test(reminderIdParam)
      ? reminderIdParam
      : null;
  useEffect(() => setReminderPage(1), [reminderId]);
  const resource = useResource<ReminderResponse>(
    reminderId
      ? `/api/clinic/reminders?reminder_id=${reminderId}&per_page=50`
      : `/api/clinic/reminders?per_page=50&page=${reminderPage}`,
  );
  const reminders = resource.data?.reminders || [];
  return (
    <Box sx={{ maxWidth: 1160, mx: "auto" }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{
          mb: 3,
          gap: 2,
          justifyContent: { xs: "flex-start", sm: "space-between" },
        }}
      >
        <Box>
          <Typography variant="overline" color="text.secondary">
            Operational communication
          </Typography>
          <Typography component="h1" variant="h3" sx={{ fontWeight: 700 }}>
            Patient reminders
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Delivery is simulated; external sending is disabled. Reminder bodies
            never appear in operational diagnostics.
          </Typography>
        </Box>
        <Paper
          elevation={0}
          sx={{ p: 2, border: "1px solid #d6e1dd", minWidth: 230 }}
        >
          <Typography variant="body2" color="text.secondary">
            Loaded reminders
          </Typography>
          <Typography variant="h6">
            {
              reminders.filter((r) =>
                ["scheduled", "queued"].includes(r.status),
              ).length
            }{" "}
            awaiting dispatch
          </Typography>
          <Typography variant="caption" color="text.secondary">
            External providers are gated in this build.
          </Typography>
        </Paper>
      </Stack>
      {resource.error && <Alert severity="error">{resource.error}</Alert>}
      {reminderId && (
        <Alert
          severity="info"
          action={
            <Button color="inherit" size="small" href="/clinic/reminders">
              Back to all reminders
            </Button>
          }
          sx={{ mb: 2 }}
        >
          Showing the source reminder for a staff follow-up.
        </Alert>
      )}
      {recoveryNotice && <Alert severity="info" sx={{ mb: 2 }}>{recoveryNotice}</Alert>}
      {capabilities.reminders_write && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Recover up to 50 due items. Uncertain delivery is held for review and is never automatically resent.
          </Typography>
          <Form endpoint="/api/clinic/reminders/recover" submit="Recover due reminders"
            onSuccess={(result) => {
              if (result) setRecoveryNotice(`Examined ${result.examined}; processed ${result.dispatched}; uncertain ${result.delivery_unknown}; retry limit reached ${result.retry_exhausted}; suppressed ${result.suppressed}; unchanged ${result.unchanged}; skipped ${result.skipped}.`);
              resource.refresh();
            }} />
        </Box>
      )}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, md: 3 },
          border: "1px solid #d6e1dd",
          borderRadius: 3,
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
          Reminder worklist
        </Typography>
        {!reminderId && resource.data && resource.data.pagination.total_pages > 1 && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <Button disabled={reminderPage <= 1} onClick={() => setReminderPage((page) => page - 1)}>Previous reminders</Button>
            <Typography variant="body2">Page {resource.data.pagination.page} of {resource.data.pagination.total_pages}</Typography>
            <Button disabled={reminderPage >= resource.data.pagination.total_pages} onClick={() => setReminderPage((page) => page + 1)}>More reminders</Button>
          </Stack>
        )}
        {reminders.length === 0 && (
          <Typography color="text.secondary">
            No reminders are scheduled.
          </Typography>
        )}
        {capabilities.reminders_write &&
        capabilities.staff_messaging_read &&
        capabilities.staff_messaging_send ? (
          <HandoffEnabledReminderRows
            reminders={reminders}
            canRetry
            onRefresh={resource.refresh}
          />
        ) : (
          <ReminderRows
            reminders={reminders}
            canRetry={capabilities.reminders_write === true}
            onRefresh={resource.refresh}
          />
        )}
      </Paper>
      {capabilities.reminders_write && <Paper
        elevation={0}
        sx={{
          p: { xs: 2, md: 3 },
          mt: 3,
          border: "1px solid #d6e1dd",
          borderRadius: 3,
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Schedule an appointment reminder
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mt: 1, mb: 2 }}
        >
          The server selects only a verified endpoint and generates
          minimum-content copy from the approved category template.
        </Typography>
        <Form
          endpoint="/api/clinic/reminders"
          submit="Schedule reminder"
          retryKey
          retryKeyField="reminder[request_key]"
          onSuccess={resource.refresh}
        >
          <Field
            name="reminder[patient_id]"
            label="Patient ID"
            type="number"
            min={1}
          />
          <Field
            name="reminder[appointment_id]"
            label="Appointment ID"
            type="number"
            min={1}
          />
          <Field
            name="reminder[category]"
            label="Purpose"
            options={[
              ["appointment", "Appointment"],
              ["preparation", "Preparation"],
              ["follow_up", "Follow-up"],
            ]}
          />
          <Field
            name="reminder[channel]"
            label="Channel"
            options={[["portal", "Private portal"]]}
          />
          <Field
            name="reminder[scheduled_at]"
            label="Scheduled time"
            type="datetime-local"
          />
        </Form>
      </Paper>}
    </Box>
  );
}
