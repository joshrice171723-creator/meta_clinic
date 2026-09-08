import { useEffect, useMemo, useRef, useState } from "react";
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
import { useClinicNavigation } from "../clinic/clinicNavigation";

export type StaffMessageClass =
  "routine" | "time_sensitive" | "urgent" | "safety_critical";

export type StaffRequestTransitionState =
  "acknowledged" | "in_progress" | "resolved" | "declined";

export type StaffMessage = {
  id: number;
  sender: string;
  senderEmail: string;
  body: string;
  messageClass: StaffMessageClass;
  createdAt: string;
  acknowledgementRequired?: boolean;
  acknowledged?: boolean;
  reminderId?: number;
  request?: {
    id: number;
    state: string;
    assignee_membership_id: number | null;
    due_at: string | null;
    resolved_at: string | null;
    resolution_code: string | null;
    assignee_label?: string;
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
  messagePage?: number;
  messageTotalPages?: number;
  loadingEarlierMessages?: boolean;
};

export type StaffMessagingState = {
  conversations: StaffConversation[];
  selectedConversationId: number;
  canSend: boolean;
  canAcknowledge: boolean;
  canTransition?: boolean;
  canEscalate?: boolean;
  conversationPage?: number;
  conversationTotalPages?: number;
  loadingMoreConversations?: boolean;
  loading?: boolean;
  error?: string | null;
};

type StaffMessagingWorkspaceProps = {
  state?: StaffMessagingState;
  onSelectConversation?: (conversationId: number) => void;
  onSend?: (conversationId: number, body: string) => void | Promise<void>;
  onAcknowledge?: (messageId: number) => void | Promise<void>;
  onTransitionRequest?: (
    requestId: number,
    state: "acknowledged" | "in_progress",
  ) => void | Promise<void>;
  onResolveRequest?: (requestId: number) => void | Promise<void>;
  onDeclineRequest?: (requestId: number) => void | Promise<void>;
  onEscalateRequest?: (requestId: number) => void | Promise<void>;
  onLoadMoreConversations?: () => void | Promise<void>;
  onLoadEarlierMessages?: (conversationId: number) => void | Promise<void>;
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
          body: "The intake packet is ready for review before the afternoon visit.",
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
          body: "Can we close the follow-up request after the appointment is confirmed?",
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
          body: "The front-desk checklist is complete.",
          messageClass: "routine",
          createdAt: "Mon · 2:26 PM",
        },
      ],
    },
  ],
};

export function staffMessageDraftWarning(drafts: Record<number, string>) {
  return Object.values(drafts).some((draft) => draft.trim())
    ? "You have unsent staff message drafts. Leave Messages and discard them?"
    : null;
}

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
  onResolveRequest,
  onDeclineRequest,
  onEscalateRequest,
  pendingActions,
}: {
  message: StaffMessage;
  canAcknowledge: boolean;
  onAcknowledge?: (messageId: number) => void | Promise<void>;
  canTransition?: boolean;
  canEscalate?: boolean;
  onTransitionRequest?: (
    requestId: number,
    state: "acknowledged" | "in_progress",
  ) => void | Promise<void>;
  onResolveRequest?: (requestId: number) => void | Promise<void>;
  onDeclineRequest?: (requestId: number) => void | Promise<void>;
  onEscalateRequest?: (requestId: number) => void | Promise<void>;
  pendingActions: ReadonlySet<string>;
}) {
  const request = message.request;
  const requestIsActive =
    request && !["resolved", "declined", "expired"].includes(request.state);
  const acknowledgementKey = `acknowledge:${message.id}`;

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
        {message.reminderId && (
          <Button
            component="a"
            href={`/clinic/reminders?reminder_id=${message.reminderId}`}
            size="small"
            sx={{ alignSelf: "flex-start" }}
          >
            Open source reminder
          </Button>
        )}
        {request && (
          <Typography variant="body2" color="text.secondary">
            {request.state.replaceAll("_", " ")} ·{" "}
            {request.assignee_label || "Assigned staff member unavailable"}
            {request.due_at &&
              ` · Due ${new Date(request.due_at).toLocaleString()}`}
            {request.resolution_code && ` · ${request.resolution_code}`}
          </Typography>
        )}
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
                ? "Acknowledgement recorded."
                : "Acknowledgement requested."}
            </Typography>
            {!message.acknowledged && canAcknowledge && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<MarkEmailReadOutlinedIcon />}
                disabled={pendingActions.has(acknowledgementKey)}
                onClick={() => void onAcknowledge?.(message.id)}
              >
                Acknowledge
              </Button>
            )}
          </Stack>
        )}
        {request && requestIsActive && (
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{ alignItems: { sm: "center" } }}
          >
            <Typography variant="body2" color="text.secondary">
              Request: {request.state.replaceAll("_", " ")}
            </Typography>
            {canTransition && request.state === "open" && (
              <Button
                size="small"
                variant="outlined"
                disabled={pendingActions.has(`request:${request.id}`)}
                onClick={() =>
                  void onTransitionRequest?.(request.id, "acknowledged")
                }
              >
                Acknowledge request
              </Button>
            )}
            {canTransition &&
              ["open", "acknowledged"].includes(request.state) && (
                <Button
                  size="small"
                  variant="outlined"
                  disabled={pendingActions.has(`request:${request.id}`)}
                  onClick={() =>
                    void onTransitionRequest?.(request.id, "in_progress")
                  }
                >
                  Start request
                </Button>
              )}
            {canTransition && onResolveRequest && (
              <Button
                size="small"
                variant="outlined"
                disabled={pendingActions.has(`request:${request.id}`)}
                onClick={() => void onResolveRequest?.(request.id)}
              >
                Resolve
              </Button>
            )}
            {canTransition && onDeclineRequest && (
              <Button
                size="small"
                color="inherit"
                variant="outlined"
                disabled={pendingActions.has(`request:${request.id}`)}
                onClick={() => void onDeclineRequest?.(request.id)}
              >
                Decline
              </Button>
            )}
            {canEscalate && (
              <Button
                size="small"
                color="warning"
                variant="outlined"
                disabled={pendingActions.has(`escalate:${request.id}`)}
                onClick={() => void onEscalateRequest?.(request.id)}
              >
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
  onTransitionRequest,
  onResolveRequest,
  onDeclineRequest,
  onEscalateRequest,
  onLoadMoreConversations,
  onLoadEarlierMessages,
  onRetry,
}: StaffMessagingWorkspaceProps) {
  const { registerBlocker } = useClinicNavigation();
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [showUnreadAndUrgentOnly, setShowUnreadAndUrgentOnly] = useState(false);
  const [sendingConversationIds, setSendingConversationIds] = useState<
    Set<number>
  >(new Set());
  const sendingConversationKeys = useRef(new Set<number>());
  const [pendingActions, setPendingActions] = useState<Set<string>>(new Set());
  const pendingActionKeys = useRef(new Set<string>());
  const selectedConversation = useMemo(
    () =>
      state.conversations.find(
        ({ id }) => id === state.selectedConversationId,
      ) ?? state.conversations[0],
    [state.conversations, state.selectedConversationId],
  );
  const draftWarning = staffMessageDraftWarning(drafts);
  const visibleConversations = useMemo(
    () =>
      showUnreadAndUrgentOnly
        ? state.conversations.filter(
            (conversation) => conversation.unread || conversation.urgent,
          )
        : state.conversations,
    [showUnreadAndUrgentOnly, state.conversations],
  );

  useEffect(() => {
    if (!draftWarning) return;
    const unregister = registerBlocker(() => draftWarning);
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = draftWarning;
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", warnBeforeUnload);
    };
  }, [draftWarning, registerBlocker]);

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
    const conversationId = selectedConversation.id;
    const draft = drafts[conversationId] || "";
    const body = draft.trim();
    if (
      !body ||
      !state.canSend ||
      sendingConversationKeys.current.has(conversationId)
    )
      return;
    sendingConversationKeys.current.add(conversationId);
    setSendingConversationIds((current) =>
      new Set(current).add(conversationId),
    );
    try {
      await onSend?.(conversationId, body);
      setDrafts((current) =>
        current[conversationId] === draft
          ? { ...current, [conversationId]: "" }
          : current,
      );
    } catch {
      // The adapter owns the user-visible failure. Keep the draft for retry.
    } finally {
      sendingConversationKeys.current.delete(conversationId);
      setSendingConversationIds((current) => {
        const next = new Set(current);
        next.delete(conversationId);
        return next;
      });
    }
  };

  const runAction = async (key: string, action: () => void | Promise<void>) => {
    if (pendingActionKeys.current.has(key)) return;
    pendingActionKeys.current.add(key);
    setPendingActions((current) => new Set(current).add(key));
    try {
      await action();
    } catch {
      // The live adapter owns the user-visible mutation error.
    } finally {
      pendingActionKeys.current.delete(key);
      setPendingActions((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };

  const selectedDraft = drafts[selectedConversation.id] || "";
  const sending = sendingConversationIds.has(selectedConversation.id);

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
                <Tooltip
                  title={
                    showUnreadAndUrgentOnly
                      ? "Show all conversations"
                      : "Show unread and urgent conversations"
                  }
                >
                  <IconButton
                    size="small"
                    aria-label={
                      showUnreadAndUrgentOnly
                        ? "Show all conversations"
                        : "Show unread and urgent conversations"
                    }
                    aria-pressed={showUnreadAndUrgentOnly}
                    aria-controls="staff-conversation-list"
                    onClick={() =>
                      setShowUnreadAndUrgentOnly((current) => !current)
                    }
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
            {showUnreadAndUrgentOnly && (
              <Box sx={{ px: 2.25, py: 1.25, bgcolor: "action.hover" }}>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: "center", justifyContent: "space-between" }}
                >
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    role="status"
                  >
                    Showing {visibleConversations.length} unread or urgent
                    {visibleConversations.length === 1
                      ? " conversation"
                      : " conversations"}
                  </Typography>
                  <Button
                    size="small"
                    onClick={() => setShowUnreadAndUrgentOnly(false)}
                  >
                    Show all
                  </Button>
                </Stack>
              </Box>
            )}
            <List id="staff-conversation-list" disablePadding>
              {visibleConversations.map((conversation) => (
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
              {visibleConversations.length === 0 && (
                <Box sx={{ px: 2.25, py: 2 }}>
                  <Typography color="text.secondary">
                    No unread or urgent conversations.
                  </Typography>
                </Box>
              )}
            </List>
            {(state.conversationPage || 1) <
              (state.conversationTotalPages || 1) && (
              <Box sx={{ p: 1.5 }}>
                <Button
                  fullWidth
                  variant="outlined"
                  disabled={state.loadingMoreConversations}
                  onClick={() => void onLoadMoreConversations?.()}
                >
                  {state.loadingMoreConversations
                    ? "Loading conversations…"
                    : "Load more conversations"}
                </Button>
              </Box>
            )}
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
                    sx={{ mt: 0.4, overflowWrap: "anywhere" }}
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
              {(selectedConversation.messagePage || 1) > 1 && (
                <Button
                  variant="outlined"
                  disabled={selectedConversation.loadingEarlierMessages}
                  onClick={() =>
                    void onLoadEarlierMessages?.(selectedConversation.id)
                  }
                >
                  {selectedConversation.loadingEarlierMessages
                    ? "Loading earlier messages…"
                    : "Load earlier messages"}
                </Button>
              )}
              {selectedConversation.messages.map((message) => (
                <MessageCard
                  key={message.id}
                  message={message}
                  canAcknowledge={state.canAcknowledge}
                  onAcknowledge={(messageId) =>
                    runAction(`acknowledge:${messageId}`, () =>
                      onAcknowledge?.(messageId),
                    )
                  }
                  canTransition={state.canTransition}
                  canEscalate={state.canEscalate}
                  onTransitionRequest={(requestId, requestState) =>
                    runAction(`request:${requestId}`, () =>
                      onTransitionRequest?.(requestId, requestState),
                    )
                  }
                  onResolveRequest={(requestId) =>
                    runAction(`request:${requestId}`, () =>
                      onResolveRequest?.(requestId),
                    )
                  }
                  onDeclineRequest={(requestId) =>
                    runAction(`request:${requestId}`, () =>
                      onDeclineRequest?.(requestId),
                    )
                  }
                  onEscalateRequest={(requestId) =>
                    runAction(`escalate:${requestId}`, () =>
                      onEscalateRequest?.(requestId),
                    )
                  }
                  pendingActions={pendingActions}
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
                    value={selectedDraft}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [selectedConversation.id]: event.target.value,
                      }))
                    }
                    disabled={!state.canSend || sending}
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
                      disabled={
                        !state.canSend ||
                        sending ||
                        selectedDraft.trim().length === 0
                      }
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
