import {
  Alert,
  Box,
  Button,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import FiberManualRecordOutlinedIcon from "@mui/icons-material/FiberManualRecordOutlined";
import PauseOutlinedIcon from "@mui/icons-material/PauseOutlined";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import ReplayOutlinedIcon from "@mui/icons-material/ReplayOutlined";
import StopOutlinedIcon from "@mui/icons-material/StopOutlined";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api/client";

export type ScribeRecordingPhase =
  | "idle"
  | "requesting_permission"
  | "recording"
  | "paused"
  | "stopping"
  | "upload_error"
  | "completed"
  | "error";

export type ScribeRecordingState = {
  active: boolean;
  phase: ScribeRecordingPhase;
  recordingId: number | null;
  elapsedMs: number;
  pendingChunks: number;
  inputLevel: number;
};

export type ScribeRecordingControlsProps = {
  encounterId: number;
  encounterVersion: number;
  processingAllowed: boolean;
  scopeKey: string;
  onRecordingStateChange?: (state: ScribeRecordingState) => void;
  startRequestToken?: number;
  finishRequestToken?: number;
  discardRequestToken?: number;
  onFinishRequest?: () => void;
  onDiscardRequest?: () => void;
  onCompleted?: (recordingId: number) => void;
  onCancelled?: () => void;
  embedded?: boolean;
  compact?: boolean;
};

type RecordingStatus = "recording" | "interrupted" | "completed" | "cancelled";
type Recording = {
  id: number;
  encounter_id: number;
  status: RecordingStatus;
  mime_type: string;
  total_bytes: number;
  acknowledged_chunks: number;
  total_chunks: number | null;
  duration_ms: number | null;
  created_at: string;
  recoverable: boolean;
  owned_by_current_user: boolean;
};
type Limits = {
  max_chunk_bytes: number;
  max_total_bytes: number;
  max_duration_ms: number;
  max_chunks: number;
  chunk_interval_ms: number;
};
type TranscriptionStatus =
  "not_started" | "unavailable" | "processing" | "ready" | "failed";
type Transcription = {
  status: TranscriptionStatus;
  message: string;
  source_id?: number;
  draft_id?: number;
  code?: string;
};
type RecordingResponse = {
  recording: Recording;
  limits: Limits;
  transcription: Transcription;
};
type RecordingListResponse = {
  recordings: Recording[];
  limits: Limits;
  transcription: Transcription;
};
type ChunkResponse = RecordingResponse & {
  chunk: {
    sequence: number;
    digest: string;
    byte_size: number;
    status: "acknowledged";
  };
  next_sequence: number;
};
type PendingChunk = { sequence: number; content: string; digest: string };
type StopMode = "complete" | "interrupt" | "discard";

const DEFAULT_LIMITS: Limits = {
  max_chunk_bytes: 512 * 1024,
  max_total_bytes: 30 * 1024 * 1024,
  max_duration_ms: 30 * 60 * 1000,
  max_chunks: 500,
  chunk_interval_ms: 4_000,
};
const MAX_PENDING_CHUNKS = 8;
const activePhases = new Set<ScribeRecordingPhase>([
  "requesting_permission",
  "recording",
  "paused",
  "stopping",
  "upload_error",
]);

export function scribeRecordingBlocksNavigation(phase: ScribeRecordingPhase) {
  return activePhases.has(phase);
}

function displayElapsed(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function supportedMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  return (
    candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ??
    ""
  );
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const step = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += step) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + step));
  }
  return btoa(binary);
}

async function pendingChunk(
  blob: Blob,
  sequence: number,
  maxBytes: number,
): Promise<PendingChunk> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.byteLength > maxBytes)
    throw new Error(
      "The browser produced an audio chunk larger than the server accepts.",
    );
  if (bytes.byteLength === 0)
    throw new Error("The browser produced an empty audio chunk.");
  const digestBytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", bytes),
  );
  const digest = Array.from(digestBytes, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  return { sequence, content: bytesToBase64(bytes), digest };
}

export function ScribeRecordingControls({
  encounterId,
  encounterVersion,
  processingAllowed,
  scopeKey,
  onRecordingStateChange,
  startRequestToken = 0,
  finishRequestToken = 0,
  discardRequestToken = 0,
  onFinishRequest,
  onDiscardRequest,
  onCompleted,
  onCancelled,
  embedded = false,
  compact = false,
}: ScribeRecordingControlsProps) {
  const [phase, setPhase] = useState<ScribeRecordingPhase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [meter, setMeter] = useState(0);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<Transcription | null>(
    null,
  );
  const [unfinished, setUnfinished] = useState<Recording[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [recordingId, setRecordingId] = useState<number | null>(null);

  const mountedRef = useRef(true);
  const phaseRef = useRef<ScribeRecordingPhase>("idle");
  const recordingRef = useRef<Recording | null>(null);
  const limitsRef = useRef(DEFAULT_LIMITS);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const lastMeterUpdateRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const activeStartedAtRef = useRef<number | null>(null);
  const accruedMsRef = useRef(0);
  const pendingRef = useRef<PendingChunk[]>([]);
  const nextSequenceRef = useRef(0);
  const uploadPromiseRef = useRef<Promise<boolean> | null>(null);
  const uploadFailedRef = useRef(false);
  const dataTasksRef = useRef(Promise.resolve());
  const stopModeRef = useRef<StopMode>("interrupt");
  const startAttemptRef = useRef(0);
  const loadGenerationRef = useRef(0);
  const stateChangeRef = useRef(onRecordingStateChange);
  const completedRef = useRef(onCompleted);
  const cancelledRef = useRef(onCancelled);
  const finishRequestRef = useRef(onFinishRequest);
  const lastStartTokenRef = useRef(0);
  const lastFinishTokenRef = useRef(0);
  const lastDiscardTokenRef = useRef(0);

  const updatePhase = useCallback((next: ScribeRecordingPhase) => {
    phaseRef.current = next;
    if (mountedRef.current) setPhase(next);
  }, []);

  const currentElapsed = useCallback(() => {
    const active = activeStartedAtRef.current;
    return Math.min(
      limitsRef.current.max_duration_ms,
      accruedMsRef.current + (active === null ? 0 : performance.now() - active),
    );
  }, []);

  const releaseMedia = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    if (meterFrameRef.current !== null)
      cancelAnimationFrame(meterFrameRef.current);
    meterFrameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    recorderRef.current = null;
    activeStartedAtRef.current = null;
    if (mountedRef.current) setMeter(0);
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const inputs = (await navigator.mediaDevices.enumerateDevices()).filter(
      (device) => device.kind === "audioinput",
    );
    if (mountedRef.current) {
      setDevices(inputs);
      setDeviceId((current) =>
        current && inputs.some((device) => device.deviceId === current)
          ? current
          : "",
      );
    }
  }, []);

  const loadRecordings = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    try {
      const response = await api<RecordingListResponse>(
        `/api/clinic/scribe/encounters/${encounterId}/recordings`,
      );
      limitsRef.current = response.limits;
      if (mountedRef.current && generation === loadGenerationRef.current)
        setUnfinished(response.recordings.filter((item) => item.recoverable));
    } catch (error) {
      if (mountedRef.current && generation === loadGenerationRef.current)
        setMessage(
          error instanceof Error
            ? error.message
            : "Recording status could not be loaded.",
        );
    }
  }, [encounterId]);

  const interruptServerRecording = useCallback(
    (recording: Recording | null) => {
      if (!recording) return;
      void api<RecordingResponse>(
        `/api/clinic/scribe/recordings/${recording.id}/interrupt`,
        { method: "POST" },
      ).catch(() => undefined);
    },
    [],
  );

  const drainQueue = useCallback(
    (explicitRetry = false) => {
      if (uploadFailedRef.current && !explicitRetry)
        return Promise.resolve(false);
      if (uploadPromiseRef.current) return uploadPromiseRef.current;
      const run = (async () => {
        while (pendingRef.current.length > 0) {
          const recording = recordingRef.current;
          if (!recording) return false;
          const item = pendingRef.current[0];
          try {
            const response = await api<ChunkResponse>(
              `/api/clinic/scribe/recordings/${recording.id}/chunk`,
              {
                method: "POST",
                body: { chunk: item },
              },
            );
            if (
              response.chunk.sequence !== item.sequence ||
              response.chunk.digest !== item.digest
            )
              throw new Error(
                "The server acknowledgement did not match the audio chunk.",
              );
            pendingRef.current.shift();
            if (mountedRef.current) setPendingCount(pendingRef.current.length);
          } catch (error) {
            uploadFailedRef.current = true;
            updatePhase("upload_error");
            if (mountedRef.current)
              setMessage(
                error instanceof Error
                  ? error.message
                  : "An audio chunk could not be saved.",
              );
            return false;
          }
        }
        uploadFailedRef.current = false;
        return true;
      })().finally(() => {
        uploadPromiseRef.current = null;
      });
      uploadPromiseRef.current = run;
      return run;
    },
    [updatePhase],
  );

  const finalizeRecording = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) return;
    const uploaded = await drainQueue();
    if (!uploaded || pendingRef.current.length > 0) return;
    try {
      const response = await api<RecordingResponse>(
        `/api/clinic/scribe/recordings/${recording.id}/finalize`,
        {
          method: "POST",
          body: {
            recording: {
              total_chunks: nextSequenceRef.current,
              duration_ms: Math.max(1, Math.round(accruedMsRef.current)),
            },
          },
        },
      );
      recordingRef.current = response.recording;
      updatePhase("completed");
      if (mountedRef.current) {
        setRecordingId(response.recording.id);
        setTranscription(response.transcription);
        setMessage(response.transcription.message);
        setUnfinished((current) =>
          current.filter((item) => item.id !== response.recording.id),
        );
        if (response.transcription.status === "ready")
          completedRef.current?.(response.recording.id);
      }
    } catch (error) {
      updatePhase("upload_error");
      if (mountedRef.current)
        setMessage(
          error instanceof Error
            ? error.message
            : "The recording could not be finalized.",
        );
    }
  }, [drainQueue, updatePhase]);

  const retryTranscription = async () => {
    const recording = recordingRef.current;
    if (!recording) return;
    updatePhase("stopping");
    setMessage("Sending the saved recording to OpenRouter…");
    try {
      const response = await api<RecordingResponse>(
        `/api/clinic/scribe/recordings/${recording.id}/transcribe`,
        { method: "POST" },
      );
      recordingRef.current = response.recording;
      setTranscription(response.transcription);
      setMessage(response.transcription.message);
      updatePhase("completed");
      if (response.transcription.status === "ready")
        completedRef.current?.(response.recording.id);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The saved recording could not be sent for transcription.",
      );
      updatePhase("completed");
    }
  };

  const handleStopped = useCallback(async () => {
    await dataTasksRef.current;
    releaseMedia();
    if (stopModeRef.current === "complete") {
      await finalizeRecording();
    } else if (stopModeRef.current === "discard") {
      const recording = recordingRef.current;
      if (recording) {
        try {
          await api<RecordingResponse>(
            `/api/clinic/scribe/recordings/${recording.id}`,
            { method: "DELETE" },
          );
        } catch (error) {
          if (mountedRef.current)
            setMessage(
              error instanceof Error
                ? error.message
                : "The recording could not be discarded.",
            );
        }
      }
      pendingRef.current = [];
      uploadFailedRef.current = false;
      if (mountedRef.current) setPendingCount(0);
      recordingRef.current = null;
      if (mountedRef.current) setRecordingId(null);
      updatePhase("idle");
      cancelledRef.current?.();
      void loadRecordings();
    } else {
      interruptServerRecording(recordingRef.current);
      updatePhase("error");
    }
  }, [
    finalizeRecording,
    interruptServerRecording,
    loadRecordings,
    releaseMedia,
    updatePhase,
  ]);

  const stopRecorder = useCallback(
    (mode: StopMode, reason?: string) => {
      if (phaseRef.current === "requesting_permission")
        startAttemptRef.current += 1;
      stopModeRef.current = mode;
      const recorder = recorderRef.current;
      if (activeStartedAtRef.current !== null) {
        accruedMsRef.current += performance.now() - activeStartedAtRef.current;
        activeStartedAtRef.current = null;
      }
      if (mountedRef.current) setElapsedMs(currentElapsed());
      if (reason && mountedRef.current) setMessage(reason);
      if (mode === "complete") updatePhase("stopping");
      if (!recorder || recorder.state === "inactive") {
        void handleStopped();
        return;
      }
      try {
        if (mode === "complete") recorder.requestData();
      } catch {
        // The final dataavailable event from stop remains authoritative.
      }
      recorder.stop();
    },
    [currentElapsed, handleStopped, updatePhase],
  );

  const startMeter = useCallback((stream: MediaStream) => {
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    context.createMediaStreamSource(stream).connect(analyser);
    audioContextRef.current = context;
    const samples = new Uint8Array(analyser.fftSize);
    const sample = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const value of samples) {
        const normalized = (value - 128) / 128;
        sum += normalized * normalized;
      }
      const now = performance.now();
      if (mountedRef.current && now - lastMeterUpdateRef.current >= 80) {
        lastMeterUpdateRef.current = now;
        setMeter(Math.min(100, Math.sqrt(sum / samples.length) * 280));
      }
      meterFrameRef.current = requestAnimationFrame(sample);
    };
    sample();
  }, []);

  const start = useCallback(async () => {
    if (!processingAllowed || activePhases.has(phaseRef.current)) return;
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setMessage("This browser does not support microphone recording.");
      updatePhase("error");
      return;
    }
    const mimeType = supportedMimeType();
    if (!mimeType) {
      setMessage(
        "This browser does not provide a supported audio recording format.",
      );
      updatePhase("error");
      return;
    }
    updatePhase("requesting_permission");
    const attempt = ++startAttemptRef.current;
    setMessage(null);
    setTranscription(null);
    pendingRef.current = [];
    uploadFailedRef.current = false;
    nextSequenceRef.current = 0;
    dataTasksRef.current = Promise.resolve();
    accruedMsRef.current = 0;
    setElapsedMs(0);
    setPendingCount(0);
    let stream: MediaStream | null = null;
    let created: Recording | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        video: false,
      });
      if (!mountedRef.current || attempt !== startAttemptRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      const response = await api<RecordingResponse>(
        `/api/clinic/scribe/encounters/${encounterId}/recordings`,
        {
          method: "POST",
          body: {
            recording: {
              idempotency_key: crypto.randomUUID(),
              expected_encounter_version: encounterVersion,
              mime_type: mimeType,
            },
          },
        },
      );
      created = response.recording;
      if (!mountedRef.current || attempt !== startAttemptRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        void api(`/api/clinic/scribe/recordings/${created.id}`, {
          method: "DELETE",
        }).catch(() => undefined);
        return;
      }
      recordingRef.current = created;
      limitsRef.current = response.limits;
      setRecordingId(created.id);
      recorder.ondataavailable = (event) => {
        if (
          event.data.size === 0 ||
          (stopModeRef.current !== "complete" && recorder.state === "inactive")
        )
          return;
        const sequence = nextSequenceRef.current++;
        dataTasksRef.current = dataTasksRef.current
          .then(async () => {
            const chunk = await pendingChunk(
              event.data,
              sequence,
              limitsRef.current.max_chunk_bytes,
            );
            pendingRef.current.push(chunk);
            if (mountedRef.current) setPendingCount(pendingRef.current.length);
            if (
              pendingRef.current.length >= MAX_PENDING_CHUNKS &&
              recorder.state === "recording"
            ) {
              recorder.pause();
              if (activeStartedAtRef.current !== null) {
                accruedMsRef.current +=
                  performance.now() - activeStartedAtRef.current;
                activeStartedAtRef.current = null;
              }
              updatePhase("upload_error");
              if (mountedRef.current)
                setMessage(
                  "Uploads are paused before more audio is held in memory. Retry saved chunks to continue.",
                );
            }
            await drainQueue();
          })
          .catch((error) => {
            updatePhase("upload_error");
            if (mountedRef.current)
              setMessage(
                error instanceof Error
                  ? error.message
                  : "Audio could not be prepared for upload.",
              );
          });
      };
      recorder.onstop = () => void handleStopped();
      for (const track of stream.getAudioTracks()) {
        track.addEventListener("ended", () => {
          if (recorder.state !== "inactive")
            stopRecorder(
              "interrupt",
              "The microphone disconnected. The acknowledged portion remains unfinished.",
            );
        });
      }
      startMeter(stream);
      stopModeRef.current = "interrupt";
      recorder.start(response.limits.chunk_interval_ms);
      activeStartedAtRef.current = performance.now();
      timerRef.current = window.setInterval(() => {
        const elapsed = currentElapsed();
        if (mountedRef.current) setElapsedMs(elapsed);
        if (
          elapsed >= limitsRef.current.max_duration_ms &&
          recorder.state !== "inactive"
        )
          if (finishRequestRef.current) {
            recorder.pause();
            if (activeStartedAtRef.current !== null)
              accruedMsRef.current +=
                performance.now() - activeStartedAtRef.current;
            activeStartedAtRef.current = null;
            updatePhase("stopping");
            finishRequestRef.current();
          } else stopRecorder("complete");
      }, 250);
      updatePhase("recording");
      void refreshDevices();
    } catch (error) {
      releaseMedia();
      if (created)
        void api(`/api/clinic/scribe/recordings/${created.id}`, {
          method: "DELETE",
        }).catch(() => undefined);
      const denied =
        error instanceof DOMException && error.name === "NotAllowedError";
      const missing =
        error instanceof DOMException &&
        ["NotFoundError", "NotReadableError", "OverconstrainedError"].includes(
          error.name,
        );
      setMessage(
        denied
          ? "Microphone permission was denied. Allow access in your browser, then try again."
          : missing
            ? "The selected microphone is unavailable. Choose another microphone and try again."
            : error instanceof Error
              ? error.message
              : "Recording could not start.",
      );
      updatePhase("error");
    }
  }, [
    currentElapsed,
    deviceId,
    drainQueue,
    encounterId,
    encounterVersion,
    handleStopped,
    processingAllowed,
    refreshDevices,
    releaseMedia,
    startMeter,
    stopRecorder,
    updatePhase,
  ]);

  const pause = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recorder.pause();
    if (activeStartedAtRef.current !== null)
      accruedMsRef.current += performance.now() - activeStartedAtRef.current;
    activeStartedAtRef.current = null;
    setElapsedMs(currentElapsed());
    updatePhase("paused");
  };

  const resume = () => {
    const recorder = recorderRef.current;
    if (
      !recorder ||
      recorder.state !== "paused" ||
      pendingRef.current.length > 0
    )
      return;
    recorder.resume();
    activeStartedAtRef.current = performance.now();
    setMessage(null);
    updatePhase("recording");
  };

  const retry = async () => {
    setMessage(null);
    uploadFailedRef.current = false;
    const uploaded = await drainQueue(true);
    if (!uploaded) return;
    if (!recorderRef.current || recorderRef.current.state === "inactive")
      await finalizeRecording();
    else updatePhase("paused");
  };

  const discardPrior = async (recording: Recording) => {
    try {
      await api(`/api/clinic/scribe/recordings/${recording.id}`, {
        method: "DELETE",
      });
      setUnfinished((current) =>
        current.filter((item) => item.id !== recording.id),
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The unfinished recording could not be discarded.",
      );
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    void refreshDevices();
    void loadRecordings();
    const changed = () => void refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", changed);
    return () => {
      mountedRef.current = false;
      startAttemptRef.current += 1;
      loadGenerationRef.current += 1;
      navigator.mediaDevices?.removeEventListener?.("devicechange", changed);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        try {
          recorder.stop();
        } catch {
          // Tracks are still stopped below.
        }
      }
      interruptServerRecording(recordingRef.current);
      releaseMedia();
    };
  }, [
    encounterId,
    interruptServerRecording,
    loadRecordings,
    refreshDevices,
    releaseMedia,
    scopeKey,
  ]);

  useEffect(() => {
    stateChangeRef.current = onRecordingStateChange;
    completedRef.current = onCompleted;
    cancelledRef.current = onCancelled;
    finishRequestRef.current = onFinishRequest;
  }, [onCancelled, onCompleted, onFinishRequest, onRecordingStateChange]);

  useEffect(() => {
    stateChangeRef.current?.({
      active: scribeRecordingBlocksNavigation(phase),
      phase,
      recordingId,
      elapsedMs,
      pendingChunks: pendingCount,
      inputLevel: meter,
    });
  }, [elapsedMs, meter, pendingCount, phase, recordingId]);

  useEffect(() => {
    if (!processingAllowed && scribeRecordingBlocksNavigation(phaseRef.current))
      stopRecorder(
        "interrupt",
        "Recording stopped because accepted consent is no longer current.",
      );
  }, [processingAllowed, stopRecorder]);

  useEffect(() => {
    if (
      startRequestToken <= 0 ||
      startRequestToken === lastStartTokenRef.current
    )
      return;
    lastStartTokenRef.current = startRequestToken;
    void start();
  }, [start, startRequestToken]);

  useEffect(() => {
    if (
      finishRequestToken <= 0 ||
      finishRequestToken === lastFinishTokenRef.current
    )
      return;
    lastFinishTokenRef.current = finishRequestToken;
    stopRecorder("complete");
  }, [finishRequestToken, stopRecorder]);

  useEffect(() => {
    if (
      discardRequestToken <= 0 ||
      discardRequestToken === lastDiscardTokenRef.current
    )
      return;
    lastDiscardTokenRef.current = discardRequestToken;
    stopRecorder("discard");
  }, [discardRequestToken, stopRecorder]);

  const active = scribeRecordingBlocksNavigation(phase);
  const canResume =
    recorderRef.current?.state === "paused" && pendingCount === 0;
  return (
    <Box
      component="section"
      aria-labelledby="scribe-recording-heading"
      sx={{
        p: embedded ? 0 : 1.5,
        border: embedded ? 0 : 1,
        borderColor: "divider",
        borderRadius: embedded ? 0 : 1,
      }}
    >
      <Stack spacing={1.25}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          sx={{ alignItems: { sm: "center" } }}
        >
          {!embedded && (
            <Box sx={{ minWidth: 112 }}>
              <Typography
                id="scribe-recording-heading"
                variant="subtitle2"
                sx={{ fontWeight: 700 }}
              >
                Visit audio
              </Typography>
              <Typography
                variant="body2"
                sx={{ fontVariantNumeric: "tabular-nums" }}
                aria-live="polite"
              >
                {displayElapsed(elapsedMs)} · {phase.replaceAll("_", " ")}
              </Typography>
            </Box>
          )}
          {!compact && (
            <FormControl
              size="small"
              sx={{ minWidth: 190, flex: 1 }}
              disabled={active}
            >
              <InputLabel id="scribe-microphone-label">Microphone</InputLabel>
              <Select
                labelId="scribe-microphone-label"
                label="Microphone"
                value={deviceId}
                onChange={(event) => setDeviceId(event.target.value)}
              >
                <MenuItem value="">System default</MenuItem>
                {devices.map((device, index) => (
                  <MenuItem key={device.deviceId} value={device.deviceId}>
                    {device.label || `Microphone ${index + 1}`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <Stack
            direction="row"
            spacing={0.75}
            useFlexGap
            sx={{ flexWrap: "wrap" }}
          >
            {!active && phase !== "completed" && (
              <Button
                variant="contained"
                startIcon={<FiberManualRecordOutlinedIcon />}
                disabled={!processingAllowed}
                onClick={() => void start()}
              >
                Record
              </Button>
            )}
            {phase === "recording" && (
              <Button
                variant="outlined"
                startIcon={<PauseOutlinedIcon />}
                onClick={pause}
              >
                Pause
              </Button>
            )}
            {(phase === "paused" ||
              (phase === "upload_error" && canResume)) && (
              <Button
                variant="outlined"
                startIcon={<PlayArrowOutlinedIcon />}
                disabled={!canResume}
                onClick={resume}
              >
                Resume
              </Button>
            )}
            {phase === "upload_error" && pendingCount > 0 && (
              <Button
                variant="outlined"
                startIcon={<ReplayOutlinedIcon />}
                onClick={() => void retry()}
              >
                Retry {pendingCount} {pendingCount === 1 ? "chunk" : "chunks"}
              </Button>
            )}
            {active && (
              <Button
                color="error"
                variant="contained"
                startIcon={<StopOutlinedIcon />}
                onClick={() =>
                  onFinishRequest
                    ? (() => {
                        const recorder = recorderRef.current;
                        if (recorder?.state === "recording") recorder.pause();
                        if (activeStartedAtRef.current !== null)
                          accruedMsRef.current +=
                            performance.now() - activeStartedAtRef.current;
                        activeStartedAtRef.current = null;
                        updatePhase("stopping");
                        onFinishRequest();
                      })()
                    : stopRecorder("complete")
                }
              >
                {onFinishRequest ? "Finish & review" : "Stop and save"}
              </Button>
            )}
            {active && (
              <Button
                color="inherit"
                startIcon={<DeleteOutlineOutlinedIcon />}
                onClick={() =>
                  onDiscardRequest
                    ? onDiscardRequest()
                    : stopRecorder("discard")
                }
              >
                Discard
              </Button>
            )}
            {phase === "completed" && (
              <>
                {transcription?.status !== "ready" && (
                  <Button
                    variant="contained"
                    startIcon={<ReplayOutlinedIcon />}
                    onClick={() => void retryTranscription()}
                  >
                    Retry AI note
                  </Button>
                )}
                <Button
                  variant="outlined"
                  startIcon={<FiberManualRecordOutlinedIcon />}
                  onClick={() => void start()}
                >
                  Record again
                </Button>
              </>
            )}
          </Stack>
        </Stack>
        {!compact && (
          <Box>
            <Typography variant="caption" color="text.secondary">
              Microphone input level
            </Typography>
            <LinearProgress
              variant="determinate"
              value={meter}
              aria-label="Microphone input level"
              sx={{ height: 6, borderRadius: 3 }}
            />
          </Box>
        )}
        {!compact && !processingAllowed && (
          <Alert severity="warning">
            Accepted recording consent is required before recording.
          </Alert>
        )}
        {!compact && message && (
          <Alert
            severity={
              transcription?.status === "ready"
                ? "success"
                : phase === "completed" && transcription?.status !== "failed"
                  ? "info"
                  : "error"
            }
          >
            {message}
          </Alert>
        )}
        {!compact &&
          unfinished.map((recording) => (
            <Alert
              key={recording.id}
              severity="warning"
              action={
                recording.owned_by_current_user ? (
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() => void discardPrior(recording)}
                  >
                    Discard saved audio
                  </Button>
                ) : undefined
              }
            >
              A previous recording ended before final confirmation. Its{" "}
              {recording.acknowledged_chunks} acknowledged audio{" "}
              {recording.acknowledged_chunks === 1 ? "chunk is" : "chunks are"}{" "}
              preserved. Start a new recording to continue.
            </Alert>
          ))}
      </Stack>
    </Box>
  );
}
