import { useEffect, useRef, type RefObject } from "react";
import VideocamOffOutlinedIcon from "@mui/icons-material/VideocamOffOutlined";
import { Box, Paper, Stack, Typography } from "@mui/material";
import type { TelehealthMediaParticipant } from "./types";

function MediaTrack({
  track,
  muted = false,
  label,
  kind,
}: {
  track: MediaStreamTrack;
  muted?: boolean;
  label: string;
  kind: "audio" | "video";
}) {
  const ref = useRef<HTMLMediaElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.srcObject = new MediaStream([track]);
    const play = element.play();
    if (play) void play.catch(() => undefined);
    return () => {
      element.srcObject = null;
    };
  }, [track]);
  return kind === "video" ? (
    <video
      ref={ref as RefObject<HTMLVideoElement | null>}
      autoPlay
      playsInline
      muted={muted}
      aria-label={label}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block",
      }}
    />
  ) : (
    <audio
      ref={ref as RefObject<HTMLAudioElement | null>}
      autoPlay
      aria-label={label}
    />
  );
}

function ParticipantTile({
  participant,
  compact = false,
}: {
  participant: TelehealthMediaParticipant;
  compact?: boolean;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        position: "relative",
        overflow: "hidden",
        aspectRatio: "16 / 9",
        minHeight: compact ? 108 : 180,
        bgcolor: "grey.900",
        color: "common.white",
        borderColor: "grey.700",
      }}
    >
      {participant.videoTrack ? (
        <MediaTrack
          track={participant.videoTrack}
          muted={participant.isLocal}
          label={`${participant.displayName || (participant.isLocal ? "Your" : "Participant")} video`}
          kind="video"
        />
      ) : (
        <Stack
          sx={{
            height: "100%",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <VideocamOffOutlinedIcon aria-hidden="true" />
          <Typography variant="body2" sx={{ mt: 1 }}>
            Camera off
          </Typography>
        </Stack>
      )}
      <Box
        sx={{
          position: "absolute",
          left: 8,
          bottom: 8,
          bgcolor: "rgba(0, 0, 0, .7)",
          px: 1,
          py: 0.5,
          borderRadius: 1,
        }}
      >
        <Typography variant="caption">
          {participant.displayName ||
            (participant.isLocal ? "You" : "Participant")}
        </Typography>
      </Box>
    </Paper>
  );
}

export function VideoStage({
  participants,
  label = "Video visit",
  emptyTitle = "Waiting for video",
  emptyDescription = "Participant video will appear here after the call connects.",
  compact = false,
}: {
  participants: TelehealthMediaParticipant[];
  label?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  compact?: boolean;
}) {
  const screen = participants.find(
    (participant) => participant.screenVideoTrack,
  );
  const visible = participants;
  return (
    <Box
      component="section"
      aria-label={label}
      sx={{ minWidth: 0, bgcolor: "grey.950" }}
    >
      {screen?.screenVideoTrack ? (
        <Stack spacing={1} sx={{ p: compact ? 0.5 : 1 }}>
          <Paper
            variant="outlined"
            sx={{
              overflow: "hidden",
              aspectRatio: "16 / 9",
              maxHeight: compact ? 220 : { xs: 360, md: 560 },
            }}
          >
            <MediaTrack
              track={screen.screenVideoTrack}
              muted={screen.isLocal}
              label={`${screen.displayName || "Participant"} shared screen`}
              kind="video"
            />
          </Paper>
          <Stack direction="row" spacing={1} sx={{ overflowX: "auto" }}>
            {visible.map((participant) => (
              <Box
                key={participant.participantId}
                sx={{ width: compact ? 128 : 180, flex: "0 0 auto" }}
              >
                <ParticipantTile participant={participant} compact />
              </Box>
            ))}
          </Stack>
        </Stack>
      ) : visible.length ? (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns:
              visible.length > 1 ? { xs: "1fr", sm: "repeat(2, 1fr)" } : "1fr",
            gap: compact ? 0.5 : 1,
            p: compact ? 0.5 : 1,
          }}
        >
          {visible.map((participant) => (
            <ParticipantTile
              key={participant.participantId}
              participant={participant}
              compact={compact}
            />
          ))}
        </Box>
      ) : (
        <Stack
          role="status"
          sx={{
            minHeight: compact ? 160 : { xs: 260, md: 460 },
            alignItems: "center",
            justifyContent: "center",
            color: "grey.300",
            px: 3,
            textAlign: "center",
          }}
        >
          <VideocamOffOutlinedIcon fontSize="large" aria-hidden="true" />
          <Typography variant="subtitle1" sx={{ mt: 1 }}>
            {emptyTitle}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5, color: "grey.400" }}>
            {emptyDescription}
          </Typography>
        </Stack>
      )}
      {participants
        .filter((participant) => !participant.isLocal && participant.audioTrack)
        .map((participant) => (
          <MediaTrack
            key={`${participant.participantId}-audio`}
            track={participant.audioTrack!}
            label={`${participant.displayName || "Participant"} audio`}
            kind="audio"
          />
        ))}
    </Box>
  );
}
