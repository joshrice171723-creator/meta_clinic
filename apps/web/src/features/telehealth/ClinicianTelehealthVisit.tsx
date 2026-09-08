import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  Divider,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import { ApiError } from "../../api/client";
import {
  addParticipant,
  admitParticipant,
  endVisit,
  extendVisit,
  loadTelehealthQueue,
  prepareRoom,
  reconcileVisit,
  removeParticipant,
  resumeVisit,
  startEncounter,
  verifyPreparation,
} from "./api";
import { CallControls } from "./CallControls";
import { ParticipantPanel } from "./ParticipantPanel";
import { ScribeInCall } from "./ScribeInCall";
import { useTelehealthSession } from "./TelehealthSessionProvider";
import type {
  TelehealthEnvelope,
  TelehealthMutationData,
  TelehealthVisit,
} from "./types";
import { useTelehealthVisit } from "./useTelehealthVisit";
import { VideoStage } from "./VideoStage";
import { VisitWrapUp } from "./VisitWrapUp";

function appointmentLabel(visit: TelehealthVisit) {
  const date = new Date(visit.appointment.starts_at);
  if (Number.isNaN(date.valueOf())) return "Appointment time unavailable";
  return `${new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: visit.appointment.timezone,
  }).format(date)} (${visit.appointment.timezone})`;
}

function visitEnvelope(
  response: TelehealthEnvelope<TelehealthMutationData>,
): TelehealthEnvelope<TelehealthVisit> {
  return { ...response, data: response.data.visit };
}

function connectionLabel(state: string) {
  if (state === "idle") return "Not connected";
  if (state === "joining") return "Connecting";
  if (state === "joined") return "Connected";
  if (state === "reconnecting") return "Reconnecting";
  if (state === "leaving") return "Leaving call";
  if (state === "ended") return "Call ended";
  if (state === "error") return "Connection failed";
  return "Not connected";
}

function safePhoneHref(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  const normalized = trimmed.replace(/[^\d+]/g, "");
  if (!/^\+?\d{7,15}$/.test(normalized)) return null;
  return `tel:${normalized}`;
}

export function ClinicianTelehealthVisit({
  visitId,
  patientId,
  encounterId,
}: {
  visitId?: string;
  patientId?: string;
  encounterId?: string;
}) {
  const [resolvedVisitId, setResolvedVisitId] = useState(visitId || null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [endConfirm, setEndConfirm] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [removalPending, setRemovalPending] = useState<{
    participantId: string;
    providerSubjectId: string;
  } | null>(null);
  const [resumeConfirm, setResumeConfirm] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const session = useTelehealthSession();
  const resource = useTelehealthVisit("staff", resolvedVisitId, { poll: true });

  useEffect(() => {
    setResolvedVisitId(visitId || null);
    setLookupError(null);
    if (visitId) return;
    if (!patientId || !encounterId) {
      setLookupError(
        "This video visit needs a visit ID or an exact patient and encounter.",
      );
      return;
    }
    const abort = new AbortController();
    const query = new URLSearchParams({
      patient_id: patientId,
      encounter_id: encounterId,
      limit: "1",
    });
    loadTelehealthQueue(query, abort.signal)
      .then((response) => {
        if (abort.signal.aborted) return;
        const match = response.data.visits[0];
        if (!match)
          setLookupError("No video visit is bound to this patient encounter.");
        else setResolvedVisitId(match.public_id);
      })
      .catch((reason) => {
        if (!abort.signal.aborted)
          setLookupError(
            reason instanceof Error
              ? reason.message
              : "The video visit could not be located.",
          );
      });
    return () => abort.abort();
  }, [encounterId, patientId, visitId]);

  const visit = resource.response?.data;
  const allowed = resource.response?.allowed_actions || [];
  const patientParticipant = visit?.participants.find(
    (participant) => participant.role === "patient",
  );
  const callActive = Boolean(
    visit && session.active?.visitId === visit.public_id,
  );
  useEffect(() => {
    if (!callActive) return;
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [callActive]);

  useEffect(() => {
    if (!callActive || !resource.response) return;
    session.updateVersion(resource.response.version);
  }, [callActive, resource.response, session]);

  useEffect(() => {
    if (
      !removalPending ||
      session.participants.some(
        (participant) =>
          !participant.isLocal &&
          participant.providerSubjectId === removalPending.providerSubjectId,
      )
    )
      return;
    setRemovalPending(null);
    setNotice(
      "Participant access is revoked and their media is no longer connected.",
    );
  }, [removalPending, session.participants]);

  const scribeTracks = useMemo(() => {
    const local =
      session.participants.find((participant) => participant.isLocal)
        ?.audioTrack || null;
    const remote = session.participants
      .filter((participant) => !participant.isLocal && participant.audioTrack)
      .map((participant) => ({
        participantId: participant.participantId,
        displayName: participant.displayName,
        track: participant.audioTrack!,
        subscribed: participant.subscribed,
      }));
    return { local, remote };
  }, [session.participants]);

  const applyMutation = async (
    action: () => Promise<TelehealthEnvelope<TelehealthMutationData>>,
    success: string,
  ) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await action();
      resource.setResponse(visitEnvelope(response));
      const operation = response.data.operation;
      if (operation?.status === "failed") {
        throw new Error(
          "APPly saved the visit change, but the video service could not complete this step. Check the current status before trying again.",
        );
      } else if (operation?.status === "unknown") {
        setNotice(
          "APPly accepted the request, but the video service has not confirmed the result. Check status before repeating it.",
        );
      } else if (
        operation?.status === "pending" ||
        operation?.status === "leased"
      ) {
        setNotice(
          `${success} This may take a moment; APPly will keep checking.`,
        );
      } else {
        setNotice(success);
      }
      return response;
    } catch (reason) {
      const unknown = reason instanceof ApiError && reason.status === 409;
      setError(
        unknown
          ? "The result is not confirmed. Check the current visit state before trying again."
          : reason instanceof Error
            ? reason.message
            : "The visit action could not be completed.",
      );
      throw reason;
    } finally {
      setBusy(false);
    }
  };

  if (lookupError)
    return (
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack spacing={2}>
          <Alert severity="error">{lookupError}</Alert>
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{ flexWrap: "wrap" }}
          >
            <Button variant="contained" href="/clinic/telehealth">
              Back to video visits
            </Button>
            {patientId && (
              <Button href={`/clinic/patients/${patientId}`}>
                Open patient chart
              </Button>
            )}
          </Stack>
        </Stack>
      </Paper>
    );
  if (!resolvedVisitId || !visit || !resource.response) {
    return resource.error ? (
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack spacing={2}>
          <Alert severity="error">{resource.error}</Alert>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={() => void resource.refresh()}>
              Try again
            </Button>
            <Button href="/clinic/telehealth">Back to video visits</Button>
          </Stack>
        </Stack>
      </Paper>
    ) : (
      <Paper variant="outlined" sx={{ p: 4 }}>
        <Stack
          spacing={1.5}
          role="status"
          sx={{ alignItems: "center", textAlign: "center" }}
        >
          <CircularProgress size={32} />
          <Typography variant="h6">Loading video visit</Typography>
          <Typography variant="body2" color="text.secondary">
            Checking the latest preparation, room, and participant status…
          </Typography>
        </Stack>
      </Paper>
    );
  }

  const start = async () => {
    const response = await applyMutation(
      () => startEncounter(visit.public_id, resource.response!.version),
      "Encounter started. The patient has not been admitted yet.",
    );
    const encounter = response.data.visit.encounter_id;
    if (encounter)
      window.history.replaceState(
        window.history.state,
        "",
        `/clinic/patients/${visit.appointment.patient.id}/encounters/${encounter}/telehealth`,
      );
  };

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      await session.join({
        actor: "staff",
        visitId: visit.public_id,
        version: resource.response!.version,
        patientId: visit.appointment.patient.id,
        patientName: visit.appointment.patient.display_name,
        encounterId: visit.encounter_id,
        returnPath: visit.encounter_id
          ? `/clinic/patients/${visit.appointment.patient.id}/encounters/${visit.encounter_id}/telehealth`
          : `/clinic/telehealth/${visit.public_id}`,
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to join the video visit.",
      );
    } finally {
      setBusy(false);
    }
  };

  const endForEveryone = async () => {
    try {
      await applyMutation(
        () => endVisit(visit.public_id, resource.response!.version),
        "The visit is ending. New admissions are blocked while the provider confirms shutdown.",
      );
      try {
        await session.ejectAllRemoteParticipants();
      } finally {
        await session.leave(false);
      }
    } finally {
      setEndConfirm(false);
    }
  };

  const removeFromCall = async (participantId: string) => {
    setRemoveTarget(null);
    const response = await applyMutation(
      () =>
        removeParticipant(
          visit.public_id,
          participantId,
          resource.response!.version,
        ),
      "Participant access was revoked. APPly is requesting that their call disconnect.",
    );
    const removed = response.data.visit.participants.find(
      (participant) => participant.id === participantId,
    );
    const providerSubjectId = removed?.provider_subject_id;
    if (!providerSubjectId) {
      setNotice(
        "Participant access was revoked. No active video connection was found; APPly will keep checking the visit.",
      );
      return;
    }
    try {
      const requested = await session.ejectParticipant(providerSubjectId);
      setRemovalPending({ participantId, providerSubjectId });
      if (!requested) {
        setNotice(
          "Participant access was revoked. APPly is waiting for the video provider to confirm their disconnection.",
        );
        return;
      }
      setNotice(
        "Participant access was revoked. Disconnection was requested and is awaiting confirmation.",
      );
    } catch {
      setNotice(
        "Participant access was revoked, but this browser could not complete the disconnect request. APPly will keep checking the visit.",
      );
    }
  };

  const mappedCallState =
    session.callState === "joining" ||
    session.callState === "joined" ||
    session.callState === "reconnecting"
      ? session.callState
      : "ended";
  const roomMinutesRemaining = visit.room.expires_at
    ? Math.ceil((new Date(visit.room.expires_at).valueOf() - clock) / 60_000)
    : null;
  const callbackHref = safePhoneHref(visit.preparation.callback_phone);
  const locationLabel = visit.preparation.location
    ? [
        visit.preparation.location.address_line1,
        visit.preparation.location.unit,
        visit.preparation.location.city,
        visit.preparation.location.region_code,
      ]
        .filter(Boolean)
        .join(", ")
    : null;
  const nextStep: {
    title: string;
    description: string;
    action?: ReactNode;
  } = (() => {
    if (visit.status === "ending")
      return {
        title: "Ending the video visit",
        description:
          "New admissions are blocked while APPly confirms that the call has ended for everyone.",
      };
    if (visit.status === "ended")
      return {
        title: "Video visit ended",
        description:
          "Review the Scribe draft and complete the visit wrap-up below. The encounter stays open until its documentation is closed in the chart.",
        action: allowed.includes("telehealth.resume") ? (
          <Button variant="contained" onClick={() => setResumeConfirm(true)}>
            Resume video visit
          </Button>
        ) : undefined,
      };
    if (callActive && session.authorizationStatus !== "confirmed")
      return {
        title: "Connection needs attention",
        description:
          "APPly is checking your access. Media controls will return after authorization is confirmed.",
        action: (
          <Button
            variant="outlined"
            disabled={resource.refreshing}
            onClick={() => void resource.refresh()}
          >
            Check status
          </Button>
        ),
      };
    if (callActive)
      return {
        title:
          session.callState === "reconnecting"
            ? "Reconnecting to the visit"
            : "Visit in progress",
        description:
          session.callState === "reconnecting"
            ? "Keep this page open while APPly restores the connection."
            : "Use the call controls below. Patient context and participants remain available beside the video.",
      };
    if (!visit.encounter_id && allowed.includes("telehealth.start_encounter"))
      return {
        title: "Start the encounter",
        description:
          "Start the encounter before admitting the patient or using Scribe.",
        action: (
          <Button
            variant="contained"
            disabled={busy}
            onClick={() => void start()}
          >
            Start encounter
          </Button>
        ),
      };
    if (
      !visit.preparation.verified &&
      visit.preparation.checkin_id != null &&
      allowed.includes("telehealth.verify_preparation")
    )
      return {
        title: "Verify the patient and location",
        description:
          "Review the patient-reported details below before continuing.",
        action: (
          <Button
            variant="contained"
            disabled={busy}
            onClick={() =>
              void applyMutation(
                () =>
                  verifyPreparation(
                    visit.public_id,
                    resource.response!.version,
                    visit.preparation.checkin_id!,
                  ),
                "Patient and location verified for this check-in.",
              )
            }
          >
            Verify patient and location
          </Button>
        ),
      };
    if (!visit.preparation.complete)
      return {
        title: "Waiting for patient preparation",
        description:
          "The patient still needs to complete the required visit details or device checks.",
      };
    if (
      visit.room.status === "not_prepared" &&
      allowed.includes("telehealth.prepare_room")
    )
      return {
        title: "Prepare the video room",
        description:
          "Create the secure room before admitting or joining the visit.",
        action: (
          <Button
            variant="contained"
            disabled={busy}
            onClick={() =>
              void applyMutation(
                () => prepareRoom(visit.public_id, resource.response!.version),
                "Video room preparation requested.",
              )
            }
          >
            Prepare video room
          </Button>
        ),
      };
    if (visit.room.status === "pending" || visit.room.status === "provisioning")
      return {
        title: "Video room is getting ready",
        description:
          "APPly will update this page when the room is ready. No action is needed yet.",
      };
    if (
      patientParticipant?.status === "waiting" &&
      allowed.includes("telehealth.admit")
    )
      return {
        title: "Patient is ready to admit",
        description:
          "Admit the patient when the care team is ready to begin the video visit.",
        action: (
          <Button
            variant="contained"
            disabled={busy}
            onClick={() =>
              void applyMutation(
                () =>
                  admitParticipant(
                    visit.public_id,
                    patientParticipant.id,
                    resource.response!.version,
                  ),
                `${visit.appointment.patient.display_name} was admitted to the video visit.`,
              )
            }
          >
            Admit patient
          </Button>
        ),
      };
    if (
      allowed.includes("telehealth.join") &&
      (visit.room.status === "ready" || visit.room.status === "active")
    )
      return {
        title: "Ready to join",
        description:
          patientParticipant?.status === "admitted"
            ? "The patient has been admitted. Join when you are ready."
            : "The video room is ready. You can join while the patient waits.",
        action: (
          <Button
            variant="contained"
            disabled={busy}
            onClick={() => void join()}
          >
            Join video visit
          </Button>
        ),
      };
    return {
      title: "Waiting for the next visit step",
      description:
        "APPly will show the next available action when preparation and room status allow it.",
    };
  })();

  return (
    <Stack spacing={2} sx={{ minWidth: 0 }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        sx={{
          justifyContent: "space-between",
          alignItems: { md: "flex-start" },
        }}
      >
        <Box>
          <Typography variant="h4" component="h1">
            Video visit
          </Typography>
          <Typography variant="h6">
            {visit.appointment.patient.display_name}
          </Typography>
          <Typography color="text.secondary">
            {appointmentLabel(visit)} ·{" "}
            {visit.clinician?.display_name || "Clinician not recorded"}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {visit.encounter_id
              ? "Encounter started"
              : "Encounter has not started"}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
          {visit.encounter_id && (
            <Button
              href={`/clinic/patients/${visit.appointment.patient.id}/encounters/${visit.encounter_id}`}
            >
              Back to chart
            </Button>
          )}
          <Chip
            variant="outlined"
            label={`Call: ${connectionLabel(session.callState)}`}
          />
          <Button
            startIcon={<RefreshOutlinedIcon />}
            disabled={resource.refreshing}
            onClick={() => void resource.refresh()}
          >
            Refresh
          </Button>
        </Stack>
      </Stack>
      {resource.stale && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" onClick={() => void resource.refresh()}>
              Try again
            </Button>
          }
        >
          The latest update could not be confirmed. This page is showing the
          last confirmed visit status.
        </Alert>
      )}
      {error && (
        <Alert
          severity="error"
          action={
            allowed.includes("telehealth.reconcile") ? (
              <Button
                color="inherit"
                onClick={() =>
                  void applyMutation(
                    () =>
                      reconcileVisit(
                        visit.public_id,
                        resource.response!.version,
                      ),
                    "Reconciliation requested.",
                  )
                }
              >
                Check status
              </Button>
            ) : undefined
          }
        >
          {error}
        </Alert>
      )}
      {notice && <Alert severity="info">{notice}</Alert>}
      {callActive &&
        roomMinutesRemaining !== null &&
        roomMinutesRemaining <= 5 && (
          <Alert
            severity={roomMinutesRemaining <= 1 ? "warning" : "info"}
            action={
              allowed.includes("telehealth.extend") ? (
                <Button
                  color="inherit"
                  disabled={busy}
                  onClick={() =>
                    void applyMutation(
                      () =>
                        extendVisit(
                          visit.public_id,
                          resource.response!.version,
                        ),
                      "Visit extension requested. The appointment and billing duration are unchanged.",
                    )
                  }
                >
                  Extend visit
                </Button>
              ) : undefined
            }
          >
            {roomMinutesRemaining > 0
              ? `The video room expires in about ${roomMinutesRemaining} minute${roomMinutesRemaining === 1 ? "" : "s"}.`
              : "The video room time has ended. Check the current visit status."}
          </Alert>
        )}
      <Paper
        variant="outlined"
        sx={{
          p: { xs: 2, sm: 2.5 },
          borderLeft: 4,
          borderLeftColor:
            callActive && session.callState === "joined"
              ? "success.main"
              : "primary.main",
        }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}
        >
          <Box>
            <Typography variant="overline" color="text.secondary">
              Next step
            </Typography>
            <Typography variant="h6">{nextStep.title}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {nextStep.description}
            </Typography>
          </Box>
          {nextStep.action && (
            <Box sx={{ flexShrink: 0 }}>{nextStep.action}</Box>
          )}
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 } }}>
        <Typography variant="subtitle1" sx={{ mb: 1.5, fontWeight: 700 }}>
          Visit readiness
        </Typography>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          divider={<Divider flexItem orientation="vertical" />}
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2">
              Patient-reported location
            </Typography>
            <Typography>{locationLabel || "Not available"}</Typography>
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2">Callback</Typography>
            {visit.preparation.callback_phone ? (
              callbackHref ? (
                <Button
                  href={callbackHref}
                  size="small"
                  sx={{ justifyContent: "flex-start", px: 0 }}
                >
                  {visit.preparation.callback_phone}
                </Button>
              ) : (
                <Typography>{visit.preparation.callback_phone}</Typography>
              )
            ) : (
              <Typography color="text.secondary">
                Use the patient chart’s contact options if the call drops.
              </Typography>
            )}
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2">Preparation</Typography>
            <Typography>
              {visit.preparation.verified
                ? "Verified for this check-in"
                : visit.preparation.complete
                  ? "Ready for verification"
                  : "Incomplete"}
            </Typography>
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2">Consent</Typography>
            <Typography>Policy version {visit.policy.version}</Typography>
          </Box>
        </Stack>
        {visit.preparation.reasons.length > 0 && (
          <Alert severity="warning" sx={{ mt: 1.5 }}>
            {visit.preparation.reasons.join(" · ")}
          </Alert>
        )}
      </Paper>
      <VisitWrapUp
        key={visit.public_id}
        visit={visit}
        version={resource.response!.version}
        allowedActions={allowed}
        onSaved={(response) => resource.setResponse(visitEnvelope(response))}
        onRefresh={resource.refresh}
        onReviewScribe={() => {
          setTab(0);
          document.getElementById("telehealth-tab-scribe")?.focus();
        }}
      />
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            md: "minmax(0, 1.45fr) minmax(320px, .85fr)",
          },
          gap: 2,
          minWidth: 0,
        }}
      >
        <Paper variant="outlined" sx={{ overflow: "hidden", minWidth: 0 }}>
          <VideoStage
            participants={callActive ? session.participants : []}
            emptyTitle={
              session.callState === "reconnecting"
                ? "Reconnecting to the visit"
                : callActive
                  ? "Waiting for participant video"
                  : "Join when the visit is ready"
            }
            emptyDescription={
              session.callState === "reconnecting"
                ? "Keep this page open while APPly restores the connection."
                : callActive
                  ? "Video appears here when an admitted participant connects or turns on their camera."
                  : "The secure video room appears here after you join."
            }
          />
          {callActive ? (
            <CallControls
              recoveryContact={{
                label: "Call patient",
                phone: visit.preparation.callback_phone,
              }}
              allowScreenShare={visit.policy.allow_staff_screen_share}
              showParticipants={tab === 2}
              onShowParticipants={() => setTab(2)}
              onLeave={() => setLeaveConfirm(true)}
              onEnd={() => setEndConfirm(true)}
              canEnd={allowed.includes("telehealth.end")}
              busy={busy}
            />
          ) : (
            <Alert severity="info" sx={{ borderRadius: 0 }}>
              Video access becomes available after APPly confirms the room is
              ready and you are authorized for this visit.
            </Alert>
          )}
        </Paper>
        <Paper variant="outlined" sx={{ minWidth: 0 }}>
          <Tabs
            value={tab}
            onChange={(_, value) => setTab(value)}
            variant="fullWidth"
            aria-label="Visit workspace"
          >
            <Tab
              id="telehealth-tab-scribe"
              aria-controls="telehealth-panel-scribe"
              label="Scribe & note"
            />
            <Tab
              id="telehealth-tab-context"
              aria-controls="telehealth-panel-context"
              label="Patient context"
            />
            <Tab
              id="telehealth-tab-participants"
              aria-controls="telehealth-panel-participants"
              label="Participants"
            />
          </Tabs>
          <Divider />
          <Box
            role="tabpanel"
            id={
              tab === 0
                ? "telehealth-panel-scribe"
                : tab === 1
                  ? "telehealth-panel-context"
                  : "telehealth-panel-participants"
            }
            aria-labelledby={
              tab === 0
                ? "telehealth-tab-scribe"
                : tab === 1
                  ? "telehealth-tab-context"
                  : "telehealth-tab-participants"
            }
            sx={{
              p: 2,
              maxHeight: { md: "calc(100vh - 260px)" },
              overflow: "auto",
            }}
          >
            {tab === 0 &&
              (visit.encounter_id ? (
                <ScribeInCall
                  visitPublicId={visit.public_id}
                  clinicalEncounterId={visit.encounter_id}
                  patientId={visit.appointment.patient.id}
                  callState={mappedCallState}
                  localAudioTrack={scribeTracks.local}
                  remoteAudioTracks={scribeTracks.remote}
                />
              ) : (
                <Alert severity="info">
                  Start the encounter to use Scribe for this visit.
                </Alert>
              ))}
            {tab === 1 && (
              <Stack spacing={2}>
                <Typography variant="h6">Patient context</Typography>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Patient
                  </Typography>
                  <Typography sx={{ fontWeight: 600 }}>
                    {visit.appointment.patient.display_name}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Appointment
                  </Typography>
                  <Typography>{appointmentLabel(visit)}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Patient-reported location
                  </Typography>
                  <Typography>{locationLabel || "Not available"}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Callback
                  </Typography>
                  {visit.preparation.callback_phone ? (
                    callbackHref ? (
                      <Button
                        href={callbackHref}
                        size="small"
                        sx={{ justifyContent: "flex-start", px: 0 }}
                      >
                        {visit.preparation.callback_phone}
                      </Button>
                    ) : (
                      <Typography>
                        {visit.preparation.callback_phone}
                      </Typography>
                    )
                  ) : (
                    <Typography>
                      Use the patient chart’s contact options.
                    </Typography>
                  )}
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Open the chart for the complete clinical context.
                </Typography>
                {visit.encounter_id && (
                  <Button
                    variant="outlined"
                    href={`/clinic/patients/${visit.appointment.patient.id}/encounters/${visit.encounter_id}`}
                  >
                    Open full chart
                  </Button>
                )}
              </Stack>
            )}
            {tab === 2 && (
              <ParticipantPanel
                participants={visit.participants}
                mediaParticipants={session.participants}
                canRemove={allowed.includes("telehealth.remove")}
                onRemove={(id) => setRemoveTarget(id)}
                eligibleCareTeam={visit.eligible_staff.map((member) => ({
                  membershipId: member.membership_id,
                  displayName: `${member.display_name} · ${member.role === "clinician" ? "Clinician" : "Assistant"}`,
                }))}
                canAdd={allowed.includes("telehealth.add_participant")}
                onAdd={async (membershipId) => {
                  await applyMutation(
                    () =>
                      addParticipant(
                        visit.public_id,
                        resource.response!.version,
                        membershipId,
                      ),
                    "Care-team member added to this visit.",
                  );
                }}
                busy={busy}
              />
            )}
          </Box>
        </Paper>
      </Box>
      <Dialog open={leaveConfirm} onClose={() => setLeaveConfirm(false)}>
        <DialogTitle>Leave this call?</DialogTitle>
        <DialogContent>
          The patient may remain connected with other admitted care-team
          members. This does not end the encounter.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLeaveConfirm(false)}>Stay</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              setLeaveConfirm(false);
              void session.leave(true);
            }}
          >
            Leave call
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={endConfirm} onClose={() => setEndConfirm(false)}>
        <DialogTitle>End video for everyone?</DialogTitle>
        <DialogContent>
          This blocks new admissions and disconnects everyone from the video
          room. It does not sign notes or close the encounter.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEndConfirm(false)}>Keep call active</Button>
          <Button
            color="error"
            variant="contained"
            disabled={busy}
            onClick={() => void endForEveryone()}
          >
            End for everyone
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
      >
        <DialogTitle>Remove this participant?</DialogTitle>
        <DialogContent>
          Their access will be revoked and APPly will request that their call
          disconnect. The participant list updates after removal is confirmed.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoveTarget(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            disabled={busy}
            onClick={() => {
              const target = removeTarget;
              if (target) void removeFromCall(target);
            }}
          >
            Remove from call
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={resumeConfirm} onClose={() => setResumeConfirm(false)}>
        <DialogTitle>Resume this video visit?</DialogTitle>
        <DialogContent>
          This opens a new video room for the existing encounter. APPly will
          recheck preparation and consent, and the patient must be admitted
          again. The encounter and its documentation status stay unchanged.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResumeConfirm(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={busy}
            onClick={() => {
              setResumeConfirm(false);
              void applyMutation(
                () => resumeVisit(visit.public_id, resource.response!.version),
                "A new video room was requested. Recheck preparation and admit the patient when the room is ready.",
              );
            }}
          >
            Resume video visit
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
