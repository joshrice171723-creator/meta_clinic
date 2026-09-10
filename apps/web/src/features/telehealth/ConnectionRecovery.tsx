import ReplayOutlinedIcon from "@mui/icons-material/ReplayOutlined";
import SupportAgentOutlinedIcon from "@mui/icons-material/SupportAgentOutlined";
import {
  Alert,
  AlertTitle,
  Button,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";

export type ConnectionRecoveryState = "reconnecting" | "disconnected";

export type ConnectionRecoveryProps = {
  state: ConnectionRecoveryState;
  retrying: boolean;
  message?: string | null;
  onRetry: () => Promise<void>;
  onLeave?: () => void;
  contact?: {
    label: string;
    phone?: string | null;
  };
  compact?: boolean;
};

function safePhoneHref(value?: string | null) {
  if (!value) return null;
  const normalized = value.trim().replace(/[^\d+]/g, "");
  return /^\+?\d{7,15}$/.test(normalized) ? `tel:${normalized}` : null;
}

export function ConnectionRecovery({
  state,
  retrying,
  message,
  onRetry,
  onLeave,
  contact,
  compact = false,
}: ConnectionRecoveryProps) {
  const reconnecting = state === "reconnecting";
  const phoneHref = safePhoneHref(contact?.phone);

  return (
    <Alert
      severity={reconnecting ? "warning" : "error"}
      role={reconnecting ? "status" : "alert"}
      aria-live={reconnecting ? "polite" : "assertive"}
      sx={{ borderRadius: compact ? 0 : 1 }}
    >
      <AlertTitle>
        {retrying
          ? "Reauthorizing the video visit"
          : reconnecting
            ? "Video connection interrupted"
            : "Video call disconnected"}
      </AlertTitle>
      <Typography variant="body2">
        {message ||
          (reconnecting
            ? "Meta Clinic is trying to restore the connection. You can request a new secure connection if it does not return."
            : "Request a new secure connection to rejoin this same visit. The encounter and notes stay in place.")}
      </Typography>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        useFlexGap
        sx={{ mt: 1.5, alignItems: { sm: "center" }, flexWrap: "wrap" }}
      >
        <Button
          color={reconnecting ? "warning" : "error"}
          variant="contained"
          startIcon={
            retrying ? (
              <CircularProgress size={18} color="inherit" />
            ) : (
              <ReplayOutlinedIcon />
            )
          }
          disabled={retrying}
          onClick={() => void onRetry().catch(() => undefined)}
        >
          {retrying ? "Reconnecting…" : "Retry secure connection"}
        </Button>
        {onLeave && (
          <Button color="inherit" disabled={retrying} onClick={onLeave}>
            Leave call
          </Button>
        )}
        {contact &&
          (phoneHref ? (
            <Button
              color="inherit"
              startIcon={<SupportAgentOutlinedIcon />}
              href={phoneHref}
            >
              {contact.label}
            </Button>
          ) : (
            <Typography variant="caption" color="text.secondary">
              {contact.phone
                ? `${contact.label}: ${contact.phone}`
                : `${contact.label} details are unavailable.`}
            </Typography>
          ))}
      </Stack>
    </Alert>
  );
}
