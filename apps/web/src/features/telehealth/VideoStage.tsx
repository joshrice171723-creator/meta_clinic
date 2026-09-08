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
}: {
  participant: TelehealthMediaParticipant;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        position: "relative",
        overflow: "hidden",
        minHeight: 180,
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
            minHeight: 180,
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
}: {
  participants: TelehealthMediaParticipant[];
  label?: string;
}) {
  const screen = participants.find(
    (participant) => participant.screenVideoTrack,
  );
  const visible = participants.filter(
    (participant) => participant.videoTrack || participant.isLocal,
  );
  return (
    <Box
      component="section"
      aria-label={label}
      sx={{ minWidth: 0, bgcolor: "grey.950" }}
    >
      {screen?.screenVideoTrack ? (
        <Stack spacing={1} sx={{ p: 1 }}>
          <Paper
            variant="outlined"
            sx={{ overflow: "hidden", minHeight: { xs: 260, md: 460 } }}
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
                sx={{ width: 180, flex: "0 0 auto" }}
              >
                <ParticipantTile participant={participant} />
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
            gap: 1,
            p: 1,
          }}
        >
          {visible.map((participant) => (
            <ParticipantTile
              key={participant.participantId}
              participant={participant}
            />
          ))}
        </Box>
      ) : (
        <Stack
          role="status"
          sx={{
            minHeight: { xs: 260, md: 460 },
            alignItems: "center",
            justifyContent: "center",
            color: "grey.300",
          }}
        >
          <VideocamOffOutlinedIcon fontSize="large" aria-hidden="true" />
          <Typography sx={{ mt: 1 }}>
            No participant video is available.
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
