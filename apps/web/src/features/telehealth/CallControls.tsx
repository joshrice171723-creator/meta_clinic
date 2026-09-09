import { useEffect, useMemo, useRef, useState } from "react";
import CallEndOutlinedIcon from "@mui/icons-material/CallEndOutlined";
import DevicesOutlinedIcon from "@mui/icons-material/DevicesOutlined";
import MicOffOutlinedIcon from "@mui/icons-material/MicOffOutlined";
import MicOutlinedIcon from "@mui/icons-material/MicOutlined";
import PeopleOutlineOutlinedIcon from "@mui/icons-material/PeopleOutlineOutlined";
import PresentToAllOutlinedIcon from "@mui/icons-material/PresentToAllOutlined";
import StopScreenShareOutlinedIcon from "@mui/icons-material/StopScreenShareOutlined";
import VideocamOffOutlinedIcon from "@mui/icons-material/VideocamOffOutlined";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTelehealthSession } from "./TelehealthSessionProvider";
import { ConnectionRecovery } from "./ConnectionRecovery";

function connectionMessage(state: string, authorized: boolean) {
  if (!authorized)
    return "Call access needs to be confirmed before media controls can be used.";
  if (state === "joining") return "Connecting to the video visit…";
  if (state === "reconnecting")
    return "Reconnecting… Camera and microphone controls will return when the connection is stable.";
  if (state === "joined") return "Connected";
  if (state === "leaving") return "Leaving the call…";
  if (state === "error") return "The call connection needs attention.";
  return "Call controls will be available after you join.";
}

export function CallControls({
  allowScreenShare,
  showParticipants,
  onShowParticipants,
  showParticipantsControl = true,
  onLeave,
  onEnd,
  canEnd,
  busy = false,
  recoveryContact,
}: {
  allowScreenShare: boolean;
  showParticipants: boolean;
  onShowParticipants: () => void;
  showParticipantsControl?: boolean;
  onLeave: () => void;
  onEnd?: () => void;
  canEnd?: boolean;
  busy?: boolean;
  recoveryContact?: {
    label: string;
    phone?: string | null;
  };
}) {
  const session = useTelehealthSession();
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [deviceLoadError, setDeviceLoadError] = useState<string | null>(null);
  const [deviceSwitchError, setDeviceSwitchError] = useState<string | null>(
    null,
  );
  const [deviceSwitching, setDeviceSwitching] = useState<
    "audio" | "video" | null
  >(null);
  const mountedRef = useRef(false);
  const deviceSwitchingRef = useRef(false);
  const deviceSwitchGenerationRef = useRef(0);
  const activeVisitIdRef = useRef(session.active?.visitId);
  activeVisitIdRef.current = session.active?.visitId;
  const [audioDevice, setAudioDevice] = useState("");
  const [videoDevice, setVideoDevice] = useState("");
  const authorizationConfirmed = session.authorizationStatus === "confirmed";
  const mediaReady =
    session.callState === "joined" && authorizationConfirmed && !busy;
  const canLeave = Boolean(session.active) && session.callState !== "leaving";
  const showRecovery =
    session.retrying ||
    session.callState === "reconnecting" ||
    session.callState === "error";
  const audioInputs = useMemo(
    () => devices.filter((device) => device.kind === "audioinput"),
    [devices],
  );
  const videoInputs = useMemo(
    () => devices.filter((device) => device.kind === "videoinput"),
    [devices],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!devicesOpen) return;
    if (typeof navigator.mediaDevices?.enumerateDevices !== "function") {
      setDevices([]);
      setDeviceLoadError("Device selection is not available in this browser.");
      return;
    }
    let active = true;
    setDevicesLoading(true);
    setDeviceLoadError(null);
    void navigator.mediaDevices
      .enumerateDevices()
      .then((nextDevices) => {
        if (active) {
          setDevices(nextDevices);
          setAudioDevice((current) =>
            !current ||
            nextDevices.some(
              (device) =>
                device.kind === "audioinput" && device.deviceId === current,
            )
              ? current
              : "",
          );
          setVideoDevice((current) =>
            !current ||
            nextDevices.some(
              (device) =>
                device.kind === "videoinput" && device.deviceId === current,
            )
              ? current
              : "",
          );
        }
      })
      .catch(() => {
        if (active) {
          setDevices([]);
          setDeviceLoadError(
            "APPly could not read the available call devices. Check browser permissions and try again.",
          );
        }
      })
      .finally(() => {
        if (active) setDevicesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [devicesOpen]);

  useEffect(() => {
    deviceSwitchGenerationRef.current += 1;
    deviceSwitchingRef.current = false;
    setDeviceSwitching(null);
    setDevicesOpen(false);
    setDeviceSwitchError(null);
    setAudioDevice("");
    setVideoDevice("");
  }, [session.active?.visitId]);

  const switchInputDevice = async (
    kind: "audio" | "video",
    deviceId: string,
  ) => {
    if (deviceSwitchingRef.current) return;
    deviceSwitchingRef.current = true;
    const generation = deviceSwitchGenerationRef.current;
    const visitId = activeVisitIdRef.current;
    setDeviceSwitching(kind);
    setDeviceSwitchError(null);
    try {
      await session.selectInputDevice(kind, deviceId);
      if (
        !mountedRef.current ||
        activeVisitIdRef.current !== visitId ||
        generation !== deviceSwitchGenerationRef.current
      )
        return;
      if (kind === "audio") setAudioDevice(deviceId);
      else setVideoDevice(deviceId);
    } catch (reason) {
      if (
        !mountedRef.current ||
        activeVisitIdRef.current !== visitId ||
        generation !== deviceSwitchGenerationRef.current
      )
        return;
      setDeviceSwitchError(
        reason instanceof Error
          ? reason.message
          : `The ${kind === "audio" ? "microphone" : "camera"} could not be changed.`,
      );
    } finally {
      if (generation === deviceSwitchGenerationRef.current) {
        deviceSwitchingRef.current = false;
        if (mountedRef.current) setDeviceSwitching(null);
      }
    }
  };

  return (
    <Box
      component="section"
      aria-label="Call controls"
      sx={{ bgcolor: "grey.950", color: "common.white", p: 1.5 }}
    >
      <Typography
        variant="caption"
        component="p"
        aria-live="polite"
        sx={{ color: "grey.300", mb: 1, textAlign: "center" }}
      >
        {connectionMessage(session.callState, authorizationConfirmed)}
      </Typography>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{ alignItems: { sm: "center" }, justifyContent: "center" }}
      >
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ flexWrap: "wrap", justifyContent: "center" }}
        >
          <Tooltip
            title={
              session.microphoneEnabled
                ? "Mute microphone"
                : "Unmute microphone"
            }
          >
            <Button
              color="inherit"
              variant={session.microphoneEnabled ? "outlined" : "contained"}
              aria-pressed={!session.microphoneEnabled}
              startIcon={
                session.microphoneEnabled ? (
                  <MicOutlinedIcon />
                ) : (
                  <MicOffOutlinedIcon />
                )
              }
              disabled={!mediaReady}
              onClick={() => void session.toggleMicrophone()}
            >
              {session.microphoneEnabled ? "Mute" : "Unmute"}
            </Button>
          </Tooltip>
          <Tooltip
            title={session.cameraEnabled ? "Turn camera off" : "Turn camera on"}
          >
            <Button
              color="inherit"
              variant={session.cameraEnabled ? "outlined" : "contained"}
              aria-pressed={!session.cameraEnabled}
              startIcon={
                session.cameraEnabled ? (
                  <VideocamOutlinedIcon />
                ) : (
                  <VideocamOffOutlinedIcon />
                )
              }
              disabled={!mediaReady}
              onClick={() => void session.toggleCamera()}
            >
              {session.cameraEnabled ? "Camera off" : "Camera on"}
            </Button>
          </Tooltip>
        </Stack>
        <Divider
          orientation="vertical"
          flexItem
          sx={{ borderColor: "grey.700", display: { xs: "none", sm: "block" } }}
        />
        <Stack
          direction="row"
          spacing={0.5}
          useFlexGap
          sx={{ flexWrap: "wrap", justifyContent: "center" }}
        >
          <Button
            color="inherit"
            startIcon={<DevicesOutlinedIcon />}
            disabled={!mediaReady}
            onClick={() => setDevicesOpen(true)}
          >
            Devices
          </Button>
          {allowScreenShare && (
            <Button
              color={session.screenShareEnabled ? "warning" : "inherit"}
              variant={session.screenShareEnabled ? "contained" : "text"}
              aria-pressed={session.screenShareEnabled}
              startIcon={
                session.screenShareEnabled ? (
                  <StopScreenShareOutlinedIcon />
                ) : (
                  <PresentToAllOutlinedIcon />
                )
              }
              disabled={!mediaReady}
              onClick={() =>
                void (session.screenShareEnabled
                  ? session.stopScreenShare()
                  : session.startScreenShare())
              }
            >
              {session.screenShareEnabled ? "Stop sharing" : "Share screen"}
            </Button>
          )}
          {showParticipantsControl && (
            <Button
              color="inherit"
              variant={showParticipants ? "outlined" : "text"}
              aria-pressed={showParticipants}
              startIcon={<PeopleOutlineOutlinedIcon />}
              disabled={!mediaReady}
              onClick={onShowParticipants}
            >
              Participants
            </Button>
          )}
        </Stack>
        <Divider
          orientation="vertical"
          flexItem
          sx={{ borderColor: "grey.700", display: { xs: "none", sm: "block" } }}
        />
        <Stack direction="row" spacing={1} sx={{ justifyContent: "center" }}>
          <Button
            color="inherit"
            startIcon={<CallEndOutlinedIcon />}
            disabled={!canLeave || busy}
            onClick={onLeave}
          >
            Leave
          </Button>
          {canEnd && onEnd && (
            <Button
              color="error"
              variant="contained"
              startIcon={<CallEndOutlinedIcon />}
              disabled={busy}
              onClick={onEnd}
            >
              End for everyone
            </Button>
          )}
        </Stack>
      </Stack>
      {showRecovery && (
        <ConnectionRecovery
          compact
          state={
            session.callState === "error" ? "disconnected" : "reconnecting"
          }
          retrying={session.retrying}
          message={session.callState === "error" ? session.error : null}
          onRetry={session.retryConnection}
          contact={recoveryContact}
        />
      )}
      {session.error && !showRecovery && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {session.error}
        </Alert>
      )}
      {session.authorizationError && (
        <Alert severity="warning" sx={{ mt: 1 }}>
          {session.authorizationError}
        </Alert>
      )}
      <Dialog
        open={devicesOpen}
        onClose={() => setDevicesOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Call devices</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {devicesLoading && (
              <Stack
                direction="row"
                spacing={1}
                role="status"
                sx={{ alignItems: "center" }}
              >
                <CircularProgress size={20} />
                <Typography variant="body2">
                  Finding available devices…
                </Typography>
              </Stack>
            )}
            {deviceLoadError && (
              <Alert severity="warning">{deviceLoadError}</Alert>
            )}
            {deviceSwitchError && (
              <Alert severity="error">{deviceSwitchError}</Alert>
            )}
            {deviceSwitching && (
              <Stack
                direction="row"
                spacing={1}
                role="status"
                sx={{ alignItems: "center" }}
              >
                <CircularProgress size={20} />
                <Typography variant="body2">
                  Changing{" "}
                  {deviceSwitching === "audio" ? "microphone" : "camera"}…
                </Typography>
              </Stack>
            )}
            {!devicesLoading &&
              !deviceLoadError &&
              audioInputs.length === 0 && (
                <Alert severity="info">
                  No microphone is available to select.
                </Alert>
              )}
            <FormControl
              fullWidth
              disabled={
                audioInputs.length === 0 ||
                deviceSwitching !== null ||
                !mediaReady
              }
            >
              <InputLabel id="telehealth-call-microphone">
                Microphone
              </InputLabel>
              <Select
                labelId="telehealth-call-microphone"
                label="Microphone"
                value={audioDevice}
                onChange={(event) => {
                  const value = event.target.value;
                  void switchInputDevice("audio", value);
                }}
              >
                <MenuItem value="" disabled>
                  Current microphone
                </MenuItem>
                {audioInputs.map((device, index) => (
                  <MenuItem key={device.deviceId} value={device.deviceId}>
                    {device.label || `Microphone ${index + 1}`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {!devicesLoading &&
              !deviceLoadError &&
              videoInputs.length === 0 && (
                <Alert severity="info">No camera is available to select.</Alert>
              )}
            <FormControl
              fullWidth
              disabled={
                videoInputs.length === 0 ||
                deviceSwitching !== null ||
                !mediaReady
              }
            >
              <InputLabel id="telehealth-call-camera">Camera</InputLabel>
              <Select
                labelId="telehealth-call-camera"
                label="Camera"
                value={videoDevice}
                onChange={(event) => {
                  const value = event.target.value;
                  void switchInputDevice("video", value);
                }}
              >
                <MenuItem value="" disabled>
                  Current camera
                </MenuItem>
                {videoInputs.map((device, index) => (
                  <MenuItem key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${index + 1}`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDevicesOpen(false)}>Done</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
