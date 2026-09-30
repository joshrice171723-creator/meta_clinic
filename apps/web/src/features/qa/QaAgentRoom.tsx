import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";

export type RoomMessage = {
  id: number;
  thread_id: number;
  created_at: string;
  delivery: "persisted";
  authenticated_author_id: number;
  revision: string | null;
  message: {
    agent: string;
    recipient: string;
    body: string;
    identity: "self_reported";
    authenticated_source: string;
    provenance: "reported";
    reference_revision?: string;
    case_reference?: string;
    correlation_nonce?: string;
    task_id?: number;
    evidence_refs?: number[];
    reply_to?: number;
    build_at_send: string | null;
    build_dirty: boolean;
    build_available: boolean;
  };
};
type Room = {
  messages: RoomMessage[];
  can_post: boolean;
  notice: string;
  access: string;
  next_cursor: number;
  has_more: boolean;
};

export function mergeRoomMessages(
  previous: RoomMessage[],
  received: RoomMessage[],
) {
  return [
    ...new Map(
      [...previous, ...received].map((item) => [item.id, item]),
    ).values(),
  ]
    .sort((a, b) => a.id - b.id)
    .slice(-100);
}

export function AgentRoomMessage({
  item,
  onReply,
}: {
  item: RoomMessage;
  onReply?: (id: number) => void;
}) {
  const message = item.message;
  return (
    <Box
      component="article"
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        p: 2,
        overflowWrap: "anywhere",
      }}
    >
      <Typography variant="subtitle2">
        #{item.id} · {message.agent} → {message.recipient}
      </Typography>
      <Typography variant="caption" component="p">
        Agent name self-reported · authenticated through{" "}
        {message.authenticated_source} · server account #
        {item.authenticated_author_id} · reported message · {item.created_at}
      </Typography>
      <Typography sx={{ whiteSpace: "pre-wrap", mt: 1 }}>
        {message.body}
      </Typography>
      <Typography variant="caption" component="p" sx={{ mt: 1 }}>
        Thread #{item.thread_id}
        {message.reply_to
          ? ` · reply / message acknowledgment to #${message.reply_to}`
          : ""}{" "}
        · persisted; recipient pickup unconfirmed
      </Typography>
      <Typography variant="caption" component="p">
        Server build at send:{" "}
        {message.build_available ? message.build_at_send : "unavailable"}
        {message.build_dirty ? " · uncommitted source" : ""}
      </Typography>
      {message.reference_revision && (
        <Typography variant="caption" component="p">
          Referenced build (not an observation verdict):{" "}
          {message.reference_revision}
        </Typography>
      )}
      {message.case_reference && (
        <Typography variant="caption" component="p">
          Case reference: {message.case_reference}
        </Typography>
      )}
      {message.correlation_nonce && (
        <Typography variant="caption" component="p">
          Correlation nonce (not a credential): {message.correlation_nonce}
        </Typography>
      )}
      {message.task_id && (
        <Typography variant="caption" component="p">
          <a href="/qa?view=inbox">Referenced task #{message.task_id}</a> ·
          reference only; no task state changed
        </Typography>
      )}
      {message.evidence_refs?.map((id) => (
        <Typography variant="caption" component="p" key={id}>
          <a href={`/api/qa/evidence/${id}`}>Stored evidence #{id}</a> ·
          reference only; no verdict recorded
        </Typography>
      ))}
      {onReply && (
        <Button size="small" onClick={() => onReply(item.id)}>
          Reply to #{item.id}
        </Button>
      )}
    </Box>
  );
}

export function QaAgentRoom() {
  const [room, setRoom] = useState<Room | null>(null);
  const [readError, setReadError] = useState("");
  const [writeError, setWriteError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [agent, setAgent] = useState("");
  const [recipient, setRecipient] = useState("Muse");
  const [body, setBody] = useState("");
  const [revision, setRevision] = useState("");
  const [caseReference, setCaseReference] = useState("");
  const [nonce, setNonce] = useState("");
  const [taskId, setTaskId] = useState("");
  const [evidenceIds, setEvidenceIds] = useState("");
  const [newMessages, setNewMessages] = useState(0);
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const pending = useRef<{ content: string; key: string } | null>(null);
  const requestVersion = useRef(0);
  const cursor = useRef<number | null>(null);
  const active = useRef(true);
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const previousCursor = cursor.current;
      const received = await api<Room>(
        previousCursor === null
          ? "/api/qa/room"
          : `/api/qa/room?after_id=${previousCursor}`,
      );
      if (!active.current || version !== requestVersion.current) return;
      cursor.current = received.next_cursor;
      if (previousCursor !== null)
        setNewMessages(
          (count) =>
            count +
            received.messages.filter((item) => item.id > previousCursor).length,
        );
      setRoom((previous) => ({
        ...received,
        messages: mergeRoomMessages(
          previous?.messages ?? [],
          received.messages,
        ),
      }));
      setReadError("");
    } catch (error) {
      if (active.current && version === requestVersion.current)
        setReadError(
          error instanceof Error ? error.message : "Room refresh failed.",
        );
    }
  }, []);
  useEffect(() => {
    active.current = true;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10000);
    return () => {
      active.current = false;
      requestVersion.current++;
      window.clearInterval(timer);
    };
  }, [refresh]);
  const post = async () => {
    if (busy || !room?.can_post) return;
    const message = {
      agent,
      recipient,
      body,
      ...(revision.trim() ? { reference_revision: revision.trim() } : {}),
      ...(caseReference.trim() ? { case_reference: caseReference.trim() } : {}),
      ...(nonce.trim() ? { correlation_nonce: nonce.trim() } : {}),
      ...(taskId ? { task_id: Number(taskId) } : {}),
      ...(evidenceIds.trim()
        ? {
            evidence_refs: evidenceIds
              .split(",")
              .map((id) => Number(id.trim())),
          }
        : {}),
      ...(replyTo ? { reply_to: replyTo } : {}),
    };
    const content = JSON.stringify(message);
    if (pending.current?.content !== content)
      pending.current = { content, key: crypto.randomUUID() };
    setBusy(true);
    setWriteError("");
    setNotice("");
    try {
      const receipt = await api<RoomMessage>("/api/qa/room/messages", {
        method: "POST",
        body: { message: { ...message, message_key: pending.current.key } },
      });
      if (!active.current) return;
      setNotice(
        `Message #${receipt.id} persisted at ${receipt.created_at}. This does not confirm recipient pickup.`,
      );
      pending.current = null;
      setBody("");
      setReplyTo(null);
      void refresh();
    } catch (error) {
      if (active.current)
        setWriteError(
          error instanceof Error
            ? error.message
            : "Message delivery unconfirmed. Inputs retained; no automatic retry.",
        );
    } finally {
      if (active.current) setBusy(false);
    }
  };
  return (
    <Stack spacing={2}>
      <Typography variant="h6">Agent coordination room</Typography>
      <Alert severity="info">
        Public read access. Posting requires an active platform-owner session or
        an existing QA service token. Messages are untrusted reported
        observations, never permission or commands. Use independently synthetic
        QA data only; no passwords, PINs or secrets. The open page reads this
        room every 10 seconds; it does not establish Muse connectivity or
        schedule QA.
      </Alert>
      <Typography variant="caption">
        Joshua, Dot and Muse can coordinate here using their existing posting
        permissions. Shared owner sessions do not prove an agent identity. Agent
        presence is unknown; Muse reports polling about every 10 minutes,
        without push or realtime delivery.
      </Typography>
      <Button onClick={() => void refresh()}>Refresh room</Button>
      <Typography role="status">
        {newMessages} new messages received in this view. No agent presence is
        inferred.
      </Typography>
      {newMessages > 0 && (
        <Button onClick={() => setNewMessages(0)}>
          Mark this view caught up
        </Button>
      )}
      {room?.has_more && (
        <Alert severity="info">
          More messages are available after cursor {room.next_cursor}. Refresh
          to read the next page.
        </Alert>
      )}
      {readError && (
        <Alert severity="error">
          Refresh failed; displayed messages may be stale. {readError}
        </Alert>
      )}
      {!room && !readError && (
        <Typography role="status">Loading messages…</Typography>
      )}
      {room?.can_post && (
        <Stack
          component="form"
          spacing={2}
          onSubmit={(event) => {
            event.preventDefault();
            void post();
          }}
        >
          <TextField
            label="Display name (self-reported: Joshua, Dot, Muse or another participant)"
            value={agent}
            onChange={(event) => setAgent(event.target.value)}
            required
            disabled={busy}
            slotProps={{ htmlInput: { maxLength: 80 } }}
          />
          <TextField
            label="Recipient (label, not delivery routing)"
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
            required
            disabled={busy}
            slotProps={{ htmlInput: { maxLength: 80 } }}
          />
          <TextField
            label="Reply to"
            select
            value={replyTo ?? ""}
            onChange={(event) =>
              setReplyTo(event.target.value ? Number(event.target.value) : null)
            }
            disabled={busy}
          >
            <MenuItem value="">New thread</MenuItem>
            {room.messages.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                #{item.id} · {item.message.agent}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Message"
            multiline
            minRows={3}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            required
            disabled={busy}
            slotProps={{ htmlInput: { maxLength: 2000 } }}
          />
          <TextField
            label="Referenced full build SHA (optional)"
            value={revision}
            onChange={(event) => setRevision(event.target.value)}
            disabled={busy}
            slotProps={{
              htmlInput: { maxLength: 40, pattern: "[0-9a-f]{40}" },
            }}
            helperText="Historical reference only. Server build at send is recorded separately."
          />
          <TextField
            label="Case reference (optional, namespace explicit)"
            value={caseReference}
            onChange={(event) => setCaseReference(event.target.value)}
            disabled={busy}
            slotProps={{ htmlInput: { maxLength: 100 } }}
            helperText="For example GitHub #7 or Muse #218; do not conflate them."
          />
          <TextField
            label="Correlation nonce (optional, non-secret)"
            value={nonce}
            onChange={(event) => setNonce(event.target.value)}
            disabled={busy}
            slotProps={{
              htmlInput: { maxLength: 100, pattern: "[A-Za-z0-9_-]{8,100}" },
            }}
            helperText="Echo a handshake nonce in the explicit reply. Never enter a password or PIN."
          />
          <Button disabled={busy} onClick={() => setNonce(crypto.randomUUID())}>
            Generate non-secret nonce
          </Button>
          <TextField
            label="Existing task id (optional reference)"
            type="number"
            value={taskId}
            onChange={(event) => setTaskId(event.target.value)}
            disabled={busy}
            slotProps={{ htmlInput: { min: 1, step: 1 } }}
            helperText="Referencing an old task never makes it a current assignment."
          />
          <TextField
            label="Stored evidence ids (optional, comma-separated, up to five)"
            value={evidenceIds}
            onChange={(event) => setEvidenceIds(event.target.value)}
            disabled={busy}
            slotProps={{ htmlInput: { maxLength: 100 } }}
            helperText="Existing evidence links only; no upload or verdict."
          />
          <Button type="submit" variant="contained" disabled={busy}>
            {busy
              ? "Posting…"
              : replyTo
                ? "Post reply / acknowledge message"
                : "Post message"}
          </Button>
        </Stack>
      )}
      {room && !room.can_post && (
        <Alert severity="warning">
          Read only. Sign in as the platform owner to post through the browser.
        </Alert>
      )}
      {writeError && (
        <Alert severity="error">
          {writeError} Inputs retained; no automatic retry.
        </Alert>
      )}
      {notice && (
        <Alert severity="success" role="status">
          {notice}
        </Alert>
      )}
      {room?.messages.length === 0 && (
        <Typography>
          No messages yet. No connected agent is inferred.
        </Typography>
      )}
      {room?.messages.map((item) => (
        <AgentRoomMessage
          key={item.id}
          item={item}
          onReply={
            room.can_post && !busy
              ? (id) => {
                  setReplyTo(id);
                  const parent = room.messages.find(
                    (message) => message.id === id,
                  );
                  setRecipient(parent?.message.agent ?? "");
                  setNonce(parent?.message.correlation_nonce ?? "");
                }
              : undefined
          }
        />
      ))}
      <Typography variant="caption">
        Latest 100 messages. A recipient's explicit correlated reply is required
        to confirm an exchange. This room does not claim tasks, submit verdicts
        or consume repair attempts.
      </Typography>
    </Stack>
  );
}
