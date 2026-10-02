import { useRef, useState } from "react";
import {
  Alert,
  Button,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { LoadState, useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";

type ReminderPolicy = {
  revision: number;
  enabled: boolean;
  lead_hours: number;
  channel: "sms";
  effective_from: string | null;
};
type PolicyResponse = { policy: ReminderPolicy };

export function ReminderSettings() {
  const { practice, user_id, authorization_generation, capabilities } =
    useClinic();
  const scope = JSON.stringify([
    practice.id,
    user_id,
    authorization_generation,
    capabilities.roles,
  ]);
  return <ScopedReminderSettings key={scope} />;
}

function ScopedReminderSettings() {
  const clinic = useClinic();
  const resource = useResource<PolicyResponse>("/api/clinic/reminder_policy", {
    enabled: clinic.capabilities.roles,
  });
  if (!clinic.capabilities.roles) return null;
  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 3 }}>
      <Typography component="h2" variant="h6">
        Clinic reminder settings
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Appointment reminder scheduling for {clinic.practice.name}.
      </Typography>
      {!resource.data ? (
        <LoadState error={resource.error} onRetry={resource.refresh} />
      ) : (
        <ReminderPolicyForm
          key={resource.data.policy.revision}
          initial={resource.data.policy}
          onReload={resource.refresh}
        />
      )}
    </Paper>
  );
}

function ReminderPolicyForm({
  initial,
  onReload,
}: {
  initial: ReminderPolicy;
  onReload: () => void;
}) {
  const [saved, setSaved] = useState(initial);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [leadHours, setLeadHours] = useState(String(initial.lead_hours));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);
  const requestKey = useRef<string | undefined>(undefined);
  const changed =
    enabled !== saved.enabled || leadHours !== String(saved.lead_hours);
  function edited() {
    requestKey.current = undefined;
    setNotice("");
    setError("");
  }
  async function save() {
    if (inFlight.current) return;
    if (
      !/^\d+$/.test(leadHours) ||
      Number(leadHours) < 1 ||
      Number(leadHours) > 168
    ) {
      setError("Choose a whole number of hours from 1 to 168.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    requestKey.current ||= crypto.randomUUID();
    try {
      const result = await api<PolicyResponse>("/api/clinic/reminder_policy", {
        method: "PATCH",
        body: {
          policy: {
            expected_revision: saved.revision,
            request_key: requestKey.current,
            enabled,
            lead_hours: Number(leadHours),
          },
        },
      });
      setSaved(result.policy);
      setEnabled(result.policy.enabled);
      setLeadHours(String(result.policy.lead_hours));
      requestKey.current = undefined;
      setNotice("Clinic reminder settings saved.");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to save reminder settings.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <Stack
      component="form"
      spacing={2}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Typography variant="body2" color="text.secondary">
        Saved reminder policy revision {saved.revision}
        {saved.effective_from
          ? ` · Effective ${new Date(saved.effective_from).toLocaleString()}`
          : ""}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Changes apply when appointment reminders are next previewed and
        scheduled. Existing scheduled messages keep their recorded time. Manual
        messages remain available. Patient consent, opt-outs, quiet hours and
        appointment eligibility still apply.
      </Typography>
      <FormControlLabel
        control={
          <Switch
            checked={enabled}
            disabled={busy}
            onChange={(_, next) => {
              edited();
              setEnabled(next);
            }}
          />
        }
        label="Allow scheduling appointment reminders"
      />
      <TextField
        label="Hours before appointment"
        type="number"
        value={leadHours}
        disabled={busy}
        onChange={(event) => {
          edited();
          setLeadHours(event.target.value);
        }}
        slotProps={{ htmlInput: { min: 1, max: 168, step: 1 } }}
        helperText="Text reminders use the current verified SMS destination. Choose 1 to 168 hours."
      />
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}
      <Stack direction="row" spacing={1}>
        <Button type="submit" variant="contained" disabled={busy || !changed}>
          {busy ? "Saving..." : "Save reminder settings"}
        </Button>
        <Button type="button" disabled={busy} onClick={onReload}>
          Reload saved settings
        </Button>
      </Stack>
    </Stack>
  );
}
