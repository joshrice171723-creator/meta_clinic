import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import CameraAltOutlinedIcon from "@mui/icons-material/CameraAltOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api, ApiError } from "../../api/client";
import type {
  BarcodeDetectorConstructor,
  ClockChallenge,
  KioskConfiguration,
  PunchEvent,
  PunchResult,
} from "./clockTypes";
import { punchLabels } from "./clockTypes";

type ResultState = { kind: "saved" | "unknown" | "error"; text: string } | null;

export function KioskClockPage() {
  const [configuration, setConfiguration] = useState<KioskConfiguration | null>(
    null,
  );
  const [needsEnrollment, setNeedsEnrollment] = useState(false);
  const [enrollmentToken, setEnrollmentToken] = useState("");
  const [badge, setBadge] = useState("");
  const [pin, setPin] = useState("");
  const [challenge, setChallenge] = useState<ClockChallenge | null>(null);
  const [result, setResult] = useState<ResultState>(null);
  const [busy, setBusy] = useState(false);
  const [cameraAvailable, setCameraAvailable] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [pending, setPending] = useState<{
    challenge: string;
    eventType: PunchEvent;
    requestKey: string;
  } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const clearTimer = useRef<number | null>(null);

  const loadConfiguration = useCallback(async () => {
    try {
      const data = await api<KioskConfiguration>("/api/workforce/kiosk");
      setConfiguration(data);
      setNeedsEnrollment(false);
      try {
        const restored = await api<PunchResult>(
          "/api/workforce/kiosk/punches/status",
        );
        if (restored.saved)
          setResult({
            kind: "saved",
            text: `${punchLabels[restored.event_type]} saved at ${new Date(restored.occurred_at_utc).toLocaleTimeString()}.`,
          });
      } catch (reason) {
        if (
          !(reason instanceof ApiError) ||
          ![400, 404].includes(reason.status)
        )
          throw reason;
      }
    } catch (reason) {
      if (reason instanceof ApiError && [401, 404].includes(reason.status))
        setNeedsEnrollment(true);
      else
        setResult({
          kind: "error",
          text:
            reason instanceof Error
              ? reason.message
              : "Unable to connect to the clock.",
        });
    }
  }, []);

  useEffect(() => {
    void loadConfiguration();
  }, [loadConfiguration]);
  useEffect(() => {
    const detector = (
      window as typeof window & { BarcodeDetector?: BarcodeDetectorConstructor }
    ).BarcodeDetector;
    if (!configuration?.camera_enabled || !detector) return;
    detector
      .getSupportedFormats()
      .then((formats) => setCameraAvailable(formats.includes("code_128")))
      .catch(() => setCameraAvailable(false));
  }, [configuration]);
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (clearTimer.current) window.clearTimeout(clearTimer.current);
    },
    [],
  );

  function clearEmployee(delay = 0) {
    if (clearTimer.current) window.clearTimeout(clearTimer.current);
    clearTimer.current = window.setTimeout(() => {
      setBadge("");
      setPin("");
      setChallenge(null);
      setPending(null);
      setResult(null);
    }, delay);
  }

  async function enroll(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      await api("/api/workforce/kiosk/enroll", {
        method: "POST",
        body: { enrollment_token: enrollmentToken },
      });
      setEnrollmentToken("");
      await loadConfiguration();
    } catch (reason) {
      setResult({
        kind: "error",
        text: reason instanceof Error ? reason.message : "Enrollment failed.",
      });
    } finally {
      setEnrollmentToken("");
      setBusy(false);
    }
  }

  const resolveBadge = useCallback(
    async (
      value: string,
      inputMethod: "scanner" | "camera" | "manual" = "scanner",
    ) => {
      if (!value.trim()) return;
      setBusy(true);
      setResult(null);
      setChallenge(null);
      try {
        const data = await api<ClockChallenge>(
          "/api/workforce/kiosk/challenges",
          {
            method: "POST",
            body: {
              badge: value.trim(),
              pin: pin || null,
              input_method: inputMethod,
            },
          },
        );
        setChallenge(data);
      } catch (reason) {
        setResult({
          kind: "error",
          text:
            reason instanceof Error
              ? reason.message
              : "Badge could not be verified.",
        });
        clearEmployee(8_000);
      } finally {
        setBadge("");
        setPin("");
        setBusy(false);
      }
    },
    [pin],
  );

  async function submitScan(event: FormEvent) {
    event.preventDefault();
    await resolveBadge(
      badge,
      configuration?.scanner_enabled ? "scanner" : "manual",
    );
  }

  async function sendPunch(eventType: PunchEvent, retry = pending) {
    if (!challenge && !retry) return;
    const operation = retry ?? {
      challenge: challenge!.challenge,
      eventType,
      requestKey: crypto.randomUUID(),
    };
    setPending(operation);
    setBusy(true);
    setResult(null);
    try {
      const saved = await api<PunchResult>("/api/workforce/kiosk/punches", {
        method: "POST",
        body: {
          challenge: operation.challenge,
          event_type: operation.eventType,
          request_key: operation.requestKey,
        },
      });
      setResult({
        kind: "saved",
        text: `${punchLabels[saved.event_type]} saved at ${new Date(saved.occurred_at_utc).toLocaleTimeString()}.`,
      });
      clearEmployee(8_000);
    } catch (reason) {
      if (reason instanceof ApiError) {
        setPending(null);
        setResult({ kind: "error", text: reason.message });
      } else {
        setResult({
          kind: "unknown",
          text: "The clock could not confirm whether this action was saved. Check its status or retry this same request.",
        });
      }
    } finally {
      setBusy(false);
    }
  }

  async function checkStatus() {
    setBusy(true);
    try {
      const saved = await api<PunchResult>(
        `/api/workforce/kiosk/punches/status${pending ? `?request_key=${encodeURIComponent(pending.requestKey)}` : ""}`,
      );
      setResult({
        kind: "saved",
        text: `${punchLabels[saved.event_type]} saved at ${new Date(saved.occurred_at_utc).toLocaleTimeString()}.`,
      });
      clearEmployee(8_000);
    } catch (reason) {
      setResult({
        kind: "unknown",
        text:
          reason instanceof ApiError && reason.status === 404
            ? "This request is not saved. Retry the same request or ask a manager for help."
            : "Status is still unavailable. Do not start a new clock action.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function startCamera() {
    const Detector = (
      window as typeof window & { BarcodeDetector?: BarcodeDetectorConstructor }
    ).BarcodeDetector;
    if (!Detector || !videoRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraOn(true);
      const detector = new Detector({ formats: ["code_128"] });
      const scan = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes[0]?.rawValue) {
            stopCamera();
            await resolveBadge(codes[0].rawValue, "camera");
            return;
          }
        } catch {
          /* Continue with scanner/manual fallback. */
        }
        window.requestAnimationFrame(() => void scan());
      };
      void scan();
    } catch {
      setResult({
        kind: "error",
        text: "Camera access is unavailable. Use the scanner or permitted manual entry.",
      });
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  if (needsEnrollment)
    return (
      <KioskFrame>
        <Paper
          variant="outlined"
          sx={{ p: { xs: 3, sm: 5 }, width: "min(100%, 520px)" }}
        >
          <Stack component="form" spacing={3} onSubmit={enroll}>
            <Typography variant="h1">Enroll this clock</Typography>
            <Typography color="text.secondary">
              Enter the one-time code created by a practice administrator. This
              device receives clock access only.
            </Typography>
            {result && <Alert severity="error">{result.text}</Alert>}
            <TextField
              autoFocus
              label="Enrollment code"
              value={enrollmentToken}
              onChange={(event) => setEnrollmentToken(event.target.value)}
              autoComplete="off"
              required
            />
            <Button
              type="submit"
              size="large"
              variant="contained"
              disabled={busy || !enrollmentToken}
            >
              {busy ? "Enrolling…" : "Enroll clock"}
            </Button>
          </Stack>
        </Paper>
      </KioskFrame>
    );

  return (
    <KioskFrame>
      <Paper
        variant="outlined"
        sx={{ p: { xs: 3, sm: 5 }, width: "min(100%, 720px)" }}
      >
        <Stack spacing={3} sx={{ alignItems: "stretch" }}>
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="overline" color="text.secondary">
              {configuration?.site_name ?? "Employee clock"}
            </Typography>
            <Typography variant="h1">Time clock</Typography>
            <Typography color="text.secondary">
              Scan your badge, confirm the intended action, then wait for Saved.
            </Typography>
          </Box>
          {result && (
            <Alert
              severity={
                result.kind === "saved"
                  ? "success"
                  : result.kind === "unknown"
                    ? "warning"
                    : "error"
              }
              icon={
                result.kind === "saved" ? <CheckCircleOutlineIcon /> : undefined
              }
            >
              {result.text}
            </Alert>
          )}
          {!challenge && (
            <Stack component="form" spacing={2} onSubmit={submitScan}>
              <TextField
                autoFocus
                label={
                  configuration?.scanner_enabled ? "Scan badge" : "Badge code"
                }
                value={badge}
                onChange={(event) => setBadge(event.target.value)}
                disabled={
                  busy ||
                  (!configuration?.scanner_enabled &&
                    !configuration?.manual_badge_entry_enabled)
                }
                helperText={
                  configuration?.scanner_enabled
                    ? "USB and Bluetooth scanners can type into this field."
                    : configuration?.manual_badge_entry_enabled
                      ? "Manual badge entry is enabled for this site."
                      : "Badge entry is disabled."
                }
                autoComplete="off"
              />
              {configuration?.pin_required && (
                <TextField
                  label="PIN"
                  type="password"
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                  autoComplete="off"
                  slotProps={{
                    htmlInput: { inputMode: "numeric", maxLength: 12 },
                  }}
                />
              )}
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={busy || !badge}
              >
                {busy ? <CircularProgress size={24} /> : "Continue"}
              </Button>
            </Stack>
          )}
          {configuration?.camera_enabled && (
            <Stack spacing={1}>
              <video
                ref={videoRef}
                muted
                playsInline
                aria-label="Barcode camera preview"
                style={{
                  width: "100%",
                  maxHeight: cameraOn ? 320 : 0,
                  objectFit: "cover",
                  borderRadius: 12,
                }}
              />
              {cameraAvailable ? (
                <Button
                  startIcon={<CameraAltOutlinedIcon />}
                  onClick={cameraOn ? stopCamera : () => void startCamera()}
                >
                  {cameraOn ? "Stop camera" : "Scan with camera"}
                </Button>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  This browser cannot scan Code 128 badges with the camera. Use
                  a keyboard scanner
                  {configuration.manual_badge_entry_enabled
                    ? " or manual entry"
                    : ""}
                  .
                </Typography>
              )}
            </Stack>
          )}
          {challenge && (
            <Stack spacing={2} sx={{ textAlign: "center" }}>
              <Typography variant="h2">
                Hello, {challenge.employee_label}
              </Typography>
              <Typography>Choose the action you intend to record.</Typography>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={2}
                sx={{ justifyContent: "center" }}
              >
                {challenge.allowed_transitions.map((eventType) => (
                  <Button
                    key={eventType}
                    variant="contained"
                    size="large"
                    disabled={busy}
                    onClick={() => void sendPunch(eventType, null)}
                  >
                    {punchLabels[eventType]}
                  </Button>
                ))}
              </Stack>
              <Button onClick={() => clearEmployee()} disabled={busy}>
                Cancel
              </Button>
            </Stack>
          )}
          {result?.kind === "unknown" && (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <Button
                variant="outlined"
                disabled={busy}
                onClick={() => void checkStatus()}
              >
                Check saved status
              </Button>
              <Button
                variant="contained"
                disabled={busy || !pending}
                onClick={() =>
                  pending && void sendPunch(pending.eventType, pending)
                }
              >
                Retry same request
              </Button>
            </Stack>
          )}
        </Stack>
      </Paper>
    </KioskFrame>
  );
}

function KioskFrame({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        minHeight: "100dvh",
        bgcolor: "background.default",
        display: "grid",
        placeItems: "center",
        py: 4,
      }}
    >
      <Container maxWidth="md">
        <Stack sx={{ alignItems: "center" }}>{children}</Stack>
      </Container>
    </Box>
  );
}
