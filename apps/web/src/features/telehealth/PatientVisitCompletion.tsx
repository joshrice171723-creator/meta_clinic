import AssignmentTurnedInOutlinedIcon from "@mui/icons-material/AssignmentTurnedInOutlined";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import SupportAgentOutlinedIcon from "@mui/icons-material/SupportAgentOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useState } from "react";
import type {
  PatientTelehealthCompletion,
  TelehealthVisitStatus,
} from "./types";

export type PatientVisitCompletionData = PatientTelehealthCompletion;

type CompletionSupport = {
  label: string;
  phone?: string | null;
  url?: string | null;
} | null;

export type PatientVisitCompletionProps = {
  visitStatus: TelehealthVisitStatus;
  completion: PatientVisitCompletionData | null;
  support: CompletionSupport;
  stale?: boolean;
  onRefresh: () => Promise<void> | void;
};

function dateTimeLabel(value: string | null, timezone?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(date);
  } catch {
    return null;
  }
}

function safeContactHref(support: CompletionSupport) {
  const phone = support?.phone?.trim().replace(/[^\d+]/g, "");
  if (phone && /^\+?\d{7,15}$/.test(phone)) return `tel:${phone}`;
  const url = support?.url?.trim();
  if (
    url &&
    ((url.startsWith("/") && !url.startsWith("//")) || /^https:\/\//i.test(url))
  )
    return url;
  return null;
}

function completionHeading(status: TelehealthVisitStatus) {
  if (status === "ending") return "Your video visit is ending";
  if (status === "ended") return "Your video visit has ended";
  if (status === "cancelled") return "This video visit was cancelled";
  if (status === "no_show") return "Your appointment needs follow-up";
  return "Video visit update";
}

function completionDescription(status: TelehealthVisitStatus) {
  if (status === "ending")
    return "Your care team is confirming that the call has ended. This page updates automatically.";
  if (status === "ended")
    return "The call is closed. Released after-visit information appears below.";
  if (status === "cancelled")
    return "This appointment was cancelled. Use your portal or the clinic contact below if you need another time.";
  if (status === "no_show")
    return "This appointment was recorded as missed. Use your portal or contact the clinic about next steps.";
  return "Check your appointments for the latest visit status.";
}

function outcomeLabel(outcome: PatientVisitCompletionData["outcome"]) {
  if (outcome === "completed") return "Visit completed";
  if (outcome === "technical_failure") return "Connection issue recorded";
  if (outcome === "follow_up_needed") return "Follow-up needed";
  return null;
}

function FollowUp({ completion }: { completion: PatientVisitCompletionData }) {
  const appointment = completion.follow_up_appointment;
  const appointmentTime = appointment
    ? dateTimeLabel(appointment.starts_at, appointment.timezone)
    : null;

  if (completion.follow_up_status === "none") {
    return (
      <Typography color="text.secondary">
        No additional follow-up is listed in this released summary.
      </Typography>
    );
  }

  return (
    <Stack spacing={1}>
      {completion.follow_up_plan && (
        <Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {completion.follow_up_plan}
        </Typography>
      )}
      {completion.follow_up_status === "needed" &&
        !completion.follow_up_plan && (
          <Typography color="text.secondary">
            Your clinic marked follow-up as needed. Contact the clinic for the
            finalized plan.
          </Typography>
        )}
      {completion.follow_up_status === "arranged" && appointment && (
        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Typography sx={{ fontWeight: 700 }}>
            Follow-up appointment
          </Typography>
          <Typography color="text.secondary">
            {appointmentTime ||
              "The appointment time is available in your portal."}
          </Typography>
          {appointment.clinician?.display_name && (
            <Typography variant="body2" color="text.secondary">
              {appointment.clinician.display_name}
            </Typography>
          )}
        </Paper>
      )}
    </Stack>
  );
}

export function PatientVisitCompletion({
  visitStatus,
  completion,
  support,
  stale = false,
  onRefresh,
}: PatientVisitCompletionProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const ending = visitStatus === "ending";
  const ready = !ending && completion?.status === "ready";
  const publishedAt = ready ? dateTimeLabel(completion.published_at) : null;
  const contactHref = safeContactHref(support);
  const outcome = ready ? outcomeLabel(completion.outcome) : null;

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      await onRefresh();
    } catch (reason) {
      setRefreshError(
        reason instanceof Error
          ? reason.message
          : "The latest visit information could not be confirmed.",
      );
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Stack spacing={2} sx={{ maxWidth: 760, mx: "auto", p: { xs: 2, sm: 3 } }}>
      <Box component="header">
        <Stack
          direction="row"
          spacing={1.25}
          sx={{ alignItems: "center", mb: 1 }}
        >
          {visitStatus === "ended" ? (
            <AssignmentTurnedInOutlinedIcon
              color="success"
              aria-hidden="true"
            />
          ) : visitStatus === "cancelled" ? (
            <EventBusyOutlinedIcon color="disabled" aria-hidden="true" />
          ) : (
            <ScheduleOutlinedIcon color="action" aria-hidden="true" />
          )}
          <Typography variant="h4" component="h1">
            {completionHeading(visitStatus)}
          </Typography>
        </Stack>
        <Typography color="text.secondary" sx={{ maxWidth: "62ch" }}>
          {completionDescription(visitStatus)}
        </Typography>
      </Box>

      {stale && (
        <Alert severity="warning">
          The latest refresh failed. This page is showing the last confirmed
          visit information.
        </Alert>
      )}

      {ready ? (
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack spacing={2} divider={<Divider flexItem />}>
            <Box>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                sx={{ alignItems: { sm: "center" }, mb: 1 }}
              >
                <Typography variant="h5" component="h2" sx={{ flex: 1 }}>
                  After-visit information
                </Typography>
                {outcome && (
                  <Chip size="small" label={outcome} variant="outlined" />
                )}
              </Stack>
              {publishedAt && (
                <Typography variant="body2" color="text.secondary">
                  Released {publishedAt}
                </Typography>
              )}
            </Box>
            <Box>
              <Typography variant="h6" component="h3" sx={{ mb: 1 }}>
                Instructions
              </Typography>
              <Typography
                sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
              >
                {completion.instructions ||
                  "No additional patient instructions were included in this released summary."}
              </Typography>
            </Box>
            <Box>
              <Typography variant="h6" component="h3" sx={{ mb: 1 }}>
                Follow-up
              </Typography>
              <FollowUp completion={completion} />
            </Box>
          </Stack>
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack spacing={1.5}>
            <Typography variant="h5" component="h2">
              {ending ? "Confirming visit status" : "After-visit information"}
            </Typography>
            <Typography color="text.secondary">
              {ending
                ? "Stay on this page while the clinic confirms the call status."
                : "Your care team has not released finalized patient instructions or a follow-up plan yet. Check again here or in your patient portal."}
            </Typography>
            {!ending && (
              <Button
                variant="outlined"
                sx={{ alignSelf: "flex-start" }}
                disabled={refreshing}
                startIcon={
                  refreshing ? <CircularProgress size={18} /> : undefined
                }
                onClick={() => void refresh()}
              >
                {refreshing ? "Checking…" : "Check for updates"}
              </Button>
            )}
          </Stack>
        </Paper>
      )}

      {refreshError && <Alert severity="error">{refreshError}</Alert>}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          useFlexGap
          sx={{ alignItems: { sm: "center" }, flexWrap: "wrap" }}
        >
          <Button variant="contained" href="/patient-portal#appointments">
            Return to appointments
          </Button>
          {ready && (
            <Button href="/patient-portal#visit-instructions">
              View after-visit instructions
            </Button>
          )}
          {support &&
            (contactHref ? (
              <Button
                color="inherit"
                startIcon={<SupportAgentOutlinedIcon />}
                href={contactHref}
              >
                {support.label}
              </Button>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {support.phone
                  ? `${support.label}: ${support.phone}`
                  : `${support.label} contact details are unavailable.`}
              </Typography>
            ))}
        </Stack>
      </Paper>
    </Stack>
  );
}
