import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { useTelehealthDevices } from "./useTelehealthDevices";
import type { TelehealthDeviceResults } from "./types";

export function DeviceCheck({
  allowAudioOnly,
  busy,
  error,
  onBack,
  onContinue,
}: {
  allowAudioOnly: boolean;
  busy: boolean;
  error?: string | null;
  onBack: () => void;
  onContinue: (results: TelehealthDeviceResults) => Promise<void>;
}) {
  const check = useTelehealthDevices();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [audioDevice, setAudioDevice] = useState("");
  const [videoDevice, setVideoDevice] = useState("");
  const [outputDevice, setOutputDevice] = useState("");
  const [audioOnly, setAudioOnly] = useState(false);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = check.stream;
    if (check.stream) void videoRef.current.play().catch(() => undefined);
  }, [check.stream]);

  const results: TelehealthDeviceResults = {
    ...check.result,
    camera: audioOnly ? "not_available" : check.result.camera,
    audio_only_requested: audioOnly,
    checked_at: new Date().toISOString(),
  };
  const ready =
    results.microphone === "passed" &&
    results.speaker === "passed" &&
    (results.camera === "passed" || (allowAudioOnly && audioOnly));

  return (
    <Stack spacing={2}>
      <div>
        <Typography variant="h5">Check your camera and sound</Typography>
        <Typography color="text.secondary">
          This check confirms what this browser can access now. It does not
          guarantee connection quality during the visit.
        </Typography>
      </div>
      <Box
        sx={{
          minHeight: 220,
          bgcolor: "grey.900",
          borderRadius: 1,
          overflow: "hidden",
          display: "grid",
          placeItems: "center",
        }}
      >
        {check.stream ? (
          <video
            ref={videoRef}
            muted
            autoPlay
            playsInline
            aria-label="Camera preview"
            style={{ width: "100%", maxHeight: 360, objectFit: "cover" }}
          />
        ) : (
          <Typography color="grey.300">Camera preview is off</Typography>
        )}
      </Box>
      <Button
        variant="contained"
        disabled={busy || check.requesting}
        onClick={() =>
          void check
            .enable(audioDevice, videoDevice, !audioOnly)
            .catch(() => undefined)
        }
      >
        {check.running
          ? "Try again"
          : audioOnly
            ? "Enable microphone"
            : "Enable camera and microphone"}
      </Button>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <FormControl fullWidth disabled={!check.running}>
          <InputLabel id="device-check-microphone">Microphone</InputLabel>
          <Select
            labelId="device-check-microphone"
            label="Microphone"
            value={audioDevice}
            onChange={(event) => {
              setAudioDevice(event.target.value);
              void check
                .enable(event.target.value, videoDevice, !audioOnly)
                .catch(() => undefined);
            }}
          >
            <MenuItem value="">System default</MenuItem>
            {check.devices
              .filter((device) => device.kind === "audioinput")
              .map((device, index) => (
                <MenuItem key={device.deviceId} value={device.deviceId}>
                  {device.label || `Microphone ${index + 1}`}
                </MenuItem>
              ))}
          </Select>
        </FormControl>
        <FormControl fullWidth disabled={!check.running}>
          <InputLabel id="device-check-camera">Camera</InputLabel>
          <Select
            labelId="device-check-camera"
            label="Camera"
            value={videoDevice}
            onChange={(event) => {
              setAudioOnly(false);
              setVideoDevice(event.target.value);
              void check
                .enable(audioDevice, event.target.value, true)
                .catch(() => undefined);
            }}
          >
            <MenuItem value="">System default</MenuItem>
            {check.devices
              .filter((device) => device.kind === "videoinput")
              .map((device, index) => (
                <MenuItem key={device.deviceId} value={device.deviceId}>
                  {device.label || `Camera ${index + 1}`}
                </MenuItem>
              ))}
          </Select>
        </FormControl>
      </Stack>
      {check.devices.some((device) => device.kind === "audiooutput") &&
        typeof AudioContext !== "undefined" &&
        "setSinkId" in AudioContext.prototype && (
          <FormControl fullWidth>
            <InputLabel id="device-check-speaker">Speaker</InputLabel>
            <Select
              labelId="device-check-speaker"
              label="Speaker"
              value={outputDevice}
              onChange={(event) => {
                setOutputDevice(event.target.value);
                check.setSpeakerConfirmed(false);
              }}
            >
              <MenuItem value="">System default</MenuItem>
              {check.devices
                .filter((device) => device.kind === "audiooutput")
                .map((device, index) => (
                  <MenuItem key={device.deviceId} value={device.deviceId}>
                    {device.label || `Speaker ${index + 1}`}
                  </MenuItem>
                ))}
            </Select>
          </FormControl>
        )}
      <div>
        <Typography variant="body2">Microphone input</Typography>
        <LinearProgress
          variant="determinate"
          value={check.level}
          aria-label="Microphone input level"
          sx={{ height: 8, mt: 0.5 }}
        />
      </div>
      <Button
        variant="outlined"
        onClick={() =>
          void check.playSpeakerTest(outputDevice).catch(() => undefined)
        }
      >
        Play test sound
      </Button>
      <FormControlLabel
        control={
          <Checkbox
            checked={check.speakerConfirmed}
            onChange={(event) =>
              check.setSpeakerConfirmed(event.target.checked)
            }
          />
        }
        label="I can hear the test sound"
      />
      {allowAudioOnly && (
        <FormControlLabel
          control={
            <Checkbox
              checked={audioOnly}
              disabled={busy || check.requesting}
              onChange={(event) => {
                const selected = event.target.checked;
                setAudioOnly(selected);
                if (check.running || check.error)
                  void check
                    .enable(audioDevice, videoDevice, !selected)
                    .catch(() => undefined);
              }}
            />
          }
          label="Continue with audio only"
        />
      )}
      {(check.error || error) && (
        <Alert severity="error">{check.error || error}</Alert>
      )}
      {!ready && check.running && (
        <Alert severity="info">
          Confirm the microphone, speaker, and{" "}
          {allowAudioOnly ? "camera or audio-only choice" : "camera"} before
          continuing.
        </Alert>
      )}
      <Stack
        direction="row"
        spacing={1}
        sx={{ justifyContent: "space-between" }}
      >
        <Button onClick={onBack}>Back</Button>
        <Button
          variant="contained"
          disabled={!ready || busy}
          onClick={() => void onContinue(results).catch(() => undefined)}
        >
          {busy ? "Saving…" : "Continue"}
        </Button>
      </Stack>
    </Stack>
  );
}
