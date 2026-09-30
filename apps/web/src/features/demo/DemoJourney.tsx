import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import { ApiError, api, clearCsrf } from "../../api/client";
import type { DemoLesson, DemoRun, DemoRunResponse } from "./contracts";
import { lessonGuide } from "./lessonGuidance";
import { roleContext, roleLabel } from "./roles";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; value: DemoRunResponse }
  | { status: "error"; message: string };

export function lessonInstructions(lessonId: string) {
  return lessonGuide(lessonId).steps;
}

export function isNavigationTour(lessonId: string | null | undefined) {
  return lessonId === "navigation_tour";
}

export function isSandbox(lessonId: string | null | undefined) {
  return lessonId === "sandbox";
}

export function demoPreparationDetails(lesson: DemoLesson) {
  return {
    description:
      "Most clinic features are disabled during this demo. This guided walkthrough enables only the capability needed for this part of the demo.",
    available: `${lesson.title}: ${lesson.description}`,
    next: "Other clinic features remain unavailable until you choose a different walkthrough. We will prepare a fresh synthetic clinic for this lesson.",
  };
}

export function DemoPreparationDialog({
  lesson,
  busy,
  error,
  onClose,
  onPrepare,
}: {
  lesson: DemoLesson | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onPrepare: () => void;
}) {
  if (!lesson) return null;
  const details = demoPreparationDetails(lesson);

  return (
    <Dialog
      open
      fullWidth
      maxWidth="sm"
      onClose={() => !busy && onClose()}
      aria-labelledby="demo-preparation-title"
      aria-describedby="demo-preparation-description"
    >
      <DialogTitle id="demo-preparation-title">
        Prepare sandbox environment
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography id="demo-preparation-description">
            {details.description}
          </Typography>
          <Box>
            <Typography variant="subtitle2">Available now</Typography>
            <Typography color="text.secondary">{details.available}</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            {details.next}
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" disabled={busy} onClick={onPrepare}>
          {busy
            ? "Preparing sandbox environment…"
            : "Prepare sandbox environment"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

const message = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const sandboxDurationKey = "demo-sandbox-last-duration-ms";
const durationLabel = (milliseconds: number) => {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

function frameUrl(run: DemoRun) {
  const href = run.steps.find((step) => step.id === run.lesson_key)?.href;
  if (!href) return null;
  const target = new URL(href, window.location.origin);
  if (
    target.origin !== window.location.origin ||
    !target.pathname.startsWith("/")
  )
    return null;
  target.searchParams.set("demo_step", run.lesson_key ?? "");
  return `${target.pathname}${target.search}${target.hash}`;
}

export function DemoJourney() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const generation = useRef(0);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [visitor, setVisitor] = useState({ name: "", email: "", company: "" });
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [preparingLesson, setPreparingLesson] = useState<DemoLesson | null>(
    null,
  );
  const [restartOpen, setRestartOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [frameLoading, setFrameLoading] = useState(false);
  const [frameFailed, setFrameFailed] = useState(false);
  const [frameRevision, setFrameRevision] = useState(0);
  const [preparingSandbox, setPreparingSandbox] = useState(false);
  const [sandboxElapsed, setSandboxElapsed] = useState(0);
  const [lastSandboxDuration, setLastSandboxDuration] = useState<number | null>(
    () => {
      const stored = window.sessionStorage.getItem(sandboxDurationKey);
      return stored === null ? null : Number(stored);
    },
  );
  const sandboxStartedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!preparingSandbox) return;
    const interval = window.setInterval(() => {
      if (sandboxStartedAt.current !== null)
        setSandboxElapsed(Date.now() - sandboxStartedAt.current);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [preparingSandbox]);

  const load = useCallback(async () => {
    try {
      setState({
        status: "ready",
        value: await api<DemoRunResponse>("/api/demo/run"),
      });
    } catch (reason) {
      setState({
        status: "error",
        message: message(reason, "Unable to load the guided demo."),
      });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const run =
    state.status === "ready" && state.value.active ? state.value.run : null;
  const activeLesson = useMemo(
    () => run?.lessons.find((lesson) => lesson.id === run.lesson_key) ?? null,
    [run],
  );
  const activeStep = useMemo(
    () => run?.steps.find((step) => step.id === run.lesson_key) ?? null,
    [run],
  );
  const sandbox = isSandbox(run?.lesson_key);
  const activeGuide =
    activeLesson && !sandbox ? lessonGuide(activeLesson.id) : null;
  const refresh = useCallback(async () => {
    const current = generation.current;
    try {
      const response = await api<DemoRunResponse>("/api/demo/run");
      if (current === generation.current) {
        setState({ status: "ready", value: response });
        setProgressError(null);
      }
    } catch {
      if (current === generation.current)
        setProgressError(
          "Progress could not be refreshed. Retry before continuing.",
        );
    }
  }, []);
  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== frameRef.current?.contentWindow ||
        !event.data ||
        typeof event.data !== "object"
      )
        return;
      const type = (event.data as { type?: unknown }).type;
      if (type === "demo:changed" || type === "demo:loaded") void refresh();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [refresh]);
  useEffect(() => {
    setFrameLoading(Boolean(run?.lesson_key));
    setFrameFailed(false);
  }, [run?.id, run?.lesson_key, frameRevision]);
  useEffect(() => {
    if (!frameLoading) return;
    const timeout = window.setTimeout(() => {
      setFrameLoading(false);
      setFrameFailed(true);
      setPreparingLesson(null);
    }, 45_000);
    return () => window.clearTimeout(timeout);
  }, [frameLoading]);

  const finishFrameLoading = () => {
    setFrameLoading(false);
    setPreparingLesson(null);
  };

  const registerVisitor = async () => {
    setBusy(true);
    setSwitching(true);
    setError(null);
    generation.current += 1;
    try {
      const response = await api<DemoRunResponse>("/api/demo/visitor", {
        method: "POST",
        body: visitor,
      });
      clearCsrf();
      setState({ status: "ready", value: response });
    } catch (reason) {
      setError(message(reason, "Your details could not be saved."));
    } finally {
      setBusy(false);
      setSwitching(false);
    }
  };
  const selectLesson = async (lesson_key: string | null, restart = false) => {
    const startingSandbox = lesson_key === "sandbox";
    let sandboxRunCreated = false;
    if (startingSandbox) {
      sandboxStartedAt.current = Date.now();
      setSandboxElapsed(0);
      setPreparingSandbox(true);
    }
    setBusy(true);
    setSwitching(true);
    setError(null);
    generation.current += 1;
    try {
      clearCsrf();
      const response = await api<DemoRunResponse>("/api/demo/lesson", {
        method: "POST",
        body: { lesson_key, restart },
        timeoutMs: lesson_key === "sandbox" ? 240_000 : undefined,
      });
      if (startingSandbox) {
        sandboxRunCreated = true;
        let complete = false;
        while (!complete) {
          const preparation = await api<{ complete: boolean }>(
            "/api/demo/sandbox/prepare",
            { method: "POST", body: {}, timeoutMs: 240_000 },
          );
          complete = preparation.complete;
        }
        setState({
          status: "ready",
          value: await api<DemoRunResponse>("/api/demo/run"),
        });
      } else {
        setState({ status: "ready", value: response });
      }
      setRestartOpen(false);
    } catch (reason) {
      if (
        lesson_key === "sandbox" &&
        !sandboxRunCreated &&
        reason instanceof ApiError &&
        reason.code === "outcome_unconfirmed"
      ) {
        try {
          const current = await api<DemoRunResponse>("/api/demo/run");
          if (current.active && current.run?.lesson_key === "sandbox") {
            setState({ status: "ready", value: current });
            setRestartOpen(false);
            return;
          }
        } catch {
          // Keep the original outcome-unconfirmed error available to the visitor.
        }
      }
      const failure = message(reason, "This lesson could not be opened.");
      setError(
        startingSandbox && sandboxStartedAt.current !== null
          ? `${failure} Preparation ran for ${durationLabel(Date.now() - sandboxStartedAt.current)}.`
          : failure,
      );
    } finally {
      if (startingSandbox && sandboxStartedAt.current !== null) {
        const duration = Date.now() - sandboxStartedAt.current;
        setSandboxElapsed(duration);
        setLastSandboxDuration(duration);
        window.sessionStorage.setItem(sandboxDurationKey, String(duration));
        sandboxStartedAt.current = null;
        setPreparingSandbox(false);
      }
      setBusy(false);
      setSwitching(false);
    }
  };
  const completeLesson = async (fallback: string) => {
    setBusy(true);
    setError(null);
    generation.current += 1;
    try {
      const response = await api<DemoRunResponse>("/api/demo/lesson/complete", {
        method: "POST",
        body: {},
      });
      setState({ status: "ready", value: response });
    } catch (reason) {
      setError(message(reason, fallback));
    } finally {
      setBusy(false);
    }
  };
  const submitFeedback = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFeedbackError("");
    try {
      await api("/api/demo/feedback", {
        method: "POST",
        body: { message: feedbackText },
      });
      setFeedbackText("");
      setFeedbackSent(true);
    } catch (reason) {
      setFeedbackError(message(reason, "Your feedback could not be sent."));
    } finally {
      setBusy(false);
    }
  };
  const currentLessonComplete = Boolean(
    run?.lesson_key &&
    run.steps.some(
      (step) => step.id === run.lesson_key && step.status === "complete",
    ),
  );
  useEffect(() => {
    setCompletionOpen(currentLessonComplete);
  }, [currentLessonComplete, run?.id, run?.lesson_key]);
  if (state.status === "loading")
    return (
      <Stack spacing={2} sx={{ py: 8, alignItems: "center" }}>
        <CircularProgress />
        <Typography>Loading the guided demo…</Typography>
      </Stack>
    );
  if (state.status === "error")
    return (
      <Stack spacing={2} sx={{ p: 4 }}>
        <Alert severity="error">{state.message}</Alert>
        <Button onClick={() => void load()}>Retry</Button>
      </Stack>
    );
  if (!state.value.active)
    return (
      <Stack
        component="main"
        spacing={3}
        sx={{ width: "100%", p: { xs: 2, sm: 3 } }}
      >
        <Typography component="h1" variant="h4">
          Explore clinic workflows
        </Typography>
        <Typography color="text.secondary">
          Browse the clinic tour without sharing details, or provide your name,
          email and company for guided workflows. No account or email
          verification is required.
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
        {state.value.notice && (
          <Alert severity="info">{state.value.notice}</Alert>
        )}
        {!state.value.visitor_registered ? (
          <Paper
            component="form"
            variant="outlined"
            sx={{ p: 3, maxWidth: 640 }}
            onSubmit={(event) => {
              event.preventDefault();
              void registerVisitor();
            }}
          >
            <Stack spacing={2}>
              <Typography variant="h6">Your details</Typography>
              {(["name", "email", "company"] as const).map((field) => (
                <TextField
                  key={field}
                  label={
                    field === "email"
                      ? "Email"
                      : field[0].toUpperCase() + field.slice(1)
                  }
                  type={field === "email" ? "email" : "text"}
                  required
                  value={visitor[field]}
                  onChange={(event) =>
                    setVisitor((current) => ({
                      ...current,
                      [field]: event.target.value,
                    }))
                  }
                />
              ))}
              <Button type="submit" variant="contained" disabled={busy}>
                {busy ? "Saving…" : "Continue"}
              </Button>
              <Button
                type="button"
                variant="outlined"
                disabled={busy}
                onClick={() => void selectLesson("navigation_tour")}
              >
                Browse without sharing details
              </Button>
              <Typography variant="caption" color="text.secondary">
                Opens the read-only clinic tour. Other guided workflows still
                ask for your details.
              </Typography>
            </Stack>
          </Paper>
        ) : (
          <Stack spacing={2}>
            <Typography color="text.secondary">
              Guided lessons start with a fresh sample clinic. The sandbox is
              shared, and changes remain visible to visitors until it is reset.
            </Typography>
            {preparingSandbox && (
              <Alert severity="info" role="status">
                <Stack spacing={1}>
                  <Typography variant="body2">
                    Building your clinic workspace: locations and staff, then
                    patient histories, visits, inventory, and billing. This can
                    take a couple of minutes.
                  </Typography>
                  <LinearProgress aria-label="Preparing sandbox" />
                  <Typography variant="caption">
                    Elapsed: {durationLabel(sandboxElapsed)}
                  </Typography>
                </Stack>
              </Alert>
            )}
            {!preparingSandbox && lastSandboxDuration !== null && (
              <Typography variant="caption" color="text.secondary">
                Last sandbox preparation: {durationLabel(lastSandboxDuration)}
              </Typography>
            )}
            <LessonCatalog
              lessons={state.value.lessons}
              busy={busy}
              onSelect={(lesson) => setPreparingLesson(lesson)}
              onSandbox={() => void selectLesson("sandbox")}
            />
          </Stack>
        )}
        <DemoPreparationDialog
          lesson={preparingLesson}
          busy={busy}
          error={error}
          onClose={() => setPreparingLesson(null)}
          onPrepare={() =>
            preparingLesson && void selectLesson(preparingLesson.id)
          }
        />
      </Stack>
    );
  if (!run) return null;
  const source = frameUrl(run);
  const sandboxProgress = preparingSandbox && (
    <Alert severity="info" role="status">
      <Stack spacing={1}>
        <Typography variant="body2">
          Preparing clinic data and reopening your workspace. This can take a
          couple of minutes.
        </Typography>
        <LinearProgress aria-label="Preparing sandbox" />
        <Typography variant="caption">
          Elapsed: {durationLabel(sandboxElapsed)}
        </Typography>
      </Stack>
    </Alert>
  );
  return (
    <Stack
      component="main"
      spacing={2}
      sx={{ width: "100%", p: { xs: 1, sm: 2 } }}
    >
      {error && <Alert severity="error">{error}</Alert>}
      {!restartOpen && sandboxProgress}
      {progressError && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" onClick={() => void refresh()}>
              Retry progress
            </Button>
          }
        >
          {progressError}
        </Alert>
      )}
      {run.lesson_key && (activeLesson || sandbox) ? (
        <>
          <Paper
            variant="outlined"
            sx={{
              px: sandbox ? 1 : { xs: 1.25, sm: 2 },
              py: sandbox ? 0 : 0.5,
            }}
          >
            <Stack spacing={sandbox ? 0 : 1.5}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={sandbox ? 0 : 1}
                sx={{
                  alignItems: { sm: "center" },
                  justifyContent: "space-between",
                }}
              >
                <Box>
                  <Typography
                    component="h1"
                    variant={sandbox ? "body2" : "h5"}
                    sx={
                      sandbox ? { lineHeight: 1.5, fontWeight: 600 } : undefined
                    }
                  >
                    {sandbox ? "Sandbox" : activeLesson?.title}
                  </Typography>
                  {!sandbox && (
                    <Typography variant="body2" color="text.secondary">
                      {`${roleLabel(activeLesson?.role ?? "administrator")} workspace`}
                    </Typography>
                  )}
                </Box>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => void selectLesson(null)}
                  disabled={busy}
                >
                  Back to lessons
                </Button>
                {sandbox && (
                  <Button
                    color="warning"
                    size="small"
                    disabled={busy}
                    onClick={() => setRestartOpen(true)}
                  >
                    Reset Sandbox
                  </Button>
                )}
                {sandbox && (
                  <Button
                    size="small"
                    onClick={() => {
                      setFeedbackError("");
                      setFeedbackSent(false);
                      setFeedbackOpen(true);
                    }}
                  >
                    Give feedback
                  </Button>
                )}
              </Stack>
              {!sandbox && (
                <Box
                  component="section"
                  aria-labelledby="lesson-guide-title"
                  data-demo-guide
                >
                  <Stack spacing={1.25}>
                    <Box>
                      <Typography id="lesson-guide-title" variant="subtitle2">
                        Lesson guide
                      </Typography>
                      <Typography color="text.secondary">
                        {lessonGuide(activeLesson!.id).goal}
                      </Typography>
                    </Box>
                    <Alert severity="info" icon={false}>
                      <Typography variant="body2">
                        <strong>Before you start:</strong>{" "}
                        {lessonGuide(activeLesson!.id).constraints}
                      </Typography>
                    </Alert>
                    <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
                      {lessonInstructions(activeLesson!.id).map(
                        (instruction) => (
                          <Typography
                            component="li"
                            key={instruction}
                            variant="body2"
                            sx={{ mb: 0.5 }}
                          >
                            {instruction}
                          </Typography>
                        ),
                      )}
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      <strong>Done when:</strong>{" "}
                      {lessonGuide(activeLesson!.id).doneWhen}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {roleContext(activeLesson!.role)}
                    </Typography>
                  </Stack>
                </Box>
              )}
              {!sandbox && (
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  sx={{
                    alignItems: { sm: "center" },
                    justifyContent: "space-between",
                  }}
                >
                  <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
                    {activeLesson!.prepared.map((item) => (
                      <Chip key={item} label={item} size="small" />
                    ))}
                  </Stack>
                  <Button
                    color="warning"
                    size="small"
                    disabled={busy}
                    onClick={() => setRestartOpen(true)}
                  >
                    Restart lesson
                  </Button>
                  {activeLesson && isNavigationTour(activeLesson.id) && (
                    <Button
                      variant="contained"
                      size="small"
                      disabled={busy}
                      onClick={() =>
                        void completeLesson(
                          "The navigation tour could not be completed.",
                        )
                      }
                    >
                      Finish tour
                    </Button>
                  )}
                  {activeStep?.review && (
                    <Button
                      variant="contained"
                      size="small"
                      disabled={busy}
                      onClick={() =>
                        void completeLesson(
                          "This review lesson could not be completed.",
                        )
                      }
                    >
                      Finish lesson
                    </Button>
                  )}
                </Stack>
              )}
            </Stack>
          </Paper>
          <Paper
            variant="outlined"
            sx={{ minHeight: 900, position: "relative" }}
          >
            {(switching || frameLoading) && (
              <Stack
                sx={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  bgcolor: "background.paper",
                }}
              >
                <CircularProgress />
              </Stack>
            )}
            {frameFailed && !switching && (
              <Stack spacing={2} sx={{ p: 4 }}>
                <Alert severity="error">
                  This lesson took too long to load. Your clinic data is
                  preserved.
                </Alert>
                <Button onClick={() => setFrameRevision((value) => value + 1)}>
                  Retry workspace
                </Button>
              </Stack>
            )}
            {!switching && !frameFailed && source ? (
              <Box
                component="iframe"
                key={`${run.id}:${run.lesson_key}:${frameRevision}`}
                ref={frameRef}
                name="clinic-demo-workspace"
                title={`${sandbox ? "Sandbox" : activeLesson?.title} workspace`}
                src={source}
                onLoad={finishFrameLoading}
                onError={() => {
                  finishFrameLoading();
                  setFrameFailed(true);
                }}
                sx={{
                  border: 0,
                  width: "100%",
                  minHeight: 900,
                  display: "block",
                }}
              />
            ) : (
              !switching &&
              !frameFailed && (
                <Alert severity="error">
                  This lesson workspace is unavailable.
                </Alert>
              )
            )}
          </Paper>
        </>
      ) : (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography component="h2" variant="h6">
            Choose a lesson
          </Typography>
          <LessonCatalog
            lessons={run.lessons}
            busy={busy}
            onSelect={(lesson) => setPreparingLesson(lesson)}
            onSandbox={() => void selectLesson("sandbox")}
          />
        </Paper>
      )}
      <DemoPreparationDialog
        lesson={preparingLesson}
        busy={busy}
        error={error}
        onClose={() => setPreparingLesson(null)}
        onPrepare={() =>
          preparingLesson && void selectLesson(preparingLesson.id)
        }
      />
      <Dialog
        open={feedbackOpen}
        onClose={() => !busy && setFeedbackOpen(false)}
        aria-labelledby="demo-feedback-title"
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle id="demo-feedback-title">Share demo feedback</DialogTitle>
        <Box component="form" onSubmit={submitFeedback}>
          <DialogContent>
            <Stack spacing={2}>
              <Typography color="text.secondary">
                Tell us what worked or what you expected to find. Please do not
                include patient, health, or account details.
              </Typography>
              {feedbackSent ? (
                <Alert severity="success">
                  Thanks. Your feedback was sent to the Meta Clinic team.
                </Alert>
              ) : (
                <TextField
                  label="Your feedback"
                  value={feedbackText}
                  onChange={(event) => setFeedbackText(event.target.value)}
                  required
                  multiline
                  minRows={4}
                  helperText={`${feedbackText.length}/2000`}
                  slotProps={{ htmlInput: { maxLength: 2000 } }}
                />
              )}
              {feedbackError && <Alert severity="error">{feedbackError}</Alert>}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setFeedbackOpen(false)} disabled={busy}>
              {feedbackSent ? "Close" : "Cancel"}
            </Button>
            {!feedbackSent && (
              <Button
                type="submit"
                variant="contained"
                disabled={busy || !feedbackText.trim()}
              >
                {busy ? "Sending…" : "Send feedback"}
              </Button>
            )}
          </DialogActions>
        </Box>
      </Dialog>
      <Dialog
        open={completionOpen}
        onClose={() => !busy && setCompletionOpen(false)}
        aria-labelledby="lesson-complete-title"
      >
        <DialogTitle id="lesson-complete-title">Lesson complete</DialogTitle>
        <DialogContent>
          <Typography>
            You completed this walkthrough. Choose another lesson whenever you
            are ready.
          </Typography>
          {activeGuide && (
            <Typography color="text.secondary" sx={{ mt: 2 }}>
              <strong>What changed:</strong> {activeGuide.recap}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            variant="contained"
            onClick={() => {
              setCompletionOpen(false);
              void selectLesson(null);
            }}
            disabled={busy}
          >
            Back to lessons
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={restartOpen} onClose={() => !busy && setRestartOpen(false)}>
        <DialogTitle>
          {sandbox ? "Reset Sandbox?" : "Restart this lesson?"}
        </DialogTitle>
        <DialogContent>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography>
            {sandbox
              ? "This shared workspace is used by other visitors. Reset rebuilds the full clinic, removes everyone's changes, and interrupts their active sessions."
              : "This restarts only this lesson’s clinic and progress."}
          </Typography>
          {restartOpen && sandboxProgress && (
            <Box sx={{ mt: 2 }}>{sandboxProgress}</Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setRestartOpen(false)}>
            Cancel
          </Button>
          <Button
            color="warning"
            onClick={() =>
              run.lesson_key && void selectLesson(run.lesson_key, true)
            }
            disabled={busy}
          >
            {sandbox ? "Reset Sandbox" : "Restart lesson"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export function LessonCatalog({
  lessons,
  busy,
  onSelect,
  onSandbox,
}: {
  lessons: DemoLesson[];
  busy: boolean;
  onSelect: (lesson: DemoLesson) => void;
  onSandbox: () => void;
}) {
  const [clinicType, setClinicType] = useState("all");
  const visibleLessons = lessons.filter(
    (lesson) =>
      clinicType === "all" ||
      !lesson.clinic_type ||
      lesson.clinic_type === clinicType,
  );
  const sectionFor = (lesson: DemoLesson) =>
    lesson.section || roleLabel(lesson.role);
  return (
    <Stack spacing={4} sx={{ mt: 3 }}>
      <Box
        component="section"
        aria-labelledby="sandbox-invitation-title"
        sx={{
          position: "relative",
          overflow: "hidden",
          borderRadius: 3,
          bgcolor: "#12384d",
          color: "common.white",
          p: { xs: 3, sm: 4 },
          "&::after": {
            content: '""',
            position: "absolute",
            width: 300,
            height: 300,
            border: "1px solid rgba(255, 255, 255, 0.14)",
            borderRadius: "50%",
            top: -190,
            right: -85,
            pointerEvents: "none",
          },
        }}
      >
        <Stack spacing={2} sx={{ position: "relative", zIndex: 1 }}>
          <Typography
            variant="overline"
            sx={{ color: "#addbed", letterSpacing: "0.14em", fontWeight: 700 }}
          >
            The full experience
          </Typography>
          <Typography
            component="h2"
            id="sandbox-invitation-title"
            variant="h5"
            sx={{ fontWeight: 700, letterSpacing: "-0.025em" }}
          >
            Step inside a working clinic.
          </Typography>
          <Typography sx={{ color: "#d8e8ef", maxWidth: 650 }}>
            Explore the entire workspace with prepared sample data. Go where
            your curiosity takes you, at your own pace.
          </Typography>
          <Button
            variant="contained"
            color="info"
            fullWidth
            size="large"
            disabled={busy}
            aria-label="Open Sandbox"
            onClick={onSandbox}
            endIcon={<ArrowForwardRoundedIcon />}
            sx={{
              justifyContent: "space-between",
              px: 3,
              py: 1.75,
              fontSize: "1.05rem",
              fontWeight: 700,
              textTransform: "none",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.2)",
              transition: "transform 180ms ease, box-shadow 180ms ease",
              "&:hover": {
                transform: "translateY(-2px)",
                boxShadow: "0 12px 28px rgba(0, 0, 0, 0.24)",
              },
              "&:focus-visible": {
                outline: "3px solid #fff",
                outlineOffset: 3,
              },
              "@media (prefers-reduced-motion: reduce)": {
                transition: "none",
                "&:hover": { transform: "none" },
              },
            }}
          >
            Full Sandbox Demo
          </Button>
        </Stack>
      </Box>
      <Box>
        <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
          Or choose a guided demo
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Start with one clinic task and a fresh, prepared workspace.
        </Typography>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Clinic focus
        </Typography>
        <ToggleButtonGroup
          exclusive
          value={clinicType}
          aria-label="Clinic type"
          onChange={(_, value: string | null) => value && setClinicType(value)}
          sx={{ flexWrap: "wrap" }}
        >
          <ToggleButton value="all">All lessons</ToggleButton>
          <ToggleButton value="primary_care">Primary care</ToggleButton>
          <ToggleButton value="weight_management">
            Weight management
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {visibleLessons.length === 0 && (
        <Typography>No lessons in this clinic focus.</Typography>
      )}
      {Array.from(new Set(visibleLessons.map(sectionFor))).map((section) => (
        <Box component="section" key={section} aria-label={section}>
          <Typography component="h3" variant="overline" color="text.secondary">
            {section}
          </Typography>
          {visibleLessons
            .filter((lesson) => sectionFor(lesson) === section)
            .map((lesson) => (
              <Stack
                key={lesson.id}
                direction={{ xs: "column", sm: "row" }}
                spacing={2}
                sx={{
                  py: 2,
                  borderBottom: 1,
                  borderColor: "divider",
                  alignItems: { sm: "center" },
                  justifyContent: "space-between",
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography component="h4" variant="subtitle1">
                    {lesson.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {lesson.description}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Ready for you: {lesson.prepared.join(" · ")}
                  </Typography>
                </Box>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: "center", flexShrink: 0 }}
                >
                  <Button
                    variant="outlined"
                    disabled={busy}
                    aria-label={`Open ${lesson.title}`}
                    onClick={() => onSelect(lesson)}
                    endIcon={<ArrowForwardRoundedIcon fontSize="small" />}
                    sx={{
                      px: 2,
                      fontWeight: 700,
                      textTransform: "none",
                      whiteSpace: "nowrap",
                      "&:hover": {
                        bgcolor: "primary.main",
                        color: "common.white",
                      },
                    }}
                  >
                    Start demo
                  </Button>
                </Stack>
              </Stack>
            ))}
        </Box>
      ))}
    </Stack>
  );
}
