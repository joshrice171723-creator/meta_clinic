import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
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
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
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
  senderMembershipId?: number | null;
  sender: string;
  senderEmail: string;
  body: string;
  messageClass: StaffMessageClass;
  createdAt: string;
  createdAtExact?: string;
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

export type StaffParticipant = {
  id: number;
  email: string;
  displayName: string | null;
};

export type StaffConversation = {
  id: number;
  title: string;
  kind: "direct" | "team" | "role";
  status: "active" | "archived" | "locked";
  unread: boolean;
  urgent: boolean;
  unresolved: boolean;
  participants: Array<string | StaffParticipant>;
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
  onMarkRead?: (conversationId: number) => void | Promise<void>;
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

function participantSummary(participants: StaffConversation["participants"]) {
  return participants
    .map((participant) =>
      typeof participant === "string"
        ? participant.includes("@")
          ? "Participant identity unavailable"
          : participant
        : participant.displayName || "Participant identity unavailable",
    )
    .join(" | ");
}

function participantDetails(participants: StaffConversation["participants"]) {
  return participants.map((participant, index) =>
    typeof participant === "string"
      ? {
          key: `${participant}:${index}`,
          label: "Participant",
          identity: participant,
        }
      : {
          key: String(participant.id),
          label: participant.displayName || "Participant identity unavailable",
          identity: participant.email || "Exact identity unavailable",
        },
  );
}

function messageSenderKey(message: StaffMessage): string {
  if (message.senderMembershipId != null) {
    return `membership:${message.senderMembershipId}`;
  }
  const email = message.senderEmail.trim().toLowerCase();
  return email ? `email:${email}` : `message:${message.id}`;
}

function groupConsecutiveMessages(messages: StaffMessage[]) {
  return messages.reduce<
    Array<{ key: string; senderKey: string; messages: StaffMessage[] }>
  >((groups, message) => {
    const senderKey = messageSenderKey(message);
    const currentGroup = groups[groups.length - 1];
    if (currentGroup?.senderKey === senderKey) {
      currentGroup.messages.push(message);
    } else {
      groups.push({
        key: `${senderKey}:${message.id}`,
        senderKey,
        messages: [message],
      });
    }
    return groups;
  }, []);
}

function shortMessageTime(value: string): string {
  const time = new Date(value);
  return Number.isNaN(time.valueOf())
    ? value || "Time unavailable"
    : new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(time);
}

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
  showSender,
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
  showSender: boolean;
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
    <Box
      component="article"
      sx={{
        px: { xs: 1, sm: 1.5 },
        py: 1.25,
        borderLeft:
          message.acknowledgementRequired && !message.acknowledged
            ? "3px solid"
            : "3px solid transparent",
        borderLeftColor:
          message.acknowledgementRequired && !message.acknowledged
            ? "warning.main"
            : "transparent",
        bgcolor:
          message.messageClass === "urgent"
            ? "action.hover"
            : "transparent",
      }}
    >
      <Stack spacing={0.75}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "center", justifyContent: "space-between" }}
        >
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", minWidth: 0, flex: 1 }}
          >
            {showSender && (
              <>
                <Avatar
                  sx={{
                    width: 30,
                    height: 30,
                    bgcolor: "primary.main",
                    color: "primary.contrastText",
                    fontSize: 13,
                  }}
                >
                  {(message.sender.trim() || "?").slice(0, 1)}
                </Avatar>
                <Typography
                  sx={{
                    fontWeight: 650,
                    overflowWrap: "anywhere",
                    minWidth: 0,
                  }}
                >
                  {message.sender.trim() || "Unknown sender"}
                </Typography>
              </>
            )}
            <Typography
              component="time"
              dateTime={message.createdAtExact || undefined}
              variant="body2"
              color="text.secondary"
              sx={{
                ml: "auto",
                whiteSpace: "nowrap",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {shortMessageTime(message.createdAt)}
            </Typography>
          </Stack>
          {message.messageClass !== "routine" && (
            <Chip
              size="small"
              label={classLabel[message.messageClass]}
              color={classColor[message.messageClass]}
            />
          )}
        </Stack>
        <Typography
          sx={{
            lineHeight: 1.5,
            overflowWrap: "anywhere",
            pl: showSender ? 5 : 0,
          }}
        >
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
            useFlexGap
            sx={{ alignItems: { sm: "center" }, flexWrap: "wrap" }}
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
    </Box>
  );
}

export function StaffMessagingWorkspace({
  state = fixtureState,
  onSelectConversation,
  onMarkRead,
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

  const activeConversationCount = state.conversations.filter(
    ({ status }) => status === "active",
  ).length;
  const activeConversationLabel =
    activeConversationCount === 1
      ? "1 active conversation"
      : `${activeConversationCount} active conversations`;

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
      component="section"
      aria-labelledby="staff-messaging-heading"
      sx={{
        maxWidth: 1440,
        mx: "auto",
        p: { xs: 1.5, sm: 2 },
        minWidth: 0,
      }}
    >
      <Stack spacing={1.5}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          sx={{
            alignItems: { sm: "flex-end" },
            justifyContent: "space-between",
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography
              id="staff-messaging-heading"
              component="h1"
              variant="h4"
            >
              Staff messages
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 0.5, maxWidth: "62ch" }}
            >
              A focused inbox for accountable team communication,
              acknowledgement, and next actions.
            </Typography>
          </Box>
          <Chip
            label={activeConversationLabel}
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
            gap: 1.5,
            alignItems: "start",
          }}
        >
          <Paper
            component="nav"
            aria-label="Staff conversations"
            variant="outlined"
            sx={{ minWidth: 0, overflow: "hidden" }}
          >
            <Box sx={{ p: 1.5, bgcolor: "background.paper" }}>
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: "center", justifyContent: "space-between" }}
              >
                <Typography component="h2" variant="h6">
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
                    px: 1.5,
                    py: 1.25,
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
                          fontWeight: conversation.unread ? 650 : 600,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {conversation.title}
                      </Typography>
                      <ConversationBadge conversation={conversation} />
                    </Stack>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ overflowWrap: "anywhere" }}
                    >
                      {participantSummary(conversation.participants)}
                    </Typography>
                    <Stack
                      direction="row"
                      spacing={0.75}
                      useFlexGap
                      sx={{
                        flexWrap: "wrap",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <Typography variant="body2" color="text.secondary">
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
            <Box sx={{ p: { xs: 1, sm: 1.5 }, bgcolor: "background.paper" }}>
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
                    variant="h2"
                    sx={{ overflowWrap: "anywhere" }}
                  >
                    {selectedConversation.title}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 0.4, overflowWrap: "anywhere" }}
                  >
                    {selectedConversation.kind} ·{" "}
                    {participantSummary(selectedConversation.participants)}
                  </Typography>
                  <Accordion
                    disableGutters
                    elevation={0}
                    sx={{
                      mt: 0.5,
                      bgcolor: "transparent",
                      "&::before": { display: "none" },
                    }}
                  >
                    <AccordionSummary
                      expandIcon={<ExpandMoreRoundedIcon />}
                      sx={{
                        minHeight: 32,
                        px: 0,
                        "& .MuiAccordionSummary-content": { my: 0.25 },
                      }}
                    >
                      <Typography variant="caption" color="text.secondary">
                        Exact participant identities
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ px: 0, pt: 0 }}>
                      <Stack spacing={0.25}>
                        {participantDetails(
                          selectedConversation.participants,
                        ).map((participant) => (
                          <Typography
                            key={participant.key}
                            variant="body2"
                            color="text.secondary"
                            sx={{ overflowWrap: "anywhere" }}
                          >
                            {participant.label} · {participant.identity}
                          </Typography>
                        ))}
                      </Stack>
                    </AccordionDetails>
                  </Accordion>
                </Box>
                <Stack
                  direction="row"
                  spacing={0.75}
                  useFlexGap
                  sx={{ flexWrap: "wrap", alignItems: "center" }}
                >
                  {selectedConversation.urgent && (
                    <Chip size="small" label="Urgent" color="error" />
                  )}
                  {selectedConversation.unread && onMarkRead && (
                    <Button
                      size="small"
                      variant="text"
                      startIcon={<MarkEmailReadOutlinedIcon />}
                      onClick={() => void onMarkRead(selectedConversation.id)}
                    >
                      Mark as read
                    </Button>
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
            <Stack spacing={1.25} sx={{ p: { xs: 1, sm: 1.5 }, minWidth: 0 }}>
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
              {groupConsecutiveMessages(selectedConversation.messages).map(
                (group, groupIndex) => (
                  <Box key={group.key} component="section" sx={{ minWidth: 0 }}>
                    {group.messages.map((message, messageIndex) => (
                      <Fragment key={message.id}>
                        <MessageCard
                          message={message}
                          showSender={messageIndex === 0}
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
                        {messageIndex < group.messages.length - 1 && (
                          <Divider sx={{ ml: { xs: 1, sm: 1.5 } }} />
                        )}
                      </Fragment>
                    ))}
                    <Accordion
                      disableGutters
                      elevation={0}
                      square
                      sx={{
                        borderTop: 1,
                        borderColor: "divider",
                        bgcolor: "transparent",
                        "&:before": { display: "none" },
                      }}
                    >
                      <AccordionSummary
                        id={`message-details-heading-${selectedConversation.id}-${groupIndex}`}
                        aria-controls={`message-details-panel-${selectedConversation.id}-${groupIndex}`}
                        expandIcon={<ExpandMoreRoundedIcon />}
                        sx={{
                          minHeight: 40,
                          px: 1,
                          "& .MuiAccordionSummary-content": { my: 0.75 },
                        }}
                      >
                        <Typography variant="body2" color="text.secondary">
                          Exact sender and timestamp details
                        </Typography>
                      </AccordionSummary>
                      <AccordionDetails
                        id={`message-details-panel-${selectedConversation.id}-${groupIndex}`}
                        sx={{ pt: 0, px: 1 }}
                      >
                        <Stack spacing={1}>
                          {group.messages.map((message, messageIndex) => {
                            const senderName = message.sender.trim() || "Unknown sender";
                            const exactTime =
                              message.createdAtExact ||
                              message.createdAt ||
                              "Timestamp unavailable";
                            return (
                              <Box key={message.id}>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                  Message {messageIndex + 1} · {senderName}
                                </Typography>
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{ overflowWrap: "anywhere" }}
                                >
                                  Email: {message.senderEmail || "Unavailable"}
                                </Typography>
                                <Typography
                                  component="time"
                                  dateTime={message.createdAtExact || undefined}
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{
                                    overflowWrap: "anywhere",
                                    fontVariantNumeric: "tabular-nums",
                                  }}
                                >
                                  {exactTime}
                                </Typography>
                              </Box>
                            );
                          })}
                        </Stack>
                      </AccordionDetails>
                    </Accordion>
                  </Box>
                ),
              )}
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
                        ? "This draft is for the selected conversation. Send it when it is ready."
                        : "You do not have permission to send in this conversation."
                    }
                  />
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1}
                    useFlexGap
                    sx={{
                      flexWrap: "wrap",
                      alignItems: { sm: "center" },
                      justifyContent: "space-between",
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
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
