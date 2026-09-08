import { useEffect, useState } from "react";
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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tooltip,
} from "@mui/material";
import { useTelehealthSession } from "./TelehealthSessionProvider";

export function CallControls({
  allowScreenShare,
  showParticipants,
  onShowParticipants,
  showParticipantsControl = true,
  onLeave,
  onEnd,
  canEnd,
  busy = false,
}: {
  allowScreenShare: boolean;
  showParticipants: boolean;
  onShowParticipants: () => void;
  showParticipantsControl?: boolean;
  onLeave: () => void;
  onEnd?: () => void;
  canEnd?: boolean;
  busy?: boolean;
}) {
  const session = useTelehealthSession();
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevice, setAudioDevice] = useState("");
  const [videoDevice, setVideoDevice] = useState("");
  const joined =
    (session.callState === "joined" || session.callState === "reconnecting") &&
    session.authorizationStatus === "confirmed";

  useEffect(() => {
    if (!devicesOpen || !navigator.mediaDevices?.enumerateDevices) return;
    void navigator.mediaDevices
      .enumerateDevices()
      .then(setDevices)
      .catch(() => setDevices([]));
  }, [devicesOpen]);

  return (
    <Box
      component="section"
      aria-label="Call controls"
      sx={{ bgcolor: "grey.950", color: "common.white", p: 1.25 }}
    >
      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        sx={{ flexWrap: "wrap", justifyContent: "center" }}
      >
        <Tooltip
          title={
            session.microphoneEnabled ? "Mute microphone" : "Unmute microphone"
          }
        >
          <Button
            color="inherit"
            variant={session.microphoneEnabled ? "outlined" : "contained"}
            startIcon={
              session.microphoneEnabled ? (
                <MicOutlinedIcon />
              ) : (
                <MicOffOutlinedIcon />
              )
            }
            disabled={!joined || busy}
            onClick={() => void session.toggleMicrophone()}
          >
            {session.microphoneEnabled
              ? "Mute microphone"
              : "Unmute microphone"}
          </Button>
        </Tooltip>
        <Tooltip
          title={session.cameraEnabled ? "Turn camera off" : "Turn camera on"}
        >
          <Button
            color="inherit"
            variant={session.cameraEnabled ? "outlined" : "contained"}
            startIcon={
              session.cameraEnabled ? (
                <VideocamOutlinedIcon />
              ) : (
                <VideocamOffOutlinedIcon />
              )
            }
            disabled={!joined || busy}
            onClick={() => void session.toggleCamera()}
          >
            {session.cameraEnabled ? "Turn camera off" : "Turn camera on"}
          </Button>
        </Tooltip>
        <Button
          color="inherit"
          startIcon={<DevicesOutlinedIcon />}
          disabled={!joined || busy}
          onClick={() => setDevicesOpen(true)}
        >
          Devices
        </Button>
        {allowScreenShare && (
          <Button
            color={session.screenShareEnabled ? "warning" : "inherit"}
            variant={session.screenShareEnabled ? "contained" : "text"}
            startIcon={
              session.screenShareEnabled ? (
                <StopScreenShareOutlinedIcon />
              ) : (
                <PresentToAllOutlinedIcon />
              )
            }
            disabled={!joined || busy}
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
            startIcon={<PeopleOutlineOutlinedIcon />}
            disabled={!joined || busy}
            onClick={onShowParticipants}
          >
            Participants
          </Button>
        )}
        <Button
          color="inherit"
          startIcon={<CallEndOutlinedIcon />}
          disabled={!joined || busy}
          onClick={onLeave}
        >
          Leave call
        </Button>
        {canEnd && onEnd && (
          <Button
            color="error"
            variant="contained"
            startIcon={<CallEndOutlinedIcon />}
            disabled={!joined || busy}
            onClick={onEnd}
          >
            End for everyone
          </Button>
        )}
      </Stack>
      {session.error && (
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
            <FormControl fullWidth>
              <InputLabel id="telehealth-call-microphone">
                Microphone
              </InputLabel>
              <Select
                labelId="telehealth-call-microphone"
                label="Microphone"
                value={audioDevice}
                onChange={(event) => {
                  const value = event.target.value;
                  setAudioDevice(value);
                  void session.selectInputDevice("audio", value);
                }}
              >
                {devices
                  .filter((device) => device.kind === "audioinput")
                  .map((device, index) => (
                    <MenuItem key={device.deviceId} value={device.deviceId}>
                      {device.label || `Microphone ${index + 1}`}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel id="telehealth-call-camera">Camera</InputLabel>
              <Select
                labelId="telehealth-call-camera"
                label="Camera"
                value={videoDevice}
                onChange={(event) => {
                  const value = event.target.value;
                  setVideoDevice(value);
                  void session.selectInputDevice("video", value);
                }}
              >
                {devices
                  .filter((device) => device.kind === "videoinput")
                  .map((device, index) => (
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
