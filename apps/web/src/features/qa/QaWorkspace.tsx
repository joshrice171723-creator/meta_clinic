import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
} from "@mui/material";
import { api } from "../../api/client";
import "./qa.css";

type RecordData = Record<string, unknown>;
type Issue = {
  number: number;
  title: string;
  state: string;
  html_url: string;
  labels: string[];
  priority: boolean;
  created_at: string;
  updated_at: string;
  body?: string;
};
type KnownIssue = {
  id: number | string;
  muse_qa_id?: number | string;
  github_issue?: number;
  title: string;
  status: string;
  first_seen?: string;
  notes?: string;
  revision?: string;
  history?: unknown[];
};
type Retest = {
  id: number | string;
  muse_qa_id?: number | string;
  owner?: string;
  status: string;
  evidence?: string;
  revision?: string;
  evidence_at?: string;
  source_batch?: string;
};
type Task = {
  id: number;
  kind: string;
  title: string;
  recipient: string;
  status: string;
  revision: string;
  payload: RecordData;
  result: RecordData;
  human_decision?: RecordData;
  claimed_by?: string;
  claimed_at?: string;
  created_at: string;
};
type Evidence = {
  id: number;
  issue_number: number;
  revision: string;
  caption: string;
  phase: string;
  url: string;
  created_at: string;
  context: RecordData;
  tester: string;
};
type Event = {
  id: number;
  kind: string;
  summary: string;
  revision?: string;
  created_at: string;
  payload: RecordData;
};
type Workspace = {
  build: Build;
  atlas?: {
    status: string;
    inventory_status: string;
    error?: string;
    source: string;
    tracker_updated_at?: string;
    scoring_basis: string;
    averages?: { build: number; validation: number; external: number };
    inventory?: {
      code: string;
      title: string;
      kind: string;
      done: string;
      remaining: string;
      source: string;
    }[];
  };
  state: {
    last_qa_revision?: string;
    last_run_at?: string;
    known_issues?: KnownIssue[];
    retest?: Retest[];
    batches?: RecordData[];
    sweep_batches?: RecordData[];
    candidates?: RecordData[];
    import_notes?: string[];
    coverage?: RecordData[] | Record<string, RecordData>;
    releases?: RecordData[];
    source?: string;
    updated_at?: string;
    coverage_total?: number;
    expected_total?: number;
    sources?: RecordData;
  };
  github: {
    status: string;
    observed_at?: string;
    error?: string;
    issues: Issue[];
  };
  tasks: Task[];
  events: Event[];
  evidence: Evidence[];
  guardrails: string[];
  baseline?: {
    practice_id: number;
    route: string;
    prepared_at: string;
    note: string;
  };
  capabilities: { github_questions: boolean };
  pin?: { revision: string; confirmed_at: string; confirmed_by: string };
};
type Build = {
  version?: string;
  revision?: string;
  observed_at?: string;
  error?: string;
  environment?: string;
  dirty?: boolean;
};
const value = (item: unknown) =>
  item === undefined || item === null || item === ""
    ? "Not recorded"
    : typeof item === "object"
      ? JSON.stringify(item)
      : String(item);
const stamp = (date?: string) =>
  date
    ? new Date(date).toLocaleString("en-US", { timeZoneName: "short" })
    : "Not recorded";
const shade = (status: string) =>
  /pass|fixed|complete|green/i.test(status)
    ? "good"
    : /fail|broken|blocked|partial/i.test(status)
      ? "bad"
      : "pending";
const verdictDone = (status: string) =>
  !/pending|queued|not.?started|not.?retested|unattempted/i.test(status);

export function QaWorkspace() {
  const [data, setData] = useState<Workspace>();
  const [live, setLive] = useState<Build>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState(() => {
    const view =
      new URLSearchParams(window.location.search).get("view") ?? "overview";
    return [
      "overview",
      "atlas",
      "defects",
      "retests",
      "coverage",
      "inbox",
      "timeline",
    ].includes(view)
      ? view
      : "overview";
  });
  const [selected, setSelected] = useState<Issue | KnownIssue>();
  const [report, setReport] = useState(false);
  const [question, setQuestion] = useState(false);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [file, setFile] = useState<File>();
  const [pinDialog, setPinDialog] = useState(false);
  const [reviewTask, setReviewTask] = useState<Task>();
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("view", section);
    window.history.replaceState(null, "", url);
  }, [section]);
  const refresh = useCallback(async (github = false) => {
    try {
      const [workspace, response] = await Promise.all([
        api<Workspace>(`/api/qa${github ? "?refresh=1" : ""}`),
        fetch(`/build.json?qa=${Date.now()}`, {
          cache: "no-store",
          credentials: "same-origin",
        }),
      ]);
      if (!response.ok) throw new Error("Live build could not be observed.");
      const build = (await response.json()) as Build;
      if (!build.revision || !/^[0-9a-f]{40}$/.test(build.revision))
        throw new Error(
          "Live build has no full revision. QA actions are paused.",
        );
      setData(workspace);
      setLive({ ...build, observed_at: new Date().toISOString() });
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "QA workspace unavailable.",
      );
      setLive(undefined);
    }
  }, []);
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "QA Operations Desk · Meta Clinic";
    void refresh();
    const timer = setInterval(() => void refresh(), 60_000);
    return () => {
      clearInterval(timer);
      document.title = previousTitle;
    };
  }, [refresh]);
  const perform = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError("");
    try {
      await action();
      setNotice(message);
      await refresh();
      return true;
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Action could not be saved.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  };
  const queue = (
    kind: string,
    title: string,
    payload: RecordData = {},
    recipient = "muse",
  ) =>
    perform(
      () =>
        api("/api/qa/tasks", {
          method: "POST",
          body: {
            task: {
              request_key: crypto.randomUUID(),
              kind,
              title,
              recipient,
              payload,
              revision: live?.revision,
            },
          },
        }),
      "Request saved. Pickup happens on the next scheduled agent run; its claim and verdict will appear here.",
    );
  const issues = data?.github.issues ?? [];
  const known = data?.state.known_issues ?? [];
  const retests = data?.state.retest ?? [];
  const tasks = data?.tasks ?? [];
  const waiting = tasks.filter(
    (task) => task.status === "queued" || task.status === "claimed",
  );
  const reviewable = tasks.filter((task) =>
    ["completed", "failed"].includes(task.status),
  );
  const needsReview = reviewable.filter(
    (task) => !task.human_decision?.outcome,
  );
  const approved = reviewable.filter(
    (task) => task.human_decision?.outcome === "approved",
  );
  const blocked = retests.filter((item) =>
    /blocked|broken|failed|partial/i.test(item.status),
  );
  const pending = retests.filter((item) => !verdictDone(item.status));
  const completed = retests.filter((item) => verdictDone(item.status)).length;
  const coverage: RecordData[] = Array.isArray(data?.state.coverage)
    ? data.state.coverage
    : Object.entries(data?.state.coverage ?? {}).map(([id, item]) => ({
        id,
        ...item,
      }));
  const mismatch = Boolean(
    live?.revision &&
    live.revision !== (data?.pin?.revision ?? data?.state.last_qa_revision),
  );
  const pinReady = Boolean(
    live?.revision && !live.dirty && data?.pin?.revision === live.revision,
  );
  const issueNumber =
    selected && "number" in selected ? selected.number : selected?.github_issue;
  const matchingEvidence =
    data?.evidence.filter((item) => item.issue_number === issueNumber) ?? [];
  const reviewDefects: RecordData[] = Array.isArray(reviewTask?.result.defects)
    ? reviewTask.result.defects
    : [];
  const reviewEvidenceIds = [
    ...new Set(
      reviewDefects.flatMap((defect) =>
        Array.isArray(defect.evidence_refs)
          ? defect.evidence_refs.filter((id): id is number =>
              Number.isInteger(id),
            )
          : [],
      ),
    ),
  ];
  const visible = issues
    .filter(
      (item) =>
        (statusFilter === "all" || item.state === statusFilter) &&
        `${item.number} ${item.title}`
          .toLowerCase()
          .includes(filter.toLowerCase()),
    )
    .sort((a, b) => Number(b.priority) - Number(a.priority));
  const nav = [
    ["atlas", "Implementation Atlas"],
    ["overview", "Mission control"],
    ["defects", "Defect register"],
    ["retests", "Retest campaign"],
    ["coverage", "Workflow coverage"],
    ["inbox", "Agent inbox"],
    ["timeline", "Activity & releases"],
  ];

  function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void queue("issue_report", String(form.get("title")), {
      route: form.get("route"),
      steps: form.get("steps"),
      expected: form.get("expected"),
      actual: form.get("actual"),
      viewport: `${window.innerWidth}×${window.innerHeight}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      reported_at: new Date().toISOString(),
    }).then((saved) => {
      if (saved) setReport(false);
    });
  }
  function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void queue(
      "question",
      String(form.get("title")),
      {
        question: form.get("question"),
        github_issue: form.get("issue") || issueNumber || null,
        github_label: "qa-question",
      },
      "codex",
    ).then((saved) => {
      if (saved) setQuestion(false);
    });
  }
  function uploadEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !issueNumber) return;
    const form = new FormData(event.currentTarget);
    void perform(async () => {
      if (file.size > 4 * 1024 * 1024)
        throw new Error("Choose an image smaller than 4 MB.");
      const encoded = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      return api("/api/qa/evidence", {
        method: "POST",
        body: {
          evidence: {
            issue: issueNumber,
            caption: form.get("caption"),
            phase: form.get("phase"),
            content_type: file.type,
            data_base64: encoded,
            revision: live?.revision,
            context: {
              steps: form.get("steps"),
              expected: form.get("expected"),
              actual: form.get("actual"),
              viewport: `${window.innerWidth}×${window.innerHeight}`,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              observed_at: new Date().toISOString(),
            },
          },
        },
      });
    }, "Screenshot and observed evidence saved to this revision.");
  }

  return (
    <main className="qa-workspace">
      <aside className="qa-rail">
        <a className="qa-brand" href="/qa">
          <span>Q / A</span>
          <small>OPERATIONS DESK</small>
        </a>
        <nav aria-label="QA workspace">
          {nav.map(([id, label], index) => (
            <Button
              key={id}
              className={section === id ? "qa-nav active" : "qa-nav"}
              onClick={() => setSection(id)}
            >
              <span>0{index + 1}</span>
              {label}
            </Button>
          ))}
        </nav>
        <div className="qa-rail-bottom">
          <span className="qa-dot" />
          Connected to Meta Clinic<a href="/demo">Open demo ↗</a>
          <a href="/clinic/updates">Application updates ↗</a>
          <a href="/owner">Owner workspace ↗</a>
        </div>
      </aside>
      <div className="qa-main">
        <header className="qa-header">
          <div>
            <p className="qa-eyebrow">RELEASE CONFIDENCE / SHARED WITH MUSE</p>
            <h1>{nav.find(([id]) => id === section)?.[1]}</h1>
          </div>
          <div className="qa-actions">
            <Button onClick={() => void refresh(true)} disabled={busy}>
              Refresh sources
            </Button>
            <Button
              className="qa-primary"
              disabled={busy || !pinReady}
              onClick={() =>
                void queue(
                  "retest",
                  `Retest ${live?.version ?? "build"} · ${live?.revision?.slice(0, 8)}`,
                  {
                    scope: "Current-build retest",
                    prior_qa_revision: data?.state.last_qa_revision,
                  },
                )
              }
            >
              Retest this build
            </Button>
          </div>
        </header>
        {error && (
          <Alert severity="error">
            {error}
            {/sign|owner/i.test(error) && (
              <a href="/login?next=%2Fqa"> Sign in to QA</a>
            )}
          </Alert>
        )}
        {notice && (
          <Alert severity="success" onClose={() => setNotice("")}>
            {notice}
          </Alert>
        )}
        <section
          className={`qa-build ${mismatch ? "changed" : ""}`}
          aria-label="Build identity gate"
        >
          <div className="qa-build-label">
            <span className="qa-dot" />
            <strong>
              {live?.dirty
                ? "UNCOMMITTED SOURCE · QA PAUSED"
                : mismatch
                  ? "BUILD CHANGED · QA PAUSED"
                  : pinReady
                    ? "BUILD PIN CONFIRMED"
                    : live?.revision
                      ? "LIVE BUILD OBSERVED"
                      : "BUILD UNAVAILABLE"}
            </strong>
            <small>{stamp(live?.observed_at)}</small>
            {live?.environment && (
              <small>
                {live.environment}
                {live.dirty
                  ? " · uncommitted source changes"
                  : " · committed source"}
              </small>
            )}
          </div>
          <div>
            <span>LIVE {live?.version ?? "—"}</span>
            <code>{live?.revision ?? "Waiting for build.json"}</code>
          </div>
          <div>
            <span>{data?.pin ? "CONFIRMED QA PIN" : "MUSE LAST PIN"}</span>
            <code>
              {data?.pin?.revision ??
                data?.state.last_qa_revision ??
                "No prior pin recorded"}
            </code>
          </div>
          {!pinReady && (
            <p>
              Observe this build and confirm its pin before requesting QA.
              Historical verdicts retain their original revision.{" "}
              <Button
                disabled={!live?.revision || live.dirty || busy}
                onClick={() => setPinDialog(true)}
              >
                Confirm live build pin
              </Button>
            </p>
          )}
        </section>
        {!data && !error && (
          <p className="qa-empty">Connecting the QA records…</p>
        )}
        {data && (
          <>
            {section === "overview" && (
              <>
                <div className="qa-metrics">
                  <Metric
                    label="Atlas build"
                    count={
                      data.atlas?.averages
                        ? `${data.atlas.averages.build}%`
                        : "Unavailable"
                    }
                    detail="Recorded implementation estimate · MC-01–15"
                  />
                  <Metric
                    label="Atlas local validation"
                    count={
                      data.atlas?.averages
                        ? `${data.atlas.averages.validation}%`
                        : "Unavailable"
                    }
                    detail="Not full browser acceptance"
                  />
                  <Metric
                    label="Atlas work inventory"
                    count={data.atlas?.inventory?.length ?? "Unavailable"}
                    detail="Named work rows · separate from Muse retests"
                  />
                  <Metric
                    label="GitHub open defects"
                    count={
                      issues.filter((issue) => issue.state === "open").length
                    }
                    detail={
                      data.github.status === "connected"
                        ? "Live source · muse-qa"
                        : `Source ${data.github.status}`
                    }
                  />
                  <Metric
                    label="Waiting for an agent"
                    count={
                      waiting.filter((task) => task.status === "queued").length
                    }
                    detail="Next scheduled run"
                  />
                  <Metric
                    label="Retest verdicts recorded"
                    count={`${completed} / ${retests.length}`}
                    detail="Imported full retest campaign"
                  />
                  <Metric
                    label="Historical follow-up"
                    count={blocked.length}
                    detail="Failed, partial, or blocked"
                  />
                  <Metric
                    label="Human approvals"
                    count={`${approved.length} / ${reviewable.length}`}
                    detail={`${needsReview.length} awaiting your review · historical retests excluded`}
                  />
                </div>
                <div className="qa-overview-grid">
                  <section className="qa-panel">
                    <PanelTitle
                      tag="01"
                      title="Needs action"
                      detail="Owner, Muse, and Codex share this queue"
                    />
                    {needsReview.map((task) => (
                      <div className="qa-action-row" key={`review-${task.id}`}>
                        <Status status="needs-human-review" />
                        <div>
                          <strong>{task.title}</strong>
                          <small>
                            You · agent verdict and screenshots are ready ·{" "}
                            {task.revision === live?.revision
                              ? "current revision"
                              : "older revision"}{" "}
                            {task.revision}
                          </small>
                        </div>
                        <Button onClick={() => setReviewTask(task)}>
                          Review evidence →
                        </Button>
                      </div>
                    ))}
                    {waiting.length === 0 && blocked.length === 0 && (
                      <p className="qa-empty">
                        No queued requests. Retest this build to create work for
                        Muse.
                      </p>
                    )}
                    {waiting.map((task) => (
                      <div className="qa-action-row" key={task.id}>
                        <Status status={task.status} />
                        <div>
                          <strong>{task.title}</strong>
                          <small>
                            {task.recipient} ·{" "}
                            {task.claimed_by
                              ? `Picked up by ${task.claimed_by} at ${stamp(task.claimed_at)}`
                              : "Awaiting pickup"}
                            {" · "}
                            {task.revision === live?.revision
                              ? "current revision"
                              : "older revision"}{" "}
                            {task.revision}
                          </small>
                        </div>
                        <Button onClick={() => setSection("inbox")}>
                          View task →
                        </Button>
                      </div>
                    ))}
                    {blocked.slice(0, 8).map((item, index) => (
                      <div
                        className="qa-action-row"
                        key={`${item.id}-${index}`}
                      >
                        <Status status={item.status} />
                        <div>
                          <strong>
                            Muse #{value(item.muse_qa_id ?? item.id)}
                          </strong>
                          <small>
                            Historical · {value(item.owner)} · {item.evidence}
                            {" · "}
                            {item.revision ??
                              data.state.last_qa_revision ??
                              "Revision not recorded"}
                          </small>
                        </div>
                        <Button onClick={() => setSection("retests")}>
                          View verdict →
                        </Button>
                      </div>
                    ))}
                  </section>
                  <section className="qa-panel qa-campaign">
                    <PanelTitle
                      tag="02"
                      title="Full hand retest"
                      detail="Recorded verdicts, with their original build"
                    />
                    <div className="qa-progress-number">
                      {completed}
                      <span> / {retests.length}</span>
                    </div>
                    <progress
                      value={completed}
                      max={Math.max(retests.length, 1)}
                      aria-label="Retest progress"
                    />
                    <div className="qa-campaign-owners">
                      {[
                        ...new Set(
                          retests.map((item) => item.owner ?? "Unassigned"),
                        ),
                      ].map((owner) => (
                        <div key={owner}>
                          <strong>{owner}</strong>
                          <span>
                            {
                              retests.filter(
                                (item) =>
                                  item.owner === owner &&
                                  verdictDone(item.status),
                              ).length
                            }{" "}
                            recorded
                          </span>
                        </div>
                      ))}
                    </div>
                    <Button onClick={() => setSection("retests")}>
                      Read campaign evidence →
                    </Button>
                    <hr />
                    <h3>Current batch</h3>
                    {data.state.batches?.length ? (
                      <Batch
                        batch={
                          data.state.batches[data.state.batches.length - 1]
                        }
                      />
                    ) : (
                      <p className="qa-empty">
                        Batch state file has not been supplied. No active batch
                        is inferred.
                      </p>
                    )}
                  </section>
                </div>
                <section className="qa-panel">
                  <PanelTitle
                    tag="03"
                    title="Operator controls"
                    detail="Every request leaves a visible receipt"
                  />
                  <div className="qa-control-grid">
                    <div>
                      <h3>Report what you saw</h3>
                      <p>
                        Route, steps, expected behavior, and actual behavior go
                        to Muse's triage inbox.
                      </p>
                      <Button
                        onClick={() => setReport(true)}
                        disabled={!live?.revision}
                      >
                        Report a defect
                      </Button>
                    </div>
                    <div>
                      <h3>Unblock the fix</h3>
                      <p>
                        Ask Codex for reproduction help or clarification, tied
                        to a defect.
                      </p>
                      <Button
                        onClick={() => setQuestion(true)}
                        disabled={!live?.revision}
                      >
                        Ask Codex
                      </Button>
                    </div>
                    <div>
                      <h3>Prepare a clean QA clinic</h3>
                      <p>
                        A fresh dedicated baseline opens in the app. Its clinic
                        id and revision are recorded.
                      </p>
                      <Button
                        disabled={
                          busy ||
                          !live?.revision ||
                          live.dirty ||
                          tasks.some((task) => task.status === "claimed")
                        }
                        onClick={() =>
                          void perform(
                            () =>
                              api("/api/qa/baseline", {
                                method: "POST",
                                body: { revision: live?.revision },
                              }),
                            "Dedicated QA baseline prepared. Open the QA clinic to begin.",
                          )
                        }
                      >
                        Prepare QA baseline
                      </Button>
                      {data.baseline && (
                        <a href={data.baseline.route}>
                          Open QA clinic #{data.baseline.practice_id} ↗
                        </a>
                      )}
                    </div>
                  </div>
                </section>
              </>
            )}
            {section === "atlas" && (
              <section className="qa-panel">
                <PanelTitle
                  tag="IMPLEMENTATION"
                  title="Full Atlas inventory"
                  detail="Work requirements, not a count of unique open bugs"
                />
                {data.atlas?.averages ? (
                  <>
                    <div className="qa-metrics">
                      <Metric
                        label="Build"
                        count={`${data.atlas.averages.build}%`}
                        detail="Recorded source implementation estimate"
                      />
                      <Metric
                        label="Local validation"
                        count={`${data.atlas.averages.validation}%`}
                        detail="Recorded scoped evidence"
                      />
                      <Metric
                        label="External / human acceptance"
                        count={`${data.atlas.averages.external}%`}
                        detail="Separate from QA task approvals"
                      />
                    </div>
                    <p>{data.atlas.scoring_basis}</p>
                    <p>
                      {data.atlas.source} · updated{" "}
                      {data.atlas.tracker_updated_at ?? "not recorded"} ·{" "}
                      {data.atlas.status.replaceAll("_", " ")}
                    </p>
                  </>
                ) : (
                  <Alert severity="warning">
                    {data.atlas?.error ?? "Atlas unavailable"}
                  </Alert>
                )}
                <Alert
                  severity={
                    data.atlas?.inventory_status === "snapshot_outdated"
                      ? "warning"
                      : "info"
                  }
                >
                  {data.atlas?.inventory?.length ?? 0} Atlas rows ·{" "}
                  {retests.length} Muse retest findings ·{" "}
                  {issues.filter((issue) => issue.state === "open").length}{" "}
                  GitHub open defects. These inventories overlap; do not add
                  their counts as unique defects.
                  {data.atlas?.inventory_status === "snapshot_outdated" &&
                    " Atlas inventory snapshot is outdated; regenerate it before relying on its work descriptions."}
                  {data.atlas?.inventory_status === "packaged_snapshot" &&
                    " Packaged inventory snapshot; not a live repository read."}
                </Alert>
                <p>
                  The recovered 2026-09-28 PDF records a 100-workflow sweep on
                  build 0.1.8: 188 defect entries, 6 pending verification, 28
                  marked fixed/verified, and 54 improvement ideas. It is a
                  separate historical source, not a current-build retest or a
                  unique count across the 272 imported records, 70-item retest,
                  Atlas rows, and GitHub issues. See the QA workspace protocol
                  for provenance and reconciliation status.
                </p>
                <TextField
                  label="Search Atlas work or remaining gaps"
                  fullWidth
                  margin="normal"
                  size="small"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                />
                <div className="qa-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Work item</th>
                        <th>Recorded evidence / state</th>
                        <th>Still needed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.atlas?.inventory
                        ?.filter((row) =>
                          `${row.code} ${row.title} ${row.done} ${row.remaining}`
                            .toLowerCase()
                            .includes(filter.toLowerCase()),
                        )
                        .map((row) => (
                          <tr key={row.code}>
                            <td>
                              <strong>{row.title}</strong>
                              <small>
                                {row.code} · {row.kind}
                              </small>
                            </td>
                            <td>
                              {row.done}
                              <small>{row.source}</small>
                            </td>
                            <td>{row.remaining}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            {section === "defects" && (
              <section className="qa-panel">
                <PanelTitle
                  tag="REGISTER"
                  title="Open defects and fix priorities"
                  detail={`GitHub ${data.github.status} · refreshed ${stamp(data.github.observed_at)}`}
                />
                {data.github.error && (
                  <Alert severity="warning">{data.github.error}</Alert>
                )}
                <div className="qa-filters">
                  <TextField
                    label="Search issue or summary"
                    size="small"
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                  />
                  <TextField
                    select
                    label="GitHub state"
                    size="small"
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                  >
                    <MenuItem value="all">All issues</MenuItem>
                    <MenuItem value="open">Open</MenuItem>
                    <MenuItem value="closed">Closed</MenuItem>
                  </TextField>
                  <Button
                    onClick={() => setReport(true)}
                    disabled={!live?.revision}
                  >
                    Report a defect
                  </Button>
                </div>
                <div className="qa-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Fix next</th>
                        <th>Issue / summary</th>
                        <th>Status</th>
                        <th>First seen</th>
                        <th>Evidence</th>
                        <th>GitHub</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((issue) => (
                        <tr key={issue.number}>
                          <td>
                            <Button
                              aria-label={`${issue.priority ? "Unstar" : "Fix next"} issue ${issue.number}`}
                              disabled={busy}
                              onClick={() =>
                                void perform(
                                  () =>
                                    api(
                                      `/api/qa/issues/${issue.number}/priority`,
                                      {
                                        method: "POST",
                                        body: { priority: !issue.priority },
                                      },
                                    ),
                                  "Fix priority saved for the next batch.",
                                )
                              }
                            >
                              {issue.priority ? "★" : "☆"}
                            </Button>
                          </td>
                          <td>
                            <Button
                              className="qa-text-button"
                              onClick={() => setSelected(issue)}
                            >
                              #{issue.number} {issue.title}
                            </Button>
                          </td>
                          <td>
                            <Status status={issue.state} />
                          </td>
                          <td>{stamp(issue.created_at)}</td>
                          <td>
                            {
                              data.evidence.filter(
                                (item) => item.issue_number === issue.number,
                              ).length
                            }{" "}
                            saved
                          </td>
                          <td>
                            <a
                              href={issue.html_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Issue ↗
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!visible.length && (
                  <p className="qa-empty">
                    No GitHub records match. Imported Muse records remain below.
                  </p>
                )}
                <h3>Muse running list · {known.length} imported records</h3>
                <div className="qa-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Muse id</th>
                        <th>Summary</th>
                        <th>Recorded status</th>
                        <th>First seen</th>
                        <th>History</th>
                      </tr>
                    </thead>
                    <tbody>
                      {known
                        .filter((item) =>
                          `${item.id} ${item.title}`
                            .toLowerCase()
                            .includes(filter.toLowerCase()),
                        )
                        .map((item, index) => (
                          <tr key={`${item.id}-${index}`}>
                            <td>
                              {item.muse_qa_id
                                ? `#${item.muse_qa_id}`
                                : "Unnumbered source entry"}
                            </td>
                            <td>
                              <Button
                                className="qa-text-button"
                                onClick={() => setSelected(item)}
                              >
                                {item.title}
                              </Button>
                            </td>
                            <td>
                              <Status status={item.status} />
                            </td>
                            <td>{value(item.first_seen)}</td>
                            <td>
                              <Button onClick={() => setSelected(item)}>
                                Read notes →
                              </Button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <h3>Pending triage</h3>
                {tasks
                  .filter((task) => task.kind === "issue_report")
                  .map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
              </section>
            )}
            {section === "retests" && (
              <section className="qa-panel">
                <PanelTitle
                  tag="CAMPAIGN"
                  title="70-issue hand retest"
                  detail={`${completed} verdicts recorded · ${pending.length} pending`}
                />
                <progress
                  value={completed}
                  max={Math.max(retests.length, 1)}
                  aria-label="Retest campaign progress"
                />
                <div className="qa-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Issue</th>
                        <th>Owner / batch</th>
                        <th>Verdict</th>
                        <th>Observed evidence</th>
                        <th>Build / date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {retests.map((item, index) => (
                        <tr key={`${item.id}-${index}`}>
                          <td>Muse #{value(item.muse_qa_id ?? item.id)}</td>
                          <td>
                            {value(item.owner)}
                            <small>{value(item.source_batch)}</small>
                          </td>
                          <td>
                            <Status status={item.status} />
                          </td>
                          <td className="qa-evidence-text">
                            {value(item.evidence)}
                          </td>
                          <td>
                            <code>
                              {item.revision ?? "Revision not supplied"}
                            </code>
                            <small>{stamp(item.evidence_at)}</small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <h3>Batch history / fix pipeline</h3>
                {data.state.batches?.map((batch, index) => (
                  <Batch key={index} batch={batch} />
                ))}
              </section>
            )}
            {section === "coverage" && (
              <section className="qa-panel">
                <PanelTitle
                  tag="WORKFLOWS"
                  title="Coverage ledger"
                  detail={`${coverage.length} supplied workflow records · total catalog ${data.state.coverage_total ?? 116}`}
                />
                <p>
                  Missing workflow exports are unassessed. Historical passes
                  retain their original revision.
                </p>
                <div className="qa-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Workflow</th>
                        <th>Result</th>
                        <th>Attempted at</th>
                        <th>Version / revision</th>
                        <th>Evidence reference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coverage.map((item, index) => (
                        <tr key={index}>
                          <td>{value(item.id ?? item.workflow)}</td>
                          <td>
                            <Status status={value(item.result)} />
                          </td>
                          <td>
                            {stamp(
                              typeof item.last_attempted_at === "string"
                                ? item.last_attempted_at
                                : undefined,
                            )}
                          </td>
                          <td>
                            {value(item.version)}
                            <small>
                              <code>{value(item.revision)}</code>
                            </small>
                          </td>
                          <td>{value(item.evidence_ref)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!coverage.length && (
                  <p className="qa-empty">
                    The supplied text contains collapsed workflow data. Import
                    Muse's full COVERAGE_STATE.json to fill this ledger.
                  </p>
                )}
              </section>
            )}
            {section === "inbox" && (
              <section className="qa-panel">
                <PanelTitle
                  tag="MAILBOX"
                  title="Agent tasks"
                  detail="One atomic claim per run · queued → claimed → verdict"
                />
                {tasks.length ? (
                  tasks.map((task) => (
                    <div key={task.id}>
                      <TaskCard task={task} />
                      {["completed", "failed"].includes(task.status) &&
                        !task.human_decision?.outcome && (
                          <Button onClick={() => setReviewTask(task)}>
                            Review agent evidence
                          </Button>
                        )}
                      {Boolean(task.human_decision?.outcome) && (
                        <p>
                          Human review: {value(task.human_decision?.outcome)} ·{" "}
                          {value(task.human_decision?.reviewer)} ·{" "}
                          {value(task.human_decision?.reviewed_at)}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="qa-empty">No task requests yet.</p>
                )}
                <h3>Agent protocol</h3>
                <ul className="qa-rules">
                  {data.guardrails.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
                <div className="qa-endpoints">
                  {["status", "issues", "retest", "batches"].map((name) => (
                    <a key={name} href={`/qa/${name}.json`}>
                      /qa/{name}.json ↗
                    </a>
                  ))}
                </div>
                <p>
                  The scheduled agent uses its QA service token from Secure
                  Vault. Claim receipt, run id, pickup time, and result appear
                  in this inbox.
                </p>
              </section>
            )}
            {section === "timeline" && (
              <>
                <section className="qa-panel">
                  <PanelTitle
                    tag="EVENT LOG"
                    title="Shared activity"
                    detail="Append-only receipts from the owner and agents"
                  />
                  {data.events.length ? (
                    data.events.map((event) => (
                      <article className="qa-timeline-item" key={event.id}>
                        <span
                          className={`qa-event-marker ${shade(event.kind)}`}
                        />
                        <div>
                          <small>
                            {stamp(event.created_at)} ·{" "}
                            {event.kind.replaceAll("_", " ")}
                          </small>
                          <h3>{event.summary}</h3>
                          {event.revision && <code>{event.revision}</code>}
                          <details>
                            <summary>Event context</summary>
                            <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                          </details>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="qa-empty">
                      The next request, claim, screenshot, or verdict begins the
                      shared timeline.
                    </p>
                  )}
                </section>
                <section className="qa-panel">
                  <PanelTitle
                    tag="RELEASES"
                    title="Deploy → retest evidence"
                    detail="Revision is the identity; version is the display label"
                  />
                  {data.state.releases?.length ? (
                    data.state.releases.map((release, index) => (
                      <Batch key={index} batch={release} />
                    ))
                  ) : (
                    <p className="qa-empty">
                      No deploy records imported yet.{" "}
                      <a href="/clinic/updates">
                        Read application change log ↗
                      </a>
                    </p>
                  )}
                </section>
              </>
            )}
            {section === "retests" && (
              <section className="qa-panel">
                <PanelTitle
                  tag="SWEEP"
                  title="New-defect sweep and candidates"
                  detail={`${data.state.sweep_batches?.length ?? 0} supplied batches · ${data.state.candidates?.length ?? 0} candidates`}
                />
                {data.state.sweep_batches?.map((batch, index) => (
                  <Batch key={index} batch={batch} />
                ))}
                {data.state.candidates?.map((candidate, index) => (
                  <details key={index}>
                    <summary>
                      {value(candidate.id ?? candidate.candidate_id)} ·{" "}
                      {value(candidate.title ?? candidate.summary)}
                    </summary>
                    <pre>{JSON.stringify(candidate, null, 2)}</pre>
                  </details>
                ))}
              </section>
            )}
            {data.state.import_notes?.length && (
              <details className="qa-import-notes">
                <summary>Source import notes / unavailable exports</summary>
                <ul>
                  {data.state.import_notes.map((note, index) => (
                    <li key={index}>{note}</li>
                  ))}
                </ul>
              </details>
            )}
            <footer className="qa-footer">
              SOURCE: GITHUB + MUSE RECORDS + SHARED QA DATABASE
              <span>
                Last agent state update {stamp(data.state.updated_at)}
              </span>
            </footer>
          </>
        )}
      </div>
      <Dialog
        open={pinDialog}
        onClose={() => setPinDialog(false)}
        fullWidth
        maxWidth="sm"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void perform(
              () =>
                api("/api/qa/pin", {
                  method: "POST",
                  body: {
                    revision: live?.revision,
                    reason: form.get("reason"),
                  },
                }),
              "Live build pinned. QA requests can now be queued.",
            ).then((saved) => {
              if (saved) setPinDialog(false);
            });
          }}
        >
          <DialogTitle>Confirm the build for QA</DialogTitle>
          <DialogContent className="qa-dialog-fields">
            <code>{live?.revision}</code>
            <TextField
              name="reason"
              label="Why is this the build to review?"
              required
              multiline
              fullWidth
            />
            <p>
              Existing verdicts remain on their original revisions. This
              confirmation records your identity and time.
            </p>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPinDialog(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              Confirm pin
            </Button>
          </DialogActions>
        </form>
      </Dialog>
      <Dialog
        open={Boolean(reviewTask)}
        onClose={() => setReviewTask(undefined)}
        fullWidth
        maxWidth="md"
      >
        <form
          style={{
            display: "flex",
            flexDirection: "column",
            maxHeight: "calc(100dvh - 64px)",
            minHeight: 0,
          }}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void perform(
              () =>
                api(`/api/qa/tasks/${reviewTask?.id}/approval`, {
                  method: "POST",
                  body: {
                    outcome: form.get("outcome"),
                    note: form.get("note"),
                  },
                }),
              "Human review saved with your identity, timestamp, and reviewed revision.",
            ).then((saved) => {
              if (saved) setReviewTask(undefined);
            });
          }}
        >
          <DialogTitle>Review agent evidence · {reviewTask?.title}</DialogTitle>
          <DialogContent className="qa-dialog-fields">
            <code>{reviewTask?.revision}</code>
            <p>{value(reviewTask?.result.summary)}</p>
            {reviewDefects.map((defect, index) => (
              <article key={index}>
                <strong>{value(defect.id)} · </strong>
                <Status status={value(defect.verdict)} />
                <p>{value(defect.observed)}</p>
              </article>
            ))}
            <details>
              <summary>Machine-readable agent result</summary>
              <pre>{JSON.stringify(reviewTask?.result, null, 2)}</pre>
            </details>
            {reviewEvidenceIds.map((id) => {
              const item = data?.evidence.find(
                (evidence) => evidence.id === id,
              );
              return (
                <details key={id} open={item?.phase === "after"}>
                  <summary>
                    {item?.phase ?? "Evidence"} ·{" "}
                    {item?.caption ?? `Stored screenshot #${id}`}
                  </summary>
                  <figure className="qa-image">
                    <img
                      src={`/api/qa/evidence/${id}`}
                      alt={item?.caption ?? `Referenced screenshot ${id}`}
                    />
                    <figcaption>
                      {item?.phase} ·{" "}
                      {item?.caption ?? `Stored evidence #${id}`}
                      <small>
                        {stamp(item?.created_at)} · {item?.tester}
                      </small>
                      <a
                        href={`/api/qa/evidence/${id}.json`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Reproduction and browser context ↗
                      </a>
                      <code>{item?.revision}</code>
                      {item && (
                        <details>
                          <summary>Recorded reproduction details</summary>
                          <pre>{JSON.stringify(item.context, null, 2)}</pre>
                        </details>
                      )}
                    </figcaption>
                  </figure>
                </details>
              );
            })}
            <TextField
              name="outcome"
              select
              label="Your decision"
              defaultValue="changes_requested"
            >
              <MenuItem
                value="approved"
                disabled={
                  reviewTask?.status !== "completed" ||
                  !pinReady ||
                  reviewTask.revision !== live?.revision
                }
              >
                Accept reviewed browser behavior
              </MenuItem>
              <MenuItem value="changes_requested">Request changes</MenuItem>
            </TextField>
            <TextField
              name="note"
              label="What did you review / what needs changing?"
              required
              multiline
              minRows={3}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setReviewTask(undefined)}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              Record human review
            </Button>
          </DialogActions>
        </form>
      </Dialog>
      <Dialog
        open={report}
        onClose={() => setReport(false)}
        fullWidth
        maxWidth="sm"
      >
        <form onSubmit={submitReport}>
          <DialogTitle>Report a defect to Muse</DialogTitle>
          <DialogContent className="qa-dialog-fields">
            <TextField
              name="title"
              label="One-line summary"
              required
              fullWidth
            />
            <TextField
              name="route"
              label="Where were you? Route or screen"
              required
              fullWidth
            />
            <TextField
              name="steps"
              label="What did you do?"
              required
              multiline
              minRows={2}
              fullWidth
            />
            <TextField
              name="expected"
              label="What did you expect?"
              required
              multiline
              fullWidth
            />
            <TextField
              name="actual"
              label="What happened? Include exact UI text"
              required
              multiline
              fullWidth
            />
            <p>
              Saved to pending triage on {live?.revision}. Muse picks it up on
              the next scheduled run.
            </p>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setReport(false)}>Cancel</Button>
            <Button type="submit" disabled={busy || !pinReady}>
              Save to triage
            </Button>
          </DialogActions>
        </form>
      </Dialog>
      <Dialog
        open={question}
        onClose={() => setQuestion(false)}
        fullWidth
        maxWidth="sm"
      >
        <form onSubmit={submitQuestion}>
          <DialogTitle>Ask Codex</DialogTitle>
          <DialogContent className="qa-dialog-fields">
            <TextField
              name="title"
              label="Question summary"
              required
              fullWidth
            />
            <TextField
              name="issue"
              label="GitHub issue number"
              type="number"
              defaultValue={issueNumber}
              fullWidth
            />
            <TextField
              name="question"
              label="Question / reproduction help needed"
              required
              multiline
              minRows={4}
              fullWidth
            />
            <p>
              Creates a Codex inbox task for the carrier.{" "}
              {data?.capabilities.github_questions
                ? "GitHub question delivery is configured."
                : "GitHub comment delivery requires the configured carrier; the saved inbox task remains visible."}
            </p>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setQuestion(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              Queue question
            </Button>
          </DialogActions>
        </form>
      </Dialog>
      <Dialog
        open={Boolean(selected)}
        onClose={() => {
          setSelected(undefined);
          setFile(undefined);
        }}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>{selected?.title}</DialogTitle>
        <DialogContent>
          <Status
            status={
              selected && "state" in selected
                ? selected.state
                : (selected?.status ?? "")
            }
          />
          <pre className="qa-note-history">
            {selected && "body" in selected
              ? selected.body
              : selected && "notes" in selected
                ? value(selected.notes)
                : "No notes supplied."}
          </pre>
          {selected && "history" in selected && selected.history && (
            <pre className="qa-note-history">
              {JSON.stringify(selected.history, null, 2)}
            </pre>
          )}
          <h3>Persisted evidence</h3>
          {matchingEvidence.map((item) => (
            <figure className="qa-image" key={item.id}>
              <a href={item.url} target="_blank" rel="noreferrer">
                <img src={item.url} alt={item.caption} />
              </a>
              <figcaption>
                <strong>
                  {item.phase} · {item.caption}
                </strong>
                <small>
                  {stamp(item.created_at)} · {item.tester}
                </small>
                <code>{item.revision}</code>
                <pre>{JSON.stringify(item.context, null, 2)}</pre>
              </figcaption>
            </figure>
          ))}
          {!matchingEvidence.length && (
            <p>No screenshots saved for this defect yet.</p>
          )}
          {issueNumber && (
            <form className="qa-dialog-fields" onSubmit={uploadEvidence}>
              <h3>Add observed evidence</h3>
              <input
                aria-label="Evidence screenshot"
                type="file"
                accept="image/png,image/jpeg"
                required
                onChange={(event) => setFile(event.target.files?.[0])}
              />
              <TextField
                select
                name="phase"
                label="Evidence phase"
                defaultValue="after"
              >
                <MenuItem value="before">Before fix</MenuItem>
                <MenuItem value="after">After fix</MenuItem>
                <MenuItem value="observation">Observation</MenuItem>
              </TextField>
              <TextField
                name="caption"
                label="Positive observation / screenshot caption"
                required
              />
              <TextField
                name="steps"
                label="Reproduction steps"
                required
                multiline
              />
              <TextField
                name="expected"
                label="Expected result"
                required
                multiline
              />
              <TextField
                name="actual"
                label="Actual readback / exact UI text"
                required
                multiline
              />
              <Button type="submit" disabled={busy || !live?.revision}>
                Save screenshot and evidence
              </Button>
            </form>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setQuestion(true);
              setSelected(undefined);
            }}
          >
            Ask Codex
          </Button>
          {issueNumber && (
            <Button
              disabled={busy || !live?.revision}
              onClick={() =>
                void queue("retest", `Retest GitHub #${issueNumber}`, {
                  github_issue: issueNumber,
                })
              }
            >
              Queue retest
            </Button>
          )}
          <Button onClick={() => setSelected(undefined)}>Close</Button>
        </DialogActions>
      </Dialog>
    </main>
  );
}
function Status({ status }: { status: string }) {
  return (
    <span className={`qa-status ${shade(status)}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}
function Metric({
  label,
  count,
  detail,
}: {
  label: string;
  count: number | string;
  detail: string;
}) {
  return (
    <div className="qa-metric">
      <span>{label}</span>
      <strong>{count}</strong>
      <small>{detail}</small>
    </div>
  );
}
function PanelTitle({
  tag,
  title,
  detail,
}: {
  tag: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="qa-panel-title">
      <span>{tag}</span>
      <div>
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
    </div>
  );
}
function TaskCard({ task }: { task: Task }) {
  return (
    <article className="qa-task-card">
      <div>
        <Status status={task.status} />
        <strong>
          #{task.id} · {task.title}
        </strong>
        <small>
          To {task.recipient} · queued {stamp(task.created_at)}
          {task.claimed_by &&
            ` · claimed by ${task.claimed_by} at ${stamp(task.claimed_at)}`}
        </small>
        <code>{task.revision}</code>
      </div>
      <details>
        <summary>Request and result</summary>
        <pre>
          {JSON.stringify(
            { request: task.payload, result: task.result },
            null,
            2,
          )}
        </pre>
      </details>
    </article>
  );
}
function Batch({ batch }: { batch: RecordData }) {
  const campaign = typeof batch.id === "string" && /^[JM]\d+$/.test(batch.id);
  return (
    <article className="qa-batch">
      <h3>
        Batch{" "}
        {value(
          batch.batch ??
            batch.batch_number ??
            batch.number ??
            batch.id ??
            batch.version,
        )}
        {batch.owner ? ` · ${value(batch.owner)}` : ""}
      </h3>
      <Status status={value(batch.status)} />
      {campaign ? (
        <p>
          <code>{value(batch.revision)}</code> · {value(batch.observed_at)} ·
          historical retest
        </p>
      ) : (
        <div className="qa-pipeline">
          {[
            ["PR", batch.pr ?? batch.pr_url],
            ["Merged", batch.merged_at ?? batch.merge_commit],
            ["Publisher", batch.publisher_status ?? batch.published_at],
            ["Live revision", batch.deployed_revision],
            ["Retest verdict", batch.retest_verdict ?? batch.status],
          ].map(([label, recorded], index) => (
            <span key={String(label)}>
              <small>
                0{index + 1} · {String(label)}
              </small>
              {value(recorded)}
            </span>
          ))}
        </div>
      )}
      <details>
        <summary>Recorded batch / release context</summary>
        <pre>{JSON.stringify(batch, null, 2)}</pre>
      </details>
      {[
        batch.codex_task_url,
        batch.pr_url,
        batch.batch_start_comment,
        batch.deployed_build_comment,
      ]
        .filter(
          (url): url is string =>
            typeof url === "string" && /^https:\/\//.test(url),
        )
        .map((url) => (
          <a key={url} href={url} target="_blank" rel="noreferrer">
            {url.includes("pull")
              ? "Pull request"
              : url.includes("chatgpt")
                ? "Codex task"
                : "Source receipt"}{" "}
            ↗{" "}
          </a>
        ))}
    </article>
  );
}
