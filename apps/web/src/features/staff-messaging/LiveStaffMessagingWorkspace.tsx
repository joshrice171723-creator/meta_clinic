import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, Stack, TextField } from "@mui/material";
import { api } from "../../api/client";
import { useClinic } from "../clinic/Workspace";
import {
  StaffMessagingWorkspace,
  type StaffConversation,
  type StaffMessage,
  type StaffMessagingState,
} from "./StaffMessagingWorkspace";

type ApiParticipant = { id: number; email: string; active: boolean };
type ApiRequest = {
  id: number;
  state: string;
  assignee_membership_id: number | null;
  due_at: string | null;
  resolved_at: string | null;
  resolution_code: string | null;
};
type ApiMessage = {
  id: number;
  sender_email: string;
  body: string;
  message_class: StaffMessage["messageClass"];
  created_at: string;
  acknowledgement_required: boolean;
  acknowledged_at: string | null;
  request: ApiRequest | null;
};
type ApiConversation = {
  id: number;
  title: string | null;
  kind: StaffConversation["kind"];
  status: StaffConversation["status"];
  unread: boolean;
  urgent: boolean;
  unresolved: boolean;
  participants: ApiParticipant[];
  last_message_at: string | null;
  last_message_class: StaffMessage["messageClass"] | null;
};
type ConversationIndex = { conversations: ApiConversation[] };
type ConversationDetail = { conversation: ApiConversation; messages: ApiMessage[] };

const emptyState: StaffMessagingState = {
  conversations: [],
  selectedConversationId: 0,
  canSend: false,
  canAcknowledge: false,
};

function displayTime(value: string | null): string {
  if (!value) return "No messages";
  const time = new Date(value);
  return Number.isNaN(time.valueOf()) ? value : time.toLocaleString();
}

function participantNames(participants: ApiParticipant[]): string[] {
  return participants.map((participant) => participant.email);
}

function mapConversation(
  conversation: ApiConversation,
  messages: ApiMessage[] = [],
): StaffConversation {
  return {
    id: conversation.id,
    title: conversation.title || "Untitled conversation",
    kind: conversation.kind,
    status: conversation.status,
    unread: conversation.unread,
    urgent: conversation.urgent,
    unresolved: conversation.unresolved,
    participants: participantNames(conversation.participants),
    lastMessageAt: displayTime(conversation.last_message_at),
    lastMessageClass: conversation.last_message_class || "routine",
    messages: messages.map((message) => ({
      id: message.id,
      sender: message.sender_email,
      senderEmail: message.sender_email,
      body: message.body,
      messageClass: message.message_class,
      createdAt: displayTime(message.created_at),
      acknowledgementRequired: message.acknowledgement_required,
      acknowledged: message.acknowledged_at !== null,
      request: message.request,
    })),
  };
}

function capability(
  capabilities: object,
  name: string,
): boolean {
  return (capabilities as Record<string, boolean | undefined>)[name] === true;
}

export function LiveStaffMessagingWorkspace() {
  const { capabilities, current_site, membership_id } = useClinic();
  const [state, setState] = useState<StaffMessagingState>({
    ...emptyState,
    loading: true,
  });
  const [actionError, setActionError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const sendKeys = useRef(new Map<string, string>());
  const escalationKeys = useRef(new Map<number, string>());
  const [createOpen, setCreateOpen] = useState(false);
  const [participants, setParticipants] = useState<ApiParticipant[]>([]);
  const [createKind, setCreateKind] = useState<StaffConversation["kind"]>("direct");
  const [createTitle, setCreateTitle] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const createKey = useRef<string | null>(null);

  async function loadConversation(conversationId: number, version?: number) {
    const currentVersion = version ?? ++requestVersion.current;
    try {
      const detail = await api<ConversationDetail>(
        `/api/clinic/staff-messaging/conversations/${conversationId}?per_page=50`,
      );
      if (currentVersion !== requestVersion.current) return;
      const conversation = mapConversation(detail.conversation, detail.messages);
      setState((current) => ({
        ...current,
        selectedConversationId: conversation.id,
        conversations: current.conversations.map((item) =>
          item.id === conversation.id ? conversation : item,
        ),
      }));
      await api<void>(`/api/clinic/staff-messaging/conversations/${conversationId}/read`, {
        method: "POST",
        body: {},
      });
    } catch (reason) {
      if (currentVersion !== requestVersion.current) return;
      setActionError(reason instanceof Error ? reason.message : "Unable to load this conversation.");
    }
  }

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const index = await api<ConversationIndex>(
        "/api/clinic/staff-messaging/conversations?per_page=50",
      );
      if (version !== requestVersion.current) return;
      const conversations = index.conversations.map((conversation) =>
        mapConversation(conversation),
      );
      const selectedConversationId = conversations[0]?.id || 0;
      setState({
        conversations,
        selectedConversationId,
        canSend: capability(capabilities, "staff_messaging_send"),
        canAcknowledge: capability(capabilities, "staff_messaging_acknowledge"),
        canTransition: capability(capabilities, "staff_messaging_transition"),
        canEscalate: capability(capabilities, "staff_messaging_escalate"),
      });
      if (selectedConversationId) await loadConversation(selectedConversationId, version);
    } catch (reason) {
      if (version !== requestVersion.current) return;
      setState({
        ...emptyState,
        error: reason instanceof Error ? reason.message : "Unable to load staff messages.",
      });
    }
  // Capability changes only occur with a refreshed clinic context/remount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capabilities]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectConversation = (conversationId: number) => {
    setActionError(null);
    void loadConversation(conversationId);
  };

  const send = async (conversationId: number, body: string) => {
    setActionError(null);
    const key = `${conversationId}:${body}`;
    const requestKey = sendKeys.current.get(key) || crypto.randomUUID();
    sendKeys.current.set(key, requestKey);
    try {
      await api<{ message: ApiMessage }>(
        `/api/clinic/staff-messaging/conversations/${conversationId}/messages`,
        { method: "POST", body: { message: { request_key: requestKey, body } } },
      );
      sendKeys.current.delete(key);
      await loadConversation(conversationId);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Unable to send the message.");
      throw reason;
    }
  };

  const acknowledge = async (messageId: number) => {
    setActionError(null);
    try {
      await api<{ message: ApiMessage }>(
        `/api/clinic/staff-messaging/messages/${messageId}/acknowledge`,
        { method: "POST", body: { acknowledgement: {} } },
      );
      await loadConversation(state.selectedConversationId);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Unable to acknowledge the message.");
    }
  };

  const transitionRequest = async (
    requestId: number,
    requestState: "acknowledged" | "in_progress",
  ) => {
    setActionError(null);
    try {
      await api<{ request: ApiRequest }>(
        `/api/clinic/staff-messaging/requests/${requestId}/transition`,
        { method: "POST", body: { transition: { state: requestState } } },
      );
      await loadConversation(state.selectedConversationId);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Unable to transition the request.");
    }
  };

  const escalateRequest = async (requestId: number) => {
    setActionError(null);
    const requestKey = escalationKeys.current.get(requestId) || crypto.randomUUID();
    escalationKeys.current.set(requestId, requestKey);
    try {
      await api<{ escalation: { id: number } }>(
        `/api/clinic/staff-messaging/requests/${requestId}/escalate`,
        { method: "POST", body: { escalation: { request_key: requestKey, trigger: "manual" } } },
      );
      escalationKeys.current.delete(requestId);
      await loadConversation(state.selectedConversationId);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Unable to escalate the request.");
    }
  };

  const openCreate = async () => {
    setActionError(null);
    try {
      const result = await api<{ participants: ApiParticipant[] }>("/api/clinic/staff-messaging/participants");
      setParticipants(result.participants.filter((participant) => participant.active && participant.id !== membership_id));
      setCreateOpen(true);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Unable to load staff participants.");
    }
  };

  const createConversation = async () => {
    const memberId = Number(recipientId);
    if (!Number.isInteger(memberId) || memberId < 1) {
      setActionError("Choose a staff participant before creating the conversation.");
      return;
    }
    if ((createKind === "team" || createKind === "role") && !createTitle.trim()) {
      setActionError("Enter a title for this conversation.");
      return;
    }
    setActionError(null);
    const requestKey = createKey.current || crypto.randomUUID();
    createKey.current = requestKey;
    try {
      const result = await api<{ conversation: ApiConversation }>("/api/clinic/staff-messaging/conversations", {
        method: "POST",
        body: { conversation: { request_key: requestKey, kind: createKind, title: createTitle.trim() || undefined, site_id: current_site?.id, member_ids: [memberId] } },
      });
      createKey.current = null;
      setCreateOpen(false);
      const conversation = mapConversation(result.conversation);
      setState((current) => ({ ...current, selectedConversationId: conversation.id, conversations: [conversation, ...current.conversations.filter((item) => item.id !== conversation.id)] }));
      await loadConversation(conversation.id);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Unable to create the conversation.");
    }
  };

  return (
    <Stack spacing={2}>
      {actionError && (
        <Alert severity="error" action={<Button color="inherit" onClick={() => setActionError(null)}>Dismiss</Button>}>
          {actionError}
        </Alert>
      )}
      {capability(capabilities, "staff_messaging_create_conversation") && (
        <Button variant="outlined" sx={{ alignSelf: "flex-start" }} onClick={() => void openCreate()}>
          New conversation
        </Button>
      )}
      <StaffMessagingWorkspace
        state={state}
        onSelectConversation={selectConversation}
        onSend={send}
        onAcknowledge={acknowledge}
        onTransitionRequest={transitionRequest}
        onEscalateRequest={escalateRequest}
        onRetry={() => void load()}
      />
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>New staff conversation</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <FormControl fullWidth>
              <InputLabel id="conversation-kind-label">Conversation type</InputLabel>
              <Select labelId="conversation-kind-label" label="Conversation type" value={createKind} onChange={(event) => setCreateKind(event.target.value as StaffConversation["kind"])}>
                <MenuItem value="direct">Direct</MenuItem>
                <MenuItem value="team">Team</MenuItem>
                <MenuItem value="role">Role</MenuItem>
              </Select>
            </FormControl>
            {createKind !== "direct" && <TextField label="Conversation title" value={createTitle} onChange={(event) => setCreateTitle(event.target.value)} inputProps={{ maxLength: 120 }} />}
            <FormControl fullWidth>
              <InputLabel id="conversation-recipient-label">Staff participant</InputLabel>
              <Select labelId="conversation-recipient-label" label="Staff participant" value={recipientId} onChange={(event) => setRecipientId(event.target.value)}>
                {participants.map((participant) => <MenuItem key={participant.id} value={String(participant.id)}>{participant.email}</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setCreateOpen(false)}>Cancel</Button><Button variant="contained" onClick={() => void createConversation()}>Create conversation</Button></DialogActions>
      </Dialog>
    </Stack>
  );
}

export const StaffMessagingPage = LiveStaffMessagingWorkspace;
