import PersonAddAltOutlinedIcon from "@mui/icons-material/PersonAddAltOutlined";
import {
  Alert,
  Button,
  Divider,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemText,
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
  onAdd?: (membershipId: number) => void;
  busy?: boolean;
}) {
  const [selected, setSelected] = useState("");
  return (
    <Stack spacing={2}>
      <div>
        <Typography variant="h6">Participants</Typography>
        <Typography variant="body2" color="text.secondary">
          Everyone admitted to this visit is listed here.
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
              <ListItem
                disableGutters
                secondaryAction={
                  canRemove &&
                  !participant.is_current &&
                  participant.status !== "removed" ? (
                    <Button
                      color="error"
                      size="small"
                      disabled={busy}
                      onClick={() => onRemove?.(participant.id)}
                    >
                      Remove from call
                    </Button>
                  ) : undefined
                }
              >
                <ListItemText
                  primary={participant.display_name || "Name unavailable"}
                  secondary={`${participant.role.replaceAll("_", " ")} · ${participant.status.replaceAll("_", " ")}${media ? " · Media connected" : ""}`}
                  sx={{ pr: canRemove ? 18 : 0 }}
                />
              </ListItem>
            </div>
          );
        })}
      </List>
      {participants.length === 0 && (
        <Alert severity="info">No participant roster is available.</Alert>
      )}
      {canAdd && (
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
            disabled={!selected || busy}
            onClick={() => {
              const membershipId = Number(selected);
              setSelected("");
              onAdd?.(membershipId);
            }}
          >
            Add care-team member
          </Button>
        </Stack>
      )}
      {canAdd && eligibleCareTeam.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No eligible care-team roster was returned for this visit.
        </Typography>
      )}
    </Stack>
  );
}
