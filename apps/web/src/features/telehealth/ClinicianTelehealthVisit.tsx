import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
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
  if (state === "reconnecting") return "Connection interrupted";
  return state.replaceAll("_", " ");
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
  const [participantsOpen, setParticipantsOpen] = useState(false);
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
      setNotice(
        response.data.operation &&
          !["succeeded", "failed"].includes(response.data.operation.status)
          ? `${success} The provider operation is still ${response.data.operation.status}.`
          : success,
      );
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

  if (lookupError) return <Alert severity="error">{lookupError}</Alert>;
  if (!resolvedVisitId || !visit || !resource.response) {
    return resource.error ? (
      <Alert
        severity="error"
        action={
          <Button onClick={() => void resource.refresh()}>Try again</Button>
        }
      >
        {resource.error}
      </Alert>
    ) : (
      <Typography role="status">Loading video visit…</Typography>
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
      "Participant access was revoked. Provider media disconnection is being requested.",
    );
    const removed = response.data.visit.participants.find(
      (participant) => participant.id === participantId,
    );
    const providerSubjectId = removed?.provider_subject_id;
    if (!providerSubjectId) {
      setNotice(
        "Participant access was revoked. No matching provider media identity remains; server reconciliation will confirm shutdown.",
      );
      return;
    }
    try {
      const requested = await session.ejectParticipant(providerSubjectId);
      if (!requested) {
        setNotice(
          "Participant access was revoked. No matching remote media connection is present.",
        );
        return;
      }
      setRemovalPending({ participantId, providerSubjectId });
      setNotice(
        "Participant access was revoked. Media disconnection was requested and is awaiting roster confirmation.",
      );
    } catch {
      setNotice(
        "Participant access was revoked, but this browser could not request media ejection. Server reconciliation remains pending.",
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
        <Alert severity="warning">
          Refresh failed. This page is showing the last confirmed visit state.
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
              : "The video room expiry has passed. Check the provider status."}
          </Alert>
        )}
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          divider={<Divider flexItem orientation="vertical" />}
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2">
              Patient-reported location
            </Typography>
            <Typography>
              {visit.preparation.location
                ? [
                    visit.preparation.location.address_line1,
                    visit.preparation.location.unit,
                    visit.preparation.location.city,
                    visit.preparation.location.region_code,
                  ]
                    .filter(Boolean)
                    .join(", ")
                : "Not available for this role"}
            </Typography>
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2">Callback</Typography>
            <Typography>
              {visit.preparation.callback_phone ||
                "Not available for this role"}
            </Typography>
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
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ mt: 1.5, flexWrap: "wrap" }}
        >
          {!visit.encounter_id &&
            allowed.includes("telehealth.start_encounter") && (
              <Button
                variant="contained"
                disabled={busy}
                onClick={() => void start()}
              >
                Start encounter
              </Button>
            )}
          {!visit.preparation.verified &&
            visit.preparation.checkin_id != null &&
            allowed.includes("telehealth.verify_preparation") && (
              <Button
                variant="outlined"
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
            )}
          {visit.room.status === "not_prepared" &&
            allowed.includes("telehealth.prepare_room") && (
              <Button
                variant="outlined"
                disabled={busy}
                onClick={() =>
                  void applyMutation(
                    () =>
                      prepareRoom(visit.public_id, resource.response!.version),
                    "Room preparation requested.",
                  )
                }
              >
                Prepare video room
              </Button>
            )}
          {patientParticipant?.status === "waiting" &&
            allowed.includes("telehealth.admit") && (
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
                    `${visit.appointment.patient.display_name} admitted.`,
                  )
                }
              >
                Admit patient
              </Button>
            )}
          {!callActive && allowed.includes("telehealth.join") && (
            <Button
              variant="contained"
              disabled={
                busy ||
                (visit.room.status !== "ready" &&
                  visit.room.status !== "active")
              }
              onClick={() => void join()}
            >
              Join video visit
            </Button>
          )}
        </Stack>
        {visit.preparation.reasons.length > 0 && (
          <Alert severity="warning" sx={{ mt: 1.5 }}>
            {visit.preparation.reasons.join(" · ")}
          </Alert>
        )}
      </Paper>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            lg: "minmax(0, 3fr) minmax(360px, 2fr)",
          },
          gap: 2,
          minWidth: 0,
        }}
      >
        <Paper variant="outlined" sx={{ overflow: "hidden", minWidth: 0 }}>
          <VideoStage participants={callActive ? session.participants : []} />
          {callActive ? (
            <CallControls
              allowScreenShare={visit.policy.allow_staff_screen_share}
              showParticipants={participantsOpen}
              onShowParticipants={() => setParticipantsOpen((value) => !value)}
              onLeave={() => setLeaveConfirm(true)}
              onEnd={() => setEndConfirm(true)}
              canEnd={allowed.includes("telehealth.end")}
              busy={busy}
            />
          ) : (
            <Alert severity="info" sx={{ borderRadius: 0 }}>
              Join access is issued only after the server confirms room
              readiness and your current authorization.
            </Alert>
          )}
        </Paper>
        <Paper variant="outlined" sx={{ minWidth: 0 }}>
          <Tabs
            value={participantsOpen ? 2 : tab}
            onChange={(_, value) => {
              setParticipantsOpen(value === 2);
              setTab(value);
            }}
            variant="fullWidth"
            aria-label="Visit workspace"
          >
            <Tab label="Scribe & note" />
            <Tab label="Patient context" />
            <Tab label="Participants" />
          </Tabs>
          <Divider />
          <Box sx={{ p: 2, maxHeight: { lg: 640 }, overflow: "auto" }}>
            {(participantsOpen ? 2 : tab) === 0 &&
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
                  Start the encounter before binding Scribe to this visit.
                </Alert>
              ))}
            {(participantsOpen ? 2 : tab) === 1 && (
              <Stack spacing={2}>
                <Typography variant="h6">Patient context</Typography>
                <Typography color="text.secondary">
                  Open the patient chart for the complete encounter-bound
                  clinical context. This panel does not copy or invent chart
                  data.
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
            {(participantsOpen ? 2 : tab) === 2 && (
              <ParticipantPanel
                participants={visit.participants}
                mediaParticipants={session.participants}
                canRemove={allowed.includes("telehealth.remove")}
                onRemove={(id) => setRemoveTarget(id)}
                eligibleCareTeam={visit.eligible_staff.map((member) => ({
                  membershipId: member.membership_id,
                  displayName: `${member.display_name} · ${member.role}`,
                }))}
                canAdd={allowed.includes("telehealth.add_participant")}
                onAdd={(membershipId) =>
                  void applyMutation(
                    () =>
                      addParticipant(
                        visit.public_id,
                        resource.response!.version,
                        membershipId,
                      ),
                    "Care-team member added to this visit.",
                  )
                }
                busy={busy}
              />
            )}
          </Box>
        </Paper>
      </Box>
      {visit.status === "ending" && (
        <Alert severity="warning">
          Provider shutdown is pending. Do not close the encounter until media
          termination is confirmed.
        </Alert>
      )}
      {visit.status === "ended" && (
        <Alert
          severity="info"
          action={
            allowed.includes("telehealth.resume") ? (
              <Button color="inherit" onClick={() => setResumeConfirm(true)}>
                Resume video visit
              </Button>
            ) : undefined
          }
        >
          Video transport ended. Connected times shown by the provider are
          operational records and do not determine billing duration.
        </Alert>
      )}
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
          This immediately blocks new admission and requests provider shutdown.
          It does not sign notes or close the encounter.
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
          Their access will be revoked and provider ejection requested. Removal
          is not confirmed until the server reports it.
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
          This creates a new media generation and room for the existing open
          encounter. Current preparation and consent are rechecked, and the
          patient must be admitted again. The encounter and its documentation
          status do not change.
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
                "A new video room generation was requested. Recheck preparation and admit the patient when the room is ready.",
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
