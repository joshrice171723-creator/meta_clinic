import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import { api } from "../../api/client";
import { LoadState, useResource } from "../../shared/ui";
import type {
  WorkforceSettingValue,
  WorkforceSettingValues,
  WorkforceSettingsData,
} from "./foundationTypes";
import { businessNow } from "../../shared/businessDate";

const labels: Record<string, string> = {
  timezone: "Practice timezone",
  workweek_start_day: "Workweek starts",
  workweek_start_time: "Workweek start time",
  kiosk_enabled: "Kiosk clock enabled",
  scanner_enabled: "Scanner input enabled",
  camera_enabled: "Camera input enabled",
  manual_badge_entry_enabled: "Manual badge entry enabled",
  pin_required: "Employee PIN required",
  break_tracking_enabled: "Break tracking enabled",
  break_mode: "Break mode",
  break_duration_minutes: "Break duration (minutes)",
  break_paid: "Break is paid",
  break_reminder_minutes: "Break reminder after (minutes)",
  rounding_mode: "Rounding mode",
  rounding_increment_minutes: "Rounding increment (minutes)",
  daily_overtime_threshold_minutes: "Daily overtime threshold (minutes)",
  weekly_overtime_threshold_minutes: "Weekly overtime threshold (minutes)",
  overtime_precedence: "Overtime category precedence",
  approval_mode: "Timecard approval mode",
  schedule_enabled: "Scheduling enabled",
  employee_self_service_enabled: "Employee self-service enabled",
  availability_editing_enabled: "Availability editing enabled",
  time_off_enabled: "Time-off requests enabled",
  shift_swaps_enabled: "Shift swaps enabled",
  availability_approval_required: "Availability approval required",
  time_off_approval_required: "Time-off approval required",
  shift_swap_approval_required: "Shift-swap approval required",
  payroll_export_enabled: "Payroll export enabled",
  pay_cadence: "Pay cadence",
  payroll_provider: "Payroll export format",
  provider_mapping: "Provider field mapping",
};

const dayOptions = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const clockBooleanKeys = [
  "kiosk_enabled", "scanner_enabled", "camera_enabled", "manual_badge_entry_enabled",
  "pin_required", "break_tracking_enabled", "employee_self_service_enabled",
];
const scheduleBooleanKeys = [
  "schedule_enabled", "availability_editing_enabled", "time_off_enabled", "shift_swaps_enabled",
  "availability_approval_required", "time_off_approval_required", "shift_swap_approval_required",
];

function localDateTime() {
  const current = businessNow();
  const now = new Date(current.getTime() - current.getTimezoneOffset() * 60_000);
  return now.toISOString().slice(0, 16);
}

function title(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function emptyValues(data: WorkforceSettingsData): WorkforceSettingValues {
  const keys = data.scope.kind === "practice" ? data.setting_contract.required_keys : data.setting_contract.site_keys;
  return Object.fromEntries(
    keys.map((key) => {
      if (key === "provider_mapping") return [key, data.scope.kind === "practice" ? {} : null];
      if (data.setting_contract.enum_values[key]) return [key, data.scope.kind === "practice" ? "unconfigured" : null];
      return [key, null];
    }),
  );
}

export function WorkforceSettingsPage({ siteId }: { siteId?: string } = {}) {
  const [selectedSiteId, setSelectedSiteId] = useState(siteId ?? "");
  const resourcePath = selectedSiteId
    ? `/api/clinic/workforce/settings?site_id=${encodeURIComponent(selectedSiteId)}`
    : "/api/clinic/workforce/settings";
  const { data, error, refresh } = useResource<WorkforceSettingsData>(resourcePath);
  const [values, setValues] = useState<WorkforceSettingValues>({});
  const [effectiveFrom, setEffectiveFrom] = useState(localDateTime);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ severity: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    const next = data.current_version?.values ?? emptyValues(data);
    setValues(next);
    setEffectiveFrom(localDateTime());
    setFeedback(null);
  }, [data]);

  const booleanKeys = useMemo(
    () => data?.setting_contract.boolean_keys.filter((key) => data.scope.kind === "practice" || data.setting_contract.site_keys.includes(key)) ?? [],
    [data],
  );
  if (!data) return <LoadState error={error} />;

  const siteScope = data.scope.kind === "site";
  const setValue = (key: string, value: WorkforceSettingValue) => setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      await api("/api/clinic/workforce/settings", {
        method: "PUT",
        body: {
          workforce_settings: {
            scope_kind: data.scope.kind,
            site_id: data.scope.site_id,
            effective_from: new Date(effectiveFrom).toISOString(),
            expected_revision: data.latest_revision,
            values,
          },
        },
      });
      setFeedback({ severity: "success", text: "A new workforce settings version was saved." });
      refresh();
    } catch (reason) {
      setFeedback({ severity: "error", text: reason instanceof Error ? reason.message : "Unable to save workforce settings." });
    } finally {
      setSaving(false);
    }
  };

  const booleanField = (key: string) => (
    <FormControl fullWidth key={key}>
      <InputLabel>{labels[key]}</InputLabel>
      <Select
        required={!siteScope}
        label={labels[key]}
        value={values[key] === null || values[key] === undefined ? "inherit" : values[key] ? "true" : "false"}
        onChange={(event) => setValue(key, event.target.value === "inherit" ? null : event.target.value === "true")}
      >
        {siteScope && <MenuItem value="inherit">Inherit practice setting</MenuItem>}
        {!siteScope && <MenuItem value="inherit" disabled>Choose a value</MenuItem>}
        <MenuItem value="true">Enabled</MenuItem>
        <MenuItem value="false">Disabled</MenuItem>
      </Select>
    </FormControl>
  );

  const enumField = (key: string, choices: string[]) => (
    <FormControl fullWidth key={key}>
      <InputLabel>{labels[key]}</InputLabel>
      <Select label={labels[key]} value={values[key] ?? "inherit"} onChange={(event) => setValue(key, event.target.value === "inherit" ? null : event.target.value)}>
        {siteScope && <MenuItem value="inherit">Inherit practice setting</MenuItem>}
        {choices.map((choice) => <MenuItem value={choice} key={choice}>{title(choice)}</MenuItem>)}
      </Select>
    </FormControl>
  );

  return (
    <Stack spacing={3}>
      <Stack spacing={0.75}>
        <Typography variant="overline" color="text.secondary">TEAM / WORKFORCE</Typography>
        <Typography variant="h1">Workforce settings</Typography>
        <Typography color="text.secondary">
          Practice rules own the common workweek and timezone. Site versions override only local behavior, including an explicit disabled value.
        </Typography>
      </Stack>
      {feedback && <Alert severity={feedback.severity}>{feedback.text}</Alert>}
      {!data.effective_settings && !siteScope && (
        <Alert severity="warning">Workforce actions remain unavailable until a complete practice settings version is saved.</Alert>
      )}
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
        <Stack component="form" spacing={3} onSubmit={submit}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <FormControl fullWidth>
              <InputLabel>Settings scope</InputLabel>
              <Select label="Settings scope" value={selectedSiteId} onChange={(event) => setSelectedSiteId(event.target.value)} disabled={Boolean(siteId)}>
                <MenuItem value="">Practice defaults</MenuItem>
                {data.sites.map((site) => <MenuItem key={site.id} value={String(site.id)}>{site.name}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField label="Effective from" type="datetime-local" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} required fullWidth slotProps={{ inputLabel: { shrink: true } }} />
          </Stack>

          {!siteScope && (
            <Stack spacing={2}>
              <Typography variant="h2">Practice workweek</Typography>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <TextField fullWidth label={labels.timezone} value={values.timezone ?? ""} onChange={(event) => setValue("timezone", event.target.value)} placeholder="America/Chicago" required />
                <FormControl fullWidth required>
                  <InputLabel>{labels.workweek_start_day}</InputLabel>
                  <Select label={labels.workweek_start_day} value={values.workweek_start_day ?? ""} onChange={(event) => setValue("workweek_start_day", Number(event.target.value))}>
                    {dayOptions.map((day, index) => <MenuItem value={index} key={day}>{day}</MenuItem>)}
                  </Select>
                </FormControl>
                <TextField fullWidth label={labels.workweek_start_time} type="time" value={values.workweek_start_time ?? ""} onChange={(event) => setValue("workweek_start_time", event.target.value)} required slotProps={{ inputLabel: { shrink: true } }} />
              </Stack>
            </Stack>
          )}

          <Stack spacing={2}>
            <Typography variant="h2">Clock and employee access</Typography>
            <Stack sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, gap: 2 }}>
              {clockBooleanKeys.filter((key) => booleanKeys.includes(key)).map(booleanField)}
            </Stack>
          </Stack>

          <Stack spacing={2}>
            <Typography variant="h2">Breaks, rounding, and overtime</Typography>
            <Stack sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, gap: 2 }}>
              {enumField("break_mode", data.setting_contract.enum_values.break_mode)}
              {booleanField("break_paid")}
              {data.setting_contract.nullable_integer_keys.map((key) => (
                <TextField key={key} label={labels[key]} type="number" value={values[key] ?? ""} onChange={(event) => setValue(key, event.target.value === "" ? null : Number(event.target.value))} slotProps={{ htmlInput: { min: 1, step: 1 } }} helperText={key.includes("overtime") ? "Leave blank when the threshold is unconfigured." : undefined} />
              ))}
              {enumField("rounding_mode", data.setting_contract.enum_values.rounding_mode)}
              {enumField("overtime_precedence", data.setting_contract.enum_values.overtime_precedence)}
              {enumField("approval_mode", data.setting_contract.enum_values.approval_mode)}
            </Stack>
            <Alert severity="info">No statutory overtime, premium, break, or wage rate is supplied by APPly. Unconfigured thresholds remain explicit.</Alert>
          </Stack>

          <Stack spacing={2}>
            <Typography variant="h2">Scheduling and requests</Typography>
            <Stack sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, gap: 2 }}>
              {scheduleBooleanKeys.filter((key) => booleanKeys.includes(key)).map(booleanField)}
            </Stack>
          </Stack>

          <Stack spacing={2}>
            <Typography variant="h2">Payroll export</Typography>
            <Stack sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, gap: 2 }}>
              {booleanKeys.filter((key) => key === "payroll_export_enabled").map(booleanField)}
              {enumField("pay_cadence", data.setting_contract.enum_values.pay_cadence)}
              {enumField("payroll_provider", data.setting_contract.enum_values.payroll_provider)}
            </Stack>
            <Typography variant="body2" color="text.secondary">Pay cadence records your location's payroll cycle; it does not schedule payments. Timecards use the configured workweek. Choose approved timecards, file headings, and employee payroll IDs in Payroll exports.</Typography>
          </Stack>

          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {data.current_version ? `Current effective revision ${data.current_version.revision}. Saving creates an immutable revision.` : "No effective version exists for this scope."}
            </Typography>
            <Button type="submit" variant="contained" startIcon={<SaveOutlinedIcon />} disabled={saving}>
              {saving ? "Saving…" : "Save new settings version"}
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  );
}
