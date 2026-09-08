import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import FiberManualRecordOutlinedIcon from "@mui/icons-material/FiberManualRecordOutlined";
import PauseOutlinedIcon from "@mui/icons-material/PauseOutlined";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import StopOutlinedIcon from "@mui/icons-material/StopOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api/client";
import {
  useScribeRecording,
  type ScribeRecordingSessionInput,
} from "../scribe/ScribeRecordingProvider";
import { ScribeReviewWorkspace } from "../scribe/ScribeReviewWorkspace";
import type {
  ScribeDraft,
  ScribeDraftSection,
  ScribeDocument,
  ScribeEncounter,
  ScribeTemplate,
} from "../scribe/types";
import {
  attachScribeTracks,
  type ScribeRemoteAudioTrack,
} from "./ScribeAudioBridge";

export type ScribeInCallCaptureState = {
  status:
    | "off"
    | "awaiting_consent"
    | "recording"
    | "paused"
    | "saving_audio"
    | "processing"
    | "draft_ready"
    | "error";
  active: boolean;
  recordingId: number | null;
};

export type ScribeInCallProps = {
  visitPublicId: string;
  clinicalEncounterId: number | null;
  patientId: number | null;
  callState: "joining" | "joined" | "reconnecting" | "ended";
  localAudioTrack: MediaStreamTrack | null;
  remoteAudioTracks: readonly ScribeRemoteAudioTrack[];
  onCaptureStateChange?: (state: ScribeInCallCaptureState) => void;
};

type ConsentParticipant = {
  participant_id: number;
  display_name?: string | null;
  role?: string;
  status: "accepted" | "declined" | "withdrawn" | "pending";
};

type ScribeProjection = {
  visit_public_id: string;
  visit_version: number;
  patient_id: number;
  clinical_encounter_id: number | null;
  encounter_id: number | null;
  encounter_version: number | null;
  context_content: string | null;
  template_id: string | null;
  recording_policy: {
    title: string;
    body: string;
  };
  consent: {
    purpose: "scribe_recording";
    policy_version: number | null;
    content_digest: string | null;
    state: "not_requested" | "pending" | "accepted" | "declined" | "withdrawn";
    required_participants: ConsentParticipant[];
  };
  capture: {
    owner_participant_id: number | null;
    owner_display_name?: string | null;
    owner_token?: string;
    epoch: number;
    lease_expires_at: string | null;
  };
  limits: {
    max_duration_ms: number;
    max_total_bytes: number;
    max_chunks: number;
    chunk_interval_ms: number;
  };
  recordings: Array<{
    id: number;
    status: string;
    source_id: number | null;
    segment_index: number;
    source_order: number;
  }>;
  sources: Array<{
    id: number;
    recording_id: number;
    source_order: number;
    source_set_digest: string;
  }>;
  allowed_actions: string[];
};

type CaptureAuthorization = NonNullable<
  ScribeRecordingSessionInput["telehealthCapture"]
>;

function statusLabel(state: ScribeInCallCaptureState["status"]) {
  return {
    off: "Off",
    awaiting_consent: "Awaiting consent",
    recording: "Recording",
    paused: "Paused",
    saving_audio: "Saving audio",
    processing: "Processing",
    draft_ready: "Draft ready",
    error: "Error",
  }[state];
}

function elapsedLabel(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

type ScribeEnvelope = {
  scribe?: ScribeProjection;
  data?: { scribe: ScribeProjection };
};

function responseProjection(response: ScribeEnvelope) {
  const value = response.data?.scribe ?? response.scribe;
  if (!value)
    throw new Error("The Scribe response did not include its visit context.");
  return value;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function ScribeInCall({
  visitPublicId,
  clinicalEncounterId,
  patientId,
  callState,
  localAudioTrack,
  remoteAudioTracks,
  onCaptureStateChange,
}: ScribeInCallProps) {
  const recording = useScribeRecording();
  const [projection, setProjection] = useState<ScribeProjection | null>(null);
  const projectionRef = useRef<ScribeProjection | null>(null);
  const [encounter, setEncounter] = useState<ScribeEncounter | null>(null);
  const [templates, setTemplates] = useState<ScribeTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [confirmExport, setConfirmExport] = useState<ScribeDraft | null>(null);
  const desiredStopRef = useRef<"pause" | "finish" | "rollover">("finish");
  const mediaFingerprintRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const sessionMatches =
    recording.session?.telehealthVisitPublicId === visitPublicId;
  const captureAuthorization = sessionMatches
    ? recording.session?.telehealthCapture
    : undefined;

  const setCurrentProjection = useCallback((value: ScribeProjection) => {
    projectionRef.current = value;
    if (mountedRef.current) setProjection(value);
  }, []);

  const loadContext = useCallback(async () => {
    const result = await api<ScribeEnvelope>(
      `/api/clinic/telehealth/visits/${encodeURIComponent(visitPublicId)}/scribe_context`,
    );
    const next = responseProjection(result);
    if (
      next.patient_id !== patientId ||
      next.clinical_encounter_id !== clinicalEncounterId
    )
      throw new Error(
        "Scribe is not bound to this call's patient and clinical encounter.",
      );
    setCurrentProjection(next);
    return next;
  }, [clinicalEncounterId, patientId, setCurrentProjection, visitPublicId]);

  const loadEncounter = useCallback(async (encounterId: number) => {
    const result = await api<{ encounter: ScribeEncounter }>(
      `/api/clinic/scribe/encounters/${encounterId}`,
    );
    if (mountedRef.current) {
      setEncounter(result.encounter);
      setTemplateId((current) => current || result.encounter.template_id);
    }
    return result.encounter;
  }, []);

  const audioSource = useMemo<ScribeRecordingSessionInput["audioSource"]>(
    () => ({
      kind: "authorized_stream",
      label: "Call audio",
      acquire: async () => {
        const attachment = await attachScribeTracks({
          localAudioTrack,
          remoteAudioTracks,
        });
        return { stream: attachment.stream, release: attachment.detach };
      },
    }),
    [localAudioTrack, remoteAudioTracks],
  );

  const registerSession = useCallback(
    (
      current: ScribeProjection,
      authorization: CaptureAuthorization | undefined,
      startRecording: boolean,
      onSegmentFinalized: ScribeRecordingSessionInput["onSegmentFinalized"],
    ) => {
      if (!current.encounter_id || current.encounter_version === null)
        return false;
      return recording.begin(
        {
          encounterId: current.encounter_id,
          encounterVersion: current.encounter_version,
          processingAllowed: current.consent.state === "accepted",
          scopeKey: `telehealth:${visitPublicId}:${authorization?.captureEpoch ?? current.capture.epoch}:${authorization?.segmentIndex ?? 0}`,
          patientLabel: "Telehealth encounter",
          contextContent: current.context_content ?? "",
          presentation: "in_call",
          telehealthVisitPublicId: visitPublicId,
          audioSource,
          telehealthCapture: authorization,
          deferProcessing: true,
          onSegmentFinalized,
        },
        { startRecording },
      );
    },
    [audioSource, recording.begin, visitPublicId],
  );

  const mutateProjection = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      const result = await api<ScribeEnvelope>(
        `/api/clinic/telehealth/visits/${encodeURIComponent(visitPublicId)}/${path}`,
        { method: "POST", body },
      );
      const next = responseProjection(result);
      setCurrentProjection(next);
      return next;
    },
    [setCurrentProjection, visitPublicId],
  );

  const releaseCapture = useCallback(
    async (authorization: CaptureAuthorization) => {
      const current = projectionRef.current;
      if (!current) return;
      try {
        await mutateProjection("release_scribe_capture", {
          capture: {
            request_key: crypto.randomUUID(),
            expected_version: current.visit_version,
            capture_epoch: authorization.captureEpoch,
            owner_token: authorization.ownerToken,
          },
        });
      } catch (reason) {
        if (mountedRef.current)
          setError(
            errorMessage(
              reason,
              "Capture release is not confirmed. Reload Scribe before recording again.",
            ),
          );
      }
    },
    [mutateProjection],
  );

  const beginClaimedSegment = useCallback(
    async (current: ScribeProjection, authorization: CaptureAuthorization) => {
      const finalized = async (
        _recordingId: number,
        reason: "finished" | "limit",
      ) => {
        const intended =
          reason === "limit" ? "rollover" : desiredStopRef.current;
        if (intended === "rollover") {
          if (mountedRef.current)
            setNotice(
              "The prior segment reached its server limit. A new segment is starting; audio during this brief rollover gap is not captured.",
            );
          try {
            const latest = projectionRef.current ?? current;
            const renewed = await mutateProjection("renew_scribe_capture", {
              capture: {
                request_key: crypto.randomUUID(),
                expected_version: latest.visit_version,
                capture_epoch: authorization.captureEpoch,
                owner_token: authorization.ownerToken,
              },
            });
            const nextAuthorization: CaptureAuthorization = {
              ...authorization,
              segmentIndex: authorization.segmentIndex + 1,
              sourceOrder: authorization.sourceOrder + 1,
            };
            desiredStopRef.current = "rollover";
            const opened = registerSession(
              renewed,
              nextAuthorization,
              true,
              finalized,
            );
            if (!opened)
              throw new Error(
                "Another Scribe encounter is already using the recorder.",
              );
            return;
          } catch (reason) {
            if (mountedRef.current)
              setError(
                errorMessage(
                  reason,
                  "Scribe could not start the next recording segment. The saved segment remains available.",
                ),
              );
          }
        }
        await releaseCapture(authorization);
        if (mountedRef.current) {
          setReviewOpen(intended === "finish");
          setPendingAction(null);
        }
        const latest = projectionRef.current;
        if (latest?.encounter_id) await loadEncounter(latest.encounter_id);
      };

      const opened = registerSession(current, authorization, true, finalized);
      if (!opened)
        throw new Error(
          "Finish the other Scribe recording before starting this one.",
        );
    },
    [loadEncounter, mutateProjection, registerSession, releaseCapture],
  );

  const claimAndStart = useCallback(async () => {
    const current = projectionRef.current;
    if (!current || !current.encounter_id)
      throw new Error(
        "Request Scribe and bind its encounter before recording.",
      );
    if (callState !== "joined")
      throw new Error("Join the video visit before starting Scribe.");
    if (current.consent.state !== "accepted")
      throw new Error("Every active participant must allow Scribe first.");
    const next = await mutateProjection("start_scribe_capture", {
      capture: {
        request_key: crypto.randomUUID(),
        expected_version: current.visit_version,
        expected_capture_epoch: current.capture.epoch,
      },
    });
    if (!next.capture.owner_token || next.capture.owner_participant_id === null)
      throw new Error(
        "The capture lease did not return its one-use owner token.",
      );
    const authorization: CaptureAuthorization = {
      visitPublicId,
      captureOwnerParticipantId: next.capture.owner_participant_id,
      captureEpoch: next.capture.epoch,
      ownerToken: next.capture.owner_token,
      segmentIndex:
        Math.max(-1, ...next.recordings.map((item) => item.segment_index)) + 1,
      sourceOrder:
        Math.max(0, ...next.recordings.map((item) => item.source_order)) + 1,
    };
    desiredStopRef.current = "rollover";
    await beginClaimedSegment(next, authorization);
  }, [beginClaimedSegment, callState, mutateProjection, visitPublicId]);

  const takeOverAndStart = useCallback(async () => {
    const current = projectionRef.current;
    if (!current?.encounter_id || callState !== "joined")
      throw new Error("Join the bound visit before taking over Scribe.");
    const next = await mutateProjection("take_over_scribe_capture", {
      capture: {
        request_key: crypto.randomUUID(),
        expected_version: current.visit_version,
        expected_capture_epoch: current.capture.epoch,
      },
    });
    if (!next.capture.owner_token || next.capture.owner_participant_id === null)
      throw new Error(
        "The capture takeover did not return its one-use owner token.",
      );
    const authorization: CaptureAuthorization = {
      visitPublicId,
      captureOwnerParticipantId: next.capture.owner_participant_id,
      captureEpoch: next.capture.epoch,
      ownerToken: next.capture.owner_token,
      segmentIndex:
        Math.max(-1, ...next.recordings.map((item) => item.segment_index)) + 1,
      sourceOrder:
        Math.max(0, ...next.recordings.map((item) => item.source_order)) + 1,
    };
    desiredStopRef.current = "rollover";
    await beginClaimedSegment(next, authorization);
  }, [beginClaimedSegment, callState, mutateProjection, visitPublicId]);

  const runAction = useCallback(
    async (name: string, action: () => Promise<void>) => {
      if (pendingAction) return;
      setPendingAction(name);
      setError(null);
      setNotice(null);
      try {
        await action();
      } catch (reason) {
        setError(
          errorMessage(reason, "Scribe could not complete that action."),
        );
      } finally {
        if (mountedRef.current) setPendingAction(null);
      }
    },
    [pendingAction],
  );

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    void Promise.all([
      loadContext(),
      api<{ templates: ScribeTemplate[] }>("/api/clinic/scribe/templates"),
    ])
      .then(([current, templateResult]) => {
        if (!mountedRef.current) return;
        setTemplates(templateResult.templates);
        setTemplateId(
          current.template_id ||
            templateResult.templates.find(({ status }) => status === "active")
              ?.id ||
            "",
        );
        if (current.encounter_id) {
          registerSession(current, captureAuthorization, false, undefined);
          void loadEncounter(current.encounter_id);
        }
      })
      .catch((reason) =>
        setError(errorMessage(reason, "Scribe context could not be loaded.")),
      )
      .finally(() => mountedRef.current && setLoading(false));
    return () => {
      mountedRef.current = false;
    };
    // The persistent provider owns active capture across route unmounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitPublicId]);

  useEffect(() => {
    if (!projection?.encounter_id || !sessionMatches) return;
    recording.reconcile({
      encounterId: projection.encounter_id,
      encounterVersion: projection.encounter_version ?? 0,
      processingAllowed: projection.consent.state === "accepted",
      contextContent: projection.context_content ?? "",
      audioSource,
    });
  }, [audioSource, projection, recording.reconcile, sessionMatches]);

  useEffect(() => {
    if (callState === "joined" || !sessionMatches || !recording.state.active)
      return;
    desiredStopRef.current = "pause";
    recording.terminateTelehealthCapture(
      visitPublicId,
      "Call media ended; Scribe is saving the permitted audio segment.",
    );
  }, [
    callState,
    recording.state.active,
    recording.terminateTelehealthCapture,
    sessionMatches,
    visitPublicId,
  ]);

  useEffect(() => {
    const fingerprint = [
      localAudioTrack?.id ?? "none",
      ...remoteAudioTracks
        .filter(({ subscribed }) => subscribed)
        .map(({ participantId, track }) => `${participantId}:${track.id}`)
        .sort(),
    ].join("|");
    const previous = mediaFingerprintRef.current;
    mediaFingerprintRef.current = fingerprint;
    if (
      previous !== null &&
      previous !== fingerprint &&
      sessionMatches &&
      recording.state.active
    ) {
      desiredStopRef.current = "pause";
      recording.finish();
      setError(
        "Call participants or audio subscriptions changed. Scribe is saving the current segment; resume after consent is current.",
      );
      void loadContext().catch(() => undefined);
    }
  }, [
    loadContext,
    localAudioTrack,
    recording.finish,
    recording.state.active,
    remoteAudioTracks,
    sessionMatches,
  ]);

  useEffect(() => {
    if (!sessionMatches || !recording.state.active || !captureAuthorization)
      return;
    const timer = window.setInterval(() => {
      const current = projectionRef.current;
      if (!current) return;
      void mutateProjection("renew_scribe_capture", {
        capture: {
          request_key: crypto.randomUUID(),
          expected_version: current.visit_version,
          capture_epoch: captureAuthorization.captureEpoch,
          owner_token: captureAuthorization.ownerToken,
        },
      }).catch((reason) => {
        desiredStopRef.current = "pause";
        recording.terminateTelehealthCapture(visitPublicId);
        void loadContext().catch(() => undefined);
        if (mountedRef.current)
          setError(
            errorMessage(
              reason,
              "Scribe lost its capture lease. The current segment is being stopped.",
            ),
          );
      });
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [
    captureAuthorization,
    loadContext,
    mutateProjection,
    recording.state.active,
    recording.terminateTelehealthCapture,
    sessionMatches,
    visitPublicId,
  ]);

  const displayState = useMemo<ScribeInCallCaptureState>(() => {
    const ownedState = sessionMatches ? recording.state : null;
    let status: ScribeInCallCaptureState["status"] = "off";
    if (error) status = "error";
    else if (
      ownedState?.phase === "error" ||
      ownedState?.phase === "upload_error"
    )
      status = "error";
    else if (pendingAction === "generate") status = "processing";
    else if (encounter?.drafts?.length) status = "draft_ready";
    else if (ownedState?.phase === "recording") status = "recording";
    else if (ownedState?.phase === "stopping") status = "saving_audio";
    else if (ownedState?.phase === "completed") status = "paused";
    else if (
      projection?.consent.state === "pending" ||
      projection?.consent.state === "not_requested"
    )
      status = "awaiting_consent";
    return {
      status,
      active: Boolean(ownedState?.active),
      recordingId: ownedState?.recordingId ?? null,
    };
  }, [
    encounter?.drafts,
    error,
    pendingAction,
    projection?.consent.state,
    recording.state,
    sessionMatches,
  ]);

  useEffect(() => {
    onCaptureStateChange?.(displayState);
  }, [displayState, onCaptureStateChange]);

  const refreshReview = useCallback(async () => {
    const current = await loadContext();
    if (current.encounter_id) await loadEncounter(current.encounter_id);
  }, [loadContext, loadEncounter]);

  const generateDraft = useCallback(async () => {
    const current = projectionRef.current;
    if (!current?.encounter_id || current.encounter_version === null) return;
    for (const item of current.recordings
      .filter(({ status, source_id }) => status === "completed" && !source_id)
      .sort((left, right) => left.source_order - right.source_order)) {
      await api(`/api/clinic/scribe/recordings/${item.id}/transcribe`, {
        method: "POST",
        body: {
          telehealth_capture: {
            visit_public_id: visitPublicId,
            capture_epoch: current.capture.epoch,
          },
        },
      });
    }
    const refreshed = await loadContext();
    await api(
      `/api/clinic/scribe/encounters/${current.encounter_id}/generate`,
      {
        method: "POST",
        body: {
          generation: {
            template_id: templateId,
            expected_version: refreshed.encounter_version,
            source_ids: refreshed.sources.map(({ id }) => id),
            telehealth_visit_public_id: visitPublicId,
            capture_epoch: refreshed.capture.epoch,
          },
        },
      },
    );
    await refreshReview();
    setReviewOpen(true);
  }, [loadContext, refreshReview, templateId, visitPublicId]);

  const saveDraft = useCallback(
    async (
      draftId: number,
      sections: Record<ScribeDraftSection["section_key"], string>,
    ) => {
      const draft = encounter?.drafts.find(({ id }) => id === draftId);
      if (!draft) return;
      await api(`/api/clinic/scribe/drafts/${draftId}/sections`, {
        method: "POST",
        body: { revision: { expected_version: draft.version, sections } },
      });
      await refreshReview();
    },
    [encounter?.drafts, refreshReview],
  );

  const reviewSection = useCallback(
    async (
      draftId: number,
      sectionKey: ScribeDraftSection["section_key"],
      action: "accept" | "reject",
    ) => {
      const draft = encounter?.drafts.find(({ id }) => id === draftId);
      if (!draft) return;
      await api(`/api/clinic/scribe/drafts/${draftId}/review`, {
        method: "POST",
        body: {
          review: {
            action,
            section_key: sectionKey,
            expected_version: draft.version,
          },
        },
      });
      await refreshReview();
    },
    [encounter?.drafts, refreshReview],
  );

  if (loading)
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography role="status">Loading Scribe…</Typography>
      </Paper>
    );

  const active = sessionMatches && recording.state.active;
  const canStart = Boolean(
    projection?.allowed_actions.includes("start_capture") &&
    callState === "joined" &&
    (localAudioTrack ||
      remoteAudioTracks.some(
        ({ subscribed, track }) =>
          subscribed && track.kind === "audio" && track.readyState === "live",
      )),
  );
  const canAcknowledge = Boolean(
    projection?.allowed_actions.includes("record_own_consent"),
  );
  const hasSources = Boolean(projection?.sources.length);
  const hasProcessableRecordings = Boolean(
    projection?.recordings.some(({ status }) => status === "completed"),
  );

  return (
    <Paper
      component="section"
      aria-labelledby="telehealth-scribe-heading"
      variant="outlined"
      sx={{ minWidth: 0, overflow: "hidden" }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 1,
          alignItems: { sm: "center" },
          px: 1.5,
          py: 1,
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Typography
              id="telehealth-scribe-heading"
              variant="subtitle1"
              sx={{ fontWeight: 700 }}
            >
              Scribe & note
            </Typography>
            <Chip
              size="small"
              color={displayState.status === "recording" ? "error" : "default"}
              label={statusLabel(displayState.status)}
            />
          </Stack>
          <Typography
            variant="caption"
            color="text.secondary"
            aria-live="polite"
          >
            Captured{" "}
            {elapsedLabel(sessionMatches ? recording.state.elapsedMs : 0)}
          </Typography>
        </Box>
        <Stack
          direction="row"
          spacing={0.75}
          useFlexGap
          sx={{ flexWrap: "wrap" }}
        >
          {!projection?.encounter_id && (
            <Button
              variant="contained"
              startIcon={<FiberManualRecordOutlinedIcon />}
              disabled={pendingAction !== null}
              onClick={() =>
                void runAction("request", async () => {
                  const current = projectionRef.current;
                  if (!current) return;
                  const next = await mutateProjection("request_scribe", {
                    scribe: {
                      request_key: crypto.randomUUID(),
                      expected_version: current.visit_version,
                    },
                  });
                  registerSession(next, undefined, false, undefined);
                  if (next.encounter_id) await loadEncounter(next.encounter_id);
                })
              }
            >
              Start Scribe
            </Button>
          )}
          {projection?.encounter_id && !active && (
            <Button
              variant="contained"
              startIcon={<PlayArrowOutlinedIcon />}
              disabled={!canStart || pendingAction !== null}
              onClick={() => void runAction("start", claimAndStart)}
            >
              {recording.state.phase === "completed"
                ? "Resume"
                : "Start recording"}
            </Button>
          )}
          {!active &&
            projection?.allowed_actions.includes("take_over_capture") && (
              <Button
                color="warning"
                variant="outlined"
                disabled={pendingAction !== null || callState !== "joined"}
                onClick={() => void runAction("takeover", takeOverAndStart)}
              >
                Take over recording
              </Button>
            )}
          {active && (
            <>
              <Button
                variant="outlined"
                startIcon={<PauseOutlinedIcon />}
                onClick={() => {
                  desiredStopRef.current = "pause";
                  setPendingAction("pause");
                  recording.finish();
                }}
              >
                Pause
              </Button>
              <Button
                color="error"
                variant="contained"
                startIcon={<StopOutlinedIcon />}
                onClick={() => {
                  desiredStopRef.current = "finish";
                  setPendingAction("finish");
                  recording.finish();
                }}
              >
                Finish recording
              </Button>
            </>
          )}
        </Stack>
      </Stack>

      <Stack spacing={1.5} sx={{ p: 1.5 }}>
        {error && <Alert severity="error">{error}</Alert>}
        {notice && <Alert severity="info">{notice}</Alert>}
        {projection?.consent.state !== "accepted" &&
          projection?.encounter_id && (
            <Alert
              severity={
                projection.consent.state === "declined" ? "warning" : "info"
              }
              action={
                canAcknowledge ? (
                  <Button
                    color="inherit"
                    size="small"
                    disabled={pendingAction !== null}
                    onClick={() =>
                      void runAction("consent", async () => {
                        const current = projectionRef.current;
                        if (!current) return;
                        await mutateProjection("scribe_consent", {
                          consent: {
                            decision: "accepted",
                            request_key: crypto.randomUUID(),
                            expected_version: current.visit_version,
                          },
                        });
                      })
                    }
                  >
                    Acknowledge recording
                  </Button>
                ) : undefined
              }
            >
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {projection.recording_policy.title}
              </Typography>
              <Typography variant="body2">
                {projection.recording_policy.body}
              </Typography>
              <Typography variant="body2">
                Recording starts only after every active participant separately
                allows Scribe. The video visit can continue without it.
              </Typography>
            </Alert>
          )}

        {projection?.consent.required_participants.length ? (
          <Stack
            direction="row"
            spacing={0.75}
            useFlexGap
            sx={{ flexWrap: "wrap" }}
          >
            {projection.consent.required_participants.map((participant) => (
              <Chip
                key={participant.participant_id}
                size="small"
                variant="outlined"
                label={`${participant.display_name || participant.role || "Participant"}: ${participant.status}`}
              />
            ))}
          </Stack>
        ) : null}

        {projection?.capture.owner_participant_id && !active && (
          <Alert severity="info">
            Recording is currently owned by{" "}
            {projection.capture.owner_display_name ||
              "another staff participant"}
            .
          </Alert>
        )}

        {projection?.encounter_id && (
          <>
            <FormControl size="small" fullWidth>
              <InputLabel id="telehealth-scribe-template-label">
                Template
              </InputLabel>
              <Select
                labelId="telehealth-scribe-template-label"
                label="Template"
                value={templateId}
                disabled={active || pendingAction !== null}
                onChange={(event) => setTemplateId(event.target.value)}
              >
                {templates.map((template) => (
                  <MenuItem
                    key={`${template.id}:${template.version}`}
                    value={template.id}
                    disabled={template.status !== "active"}
                  >
                    {template.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Typed context"
              multiline
              minRows={3}
              maxRows={8}
              value={
                sessionMatches
                  ? recording.contextValue
                  : (projection.context_content ?? "")
              }
              disabled={!sessionMatches || recording.contextSaving}
              onChange={(event) =>
                recording.setContextValue(event.target.value)
              }
              helperText={
                recording.contextSaving
                  ? "Saving context…"
                  : recording.contextDirty
                    ? "Unsaved context"
                    : "Context saved"
              }
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <Button
                variant={recording.contextDirty ? "contained" : "outlined"}
                disabled={
                  !sessionMatches ||
                  !recording.contextDirty ||
                  recording.contextSaving
                }
                onClick={() => void recording.saveContext()}
              >
                Save context
              </Button>
              <Button
                variant="outlined"
                startIcon={<ArticleOutlinedIcon />}
                disabled={
                  active ||
                  (!hasSources &&
                    !hasProcessableRecordings &&
                    !encounter?.drafts.length)
                }
                onClick={() => setReviewOpen(true)}
              >
                Finish & review
              </Button>
              <Button
                variant="contained"
                disabled={
                  active ||
                  (!hasSources && !hasProcessableRecordings) ||
                  !templateId ||
                  pendingAction !== null
                }
                onClick={() => void runAction("generate", generateDraft)}
              >
                Generate draft
              </Button>
            </Stack>
          </>
        )}

        {reviewOpen && (
          <Box sx={{ minHeight: 480 }}>
            <ScribeReviewWorkspace
              state={
                encounter ? { kind: "ready", encounter } : { kind: "loading" }
              }
              onRetry={() => void refreshReview()}
              pendingAction={pendingAction}
              onSaveDraft={(draftId, sections) =>
                runAction("review:all", () => saveDraft(draftId, sections))
              }
              onAcceptSection={(draftId, sectionKey) =>
                runAction("review:accept", () =>
                  reviewSection(draftId, sectionKey, "accept"),
                )
              }
              onRejectSection={(draftId, sectionKey) =>
                runAction("review:reject", () =>
                  reviewSection(draftId, sectionKey, "reject"),
                )
              }
              onApprove={(draftId) =>
                void runAction("approve", async () => {
                  const draft = encounter?.drafts.find(
                    ({ id }) => id === draftId,
                  );
                  if (!draft) return;
                  await api(`/api/clinic/scribe/drafts/${draftId}/approve`, {
                    method: "POST",
                    body: { expected_version: draft.version },
                  });
                  await refreshReview();
                })
              }
              onExport={(draftId) => {
                const draft = encounter?.drafts.find(
                  ({ id }) => id === draftId,
                );
                if (draft) setConfirmExport(draft);
              }}
              exportLabel="Apply to encounter"
            />
          </Box>
        )}
      </Stack>

      <Dialog
        open={Boolean(confirmExport)}
        onClose={() => setConfirmExport(null)}
      >
        <DialogTitle>Apply reviewed note to this encounter?</DialogTitle>
        <DialogContent>
          This writes the approved revision to the exact bound clinical
          encounter as an unsigned note. Signing remains separate.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmExport(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              const draft = confirmExport;
              setConfirmExport(null);
              if (!draft) return;
              void runAction("export", async () => {
                await api(`/api/clinic/scribe/drafts/${draft.id}/export`, {
                  method: "POST",
                  body: {
                    export: {
                      destination: "parent_record_adapter",
                      idempotency_key: crypto.randomUUID(),
                      confirmed: true,
                      expected_version: draft.version,
                    },
                  },
                });
                await refreshReview();
              });
            }}
          >
            Apply to encounter
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

export type { ScribeRemoteAudioTrack } from "./ScribeAudioBridge";
