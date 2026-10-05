import { useId, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
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
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { ApiError, api } from "../../api/client";
import { LoadState, useResource } from "../../shared/ui";
import type {
  WorkforceSettingValue,
  WorkforceSettingValues,
  WorkforceSettingsData,
  WorkforceSettingsVersion,
} from "./foundationTypes";
import { businessNow } from "../../shared/businessDate";
import { formatDisplayDateTime } from "../../shared/dateTime";
import { useClinicNavigation } from "../clinic/clinicNavigation";
import { useDemoNavigationBlocker } from "../demo/navigationBlockers";

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

const dayOptions = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const clockBooleanKeys = [
  "kiosk_enabled",
  "scanner_enabled",
  "camera_enabled",
  "manual_badge_entry_enabled",
  "pin_required",
  "break_tracking_enabled",
  "employee_self_service_enabled",
];
const scheduleBooleanKeys = [
  "schedule_enabled",
  "availability_editing_enabled",
  "time_off_enabled",
  "shift_swaps_enabled",
  "availability_approval_required",
  "time_off_approval_required",
  "shift_swap_approval_required",
];

function localDateTime() {
  const current = businessNow();
  const now = new Date(
    current.getTime() - current.getTimezoneOffset() * 60_000,
  );
  return now.toISOString().slice(0, 16);
}

function title(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function emptyValues(data: WorkforceSettingsData): WorkforceSettingValues {
  const keys =
    data.scope.kind === "practice"
      ? data.setting_contract.required_keys
      : data.setting_contract.site_keys;
  return Object.fromEntries(
    keys.map((key) => {
      if (key === "provider_mapping")
        return [key, data.scope.kind === "practice" ? {} : null];
      if (data.setting_contract.enum_values[key])
        return [key, data.scope.kind === "practice" ? "unconfigured" : null];
      return [key, null];
    }),
  );
}

export function WorkforceSettingsPage({ siteId }: { siteId?: string } = {}) {
  const fieldId = useId();
  const { registerBlocker } = useClinicNavigation();
  const search = new URLSearchParams(window.location.search);
  const focusTarget = search.get("focus");
  const [selectedSiteId, setSelectedSiteId] = useState(
    siteId ?? search.get("site_id") ?? "",
  );
  const resourcePath = selectedSiteId
    ? `/api/clinic/workforce/settings?site_id=${encodeURIComponent(selectedSiteId)}`
    : "/api/clinic/workforce/settings";
  const { data, error, refresh } =
    useResource<WorkforceSettingsData>(resourcePath);
  const [values, setValues] = useState<WorkforceSettingValues>({});
  const [effectiveFrom, setEffectiveFrom] = useState(localDateTime);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [feedback, setFeedback] = useState<{
    severity: "success" | "error";
    text: string;
  } | null>(null);
  const leaveMessage = saving
    ? "Workforce settings are still saving."
    : unconfirmed
      ? "The settings save is unconfirmed. Review saved revisions before creating another version."
      : dirty
        ? "Discard unsaved workforce settings?"
        : null;
  useDemoNavigationBlocker(() => ({ blocked: saving, message: leaveMessage }));
  useEffect(() => {
    if (!leaveMessage) return;
    const unregister = registerBlocker(() => leaveMessage, {
      preventNavigation: saving,
    });
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = leaveMessage;
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", unload);
    };
  }, [leaveMessage, saving, registerBlocker]);

  function refreshSettings() {
    if (saving) return;
    const message = unconfirmed
      ? "The settings version may already be saved. Discard this draft and load saved revisions to review its current outcome?"
      : dirty
        ? "Discard unsaved workforce settings and load the latest saved version?"
        : null;
    if (message && !window.confirm(message)) return;
    setDirty(false);
    setUnconfirmed(false);
    refresh();
  }

  useEffect(() => {
    if (!data) return;
    const next = data.current_version?.values ?? emptyValues(data);
    setValues(next);
    setEffectiveFrom(localDateTime());
    setDirty(false);
  }, [data]);

  useEffect(() => {
    if (!data || focusTarget !== "payroll_export_enabled") return;
    const target = document.getElementById(focusTarget);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.focus();
  }, [data, focusTarget]);

  const booleanKeys = useMemo(
    () =>
      data?.setting_contract.boolean_keys.filter(
        (key) =>
          data.scope.kind === "practice" ||
          data.setting_contract.site_keys.includes(key),
      ) ?? [],
    [data],
  );
  if (!data)
    return (
      <Stack spacing={3}>
        <Typography variant="h1">Workforce settings</Typography>
        {feedback && (
          <Alert severity={feedback.severity}>{feedback.text}</Alert>
        )}
        <LoadState error={error} onRetry={refresh} />
      </Stack>
    );

  const siteScope = data.scope.kind === "site";
  const setValue = (key: string, value: WorkforceSettingValue) => {
    setDirty(true);
    setValues((current) => ({ ...current, [key]: value }));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || unconfirmed) return;
    setSaving(true);
    setFeedback(null);
    let submitted = false;
    try {
      const effectiveAt = new Date(effectiveFrom).toISOString();
      submitted = true;
      const saved = await api<
        WorkforceSettingsData & { settings_version: WorkforceSettingsVersion }
      >("/api/clinic/workforce/settings", {
        method: "PUT",
        body: {
          workforce_settings: {
            scope_kind: data.scope.kind,
            site_id: data.scope.site_id,
            effective_from: effectiveAt,
            expected_revision: data.latest_revision,
            values,
          },
        },
      });
      setDirty(false);
      setFeedback({
        severity: "success",
        text: `Settings revision ${saved.settings_version.revision} was saved, effective ${formatDisplayDateTime(saved.settings_version.effective_from)} (${Intl.DateTimeFormat().resolvedOptions().timeZone}).`,
      });
      refresh();
    } catch (reason) {
      const uncertain =
        !(reason instanceof ApiError) ||
        reason.status >= 500 ||
        [408, 429].includes(reason.status) ||
        ["outcome_unconfirmed", "session_changed"].includes(reason.code ?? "");
      if (submitted && uncertain) setUnconfirmed(true);
      setFeedback({
        severity: "error",
        text:
          reason instanceof Error
            ? reason.message
            : "Unable to save workforce settings.",
      });
    } finally {
      setSaving(false);
    }
  };

  const booleanField = (key: string) => (
    <FormControl fullWidth key={key}>
      <InputLabel id={`${fieldId}-${key}-label`}>{labels[key]}</InputLabel>
      <Select
        id={key}
        labelId={`${fieldId}-${key}-label`}
        required={!siteScope}
        label={labels[key]}
        value={
          values[key] === null || values[key] === undefined
            ? "inherit"
            : values[key]
              ? "true"
              : "false"
        }
        autoFocus={key === focusTarget}
        onChange={(event) =>
          setValue(
            key,
            event.target.value === "inherit"
              ? null
              : event.target.value === "true",
          )
        }
      >
        {siteScope && (
          <MenuItem value="inherit">Inherit practice setting</MenuItem>
        )}
        {!siteScope && (
          <MenuItem value="inherit" disabled>
            Choose a value
          </MenuItem>
        )}
        <MenuItem value="true">Enabled</MenuItem>
        <MenuItem value="false">Disabled</MenuItem>
      </Select>
    </FormControl>
  );

  const enumField = (key: string, choices: string[]) => (
    <FormControl fullWidth key={key}>
      <InputLabel id={`${fieldId}-${key}-label`}>{labels[key]}</InputLabel>
      <Select
        labelId={`${fieldId}-${key}-label`}
        label={labels[key]}
        value={values[key] ?? "inherit"}
        onChange={(event) =>
          setValue(
            key,
            event.target.value === "inherit" ? null : event.target.value,
          )
        }
      >
        {siteScope && (
          <MenuItem value="inherit">Inherit practice setting</MenuItem>
        )}
        {choices.map((choice) => (
          <MenuItem value={choice} key={choice}>
            {title(choice)}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );

  return (
    <Stack spacing={3}>
      <Stack spacing={0.75}>
        <Typography variant="h1">Workforce settings</Typography>
        <Typography color="text.secondary">
          Practice rules own the common workweek and timezone. Site versions
          override only local behavior, including an explicit disabled value.
        </Typography>
      </Stack>
      {feedback && <Alert severity={feedback.severity}>{feedback.text}</Alert>}
      {unconfirmed && (
        <Alert severity="warning">
          This save is unconfirmed. Review saved revisions before creating
          another version; refreshing will ask before discarding this draft.
        </Alert>
      )}
      <Button
        disabled={saving}
        onClick={refreshSettings}
        sx={{ alignSelf: "flex-start" }}
      >
        {unconfirmed
          ? "Review saved revisions"
          : dirty
            ? "Discard changes and refresh"
            : "Refresh saved settings"}
      </Button>
      {!data.effective_settings && !siteScope && (
        <Alert severity="warning">
          Workforce actions remain unavailable until a complete practice
          settings version is saved.
        </Alert>
      )}
      {(data.scheduled_versions?.length ?? 0) > 0 && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={1}>
            <Typography variant="h2">Scheduled settings revisions</Typography>
            <Typography color="text.secondary">
              These versions have future effective times. When versions share a
              start time, the later revision takes precedence. The editor below
              starts from the currently effective version.
            </Typography>
            {data.scheduled_versions?.map((version) => (
              <Accordion key={version.id} disableGutters variant="outlined">
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>
                    Revision {version.revision} · effective{" "}
                    {formatDisplayDateTime(version.effective_from)} (
                    {Intl.DateTimeFormat().resolvedOptions().timeZone})
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack component="dl" spacing={1} sx={{ m: 0 }}>
                    {Object.entries(version.values).map(([key, value]) => (
                      <Stack key={key}>
                        <Typography component="dt" sx={{ fontWeight: 600 }}>
                          {labels[key] || title(key)}
                        </Typography>
                        <Typography
                          component="dd"
                          sx={{ m: 0, overflowWrap: "anywhere" }}
                        >
                          {value === null
                            ? version.scope_kind === "site"
                              ? "Inherit practice setting"
                              : "Unconfigured"
                            : typeof value === "boolean"
                              ? value
                                ? "Enabled"
                                : "Disabled"
                              : typeof value === "object"
                                ? JSON.stringify(value)
                                : key === "workweek_start_day" &&
                                    typeof value === "number"
                                  ? (dayOptions[value] ?? String(value))
                                  : data.setting_contract.enum_values[key]
                                    ? title(String(value))
                                    : String(value)}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                </AccordionDetails>
              </Accordion>
            ))}
          </Stack>
        </Paper>
      )}
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
        <Stack
          component="form"
          spacing={3}
          onSubmit={submit}
          inert={saving || unconfirmed}
        >
          <Typography variant="h2">
            {siteScope
              ? "New location settings version"
              : "New practice settings version"}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {data.current_version
              ? `Current effective revision ${data.current_version.revision} is read-only. Saving creates a new immutable revision.`
              : "No effective version exists for this scope."}
          </Typography>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <FormControl fullWidth>
              <InputLabel id={`${fieldId}-3-label`}>Settings scope</InputLabel>
              <Select
                labelId={`${fieldId}-3-label`}
                label="Settings scope"
                value={selectedSiteId}
                onChange={(event) => {
                  if (
                    dirty &&
                    !window.confirm(
                      "Discard unsaved settings before changing scope?",
                    )
                  )
                    return;
                  setDirty(false);
                  setFeedback(null);
                  setSelectedSiteId(event.target.value);
                }}
                disabled={Boolean(siteId) || saving}
              >
                <MenuItem value="">Practice defaults</MenuItem>
                {data.sites.map((site) => (
                  <MenuItem key={site.id} value={String(site.id)}>
                    {site.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Effective from"
              type="datetime-local"
              value={effectiveFrom}
              onChange={(event) => {
                setEffectiveFrom(event.target.value);
                setDirty(true);
              }}
              required
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
              helperText={`Your device timezone (${Intl.DateTimeFormat().resolvedOptions().timeZone}).`}
            />
          </Stack>

          {!siteScope && (
            <Stack spacing={2}>
              <Typography variant="h2">Practice workweek</Typography>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <TextField
                  fullWidth
                  label={labels.timezone}
                  value={values.timezone ?? ""}
                  onChange={(event) => setValue("timezone", event.target.value)}
                  placeholder="America/Chicago"
                  required
                />
                <FormControl fullWidth required>
                  <InputLabel id={`${fieldId}-4-label`}>
                    {labels.workweek_start_day}
                  </InputLabel>
                  <Select
                    labelId={`${fieldId}-4-label`}
                    label={labels.workweek_start_day}
                    value={values.workweek_start_day ?? ""}
                    onChange={(event) =>
                      setValue("workweek_start_day", Number(event.target.value))
                    }
                  >
                    {dayOptions.map((day, index) => (
                      <MenuItem value={index} key={day}>
                        {day}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  fullWidth
                  label={labels.workweek_start_time}
                  type="time"
                  value={values.workweek_start_time ?? ""}
                  onChange={(event) =>
                    setValue("workweek_start_time", event.target.value)
                  }
                  required
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Stack>
            </Stack>
          )}

          <Stack spacing={2}>
            <Typography variant="h2">Clock and employee access</Typography>
            <Stack
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  md: "repeat(2, minmax(0, 1fr))",
                },
                gap: 2,
              }}
            >
              {clockBooleanKeys
                .filter((key) => booleanKeys.includes(key))
                .map(booleanField)}
            </Stack>
          </Stack>

          <Stack spacing={2}>
            <Typography variant="h2">Breaks, rounding, and overtime</Typography>
            <Stack
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  md: "repeat(2, minmax(0, 1fr))",
                },
                gap: 2,
              }}
            >
              {enumField(
                "break_mode",
                data.setting_contract.enum_values.break_mode,
              )}
              {booleanField("break_paid")}
              {data.setting_contract.nullable_integer_keys.map((key) => (
                <TextField
                  key={key}
                  label={labels[key]}
                  type="number"
                  value={values[key] ?? ""}
                  onChange={(event) =>
                    setValue(
                      key,
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                    )
                  }
                  slotProps={{ htmlInput: { min: 1, step: 1 } }}
                  helperText={
                    key.includes("overtime")
                      ? "Leave blank when the threshold is unconfigured."
                      : undefined
                  }
                />
              ))}
              {enumField(
                "rounding_mode",
                data.setting_contract.enum_values.rounding_mode,
              )}
              {enumField(
                "overtime_precedence",
                data.setting_contract.enum_values.overtime_precedence,
              )}
              {enumField(
                "approval_mode",
                data.setting_contract.enum_values.approval_mode,
              )}
            </Stack>
            <Alert severity="info">
              No statutory overtime, premium, break, or wage rate is supplied by
              Meta Clinic. Unconfigured thresholds remain explicit.
            </Alert>
          </Stack>

          <Stack spacing={2}>
            <Typography variant="h2">Scheduling and requests</Typography>
            <Stack
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  md: "repeat(2, minmax(0, 1fr))",
                },
                gap: 2,
              }}
            >
              {scheduleBooleanKeys
                .filter((key) => booleanKeys.includes(key))
                .map(booleanField)}
            </Stack>
          </Stack>

          <Stack spacing={2}>
            <Typography variant="h2">Payroll export</Typography>
            <Stack
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  md: "repeat(2, minmax(0, 1fr))",
                },
                gap: 2,
              }}
            >
              {booleanKeys
                .filter((key) => key === "payroll_export_enabled")
                .map(booleanField)}
              {enumField(
                "pay_cadence",
                data.setting_contract.enum_values.pay_cadence,
              )}
              {enumField(
                "payroll_provider",
                data.setting_contract.enum_values.payroll_provider,
              )}
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Pay cadence records your location's payroll cycle; it does not
              schedule payments. Timecards use the configured workweek. Payroll
              exports use approved timecards, file headings, and employee
              payroll IDs.
            </Typography>
          </Stack>

          <Stack
            direction="row"
            sx={{
              justifyContent: "flex-end",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 2,
            }}
          >
            <Button
              type="submit"
              variant="contained"
              startIcon={<SaveOutlinedIcon />}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save new settings version"}
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  );
}
