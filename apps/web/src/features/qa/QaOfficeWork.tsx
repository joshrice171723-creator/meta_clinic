import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { mergeRoomMessages, type RoomMessage } from "./QaAgentRoom";

type OfficeTask = {
  id: number;
  title: string;
  recipient: string;
  status: string;
  office_status: string;
  request_key: string;
  revision: string;
  created_at: string;
  lease_expires_at?: string | null;
  allowed_transitions?: string[];
  payload: { description?: string };
  result: { summary?: string; evidence_refs?: number[] };
};
type Work = {
  tasks: OfficeTask[];
  can_post: boolean;
  controlled_actor: string | null;
};
type Room = { messages: RoomMessage[]; can_post: boolean };
const actions: Record<string, string> = {
  acknowledged: "Acknowledge pickup",
  working: "Start / update work",
  blocked: "Report blocker",
  completed: "Submit result",
  result_confirmed: "Confirm result received",
  recover: "Return expired work to queue",
};
const person = (value: string) =>
  value === "muse"
    ? "Muse"
    : value === "codex"
      ? "dot"
      : value === "josh"
        ? "Josh"
        : value;
const stateLabel = (task: OfficeTask) =>
  (task.office_status || task.status).replaceAll("_", " ");

/** Same shared task and message records used by the actors; no separate inbox. */
export function QaOfficeWork({
  revision,
  dirty,
  destination,
  onSaved,
}: {
  revision?: string;
  dirty?: boolean;
  destination?: string;
  onSaved?: () => void;
}) {
  const [work, setWork] = useState<Work>();
  const [room, setRoom] = useState<Room>();
  const [selectedId, setSelectedId] = useState<number>();
  const [readError, setReadError] = useState("");
  const [writeError, setWriteError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [compose, setCompose] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [recipient, setRecipient] = useState("muse");
  const [body, setBody] = useState("");
  const [summary, setSummary] = useState("");
  const [evidenceRefs, setEvidenceRefs] = useState("");
  const [replyTo, setReplyTo] = useState<number>();
  const version = useRef(0);
  const active = useRef(false);
  const pending = useRef<{ intent: string; key: string } | undefined>(
    undefined,
  );
  const refresh = useCallback(async () => {
    const current = ++version.current;
    try {
      const [nextWork, nextRoom] = await Promise.all([
        api<Work>("/api/qa/office/work"),
        api<Room>("/api/qa/room"),
      ]);
      if (!Array.isArray(nextWork.tasks) || !Array.isArray(nextRoom.messages))
        throw new Error("Office records could not be read.");
      if (!active.current || current !== version.current) return;
      setWork(nextWork);
      setRoom((previous) => ({
        ...nextRoom,
        messages: mergeRoomMessages(
          previous?.messages ?? [],
          nextRoom.messages,
        ),
      }));
      setReadError("");
    } catch (error) {
      if (active.current && current === version.current)
        setReadError(
          error instanceof Error ? error.message : "Office refresh failed.",
        );
    }
  }, []);
  useEffect(() => {
    active.current = true;
    void refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 15000);
    return () => {
      active.current = false;
      version.current++;
      window.clearInterval(timer);
    };
  }, [refresh]);
  useEffect(() => {
    setSelectedId(undefined);
  }, [destination]);
  useEffect(() => {
    setReplyTo(undefined);
    setBody("");
    setSummary("");
    setEvidenceRefs("");
  }, [selectedId]);
  const task = work?.tasks.find((item) => item.id === selectedId);
  const visibleTasks = (work?.tasks ?? []).filter((item) =>
    destination === "muse"
      ? item.recipient === "muse"
      : destination === "dot"
        ? item.recipient === "codex"
        : true,
  );
  const messages = (room?.messages ?? []).filter((item) =>
    task ? item.message.task_id === task.id : !item.message.task_id,
  );
  const canPost = !!work?.can_post && !readError;
  const canCreate =
    canPost && !!revision && /^[0-9a-f]{40}$/.test(revision) && !dirty;
  const mutate = async (
    path: string,
    payload: Record<string, unknown>,
    message: string,
    roomMessage = false,
  ) => {
    if (busy || !canPost) return false;
    const intent = JSON.stringify({ path, payload });
    if (pending.current?.intent !== intent)
      pending.current = { intent, key: crypto.randomUUID() };
    setBusy(true);
    setWriteError("");
    setNotice("");
    try {
      const command = { ...payload, request_key: pending.current.key };
      await api(path, {
        method: "POST",
        body: roomMessage
          ? { message: { ...payload, message_key: pending.current.key } }
          : path === "/api/qa/tasks"
            ? { task: command }
            : command,
      });
      if (!active.current) return false;
      pending.current = undefined;
      setNotice(message);
      await refresh();
      onSaved?.();
      return true;
    } catch (error) {
      if (active.current)
        setWriteError(
          error instanceof Error
            ? error.message
            : "Delivery could not be confirmed.",
        );
      return false;
    } finally {
      if (active.current) setBusy(false);
    }
  };
  const transition = async (status: string) => {
    if (!task) return;
    const needsResult = ["working", "blocked", "completed"].includes(status);
    const refs = evidenceRefs.trim()
      ? evidenceRefs.split(",").map((value) => Number(value.trim()))
      : [];
    if (
      needsResult &&
      (!summary.trim() ||
        refs.length > 5 ||
        refs.some((id) => !Number.isInteger(id) || id < 1))
    ) {
      setWriteError(
        "Add an update or result summary. Evidence must contain up to five stored evidence IDs.",
      );
      return;
    }
    if (
      await mutate(
        `/api/qa/office/work/${task.id}/transition`,
        {
          status,
          ...(needsResult
            ? { result: { summary: summary.trim(), evidence_refs: refs } }
            : {}),
        },
        `Work #${task.id}: ${actions[status] ?? status} recorded.`,
      )
    ) {
      setSummary("");
      setEvidenceRefs("");
    }
  };
  return (
    <Stack spacing={2} sx={{ minWidth: 0 }}>
      <Stack
        direction="row"
        sx={{
          justifyContent: "space-between",
          alignItems: "center",
          gap: 1,
          flexWrap: "wrap",
        }}
      >
        <Box>
          <Typography
            variant="overline"
            sx={{ letterSpacing: "0.16em", color: "text.secondary" }}
          >
            THE SHARED WORKSPACE
          </Typography>
          <Typography variant="h6">
            {destination === "meeting" ? "Meeting table" : "Work together"}
          </Typography>
        </Box>
        <Button size="small" onClick={() => void refresh()} disabled={busy}>
          Refresh
        </Button>
      </Stack>
      {readError && (
        <Alert severity="warning">
          Refresh failed. These records may be stale; writes are paused.{" "}
          {readError}
        </Alert>
      )}
      {writeError && (
        <Alert severity="error">
          {writeError} Inputs retained. Retry explicitly with the same content.
        </Alert>
      )}
      {notice && (
        <Alert severity="success" role="status">
          {notice}
        </Alert>
      )}
      {!work && !readError && (
        <Typography role="status">Loading shared work…</Typography>
      )}
      {work && !work.can_post && (
        <Alert severity="info">
          Read only. Sign in with an authorized Office identity to post work and
          messages.
        </Alert>
      )}
      <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
        <Chip
          size="small"
          variant="outlined"
          label={`${work?.tasks.filter((item) => item.status === "queued").length ?? 0} queued`}
        />
        <Chip
          size="small"
          variant="outlined"
          label={`${work?.tasks.filter((item) => item.status === "claimed").length ?? 0} picked up`}
        />
        <Chip
          size="small"
          variant="outlined"
          label={`${work?.tasks.filter((item) => item.office_status === "result_confirmed").length ?? 0} confirmed`}
        />
        <Button
          size="small"
          variant="contained"
          disabled={!canPost || busy}
          onClick={() => setCompose(!compose)}
        >
          {compose ? "Close new work" : "New shared work"}
        </Button>
      </Stack>
      {compose && (
        <Stack
          component="form"
          spacing={1.5}
          onSubmit={(event) => {
            event.preventDefault();
            void mutate(
              "/api/qa/tasks",
              {
                kind: "coordination",
                title: title.trim(),
                recipient,
                revision,
                payload: { description: description.trim() },
              },
              "Shared work queued. Pickup is awaiting the recipient's acknowledgment.",
            ).then((saved) => {
              if (saved) {
                setTitle("");
                setDescription("");
                setCompose(false);
              }
            });
          }}
        >
          <TextField
            label="What needs doing?"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            disabled={busy}
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
          <TextField
            label="Assign to"
            select
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
            disabled={busy}
          >
            <MenuItem value="muse">Muse</MenuItem>
            <MenuItem value="codex">dot</MenuItem>
          </TextField>
          <TextField
            label="Instructions and expected result"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            multiline
            minRows={3}
            required
            disabled={busy}
            slotProps={{ htmlInput: { maxLength: 2000 } }}
          />
          {!canCreate && (
            <Typography variant="caption">
              A current committed build and authorized session are required to
              queue shared work.
            </Typography>
          )}
          <Button
            type="submit"
            variant="contained"
            disabled={
              !canCreate || busy || !title.trim() || !description.trim()
            }
          >
            Queue work
          </Button>
        </Stack>
      )}
      <Stack
        spacing={1}
        sx={{ maxHeight: 280, overflowY: "auto" }}
        aria-label="Shared Office work"
      >
        {visibleTasks.map((item) => (
          <Button
            key={item.id}
            variant={selectedId === item.id ? "contained" : "outlined"}
            onClick={() => {
              setSelectedId(item.id);
              setCompose(false);
            }}
            aria-pressed={selectedId === item.id}
            sx={{ textAlign: "left", justifyContent: "flex-start", py: 1.25 }}
          >
            <Box sx={{ width: "100%", minWidth: 0 }}>
              <Typography variant="subtitle2">
                #{item.id} · {item.title}
              </Typography>
              <Typography variant="caption">
                To {person(item.recipient)} · {stateLabel(item)}
                {item.lease_expires_at &&
                new Date(item.lease_expires_at).getTime() < Date.now() &&
                item.status === "claimed"
                  ? " · claim expired"
                  : ""}
              </Typography>
            </Box>
          </Button>
        ))}
        {work && !visibleTasks.length && (
          <Typography color="text.secondary">
            No shared work here yet. Queue a clear request and follow its
            acknowledgment, result, and confirmation here.
          </Typography>
        )}
      </Stack>
      {task && (
        <Paper variant="outlined" sx={{ p: 2, bgcolor: "#f8faf8" }}>
          <Stack spacing={1.5}>
            <Stack
              direction="row"
              sx={{ justifyContent: "space-between", gap: 1 }}
            >
              <Typography variant="subtitle1">
                #{task.id} · {task.title}
              </Typography>
              <Button size="small" onClick={() => setSelectedId(undefined)}>
                All discussion
              </Button>
            </Stack>
            <Chip
              size="small"
              label={stateLabel(task)}
              sx={{ alignSelf: "flex-start" }}
            />
            <Typography
              sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
            >
              {task.payload.description}
            </Typography>
            {task.lease_expires_at && (
              <Typography variant="caption">
                Claim expires {new Date(task.lease_expires_at).toLocaleString()}
                . Expired work requires explicit recovery.
              </Typography>
            )}
            {task.result.summary && (
              <Box sx={{ borderLeft: "3px solid #41775d", pl: 1.5 }}>
                <Typography variant="overline">
                  Recorded update / result
                </Typography>
                <Typography
                  sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {task.result.summary}
                </Typography>
                {task.result.evidence_refs?.map((id) => (
                  <Typography key={id} variant="caption" component="p">
                    <a
                      href={`/api/qa/evidence/${id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Evidence #{id}
                    </a>
                  </Typography>
                ))}
              </Box>
            )}
            {!!task.allowed_transitions?.length && canPost && (
              <>
                {task.allowed_transitions.some((status) =>
                  ["working", "blocked", "completed"].includes(status),
                ) && (
                  <>
                    <TextField
                      label="Work update, blocker, or result"
                      value={summary}
                      onChange={(event) => setSummary(event.target.value)}
                      multiline
                      minRows={2}
                      disabled={busy}
                      slotProps={{ htmlInput: { maxLength: 2000 } }}
                    />
                    <TextField
                      label="Stored evidence IDs (optional)"
                      value={evidenceRefs}
                      onChange={(event) => setEvidenceRefs(event.target.value)}
                      helperText="Up to five IDs, separated by commas"
                      disabled={busy}
                    />
                  </>
                )}
                <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
                  {task.allowed_transitions
                    .filter((status) => actions[status])
                    .map((status) => (
                      <Button
                        key={status}
                        size="small"
                        variant={
                          status === "completed" ||
                          status === "result_confirmed"
                            ? "contained"
                            : "outlined"
                        }
                        disabled={busy}
                        onClick={() => void transition(status)}
                      >
                        {actions[status]}
                      </Button>
                    ))}
                </Stack>
              </>
            )}
            <Typography variant="caption">
              Request {task.request_key} · build {task.revision.slice(0, 12)}
            </Typography>
          </Stack>
        </Paper>
      )}
      <Divider />
      <Typography variant="subtitle1">
        {task ? `Discussion for work #${task.id}` : "Office discussion"}
      </Typography>
      <Stack spacing={1.5} sx={{ maxHeight: 400, overflowY: "auto", pr: 0.5 }}>
        {messages.slice(-30).map((item) => {
          const authenticatedActor = (
            item.message as RoomMessage["message"] & {
              authenticated_actor?: string;
            }
          ).authenticated_actor;
          return (
            <Paper
              key={item.id}
              component="article"
              variant="outlined"
              sx={{ p: 1.5, bgcolor: "#fffdfa", overflowWrap: "anywhere" }}
            >
              <Stack
                direction="row"
                sx={{ gap: 1, alignItems: "baseline", flexWrap: "wrap" }}
              >
                <Typography variant="subtitle2">
                  {authenticatedActor
                    ? person(authenticatedActor)
                    : item.message.agent}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {authenticatedActor
                    ? "Verified Office identity"
                    : "Reported display name"}{" "}
                  · {new Date(item.created_at).toLocaleString()}
                </Typography>
              </Stack>
              <Typography sx={{ whiteSpace: "pre-wrap", mt: 1 }}>
                {item.message.body}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Message #{item.id}
                {item.message.reply_to
                  ? ` · reply to #${item.message.reply_to}`
                  : ""}{" "}
                · recorded
              </Typography>
              {canPost && room?.can_post && !busy && (
                <Button size="small" onClick={() => setReplyTo(item.id)}>
                  Reply
                </Button>
              )}
            </Paper>
          );
        })}
        {room && !messages.length && (
          <Typography color="text.secondary">
            No messages in this discussion yet.
          </Typography>
        )}
      </Stack>
      {canPost && room?.can_post && (
        <Stack
          component="form"
          spacing={1.5}
          onSubmit={(event) => {
            event.preventDefault();
            void mutate(
              "/api/qa/room/messages",
              {
                agent: person(work?.controlled_actor ?? "Josh"),
                recipient: task ? person(task.recipient) : "Office",
                body: body.trim(),
                ...(task
                  ? { task_id: task.id, correlation_nonce: task.request_key }
                  : {}),
                ...(replyTo ? { reply_to: replyTo } : {}),
              },
              "Message persisted in the shared Office. Recipient pickup awaits a reply.",
              true,
            ).then((saved) => {
              if (saved) {
                setBody("");
                setReplyTo(undefined);
              }
            });
          }}
        >
          {replyTo && (
            <Stack direction="row" sx={{ alignItems: "center" }}>
              <Typography variant="caption">Replying to #{replyTo}</Typography>
              <Button size="small" onClick={() => setReplyTo(undefined)}>
                Cancel reply
              </Button>
            </Stack>
          )}
          <TextField
            label={task ? "Message about this work" : "Message to the Office"}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            multiline
            minRows={2}
            required
            disabled={busy}
            slotProps={{ htmlInput: { maxLength: 2000 } }}
          />
          <Button
            type="submit"
            variant="contained"
            disabled={busy || !body.trim()}
          >
            {busy ? "Saving…" : "Send to Office"}
          </Button>
        </Stack>
      )}
    </Stack>
  );
}
