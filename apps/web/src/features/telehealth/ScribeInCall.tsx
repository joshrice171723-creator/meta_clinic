import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import FiberManualRecordOutlinedIcon from "@mui/icons-material/FiberManualRecordOutlined";
import PauseOutlinedIcon from "@mui/icons-material/PauseOutlined";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import StopOutlinedIcon from "@mui/icons-material/StopOutlined";
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
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Step,
  StepLabel,
  Stepper,
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

function statusDescription(state: ScribeInCallCaptureState["status"]) {
  return {
    off: "Scribe is available for this visit.",
    awaiting_consent: "Waiting for separate recording permission.",
    recording: "Call audio is being captured for this visit.",
    paused: "The last audio segment is saved.",
    saving_audio: "The current segment is being secured.",
    processing: "Preparing the transcript and draft.",
    draft_ready: "A draft is ready for clinical review.",
    error: "Scribe needs attention before continuing.",
  }[state];
}

function consentStateLabel(state: ScribeProjection["consent"]["state"]) {
  return {
    not_requested: "Not requested",
    pending: "Waiting",
    accepted: "Allowed",
    declined: "Declined",
    withdrawn: "Withdrawn",
  }[state];
}

function participantStatusLabel(status: ConsentParticipant["status"]) {
  return {
    accepted: "Allowed",
    declined: "Declined",
    withdrawn: "Withdrawn",
    pending: "Waiting",
  }[status];
}

function elapsedLabel(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function durationLimitLabel(milliseconds: number) {
  const minutes = Math.max(1, Math.floor(milliseconds / 60_000));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function byteLimitLabel(bytes: number) {
  const mebibytes = Math.max(1, Math.floor(bytes / (1024 * 1024)));
  return `${mebibytes} MiB`;
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
  const [reloadToken, setReloadToken] = useState(0);
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
      const input: ScribeRecordingSessionInput = {
        encounterId: current.encounter_id,
        encounterVersion: current.encounter_version,
        processingAllowed: current.consent.state === "accepted",
        scopeKey: `telehealth:${visitPublicId}:${authorization?.captureEpoch ?? current.capture.epoch}:${authorization?.segmentIndex ?? 0}`,
        patientLabel: "Telehealth encounter",
        contextContent: current.context_content ?? "",
        presentation: "in_call",
        telehealthVisitPublicId: visitPublicId,
        audioSource,
        deferProcessing: true,
        ...(authorization ? { telehealthCapture: authorization } : {}),
        ...(onSegmentFinalized ? { onSegmentFinalized } : {}),
      };
      return recording.begin(input, { startRecording });
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

  const recordOwnConsent = useCallback(
    async (decision: "accepted" | "declined" | "withdrawn") => {
      const current = projectionRef.current;
      if (!current) return;
      await mutateProjection("scribe_consent", {
        consent: {
          decision,
          request_key: crypto.randomUUID(),
          expected_version: current.visit_version,
        },
      });
      setNotice(
        decision === "accepted"
          ? "Your recording permission is saved."
          : decision === "declined"
            ? "Your choice is saved. The video visit can continue without Scribe recording."
            : "Your recording permission was withdrawn. Any active capture is being stopped.",
      );
    },
    [mutateProjection],
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
      const openSegment = async (
        segmentProjection: ScribeProjection,
        segmentAuthorization: CaptureAuthorization,
      ): Promise<void> => {
        const finalized: NonNullable<
          ScribeRecordingSessionInput["onSegmentFinalized"]
        > = async (_recordingId, reason) => {
          const intended =
            reason === "limit" ? "rollover" : desiredStopRef.current;
          if (intended === "rollover") {
            if (mountedRef.current)
              setNotice(
                "The prior segment reached its server limit. A new segment is starting; audio during this brief rollover gap is not captured.",
              );
            try {
              const latest = projectionRef.current ?? segmentProjection;
              const renewed = await mutateProjection("renew_scribe_capture", {
                capture: {
                  request_key: crypto.randomUUID(),
                  expected_version: latest.visit_version,
                  capture_epoch: segmentAuthorization.captureEpoch,
                  owner_token: segmentAuthorization.ownerToken,
                },
              });
              const nextAuthorization: CaptureAuthorization = {
                ...segmentAuthorization,
                segmentIndex: segmentAuthorization.segmentIndex + 1,
                sourceOrder: segmentAuthorization.sourceOrder + 1,
              };
              desiredStopRef.current = "rollover";
              await openSegment(renewed, nextAuthorization);
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
          await releaseCapture(segmentAuthorization);
          if (mountedRef.current) {
            setReviewOpen(intended === "finish");
            setPendingAction(null);
            if (intended === "finish")
              setNotice(
                "Recording saved. Generate the draft to begin clinical review.",
              );
            else if (intended === "pause")
              setNotice(
                "Recording paused. The saved segment is ready when you resume or generate a draft.",
              );
          }
          const latest = projectionRef.current;
          if (latest?.encounter_id) await loadEncounter(latest.encounter_id);
        };

        const opened = registerSession(
          segmentProjection,
          segmentAuthorization,
          true,
          finalized,
        );
        if (!opened)
          throw new Error(
            "Finish the other Scribe recording before starting this one.",
          );
      };

      await openSegment(current, authorization);
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
    setError(null);
    void Promise.all([
      loadContext(),
      api<{ templates: ScribeTemplate[] }>("/api/clinic/scribe/templates"),
    ])
      .then(async ([current, templateResult]) => {
        if (!mountedRef.current) return;
        setTemplates(templateResult.templates);
        setTemplateId(
          current.template_id ||
            templateResult.templates.find(({ status }) => status === "active")
              ?.id ||
            "",
        );
        if (current.encounter_id) {
          const opened = registerSession(
            current,
            captureAuthorization,
            false,
            undefined,
          );
          if (!opened)
            throw new Error(
              "Finish the other Scribe session before opening this visit’s Scribe context.",
            );
          await loadEncounter(current.encounter_id);
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
  }, [visitPublicId, reloadToken]);

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
    else if (ownedState?.phase === "recording") status = "recording";
    else if (ownedState?.phase === "stopping") status = "saving_audio";
    else if (pendingAction === "generate") status = "processing";
    else if (encounter?.drafts?.length) status = "draft_ready";
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

  const finishAndReview = useCallback(async () => {
    if (pendingAction) return;
    setPendingAction("finish");
    setError(null);
    setNotice(null);
    const saved = await recording.saveContext();
    if (!saved) {
      if (mountedRef.current) setPendingAction(null);
      return;
    }
    desiredStopRef.current = "finish";
    recording.finish();
  }, [pendingAction, recording.finish, recording.saveContext]);

  const generateDraft = useCallback(async () => {
    const current = projectionRef.current;
    if (!current?.encounter_id || current.encounter_version === null) return;
    const saved = await recording.saveContext();
    if (!saved)
      throw new Error(
        "Save or resolve the visit context before generating the draft.",
      );
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
    setNotice(
      "Draft generated. Review every section before approval and export.",
    );
  }, [
    loadContext,
    recording.saveContext,
    refreshReview,
    templateId,
    visitPublicId,
  ]);

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
      <Paper variant="outlined" sx={{ overflow: "hidden" }}>
        <LinearProgress />
        <Stack spacing={0.5} role="status" aria-live="polite" sx={{ p: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Loading Scribe
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Checking this visit’s recording permission and note context…
          </Typography>
        </Stack>
      </Paper>
    );

  if (!projection)
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Alert
          severity="error"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => setReloadToken((value) => value + 1)}
            >
              Retry
            </Button>
          }
        >
          {error ?? "Scribe context could not be loaded for this visit."}
        </Alert>
      </Paper>
    );

  const active = sessionMatches && recording.state.active;
  const liveAudioSourceCount = new Set(
    [
      localAudioTrack,
      ...remoteAudioTracks
        .filter(({ subscribed }) => subscribed)
        .map(({ track }) => track),
    ]
      .filter((track): track is MediaStreamTrack =>
        Boolean(track && track.kind === "audio" && track.readyState === "live"),
      )
      .map(({ id }) => id),
  ).size;
  const canStart = Boolean(
    projection?.allowed_actions.includes("start_capture") &&
    callState === "joined" &&
    liveAudioSourceCount > 0,
  );
  const canAcknowledge = Boolean(
    projection?.allowed_actions.includes("record_own_consent"),
  );
  const hasSources = Boolean(projection?.sources.length);
  const hasProcessableRecordings = Boolean(
    projection?.recordings.some(({ status }) => status === "completed"),
  );
  const hasDraft = Boolean(encounter?.drafts.length);
  const hasExportedDraft = Boolean(
    encounter?.drafts.some(({ status }) => status === "exported"),
  );
  const workflowStep = !projection?.encounter_id
    ? 0
    : projection.consent.state !== "accepted"
      ? 0
      : hasDraft
        ? 2
        : 1;

  return (
    <Paper
      component="section"
      aria-labelledby="telehealth-scribe-heading"
      variant="outlined"
      sx={{ minWidth: 0, overflow: "hidden", borderRadius: 2 }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.5}
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 2,
          alignItems: { sm: "center" },
          px: { xs: 1.5, md: 2 },
          py: 1.5,
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{ alignItems: "center", flexWrap: "wrap" }}
          >
            <Typography
              id="telehealth-scribe-heading"
              component="h2"
              variant="subtitle1"
            >
              In-call Scribe
            </Typography>
            <Chip
              size="small"
              color={
                displayState.status === "error"
                  ? "error"
                  : displayState.status === "recording"
                    ? "warning"
                    : displayState.status === "draft_ready"
                      ? "success"
                      : "default"
              }
              variant={
                displayState.status === "recording" ||
                displayState.status === "draft_ready"
                  ? "filled"
                  : "outlined"
              }
              label={statusLabel(displayState.status)}
            />
          </Stack>
          <Typography
            variant="body2"
            color="text.secondary"
            aria-live="polite"
            sx={{ mt: 0.25 }}
          >
            {statusDescription(displayState.status)} Current segment{" "}
            <Box
              component="span"
              sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}
            >
              {elapsedLabel(sessionMatches ? recording.state.elapsedMs : 0)}
            </Box>
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
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
                  const opened = registerSession(
                    next,
                    undefined,
                    false,
                    undefined,
                  );
                  if (!opened)
                    throw new Error(
                      "Finish the other Scribe session before opening this visit’s Scribe context.",
                    );
                  if (next.encounter_id) await loadEncounter(next.encounter_id);
                  setNotice(
                    "Recording permission requested. Each active participant must respond separately.",
                  );
                })
              }
            >
              {pendingAction === "request"
                ? "Requesting…"
                : "Request recording permission"}
            </Button>
          )}
          {projection?.encounter_id && !active && (
            <Button
              variant="contained"
              startIcon={<PlayArrowOutlinedIcon />}
              disabled={!canStart || pendingAction !== null}
              onClick={() => void runAction("start", claimAndStart)}
            >
              {pendingAction === "start"
                ? "Starting…"
                : recording.state.phase === "completed"
                  ? "Resume recording"
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
                disabled={pendingAction !== null}
                onClick={() => {
                  desiredStopRef.current = "pause";
                  setPendingAction("pause");
                  recording.finish();
                }}
              >
                Pause
              </Button>
              <Button
                variant="contained"
                startIcon={<StopOutlinedIcon />}
                disabled={pendingAction !== null}
                onClick={() => void finishAndReview()}
              >
                {pendingAction === "finish" ? "Saving…" : "Finish & review"}
              </Button>
            </>
          )}
        </Stack>
      </Stack>

      {pendingAction !== null && <LinearProgress aria-label="Scribe working" />}

      <Stack spacing={2} sx={{ p: { xs: 1.5, md: 2 } }}>
        {error && (
          <Alert
            severity="error"
            action={
              <Button
                color="inherit"
                size="small"
                disabled={pendingAction !== null}
                onClick={() =>
                  void runAction("reload", async () => {
                    await refreshReview();
                  })
                }
              >
                Reload status
              </Button>
            }
          >
            {error}
          </Alert>
        )}
        {notice && <Alert severity="info">{notice}</Alert>}

        <Stepper
          activeStep={workflowStep}
          sx={{
            maxWidth: 680,
            width: "100%",
            "& .MuiStepLabel-label": { typography: "body2" },
          }}
        >
          <Step completed={projection.consent.state === "accepted"}>
            <StepLabel>Permission</StepLabel>
          </Step>
          <Step completed={hasSources || hasProcessableRecordings || hasDraft}>
            <StepLabel>Capture</StepLabel>
          </Step>
          <Step completed={hasExportedDraft}>
            <StepLabel>Review</StepLabel>
          </Step>
        </Stepper>

        <Stack spacing={1}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{ alignItems: { sm: "center" } }}
          >
            <Box sx={{ flex: 1 }}>
              <Typography component="h3" variant="subtitle2">
                Recording permission
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Optional Scribe recording is separate from consent for the video
                visit.
              </Typography>
            </Box>
            <Chip
              size="small"
              variant="outlined"
              color={
                projection.consent.state === "accepted"
                  ? "success"
                  : projection.consent.state === "declined" ||
                      projection.consent.state === "withdrawn"
                    ? "warning"
                    : "default"
              }
              label={consentStateLabel(projection.consent.state)}
            />
          </Stack>

          {projection.consent.state === "accepted" ? (
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              sx={{ alignItems: { sm: "center" } }}
            >
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: "center", flex: 1 }}
              >
                <CheckCircleOutlineOutlinedIcon
                  color="success"
                  fontSize="small"
                />
                <Typography variant="body2">
                  Every active participant currently allows Scribe recording.
                </Typography>
              </Stack>
              {canAcknowledge && (
                <Button
                  color="warning"
                  size="small"
                  disabled={pendingAction !== null}
                  onClick={() =>
                    void runAction("consent", () =>
                      recordOwnConsent("withdrawn"),
                    )
                  }
                >
                  Withdraw my permission
                </Button>
              )}
            </Stack>
          ) : projection.encounter_id ? (
            <Alert
              severity={
                projection.consent.state === "declined" ||
                projection.consent.state === "withdrawn"
                  ? "warning"
                  : "info"
              }
              action={
                canAcknowledge ? (
                  <Stack direction="row" spacing={0.5}>
                    <Button
                      color="inherit"
                      size="small"
                      disabled={pendingAction !== null}
                      onClick={() =>
                        void runAction("consent", () =>
                          recordOwnConsent("declined"),
                        )
                      }
                    >
                      Decline
                    </Button>
                    <Button
                      color="inherit"
                      size="small"
                      variant="outlined"
                      disabled={pendingAction !== null}
                      onClick={() =>
                        void runAction("consent", () =>
                          recordOwnConsent("accepted"),
                        )
                      }
                    >
                      Allow recording
                    </Button>
                  </Stack>
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
                Recording starts after every active participant separately
                allows Scribe. The video visit can continue without recording.
              </Typography>
            </Alert>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Request recording permission to begin. No call audio is captured
              while Scribe is off.
            </Typography>
          )}

          {projection.consent.required_participants.length ? (
            <Stack
              direction="row"
              spacing={0.75}
              useFlexGap
              sx={{ flexWrap: "wrap" }}
              aria-label="Participant recording permissions"
            >
              {projection.consent.required_participants.map((participant) => (
                <Chip
                  key={participant.participant_id}
                  size="small"
                  variant="outlined"
                  color={
                    participant.status === "accepted"
                      ? "success"
                      : participant.status === "declined" ||
                          participant.status === "withdrawn"
                        ? "warning"
                        : "default"
                  }
                  label={`${participant.display_name || participant.role || "Participant"}: ${participantStatusLabel(participant.status)}`}
                />
              ))}
            </Stack>
          ) : null}
        </Stack>

        {projection.encounter_id && (
          <>
            <Divider />
            <Stack spacing={1}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                sx={{ alignItems: { sm: "center" } }}
              >
                <Box sx={{ flex: 1 }}>
                  <Typography component="h3" variant="subtitle2">
                    Call capture
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {liveAudioSourceCount > 0
                      ? `${liveAudioSourceCount} live call audio ${liveAudioSourceCount === 1 ? "track" : "tracks"} available.`
                      : "No live call audio is available."}{" "}
                    Scribe uses the call’s connected audio and does not open a
                    second microphone.
                  </Typography>
                </Box>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {durationLimitLabel(projection.limits.max_duration_ms)} ·{" "}
                  {byteLimitLabel(projection.limits.max_total_bytes)} ·{" "}
                  {projection.limits.max_chunks} chunks per segment
                </Typography>
              </Stack>

              {callState !== "joined" && (
                <Alert severity="info">
                  Join the video visit before starting Scribe recording.
                </Alert>
              )}
              {callState === "joined" && liveAudioSourceCount === 0 && (
                <Alert severity="warning">
                  Connect at least one live call audio track before starting
                  Scribe.
                </Alert>
              )}
              {projection.capture.owner_participant_id && !active && (
                <Alert severity="info">
                  {projection.capture.owner_display_name ||
                    "Another staff participant"}{" "}
                  currently owns recording. One active capture lease prevents
                  duplicate recordings.
                </Alert>
              )}
              {active && (
                <Typography variant="body2" aria-live="polite">
                  Recording this visit’s connected call audio. Pause saves this
                  segment; Finish & review saves context and opens the review
                  step.
                </Typography>
              )}
            </Stack>
          </>
        )}

        {projection.encounter_id && (
          <>
            <Divider />
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Visit context
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Add details the transcript may not contain. Saved context stays
                with this exact Scribe encounter.
              </Typography>
            </Box>
            <TextField
              label="Visit context"
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
              placeholder="Reason for visit, relevant history, observations, and documentation context"
              helperText={
                recording.contextSaving
                  ? "Saving context…"
                  : recording.contextDirty
                    ? "Unsaved context"
                    : "Context saved"
              }
            />
            {recording.contextError && (
              <Alert severity="warning">{recording.contextError}</Alert>
            )}
            {recording.latestSavedContext !== null && (
              <Stack spacing={1}>
                <TextField
                  label="Latest saved context"
                  value={recording.latestSavedContext}
                  multiline
                  minRows={2}
                  slotProps={{ input: { readOnly: true } }}
                />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  <Button onClick={recording.useLatestSavedContext}>
                    Use latest saved
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={recording.keepTypedContext}
                  >
                    Keep my typed context
                  </Button>
                </Stack>
              </Stack>
            )}
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              sx={{ alignItems: { sm: "center" } }}
            >
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
              <Typography variant="body2" color="text.secondary">
                Unsaved context is preserved if a save cannot be confirmed.
              </Typography>
            </Stack>

            <Divider />
            <Stack spacing={1.25}>
              <Box>
                <Typography component="h3" variant="subtitle2">
                  Draft and review
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Generate a draft from saved segments and context, then review
                  every section before applying it to the encounter.
                </Typography>
              </Box>
              <FormControl size="small" sx={{ maxWidth: 360 }}>
                <InputLabel id="telehealth-scribe-template-label">
                  Note template
                </InputLabel>
                <Select
                  labelId="telehealth-scribe-template-label"
                  label="Note template"
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
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                useFlexGap
                sx={{ flexWrap: "wrap" }}
              >
                <Button
                  variant="contained"
                  startIcon={
                    pendingAction === "generate" ? (
                      <CircularProgress size={16} color="inherit" />
                    ) : (
                      <ArticleOutlinedIcon />
                    )
                  }
                  disabled={
                    active ||
                    (!hasSources && !hasProcessableRecordings) ||
                    !templateId ||
                    pendingAction !== null
                  }
                  onClick={() => void runAction("generate", generateDraft)}
                >
                  {pendingAction === "generate"
                    ? "Generating…"
                    : hasDraft
                      ? "Generate new draft"
                      : "Generate draft"}
                </Button>
                <Button
                  variant="outlined"
                  disabled={!hasDraft || active || pendingAction !== null}
                  onClick={() => setReviewOpen(true)}
                >
                  Open draft review
                </Button>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {hasDraft
                  ? "A draft is available. Generated content remains unapproved until every required section is reviewed."
                  : hasSources || hasProcessableRecordings
                    ? "Saved audio is ready. Generating first transcribes any unprocessed segments in source order."
                    : "Record and save call audio before generating a draft."}
              </Typography>
            </Stack>
          </>
        )}

        {reviewOpen && (
          <Box sx={{ borderTop: 1, borderColor: "divider", pt: 2 }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              sx={{
                alignItems: { sm: "center" },
                justifyContent: "space-between",
              }}
            >
              <Box>
                <Typography component="h3" variant="subtitle1">
                  Clinical review
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Review generated content against the visit and source audio.
                </Typography>
              </Box>
              <Button size="small" onClick={() => setReviewOpen(false)}>
                Hide review
              </Button>
            </Stack>
            {hasDraft ? (
              <Box sx={{ minHeight: 480, mt: 1.5 }}>
                <ScribeReviewWorkspace
                  state={
                    encounter
                      ? { kind: "ready", encounter }
                      : { kind: "loading" }
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
                      await api(
                        `/api/clinic/scribe/drafts/${draftId}/approve`,
                        {
                          method: "POST",
                          body: { expected_version: draft.version },
                        },
                      );
                      await refreshReview();
                      setNotice(
                        "Draft approved. Apply it to this encounter when ready.",
                      );
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
            ) : (
              <Alert
                severity="info"
                sx={{ mt: 1.5 }}
                action={
                  <Button
                    color="inherit"
                    size="small"
                    disabled={
                      (!hasSources && !hasProcessableRecordings) ||
                      !templateId ||
                      pendingAction !== null
                    }
                    onClick={() => void runAction("generate", generateDraft)}
                  >
                    Generate draft
                  </Button>
                }
              >
                The recording segment is saved. Generate a draft to begin
                section-by-section review.
              </Alert>
            )}
          </Box>
        )}
      </Stack>

      <Dialog
        open={Boolean(confirmExport)}
        onClose={() => {
          if (pendingAction !== "export") setConfirmExport(null);
        }}
        aria-describedby="telehealth-scribe-export-description"
      >
        <DialogTitle>Apply reviewed note to this encounter?</DialogTitle>
        <DialogContent id="telehealth-scribe-export-description">
          <Typography variant="body2">
            This writes the approved revision to this visit’s exact bound
            clinical encounter as an unsigned note. Signing remains a separate
            clinical action.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            disabled={pendingAction === "export"}
            onClick={() => setConfirmExport(null)}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={pendingAction === "export"}
            startIcon={
              pendingAction === "export" ? (
                <CircularProgress size={16} color="inherit" />
              ) : undefined
            }
            onClick={() => {
              const draft = confirmExport;
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
                setConfirmExport(null);
                setNotice(
                  "Reviewed note applied to this encounter as an unsigned note.",
                );
              });
            }}
          >
            {pendingAction === "export" ? "Applying…" : "Apply to encounter"}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

export type { ScribeRemoteAudioTrack } from "./ScribeAudioBridge";
