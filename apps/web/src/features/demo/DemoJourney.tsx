import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Paper,
  Stack,
  TextField,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import { api, clearCsrf } from "../../api/client";
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

const message = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

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
  const [restartOpen, setRestartOpen] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [frameLoading, setFrameLoading] = useState(false);
  const [frameFailed, setFrameFailed] = useState(false);
  const [frameRevision, setFrameRevision] = useState(0);

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
  const activeGuide = activeLesson ? lessonGuide(activeLesson.id) : null;
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
    }, 45_000);
    return () => window.clearTimeout(timeout);
  }, [frameLoading]);

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
    setBusy(true);
    setSwitching(true);
    setError(null);
    generation.current += 1;
    try {
      clearCsrf();
      const response = await api<DemoRunResponse>("/api/demo/lesson", {
        method: "POST",
        body: { lesson_key, restart },
      });
      setState({ status: "ready", value: response });
      setRestartOpen(false);
    } catch (reason) {
      setError(message(reason, "This lesson could not be opened."));
    } finally {
      setBusy(false);
      setSwitching(false);
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
        sx={{ maxWidth: 960, mx: "auto", p: 3 }}
      >
        <Typography component="h1" variant="h4">
          Explore clinic workflows
        </Typography>
        <Typography color="text.secondary">
          We collect your name, email and company to understand demo usage. No
          account or email verification is required.
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
            </Stack>
          </Paper>
        ) : (
          <Stack spacing={2}>
            <Typography color="text.secondary">
              Every lesson starts with a fresh shared sample clinic. No personal
              clinic names or unfinished work are stored.
            </Typography>
            <LessonCatalog
              lessons={state.value.lessons}
              busy={busy}
              onSelect={(id) => void selectLesson(id)}
            />
          </Stack>
        )}
      </Stack>
    );
  if (!run) return null;
  const source = frameUrl(run);
  return (
    <Stack
      component="main"
      spacing={2}
      sx={{ maxWidth: 1440, mx: "auto", p: 2 }}
    >
      {error && <Alert severity="error">{error}</Alert>}
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
      {run.lesson_key && activeLesson ? (
        <>
          <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 } }}>
            <Stack spacing={1.5}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                sx={{
                  alignItems: { sm: "center" },
                  justifyContent: "space-between",
                }}
              >
                <Box>
                  <Typography component="h1" variant="h5">
                    {activeLesson.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {roleLabel(activeLesson.role)} workspace
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => void selectLesson(null)}
                  disabled={busy}
                >
                  Back to lessons
                </Button>
              </Stack>
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
                      {lessonGuide(activeLesson.id).goal}
                    </Typography>
                  </Box>
                  <Alert severity="info" icon={false}>
                    <Typography variant="body2">
                      <strong>Before you start:</strong>{" "}
                      {lessonGuide(activeLesson.id).constraints}
                    </Typography>
                  </Alert>
                  <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
                    {lessonInstructions(activeLesson.id).map((instruction) => (
                      <Typography
                        component="li"
                        key={instruction}
                        variant="body2"
                        sx={{ mb: 0.5 }}
                      >
                        {instruction}
                      </Typography>
                    ))}
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    <strong>Done when:</strong>{" "}
                    {lessonGuide(activeLesson.id).doneWhen}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {roleContext(activeLesson.role)}
                  </Typography>
                </Stack>
              </Box>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                sx={{
                  alignItems: { sm: "center" },
                  justifyContent: "space-between",
                }}
              >
                <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
                  {activeLesson.prepared.map((item) => (
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
              </Stack>
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
                title={`${activeLesson.title} workspace`}
                src={source}
                onLoad={() => setFrameLoading(false)}
                onError={() => {
                  setFrameLoading(false);
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
            onSelect={(id) => void selectLesson(id)}
          />
        </Paper>
      )}
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
        <DialogTitle>Restart this lesson?</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography>
            This restarts only this lesson’s clinic and progress.
          </Typography>
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
            Restart lesson
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
}: {
  lessons: DemoLesson[];
  busy: boolean;
  onSelect: (id: string) => void;
}) {
  const [clinicType, setClinicType] = useState("all");
  const [search, setSearch] = useState("");
  const visibleLessons = lessons.filter(
    (lesson) =>
      (clinicType === "all" ||
        !lesson.clinic_type ||
        lesson.clinic_type === clinicType) &&
      `${lesson.title} ${lesson.description} ${lesson.section ?? ""}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const sectionFor = (lesson: DemoLesson) =>
    lesson.section || roleLabel(lesson.role);
  return (
    <Stack spacing={4} sx={{ mt: 3 }}>
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Choose your clinic focus
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
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Specialty scenarios plus shared clinic workflows. Every lesson starts
          fresh.
        </Typography>
      </Box>
      <TextField
        label="Find a lesson"
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        fullWidth
      />
      {visibleLessons.length === 0 && (
        <Typography>No matching lessons. Try another search.</Typography>
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
                    onClick={() => onSelect(lesson.id)}
                  >
                    Start lesson
                  </Button>
                </Stack>
              </Stack>
            ))}
        </Box>
      ))}
    </Stack>
  );
}
