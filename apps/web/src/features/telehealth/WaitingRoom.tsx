import { useEffect, useRef } from "react";
import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import { useTelehealthDevices } from "./useTelehealthDevices";
import type { TelehealthVisit, TelehealthAllowedAction } from "./types";

export function WaitingRoom({
  visit,
  allowedActions,
  busy,
  error,
  onUpdatePreparation,
  onLeave,
  onJoin,
}: {
  visit: TelehealthVisit;
  allowedActions: TelehealthAllowedAction[];
  busy: boolean;
  error?: string | null;
  onUpdatePreparation: () => void;
  onLeave: () => Promise<void>;
  onJoin: () => Promise<void>;
}) {
  const check = useTelehealthDevices();
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = check.stream;
    if (check.stream) void videoRef.current.play().catch(() => undefined);
  }, [check.stream]);
  const canJoin = allowedActions.includes("telehealth.join");
  return (
    <Stack spacing={2}>
      <Alert severity="info">
        {canJoin
          ? "Your care team is ready. Join when you are ready."
          : "You're checked in. Waiting for your care team."}
      </Alert>
      <Typography>
        Scheduled{" "}
        {new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: visit.appointment.timezone,
        }).format(new Date(visit.appointment.starts_at))}{" "}
        ({visit.appointment.timezone})
      </Typography>
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
            aria-label="Waiting room camera preview"
            style={{ width: "100%", maxHeight: 360, objectFit: "cover" }}
          />
        ) : (
          <Typography color="grey.300">Camera preview is off</Typography>
        )}
      </Box>
      <Button
        variant="outlined"
        disabled={busy || check.requesting}
        onClick={() =>
          check.stream
            ? check.stop()
            : void check.enable().catch(() => undefined)
        }
      >
        {check.requesting
          ? "Opening preview…"
          : check.stream
            ? "Turn off preview"
            : "Preview camera and microphone"}
      </Button>
      <Typography variant="body2" color="text.secondary">
        The preview stays on this device. Your care team receives audio and
        video only after you join.
      </Typography>
      {canJoin ? (
        <Button
          variant="contained"
          size="large"
          disabled={busy}
          onClick={() => {
            check.stop();
            void onJoin().catch(() => undefined);
          }}
        >
          {busy
            ? "Joining…"
            : visit.access_state === "rejoin"
              ? "Rejoin visit"
              : "Join video visit"}
        </Button>
      ) : (
        <Typography role="status" color="text.secondary">
          This page updates automatically. The join button appears when your
          care team admits you.
        </Typography>
      )}
      {(check.error || error) && (
        <Alert severity="error">{check.error || error}</Alert>
      )}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        useFlexGap
        sx={{ flexWrap: "wrap" }}
      >
        <Button disabled={busy} onClick={onUpdatePreparation}>
          Update location or callback
        </Button>
        <Button
          color="inherit"
          disabled={busy}
          onClick={() => void onLeave().catch(() => undefined)}
        >
          Leave waiting room
        </Button>
        {visit.support?.url ? (
          <Button href={visit.support.url} rel="noreferrer">
            {visit.support.label}
          </Button>
        ) : visit.support?.phone ? (
          <Button href={`tel:${visit.support.phone}`}>
            {visit.support.label}
          </Button>
        ) : null}
        <Button href="/patient-portal#appointments">
          Request an appointment change
        </Button>
      </Stack>
    </Stack>
  );
}
