import CallEndOutlinedIcon from "@mui/icons-material/CallEndOutlined";
import ExpandLessOutlinedIcon from "@mui/icons-material/ExpandLessOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import MicOffOutlinedIcon from "@mui/icons-material/MicOffOutlined";
import MicOutlinedIcon from "@mui/icons-material/MicOutlined";
import VideocamOffOutlinedIcon from "@mui/icons-material/VideocamOffOutlined";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { useClinicNavigation } from "../clinic/clinicNavigation";
import { useOptionalTelehealthSession } from "./TelehealthSessionProvider";
import { VideoStage } from "./VideoStage";

function callStateLabel(state: string) {
  if (state === "joining") return "Connecting";
  if (state === "joined") return "Connected";
  if (state === "reconnecting") return "Reconnecting";
  if (state === "leaving") return "Leaving";
  if (state === "ended") return "Call ended";
  if (state === "error") return "Connection needs attention";
  return "Preparing";
}

export function TelehealthDock() {
  const session = useOptionalTelehealthSession();
  const { navigate } = useClinicNavigation();
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  if (!session) return null;
  if (!session.active)
    return session.terminationNotice ? (
      <Alert
        severity="warning"
        onClose={session.dismissTerminationNotice}
        sx={{
          position: "fixed",
          right: { xs: 8, sm: 16 },
          bottom: { xs: "calc(8px + env(safe-area-inset-bottom))", sm: 16 },
          zIndex: (theme) => theme.zIndex.drawer + 3,
          maxWidth: 420,
        }}
      >
        {session.terminationNotice}
      </Alert>
    ) : null;
  const mediaControlsEnabled =
    session.authorizationStatus === "confirmed" &&
    session.callState === "joined";
  return (
    <Paper
      component="aside"
      aria-label={`Active video visit with ${session.active.patientName}`}
      elevation={8}
      sx={{
        position: "fixed",
        right: { xs: 8, sm: 16 },
        bottom: { xs: "calc(8px + env(safe-area-inset-bottom))", sm: 16 },
        zIndex: (theme) => theme.zIndex.drawer + 3,
        width: {
          xs: "calc(100vw - 16px)",
          sm: session.dockExpanded ? 460 : 360,
        },
        maxHeight: "calc(100vh - 32px)",
        overflow: "auto",
        border: 1,
        borderColor: "divider",
      }}
    >
      {session.dockExpanded && (
        <VideoStage
          participants={session.participants}
          label="Docked video visit"
          emptyTitle={
            session.callState === "reconnecting"
              ? "Reconnecting to the visit"
              : "Waiting for video"
          }
          emptyDescription={
            session.callState === "reconnecting"
              ? "The call will return here when the connection is stable."
              : "Participant video will appear after the call connects."
          }
          compact
        />
      )}
      {session.authorizationError && (
        <Alert severity="warning" sx={{ borderRadius: 0 }}>
          {session.authorizationError}
        </Alert>
      )}
      <Stack
        direction="row"
        spacing={0.5}
        useFlexGap
        sx={{
          alignItems: "center",
          flexWrap: { xs: "wrap", sm: "nowrap" },
          p: 1,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" noWrap>
            {session.active.patientName}
          </Typography>
          <Chip
            size="small"
            variant="outlined"
            color={
              session.callState === "joined"
                ? "success"
                : session.callState === "error"
                  ? "error"
                  : "default"
            }
            label={callStateLabel(session.callState)}
            aria-live="polite"
            sx={{ mt: 0.5, height: 24 }}
          />
        </Box>
        <Tooltip
          title={
            session.dockExpanded ? "Hide video preview" : "Show video preview"
          }
        >
          <IconButton
            aria-label={
              session.dockExpanded ? "Hide video preview" : "Show video preview"
            }
            aria-pressed={session.dockExpanded}
            onClick={() => session.setDockExpanded(!session.dockExpanded)}
          >
            {session.dockExpanded ? (
              <ExpandMoreOutlinedIcon />
            ) : (
              <ExpandLessOutlinedIcon />
            )}
          </IconButton>
        </Tooltip>
        <Tooltip
          title={
            session.microphoneEnabled ? "Mute microphone" : "Unmute microphone"
          }
        >
          <IconButton
            aria-label={
              session.microphoneEnabled
                ? "Mute microphone"
                : "Unmute microphone"
            }
            disabled={!mediaControlsEnabled}
            aria-pressed={!session.microphoneEnabled}
            onClick={() => void session.toggleMicrophone()}
          >
            {session.microphoneEnabled ? (
              <MicOutlinedIcon />
            ) : (
              <MicOffOutlinedIcon />
            )}
          </IconButton>
        </Tooltip>
        <Tooltip
          title={session.cameraEnabled ? "Turn camera off" : "Turn camera on"}
        >
          <IconButton
            aria-label={
              session.cameraEnabled ? "Turn camera off" : "Turn camera on"
            }
            disabled={!mediaControlsEnabled}
            aria-pressed={!session.cameraEnabled}
            onClick={() => void session.toggleCamera()}
          >
            {session.cameraEnabled ? (
              <VideocamOutlinedIcon />
            ) : (
              <VideocamOffOutlinedIcon />
            )}
          </IconButton>
        </Tooltip>
        <Tooltip title="Leave call">
          <IconButton
            color="error"
            aria-label="Leave call"
            onClick={() => setLeaveConfirm(true)}
          >
            <CallEndOutlinedIcon />
          </IconButton>
        </Tooltip>
        <Button
          size="small"
          onClick={() => navigate(session.active!.returnPath)}
          sx={{ width: { xs: "100%", sm: "auto" } }}
        >
          Return to visit
        </Button>
      </Stack>
      <Dialog open={leaveConfirm} onClose={() => setLeaveConfirm(false)}>
        <DialogTitle>Leave this call?</DialogTitle>
        <DialogContent>
          Other participants may remain connected. Leaving the call does not
          close the encounter.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLeaveConfirm(false)}>Stay in call</Button>
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
    </Paper>
  );
}
