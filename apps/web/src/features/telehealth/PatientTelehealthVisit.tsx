import { useEffect, useMemo, useRef, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Typography,
} from "@mui/material";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import FiberManualRecordOutlinedIcon from "@mui/icons-material/FiberManualRecordOutlined";
import { ApiError } from "../../api/client";
import {
  enterWaitingRoom,
  leavePatientVisit,
  recordConsent,
  recordPatientScribeConsent,
  requestKey,
  submitCheckin,
  type PatientCheckinInput,
} from "./api";
import { CallControls } from "./CallControls";
import { ConsentStep } from "./ConsentStep";
import { DeviceCheck } from "./DeviceCheck";
import { PatientCheckin } from "./PatientCheckin";
import { PatientVisitCompletion } from "./PatientVisitCompletion";
import { useTelehealthSession } from "./TelehealthSessionProvider";
import type {
  TelehealthAllowedAction,
  TelehealthDeviceResults,
  TelehealthEnvelope,
  TelehealthMutationData,
  TelehealthVisit,
} from "./types";
import { useTelehealthVisit } from "./useTelehealthVisit";
import { VideoStage } from "./VideoStage";
import { WaitingRoom } from "./WaitingRoom";

const steps = ["Your visit", "Device check", "Consent", "Waiting room"];

function formatAppointment(visit: TelehealthVisit) {
  const date = new Date(visit.appointment.starts_at);
  if (Number.isNaN(date.valueOf())) return "Appointment time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: visit.appointment.timezone,
  }).format(date);
}

function visitEnvelope(
  response: TelehealthEnvelope<TelehealthMutationData>,
): TelehealthEnvelope<TelehealthVisit> {
  return { ...response, data: response.data.visit };
}

function stepForVisit(visit: TelehealthVisit) {
  if (visit.current_step === "device_check") return 1;
  if (visit.current_step === "consent") return 2;
  if (
    ["waiting_room", "call", "instructions"].includes(visit.current_step || "")
  )
    return 3;
  return 0;
}

function PatientCall({
  visit,
  version,
  allowedActions,
  onRefresh,
  onWithdrawConsent,
}: {
  visit: TelehealthVisit;
  version: number;
  allowedActions: TelehealthAllowedAction[];
  onRefresh: () => Promise<void> | void;
  onWithdrawConsent: () => Promise<void>;
}) {
  const session = useTelehealthSession();
  const [details, setDetails] = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [withdrawConfirm, setWithdrawConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scribeBusy, setScribeBusy] = useState(false);
  const [scribeError, setScribeError] = useState<string | null>(null);
  const recordingActive = Boolean(
    visit.scribe.capture.owner_participant_id &&
    (!visit.scribe.capture.lease_expires_at ||
      new Date(visit.scribe.capture.lease_expires_at).valueOf() > Date.now()),
  );
  const canChooseScribe = allowedActions.includes("telehealth.scribe_consent");

  const leave = async () => {
    setBusy(true);
    setError(null);
    try {
      await session.leave(true);
      await onRefresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The leave status could not be confirmed.",
      );
    } finally {
      setBusy(false);
      setLeaveConfirm(false);
    }
  };

  const withdraw = async () => {
    setBusy(true);
    setError(null);
    try {
      await onWithdrawConsent();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Consent withdrawal could not be confirmed.",
      );
    } finally {
      setBusy(false);
      setWithdrawConfirm(false);
    }
  };

  const scribeDecision = async (
    decision: "accepted" | "declined" | "withdrawn",
  ) => {
    setScribeBusy(true);
    setScribeError(null);
    try {
      await recordPatientScribeConsent(visit.public_id, version, decision);
      await onRefresh();
    } catch (reason) {
      setScribeError(
        reason instanceof Error
          ? reason.message
          : "The Scribe choice could not be saved.",
      );
    } finally {
      setScribeBusy(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Box role="status" aria-live="polite">
        <Typography variant="h5">Video visit</Typography>
        <Typography color="text.secondary">
          Connection: {session.callState.replaceAll("_", " ")}
        </Typography>
      </Box>
      <Paper variant="outlined" sx={{ overflow: "hidden" }}>
        <VideoStage
          participants={session.participants}
          label="Your video visit"
        />
        <CallControls
          allowScreenShare={false}
          showParticipants={false}
          showParticipantsControl={false}
          onShowParticipants={() => undefined}
          onLeave={() => setLeaveConfirm(true)}
          recoveryContact={
            visit.support
              ? { label: visit.support.label, phone: visit.support.phone }
              : undefined
          }
          busy={busy}
        />
      </Paper>
      {visit.policy.scribe_enabled && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <FiberManualRecordOutlinedIcon
                color={recordingActive ? "error" : "disabled"}
                aria-hidden="true"
              />
              <Typography variant="h6">Scribe</Typography>
              <Typography variant="body2" color="text.secondary">
                {recordingActive
                  ? "Recording"
                  : visit.scribe.consent_state.replaceAll("_", " ")}
              </Typography>
            </Stack>
            {visit.scribe.consent_state !== "accepted" &&
              visit.scribe.consent_state !== "recording" && (
                <>
                  <Typography variant="body2">
                    {visit.policy.scribe_consent_title ||
                      "Optional visit recording"}
                  </Typography>
                  {visit.policy.scribe_consent_body && (
                    <Typography variant="body2">
                      {visit.policy.scribe_consent_body}
                    </Typography>
                  )}
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <Button
                      variant="outlined"
                      disabled={scribeBusy || !canChooseScribe}
                      onClick={() => void scribeDecision("accepted")}
                    >
                      Allow Scribe
                    </Button>
                    <Button
                      color="inherit"
                      disabled={scribeBusy || !canChooseScribe}
                      onClick={() => void scribeDecision("declined")}
                    >
                      Continue without Scribe
                    </Button>
                  </Stack>
                </>
              )}
            {["accepted", "recording"].includes(visit.scribe.consent_state) && (
              <Button
                color="error"
                disabled={scribeBusy || !canChooseScribe}
                onClick={() => void scribeDecision("withdrawn")}
              >
                Stop Scribe
              </Button>
            )}
            {!canChooseScribe && (
              <Typography variant="body2" color="text.secondary">
                No Scribe consent action is currently available.
              </Typography>
            )}
            {scribeError && <Alert severity="error">{scribeError}</Alert>}
          </Stack>
        </Paper>
      )}
      <Accordion
        expanded={details}
        onChange={(_, expanded) => setDetails(expanded)}
      >
        <AccordionSummary expandIcon={<ExpandMoreOutlinedIcon />}>
          <Typography>Visit details</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={1}>
            <Typography>
              <strong>Callback:</strong>{" "}
              {visit.preparation.callback_phone || "Not available"}
            </Typography>
            <Typography>
              <strong>Location:</strong>{" "}
              {visit.preparation.location
                ? [
                    visit.preparation.location.address_line1,
                    visit.preparation.location.unit,
                    visit.preparation.location.city,
                    visit.preparation.location.region_code,
                  ]
                    .filter(Boolean)
                    .join(", ")
                : "Not available"}
            </Typography>
            <Button color="error" onClick={() => setWithdrawConfirm(true)}>
              Withdraw telehealth consent
            </Button>
          </Stack>
        </AccordionDetails>
      </Accordion>
      {error && <Alert severity="error">{error}</Alert>}
      <Dialog open={leaveConfirm} onClose={() => setLeaveConfirm(false)}>
        <DialogTitle>Leave this visit?</DialogTitle>
        <DialogContent>
          You can rejoin while your access remains valid. Leaving does not end
          the clinician's encounter.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLeaveConfirm(false)}>Stay</Button>
          <Button
            color="error"
            variant="contained"
            disabled={busy}
            onClick={() => void leave()}
          >
            Leave visit
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={withdrawConfirm} onClose={() => setWithdrawConfirm(false)}>
        <DialogTitle>Withdraw telehealth consent?</DialogTitle>
        <DialogContent>
          This stops your local camera and microphone and removes you from this
          video visit.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWithdrawConfirm(false)}>
            Keep consent
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={busy}
            onClick={() => void withdraw()}
          >
            Withdraw and leave
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export function PatientTelehealthVisit({ visitId }: { visitId: string }) {
  return <PatientTelehealthVisitWorkspace key={visitId} visitId={visitId} />;
}

function PatientTelehealthVisitWorkspace({ visitId }: { visitId: string }) {
  const [pollEnabled, setPollEnabled] = useState(false);
  const resource = useTelehealthVisit("patient", visitId, {
    poll: pollEnabled,
  });
  const session = useTelehealthSession();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [checkedDevices, setCheckedDevices] = useState<{
    audioDeviceId?: string;
    videoDeviceId?: string;
  }>({});
  const [error, setError] = useState<string | null>(null);
  const [withdrawalError, setWithdrawalError] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const actionPendingRef = useRef(false);
  const withdrawalAttemptRef = useRef<{
    visitId: string;
    expectedVersion: number;
    policyVersion: number;
    key: string;
  } | null>(null);
  const visit = resource.response?.data;
  const serverStep = useMemo(() => (visit ? stepForVisit(visit) : 0), [visit]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => setStep(serverStep), [serverStep]);
  useEffect(() => {
    setPollEnabled(
      Boolean(
        session.active?.visitId === visit?.public_id ||
        visit?.current_step === "waiting_room" ||
        visit?.current_step === "call" ||
        visit?.status === "ending",
      ),
    );
  }, [
    session.active?.visitId,
    visit?.current_step,
    visit?.public_id,
    visit?.status,
  ]);
  useEffect(() => {
    if (!visit || !session.active || session.active.visitId !== visit.public_id)
      return;
    session.updateVersion(resource.response!.version);
  }, [resource.response, session, visit]);

  const mutate = async (
    action: () => Promise<TelehealthEnvelope<TelehealthMutationData>>,
    nextStep?: number,
  ) => {
    if (actionPendingRef.current) return;
    actionPendingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await action();
      if (!mountedRef.current) return;
      resource.setResponse(visitEnvelope(response));
      if (nextStep !== undefined) setStep(nextStep);
      return response;
    } catch (reason) {
      if (!mountedRef.current) return;
      const unknown = reason instanceof ApiError && reason.status === 409;
      setError(
        unknown
          ? "The result is not confirmed. Check the current visit status before trying again."
          : reason instanceof Error
            ? reason.message
            : "The visit could not be updated.",
      );
      throw reason;
    } finally {
      actionPendingRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  };

  if (!visit || !resource.response) {
    return (
      <Box sx={{ maxWidth: 760, mx: "auto", p: { xs: 2, sm: 3 } }}>
        {resource.error ? (
          <Alert
            severity="error"
            action={
              <Button onClick={() => void resource.refresh()}>Try again</Button>
            }
          >
            {resource.error}
          </Alert>
        ) : (
          <Typography role="status">Loading your video visit…</Typography>
        )}
      </Box>
    );
  }

  const inCall = session.active?.visitId === visit.public_id;
  const completion = visit.completion;
  const withdrawConsent = async () => {
    if (actionPendingRef.current) return;
    actionPendingRef.current = true;
    const currentAttempt = withdrawalAttemptRef.current;
    const attempt =
      currentAttempt?.visitId === visit.public_id
        ? currentAttempt
        : {
            visitId: visit.public_id,
            expectedVersion: resource.response!.version,
            policyVersion: visit.policy.version,
            key: requestKey(),
          };
    withdrawalAttemptRef.current = attempt;
    setBusy(true);
    setError(null);
    setWithdrawalError(null);
    let mediaStopped = session.active?.visitId !== attempt.visitId;
    try {
      if (!mediaStopped) {
        await session.leave(false);
        mediaStopped = true;
      }
      const response = await recordConsent(
        attempt.visitId,
        attempt.expectedVersion,
        attempt.policyVersion,
        "withdrawn",
        attempt.key,
      );
      if (!mountedRef.current) return;
      resource.setResponse(visitEnvelope(response));
      withdrawalAttemptRef.current = null;
    } catch (reason) {
      if (!mountedRef.current) return;
      if (
        reason instanceof ApiError &&
        reason.status === 409 &&
        reason.code === "stale_record"
      ) {
        withdrawalAttemptRef.current = null;
        setError(
          "The visit changed before consent withdrawal was recorded. Review the latest status, then retry withdrawal.",
        );
        setWithdrawalError(
          "Meta Clinic stopped this browser's camera and microphone, but the visit changed before consent withdrawal was recorded. Meta Clinic requested the latest visit status; review it, then retry withdrawal.",
        );
        await resource.refresh();
        return;
      }
      const message =
        reason instanceof Error
          ? reason.message
          : "Consent withdrawal could not be confirmed.";
      setError(message);
      setWithdrawalError(
        mediaStopped
          ? `Meta Clinic stopped this browser's camera and microphone, but could not confirm consent withdrawal: ${message}`
          : `Meta Clinic could not stop this browser's media or confirm consent withdrawal: ${message}`,
      );
      throw reason;
    } finally {
      actionPendingRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  };
  const saveInitial = async (checkin: PatientCheckinInput) => {
    await mutate(
      () => submitCheckin(visit.public_id, resource.response!.version, checkin),
      1,
    );
  };
  const saveDevices = async (
    deviceResults: TelehealthDeviceResults,
    devices: { audioDeviceId?: string; videoDeviceId?: string },
  ) => {
    const location = visit.preparation.location;
    if (
      (visit.policy.require_location && !location) ||
      (visit.policy.require_callback && !visit.preparation.callback_phone)
    ) {
      setStep(0);
      setError(
        "Confirm your current location and callback number before the device check.",
      );
      return;
    }
    await mutate(
      () =>
        submitCheckin(visit.public_id, resource.response!.version, {
          location,
          callback_phone: visit.preparation.callback_phone || null,
          location_attested: Boolean(location),
          device_results: deviceResults,
        }),
      2,
    );
    setCheckedDevices(devices);
  };
  const join = async () => {
    if (actionPendingRef.current) return;
    actionPendingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await session.join({
        actor: "patient",
        visitId: visit.public_id,
        version: resource.response!.version,
        patientId: visit.appointment.patient.id,
        patientName:
          visit.identity?.display_name ||
          visit.appointment.patient.display_name,
        encounterId: visit.encounter_id,
        returnPath: window.location.pathname,
        audioOnly: Boolean(
          visit.policy.allow_audio_only &&
          visit.preparation.device_results?.audio_only_requested,
        ),
        ...checkedDevices,
      });
    } catch (reason) {
      if (mountedRef.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to join the visit.",
        );
    } finally {
      actionPendingRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  };

  if (
    ["ending", "ended", "cancelled", "no_show"].includes(visit.status) ||
    visit.current_step === "instructions"
  ) {
    return (
      <PatientVisitCompletion
        visitStatus={visit.status}
        completion={completion ?? null}
        support={visit.support ?? null}
        stale={resource.stale}
        onRefresh={resource.refresh}
      />
    );
  }

  return (
    <Stack
      spacing={2.5}
      sx={{
        maxWidth: inCall ? 1200 : 820,
        mx: "auto",
        p: { xs: 2, sm: 3 },
        pb: { xs: 12, sm: 3 },
      }}
    >
      <Box>
        <Typography variant="h4" component="h1">
          Video visit
        </Typography>
        <Typography>{visit.practice?.name || "Your clinic"}</Typography>
        <Typography color="text.secondary">
          {visit.clinician?.display_name || "Clinician not assigned"} ·{" "}
          {formatAppointment(visit)}
        </Typography>
        {visit.policy.instructions && !inCall && (
          <Typography
            sx={{ mt: 1.5, whiteSpace: "pre-wrap", maxWidth: "68ch" }}
          >
            {visit.policy.instructions}
          </Typography>
        )}
      </Box>
      {resource.stale && (
        <Alert severity="warning">
          The latest refresh failed. This page is showing the last confirmed
          visit state.
        </Alert>
      )}
      {withdrawalError && (
        <Alert
          severity="error"
          action={
            <Button
              color="inherit"
              disabled={busy}
              onClick={() => void withdrawConsent().catch(() => undefined)}
            >
              Retry withdrawal
            </Button>
          }
        >
          {withdrawalError}
        </Alert>
      )}
      {inCall ? (
        <PatientCall
          visit={visit}
          version={resource.response.version}
          allowedActions={resource.response.allowed_actions}
          onRefresh={resource.refresh}
          onWithdrawConsent={withdrawConsent}
        />
      ) : (
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
          <Stepper
            activeStep={step}
            alternativeLabel
            sx={{
              mb: 3,
              "& .MuiStepLabel-label": {
                fontSize: { xs: "0.75rem", sm: "0.875rem" },
              },
              "& .MuiStep-root": { px: { xs: 0.25, sm: 1 } },
            }}
          >
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
          {step === 0 && (
            <PatientCheckin
              key={`${visit.public_id}:${visit.preparation.checkin_id || "new"}`}
              preparation={visit.preparation}
              requireLocation={visit.policy.require_location}
              requireCallback={visit.policy.require_callback}
              busy={busy}
              error={error}
              onSave={saveInitial}
              onWrongAppointment={() =>
                window.location.assign("/patient-portal#appointments")
              }
            />
          )}
          {step === 1 && (
            <DeviceCheck
              allowAudioOnly={visit.policy.allow_audio_only}
              busy={busy}
              error={error}
              onBack={() => setStep(0)}
              onContinue={saveDevices}
            />
          )}
          {step === 2 && (
            <ConsentStep
              policy={visit.policy}
              busy={busy}
              error={error}
              onBack={() => setStep(1)}
              onAccept={async () => {
                await mutate(
                  () =>
                    enterWaitingRoom(
                      visit.public_id,
                      resource.response!.version,
                      visit.policy.version,
                    ),
                  3,
                );
              }}
              onDecline={async () => {
                const response = await mutate(() =>
                  recordConsent(
                    visit.public_id,
                    resource.response!.version,
                    visit.policy.version,
                    "declined",
                  ),
                );
                if (response)
                  window.location.assign("/patient-portal#appointments");
              }}
            />
          )}
          {step === 3 && (
            <WaitingRoom
              visit={visit}
              allowedActions={resource.response.allowed_actions}
              busy={busy}
              error={error}
              onUpdatePreparation={() => setStep(0)}
              onLeave={async () => {
                const response = await mutate(() =>
                  leavePatientVisit(
                    visit.public_id,
                    resource.response!.version,
                  ),
                );
                if (response)
                  window.location.assign("/patient-portal#appointments");
              }}
              onJoin={join}
            />
          )}
        </Paper>
      )}
    </Stack>
  );
}
