import {
  QaChangeImpact,
  QaImpactDetail,
  useChangeImpact,
} from "./QaChangeImpact";
import { impactLabel, impactRow } from "./changeImpact";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { MuseGridEditor, MuseKeyConnection } from "./MuseGridEditor";
import type { MuseBrowserKey } from "./museBrowserKey";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import { useOfficeRequest, useOfficeLink } from "./officeTransport";
import { museQaActivity, type MuseCheckIn } from "./museCheckIn";

type ArchivedEvidence = {
  kind: "observation" | "screenshot";
  text?: string;
  id?: number;
  url?: string;
  sha256?: string;
};
type Defect = {
  id: number | string;
  title: string;
  severity?: string;
  status: string;
  workflow?: string | null;
  repro_steps?: string;
  expected?: string;
  actual?: string;
  evidence_refs?: (number | string)[];
  evidence?: ArchivedEvidence[];
  evidence_notes?: string;
  notes?: string;
  repair_attempts?: number | null;
  revision?: string | null;
  version?: string | null;
};
type Workflow = {
  id?: string;
  workflow?: string;
  title?: string;
  result?: string;
  status?: string;
  marker?: string;
  revision?: string;
  version?: string;
  last_attempted_at?: string;
  last_attempt?: string;
  evidence_ref?: string;
  notes?: string;
  stale_build?: boolean;
  seal?: { reason?: string };
  evidence?: ArchivedEvidence[] | string;
};
type Batch = {
  id?: string | number;
  batch?: string | number;
  batch_number?: string | number;
  title?: string;
  status?: string;
  owner?: string;
  revision?: string;
  pr_number?: number;
  pr_url?: string;
  diff_url?: string;
  deployed_revision?: string;
  retest_verdict?: string;
  updated_at?: string;
  observed_at?: string;
  merged_at?: string;
  published_at?: string;
  poll?: {
    state?: string;
    merged?: boolean;
    head?: string;
    ci_state?: string;
    deployment?: string;
    observed_at?: string;
  };
};
type QaSnapshot = {
  build: {
    revision: string | null;
    version: string | null;
    observed_at: string | null;
    dirty?: boolean;
    error?: string;
  };
  pin: { revision?: string } | null;
  diff_url: string | null;
  ledger: {
    source: string | null;
    imported_at: string | null;
    counts: { open: number; pending_retest: number; fixed: number } | null;
    defects: Defect[];
    pending_requests: {
      id?: number;
      title?: string;
      status?: string;
      created_at?: string;
    }[];
  };
  coverage: {
    workflows: Workflow[];
    pointer?: string | number | null;
    imported_at?: string | null;
    source?: string | null;
    expected_total: number;
  };
  batches: Batch[];
  active_batch: Batch | null;
  capabilities: {
    file_defect: boolean;
    request_retest: boolean;
    poll_batch: boolean;
    import_ledger: boolean;
  };
};
const workflowIds = Array.from(
  { length: 116 },
  (_, index) => `WF-${String(index + 1).padStart(3, "0")}`,
);
const label = (value?: string | null) =>
  value?.replaceAll("_", " ") || "Not recorded";
const workflowLabel = (item?: Workflow) =>
  item?.status === "expired"
    ? item.seal?.reason === "lease_expired"
      ? "Expired - lease ended"
      : item.seal?.reason === "build_changed"
        ? "Expired - build changed"
        : "Expired - build unavailable or dirty"
    : label(item?.result ?? item?.status ?? "unassessed");
const time = (value?: string | null) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString()
    : "Not recorded";
const secureLink = (value?: string | null) =>
  value && /^https:\/\//.test(value) ? value : undefined;
const batchLink = (batch: Batch) =>
  secureLink(batch.diff_url ?? batch.pr_url) ??
  (Number.isInteger(batch.pr_number) && batch.pr_number! > 0
    ? `https://github.com/joshrice171723-creator/meta_clinic/pull/${batch.pr_number}/files`
    : undefined);

/** QA is a server ledger projection. Browser actions submit requests, never verdicts. */
export function QaOfficeQa({
  buildBannerTarget,
  museCheckIn,
  officeUnavailable = false,
}: {
  buildBannerTarget?: HTMLElement | null;
  museCheckIn?: MuseCheckIn;
  officeUnavailable?: boolean;
}) {
  const api = useOfficeRequest();
  const officeLink = useOfficeLink();
  const [snapshot, setSnapshot] = useState<QaSnapshot>();
  const [readError, setReadError] = useState("");
  const [writeError, setWriteError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [refreshedAt, setRefreshedAt] = useState(0);
  const [selected, setSelected] = useState<Defect>();
  const [workflow, setWorkflow] = useState<Workflow & { id: string }>();
  const [report, setReport] = useState(false);
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [reportWorkflow, setReportWorkflow] = useState("");
  const [steps, setSteps] = useState("");
  const [expected, setExpected] = useState("");
  const [actual, setActual] = useState("");
  const active = useRef(false);
  const version = useRef(0);
  const pending = useRef<{ content: string; key: string } | undefined>(
    undefined,
  );
  const [museConnection, setMuseConnection] = useState<MuseBrowserKey>();
  const refresh = useCallback(
    async (strict = false) => {
      const request = ++version.current;
      try {
        const received = await api<QaSnapshot>("/api/qa/office/qa");
        if (
          !received.build ||
          !Array.isArray(received.ledger?.defects) ||
          !Array.isArray(received.coverage?.workflows)
        )
          throw new Error("QA ledger projection is unavailable.");
        if (!active.current || request !== version.current) return;
        setSnapshot(received);
        setRefreshedAt(Date.now());
        setWorkflow((previous) =>
          previous
            ? {
                ...received.coverage.workflows.find(
                  (item) => item.id === previous.id,
                ),
                id: previous.id,
              }
            : undefined,
        );
        setReadError("");
        setSelected((previous) =>
          previous
            ? received.ledger.defects.find(
                (defect) => defect.id === previous.id,
              )
            : undefined,
        );
        setNow(Date.now());
      } catch (reason) {
        if (active.current && request === version.current)
          setReadError(
            reason instanceof Error ? reason.message : "QA refresh failed.",
          );
        if (strict) throw reason;
      }
    },
    [api],
  );
  useEffect(() => {
    active.current = true;
    void refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 15000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      active.current = false;
      version.current++;
      window.clearInterval(timer);
      window.clearInterval(clock);
    };
  }, [refresh]);
  const write = async (
    path: string,
    envelope: string,
    command: Record<string, unknown>,
    success: string,
  ) => {
    if (busy || readError) return false;
    const content = JSON.stringify({ path, command });
    if (pending.current?.content !== content)
      pending.current = { content, key: crypto.randomUUID() };
    setBusy(true);
    setWriteError("");
    setNotice("");
    try {
      const receipt = await api<{
        receipt_id?: string;
        task?: { id: number };
        delivery?: string;
      }>(path, {
        method: "POST",
        body: { [envelope]: { ...command, request_key: pending.current.key } },
      });
      if (!active.current) return false;
      pending.current = undefined;
      setNotice(
        `${success}${receipt.task?.id ? ` Request #${receipt.task.id}.` : ""}${receipt.receipt_id ? ` Receipt ${receipt.receipt_id}.` : ""}`,
      );
      await refresh();
      return true;
    } catch (reason) {
      if (active.current)
        setWriteError(
          reason instanceof Error
            ? reason.message
            : "Request delivery could not be confirmed.",
        );
      return false;
    } finally {
      if (active.current) setBusy(false);
    }
  };
  const impact = useChangeImpact();
  const build = snapshot?.build;
  const revision = build?.revision;
  const observed = build?.observed_at ? Date.parse(build.observed_at) : NaN;
  const verified =
    !!revision &&
    /^[0-9a-f]{40}$/.test(revision) &&
    Number.isFinite(observed) &&
    observed <= now &&
    !build.error;
  const ready = !!snapshot && !readError;
  const age =
    Number.isFinite(observed) && observed <= now
      ? `${Math.floor((now - observed) / 1000)}s ago`
      : "Unknown";
  const records = new Map(
    (snapshot?.coverage.workflows ?? []).map((item) => [
      item.id ?? item.workflow,
      item,
    ]),
  );
  const currentRecords = [...records.values()].filter(
    (item) =>
      !!revision &&
      !build?.dirty &&
      !item.stale_build &&
      item.revision === revision,
  );
  const countResults = (pattern: RegExp) =>
    currentRecords.filter((item) =>
      pattern.test(item.result ?? item.status ?? ""),
    ).length;
  const passes = countResults(/^(passed|pass)$/i);
  const failures = countResults(/^(failed|fail)$/i);
  const blocked = countResults(/^blocked$/i);
  const inProgress = countResults(/^(in_progress|working|running)$/i);
  const activeWorkflows = currentRecords.filter((item) =>
    /^(in_progress|working|running)$/i.test(item.result ?? item.status ?? ""),
  );
  const museActivity = museQaActivity(
    museCheckIn,
    now,
    ready &&
      verified &&
      !build?.dirty &&
      !officeUnavailable &&
      now >= refreshedAt &&
      now - refreshedAt < 30_000,
    inProgress,
    blocked,
  );
  const importedCoverage =
    !!snapshot?.coverage.source ||
    !!snapshot?.coverage.imported_at ||
    records.size > 0;
  const canRetest = (defect: Defect) =>
    typeof defect.id === "number" &&
    ready &&
    !!snapshot.capabilities.request_retest;
  const retest = (defect: Defect) => {
    if (canRetest(defect))
      void write(
        "/api/qa/office/qa/retests",
        "retest",
        { defect_id: defect.id },
        "Retest request recorded. Recipient pickup and a new verdict remain pending.",
      );
  };
  const activeBatch = snapshot?.active_batch;
  if (!snapshot) {
    return (
      <Stack
        component="section"
        aria-label="Office QA desk"
        aria-busy={!readError}
        spacing={2}
        sx={{ minWidth: 0, mt: 2 }}
      >
        <Typography variant="h5" component="h3">
          QA desk
        </Typography>
        {readError ? (
          <Alert severity="warning">
            QA records could not be loaded. {readError}
            <Button onClick={() => void refresh()}>Retry QA desk</Button>
          </Alert>
        ) : (
          <>
            <Typography role="status">
              Reading the build and Muse's QA ledger…
            </Typography>
            <LinearProgress aria-label="Loading QA ledger" />
          </>
        )}
      </Stack>
    );
  }
  const buildBanner = (
    <Alert
      severity={!verified || build?.dirty ? "warning" : "info"}
      sx={{ "& .MuiAlert-message": { width: "100%", minWidth: 0 } }}
    >
      <Stack spacing={0.5}>
        <Typography variant="subtitle2">
          {!verified
            ? "Build metadata unavailable; QA continues"
            : build?.dirty
              ? "Uncommitted build observed · QA continues"
              : "Current build observed"}
        </Typography>
        <Typography variant="body2">
          Version {build?.version ?? "unknown"} · verified {age}
        </Typography>
        <Typography
          component="code"
          variant="caption"
          sx={{ overflowWrap: "anywhere" }}
        >
          {revision ?? "Full build revision unavailable"}
        </Typography>
        {secureLink(snapshot?.diff_url) && (
          <a href={snapshot!.diff_url!} target="_blank" rel="noreferrer">
            Compare observed build and historical QA revision on GitHub
          </a>
        )}
      </Stack>
    </Alert>
  );
  return (
    <Stack
      component="section"
      aria-label="Office QA desk"
      spacing={2}
      sx={{ minWidth: 0, mt: 2 }}
    >
      <Stack
        direction="row"
        sx={{
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          flexWrap: "wrap",
        }}
      >
        <Typography variant="h5" component="h3">
          QA desk
        </Typography>
        <Button onClick={() => void refresh()} disabled={busy}>
          Refresh QA desk
        </Button>
      </Stack>
      {!snapshot && !readError && (
        <Typography role="status">
          Reading the build and Muse's QA ledger…
        </Typography>
      )}
      {readError && (
        <Alert severity="warning">
          QA reads failed. Displayed records may be stale and actions are
          paused. {readError}
        </Alert>
      )}
      {writeError && (
        <Alert severity="error">
          {writeError} Inputs retained; retry explicitly with the same content.
        </Alert>
      )}
      {notice && (
        <Alert severity="success" role="status">
          {notice}
        </Alert>
      )}
      {buildBannerTarget
        ? createPortal(buildBanner, buildBannerTarget)
        : buildBanner}
      <Stack
        direction="row"
        sx={{ gap: 1, flexWrap: "wrap", alignItems: "center" }}
      >
        {(["open", "pending_retest", "fixed"] as const).map((state) => (
          <Chip
            key={state}
            variant="outlined"
            label={`${label(state)}: ${snapshot?.ledger.counts ? snapshot.ledger.counts[state] : "Unavailable"}`}
          />
        ))}
        <Button
          variant="contained"
          disabled={busy || !snapshot?.capabilities.file_defect || !!readError}
          onClick={() => setReport(true)}
        >
          File a defect
        </Button>
      </Stack>
      <Typography variant="caption">
        {snapshot?.ledger.source
          ? `Muse ledger: ${snapshot.ledger.source} · imported ${time(snapshot.ledger.imported_at)}`
          : "Muse's full defect ledger has not been imported. Counts remain unavailable."}
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "minmax(0,1fr)",
            md: "repeat(3,minmax(0,1fr))",
          },
          gap: 1.5,
        }}
      >
        {(["open", "pending_retest", "fixed"] as const).map((column) => (
          <Paper
            key={column}
            variant="outlined"
            sx={{
              p: 1.5,
              minWidth: 0,
              overflowWrap: "anywhere",
              bgcolor: column === "fixed" ? "#f2f7f2" : "#faf9f4",
            }}
          >
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              {label(column)}
            </Typography>
            <Stack
              spacing={1}
              role="region"
              aria-label={`${label(column)} defects`}
              tabIndex={0}
              sx={{ maxHeight: 520, overflowY: "auto", minWidth: 0, pr: 0.5 }}
            >
              {snapshot?.ledger.defects
                .filter((item) => item.status === column)
                .map((item) => (
                  <Paper key={item.id} variant="outlined" sx={{ p: 1.5 }}>
                    <Stack spacing={0.75}>
                      <Typography variant="caption">
                        Muse #{item.id} · {item.severity ?? "severity unknown"}{" "}
                        · {item.workflow ?? "Workflow unassigned"}
                      </Typography>
                      <Button
                        sx={{
                          justifyContent: "flex-start",
                          textAlign: "left",
                          whiteSpace: "normal",
                          overflowWrap: "anywhere",
                          minWidth: 0,
                          px: 0,
                        }}
                        onClick={() => setSelected(item)}
                      >
                        {item.title || `Muse #${item.id}`}
                      </Button>
                      <Typography variant="caption">
                        Repair attempts {item.repair_attempts ?? "Unknown"}/3
                      </Typography>
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={busy || !canRetest(item)}
                        onClick={() => retest(item)}
                      >
                        Request retest
                      </Button>
                    </Stack>
                  </Paper>
                ))}
            </Stack>
            {snapshot &&
              !snapshot.ledger.defects.some(
                (item) => item.status === column,
              ) && (
                <Typography variant="body2" color="text.secondary">
                  {snapshot.ledger.counts
                    ? "No records in this lane."
                    : "Ledger unavailable."}
                </Typography>
              )}
          </Paper>
        ))}
      </Box>
      {!!snapshot?.ledger.pending_requests.length && (
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreRounded />}>
            Submitted requests awaiting the ledger ·{" "}
            {snapshot.ledger.pending_requests.length}
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={1}>
              {snapshot.ledger.pending_requests.map((request, index) => (
                <Typography key={request.id ?? index} variant="body2">
                  #{request.id ?? "Unknown"} ·{" "}
                  {request.title ?? "Defect report"} · {label(request.status)} ·{" "}
                  {time(request.created_at)}
                </Typography>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={1.5}>
          <Stack
            direction="row"
            sx={{ justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}
          >
            <Typography variant="h6">116-workflow coverage</Typography>
            <Typography variant="body2">
              {importedCoverage
                ? `${passes}/116 passed on this revision`
                : "Coverage unavailable"}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <Box
              component="span"
              aria-hidden="true"
              data-testid="muse-qa-light"
              data-working={museActivity.working}
              sx={{
                width: 14,
                height: 14,
                flexShrink: 0,
                borderRadius: "50%",
                bgcolor: museActivity.working ? "#1976d2" : "#767d78",
                animation: museActivity.working
                  ? "museQaPulse 1.6s ease-out infinite"
                  : "none",
                "@keyframes museQaPulse": {
                  "0%": { boxShadow: "0 0 0 0 #1976d280" },
                  "100%": { boxShadow: "0 0 0 9px #1976d200" },
                },
                "@media (prefers-reduced-motion: reduce)": {
                  animation: "none",
                },
              }}
            />
            <Typography role="status" variant="subtitle2">
              {museActivity.label}
              {museActivity.working &&
                ` · ${activeWorkflows.map((item) => item.id ?? item.workflow).join(", ")}`}
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Activity requires a current Muse check-in and an active check on
            this build. Results refresh every 15 seconds.
          </Typography>
          {importedCoverage && (
            <Typography variant="body2" role="status">
              Recorded QA on this revision: {passes} pass · {failures} fail ·{" "}
              {blocked} blocked · {inProgress} in progress ·{" "}
              {116 - currentRecords.length} without current-build evidence
            </Typography>
          )}
          <QaChangeImpact selection={impact} revision={revision} />
          {importedCoverage && (
            <LinearProgress
              variant="determinate"
              value={Math.min(100, (passes / 116) * 100)}
              aria-label="Current revision workflow passes"
            />
          )}
          <Typography variant="caption">
            Green: current-build pass · blue: recorded work in progress · red:
            failed · amber: expired claim · hatched: older or missing revision ·
            gray: unassessed. No progress is inferred from elapsed time.
          </Typography>
          <MuseKeyConnection
            connection={museConnection}
            onConnect={setMuseConnection}
          />
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(62px,1fr))",
              gap: 0.75,
            }}
          >
            {workflowIds.map((id) => {
              const item = records.get(id);
              const result = item?.result ?? item?.status ?? "unassessed";
              const stale =
                !!item &&
                (item.stale_build === true ||
                  item.revision !== revision ||
                  build?.dirty === true);
              const color =
                result === "expired"
                  ? "#ffe2a8"
                  : /^(pass|passed)$/i.test(result) && !stale
                    ? "#cce9ce"
                    : /^(in_progress|working|running)$/i.test(result) && !stale
                      ? "#cfe2f5"
                      : /^(failed|fail)$/i.test(result) && !stale
                        ? "#f5d4cf"
                        : "#eceeea";
              return (
                <Button
                  key={id}
                  size="small"
                  variant="outlined"
                  aria-label={`${id}: ${workflowLabel(item)}${stale ? ", stale revision" : ""}; impact: ${impactLabel(impactRow(impact.scope, id))}`}
                  title={`${id}: ${workflowLabel(item)}; ${impactLabel(impactRow(impact.scope, id))}`}
                  onClick={() => setWorkflow({ ...item, id })}
                  sx={{
                    fontSize: 10,
                    px: 0.25,
                    minWidth: 0,
                    minHeight: 36,
                    color: "#283b30",
                    bgcolor: color,
                    backgroundImage: stale
                      ? "repeating-linear-gradient(135deg,transparent,transparent 5px,#ffffff99 5px,#ffffff99 8px)"
                      : "none",
                    borderColor: "#c6cdc4",
                  }}
                >
                  {id.slice(3)}
                </Button>
              );
            })}
          </Box>
          <Typography variant="caption">
            Last import {time(snapshot?.coverage.imported_at)} · next recorded
            pointer {snapshot?.coverage.pointer ?? "Not recorded"}
          </Typography>
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={1}>
          <Typography variant="h6">Current batch</Typography>
          {activeBatch ? (
            <>
              <Typography>
                {activeBatch.title ??
                  `Batch ${activeBatch.batch ?? activeBatch.batch_number ?? activeBatch.id ?? "unknown"}`}{" "}
                · {label(activeBatch.status)}
              </Typography>
              <Typography variant="caption">
                Observed{" "}
                {time(activeBatch.observed_at ?? activeBatch.updated_at)} ·
                owner {activeBatch.owner ?? "Not recorded"}
              </Typography>
              {activeBatch.poll && (
                <Alert severity="info">
                  PR {label(activeBatch.poll.state)} · CI{" "}
                  {label(activeBatch.poll.ci_state)} ·{" "}
                  {label(activeBatch.poll.deployment)} · polled{" "}
                  {time(activeBatch.poll.observed_at)}
                  <Typography
                    variant="caption"
                    component="p"
                    sx={{ overflowWrap: "anywhere" }}
                  >
                    Head {activeBatch.poll.head ?? "Not recorded"}
                  </Typography>
                </Alert>
              )}
              {batchLink(activeBatch) && (
                <a
                  href={batchLink(activeBatch)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open batch pull request / diff
                </a>
              )}
              <Button
                variant="outlined"
                disabled={
                  busy ||
                  !!readError ||
                  !snapshot?.capabilities.poll_batch ||
                  !activeBatch.pr_number ||
                  typeof activeBatch.id !== "string"
                }
                onClick={() =>
                  void write(
                    "/api/qa/office/qa/batches/poll",
                    "poll",
                    {
                      batch_id: activeBatch.id,
                    },
                    "Batch state polled from its existing pull request.",
                  )
                }
              >
                Poll batch status
              </Button>
            </>
          ) : (
            <Typography color="text.secondary">
              No active batch recorded.
            </Typography>
          )}
        </Stack>
      </Paper>
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreRounded />}>
          Recorded batch timeline
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={1.5}>
            {snapshot?.batches.map((batch, index) => (
              <Box
                key={String(batch.id ?? index)}
                sx={{
                  borderLeft: "2px solid",
                  borderColor: "divider",
                  pl: 1.5,
                }}
              >
                <Typography variant="subtitle2">
                  Batch{" "}
                  {batch.batch ?? batch.batch_number ?? batch.id ?? "Unknown"} ·{" "}
                  {label(batch.status)}
                </Typography>
                <Typography variant="caption" component="p">
                  Observed {time(batch.observed_at ?? batch.updated_at)} ·
                  merged {time(batch.merged_at)} · published{" "}
                  {time(batch.published_at)}
                </Typography>
                {batchLink(batch) && (
                  <a href={batchLink(batch)} target="_blank" rel="noreferrer">
                    Existing pull request
                  </a>
                )}
              </Box>
            ))}
            {!snapshot?.batches.length && (
              <Typography color="text.secondary">
                No batch history supplied.
              </Typography>
            )}
          </Stack>
        </AccordionDetails>
      </Accordion>
      <Dialog
        open={report}
        onClose={() => {
          if (!busy) setReport(false);
        }}
        fullWidth
        maxWidth="sm"
      >
        <Stack
          component="form"
          onSubmit={(event) => {
            event.preventDefault();
            void write(
              "/api/qa/office/qa/defects",
              "report",
              {
                title: title.trim(),
                severity,
                workflow: reportWorkflow || null,
                repro_steps: steps.trim(),
                expected: expected.trim(),
                actual: actual.trim(),
              },
              "Defect report submitted to Muse. It is not yet a recorded defect verdict.",
            ).then((saved) => {
              if (saved) {
                setReport(false);
                setTitle("");
                setSteps("");
                setExpected("");
                setActual("");
              }
            });
          }}
        >
          <DialogTitle>File a defect for Muse</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <TextField
                label="Defect title"
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={busy}
                slotProps={{ htmlInput: { maxLength: 200 } }}
              />
              <TextField
                label="Severity"
                select
                value={severity}
                onChange={(event) => setSeverity(event.target.value)}
                disabled={busy}
              >
                {["critical", "high", "medium", "low"].map((value) => (
                  <MenuItem key={value} value={value}>
                    {value}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Workflow"
                select
                value={reportWorkflow}
                onChange={(event) => setReportWorkflow(event.target.value)}
                disabled={busy}
              >
                <MenuItem value="">Not yet identified</MenuItem>
                {workflowIds.map((id) => (
                  <MenuItem key={id} value={id}>
                    {id}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Reproduction steps"
                required
                multiline
                minRows={3}
                value={steps}
                onChange={(event) => setSteps(event.target.value)}
                disabled={busy}
              />
              <TextField
                label="Expected behavior"
                required
                multiline
                minRows={2}
                value={expected}
                onChange={(event) => setExpected(event.target.value)}
                disabled={busy}
              />
              <TextField
                label="Actual behavior"
                required
                multiline
                minRows={2}
                value={actual}
                onChange={(event) => setActual(event.target.value)}
                disabled={busy}
              />
              <Typography variant="caption">
                The server records the current full build with this request.
                Muse must acknowledge and import its ledger before this report
                changes the defect board.
              </Typography>
              {writeError && <Alert severity="error">{writeError}</Alert>}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setReport(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                busy ||
                !!readError ||
                !title.trim() ||
                !steps.trim() ||
                !expected.trim() ||
                !actual.trim()
              }
            >
              Submit defect report
            </Button>
          </DialogActions>
        </Stack>
      </Dialog>
      <Dialog
        open={!!selected}
        onClose={() => setSelected(undefined)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          Muse #{selected?.id} · {selected?.title}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography>
              {selected?.severity} · {label(selected?.status)} ·{" "}
              {selected?.workflow ?? "Workflow unassigned"}
            </Typography>
            {(
              [
                ["Reproduction", selected?.repro_steps],
                ["Expected", selected?.expected],
                ["Actual", selected?.actual],
              ] as const
            ).map(([heading, value]) => (
              <Box key={heading}>
                <Typography variant="subtitle2">{heading}</Typography>
                <Typography sx={{ whiteSpace: "pre-wrap" }}>
                  {value || "Not recorded"}
                </Typography>
              </Box>
            ))}
            <Typography>
              Repair attempts {selected?.repair_attempts ?? "Unknown"}/3
              {selected && (selected.repair_attempts ?? 0) >= 3
                ? " · repair cap reached; Josh's review is required before further repair work"
                : ""}
            </Typography>
            <Typography variant="caption">
              Observed version {selected?.version ?? "Not recorded"} · revision{" "}
              {selected?.revision ?? "Not recorded"}
            </Typography>
            {selected?.evidence_refs?.map((ref) =>
              typeof ref === "number" ? (
                <a
                  key={ref}
                  href={officeLink(`/api/qa/evidence/${ref}`)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Stored evidence #{ref}
                </a>
              ) : secureLink(ref) ? (
                <a key={ref} href={ref} target="_blank" rel="noreferrer">
                  Recorded evidence link
                </a>
              ) : null,
            )}
            {selected?.evidence
              ?.filter((item) => item.kind === "observation")
              .map((item, index) => (
                <Typography key={index} sx={{ whiteSpace: "pre-wrap" }}>
                  {item.text}
                </Typography>
              ))}
            {selected?.notes && (
              <Box>
                <Typography variant="subtitle2">
                  Historical ledger notes
                </Typography>
                <Typography sx={{ whiteSpace: "pre-wrap" }}>
                  {selected.notes}
                </Typography>
              </Box>
            )}
            {selected?.evidence_notes && (
              <Typography sx={{ whiteSpace: "pre-wrap" }}>
                {selected.evidence_notes}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          {selected && (
            <Button
              disabled={busy || !canRetest(selected)}
              onClick={() => retest(selected)}
            >
              Request retest
            </Button>
          )}
          <Button onClick={() => setSelected(undefined)}>Close</Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={!!workflow}
        onClose={() => setWorkflow(undefined)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {workflow?.id} · {workflow?.title ?? "Workflow record"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1}>
            <Typography>
              {workflowLabel(workflow)}
              {workflow?.revision !== revision &&
              (workflow?.result || workflow?.status)
                ? " · stale or missing revision"
                : ""}
            </Typography>
            {workflow && (
              <QaImpactDetail scope={impact.scope} workflowId={workflow.id} />
            )}
            <Typography>
              Last attempted{" "}
              {time(workflow?.last_attempted_at ?? workflow?.last_attempt)}
            </Typography>
            <Typography variant="caption" sx={{ overflowWrap: "anywhere" }}>
              Revision {workflow?.revision ?? "Not recorded"}
            </Typography>
            <Typography sx={{ whiteSpace: "pre-wrap" }}>
              {workflow?.notes ?? "No notes supplied."}
            </Typography>
            {typeof workflow?.evidence === "string" && (
              <Typography sx={{ whiteSpace: "pre-wrap" }}>
                {workflow.evidence}
              </Typography>
            )}
            {(Array.isArray(workflow?.evidence) ? workflow.evidence : []).map(
              (item, index) =>
                item.kind === "observation" ? (
                  <Typography key={index} sx={{ whiteSpace: "pre-wrap" }}>
                    {item.text}
                  </Typography>
                ) : item.id ? (
                  <a
                    key={index}
                    href={officeLink(`/api/qa/evidence/${item.id}`)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Archived screenshot #{item.id} · SHA-256 {item.sha256}
                  </a>
                ) : null,
            )}
            {workflow && (
              <MuseGridEditor
                key={workflow.id}
                connection={museConnection}
                workflowId={workflow.id}
                revision={snapshot?.build.revision ?? undefined}
                enabled={!!snapshot && !readError}
                onSaved={() => refresh(true)}
              />
            )}
            {secureLink(workflow?.evidence_ref) && (
              <a href={workflow!.evidence_ref} target="_blank" rel="noreferrer">
                Recorded workflow evidence
              </a>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWorkflow(undefined)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
