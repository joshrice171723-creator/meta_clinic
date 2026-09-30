import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Button,
} from "@mui/material";

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
  onNavigate: (view: string) => void;
};

const destinations = [
  { id: "josh", label: "Josh desk", x: 2, y: 2 },
  { id: "dot", label: "dot desk", x: 5, y: 2 },
  { id: "muse", label: "Muse desk", x: 8, y: 2 },
  { id: "tasks", label: "Task board", x: 2, y: 6 },
  { id: "evidence", label: "Evidence board", x: 5, y: 6 },
  { id: "meeting", label: "Meeting room", x: 8, y: 6 },
] as const;
type Destination = (typeof destinations)[number]["id"];
function stamp(value?: string) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString()
    : "Unknown timestamp";
}

/** A navigation metaphor over existing QA records; no presence or command authority. */
export function QaOffice({
  tasks,
  evidence,
  events,
  build,
  lastRunAt,
  lastQaRevision,
  loading,
  error,
  onNavigate,
}: QaOfficeProps) {
  const [position, setPosition] = useState({ x: 5, y: 4 });
  const [selected, setSelected] = useState<Destination>();
  const detailHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (selected) detailHeading.current?.focus();
  }, [selected]);
  const trigger = useRef<HTMLElement | null>(null);
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
  const title = destinations.find((item) => item.id === selected)?.label;
  return (
    <section className="qa-office" aria-labelledby="qa-office-title">
      <div className="qa-office-heading">
        <div>
          <h2 id="qa-office-title">Office</h2>
          <p>A shared place to review work and meet in the agent room.</p>
        </div>
        <Button variant="outlined" onClick={() => onNavigate("room")}>
          Open agent room
        </Button>
      </div>
      {loading && (
        <Alert severity="info">
          Loading office records. Navigation remains available.
        </Alert>
      )}
      {error && (
        <Alert severity="error">
          Office records could not refresh: {error}. Use Refresh in the
          workspace header to retry. Records are unavailable until refresh
          succeeds.
        </Alert>
      )}
      <div className="qa-office-context">
        <span>
          Observed build: <code>{build?.revision ?? "Unknown"}</code>
          {build?.dirty ? " · working tree changes reported" : ""}
        </span>
        <span>Build observed: {stamp(build?.observed_at)}</span>
        <span>Last recorded QA run: {stamp(lastRunAt)}</span>
        <span>
          Last QA revision: <code>{lastQaRevision ?? "Not recorded"}</code>
        </span>
        <span>Running / live presence: Unknown</span>
      </div>
      <p id="qa-office-help">
        Focus the floor and use arrow keys or WASD to walk; Enter opens the
        nearest destination. Walking is optional: use any destination button.
        Desks are symbolic, not presence telemetry.
      </p>
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
              COMMAND CENTER / OFFICE
            </span>
            {destinations.map((item) => (
              <Button
                key={item.id}
                variant="outlined"
                className={`qa-office-destination qa-office-${item.id}`}
                style={{ left: `${item.x * 10}%`, top: `${item.y * 11}%` }}
                onClick={(event) => open(item.id, event.currentTarget)}
                aria-pressed={selected === item.id}
              >
                {item.label}
              </Button>
            ))}
            <span
              className="qa-office-player"
              aria-hidden="true"
              style={{
                left: `${position.x * 10}%`,
                top: `${position.y * 11}%`,
              }}
            >
              J
            </span>
          </div>
          <p className="qa-office-position">
            Josh's navigation position: column {position.x}, row {position.y}.
            Nearest: {nearest.label}.
          </p>
          <nav
            className="qa-office-destination-list"
            aria-label="Office destinations"
          >
            {destinations.map((item) => (
              <Button
                key={item.id}
                variant={selected === item.id ? "contained" : "outlined"}
                onClick={(event) => open(item.id, event.currentTarget)}
                aria-pressed={selected === item.id}
              >
                {item.label}
              </Button>
            ))}
          </nav>
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
              {title ?? "Choose a destination"}
            </h3>
            {selected && <Button onClick={close}>Close details</Button>}
          </div>
          <p className="qa-office-announcement" role="status">
            {selected
              ? `${title} selected. Details follow.`
              : "No destination selected."}
          </p>
          {!selected && (
            <p>
              Visit a desk to review shared records, or open a board. Messages
              and manual task instructions are available in the agent room.
            </p>
          )}
          {(selected === "josh" ||
            selected === "dot" ||
            selected === "muse") && (
            <>
              <p>
                {selected === "muse"
                  ? `Last recorded QA run: ${stamp(lastRunAt)}. This is a QA report, not proof Muse is connected or running.`
                  : "This desk links to shared work. Task recipients and claims are shown exactly as recorded; no desk assignment is inferred."}
              </p>
              <Button onClick={() => onNavigate("room")}>
                Messages and manual instructions
              </Button>
              <h4>Recorded tasks</h4>
              <TaskRecords tasks={tasks} loading={loading} />
              <Button onClick={() => onNavigate("inbox")}>
                Open full task inbox
              </Button>
              <Accordion>
                <AccordionSummary>Beacon team / workstreams</AccordionSummary>
                <AccordionDetails>
                  <p>
                    Nova, Scout, Patch, Sage, Relay, and Bridge are roster names
                    only. Temporary workers belong in this drilldown; task
                    assignments are not inferred.
                  </p>
                </AccordionDetails>
              </Accordion>
              <Accordion>
                <AccordionSummary>Recent recorded activity</AccordionSummary>
                <AccordionDetails>
                  {events.length ? (
                    events.slice(0, 8).map((item) => (
                      <article key={item.id}>
                        <p>{item.summary}</p>
                        <small>{stamp(item.created_at)}</small>
                      </article>
                    ))
                  ) : (
                    <p>
                      {loading
                        ? "Activity is loading."
                        : "No activity records available."}
                    </p>
                  )}
                </AccordionDetails>
              </Accordion>
            </>
          )}
          {selected === "tasks" && (
            <>
              <TaskRecords tasks={tasks} loading={loading} />
              <Button onClick={() => onNavigate("inbox")}>
                Open full task inbox
              </Button>
              <Button onClick={() => onNavigate("room")}>
                Discuss tasks and instructions in agent room
              </Button>
            </>
          )}
          {selected === "evidence" && (
            <>
              <p>
                Showing {Math.min(20, evidence.length)} of {evidence.length}{" "}
                evidence records.
              </p>
              <Button onClick={() => onNavigate("timeline")}>
                Open activity and evidence
              </Button>
              {evidence.length ? (
                evidence.slice(0, 20).map((item) => (
                  <article key={item.id}>
                    <a
                      href={`/api/qa/evidence/${encodeURIComponent(String(item.id))}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {item.caption || `Evidence #${item.id}`}
                    </a>
                    <small>{stamp(item.created_at)}</small>
                    <code>{item.revision}</code>
                  </article>
                ))
              ) : (
                <p>
                  {loading
                    ? "Evidence is loading."
                    : "No evidence records available."}
                </p>
              )}
            </>
          )}
          {selected === "meeting" && (
            <>
              <p>
                The meeting room opens existing discussion and correlated
                messages. Entering this room does not connect an agent or start
                a live meeting.
              </p>
              <Button variant="contained" onClick={() => onNavigate("room")}>
                Enter agent room
              </Button>
            </>
          )}
          <p className="qa-office-future">
            Grok: future informational placeholder. No integration available.
          </p>
        </section>
      </div>
    </section>
  );
}
function TaskRecords({
  tasks,
  loading,
}: Pick<QaOfficeProps, "tasks" | "loading">) {
  return tasks.length ? (
    <div className="qa-office-records">
      <p>
        Showing {Math.min(30, tasks.length)} of {tasks.length} task records.
      </p>
      {tasks.slice(0, 30).map((task) => (
        <article key={task.id}>
          <strong>
            #{task.id} · {task.title}
          </strong>
          <p>
            To {task.recipient} · {task.status.replaceAll("_", " ")}
          </p>
          <code>{task.revision}</code>
          {task.claimed_by && (
            <small>
              Claimed by {task.claimed_by} · {stamp(task.claimed_at)}. A claim
              does not prove current execution.
            </small>
          )}
        </article>
      ))}
    </div>
  ) : (
    <p>{loading ? "Tasks are loading." : "No task records available."}</p>
  );
}
