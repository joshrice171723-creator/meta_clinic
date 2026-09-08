import PersonAddAltOutlinedIcon from "@mui/icons-material/PersonAddAltOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  InputLabel,
  List,
  ListItem,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { useState } from "react";
import type {
  TelehealthMediaParticipant,
  TelehealthParticipant,
} from "./types";

function roleLabel(role: string) {
  if (role === "patient") return "Patient";
  if (role === "clinician") return "Clinician";
  if (role === "care_team") return "Care team";
  return role
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function statusLabel(status: TelehealthParticipant["status"]) {
  if (status === "eligible") return "Invited";
  if (status === "waiting") return "Waiting to join";
  if (status === "admitted") return "Admitted";
  if (status === "left") return "Left call";
  if (status === "removed") return "Access removed";
  return status;
}

export function ParticipantPanel({
  participants,
  mediaParticipants,
  canRemove,
  onRemove,
  eligibleCareTeam = [],
  canAdd = false,
  onAdd,
  busy = false,
}: {
  participants: TelehealthParticipant[];
  mediaParticipants: TelehealthMediaParticipant[];
  canRemove: boolean;
  onRemove?: (participantId: string) => void;
  eligibleCareTeam?: { membershipId: number; displayName: string }[];
  canAdd?: boolean;
  onAdd?: (membershipId: number) => Promise<void> | void;
  busy?: boolean;
}) {
  const [selected, setSelected] = useState("");
  const [adding, setAdding] = useState(false);
  return (
    <Stack spacing={2}>
      <div>
        <Typography variant="h6">Participants</Typography>
        <Typography variant="body2" color="text.secondary">
          Review who can enter the visit and who is currently connected.
        </Typography>
      </div>
      <List disablePadding>
        {participants.map((participant, index) => {
          const media = mediaParticipants.find(
            (candidate) =>
              Boolean(participant.provider_subject_id) &&
              candidate.providerSubjectId === participant.provider_subject_id,
          );
          return (
            <div key={participant.id}>
              {index > 0 && <Divider />}
              <ListItem disableGutters>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  sx={{
                    width: "100%",
                    alignItems: { sm: "center" },
                    justifyContent: "space-between",
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600 }}>
                      {participant.display_name || "Name unavailable"}
                      {participant.is_current ? " (you)" : ""}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {roleLabel(participant.role)}
                    </Typography>
                    <Stack
                      direction="row"
                      spacing={0.75}
                      useFlexGap
                      sx={{ mt: 0.75, flexWrap: "wrap" }}
                    >
                      <Chip
                        size="small"
                        variant="outlined"
                        label={statusLabel(participant.status)}
                      />
                      {media && (
                        <Chip
                          size="small"
                          color="success"
                          variant="outlined"
                          label={
                            media.videoTrack
                              ? "Camera on"
                              : media.audioTrack
                                ? "Audio only"
                                : "Connected"
                          }
                        />
                      )}
                    </Stack>
                  </Box>
                  {canRemove &&
                    !participant.is_current &&
                    participant.status !== "removed" && (
                      <Button
                        color="error"
                        size="small"
                        disabled={busy}
                        onClick={() => onRemove?.(participant.id)}
                        sx={{ alignSelf: { xs: "flex-start", sm: "center" } }}
                      >
                        Remove access
                      </Button>
                    )}
                </Stack>
              </ListItem>
            </div>
          );
        })}
      </List>
      {participants.length === 0 && (
        <Alert severity="info">No participant roster is available.</Alert>
      )}
      {canAdd && eligibleCareTeam.length > 0 && (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <FormControl size="small" fullWidth>
            <InputLabel id="telehealth-add-participant-label">
              Care-team member
            </InputLabel>
            <Select
              labelId="telehealth-add-participant-label"
              label="Care-team member"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              {eligibleCareTeam.map((member) => (
                <MenuItem
                  key={member.membershipId}
                  value={String(member.membershipId)}
                >
                  {member.displayName}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="outlined"
            startIcon={<PersonAddAltOutlinedIcon />}
            disabled={!selected || busy || adding}
            onClick={async () => {
              const membershipId = Number(selected);
              setAdding(true);
              try {
                await onAdd?.(membershipId);
                setSelected("");
              } catch {
                // The visit page presents the server error and keeps this selection.
              } finally {
                setAdding(false);
              }
            }}
          >
            {adding ? (
              <>
                <CircularProgress size={18} sx={{ mr: 1 }} />
                Adding…
              </>
            ) : (
              "Add care-team member"
            )}
          </Button>
        </Stack>
      )}
      {canAdd && eligibleCareTeam.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No other care-team members are available to add to this visit.
        </Typography>
      )}
    </Stack>
  );
}
