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
  const publicRequested = work?.tasks.some(
    (task) => task.request_key === `office-browser-qa-public-${revision}`,
  );
  const delayed =
    latest?.office_status === "queued" &&
    now - Date.parse(latest.created_at) > 120000;
  const start = async () => {
    if (sending.current || !revision || dirty) return;
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
      await api("/api/qa/office/browser-qa", {
        method: "POST",
        body: { request: { revision } },
      });
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
        disabled={
          busy || running || publicRequested || !work || !revision || dirty
        }
      >
        {busy
          ? "Requesting QA…"
          : running || publicRequested
            ? "Muse QA requested"
            : "Start Muse QA"}
      </Button>
      <Typography variant="caption">
        No sign-in needed. One shared QA request per build.
      </Typography>
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
