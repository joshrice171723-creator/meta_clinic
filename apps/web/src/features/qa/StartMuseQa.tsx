import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Stack, Typography } from "@mui/material";
import { useOfficeRequest } from "./officeTransport";

type Task = {
  id: number;
  revision: string;
  recipient: string;
  request_key: string;
  status: string;
  office_status: string;
  created_at: string;
  lease_expired?: boolean;
  result?: { summary?: string; evidence_refs?: number[] };
};
type Work = { can_post: boolean; tasks: Task[] };
const isBrowserQa = (task: Task) =>
  /^(office-browser-qa-|branch-review-publish-)/.test(task.request_key);

export function StartMuseQa({
  revision,
  dirty,
}: {
  revision?: string | null;
  dirty?: boolean;
}) {
  const api = useOfficeRequest();
  const [work, setWork] = useState<Work>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const pending = useRef<{ revision: string; key: string } | undefined>(
    undefined,
  );
  const sending = useRef(false);
  const refresh = useCallback(async () => {
    try {
      setWork(await api<Work>("/api/qa/office/work"));
      setNow(Date.now());
    } catch {
      setError("Muse status is unavailable. Retry to check the connection.");
    }
  }, [api]);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  const latest = work?.tasks.find(
    (task) =>
      task.recipient === "muse" &&
      task.revision === revision &&
      isBrowserQa(task),
  );
  const running =
    !!latest &&
    !latest.lease_expired &&
    ["queued", "acknowledged", "working", "picked_up"].includes(
      latest.office_status,
    );
  const delayed =
    latest?.office_status === "queued" &&
    now - Date.parse(latest.created_at) > 120000;
  const start = async () => {
    if (sending.current || !revision || dirty || !work?.can_post) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const fresh = await api<Work>("/api/qa/office/work");
      if (
        fresh.tasks.some(
          (task) =>
            task.recipient === "muse" &&
            task.revision === revision &&
            isBrowserQa(task) &&
            !task.lease_expired &&
            ["queued", "acknowledged", "working", "picked_up"].includes(
              task.office_status,
            ),
        )
      ) {
        setWork(fresh);
        return;
      }
      if (pending.current?.revision !== revision)
        pending.current = {
          revision,
          key: `office-browser-qa-${crypto.randomUUID()}`,
        };
      await api("/api/qa/tasks", {
        method: "POST",
        body: {
          task: {
            kind: "coordination",
            request_key: pending.current.key,
            title: "Office browser QA",
            recipient: "muse",
            assigned_actor: "muse",
            revision,
            payload: {
              description: `Run one real browser QA pass on exact live build ${revision}. Route to the browser-capable main agent; never substitute code or HTTP inspection. Use the latest published review scope for this build from Office; if none exists, check homepage sandbox entry and its destination. Verify build.json before and after. Send authenticated check-ins and current-build workflow claims/verdicts while actually working so Office reflects real activity. Attach stored screenshot evidence IDs for this revision. If browser access or routing is unavailable, mark blocked with the reason; do not mark completed or passed. No merge, publish, fixture reset, or recurring QA. Stop after this bounded pass.`,
            },
          },
        },
      });
      pending.current = undefined;
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "QA request was not confirmed. Retry uses the same request.",
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  return (
    <Stack spacing={1}>
      <Button
        variant="contained"
        onClick={() => void start()}
        disabled={busy || running || !work?.can_post || !revision || dirty}
      >
        {busy
          ? "Requesting QA…"
          : running
            ? "Muse QA requested"
            : "Start Muse QA"}
      </Button>
      {!work?.can_post && (
        <Typography variant="caption">
          Sign in as an Office operator to start QA.
        </Typography>
      )}
      {latest && (
        <Typography role="status" variant="body2">
          Task {latest.id}: {latest.office_status.replaceAll("_", " ")}
          {latest.office_status === "completed" &&
          !latest.result?.evidence_refs?.length
            ? " — browser evidence missing; not verified"
            : ""}
        </Typography>
      )}
      {(latest?.office_status === "blocked" || latest?.lease_expired) && (
        <Alert severity="warning">
          {latest.lease_expired
            ? "Muse's work lease expired. Inspect the previous task before restarting."
            : latest.result?.summary ||
              "Muse is blocked. Check its connection and browser capability."}
        </Alert>
      )}
      {delayed && (
        <Alert severity="warning">
          Muse has not acknowledged this request yet. Check its connection; do
          not create another run.
        </Alert>
      )}
      {error && (
        <Alert
          severity="error"
          action={
            <Button
              onClick={() => {
                setError("");
                void refresh();
              }}
            >
              Retry status
            </Button>
          }
        >
          {error}
        </Alert>
      )}
    </Stack>
  );
}
