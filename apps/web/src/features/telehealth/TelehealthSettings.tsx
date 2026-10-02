import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import { useClinic } from "../clinic/Workspace";
import { useClinicNavigation } from "../clinic/clinicNavigation";
import {
  checkTelehealthConnection,
  disableNewTelehealthVisits,
  loadTelehealthSettings,
  publishTelehealthSettings,
  requestKey,
  saveTelehealthSettingsDraft,
} from "./api";
import type {
  TelehealthEnvelope,
  TelehealthSettingsData,
  TelehealthSettingsDraft,
  TelehealthVisitTypeRule,
} from "./types";

type EditState = {
  provider_account_ref: string;
  enabled: boolean;
  draft: TelehealthSettingsDraft;
  rules: TelehealthVisitTypeRule[];
};

function editState(data: TelehealthSettingsData): EditState {
  return {
    provider_account_ref: data.provider_account_ref || "",
    enabled: data.enabled,
    draft: { ...data.draft },
    rules: data.visit_type_rules.map((rule) => ({
      ...rule,
      allowed_region_codes: [...rule.allowed_region_codes],
    })),
  };
}

const healthLabels: Record<TelehealthSettingsData["health_status"], string> = {
  configured: "Provider connected",
  not_configured: "Provider not configured",
  degraded: "Provider needs attention",
  disabled: "Provider disabled",
};

export function TelehealthSettings() {
  const clinic = useClinic();
  const { registerBlocker } = useClinicNavigation();
  const [response, setResponse] =
    useState<TelehealthEnvelope<TelehealthSettingsData> | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<
    "publish" | "disable" | "discard" | null
  >(null);
  const generation = useRef(0);
  const operationPendingRef = useRef(false);
  const operationAttemptRef = useRef<{
    signature: string;
    key: string;
  } | null>(null);
  const canConfigure = Boolean(clinic.capabilities.telehealth_configure);
  const dirty = Boolean(
    response &&
    edit &&
    JSON.stringify(edit) !== JSON.stringify(editState(response.data)),
  );

  const accept = useCallback(
    (next: TelehealthEnvelope<TelehealthSettingsData>) => {
      setResponse(next);
      setEdit(editState(next.data));
      setError(null);
    },
    [],
  );

  const reload = useCallback(async () => {
    const current = ++generation.current;
    setPending("load");
    try {
      const next = await loadTelehealthSettings();
      if (current === generation.current) accept(next);
    } catch (reason) {
      if (current === generation.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load telehealth settings.",
        );
    } finally {
      if (current === generation.current) setPending(null);
    }
  }, [accept]);

  useEffect(() => {
    if (canConfigure) void reload();
    return () => {
      generation.current += 1;
    };
  }, [canConfigure, reload]);

  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  useEffect(
    () =>
      registerBlocker(() =>
        dirty ? "Discard unsaved telehealth settings?" : null,
      ),
    [dirty, registerBlocker],
  );

  async function run(
    label: string,
    signature: string,
    operation: (
      key: string,
    ) => Promise<TelehealthEnvelope<TelehealthSettingsData>>,
    message: string,
  ) {
    if (operationPendingRef.current) return;
    operationPendingRef.current = true;
    const attempt =
      operationAttemptRef.current?.signature === signature
        ? operationAttemptRef.current
        : { signature, key: requestKey() };
    operationAttemptRef.current = attempt;
    const current = generation.current;
    setPending(label);
    setError(null);
    setNotice(null);
    setConfirm(null);
    try {
      const next = await operation(attempt.key);
      if (current !== generation.current) return;
      accept(next);
      operationAttemptRef.current = null;
      setNotice(message);
    } catch (reason) {
      if (current === generation.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "The settings change could not be completed.",
        );
    } finally {
      operationPendingRef.current = false;
      if (current === generation.current) setPending(null);
    }
  }

  function field<K extends keyof TelehealthSettingsDraft>(
    key: K,
    value: TelehealthSettingsDraft[K],
  ) {
    setEdit((current) =>
      current
        ? { ...current, draft: { ...current.draft, [key]: value } }
        : null,
    );
  }

  function ruleField(index: number, values: Partial<TelehealthVisitTypeRule>) {
    setEdit((current) =>
      current
        ? {
            ...current,
            rules: current.rules.map((rule, i) =>
              i === index ? { ...rule, ...values } : rule,
            ),
          }
        : null,
    );
  }

  if (!canConfigure)
    return (
      <Alert severity="warning">
        Your account does not have permission to configure telehealth.
      </Alert>
    );
  if (!response || !edit)
    return (
      <Stack spacing={2}>
        <Typography component="h1" variant="h4">
          Telehealth settings
        </Typography>
        {error ? (
          <Alert
            severity="error"
            action={
              <Button disabled={Boolean(pending)} onClick={() => void reload()}>
                Retry
              </Button>
            }
          >
            {error}
          </Alert>
        ) : (
          <Typography role="status">Loading settings…</Typography>
        )}
      </Stack>
    );

  const { data, version, allowed_actions: actions } = response;
  const editable = !pending && actions.includes("telehealth.configure");
  const draft = edit.draft;
  const numericFields: {
    key: keyof Pick<
      TelehealthSettingsDraft,
      | "join_early_minutes"
      | "join_late_minutes"
      | "max_room_minutes"
      | "grant_ttl_seconds"
      | "checkin_max_age_minutes"
    >;
    label: string;
    min: number;
    max: number;
  }[] = [
    {
      key: "join_early_minutes",
      label: "Join before appointment (minutes)",
      min: 0,
      max: 120,
    },
    {
      key: "join_late_minutes",
      label: "Join after appointment (minutes)",
      min: 0,
      max: 120,
    },
    {
      key: "max_room_minutes",
      label: "Maximum room duration (minutes)",
      min: 5,
      max: 240,
    },
    {
      key: "grant_ttl_seconds",
      label: "Join credential lifetime (seconds)",
      min: 30,
      max: 300,
    },
    {
      key: "checkin_max_age_minutes",
      label: "Preparation remains current (minutes)",
      min: 5,
      max: 1440,
    },
  ];

  return (
    <Stack spacing={3} sx={{ maxWidth: 1080, mx: "auto", pb: 3 }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}
      >
        <Box>
          <Typography component="h1" variant="h4">
            Telehealth settings
          </Typography>
          <Typography color="text.secondary">
            Set visit eligibility, patient preparation and consent before
            enabling video appointments.
          </Typography>
        </Box>
        <Button href="/clinic/telehealth">Virtual waiting room</Button>
      </Stack>
      <Stack
        component="nav"
        aria-label="Telehealth settings sections"
        direction="row"
        spacing={0.5}
        useFlexGap
        sx={{ flexWrap: "wrap" }}
      >
        <Button href="#telehealth-connection">Connection</Button>
        <Button href="#telehealth-eligibility">Eligible visits</Button>
        <Button href="#telehealth-preparation">Preparation and consent</Button>
        <Button href="#telehealth-scribe">Scribe</Button>
      </Stack>
      {error && (
        <Alert severity="error">
          {error} Your draft remains here. Reload the latest settings if another
          administrator changed them.
        </Alert>
      )}
      {notice && <Alert severity="success">{notice}</Alert>}
      <Paper
        component="section"
        id="telehealth-connection"
        variant="outlined"
        sx={{ p: { xs: 2, sm: 3 }, scrollMarginTop: 96 }}
      >
        <Stack spacing={2}>
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{ flexWrap: "wrap", alignItems: "center" }}
          >
            <Typography component="h2" variant="h6">
              Provider connection
            </Typography>
            <Chip size="small" label="Twilio Video" />
            <Chip
              size="small"
              label={healthLabels[data.health_status]}
              color={
                data.health_status === "configured" ? "success" : "default"
              }
            />
            <Chip
              size="small"
              label={
                data.enabled
                  ? "Video booking enabled"
                  : "New video booking disabled"
              }
            />
          </Stack>
          <Typography color="text.secondary">
            Twilio API credentials and the signed callback URL are managed by
            the server operator. Enter the matching Twilio Account SID here.
          </Typography>
          <TextField
            label="Twilio Account SID"
            value={edit.provider_account_ref}
            disabled={!editable}
            onChange={(event) =>
              setEdit({ ...edit, provider_account_ref: event.target.value })
            }
            fullWidth
          />
          <FormControlLabel
            control={
              <Switch
                checked={edit.enabled}
                disabled={!editable}
                onChange={(_, checked) =>
                  setEdit({ ...edit, enabled: checked })
                }
              />
            }
            label="Enable new video booking when the published policy and provider checks are valid"
          />
          {data.health_checked_at && (
            <Typography variant="body2" color="text.secondary">
              Last connection check:{" "}
              {new Date(data.health_checked_at).toLocaleString()}
            </Typography>
          )}
          {data.last_error_code && (
            <Alert severity="warning">
              The provider connection needs attention. Save the correct account
              reference and check again.
            </Alert>
          )}
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{ flexWrap: "wrap" }}
          >
            <Button
              variant="outlined"
              disabled={
                Boolean(pending) ||
                dirty ||
                !data.provider_account_ref ||
                !actions.includes("telehealth.check_connection")
              }
              onClick={() =>
                void run(
                  "connection",
                  `connection:${version}:${data.provider_account_ref}`,
                  (key) => checkTelehealthConnection(version, key),
                  "Connection check completed. Review the provider status above.",
                )
              }
            >
              Check connection
            </Button>
            <Button
              color="warning"
              disabled={
                Boolean(pending) ||
                dirty ||
                !data.enabled ||
                !actions.includes("telehealth.disable")
              }
              onClick={() => setConfirm("disable")}
            >
              Disable new video booking
            </Button>
          </Stack>
          {(dirty || !data.provider_account_ref) && (
            <Typography variant="body2" color="text.secondary">
              Save the account reference and policy draft before checking the
              connection or publishing.
            </Typography>
          )}
        </Stack>
      </Paper>
      <Paper
        component="section"
        id="telehealth-eligibility"
        variant="outlined"
        sx={{ p: { xs: 2, sm: 3 }, scrollMarginTop: 96 }}
      >
        <Stack spacing={2}>
          <Typography component="h2" variant="h6">
            Eligible visits and locations
          </Typography>
          <Typography color="text.secondary">
            Each rule selects a visit type and optional site. Enter the region
            codes your clinic has approved for this service.
          </Typography>
          {edit.rules.length === 0 && (
            <Alert severity="info">No visit types are enabled for video.</Alert>
          )}
          {edit.rules.map((rule, index) => (
            <Box
              key={index}
              sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 2 }}
            >
              <Stack spacing={2}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField
                    select
                    label="Visit type"
                    value={rule.visit_type_id || ""}
                    disabled={!editable}
                    onChange={(event) =>
                      ruleField(index, {
                        visit_type_id: Number(event.target.value),
                      })
                    }
                    sx={{ flex: 1 }}
                  >
                    <MenuItem value="" disabled>
                      Select a visit type
                    </MenuItem>
                    {(data.options?.visit_types || []).map((type) => (
                      <MenuItem key={type.id} value={type.id}>
                        {type.name}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    label="Site"
                    value={rule.site_id ?? ""}
                    disabled={!editable}
                    onChange={(event) =>
                      ruleField(index, {
                        site_id:
                          event.target.value === ""
                            ? null
                            : Number(event.target.value),
                      })
                    }
                    sx={{ flex: 1 }}
                  >
                    <MenuItem value="">All sites</MenuItem>
                    {(data.options?.sites || []).map((site) => (
                      <MenuItem key={site.id} value={site.id}>
                        {site.name}
                      </MenuItem>
                    ))}
                  </TextField>
                </Stack>
                <TextField
                  label="Allowed region codes"
                  placeholder="Enter comma-separated region codes"
                  value={rule.allowed_region_codes.join(", ")}
                  disabled={!editable}
                  onChange={(event) =>
                    ruleField(index, {
                      allowed_region_codes: event.target.value
                        .toUpperCase()
                        .split(",")
                        .map((value) => value.trim()),
                    })
                  }
                  helperText="Use the same region codes patients enter during preparation."
                  fullWidth
                />
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={2}
                  sx={{ alignItems: { sm: "center" } }}
                >
                  <TextField
                    label="Minimum age (optional)"
                    type="number"
                    value={rule.min_patient_age_years ?? ""}
                    disabled={!editable}
                    onChange={(event) =>
                      ruleField(index, {
                        min_patient_age_years:
                          event.target.value === ""
                            ? null
                            : Number(event.target.value),
                      })
                    }
                    slotProps={{ htmlInput: { min: 0, step: 1 } }}
                  />
                  <TextField
                    label="Maximum age (optional)"
                    type="number"
                    value={rule.max_patient_age_years ?? ""}
                    disabled={!editable}
                    onChange={(event) =>
                      ruleField(index, {
                        max_patient_age_years:
                          event.target.value === ""
                            ? null
                            : Number(event.target.value),
                      })
                    }
                    slotProps={{ htmlInput: { min: 0, step: 1 } }}
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={rule.enabled}
                        disabled={!editable}
                        onChange={(_, checked) =>
                          ruleField(index, { enabled: checked })
                        }
                      />
                    }
                    label="Enabled"
                  />
                  <Button
                    startIcon={<DeleteOutlineIcon />}
                    color="error"
                    disabled={!editable}
                    onClick={() =>
                      setEdit({
                        ...edit,
                        rules: edit.rules.filter((_, i) => i !== index),
                      })
                    }
                  >
                    Remove rule
                  </Button>
                </Stack>
              </Stack>
            </Box>
          ))}
          <Button
            variant="outlined"
            sx={{ alignSelf: "flex-start" }}
            disabled={!editable || !data.options?.visit_types.length}
            onClick={() =>
              setEdit({
                ...edit,
                rules: [
                  ...edit.rules,
                  {
                    visit_type_id: data.options!.visit_types[0].id,
                    site_id: null,
                    enabled: false,
                    allowed_region_codes: [],
                  },
                ],
              })
            }
          >
            Add eligibility rule
          </Button>
        </Stack>
      </Paper>
      <Paper
        component="section"
        id="telehealth-preparation"
        variant="outlined"
        sx={{ p: { xs: 2, sm: 3 }, scrollMarginTop: 96 }}
      >
        <Stack spacing={2}>
          <Typography component="h2" variant="h6">
            Patient preparation and consent
          </Typography>
          <Typography color="text.secondary">
            Publish clinic-approved wording. Patients see the version attached
            to their visit; this form does not provide clinical or legal
            approval.
          </Typography>
          <TextField
            label="Consent title"
            value={draft.consent_title}
            disabled={!editable}
            onChange={(event) => field("consent_title", event.target.value)}
            fullWidth
          />
          <TextField
            label="Telehealth consent wording"
            multiline
            minRows={5}
            value={draft.consent_body}
            disabled={!editable}
            onChange={(event) => field("consent_body", event.target.value)}
            fullWidth
          />
          <TextField
            label="Patient instructions"
            multiline
            minRows={3}
            value={draft.patient_instructions}
            disabled={!editable}
            onChange={(event) =>
              field("patient_instructions", event.target.value)
            }
            fullWidth
          />
          <TextField
            label="Language code"
            value={draft.locale}
            disabled={!editable}
            onChange={(event) => field("locale", event.target.value)}
            sx={{ maxWidth: 240 }}
          />
          <Divider />
          <Typography component="h3" variant="subtitle1">
            Help during a visit
          </Typography>
          <TextField
            label="Support label"
            value={draft.support_label}
            disabled={!editable}
            onChange={(event) => field("support_label", event.target.value)}
            fullWidth
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Support phone"
              value={draft.support_phone || ""}
              disabled={!editable}
              onChange={(event) => field("support_phone", event.target.value)}
              sx={{ flex: 1 }}
            />
            <TextField
              label="Support website"
              type="url"
              value={draft.support_url || ""}
              disabled={!editable}
              onChange={(event) => field("support_url", event.target.value)}
              sx={{ flex: 1 }}
            />
          </Stack>
          <FormControlLabel
            control={
              <Switch
                checked={draft.require_location}
                disabled={!editable}
                onChange={(_, value) => field("require_location", value)}
              />
            }
            label="Require the patient's current location"
          />
          <FormControlLabel
            control={
              <Switch
                checked={draft.require_callback}
                disabled={!editable}
                onChange={(_, value) => field("require_callback", value)}
              />
            }
            label="Require a callback phone number"
          />
          <FormControlLabel
            control={
              <Switch
                checked={draft.allow_audio_only}
                disabled={!editable}
                onChange={(_, value) => field("allow_audio_only", value)}
              />
            }
            label="Permit audio-only visits when the clinic's policy allows"
          />
          <FormControlLabel
            control={
              <Switch
                checked={draft.allow_staff_screen_share}
                disabled={!editable}
                onChange={(_, value) =>
                  field("allow_staff_screen_share", value)
                }
              />
            }
            label="Allow staff screen sharing"
          />
          <Divider />
          <Typography component="h3" variant="subtitle1">
            Visit timing
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" },
              gap: 2,
            }}
          >
            {numericFields.map(({ key, label, min, max }) => (
              <TextField
                key={key}
                label={label}
                type="number"
                value={draft[key]}
                disabled={!editable}
                onChange={(event) => field(key, Number(event.target.value))}
                slotProps={{ htmlInput: { min, max, step: 1 } }}
              />
            ))}
          </Box>
        </Stack>
      </Paper>
      <Paper
        component="section"
        id="telehealth-scribe"
        variant="outlined"
        sx={{ p: { xs: 2, sm: 3 }, scrollMarginTop: 96 }}
      >
        <Stack spacing={2}>
          <Typography component="h2" variant="h6">
            Scribe during video calls
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={draft.scribe_enabled}
                disabled={!editable}
                onChange={(_, value) => field("scribe_enabled", value)}
              />
            }
            label="Make Scribe available inside video visits"
          />
          <Typography color="text.secondary">
            Recording requires its own patient consent. A patient can continue
            the video visit without recording. Notes remain drafts until the
            clinician reviews them.
          </Typography>
          <TextField
            label="Scribe consent title"
            value={draft.scribe_consent_title || ""}
            disabled={!editable}
            onChange={(event) =>
              field("scribe_consent_title", event.target.value)
            }
            fullWidth
          />
          <TextField
            label="Scribe recording consent wording"
            multiline
            minRows={4}
            value={draft.scribe_consent_body || ""}
            disabled={!editable}
            onChange={(event) =>
              field("scribe_consent_body", event.target.value)
            }
            fullWidth
          />
        </Stack>
      </Paper>
      <Paper
        variant="outlined"
        sx={{ p: 2, position: "sticky", bottom: 12, zIndex: 2 }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ overflowWrap: "anywhere" }}>
              Clinic: {clinic.practice.name}
            </Typography>
            <Typography variant="body2" role="status">
              {pending
                ? "Saving or checking settings…"
                : dirty
                  ? "Unsaved changes"
                  : data.active_policy
                    ? `Published policy version ${data.active_policy.version}`
                    : "No published policy"}
            </Typography>
          </Box>
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{ flexWrap: "wrap" }}
          >
            <Button
              disabled={Boolean(pending)}
              onClick={() => (dirty ? setConfirm("discard") : void reload())}
            >
              Reload settings
            </Button>
            <Button
              variant="outlined"
              disabled={!editable || !dirty}
              onClick={() =>
                void run(
                  "save",
                  `save:${version}:${JSON.stringify(edit)}`,
                  (key) =>
                    saveTelehealthSettingsDraft(
                      version,
                      {
                        enabled: edit.enabled,
                        provider_account_ref:
                          edit.provider_account_ref.trim() || null,
                      },
                      draft,
                      edit.rules,
                      key,
                    ),
                  "Draft saved. Publish it when the wording and eligibility rules are approved.",
                )
              }
            >
              Save draft
            </Button>
            <Button
              variant="contained"
              disabled={!editable || dirty || !data.draft?.content_digest}
              onClick={() => setConfirm("publish")}
            >
              Publish policy
            </Button>
          </Stack>
        </Stack>
      </Paper>
      <Dialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        aria-labelledby="telehealth-settings-confirm"
      >
        <DialogTitle id="telehealth-settings-confirm">
          {confirm === "publish"
            ? "Publish this consent policy?"
            : confirm === "disable"
              ? "Disable new video booking?"
              : "Discard unsaved changes?"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirm === "publish"
              ? "The saved wording and eligibility rules will apply to new video visits. Confirm that your clinic has approved this policy. Existing visits keep their attached policy version."
              : confirm === "disable"
                ? "New video appointments will be unavailable. Existing visits keep their current workflow and are not ended by this action."
                : "Reloading replaces the edits in this form with the latest saved settings."}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={Boolean(pending)}
            onClick={() => {
              if (confirm === "publish")
                void run(
                  "publish",
                  `publish:${version}:${draft.version}`,
                  (key) =>
                    publishTelehealthSettings(version, draft.version, key),
                  "Policy published. Review provider readiness and booking status above.",
                );
              else if (confirm === "disable")
                void run(
                  "disable",
                  `disable:${version}`,
                  (key) => disableNewTelehealthVisits(version, key),
                  "New video booking is disabled.",
                );
              else {
                setConfirm(null);
                void reload();
              }
            }}
          >
            {confirm === "publish"
              ? "Publish policy"
              : confirm === "disable"
                ? "Disable booking"
                : "Discard and reload"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
