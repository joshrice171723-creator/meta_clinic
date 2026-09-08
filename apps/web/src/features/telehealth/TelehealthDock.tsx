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
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useOptionalTelehealthSession } from "./TelehealthSessionProvider";
import { VideoStage } from "./VideoStage";

export function TelehealthDock() {
  const session = useOptionalTelehealthSession();
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
  const mediaControlsEnabled = session.authorizationStatus === "confirmed";
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
          sm: session.dockExpanded ? 420 : 340,
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
        />
      )}
      {session.authorizationError && (
        <Alert severity="warning" sx={{ borderRadius: 0 }}>
          {session.authorizationError}
        </Alert>
      )}
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", p: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" noWrap>
            {session.active.patientName}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            aria-live="polite"
          >
            {session.callState.replaceAll("_", " ")}
          </Typography>
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
            onClick={() => void session.leave(true)}
          >
            <CallEndOutlinedIcon />
          </IconButton>
        </Tooltip>
        <Button size="small" href={session.active.returnPath}>
          Return
        </Button>
      </Stack>
    </Paper>
  );
}
