import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, Stack, TextField } from "@mui/material";
import { api } from "../../api/client";
import { useClinic } from "../clinic/Workspace";
import { StaffMessagingWorkspace, type StaffConversation, type StaffMessage, type StaffMessagingState, type StaffRequestTransitionState } from "./StaffMessagingWorkspace";

type ApiParticipant = { id: number; email: string; active: boolean };
type ApiRequest = { id: number; state: string; assignee_membership_id: number | null; due_at: string | null; resolved_at: string | null; resolution_code: string | null };
type ApiMessage = { id: number; sender_email: string; body: string; message_class: StaffMessage["messageClass"]; created_at: string; acknowledgement_required: boolean; acknowledged_at: string | null; request: ApiRequest | null };
type ApiConversation = { id: number; title: string | null; kind: StaffConversation["kind"]; status: StaffConversation["status"]; unread: boolean; urgent: boolean; unresolved: boolean; participants: ApiParticipant[]; last_message_at: string | null; last_message_class: StaffMessage["messageClass"] | null };
type Pagination = { page: number; per_page: number; total: number; total_pages: number };
type ConversationIndex = { conversations: ApiConversation[]; pagination: Pagination };
type ConversationDetail = { conversation: ApiConversation; messages: ApiMessage[]; pagination: Pagination };
type RecoveryResult = {
  outbox: { considered: number; delivered: number; retried: number; quarantined: number; skipped: number };
  overdue_requests: { considered: number; escalated: number; blocked: number; skipped: number };
};

const PAGE_SIZE = 50;
const emptyState: StaffMessagingState = { conversations: [], selectedConversationId: 0, canSend: false, canAcknowledge: false, conversationPage: 1, conversationTotalPages: 1 };

function displayTime(value: string | null): string {
  if (!value) return "No messages";
  const time = new Date(value);
  return Number.isNaN(time.valueOf()) ? value : time.toLocaleString();
}

function mapConversation(conversation: ApiConversation, messages: ApiMessage[] = [], pagination?: Pagination): StaffConversation {
  return {
    id: conversation.id,
    title: conversation.title || "Untitled conversation",
    kind: conversation.kind,
    status: conversation.status,
    unread: conversation.unread,
    urgent: conversation.urgent,
    unresolved: conversation.unresolved,
    participants: conversation.participants.map((participant) => participant.email),
    lastMessageAt: displayTime(conversation.last_message_at),
    lastMessageClass: conversation.last_message_class || "routine",
    messages: messages.map((message) => ({ id: message.id, sender: message.sender_email, senderEmail: message.sender_email, body: message.body, messageClass: message.message_class, createdAt: displayTime(message.created_at), acknowledgementRequired: message.acknowledgement_required, acknowledged: message.acknowledged_at !== null, request: message.request })),
    messagePage: pagination?.page,
    messageTotalPages: pagination?.total_pages,
  };
}

function capability(capabilities: object, name: string): boolean {
  return (capabilities as Record<string, boolean | undefined>)[name] === true;
}

function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}

export function LiveStaffMessagingWorkspace() {
  const { capabilities, current_site, membership_id } = useClinic();
  const scopeKey = `${membership_id ?? "none"}:${current_site?.id ?? "all"}`;
  const scopeKeyRef = useRef(scopeKey);
  scopeKeyRef.current = scopeKey;
  const mounted = useRef(true);
  const indexRequestVersion = useRef(0);
  const detailRequestVersion = useRef(0);
  const recoveryRequestVersion = useRef(0);
  const selectedConversationId = useRef(0);
  const stateRef = useRef<StaffMessagingState>({ ...emptyState, loading: true });
  const sendKeys = useRef(new Map<string, string>());
  const escalationKeys = useRef(new Map<number, string>());
  const inFlightMutations = useRef(new Set<string>());
  const createAttempt = useRef<{ signature: string; key: string } | null>(null);
  const creatingRef = useRef(false);
  const recoveringRef = useRef(false);

  const [state, setState] = useState<StaffMessagingState>(stateRef.current);
  stateRef.current = state;
  const [actionError, setActionError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [participants, setParticipants] = useState<ApiParticipant[]>([]);
  const [createKind, setCreateKind] = useState<StaffConversation["kind"]>("direct");
  const [createTitle, setCreateTitle] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [creating, setCreating] = useState(false);
  const [resolution, setResolution] = useState<{ requestId: number; conversationId: number } | null>(null);
  const [resolutionCode, setResolutionCode] = useState("");
  const [resolving, setResolving] = useState(false);
  const [recovery, setRecovery] = useState<{ conversationId: number; title: string } | null>(null);
  const [recoveryParticipants, setRecoveryParticipants] = useState<ApiParticipant[]>([]);
  const [recoveryTargetId, setRecoveryTargetId] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryResult, setRecoveryResult] = useState<RecoveryResult | null>(null);

  const isCurrentScope = useCallback((requestScope: string) => mounted.current && scopeKeyRef.current === requestScope, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      indexRequestVersion.current += 1;
      detailRequestVersion.current += 1;
      recoveryRequestVersion.current += 1;
    };
  }, []);

  useEffect(() => {
    indexRequestVersion.current += 1;
    detailRequestVersion.current += 1;
    recoveryRequestVersion.current += 1;
    selectedConversationId.current = 0;
    sendKeys.current.clear();
    escalationKeys.current.clear();
    inFlightMutations.current.clear();
    createAttempt.current = null;
    creatingRef.current = false;
    recoveringRef.current = false;
    setCreating(false);
    setCreateOpen(false);
    setParticipants([]);
    setCreateKind("direct");
    setCreateTitle("");
    setRecipientId("");
    setActionError(null);
    setResolution(null);
    setResolutionCode("");
    setResolving(false);
    setRecovery(null);
    setRecoveryParticipants([]);
    setRecoveryTargetId("");
    setRecoveryLoading(false);
    setRecovering(false);
    setRecoveryError(null);
    setRecoveryResult(null);
  }, [scopeKey]);

  const loadConversation = useCallback(async (conversationId: number) => {
    const requestScope = scopeKey;
    const requestVersion = ++detailRequestVersion.current;
    try {
      let detail = await api<ConversationDetail>(`/api/clinic/staff-messaging/conversations/${conversationId}?page=1&per_page=${PAGE_SIZE}`);
      if (!isCurrentScope(requestScope) || requestVersion !== detailRequestVersion.current || selectedConversationId.current !== conversationId) return;
      const latestPage = Math.max(detail.pagination.total_pages, 1);
      if (latestPage > 1) detail = await api<ConversationDetail>(`/api/clinic/staff-messaging/conversations/${conversationId}?page=${latestPage}&per_page=${PAGE_SIZE}`);
      if (!isCurrentScope(requestScope) || requestVersion !== detailRequestVersion.current || selectedConversationId.current !== conversationId) return;
      const conversation = mapConversation(detail.conversation, detail.messages, detail.pagination);
      setState((current) => ({ ...current, selectedConversationId: conversation.id, conversations: current.conversations.map((item) => item.id === conversation.id ? conversation : item) }));
      try {
        await api<void>(`/api/clinic/staff-messaging/conversations/${conversationId}/read`, { method: "POST", body: {} });
        if (isCurrentScope(requestScope) && selectedConversationId.current === conversationId) {
          setState((current) => ({ ...current, conversations: current.conversations.map((item) => item.id === conversationId ? { ...item, unread: false } : item) }));
        }
      } catch (reason) {
        if (isCurrentScope(requestScope) && selectedConversationId.current === conversationId) setActionError(errorMessage(reason, "Unable to mark this conversation as read."));
      }
    } catch (reason) {
      if (!isCurrentScope(requestScope) || requestVersion !== detailRequestVersion.current || selectedConversationId.current !== conversationId) return;
      setActionError(errorMessage(reason, "Unable to load this conversation."));
    }
  }, [isCurrentScope, scopeKey]);

  const load = useCallback(async () => {
    const requestScope = scopeKey;
    const requestVersion = ++indexRequestVersion.current;
    detailRequestVersion.current += 1;
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const index = await api<ConversationIndex>(`/api/clinic/staff-messaging/conversations?page=1&per_page=${PAGE_SIZE}`);
      if (!isCurrentScope(requestScope) || requestVersion !== indexRequestVersion.current) return;
      const conversations = index.conversations.map((conversation) => mapConversation(conversation));
      const firstConversationId = conversations[0]?.id || 0;
      selectedConversationId.current = firstConversationId;
      setState({ conversations, selectedConversationId: firstConversationId, canSend: capability(capabilities, "staff_messaging_send"), canAcknowledge: capability(capabilities, "staff_messaging_acknowledge"), canTransition: capability(capabilities, "staff_messaging_transition"), canEscalate: capability(capabilities, "staff_messaging_escalate"), conversationPage: index.pagination.page, conversationTotalPages: index.pagination.total_pages });
      if (firstConversationId) await loadConversation(firstConversationId);
    } catch (reason) {
      if (!isCurrentScope(requestScope) || requestVersion !== indexRequestVersion.current) return;
      setState({ ...emptyState, error: errorMessage(reason, "Unable to load staff messages.") });
    }
  }, [capabilities, isCurrentScope, loadConversation, scopeKey]);

  useEffect(() => { void load(); }, [load]);

  const selectConversation = (conversationId: number) => {
    if (conversationId === selectedConversationId.current) return;
    const previousConversationId = selectedConversationId.current;
    recoveryRequestVersion.current += 1;
    selectedConversationId.current = conversationId;
    setRecovery(null);
    setRecoveryParticipants([]);
    setRecoveryTargetId("");
    setRecoveryLoading(false);
    setRecoveryError(null);
    setRecoveryResult(null);
    setActionError(null);
    setState((current) => ({ ...current, selectedConversationId: conversationId, conversations: current.conversations.map((item) => item.id === previousConversationId ? { ...item, loadingEarlierMessages: false } : item) }));
    void loadConversation(conversationId);
  };

  const loadMoreConversations = async () => {
    const current = stateRef.current;
    const nextPage = (current.conversationPage || 1) + 1;
    if (current.loadingMoreConversations || nextPage > (current.conversationTotalPages || 1)) return;
    const requestScope = scopeKey;
    const requestVersion = ++indexRequestVersion.current;
    setState((value) => ({ ...value, loadingMoreConversations: true }));
    try {
      const index = await api<ConversationIndex>(`/api/clinic/staff-messaging/conversations?page=${nextPage}&per_page=${PAGE_SIZE}`);
      if (!isCurrentScope(requestScope) || requestVersion !== indexRequestVersion.current) return;
      setState((value) => {
        const existingIds = new Set(value.conversations.map(({ id }) => id));
        const additional = index.conversations.filter(({ id }) => !existingIds.has(id)).map((conversation) => mapConversation(conversation));
        return { ...value, conversations: [...value.conversations, ...additional], conversationPage: index.pagination.page, conversationTotalPages: index.pagination.total_pages, loadingMoreConversations: false };
      });
    } catch (reason) {
      if (!isCurrentScope(requestScope) || requestVersion !== indexRequestVersion.current) return;
      setState((value) => ({ ...value, loadingMoreConversations: false }));
      setActionError(errorMessage(reason, "Unable to load more conversations."));
    }
  };

  const loadEarlierMessages = async (conversationId: number) => {
    const conversation = stateRef.current.conversations.find(({ id }) => id === conversationId);
    const currentPage = conversation?.messagePage || 1;
    if (!conversation || conversation.loadingEarlierMessages || currentPage <= 1) return;
    const requestScope = scopeKey;
    const requestVersion = ++detailRequestVersion.current;
    setState((current) => ({ ...current, conversations: current.conversations.map((item) => item.id === conversationId ? { ...item, loadingEarlierMessages: true } : item) }));
    try {
      const detail = await api<ConversationDetail>(`/api/clinic/staff-messaging/conversations/${conversationId}?page=${currentPage - 1}&per_page=${PAGE_SIZE}`);
      if (!isCurrentScope(requestScope) || requestVersion !== detailRequestVersion.current || selectedConversationId.current !== conversationId) return;
      setState((current) => ({ ...current, conversations: current.conversations.map((item) => {
        if (item.id !== conversationId) return item;
        const existingIds = new Set(item.messages.map(({ id }) => id));
        const earlier = mapConversation(detail.conversation, detail.messages, detail.pagination).messages.filter(({ id }) => !existingIds.has(id));
        return { ...item, messages: [...earlier, ...item.messages], messagePage: detail.pagination.page, messageTotalPages: detail.pagination.total_pages, loadingEarlierMessages: false };
      }) }));
    } catch (reason) {
      if (!isCurrentScope(requestScope) || requestVersion !== detailRequestVersion.current || selectedConversationId.current !== conversationId) return;
      setState((current) => ({ ...current, conversations: current.conversations.map((item) => item.id === conversationId ? { ...item, loadingEarlierMessages: false } : item) }));
      setActionError(errorMessage(reason, "Unable to load earlier messages."));
    }
  };

  const withMutationLock = async (key: string, action: () => Promise<void>) => {
    if (inFlightMutations.current.has(key)) return;
    inFlightMutations.current.add(key);
    try { await action(); } finally { inFlightMutations.current.delete(key); }
  };

  const send = async (conversationId: number, body: string) => withMutationLock(`${scopeKey}:send:${conversationId}`, async () => {
    const requestScope = scopeKey;
    setActionError(null);
    const key = `${conversationId}:${body}`;
    const requestKey = sendKeys.current.get(key) || crypto.randomUUID();
    sendKeys.current.set(key, requestKey);
    try {
      await api<{ message: ApiMessage }>(`/api/clinic/staff-messaging/conversations/${conversationId}/messages`, { method: "POST", body: { message: { request_key: requestKey, body } } });
      if (!isCurrentScope(requestScope)) return;
      sendKeys.current.delete(key);
      if (selectedConversationId.current === conversationId) await loadConversation(conversationId);
    } catch (reason) {
      if (isCurrentScope(requestScope) && selectedConversationId.current === conversationId) setActionError(errorMessage(reason, "Unable to send the message."));
      throw reason;
    }
  });

  const acknowledge = async (messageId: number) => withMutationLock(`${scopeKey}:acknowledge:${messageId}`, async () => {
    const requestScope = scopeKey;
    const conversationId = selectedConversationId.current;
    setActionError(null);
    try {
      await api<{ message: ApiMessage }>(`/api/clinic/staff-messaging/messages/${messageId}/acknowledge`, { method: "POST", body: { acknowledgement: {} } });
      if (isCurrentScope(requestScope) && selectedConversationId.current === conversationId) await loadConversation(conversationId);
    } catch (reason) {
      if (isCurrentScope(requestScope) && selectedConversationId.current === conversationId) setActionError(errorMessage(reason, "Unable to acknowledge the message."));
      throw reason;
    }
  });

  const transitionRequest = async (requestId: number, requestState: StaffRequestTransitionState, resolutionCode?: string) => withMutationLock(`${scopeKey}:request:${requestId}`, async () => {
    const requestScope = scopeKey;
    const conversationId = selectedConversationId.current;
    setActionError(null);
    try {
      await api<{ request: ApiRequest }>(`/api/clinic/staff-messaging/requests/${requestId}/transition`, { method: "POST", body: { transition: { state: requestState, resolution_code: resolutionCode } } });
      if (isCurrentScope(requestScope) && selectedConversationId.current === conversationId) await loadConversation(conversationId);
    } catch (reason) {
      if (isCurrentScope(requestScope) && selectedConversationId.current === conversationId) setActionError(errorMessage(reason, "Unable to transition the request."));
      throw reason;
    }
  });

  const escalateRequest = async (requestId: number) => withMutationLock(`${scopeKey}:escalate:${requestId}`, async () => {
    const requestScope = scopeKey;
    const conversationId = selectedConversationId.current;
    setActionError(null);
    const requestKey = escalationKeys.current.get(requestId) || crypto.randomUUID();
    escalationKeys.current.set(requestId, requestKey);
    try {
      await api<{ escalation: { id: number } }>(`/api/clinic/staff-messaging/requests/${requestId}/escalate`, { method: "POST", body: { escalation: { request_key: requestKey, trigger: "manual" } } });
      if (!isCurrentScope(requestScope)) return;
      escalationKeys.current.delete(requestId);
      if (selectedConversationId.current === conversationId) await loadConversation(conversationId);
    } catch (reason) {
      if (isCurrentScope(requestScope) && selectedConversationId.current === conversationId) setActionError(errorMessage(reason, "Unable to escalate the request."));
      throw reason;
    }
  });

  const openCreate = async () => {
    const requestScope = scopeKey;
    setActionError(null);
    try {
      const result = await api<{ participants: ApiParticipant[] }>("/api/clinic/staff-messaging/participants");
      if (!isCurrentScope(requestScope)) return;
      setParticipants(result.participants.filter((participant) => participant.active && participant.id !== membership_id));
      setCreateOpen(true);
    } catch (reason) {
      if (isCurrentScope(requestScope)) setActionError(errorMessage(reason, "Unable to load staff participants."));
    }
  };

  const openRecovery = async () => {
    const conversationId = selectedConversationId.current;
    if (!conversationId) return;
    const selected = stateRef.current.conversations.find((conversation) => conversation.id === conversationId);
    const requestScope = scopeKey;
    const requestVersion = ++recoveryRequestVersion.current;
    setActionError(null);
    setRecovery({ conversationId, title: selected?.title || "Selected conversation" });
    setRecoveryParticipants([]);
    setRecoveryTargetId("");
    setRecoveryError(null);
    setRecoveryResult(null);
    setRecoveryLoading(true);
    try {
      const detail = await api<ConversationDetail>(`/api/clinic/staff-messaging/conversations/${conversationId}?page=1&per_page=1`);
      if (!isCurrentScope(requestScope) || requestVersion !== recoveryRequestVersion.current || selectedConversationId.current !== conversationId) return;
      if (detail.conversation.id !== conversationId) {
        setRecoveryError("The participant response did not match the selected conversation.");
        return;
      }
      setRecovery({ conversationId, title: detail.conversation.title || "Untitled conversation" });
      setRecoveryParticipants(detail.conversation.participants.filter((participant) => participant.active && participant.id !== membership_id));
    } catch (reason) {
      if (isCurrentScope(requestScope) && requestVersion === recoveryRequestVersion.current && selectedConversationId.current === conversationId) {
        setRecoveryError(errorMessage(reason, "Unable to load this conversation's active participants."));
      }
    } finally {
      if (isCurrentScope(requestScope) && requestVersion === recoveryRequestVersion.current && selectedConversationId.current === conversationId) setRecoveryLoading(false);
    }
  };

  const closeRecovery = () => {
    if (recoveringRef.current) return;
    recoveryRequestVersion.current += 1;
    setRecovery(null);
    setRecoveryParticipants([]);
    setRecoveryTargetId("");
    setRecoveryLoading(false);
    setRecoveryError(null);
    setRecoveryResult(null);
  };

  const recoverConversation = async () => {
    if (!recovery) return;
    const conversationId = recovery.conversationId;
    const requestScope = scopeKey;
    const requestVersion = recoveryRequestVersion.current;
    const target = recoveryTargetId ? recoveryParticipants.find((participant) => String(participant.id) === recoveryTargetId) : undefined;
    if (recoveryTargetId && !target) {
      setRecoveryError("Choose an active backup from this conversation.");
      return;
    }

    await withMutationLock(`${scopeKey}:recover:${conversationId}`, async () => {
      recoveringRef.current = true;
      setRecovering(true);
      setRecoveryError(null);
      setRecoveryResult(null);
      try {
        const result = await api<RecoveryResult>(`/api/clinic/staff-messaging/conversations/${conversationId}/recover`, {
          method: "POST",
          body: { recovery: { target_membership_id: target?.id ?? null } },
        });
        if (!isCurrentScope(requestScope) || requestVersion !== recoveryRequestVersion.current || selectedConversationId.current !== conversationId) return;
        setRecoveryResult(result);
        await loadConversation(conversationId);
      } catch (reason) {
        if (isCurrentScope(requestScope) && requestVersion === recoveryRequestVersion.current && selectedConversationId.current === conversationId) {
          setRecoveryError(errorMessage(reason, "Unable to recover this conversation."));
        }
      } finally {
        recoveringRef.current = false;
        if (isCurrentScope(requestScope) && requestVersion === recoveryRequestVersion.current && selectedConversationId.current === conversationId) setRecovering(false);
      }
    });
  };

  const resolveRequest = async () => {
    if (!resolution || resolving || !resolutionCode.trim()) return;
    const requestScope = scopeKey;
    setResolving(true);
    try {
      await transitionRequest(resolution.requestId, "resolved", resolutionCode.trim());
      if (isCurrentScope(requestScope)) setResolution(null);
    } catch {
      // Keep the entered resolution for retry; the mutation displays the server error.
    } finally {
      if (isCurrentScope(requestScope)) setResolving(false);
    }
  };

  const closeCreate = () => {
    if (creatingRef.current) return;
    createAttempt.current = null;
    setCreateOpen(false);
  };

  const createConversation = async () => {
    if (creatingRef.current) return;
    const memberId = Number(recipientId);
    const title = createTitle.trim();
    if (!Number.isInteger(memberId) || memberId < 1) { setActionError("Choose a staff participant before creating the conversation."); return; }
    if ((createKind === "team" || createKind === "role") && !title) { setActionError("Enter a title for this conversation."); return; }
    const requestScope = scopeKey;
    const signature = JSON.stringify({ kind: createKind, title, siteId: current_site?.id ?? null, memberIds: [memberId] });
    if (!createAttempt.current || createAttempt.current.signature !== signature) createAttempt.current = { signature, key: crypto.randomUUID() };
    const requestKey = createAttempt.current.key;
    creatingRef.current = true;
    setCreating(true);
    setActionError(null);
    try {
      const result = await api<{ conversation: ApiConversation }>("/api/clinic/staff-messaging/conversations", { method: "POST", body: { conversation: { request_key: requestKey, kind: createKind, title: title || undefined, site_id: current_site?.id, member_ids: [memberId] } } });
      if (!isCurrentScope(requestScope) || createAttempt.current?.signature !== signature) return;
      createAttempt.current = null;
      setCreateOpen(false);
      const conversation = mapConversation(result.conversation);
      selectedConversationId.current = conversation.id;
      setState((current) => ({ ...current, selectedConversationId: conversation.id, conversations: [conversation, ...current.conversations.filter((item) => item.id !== conversation.id)] }));
      await loadConversation(conversation.id);
    } catch (reason) {
      if (isCurrentScope(requestScope)) setActionError(errorMessage(reason, "Unable to create the conversation."));
    } finally {
      if (isCurrentScope(requestScope)) { creatingRef.current = false; setCreating(false); }
    }
  };

  return (
    <Stack spacing={2}>
      {actionError && <Alert severity="error" action={<Button color="inherit" onClick={() => setActionError(null)}>Dismiss</Button>}>{actionError}</Alert>}
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        {capability(capabilities, "staff_messaging_create_conversation") && <Button variant="outlined" onClick={() => void openCreate()}>New conversation</Button>}
        {capability(capabilities, "staff_messaging_escalate") && state.selectedConversationId > 0 && <Button variant="outlined" onClick={() => void openRecovery()}>Recover conversation</Button>}
      </Stack>
      <StaffMessagingWorkspace key={scopeKey} state={state} onSelectConversation={selectConversation} onSend={send} onAcknowledge={acknowledge} onTransitionRequest={transitionRequest} onResolveRequest={(requestId) => { setActionError(null); setResolutionCode(""); setResolution({ requestId, conversationId: selectedConversationId.current }); }} onDeclineRequest={(requestId) => transitionRequest(requestId, "declined")} onEscalateRequest={escalateRequest} onLoadMoreConversations={loadMoreConversations} onLoadEarlierMessages={loadEarlierMessages} onRetry={() => void load()} />
      <Dialog open={resolution !== null} onClose={() => { if (!resolving) setResolution(null); }} fullWidth maxWidth="sm">
        <DialogTitle>Resolve staff request</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {actionError && <Alert severity="error">{actionError}</Alert>}
            <TextField autoFocus fullWidth required disabled={resolving} label="Resolution code or reason" value={resolutionCode} onChange={(event) => setResolutionCode(event.target.value)} inputProps={{ maxLength: 120 }} />
          </Stack>
        </DialogContent>
        <DialogActions><Button disabled={resolving} onClick={() => setResolution(null)}>Cancel</Button><Button disabled={resolving || !resolutionCode.trim()} onClick={() => void resolveRequest()}>{resolving ? "Resolving…" : "Resolve request"}</Button></DialogActions>
      </Dialog>
      <Dialog open={recovery !== null} onClose={closeRecovery} fullWidth maxWidth="sm">
        <DialogTitle>Recover {recovery?.title}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {recoveryError && <Alert severity="error">{recoveryError}</Alert>}
            {actionError && <Alert severity="error">{actionError}</Alert>}
            <Alert severity="info">
              Without a backup, recovery only reconciles in-app notifications. Overdue staff requests remain held.
            </Alert>
            <FormControl fullWidth disabled={recoveryLoading || recovering}>
              <InputLabel id="recovery-backup-label">Backup staff member (optional)</InputLabel>
              <Select
                labelId="recovery-backup-label"
                label="Backup staff member (optional)"
                value={recoveryTargetId}
                onChange={(event) => { setRecoveryTargetId(event.target.value); setRecoveryError(null); setRecoveryResult(null); }}
              >
                <MenuItem value="">No backup — reconcile in-app only</MenuItem>
                {recoveryParticipants.map((participant) => <MenuItem key={participant.id} value={String(participant.id)}>{participant.email}</MenuItem>)}
              </Select>
            </FormControl>
            {recoveryLoading && <Alert severity="info">Loading active conversation participants…</Alert>}
            {recoveryResult && (
              <Alert severity={recoveryResult.overdue_requests.blocked > 0 ? "warning" : "success"}>
                In-app outbox events: {recoveryResult.outbox.delivered} delivered, {recoveryResult.outbox.retried} queued for retry, {recoveryResult.outbox.quarantined} quarantined, and {recoveryResult.outbox.skipped} skipped out of {recoveryResult.outbox.considered} considered. Overdue requests: {recoveryResult.overdue_requests.escalated} escalated, {recoveryResult.overdue_requests.blocked} held without an eligible backup, and {recoveryResult.overdue_requests.skipped} skipped out of {recoveryResult.overdue_requests.considered} considered. No external messages were sent.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={recovering} onClick={closeRecovery}>Close</Button>
          <Button disabled={recoveryLoading || recovering} variant="contained" onClick={() => void recoverConversation()}>{recovering ? "Recovering…" : "Run recovery"}</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={createOpen} onClose={closeCreate} fullWidth maxWidth="sm">
        <DialogTitle>New staff conversation</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <FormControl fullWidth disabled={creating}>
              <InputLabel id="conversation-kind-label">Conversation type</InputLabel>
              <Select labelId="conversation-kind-label" label="Conversation type" value={createKind} onChange={(event) => setCreateKind(event.target.value as StaffConversation["kind"])}><MenuItem value="direct">Direct</MenuItem><MenuItem value="team">Team</MenuItem><MenuItem value="role">Role</MenuItem></Select>
            </FormControl>
            {createKind !== "direct" && <TextField disabled={creating} label="Conversation title" value={createTitle} onChange={(event) => setCreateTitle(event.target.value)} inputProps={{ maxLength: 120 }} />}
            <FormControl fullWidth disabled={creating}>
              <InputLabel id="conversation-recipient-label">Staff participant</InputLabel>
              <Select labelId="conversation-recipient-label" label="Staff participant" value={recipientId} onChange={(event) => setRecipientId(event.target.value)}>{participants.map((participant) => <MenuItem key={participant.id} value={String(participant.id)}>{participant.email}</MenuItem>)}</Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions><Button disabled={creating} onClick={closeCreate}>Cancel</Button><Button disabled={creating} variant="contained" onClick={() => void createConversation()}>{creating ? "Creating…" : "Create conversation"}</Button></DialogActions>
      </Dialog>
    </Stack>
  );
}

export const StaffMessagingPage = LiveStaffMessagingWorkspace;
