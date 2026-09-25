import { useState } from "react";
import {
  Alert,
  Button,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { LoadState, useResource } from "../../shared/ui";

type Setup = {
  clinicians: { id: number; display_name: string; membership_id: number }[];
  candidates: { membership_id: number; label: string }[];
  sites: { id: number; name: string }[];
};

export function ClinicianSetup() {
  const { data, error, refresh } = useResource<Setup>(
    "/api/clinic/clinicians?setup=true",
  );
  const [member, setMember] = useState("");
  const [site, setSite] = useState("");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    error: boolean;
    text: string;
  } | null>(null);
  if (!data) return <LoadState error={error} />;
  async function save() {
    setSaving(true);
    try {
      await api("/api/clinic/clinicians", {
        method: "POST",
        body: {
          clinician: {
            membership_id: Number(member),
            site_id: Number(site),
            display_name: name,
            department,
          },
        },
      });
      setFeedback({
        error: false,
        text: "Clinician added for scheduling. Set their working hours before offering appointments; capacity limits are optional.",
      });
      refresh();
    } catch (reason) {
      setFeedback({
        error: true,
        text:
          reason instanceof Error
            ? reason.message
            : "Unable to save clinician.",
      });
    } finally {
      setSaving(false);
    }
  }
  return (
    <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h2">Clinicians for scheduling</Typography>
        <Typography color="text.secondary">
          Invite and activate the clinician in Workforce first. Select their
          existing authorized account and location here. This does not verify
          credentials or grant clinical access.
        </Typography>
        {data.clinicians.map((item) => (
          <Typography key={item.id}>
            {item.display_name} · ready to configure availability
          </Typography>
        ))}
        {feedback && (
          <Alert
            severity={feedback.error ? "error" : "success"}
            action={
              feedback.error ? undefined : (
                <Button color="inherit" href="/clinic/waitlist" size="small">
                  Set hours and capacity
                </Button>
              )
            }
          >
            {feedback.text}
          </Alert>
        )}
        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          <TextField
            select
            fullWidth
            label="Clinician account"
            required
            value={member}
            onChange={(e) => setMember(e.target.value)}
            disabled={saving}
          >
            {data.candidates.map((item) => (
              <MenuItem key={item.membership_id} value={item.membership_id}>
                {item.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth
            label="Clinician display name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
            sx={{ "&& input.MuiInputBase-input": { minHeight: 0 } }}
            slotProps={{ htmlInput: { maxLength: 120 } }}
          />
          <TextField
            select
            fullWidth
            label="Clinician location"
            required
            value={site}
            onChange={(e) => setSite(e.target.value)}
            disabled={saving}
          >
            {data.sites.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {item.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth
            label="Clinical department"
            required
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            disabled={saving}
            sx={{ "&& input.MuiInputBase-input": { minHeight: 0 } }}
            slotProps={{ htmlInput: { maxLength: 80 } }}
          />
        </Stack>
        <Button
          sx={{ alignSelf: "flex-start" }}
          onClick={() => void save()}
          disabled={
            saving || !member || !site || !name.trim() || !department.trim()
          }
        >
          Add clinician to scheduling
        </Button>
      </Stack>
    </Paper>
  );
}
