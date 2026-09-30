import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import LaptopMacRounded from "@mui/icons-material/LaptopMacRounded";
import AssignmentRounded from "@mui/icons-material/AssignmentRounded";
import CollectionsRounded from "@mui/icons-material/CollectionsRounded";
import ForumRounded from "@mui/icons-material/ForumRounded";
import LocalFloristRounded from "@mui/icons-material/LocalFloristRounded";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import { api } from "../../api/client";
import {
  acceptMuseReceipt,
  museCountdown,
  type MuseCheckIn,
  type MuseReceipt,
} from "./museCheckIn";
import type { OfficeActorState } from "./sharedOffice";
import { QaOfficeWork } from "./QaOfficeWork";
import { QaOfficeConnections } from "./QaOfficeConnections";

export type QaOfficeProps = {
  tasks: {
    id: number;
    title: string;
    recipient: string;
    status: string;
    revision: string;
    claimed_at?: string;
    claimed_by?: string;
  }[];
  evidence: {
    id: number;
    caption: string;
    revision: string;
    url: string;
    created_at: string;
  }[];
  events: { id: number; summary: string; created_at: string }[];
  build?: {
    revision?: string;
    observed_at?: string;
    dirty?: boolean;
    environment?: string;
  };
  lastRunAt?: string;
  lastQaRevision?: string;
  loading?: boolean;
  error?: string;
  museCheckIn?: MuseCheckIn;
  actorState?: OfficeActorState;
  onRefresh?: () => void;
  onNavigate: (view: string) => void;
};
const destinations = [
  { id: "josh", label: "Josh desk", x: 2, y: 2, icon: LaptopMacRounded },
  { id: "dot", label: "dot desk", x: 5, y: 2, icon: LaptopMacRounded },
  { id: "muse", label: "Muse desk", x: 8, y: 2, icon: LaptopMacRounded },
  { id: "tasks", label: "Task board", x: 2, y: 6, icon: AssignmentRounded },
  {
    id: "evidence",
    label: "Evidence board",
    x: 5,
    y: 6,
    icon: CollectionsRounded,
  },
  { id: "meeting", label: "Meeting room", x: 8, y: 6, icon: ForumRounded },
] as const;
type Destination = (typeof destinations)[number]["id"];
const actorColors = { josh: "#527663", dot: "#b27843", muse: "#616ca4" };
function stamp(value?: string) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString()
    : "Unknown timestamp";
}

export function QaOffice({
  tasks,
  evidence,
  events,
  build,
  loading,
  error,
  museCheckIn,
  actorState,
  onRefresh,
  onNavigate,
}: QaOfficeProps) {
  const [position, setPosition] = useState({ x: 5, y: 5 });
  const [selected, setSelected] = useState<Destination>();
  const [writeError, setWriteError] = useState("");
  const [writeNotice, setWriteNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ intent: string; key: string } | undefined>(
    undefined,
  );
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const controlled = actorState?.actors.find(
    (actor) =>
      actor.id === actorState.controlled_actor && actor.control === "bound",
  );
  const muse = actorState?.actors.find((actor) => actor.id === "muse");
  const principal = muse?.principal_id ?? museCheckIn?.musePrincipalId ?? "";
  const incomingReceipt = muse?.receipt ?? museCheckIn?.receipt;
  const cadence = actorState?.muse_cadence_ms ?? museCheckIn?.cadenceMs;
  const [receipt, setReceipt] = useState<MuseReceipt>();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const observedNow = Date.now();
    setNow(observedNow);
    setReceipt((previous) =>
      acceptMuseReceipt(
        previous,
        incomingReceipt ?? undefined,
        principal,
        observedNow,
      ),
    );
  }, [incomingReceipt, principal]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const checkIn = museCountdown(receipt, principal, cadence ?? undefined, now);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (selected) detailHeading.current?.focus();
  }, [selected]);
  const nearest = destinations.reduce((best, item) =>
    Math.abs(item.x - position.x) + Math.abs(item.y - position.y) <
    Math.abs(best.x - position.x) + Math.abs(best.y - position.y)
      ? item
      : best,
  );
  const open = (id: Destination, source: HTMLElement) => {
    trigger.current = source;
    setSelected(id);
  };
  const close = () => {
    setSelected(undefined);
    trigger.current?.focus();
  };
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && selected) {
      event.preventDefault();
      close();
      return;
    }
    if (
      event.target !== event.currentTarget ||
      selected ||
      document.hidden ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    const direction = (
      {
        ArrowUp: [0, -1],
        w: [0, -1],
        ArrowDown: [0, 1],
        s: [0, 1],
        ArrowLeft: [-1, 0],
        a: [-1, 0],
        ArrowRight: [1, 0],
        d: [1, 0],
      } as Record<string, number[]>
    )[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (direction) {
      event.preventDefault();
      setPosition((current) => {
        const next = {
          x: Math.max(1, Math.min(9, current.x + direction[0])),
          y: Math.max(1, Math.min(7, current.y + direction[1])),
        };
        return destinations.some(
          (item) => item.x === next.x && item.y === next.y,
        )
          ? current
          : next;
      });
    } else if (event.key === "Enter") {
      event.preventDefault();
      open(nearest.id, event.currentTarget);
    }
  };
  const writeActor = async (kind: "position" | "check_in") => {
    if (!controlled || busy || error) return;
    const content = {
      expected_revision: controlled.revision,
      ...(kind === "position" ? position : {}),
    };
    const intent = JSON.stringify({ kind, content });
    if (pending.current?.intent !== intent)
      pending.current = { intent, key: crypto.randomUUID() };
    setBusy(true);
    setWriteError("");
    setWriteNotice("");
    try {
      await api(
        `/api/qa/office/${kind === "position" ? "position" : "check-ins"}`,
        {
          method: "POST",
          body: { [kind]: { ...content, request_key: pending.current.key } },
        },
      );
      if (!active.current) return;
      pending.current = undefined;
      setWriteNotice(
        `${controlled.name} ${kind === "position" ? "position" : "check-in"} recorded by the server.`,
      );
      onRefresh?.();
    } catch (reason) {
      if (active.current)
        setWriteError(
          reason instanceof Error
            ? reason.message
            : "Office action could not be confirmed.",
        );
    } finally {
      if (active.current) setBusy(false);
    }
  };
  const title = destinations.find((item) => item.id === selected)?.label;
  const roster = actorState?.actors ?? [
    {
      id: "josh" as const,
      name: "Josh",
      position: null,
      receipt: null,
      control: "uncontrolled",
      principal_id: null,
    },
    {
      id: "dot" as const,
      name: "dot",
      position: null,
      receipt: null,
      control: "uncontrolled",
      principal_id: null,
    },
    {
      id: "muse" as const,
      name: "Muse",
      position: null,
      receipt: null,
      control: "uncontrolled",
      principal_id: null,
    },
  ];
  return (
    <Box
      component="section"
      className="qa-office"
      aria-labelledby="qa-office-title"
      sx={{
        "& .qa-office-floor": {
          minHeight: { xs: 420, sm: 560 },
          border: "10px solid #ccd7ce",
          borderRadius: 3,
          boxShadow: "inset 0 0 0 2px #a2b6a6, 0 16px 40px #23392b14",
          bgcolor: "#f1eddf",
          backgroundImage:
            "linear-gradient(#e5dfd0 1px, transparent 1px),linear-gradient(90deg,#e5dfd0 1px,transparent 1px)",
          backgroundSize: "10% 11%",
        },
        "& .qa-office-floor .qa-office-destination": {
          borderRadius: 2,
          minHeight: 66,
          bgcolor: "#fffdf8",
          boxShadow: "0 6px 0 #c7b89d,0 12px 16px #4b493817",
          borderColor: "#b5a486",
          width: "25%",
          display: "flex",
          flexDirection: "column",
          gap: 0.5,
          py: 1,
        },
        "& .qa-office-floor .qa-office-meeting": {
          bgcolor: "#e1e9e2",
          borderColor: "#91ad97",
        },
        "& .qa-office-avatar-body": {
          border: "3px solid #fff",
          boxShadow: "0 3px 10px #1c2c2633",
          color: "#fff",
          width: 48,
          height: 48,
        },
        "& .qa-office-avatar small": {
          borderRadius: 1,
          px: 0.5,
          bgcolor: "#fffdf4e8",
          color: "#36443a",
        },
        "& .qa-office-detail": {
          borderRadius: 3,
          borderColor: "#d5dfd7",
          boxShadow: "0 12px 30px #23392b08",
        },
        "& .qa-office-layout": {
          gridTemplateColumns: {
            xs: "minmax(0,1fr)",
            lg: "minmax(0,1.2fr) minmax(360px,1fr)",
          },
        },
      }}
    >
      <Stack
        direction="row"
        sx={{
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Box>
          <Typography
            variant="overline"
            sx={{ letterSpacing: "0.2em", color: "#527663" }}
          >
            COMMAND CENTER
          </Typography>
          <Typography
            component="h2"
            variant="h4"
            id="qa-office-title"
            sx={{ fontWeight: 750 }}
          >
            Office
          </Typography>
          <Typography color="text.secondary">
            A place for Muse and dot to pick up work, share results, and meet.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<ForumRounded />}
          onClick={() => onNavigate("room")}
        >
          Full message history
        </Button>
      </Stack>
      {loading && (
        <Alert severity="info">
          Loading office records. Navigation remains available.
        </Alert>
      )}
      {error && (
        <Alert severity="error">
          Office records could not refresh: {error}. Shared controls are paused;
          refresh to retry.
        </Alert>
      )}
      {writeError && (
        <Alert severity="error">
          {writeError} No automatic retry; refresh or explicitly retry the same
          action.
        </Alert>
      )}
      {writeNotice && (
        <Alert severity="success" role="status">
          {writeNotice}
        </Alert>
      )}
      <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
        <Chip
          size="small"
          variant="outlined"
          label={`Build ${build?.revision?.slice(0, 12) ?? "unknown"}${build?.dirty ? " · uncommitted" : ""}`}
        />
        <Chip
          size="small"
          variant="outlined"
          label={
            controlled
              ? `Your actor: ${controlled.name}`
              : "Exploring · no actor control"
          }
        />
        <Chip
          size="small"
          variant="outlined"
          label={`Muse: ${checkIn.label}`}
        />
      </Stack>
      <Typography variant="caption" id="qa-office-help">
        Focus the floor and use arrow keys or WASD to walk; Enter opens the
        nearest destination. Walking is optional: use any destination button.
        The local preview cursor never writes shared positions.
      </Typography>
      <div className="qa-office-layout">
        <div>
          <div
            className="qa-office-floor"
            tabIndex={0}
            role="group"
            aria-label="Office floor"
            aria-describedby="qa-office-help"
            onKeyDown={move}
          >
            <span className="qa-office-floor-label" aria-hidden="true">
              MUSE + DOT / SHARED STUDIO
            </span>
            <Box
              aria-hidden="true"
              sx={{
                position: "absolute",
                left: "9%",
                right: "9%",
                top: "8%",
                height: 12,
                border: "2px solid #a6bec0",
                borderRadius: 1,
                bgcolor: "#c8e2e2",
                boxShadow: "inset 0 -4px #ffffff88",
              }}
            />
            <LocalFloristRounded
              aria-hidden="true"
              sx={{
                position: "absolute",
                bottom: 16,
                left: 16,
                fontSize: 38,
                color: "#597f58",
              }}
            />
            <LocalFloristRounded
              aria-hidden="true"
              sx={{
                position: "absolute",
                bottom: 16,
                right: 16,
                fontSize: 38,
                color: "#597f58",
              }}
            />
            <Box
              aria-hidden="true"
              sx={{
                position: "absolute",
                left: "12%",
                right: "12%",
                top: "44%",
                height: "11%",
                borderRadius: 2,
                border: "1px dashed #b8c4b6",
                bgcolor: "#d9e4d44d",
                display: "grid",
                placeItems: "center",
                color: "#778b76",
                fontSize: 10,
                letterSpacing: "0.22em",
              }}
            >
              SHARED WORK · CLEAR RECEIPTS
            </Box>
            {destinations.map((item) => (
              <Button
                key={item.id}
                variant="outlined"
                className={`qa-office-destination qa-office-${item.id}`}
                style={{ left: `${item.x * 10}%`, top: `${item.y * 11}%` }}
                onClick={(event) => open(item.id, event.currentTarget)}
                aria-pressed={selected === item.id}
              >
                <item.icon fontSize="small" />
                {item.label}
              </Button>
            ))}
            {roster.map((actor) => {
              const expected = actor.id === "muse" ? cadence : 60000;
              const valid =
                !!actor.receipt &&
                actor.receipt.authenticatedActorId === actor.principal_id &&
                actor.receipt.receivedAtMs <= now;
              const stale =
                valid &&
                now - actor.receipt!.receivedAtMs > (expected ?? 60000);
              const status = error
                ? "State unavailable"
                : !valid
                  ? "Not connected"
                  : stale
                    ? "Check-in stale"
                    : "Check-in recorded";
              const fallback = destinations.find(
                (item) => item.id === actor.id,
              )!;
              return (
                <div
                  key={actor.id}
                  className="qa-office-avatar"
                  role="group"
                  aria-label={`${actor.name} avatar: ${status}, ${actor.control === "bound" ? "Bound identity" : "Uncontrolled"}`}
                  style={{
                    left: `${(actor.position?.x ?? fallback.x) * 10}%`,
                    top: `${actor.position ? actor.position.y * 11 : 36}%`,
                    opacity: stale || !valid ? 0.65 : 1,
                  }}
                >
                  <span
                    className="qa-office-avatar-body"
                    style={{ background: actorColors[actor.id] }}
                  >
                    {actor.id === "muse" && (
                      <CircularProgress
                        variant="determinate"
                        value={checkIn.fraction * 100}
                        size={52}
                        aria-label={`Muse expected check-in: ${checkIn.label}`}
                        sx={{
                          position: "absolute",
                          inset: -5,
                          color: "#616ca4",
                          "& .MuiCircularProgress-circle": {
                            transition: "none",
                          },
                        }}
                      />
                    )}
                    <strong>{actor.name}</strong>
                  </span>
                  <small>{status}</small>
                  <small>
                    {actor.control === "bound"
                      ? "Bound identity"
                      : "Uncontrolled"}
                  </small>
                </div>
              );
            })}
            <span
              className="qa-office-player"
              aria-hidden="true"
              style={{
                left: `${position.x * 10}%`,
                top: `${position.y * 11}%`,
              }}
            >
              Preview
            </span>
          </div>
          <p className="qa-office-position">
            Local preview position: column {position.x}, row {position.y}.
            Nearest: {nearest.label}.
          </p>
          {controlled && (
            <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap", mb: 2 }}>
              <Button
                variant="contained"
                disabled={busy || !!error}
                onClick={() => void writeActor("position")}
              >
                Move {controlled.name} here
              </Button>
              <Button
                variant="outlined"
                disabled={busy || !!error}
                onClick={() => void writeActor("check_in")}
              >
                Record my check-in
              </Button>
            </Stack>
          )}
          <Typography
            variant="caption"
            component="p"
            className="qa-office-check-in"
          >
            Muse expected check-in: <strong>{checkIn.label}</strong>. Receipt
            timing shows the last authenticated contact, not continuous
            execution.
          </Typography>
          <nav
            className="qa-office-destination-list"
            aria-label="Office destinations"
          >
            {destinations.map((item) => (
              <Button
                key={item.id}
                size="small"
                variant={selected === item.id ? "contained" : "outlined"}
                onClick={(event) => open(item.id, event.currentTarget)}
                aria-pressed={selected === item.id}
              >
                {item.label}
              </Button>
            ))}
          </nav>
          <Accordion sx={{ mt: 2 }}>
            <AccordionSummary expandIcon={<ExpandMoreRounded />}>
              Recent recorded activity
            </AccordionSummary>
            <AccordionDetails>
              {events.length ? (
                events.slice(0, 8).map((item) => (
                  <Box key={item.id} sx={{ mb: 1.5 }}>
                    <Typography variant="body2">{item.summary}</Typography>
                    <Typography variant="caption">
                      {stamp(item.created_at)}
                    </Typography>
                  </Box>
                ))
              ) : (
                <Typography color="text.secondary">
                  No activity records available.
                </Typography>
              )}
            </AccordionDetails>
          </Accordion>
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreRounded />}>
              QA task archive · {tasks.length} records
            </AccordionSummary>
            <AccordionDetails>
              <TaskRecords tasks={tasks} loading={loading} />
              <Button onClick={() => onNavigate("inbox")}>
                Open full task inbox
              </Button>
            </AccordionDetails>
          </Accordion>
          {actorState?.can_enroll && (
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreRounded />}>
                Connect Muse or dot
              </AccordionSummary>
              <AccordionDetails>
                <QaOfficeConnections disabled={!!error} onSaved={onRefresh} />
              </AccordionDetails>
            </Accordion>
          )}
        </div>
        <section
          className="qa-office-detail"
          aria-label="Office details"
          onKeyDown={(event) => {
            if (event.key === "Escape" && selected) {
              event.stopPropagation();
              close();
            }
          }}
        >
          <div className="qa-office-heading">
            <h3 ref={detailHeading} tabIndex={-1}>
              {title ?? "The shared table"}
            </h3>
            {selected && (
              <Button size="small" onClick={close}>
                Close details
              </Button>
            )}
          </div>
          <Typography
            className="qa-office-announcement"
            variant="caption"
            role="status"
          >
            {selected
              ? `${title} selected. Details follow.`
              : "Choose a desk to see its shared work, or start at the table."}
          </Typography>
          {selected === "evidence" ? (
            <>
              <Typography>
                Showing {Math.min(20, evidence.length)} of {evidence.length}{" "}
                evidence records.
              </Typography>
              <Button onClick={() => onNavigate("timeline")}>
                Open activity and evidence
              </Button>
              {evidence.slice(0, 20).map((item) => (
                <article key={item.id}>
                  <a
                    href={`/api/qa/evidence/${item.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {item.caption || `Evidence #${item.id}`}
                  </a>
                  <Typography variant="caption" component="p">
                    {stamp(item.created_at)} · {item.revision.slice(0, 12)}
                  </Typography>
                </article>
              ))}
              {!evidence.length && (
                <Typography>No evidence records available.</Typography>
              )}
            </>
          ) : (
            <QaOfficeWork
              revision={build?.revision}
              dirty={build?.dirty}
              destination={selected}
              onSaved={onRefresh}
            />
          )}
        </section>
      </div>
    </Box>
  );
}
function TaskRecords({
  tasks,
  loading,
}: Pick<QaOfficeProps, "tasks" | "loading">) {
  return tasks.length ? (
    <Stack spacing={1.5}>
      {tasks.slice(0, 30).map((task) => (
        <Box key={task.id}>
          <Typography variant="subtitle2">
            #{task.id} · {task.title}
          </Typography>
          <Typography variant="caption" component="p">
            To {task.recipient} · {task.status.replaceAll("_", " ")} ·{" "}
            {task.revision.slice(0, 12)}
          </Typography>
          {task.claimed_by && (
            <Typography variant="caption">
              Claimed by {task.claimed_by} · {stamp(task.claimed_at)}
            </Typography>
          )}
        </Box>
      ))}
    </Stack>
  ) : (
    <Typography>
      {loading ? "Tasks are loading." : "No task records available."}
    </Typography>
  );
}
