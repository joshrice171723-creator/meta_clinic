import { useMemo, useState } from "react";
import {
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  List,
  ListItemButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import MarkEmailReadOutlinedIcon from "@mui/icons-material/MarkEmailReadOutlined";
import PriorityHighRoundedIcon from "@mui/icons-material/PriorityHighRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";

export type StaffMessageClass =
  "routine" | "time_sensitive" | "urgent" | "safety_critical";

export type StaffMessage = {
  id: number;
  sender: string;
  senderEmail: string;
  body: string;
  messageClass: StaffMessageClass;
  createdAt: string;
  acknowledgementRequired?: boolean;
  acknowledged?: boolean;
  request?: {
    id: number;
    state: string;
    assignee_membership_id: number | null;
    due_at: string | null;
    resolved_at: string | null;
    resolution_code: string | null;
  } | null;
};

export type StaffConversation = {
  id: number;
  title: string;
  kind: "direct" | "team" | "role";
  status: "active" | "archived" | "locked";
  unread: boolean;
  urgent: boolean;
  unresolved: boolean;
  participants: string[];
  lastMessageAt: string;
  lastMessageClass: StaffMessageClass;
  messages: StaffMessage[];
};

export type StaffMessagingState = {
  conversations: StaffConversation[];
  selectedConversationId: number;
  canSend: boolean;
  canAcknowledge: boolean;
  canTransition?: boolean;
  canEscalate?: boolean;
  loading?: boolean;
  error?: string | null;
};

type StaffMessagingWorkspaceProps = {
  state?: StaffMessagingState;
  onSelectConversation?: (conversationId: number) => void;
  onSend?: (conversationId: number, body: string) => void | Promise<void>;
  onAcknowledge?: (messageId: number) => void | Promise<void>;
  onTransitionRequest?: (requestId: number, state: "acknowledged" | "in_progress") => void | Promise<void>;
  onEscalateRequest?: (requestId: number) => void | Promise<void>;
  onRetry?: () => void;
};

const classLabel: Record<StaffMessageClass, string> = {
  routine: "Routine",
  time_sensitive: "Time sensitive",
  urgent: "Urgent",
  safety_critical: "Safety critical",
};

const classColor: Record<StaffMessageClass, "default" | "warning" | "error"> = {
  routine: "default",
  time_sensitive: "warning",
  urgent: "error",
  safety_critical: "error",
};

const fixtureState: StaffMessagingState = {
  selectedConversationId: 201,
  canSend: true,
  canAcknowledge: true,
  conversations: [
    {
      id: 201,
      title: "Front desk · clinical team",
      kind: "team",
      status: "active",
      unread: true,
      urgent: true,
      unresolved: true,
      participants: ["Front desk", "Clinical team", "Care coordinator"],
      lastMessageAt: "Today · 9:42 AM",
      lastMessageClass: "urgent",
      messages: [
        {
          id: 301,
          sender: "Morgan Lee",
          senderEmail: "morgan@example.test",
          body: "The synthetic intake packet is ready for review before the afternoon visit.",
          messageClass: "routine",
          createdAt: "Today · 9:18 AM",
        },
        {
          id: 302,
          sender: "Taylor Green",
          senderEmail: "taylor@example.test",
          body: "Please confirm the translated consent handoff before the patient-facing reminder is released.",
          messageClass: "urgent",
          createdAt: "Today · 9:42 AM",
          acknowledgementRequired: true,
        },
      ],
    },
    {
      id: 202,
      title: "Care coordination",
      kind: "role",
      status: "active",
      unread: false,
      urgent: false,
      unresolved: true,
      participants: ["Care coordinator", "Nursing"],
      lastMessageAt: "Yesterday · 4:10 PM",
      lastMessageClass: "time_sensitive",
      messages: [
        {
          id: 303,
          sender: "Jordan Kim",
          senderEmail: "jordan@example.test",
          body: "Can we close the follow-up request after the synthetic appointment is confirmed?",
          messageClass: "time_sensitive",
          createdAt: "Yesterday · 4:10 PM",
        },
      ],
    },
    {
      id: 203,
      title: "Operations check-in",
      kind: "direct",
      status: "active",
      unread: false,
      urgent: false,
      unresolved: false,
      participants: ["Operations"],
      lastMessageAt: "Mon · 2:26 PM",
      lastMessageClass: "routine",
      messages: [
        {
          id: 304,
          sender: "Sam Rivera",
          senderEmail: "sam@example.test",
          body: "The synthetic front-desk checklist is complete.",
          messageClass: "routine",
          createdAt: "Mon · 2:26 PM",
        },
      ],
    },
  ],
};

function ConversationBadge({
  conversation,
}: {
  conversation: StaffConversation;
}) {
  if (!conversation.unread && !conversation.urgent) return null;
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
      {conversation.unread && (
        <Badge color="primary" variant="dot" aria-label="Unread" />
      )}
      {conversation.urgent && (
        <PriorityHighRoundedIcon
          color="error"
          fontSize="small"
          aria-label="Urgent"
        />
      )}
    </Stack>
  );
}

function MessageCard({
  message,
  canAcknowledge,
  onAcknowledge,
  canTransition,
  canEscalate,
  onTransitionRequest,
  onEscalateRequest,
}: {
  message: StaffMessage;
  canAcknowledge: boolean;
  onAcknowledge?: (messageId: number) => void;
  canTransition?: boolean;
  canEscalate?: boolean;
  onTransitionRequest?: (requestId: number, state: "acknowledged" | "in_progress") => void | Promise<void>;
  onEscalateRequest?: (requestId: number) => void | Promise<void>;
}) {
  return (
    <Paper
      component="article"
      variant="outlined"
      sx={{
        p: { xs: 1.75, sm: 2.25 },
        borderColor:
          message.acknowledgementRequired && !message.acknowledged
            ? "#d89d57"
            : "divider",
        bgcolor:
          message.messageClass === "urgent" ? "#fffaf2" : "background.paper",
      }}
    >
      <Stack spacing={1.25}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}
        >
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", minWidth: 0 }}
          >
            <Avatar
              sx={{ width: 34, height: 34, bgcolor: "#1b5e57", fontSize: 14 }}
            >
              {message.sender.slice(0, 1)}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, overflowWrap: "anywhere" }}>
                {message.sender}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {message.createdAt}
              </Typography>
            </Box>
          </Stack>
          <Chip
            size="small"
            label={classLabel[message.messageClass]}
            color={classColor[message.messageClass]}
            variant={message.messageClass === "routine" ? "outlined" : "filled"}
          />
        </Stack>
        <Typography sx={{ lineHeight: 1.65, overflowWrap: "anywhere" }}>
          {message.body}
        </Typography>
        {message.acknowledgementRequired && (
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{
              alignItems: { sm: "center" },
              justifyContent: "space-between",
            }}
          >
            <Typography variant="body2" color="text.secondary">
              {message.acknowledged
                ? "Acknowledged by the current staff member."
                : "Acknowledgement requested."}
            </Typography>
            {!message.acknowledged && canAcknowledge && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<MarkEmailReadOutlinedIcon />}
                onClick={() => onAcknowledge?.(message.id)}
              >
                Acknowledge
              </Button>
            )}
          </Stack>
        )}
        {message.request && !["resolved", "declined", "expired"].includes(message.request.state) && (
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}>
            <Typography variant="body2" color="text.secondary">
              Request: {message.request.state.replaceAll("_", " ")}
            </Typography>
            {canTransition && message.request.state === "open" && (
              <Button size="small" variant="outlined" onClick={() => void onTransitionRequest?.(message.request!.id, "acknowledged")}>
                Acknowledge request
              </Button>
            )}
            {canTransition && ["open", "acknowledged"].includes(message.request.state) && (
              <Button size="small" variant="outlined" onClick={() => void onTransitionRequest?.(message.request!.id, "in_progress")}>
                Start request
              </Button>
            )}
            {canEscalate && (
              <Button size="small" color="warning" variant="outlined" onClick={() => void onEscalateRequest?.(message.request!.id)}>
                Escalate
              </Button>
            )}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

export function StaffMessagingWorkspace({
  state = fixtureState,
  onSelectConversation,
  onSend,
  onAcknowledge,
  onRetry,
}: StaffMessagingWorkspaceProps) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const selectedConversation = useMemo(
    () =>
      state.conversations.find(
        ({ id }) => id === state.selectedConversationId,
      ) ?? state.conversations[0],
    [state.conversations, state.selectedConversationId],
  );

  if (state.loading) {
    return (
      <Paper
        component="section"
        variant="outlined"
        sx={{ p: { xs: 2, sm: 3 } }}
      >
        <Typography role="status" aria-live="polite">
          Loading staff messages
        </Typography>
      </Paper>
    );
  }

  if (state.error) {
    return (
      <Alert
        severity="error"
        role="alert"
        action={
          <Button color="inherit" onClick={onRetry}>
            Retry
          </Button>
        }
      >
        {state.error}
      </Alert>
    );
  }

  if (!selectedConversation) {
    return (
      <Paper
        component="section"
        variant="outlined"
        sx={{ p: { xs: 2, sm: 3 } }}
      >
        <Typography component="h1" variant="h5">
          No conversations yet
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          There are no staff conversations available to your current account.
        </Typography>
      </Paper>
    );
  }

  const sendMessage = async () => {
    const body = draft.trim();
    if (!body || !state.canSend || sending) return;
    setSending(true);
    try {
      await onSend?.(selectedConversation.id, body);
      setDraft("");
    } catch {
      // The adapter owns the user-visible failure. Keep the draft for retry.
    } finally {
      setSending(false);
    }
  };

  return (
    <Box
      component="main"
      aria-labelledby="staff-messaging-heading"
      sx={{
        maxWidth: 1440,
        mx: "auto",
        p: { xs: 2, sm: 3, lg: 4 },
        minWidth: 0,
      }}
    >
      <Stack spacing={2.5}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          sx={{
            alignItems: { sm: "flex-end" },
            justifyContent: "space-between",
          }}
        >
          <Box>
            <Typography
              component="p"
              variant="overline"
              sx={{ color: "#1b5e57", letterSpacing: "0.16em" }}
            >
              STAFF OPERATIONS
            </Typography>
            <Typography
              id="staff-messaging-heading"
              component="h1"
              variant="h3"
              sx={{ fontWeight: 750, letterSpacing: "-0.03em" }}
            >
              Keep the handoff visible.
            </Typography>
            <Typography
              color="text.secondary"
              sx={{ mt: 0.75, maxWidth: "62ch" }}
            >
              A focused inbox for accountable team communication,
              acknowledgement, and next actions.
            </Typography>
          </Box>
          <Chip
            label={`${state.conversations.filter(({ status }) => status === "active").length} active conversations`}
            variant="outlined"
            sx={{ alignSelf: { xs: "flex-start", sm: "auto" } }}
          />
        </Stack>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              md: "minmax(280px, 0.38fr) minmax(0, 1fr)",
            },
            gap: 2,
            alignItems: "start",
          }}
        >
          <Paper
            component="nav"
            aria-label="Staff conversations"
            variant="outlined"
            sx={{ minWidth: 0, overflow: "hidden" }}
          >
            <Box sx={{ p: 2.25, bgcolor: "#f7faf9" }}>
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: "center", justifyContent: "space-between" }}
              >
                <Typography
                  component="h2"
                  variant="h6"
                  sx={{ fontWeight: 750 }}
                >
                  Inbox
                </Typography>
                <Tooltip title="Unread and urgent messages">
                  <IconButton
                    size="small"
                    aria-label="Unread and urgent messages"
                  >
                    <Badge
                      badgeContent={
                        state.conversations.filter(({ unread }) => unread)
                          .length
                      }
                      color="primary"
                    >
                      <MarkEmailReadOutlinedIcon fontSize="small" />
                    </Badge>
                  </IconButton>
                </Tooltip>
              </Stack>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.5 }}
              >
                Your assigned conversations
              </Typography>
            </Box>
            <Divider />
            <List disablePadding>
              {state.conversations.map((conversation) => (
                <ListItemButton
                  key={conversation.id}
                  selected={conversation.id === selectedConversation.id}
                  onClick={() => onSelectConversation?.(conversation.id)}
                  sx={{
                    display: "block",
                    px: 2.25,
                    py: 1.75,
                    borderBottom: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  <Stack spacing={0.75}>
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <Typography
                        sx={{
                          fontWeight: conversation.unread ? 750 : 650,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {conversation.title}
                      </Typography>
                      <ConversationBadge conversation={conversation} />
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      {conversation.participants.join(" · ")}
                    </Typography>
                    <Stack
                      direction="row"
                      spacing={0.75}
                      sx={{
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <Typography variant="caption" color="text.secondary">
                        {conversation.lastMessageAt}
                      </Typography>
                      {conversation.unresolved && (
                        <Chip
                          size="small"
                          label="Needs action"
                          color="warning"
                          variant="outlined"
                        />
                      )}
                    </Stack>
                  </Stack>
                </ListItemButton>
              ))}
            </List>
          </Paper>

          <Paper
            component="section"
            aria-labelledby="conversation-heading"
            variant="outlined"
            sx={{ minWidth: 0, overflow: "hidden" }}
          >
            <Box sx={{ p: { xs: 2, sm: 2.5 }, bgcolor: "#fbfcfb" }}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1.25}
                sx={{
                  alignItems: { sm: "center" },
                  justifyContent: "space-between",
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    id="conversation-heading"
                    component="h2"
                    variant="h5"
                    sx={{ fontWeight: 750, overflowWrap: "anywhere" }}
                  >
                    {selectedConversation.title}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 0.4 }}
                  >
                    {selectedConversation.kind} conversation ·{" "}
                    {selectedConversation.participants.join(" · ")}
                  </Typography>
                </Box>
                <Stack
                  direction="row"
                  spacing={0.75}
                  sx={{ flexWrap: "wrap", alignItems: "center" }}
                >
                  {selectedConversation.urgent && (
                    <Chip size="small" label="Urgent" color="error" />
                  )}
                  {selectedConversation.unresolved && (
                    <Chip
                      size="small"
                      label="Open request"
                      color="warning"
                      variant="outlined"
                    />
                  )}
                </Stack>
              </Stack>
            </Box>
            <Divider />
            <Stack spacing={1.5} sx={{ p: { xs: 1.5, sm: 2.5 }, minWidth: 0 }}>
              {selectedConversation.messages.map((message) => (
                <MessageCard
                  key={message.id}
                  message={message}
                  canAcknowledge={state.canAcknowledge}
                  onAcknowledge={onAcknowledge}
                  canTransition={state.canTransition}
                  canEscalate={state.canEscalate}
                  onTransitionRequest={onTransitionRequest}
                  onEscalateRequest={onEscalateRequest}
                />
              ))}
              <Divider sx={{ my: 0.5 }} />
              <Box
                component="form"
                onSubmit={(event) => {
                  event.preventDefault();
                  sendMessage();
                }}
              >
                <Stack spacing={1.25}>
                  <TextField
                    label="Write a staff message"
                    placeholder="Share the next accountable step…"
                    multiline
                    minRows={3}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    disabled={!state.canSend}
                    slotProps={{ htmlInput: { maxLength: 10000 } }}
                    helperText={
                      state.canSend
                        ? "The server will apply membership, scope, and idempotency checks."
                        : "You do not have permission to send in this conversation."
                    }
                  />
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      No attachment has been selected.
                    </Typography>
                    <Button
                      type="submit"
                      variant="contained"
                      endIcon={<SendRoundedIcon />}
                      disabled={!state.canSend || sending || draft.trim().length === 0}
                    >
                      Send message
                    </Button>
                  </Stack>
                </Stack>
              </Box>
            </Stack>
          </Paper>
        </Box>
      </Stack>
    </Box>
  );
}

export { fixtureState as staffMessagingFixture };
