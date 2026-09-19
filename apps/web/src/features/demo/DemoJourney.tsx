import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Step,
  StepButton,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { api, clearCsrf } from "../../api/client";
import { nextDemoStep } from "./progression";
import {
  DEMO_ROLES,
  roleLesson,
  rolePrerequisite,
  type DemoRole,
} from "./roles";
import type {
  DemoRun,
  DemoRunResponse,
  DemoRunStep,
  DemoTemplateOption,
} from "./contracts";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; value: DemoRunResponse }
  | { status: "error"; message: string };

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function frameUrl(href: string, stepId: string) {
  const target = new URL(href, window.location.origin);
  if (
    target.origin !== window.location.origin ||
    !target.pathname.startsWith("/")
  )
    return null;
  target.searchParams.set("demo_step", stepId);
  return `${target.pathname}${target.search}${target.hash}`;
}

function stepMatchesView(step: DemoRunStep, view: DemoRun["view"]) {
  try {
    const path = new URL(step.href, window.location.origin).pathname;
    return view === "clinic"
      ? path.startsWith("/clinic")
      : path.startsWith("/memberships");
  } catch {
    return false;
  }
}

function nextStepId(run: DemoRun) {
  const steps = run.steps.filter((step) => stepMatchesView(step, run.view));
  return (
    steps.find((step) => step.status === "available")?.id ??
    steps.find((step) => step.status === "complete")?.id ??
    null
  );
}

function completedStep(run: DemoRun, id: string) {
  return run.steps.some((step) => step.id === id && step.status === "complete");
}

function statusLabel(status: DemoRunStep["status"]) {
  if (status === "complete") return "Complete";
  if (status === "locked") return "Locked";
  return "Ready";
}

export function DemoJourney() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [startingKey, setStartingKey] = useState<string | null>(null);
  const [switchingView, setSwitchingView] = useState(false);
  const [frameLoading, setFrameLoading] = useState(false);
  const [frameFailed, setFrameFailed] = useState(false);
  const [frameRevision, setFrameRevision] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [clinicReturnError, setClinicReturnError] = useState<string | null>(
    null,
  );
  const [visitor, setVisitor] = useState({ name: "", email: "", company: "" });
  const [registeringVisitor, setRegisteringVisitor] = useState(false);
  const [visitorError, setVisitorError] = useState<string | null>(null);
  const [visitorFormOpen, setVisitorFormOpen] = useState(false);
  const [clinicName, setClinicName] = useState("");
  const returningToClinic = useRef(false);
  const progressGeneration = useRef(0);

  const load = useCallback(async () => {
    setState((current) =>
      current.status === "ready" ? current : { status: "loading" },
    );
    try {
      const response = await api<DemoRunResponse>("/api/demo/run");
      setState({ status: "ready", value: response });
    } catch (error) {
      setState({
        status: "error",
        message: errorMessage(
          error,
          "Unable to load the guided clinic journey.",
        ),
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run =
    state.status === "ready" && state.value.active ? state.value.run : null;
  const selectedStep = useMemo(() => {
    if (!run) return null;
    const viewSteps = run.steps.filter((step) =>
      stepMatchesView(step, run.view),
    );
    return (
      viewSteps.find((step) => step.id === selectedStepId) ??
      viewSteps.find((step) => step.status === "available") ??
      viewSteps.find((step) => step.status === "complete") ??
      null
    );
  }, [run, selectedStepId]);

  useEffect(() => {
    if (selectedStep) setSelectedStepId(selectedStep.id);
  }, [selectedStep]);

  useEffect(() => {
    if (!selectedStep) return;
    setFrameLoading(true);
    setFrameFailed(false);
  }, [run?.view, selectedStep?.id]);

  const refreshAfterFrameChange = useCallback(async () => {
    const generation = progressGeneration.current;
    try {
      const response = await api<DemoRunResponse>("/api/demo/run");
      if (generation !== progressGeneration.current) return null;
      setState({ status: "ready", value: response });
      setProgressError(null);
      if (
        response.active &&
        response.run.view === "patient" &&
        response.run.steps.some(
          (step) => step.id === "payment" && step.status === "available",
        )
      ) {
        setSelectedStepId((current) =>
          current === "enroll" ? "payment" : current,
        );
      }
      return response;
    } catch {
      if (generation !== progressGeneration.current) return null;
      setProgressError(
        "Progress could not be refreshed. Retry before continuing.",
      );
      return null;
    }
  }, []);

  const returnToClinicIfVerified = useCallback(
    async (refreshed: DemoRunResponse) => {
      if (!refreshed.active || refreshed.run.view !== "patient") return;
      const patientId = refreshed.run.patient?.id;
      const paymentComplete = refreshed.run.steps.some(
        (step) => step.id === "payment" && step.status === "complete",
      );
      if (patientId == null || !paymentComplete) return;
      if (returningToClinic.current) return;
      returningToClinic.current = true;
      progressGeneration.current += 1;
      setSwitchingView(true);
      setClinicReturnError(null);
      try {
        clearCsrf();
        const response = await api<DemoRunResponse>("/api/demo/run/view", {
          method: "POST",
          body: { view: "clinic" },
        });
        if (response.active && response.run.view === "clinic") {
          setNotice("Payment is recorded. Returning to the clinic workspace.");
          setClinicReturnError(null);
          setState({ status: "ready", value: response });
          setSelectedStepId(nextStepId(response.run));
        }
      } catch (error) {
        setClinicReturnError(
          errorMessage(
            error,
            "Payment is recorded, but the clinic workspace could not open.",
          ),
        );
      } finally {
        returningToClinic.current = false;
        setSwitchingView(false);
      }
    },
    [],
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== frameRef.current?.contentWindow ||
        !event.data ||
        typeof event.data !== "object" ||
        !("type" in event.data)
      )
        return;
      const type = (event.data as { type?: unknown }).type;
      if (type !== "demo:changed" && type !== "demo:loaded") return;
      void refreshAfterFrameChange().then((response) => {
        if (type === "demo:changed" && response)
          void returnToClinicIfVerified(response);
      });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [refreshAfterFrameChange, returnToClinicIfVerified]);

  const start = async (option: DemoTemplateOption) => {
    const normalizedClinicName = clinicName.trim();
    if (!normalizedClinicName) {
      setNotice("Enter a clinic name before starting this journey.");
      return;
    }
    setStartingKey(option.key);
    setNotice(null);
    progressGeneration.current += 1;
    try {
      const response = await api<DemoRunResponse>("/api/demo/run", {
        method: "POST",
        body: { template_key: option.key, clinic_name: normalizedClinicName },
      });
      setState({ status: "ready", value: response });
      if (response.active) setSelectedStepId(nextStepId(response.run));
    } catch (error) {
      setNotice(errorMessage(error, "Unable to start this clinic journey."));
    } finally {
      setStartingKey(null);
    }
  };

  const registerVisitor = async () => {
    setRegisteringVisitor(true);
    setVisitorError(null);
    setSwitchingView(true);
    progressGeneration.current += 1;
    try {
      const response = await api<DemoRunResponse>("/api/demo/visitor", {
        method: "POST",
        body: visitor,
      });
      setState({ status: "ready", value: response });
      clearCsrf();
      if (!response.active) {
        setSelectedStepId(null);
        setNotice(null);
        setProgressError(null);
        setClinicReturnError(null);
        setClinicName("");
      }
      setVisitorFormOpen(false);
    } catch (error) {
      setVisitorError(errorMessage(error, "Your details could not be saved."));
    } finally {
      setRegisteringVisitor(false);
      setSwitchingView(false);
    }
  };

  const switchView = async (
    view: DemoRun["view"],
    targetStepId: string | null = null,
  ) => {
    if (!run || run.view === view) return;
    setSwitchingView(true);
    setNotice(null);
    progressGeneration.current += 1;
    try {
      clearCsrf();
      const response = await api<DemoRunResponse>("/api/demo/run/view", {
        method: "POST",
        body: { view },
      });
      setState({ status: "ready", value: response });
      if (response.active)
        setSelectedStepId(
          response.run.steps.some(
            (step) =>
              step.id === targetStepId &&
              stepMatchesView(step, response.run.view),
          )
            ? targetStepId
            : nextStepId(response.run),
        );
    } catch (error) {
      setNotice(errorMessage(error, "That view is not available yet."));
    } finally {
      setSwitchingView(false);
    }
  };

  const selectRole = async (role: DemoRole, lesson: DemoRunStep) => {
    if (!run) return;
    if (run.view === role.view) {
      setNotice(null);
      setSelectedStepId(lesson.id);
      return;
    }
    await switchView(role.view, lesson.id);
  };

  const resetDemo = async () => {
    setResetting(true);
    setResetError(null);
    setSwitchingView(true);
    progressGeneration.current += 1;
    try {
      clearCsrf();
      const response = await api<DemoRunResponse>("/api/demo/run/reset", {
        method: "POST",
      });
      setState({ status: "ready", value: response });
      setSelectedStepId(null);
      setNotice(null);
      setProgressError(null);
      setClinicReturnError(null);
      setFrameFailed(false);
      setFrameLoading(false);
      setFrameRevision((value) => value + 1);
      setResetDialogOpen(false);
    } catch (error) {
      setResetError(errorMessage(error, "The demo could not be reset."));
    } finally {
      setResetting(false);
      setSwitchingView(false);
    }
  };

  if (state.status === "loading")
    return (
      <Stack spacing={2} sx={{ py: 8, alignItems: "center" }} role="status">
        <CircularProgress />
        <Typography>Loading the guided clinic journey…</Typography>
      </Stack>
    );

  if (state.status === "error")
    return (
      <Stack spacing={2} sx={{ maxWidth: 640, mx: "auto", py: 6 }}>
        <Alert severity="error">{state.message}</Alert>
        <Box>
          <Button variant="contained" onClick={() => void load()}>
            Retry
          </Button>
        </Box>
      </Stack>
    );

  if (!state.value.active)
    return (
      <Stack
        component="main"
        spacing={3}
        sx={{ maxWidth: 960, mx: "auto", py: { xs: 3, md: 5 }, px: 2 }}
      >
        <Stack spacing={1}>
          <Typography component="h1" variant="h4">
            Choose a clinic journey
          </Typography>
          <Typography color="text.secondary">
            Explore one guided clinic journey through simulated administrator,
            patient, staff, and inventory workspaces.
          </Typography>
        </Stack>
        {notice && <Alert severity="error">{notice}</Alert>}
        {!state.value.visitor_registered || visitorFormOpen ? (
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
              <Typography component="h2" variant="h6">
                {visitorFormOpen ? "Use a different email" : "Your details"}
              </Typography>
              <Typography color="text.secondary">
                We’ll save these details so we can follow up about Meta Clinic.
                No account or password is needed.
              </Typography>
              {visitorFormOpen && (
                <Typography color="text.secondary" variant="body2">
                  This starts a separate simulated environment for this browser.
                </Typography>
              )}
              {visitorError && <Alert severity="error">{visitorError}</Alert>}
              <TextField
                label="Name"
                required
                value={visitor.name}
                onChange={(event) =>
                  setVisitor((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
              <TextField
                label="Email"
                type="email"
                required
                value={visitor.email}
                onChange={(event) =>
                  setVisitor((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
              />
              <TextField
                label="Company"
                required
                value={visitor.company}
                onChange={(event) =>
                  setVisitor((current) => ({
                    ...current,
                    company: event.target.value,
                  }))
                }
              />
              <Box>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={registeringVisitor}
                >
                  {registeringVisitor ? "Saving…" : "Continue"}
                </Button>
              </Box>
            </Stack>
          </Paper>
        ) : (
          <Stack spacing={2}>
            <Paper variant="outlined" sx={{ p: 3, maxWidth: 640 }}>
              <Stack spacing={2}>
                <TextField
                  label="Clinic name"
                  required
                  slotProps={{ htmlInput: { maxLength: 160 } }}
                  value={clinicName}
                  onChange={(event) => setClinicName(event.target.value)}
                />
                <Typography color="text.secondary" variant="body2">
                  Access stays in this browser. Your email is not a verified
                  sign-in and cannot reopen this environment in another browser.
                </Typography>
                <Box>
                  <Button
                    variant="text"
                    onClick={() => {
                      setVisitorError(null);
                      setVisitorFormOpen(true);
                    }}
                  >
                    Use a different email
                  </Button>
                </Box>
              </Stack>
            </Paper>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              {state.value.options.map((option) => (
                <Paper
                  key={option.key}
                  variant="outlined"
                  sx={{ p: 3, flex: 1 }}
                >
                  <Stack spacing={2} sx={{ height: "100%" }}>
                    <Typography component="h2" variant="h6">
                      {option.title}
                    </Typography>
                    <Typography color="text.secondary" sx={{ flexGrow: 1 }}>
                      {option.description}
                    </Typography>
                    <Button
                      data-demo={`template-${option.key}`}
                      variant="contained"
                      disabled={startingKey !== null || !clinicName.trim()}
                      onClick={() => void start(option)}
                    >
                      {startingKey === option.key
                        ? "Starting…"
                        : "Start journey"}
                    </Button>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </Stack>
        )}
      </Stack>
    );

  if (!run) return null;

  const source = selectedStep
    ? frameUrl(selectedStep.href, selectedStep.id)
    : null;
  const frameKey = `${run.id}:${run.view}:${selectedStep?.id ?? "none"}:${frameRevision}`;
  const nextAvailableStep = nextDemoStep(run.steps, selectedStep?.id);
  const published = completedStep(run, "publish");
  const paid = run.patient?.id != null && completedStep(run, "payment");
  const completeCount = run.steps.filter(
    (step) => step.status === "complete",
  ).length;
  const roleOptions = DEMO_ROLES.map((role) => {
    const lesson = roleLesson(run, role);
    const transitionBlocked =
      lesson && role.view !== run.view
        ? role.view === "patient" && !published
          ? "Publish the clinic offering before opening the patient workspace."
          : role.view === "clinic" && !paid
            ? "Complete the simulated payment before returning to a clinic workspace."
            : null
        : null;
    return {
      role,
      lesson,
      explanation:
        transitionBlocked ?? (lesson ? null : rolePrerequisite(run, role)),
    };
  });

  return (
    <Stack
      component="main"
      spacing={2}
      sx={{ maxWidth: 1440, mx: "auto", py: 2, px: { xs: 1, md: 2 } }}
    >
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            sx={{ justifyContent: "space-between" }}
          >
            <Box>
              <Typography component="h1" variant="h5">
                {run.clinic.name}
              </Typography>
              <Typography color="text.secondary">
                Guided clinic journey
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} sx={{ alignSelf: "flex-start" }}>
              <Button
                variant="text"
                disabled={switchingView || resetting}
                onClick={() => {
                  setVisitorError(null);
                  setVisitorFormOpen(true);
                }}
              >
                Use a different email
              </Button>
              <Button
                color="inherit"
                disabled={switchingView || resetting}
                onClick={() => {
                  setResetError(null);
                  setResetDialogOpen(true);
                }}
              >
                Reset demo
              </Button>
            </Stack>
          </Stack>
          {!published && (
            <Typography color="text.secondary" variant="body2">
              Publish the clinic offering to unlock the patient workspace.
            </Typography>
          )}
          {run.view === "patient" && !paid && (
            <Typography color="text.secondary" variant="body2">
              The clinic workspace becomes available after the simulated payment
              is recorded.
            </Typography>
          )}
          {notice && (
            <Alert
              severity={
                notice.startsWith("Payment is recorded") ? "success" : "error"
              }
            >
              {notice}
            </Alert>
          )}
          {progressError && (
            <Alert
              severity="warning"
              action={
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => void refreshAfterFrameChange()}
                >
                  Retry
                </Button>
              }
            >
              {progressError}
            </Alert>
          )}
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={2}>
              <Box>
                <Typography component="h2" variant="h6">
                  Explore a workspace
                </Typography>
                <Typography color="text.secondary" variant="body2">
                  Switch roles to explore how a clinic team works together. Each
                  workspace unlocks as you complete its prerequisites.
                </Typography>
              </Box>
              <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
                {roleOptions.map(({ role, lesson, explanation }) => (
                  <Stack
                    key={role.id}
                    spacing={0.5}
                    sx={{ minWidth: 190, flex: 1 }}
                  >
                    <Button
                      data-demo={`role-${role.id}`}
                      variant={
                        selectedStep && role.matches(selectedStep)
                          ? "contained"
                          : "outlined"
                      }
                      disabled={
                        !lesson || Boolean(explanation) || switchingView
                      }
                      onClick={() => lesson && void selectRole(role, lesson)}
                    >
                      {role.title}
                    </Button>
                    <Typography color="text.secondary" variant="caption">
                      {explanation ?? role.description}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Stack>
          </Paper>
          <Accordion disableGutters variant="outlined">
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography component="h2" variant="subtitle1">
                How this demo works
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography color="text.secondary">
                No account, password, or email verification is created here. The
                demo generates sample staff and a sample patient, simulates
                payments, and uses local workflow data. The demo lets you move
                between roles. In a real clinic, each person signs in with their
                assigned permissions. No real financial transactions occur here.
              </Typography>
            </AccordionDetails>
          </Accordion>
          {clinicReturnError && (
            <Alert
              severity="warning"
              action={
                <Button
                  color="inherit"
                  size="small"
                  onClick={() =>
                    void returnToClinicIfVerified({ active: true, run })
                  }
                >
                  Retry return
                </Button>
              }
            >
              {clinicReturnError}
            </Alert>
          )}
          <Accordion disableGutters variant="outlined">
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography component="h2" variant="subtitle1">
                Lessons — {completeCount} of {run.steps.length} complete
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stepper
                activeStep={Math.max(
                  0,
                  run.steps.findIndex((step) => step.id === selectedStep?.id),
                )}
                nonLinear
                orientation="vertical"
              >
                {run.steps.map((step) => (
                  <Step key={step.id} completed={step.status === "complete"}>
                    <StepButton
                      data-demo={`step-${step.id}`}
                      optional={
                        <Typography variant="caption">
                          {statusLabel(step.status)}
                        </Typography>
                      }
                      onClick={() => {
                        if (step.status === "locked") {
                          setNotice(
                            step.requires.length
                              ? `Complete ${step.requires.join(", ")} before opening this lesson.`
                              : "This lesson is not available yet.",
                          );
                          return;
                        }
                        if (!stepMatchesView(step, run.view)) {
                          setNotice(
                            run.view === "clinic"
                              ? "Open the patient storefront after publishing the clinic offering."
                              : "Return to the clinic workspace after the simulated payment is recorded.",
                          );
                          return;
                        }
                        setNotice(null);
                        setSelectedStepId(step.id);
                      }}
                    >
                      <StepLabel>{step.title}</StepLabel>
                    </StepButton>
                  </Step>
                ))}
              </Stepper>
            </AccordionDetails>
          </Accordion>
        </Stack>
      </Paper>
      {selectedStep && (
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
          <Stack spacing={2}>
            <Box>
              <Typography component="h2" variant="h6">
                {selectedStep.title}
              </Typography>
              <Typography color="text.secondary">
                {selectedStep.description}
              </Typography>
            </Box>
            {selectedStep.status === "complete" && nextAvailableStep && (
              <Box>
                <Button
                  variant="outlined"
                  disabled={switchingView}
                  onClick={() => {
                    if (stepMatchesView(nextAvailableStep, run.view))
                      setSelectedStepId(nextAvailableStep.id);
                    else
                      void switchView(
                        run.view === "clinic" ? "patient" : "clinic",
                        nextAvailableStep.id,
                      );
                  }}
                >
                  Next: {nextAvailableStep.title}
                </Button>
              </Box>
            )}
          </Stack>
        </Paper>
      )}
      {!selectedStep || !source ? (
        <Alert severity="info">Select an available lesson to continue.</Alert>
      ) : (
        <Paper
          variant="outlined"
          sx={{ position: "relative", overflow: "hidden", minHeight: 720 }}
        >
          {(frameLoading || switchingView) && (
            <Stack
              sx={{
                position: "absolute",
                inset: 0,
                zIndex: 1,
                bgcolor: "background.paper",
                alignItems: "center",
                justifyContent: "center",
              }}
              spacing={2}
              role="status"
            >
              <CircularProgress />
              <Typography>
                {switchingView
                  ? "Switching workspace…"
                  : `Opening ${selectedStep.title}…`}
              </Typography>
            </Stack>
          )}
          {frameFailed && (
            <Stack
              sx={{
                minHeight: 720,
                p: 3,
                alignItems: "center",
                justifyContent: "center",
              }}
              spacing={2}
            >
              <Alert severity="error">The lesson could not load.</Alert>
              <Button
                variant="contained"
                onClick={() => {
                  setFrameFailed(false);
                  setFrameLoading(true);
                  setFrameRevision((value) => value + 1);
                }}
              >
                Retry
              </Button>
            </Stack>
          )}
          {!frameFailed && !switchingView && (
            <Box
              component="iframe"
              key={frameKey}
              ref={frameRef}
              name="clinic-demo-workspace"
              title={`${selectedStep.title} for ${run.clinic.name}`}
              src={source}
              onLoad={() => setFrameLoading(false)}
              onError={() => {
                setFrameLoading(false);
                setFrameFailed(true);
              }}
              sx={{
                border: 0,
                display: "block",
                width: "100%",
                minHeight: 720,
              }}
            />
          )}
        </Paper>
      )}
      <Dialog
        open={resetDialogOpen}
        onClose={() => !resetting && setResetDialogOpen(false)}
        aria-labelledby="reset-demo-title"
      >
        <DialogTitle id="reset-demo-title">Reset this demo?</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography>
              This clears the guided clinic progress and returns you to clinic
              selection. Start again with a fresh clinic, patient and inventory.
              Your contact details stay saved.
            </Typography>
            {resetError && <Alert severity="error">{resetError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            disabled={resetting}
            onClick={() => setResetDialogOpen(false)}
          >
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={resetting}
            onClick={() => void resetDemo()}
          >
            {resetting ? "Resetting…" : "Reset demo"}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={visitorFormOpen}
        onClose={() => !registeringVisitor && setVisitorFormOpen(false)}
        aria-labelledby="different-email-title"
      >
        <Box
          component="form"
          onSubmit={(event) => {
            event.preventDefault();
            void registerVisitor();
          }}
        >
          <DialogTitle id="different-email-title">
            Use a different email
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Typography color="text.secondary">
                This starts a separate simulated environment in this browser.
                Your email is not a verified sign-in.
              </Typography>
              {visitorError && <Alert severity="error">{visitorError}</Alert>}
              <TextField
                label="Name"
                required
                value={visitor.name}
                onChange={(event) =>
                  setVisitor((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
              <TextField
                label="Email"
                type="email"
                required
                value={visitor.email}
                onChange={(event) =>
                  setVisitor((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
              />
              <TextField
                label="Company"
                required
                value={visitor.company}
                onChange={(event) =>
                  setVisitor((current) => ({
                    ...current,
                    company: event.target.value,
                  }))
                }
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button
              disabled={registeringVisitor}
              onClick={() => setVisitorFormOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={registeringVisitor}
            >
              {registeringVisitor ? "Saving…" : "Continue"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Stack>
  );
}
