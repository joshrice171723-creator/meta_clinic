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
  MenuItem,
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
import { DemoEntry, DemoEntryLoading } from "./DemoEntry";
import {
  canEnterCareModel,
  enterSandboxCareModel,
  sandboxCareModels,
  type SandboxCareModel,
} from "./careModels";
import {
  confirmSandboxNavigation,
  NavigationConfirmationTimeout,
  sandboxAccounts,
  type SandboxAccountKey,
} from "./accountSwitch";

// Temporarily hide public lesson entry points; keep lesson workflows intact.
const showDemoLessons = false;

const entryNotices: Record<string, string> = {
  "The demo now has independent lessons. Choose a lesson to start fresh.":
    "Your previous clinic session has ended. Open Sandbox to continue.",
  "This lesson restarted in another demo session. Choose it again to start fresh.":
    "This clinic was reset in another session. Open Sandbox to continue.",
};

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
  if (run.account_pending) return null;
  const href =
    run.sandbox && run.account?.portal === "patient"
      ? "/patient-portal"
      : run.sandbox && run.account?.key === "inventory"
        ? "/clinic/inventory"
        : run.steps.find((step) => step.id === run.lesson_key)?.href;
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
  const [confirmingNavigation, setConfirmingNavigation] = useState(false);
  const [navigationRetry, setNavigationRetry] = useState<(() => void) | null>(
    null,
  );
  const [discardNavigation, setDiscardNavigation] = useState<
    (() => void) | null
  >(null);
  const [preparingSandbox, setPreparingSandbox] = useState(false);
  const [sandboxElapsed, setSandboxElapsed] = useState(0);
  const [lastSandboxDuration, setLastSandboxDuration] = useState<number | null>(
    () => {
      const stored = window.sessionStorage.getItem(sandboxDurationKey);
      return stored === null ? null : Number(stored);
    },
  );
  const sandboxStartedAt = useRef<number | null>(null);
  const accountBusy = useRef(false);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] =
    useState<SandboxAccountKey>("admin");
  const [selectedCareModel, setSelectedCareModel] =
    useState<SandboxCareModel>("primary_care");

  useEffect(() => {
    if (!preparingSandbox) return;
    const interval = window.setInterval(() => {
      if (sandboxStartedAt.current !== null)
        setSandboxElapsed(Date.now() - sandboxStartedAt.current);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [preparingSandbox]);

  const load = useCallback(async () => {
    const current = generation.current;
    try {
      const value = await api<DemoRunResponse>("/api/demo/run");
      if (current !== generation.current) return;
      setState({
        status: "ready",
        value,
      });
    } catch (reason) {
      if (current !== generation.current) return;
      setState({
        status: "error",
        message: message(reason, "The clinic could not be opened."),
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
    if (accountBusy.current) return;
    const current = generation.current;
    try {
      const response = await api<DemoRunResponse>("/api/demo/run");
      if (current === generation.current && !accountBusy.current) {
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
  }, [run?.id, run?.lesson_key, run?.account?.user_id, frameRevision]);
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

  const approveNavigation = async (
    retry: () => void,
    reloadOnTimeout = false,
  ) => {
    if (!run?.account) return false;
    const current = generation.current;
    setBusy(true);
    setConfirmingNavigation(true);
    setNavigationRetry(null);
    setError(null);
    try {
      const allowed = await confirmSandboxNavigation(
        frameRef.current?.contentWindow,
        String(run.id),
        run.account.user_id,
        current,
      );
      if (current !== generation.current) return false;
      if (!allowed) {
        setError(
          "The workspace reported unfinished work. Stay here or discard changes and leave.",
        );
        setDiscardNavigation(() => retry);
      }
      return allowed;
    } catch (reason) {
      if (current === generation.current) {
        setError(
          message(
            reason,
            "Navigation could not be confirmed. Your workspace is still open.",
          ),
        );
        if (
          reason instanceof NavigationConfirmationTimeout &&
          reloadOnTimeout
        ) {
          setError(
            "The workspace did not confirm navigation in time. Reopening the workspace under the selected account. Unsaved local changes may be lost.",
          );
          setNavigationRetry(
            () => () => setFrameRevision((value) => value + 1),
          );
          return true;
        }
        setDiscardNavigation(() => retry);
      }
      return false;
    } finally {
      setConfirmingNavigation(false);
    }
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
  const selectLesson = async (
    lesson_key: string | null,
    restart = false,
    account: SandboxAccountKey = run?.account?.key ?? selectedAccount,
    careModel: SandboxCareModel = "primary_care",
    discard = false,
  ) => {
    if (accountBusy.current) return;
    if (lesson_key === null && run?.lesson_key && !discard) {
      setDiscardNavigation(
        () => () => void selectLesson(null, false, account, careModel, true),
      );
      return;
    }
    if (lesson_key === "sandbox" && !canEnterCareModel(account, careModel)) {
      setError(
        "Choose Admin for Weight management, or Primary care for this account.",
      );
      return;
    }
    accountBusy.current = true;
    if (
      run?.sandbox &&
      run.account &&
      !discard &&
      !(await approveNavigation(
        () => void selectLesson(lesson_key, restart, account, careModel, true),
      ))
    ) {
      accountBusy.current = false;
      setBusy(false);
      return;
    }
    const startingSandbox = lesson_key === "sandbox";
    if (startingSandbox) {
      sandboxStartedAt.current = Date.now();
      setSandboxElapsed(0);
      setPreparingSandbox(true);
    }
    setBusy(true);
    setSwitching(true);
    setError(null);
    const current = ++generation.current;
    try {
      clearCsrf();
      let response: DemoRunResponse;
      try {
        response = await api<DemoRunResponse>("/api/demo/lesson", {
          method: "POST",
          body: {
            lesson_key,
            restart,
            ...(startingSandbox ? { account } : {}),
          },
          timeoutMs: lesson_key === "sandbox" ? 240_000 : undefined,
        });
      } catch (reason) {
        if (
          !startingSandbox ||
          !(reason instanceof ApiError) ||
          reason.code !== "outcome_unconfirmed"
        )
          throw reason;
        // Recover the committed run, then use the ordinary preparation path.
        // The old run does not prove that an unconfirmed reset committed.
        let recovered: DemoRunResponse;
        try {
          recovered = await api<DemoRunResponse>("/api/demo/run");
        } catch {
          throw reason;
        }
        if (
          !recovered.active ||
          recovered.run.lesson_key !== "sandbox" ||
          (restart && recovered.run.id === run?.id)
        )
          throw reason;
        response = recovered;
      }
      if (startingSandbox) {
        let complete = false;
        while (!complete) {
          if (current !== generation.current) return;
          const preparation = await api<{ complete: boolean }>(
            "/api/demo/sandbox/prepare",
            { method: "POST", body: {}, timeoutMs: 240_000 },
          );
          complete = preparation.complete;
        }
        response = await api<DemoRunResponse>("/api/demo/run");
        if (!response.active || !response.run.sandbox)
          throw new Error("The sandbox changed. Open it again.");
        if (current !== generation.current) return;
        response = await api<DemoRunResponse>("/api/demo/run/view", {
          method: "POST",
          body: {
            account,
            expected_run_id: response.run.id,
            expected_user_id: response.run.account?.user_id ?? null,
          },
        });
        clearCsrf();
        if (careModel !== "primary_care") {
          await enterSandboxCareModel(response, careModel);
          if (current !== generation.current) return;
        }
      }
      if (current !== generation.current) return;
      setState({ status: "ready", value: response });
      setAccountPickerOpen(false);
      setRestartOpen(false);
    } catch (reason) {
      if (current !== generation.current) return;
      const failure = message(reason, "This lesson could not be opened.");
      if (lesson_key === null)
        setNavigationRetry(
          () => () => void selectLesson(null, false, account, careModel, true),
        );
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
      accountBusy.current = false;
    }
  };
  useEffect(() => {
    const openCatalog = (event: MessageEvent<unknown>) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== frameRef.current?.contentWindow ||
        !event.data ||
        typeof event.data !== "object"
      )
        return;
      const data = event.data as Record<string, unknown>;
      if (
        data.type !== "demo:open-catalog" ||
        !run ||
        run.sandbox ||
        !run.lesson_key ||
        String(run.id) !== data.runId ||
        busy
      )
        return;
      void selectLesson(null);
    };
    window.addEventListener("message", openCatalog);
    return () => window.removeEventListener("message", openCatalog);
  }, [run, busy, selectLesson]);
  const switchAccount = async (account: SandboxAccountKey, discard = false) => {
    if (
      !run?.account ||
      busy ||
      accountBusy.current ||
      account === run.account.key
    )
      return;
    accountBusy.current = true;
    setBusy(true);
    setError(null);
    const current = ++generation.current;
    try {
      const allowed =
        discard ||
        (await approveNavigation(
          () => void switchAccount(account, true),
          true,
        ));
      if (!allowed || current !== generation.current) return;
      setSwitching(true);
      const response = await api<DemoRunResponse>("/api/demo/run/view", {
        method: "POST",
        body: {
          account,
          expected_run_id: run.id,
          expected_user_id: run.account.user_id,
        },
      });
      if (current !== generation.current) return;
      clearCsrf();
      setState({ status: "ready", value: response });
      setFrameRevision((value) => value + 1);
    } catch (reason) {
      if (current === generation.current) {
        setError(
          message(
            reason,
            "The account could not be switched. Refresh before trying again.",
          ),
        );
        setNavigationRetry(() => () => void switchAccount(account, true));
      }
    } finally {
      accountBusy.current = false;
      setBusy(false);
      setSwitching(false);
    }
  };
  const accountPicker = (
    <Dialog
      open={accountPickerOpen}
      onClose={() => !busy && setAccountPickerOpen(false)}
      fullWidth
      maxWidth="xs"
      aria-labelledby="sandbox-account-title"
    >
      <DialogTitle id="sandbox-account-title">
        Choose a sandbox account
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            select
            label="Account"
            value={selectedAccount}
            onChange={(event) =>
              setSelectedAccount(event.target.value as SandboxAccountKey)
            }
            disabled={busy}
          >
            {sandboxAccounts.map(({ key, label }) => (
              <MenuItem key={key} value={key}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          <Typography variant="body2" color="text.secondary">
            Each account has its own clinic or patient permissions.
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={() => setAccountPickerOpen(false)}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={busy}
          onClick={() => void selectLesson("sandbox", false, selectedAccount)}
        >
          {busy ? "Opening…" : "Open Sandbox"}
        </Button>
      </DialogActions>
    </Dialog>
  );
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
  if (state.status === "loading") return <DemoEntryLoading />;
  if (state.status === "error")
    return (
      <DemoEntry>
        <Stack spacing={2}>
          <h2>We could not open the clinic</h2>
          <Alert severity="error">{state.message}</Alert>
          <Button variant="outlined" onClick={() => void load()}>
            Try again
          </Button>
        </Stack>
      </DemoEntry>
    );
  if (!state.value.active)
    return (
      <DemoEntry>
        <Stack spacing={2.5}>
          <div>
            <h2>Choose your perspective</h2>
            <p>
              Use an existing demo account. Each account keeps its own clinic or
              patient permissions.
            </p>
          </div>
          {error && <Alert severity="error">{error}</Alert>}
          {state.value.notice && (
            <Alert severity="info">
              {entryNotices[state.value.notice] ?? state.value.notice}
            </Alert>
          )}
          <div className="demo-entry__model">
            <TextField
              select
              label="Care model"
              value={selectedCareModel}
              onChange={(event) =>
                setSelectedCareModel(event.target.value as SandboxCareModel)
              }
              disabled={busy}
              fullWidth
              helperText="Primary care supports all five accounts. Weight management uses Admin's existing clinic assignment."
            >
              {sandboxCareModels.map(({ key, label }) => (
                <MenuItem
                  key={key}
                  value={key}
                  disabled={!canEnterCareModel(selectedAccount, key)}
                >
                  {label}
                </MenuItem>
              ))}
            </TextField>
          </div>
          <TextField
            select
            label="Demo account"
            value={selectedAccount}
            onChange={(event) =>
              setSelectedAccount(event.target.value as SandboxAccountKey)
            }
            disabled={busy}
            fullWidth
          >
            {sandboxAccounts.map(({ key, label }) => (
              <MenuItem
                key={key}
                value={key}
                disabled={!canEnterCareModel(key, selectedCareModel)}
              >
                {label}
              </MenuItem>
            ))}
          </TextField>
          {!state.value.visitor_registered ? (
            <Box
              component="form"
              onSubmit={(event) => {
                event.preventDefault();
                void registerVisitor();
              }}
            >
              <Stack spacing={2}>
                <p>
                  Tell us who is exploring. No password or email verification is
                  required.
                </p>
                {(["name", "email", "company"] as const).map((field) => (
                  <TextField
                    key={field}
                    label={
                      field === "email"
                        ? "Email"
                        : field[0].toUpperCase() + field.slice(1)
                    }
                    type={field === "email" ? "email" : "text"}
                    autoComplete={field === "company" ? "organization" : field}
                    required
                    disabled={busy}
                    value={visitor[field]}
                    onChange={(event) =>
                      setVisitor((current) => ({
                        ...current,
                        [field]: event.target.value,
                      }))
                    }
                    slotProps={{
                      htmlInput: {
                        maxLength:
                          field === "name"
                            ? 160
                            : field === "email"
                              ? 254
                              : 200,
                      },
                    }}
                    fullWidth
                  />
                ))}
                <Button
                  className="meta-marketing__button-primary"
                  type="submit"
                  variant="contained"
                  disabled={busy}
                >
                  {busy ? "Saving your details…" : "Continue to the clinic"}
                </Button>
                {showDemoLessons && (
                  <Button
                    type="button"
                    variant="outlined"
                    disabled={busy}
                    onClick={() => void selectLesson("navigation_tour")}
                  >
                    Browse without sharing details
                  </Button>
                )}
              </Stack>
            </Box>
          ) : (
            <Stack spacing={2}>
              <p>
                Your details are saved. You can switch accounts from the top of
                the sandbox after entering.
              </p>
              {preparingSandbox && (
                <div
                  className="demo-entry__loading"
                  role="status"
                  aria-live="polite"
                >
                  <h2>Opening the shared clinic</h2>
                  <LinearProgress aria-label="Preparing sandbox" />
                  <p>
                    This may take a couple of minutes. Elapsed:{" "}
                    {durationLabel(sandboxElapsed)}
                  </p>
                </div>
              )}
              {!preparingSandbox && lastSandboxDuration !== null && (
                <Typography variant="caption" color="text.secondary">
                  Last opening took {durationLabel(lastSandboxDuration)}
                </Typography>
              )}
              <Button
                className="meta-marketing__button-primary"
                variant="contained"
                endIcon={<ArrowForwardRoundedIcon />}
                disabled={busy}
                onClick={() =>
                  void selectLesson(
                    "sandbox",
                    false,
                    selectedAccount,
                    selectedCareModel,
                  )
                }
              >
                {busy
                  ? "Opening the clinic…"
                  : "Enter as " +
                    sandboxAccounts.find(
                      (account) => account.key === selectedAccount,
                    )?.label}
              </Button>
              {showDemoLessons && (
                <LessonCatalog
                  showLessons
                  lessons={state.value.lessons}
                  busy={busy}
                  onSelect={(lesson) => setPreparingLesson(lesson)}
                  onSandbox={() => setAccountPickerOpen(true)}
                />
              )}
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
          {accountPicker}
        </Stack>
      </DemoEntry>
    );
  if (!run) return null;
  const source = frameUrl(run);
  const sandboxProgress = preparingSandbox && (
    <Alert severity="info" role="status">
      <Stack spacing={1}>
        <Typography variant="body2">
          Reopening your clinic. This may take a couple of minutes.
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
      className={sandbox ? "demo-journey--sandbox" : undefined}
      spacing={sandbox ? 0 : 2}
      sx={sandbox ? undefined : { width: "100%", p: { xs: 1, sm: 2 } }}
    >
      {error && (
        <Alert
          severity="error"
          onClose={() => {
            setError(null);
            setNavigationRetry(null);
          }}
          action={
            navigationRetry && !busy ? (
              <Button color="inherit" onClick={navigationRetry}>
                Retry navigation
              </Button>
            ) : undefined
          }
        >
          {error}
        </Alert>
      )}
      {confirmingNavigation && (
        <Alert severity="info" role="status">
          Waiting for the workspace to confirm navigation. Review any discard
          prompt in the workspace; your account has not changed.
        </Alert>
      )}
      <Dialog
        open={discardNavigation !== null}
        onClose={() => setDiscardNavigation(null)}
        aria-labelledby="demo-discard-navigation-title"
        aria-describedby="demo-discard-navigation-description"
      >
        <DialogTitle id="demo-discard-navigation-title">
          Leave this workspace?
        </DialogTitle>
        <DialogContent>
          <Typography id="demo-discard-navigation-description">
            Unsaved changes in this workspace will be discarded. Saved clinic
            data is preserved. A submitted action may still complete; leaving
            does not cancel or undo it.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDiscardNavigation(null)}>Stay here</Button>
          <Button
            color="warning"
            variant="contained"
            onClick={() => {
              const leave = discardNavigation;
              setDiscardNavigation(null);
              setError(null);
              leave?.();
            }}
          >
            Discard changes and leave
          </Button>
        </DialogActions>
      </Dialog>
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
            className={sandbox ? "demo-journey__sandbox-toolbar" : undefined}
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
                    {sandbox
                      ? `Sandbox • ${run.account?.label ?? "Choose an account"}`
                      : activeLesson?.title}
                  </Typography>
                  {!sandbox && (
                    <Typography variant="body2" color="text.secondary">
                      {`${roleLabel(activeLesson?.role ?? "administrator")} workspace`}
                    </Typography>
                  )}
                </Box>
                {sandbox && run.account && (
                  <TextField
                    select
                    size="small"
                    label="Account"
                    value={run.account.key}
                    disabled={busy}
                    onChange={(event) =>
                      void switchAccount(
                        event.target.value as SandboxAccountKey,
                      )
                    }
                    sx={{ minWidth: 160 }}
                  >
                    {(run.accounts ?? []).map(({ key, label, available }) => (
                      <MenuItem key={key} value={key} disabled={!available}>
                        {label}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => void selectLesson(null)}
                  disabled={busy}
                >
                  Back to clinic entry
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
            className={sandbox ? "demo-journey__sandbox-workspace" : undefined}
            sx={{
              ...(sandbox ? {} : { minHeight: 900 }),
              position: "relative",
            }}
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
                  {sandbox
                    ? "The clinic took too long to open. Your changes are preserved."
                    : "This lesson took too long to load. Your clinic data is preserved."}
                </Alert>
                <Button onClick={() => setFrameRevision((value) => value + 1)}>
                  Retry workspace
                </Button>
              </Stack>
            )}
            {!switching && !frameFailed && source ? (
              <Box
                component="iframe"
                key={`${run.id}:${run.lesson_key}:${run.account?.user_id}:${frameRevision}`}
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
                  height: sandbox ? "100%" : undefined,
                  minHeight: sandbox ? 0 : 900,
                  display: "block",
                  ...(sandbox ? { flex: "1 1 auto" } : {}),
                }}
              />
            ) : (
              !switching &&
              !frameFailed && (
                <Alert severity="error">
                  {sandbox
                    ? "The clinic is unavailable."
                    : "This lesson workspace is unavailable."}
                </Alert>
              )
            )}
          </Paper>
        </>
      ) : (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography component="h2" variant="h6">
            Open the clinic
          </Typography>
          <LessonCatalog
            showLessons={showDemoLessons}
            lessons={run.lessons}
            busy={busy}
            onSelect={(lesson) => setPreparingLesson(lesson)}
            onSandbox={() => setAccountPickerOpen(true)}
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
      {accountPicker}
      <Dialog
        open={feedbackOpen}
        onClose={() => !busy && setFeedbackOpen(false)}
        aria-labelledby="demo-feedback-title"
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle id="demo-feedback-title">Share feedback</DialogTitle>
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
            You completed this walkthrough. Return to the sandbox entry to
            explore the shared clinic.
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
            Back to clinic entry
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
  showLessons = true,
  lessons,
  busy,
  onSelect,
  onSandbox,
}: {
  showLessons?: boolean;
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
            Your clinic workspace
          </Typography>
          <Typography
            component="h2"
            id="sandbox-invitation-title"
            variant="h5"
            sx={{ fontWeight: 700, letterSpacing: "-0.025em" }}
          >
            Step into the clinic.
          </Typography>
          <Typography sx={{ color: "#d8e8ef", maxWidth: 650 }}>
            Follow the work across appointments, patient care, billing and
            inventory at your own pace.
          </Typography>
          <Typography variant="body2" sx={{ color: "#d8e8ef" }}>
            Choose an Admin, Front Desk, Clinician, Inventory or Patient account
            to explore the clinic from their perspective.
          </Typography>
          <Button
            variant="contained"
            color="info"
            fullWidth
            size="large"
            disabled={busy}
            aria-label="Choose a sandbox account"
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
            Choose a sandbox account
          </Button>
        </Stack>
      </Box>
      <Box sx={{ display: showLessons ? undefined : "none" }}>
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
      {showLessons && visibleLessons.length === 0 && (
        <Typography>No lessons in this clinic focus.</Typography>
      )}
      {(showLessons
        ? Array.from(new Set(visibleLessons.map(sectionFor)))
        : []
      ).map((section) => (
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
