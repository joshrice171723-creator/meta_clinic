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
import type { ClinicDepartment } from "../../api/contracts";
import { api } from "../../api/client";
import { LoadState, useResource } from "../../shared/ui";

type Setup = {
  clinicians: { id: number; display_name: string; membership_id: number }[];
  candidates: { membership_id: number; label: string }[];
  sites: { id: number; name: string }[];
};

const suggestedDepartments = [
  "Primary care",
  "Weight management",
  "Behavioral health",
];
const departmentKey = (value: string) =>
  value.replace(/[-_]/g, " ").trim().toLocaleLowerCase();

export function ClinicianSetup() {
  const clinicians = useResource<Setup>("/api/clinic/clinicians?setup=true", {
    retainDataOnRefresh: true,
  });
  const departments = useResource<{ departments: ClinicDepartment[] }>(
    "/api/clinic/facilities?type=departments&per_page=100",
    { retainDataOnRefresh: true },
  );
  const [member, setMember] = useState("");
  const [site, setSite] = useState("");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingDepartment, setSavingDepartment] = useState(false);
  const [departmentFeedback, setDepartmentFeedback] = useState<{
    error: boolean;
    text: string;
  } | null>(null);
  const [feedback, setFeedback] = useState<{
    error: boolean;
    text: string;
  } | null>(null);
  if (!clinicians.data || !departments.data)
    return <LoadState error={clinicians.error || departments.error} />;
  const data = clinicians.data;
  const existingDepartmentNames = new Set(
    departments.data.departments.map((item) => departmentKey(item.code)),
  );
  const availableSuggestions = suggestedDepartments.filter(
    (item) => !existingDepartmentNames.has(departmentKey(item)),
  );
  const selectedDepartment = departments.data.departments.some(
    (item) => item.code === department,
  )
    ? department
    : "";
  async function addDepartment(value = departmentName) {
    const code = value.trim();
    if (!code || savingDepartment) return;
    setSavingDepartment(true);
    setDepartmentFeedback(null);
    try {
      const result = await api<{ department: ClinicDepartment }>(
        "/api/clinic/facilities/departments",
        { method: "POST", body: { department: { code } } },
      );
      setDepartment(result.department.code);
      setDepartmentName("");
      setDepartmentFeedback({
        error: false,
        text: `${result.department.code} is ready to select.`,
      });
      departments.refresh();
    } catch (reason) {
      setDepartmentFeedback({
        error: true,
        text:
          reason instanceof Error
            ? reason.message
            : "Unable to save department.",
      });
    } finally {
      setSavingDepartment(false);
    }
  }
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
      clinicians.refresh();
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
    <Stack spacing={2} sx={{ mb: 3 }}>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h2">Clinical departments</Typography>
          <Typography color="text.secondary">
            Add departments for this clinic. Clinician scheduling uses these
            saved options.
          </Typography>
          {departmentFeedback && (
            <Alert severity={departmentFeedback.error ? "error" : "success"}>
              {departmentFeedback.text}
            </Alert>
          )}
          <Stack
            component="form"
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            onSubmit={(event) => {
              event.preventDefault();
              void addDepartment();
            }}
          >
            <TextField
              fullWidth
              label="Department name"
              value={departmentName}
              onChange={(event) => setDepartmentName(event.target.value)}
              disabled={savingDepartment}
              slotProps={{ htmlInput: { maxLength: 80 } }}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={savingDepartment || !departmentName.trim()}
              sx={{ flexShrink: 0 }}
            >
              Add department
            </Button>
          </Stack>
          {availableSuggestions.length > 0 && (
            <Stack
              direction="row"
              spacing={1}
              useFlexGap
              sx={{ flexWrap: "wrap" }}
            >
              <Typography color="text.secondary" sx={{ alignSelf: "center" }}>
                Suggested:
              </Typography>
              {availableSuggestions.map((suggestion) => (
                <Button
                  key={suggestion}
                  size="small"
                  disabled={savingDepartment}
                  onClick={() => void addDepartment(suggestion)}
                >
                  Add {suggestion}
                </Button>
              ))}
            </Stack>
          )}
          {departments.data.departments.length > 0 && (
            <Typography variant="body2" color="text.secondary">
              Available:{" "}
              {departments.data.departments.map((item) => item.code).join(", ")}
            </Typography>
          )}
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ p: 3 }}>
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
              select
              fullWidth
              label="Clinical department"
              required
              value={selectedDepartment}
              onChange={(e) => setDepartment(e.target.value)}
              disabled={saving || departments.data.departments.length === 0}
            >
              <MenuItem value="" disabled>
                Select a department
              </MenuItem>
              {departments.data.departments.map((item) => (
                <MenuItem key={item.id} value={item.code}>
                  {item.code}
                </MenuItem>
              ))}
            </TextField>
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
    </Stack>
  );
}
