import { useEffect, useRef } from "react";
import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import { useTelehealthDevices } from "./useTelehealthDevices";
import type { TelehealthVisit } from "./types";

export function WaitingRoom({
  visit,
  busy,
  error,
  onUpdatePreparation,
  onLeave,
  onJoin,
}: {
  visit: TelehealthVisit;
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
  const canJoin =
    visit.access_state === "join" ||
    visit.access_state === "rejoin" ||
    visit.current_step === "call";
  return (
    <Stack spacing={2}>
      <Alert severity="info">
        You're checked in. Waiting for your care team.
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
      <Button variant="outlined" onClick={() => void check.enable()}>
        Enable camera and microphone
      </Button>
      {canJoin ? (
        <Button
          variant="contained"
          size="large"
          disabled={busy}
          onClick={() => void onJoin()}
        >
          {busy
            ? "Joining…"
            : visit.access_state === "rejoin"
              ? "Rejoin visit"
              : "Join video visit"}
        </Button>
      ) : (
        <Typography role="status" color="text.secondary">
          Camera and microphone access will be requested only after your care
          team admits you.
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
        <Button onClick={onUpdatePreparation}>
          Update location or callback
        </Button>
        <Button color="inherit" disabled={busy} onClick={() => void onLeave()}>
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
