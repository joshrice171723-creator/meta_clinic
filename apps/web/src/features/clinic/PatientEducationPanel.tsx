import AddIcon from "@mui/icons-material/Add";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useRef, useState } from "react";
import type { EncounterDetail, Patient } from "../../api/contracts";
import { api, ApiError } from "../../api/client";
import { useResource } from "../../shared/ui";

type EducationEvent = {
  id: number;
  patient_id: number;
  encounter_id: number;
  topic_code: string;
  topic_title: string;
  delivery_method: string;
  recipient: string;
  material_title: string | null;
  material_url: string | null;
  language: string;
  interpreter_used: boolean;
  teach_back_status: string;
  patient_response: string | null;
  reteaching_summary: string | null;
  follow_up_needed: boolean;
  follow_up_plan: string | null;
  recorded_at: string;
};

type EducationResponse = {
  patient_id: number;
  encounter_id: number;
  events: EducationEvent[];
  options: {
    topics: string[];
    delivery_methods: string[];
    recipients: string[];
    teach_back_statuses: string[];
  };
  can_write: boolean;
};

type Form = {
  topic_code: string;
  topic_title: string;
  delivery_method: string;
  recipient: string;
  material_title: string;
  material_url: string;
  language: string;
  interpreter_used: boolean;
  teach_back_status: string;
  patient_response: string;
  reteaching_summary: string;
  follow_up_needed: boolean;
  follow_up_plan: string;
};

const initialForm = (patient: Patient): Form => ({
  topic_code: "self_care",
  topic_title: "",
  delivery_method: "discussion",
  recipient: "patient",
  material_title: "",
  material_url: "",
  language: patient.demographics?.primary_language || "English",
  interpreter_used: false,
  teach_back_status: "demonstrated",
  patient_response: "",
  reteaching_summary: "",
  follow_up_needed: false,
  follow_up_plan: "",
});

const label = (value: string) =>
  value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

export function PatientEducationPanel({
  patient,
  encounter,
}: {
  patient: Patient;
  encounter: EncounterDetail;
}) {
  const endpoint = `/api/clinic/patients/${patient.id}/encounters/${encounter.id}/education_events`;
  const resource = useResource<EducationResponse>(endpoint, {
    retainDataOnRefresh: true,
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(() => initialForm(patient));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const attempt = useRef<{ body: unknown } | null>(null);
  const data = resource.data;

  const update = (changes: Partial<Form>) => {
    if (!outcomeUnknown) setForm((current) => ({ ...current, ...changes }));
  };

  const save = async () => {
    if (!data?.can_write || busy) return;
    const materialRequired =
      form.delivery_method === "handout" || form.delivery_method === "portal";
    if (
      !form.topic_title.trim() ||
      !form.language.trim() ||
      (materialRequired && !form.material_title.trim()) ||
      (form.teach_back_status === "demonstrated" &&
        !form.patient_response.trim()) ||
      (form.teach_back_status === "needs_reteaching" &&
        !form.reteaching_summary.trim()) ||
      (form.follow_up_needed && !form.follow_up_plan.trim())
    ) {
      setError(
        "Complete the topic, delivery evidence, teach-back outcome, and any required follow-up plan.",
      );
      return;
    }
    const current = attempt.current ?? {
      body: {
        education_event: {
          request_key: crypto.randomUUID(),
          ...form,
          topic_title: form.topic_title.trim(),
          material_title: form.material_title.trim() || null,
          material_url: form.material_url.trim() || null,
          language: form.language.trim(),
          patient_response: form.patient_response.trim() || null,
          reteaching_summary: form.reteaching_summary.trim() || null,
          follow_up_plan: form.follow_up_plan.trim() || null,
        },
      },
    };
    attempt.current = current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ education_event: EducationEvent }>(endpoint, {
        method: "POST",
        body: current.body,
      });
      if (
        result.education_event.patient_id !== patient.id ||
        result.education_event.encounter_id !== encounter.id
      )
        throw new Error(
          "The saved education record did not match this encounter.",
        );
      attempt.current = null;
      setOutcomeUnknown(false);
      setForm(initialForm(patient));
      setOpen(false);
      setNotice("Patient education and teach-back evidence recorded.");
      resource.refresh();
    } catch (reason) {
      const unknown =
        !(reason instanceof ApiError) ||
        reason.status === 408 ||
        reason.status >= 500 ||
        reason.code === "outcome_unconfirmed";
      if (!unknown) attempt.current = null;
      setOutcomeUnknown(unknown);
      setError(
        unknown
          ? "The save outcome is unknown. Retry this exact education record before editing it."
          : reason instanceof Error
            ? reason.message
            : "The education record could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!data && !resource.error)
    return <Typography role="status">Loading patient education…</Typography>;
  if (!data)
    return (
      <Alert
        severity="error"
        action={<Button onClick={resource.refresh}>Retry</Button>}
      >
        {resource.error || "Patient education could not be loaded."}
      </Alert>
    );
  if (data.patient_id !== patient.id || data.encounter_id !== encounter.id)
    return (
      <Alert severity="error">
        Patient education loaded for a different encounter.
      </Alert>
    );

  return (
    <Paper
      id="patient-education"
      component="section"
      variant="outlined"
      sx={{ p: { xs: 2, md: 2.5 } }}
    >
      <Stack spacing={2}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          sx={{ justifyContent: "space-between" }}
        >
          <Box>
            <Typography component="h2" variant="h6">
              Patient education
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Record what was taught, the resource delivered, and understanding
              in the patient’s own words.
            </Typography>
          </Box>
          {data.can_write && (
            <Button
              startIcon={<AddIcon />}
              disabled={busy || outcomeUnknown}
              onClick={() => setOpen((value) => !value)}
            >
              Add education
            </Button>
          )}
        </Stack>
        {error && <Alert severity="error">{error}</Alert>}
        {notice && <Alert severity="success">{notice}</Alert>}
        <Collapse in={open || outcomeUnknown}>
          <Stack spacing={1.5}>
            <Box
              sx={{
                display: "grid",
                gap: 1.5,
                gridTemplateColumns: { xs: "1fr", md: "1fr 2fr" },
              }}
            >
              <TextField
                select
                label="Topic"
                value={form.topic_code}
                disabled={outcomeUnknown}
                onChange={(event) => update({ topic_code: event.target.value })}
              >
                {data.options.topics.map((option) => (
                  <MenuItem key={option} value={option}>
                    {label(option)}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="What was taught"
                required
                value={form.topic_title}
                disabled={outcomeUnknown}
                onChange={(event) =>
                  update({ topic_title: event.target.value })
                }
              />
              <TextField
                select
                label="Delivery"
                value={form.delivery_method}
                disabled={outcomeUnknown}
                onChange={(event) =>
                  update({ delivery_method: event.target.value })
                }
              >
                {data.options.delivery_methods.map((option) => (
                  <MenuItem key={option} value={option}>
                    {label(option)}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Recipient"
                value={form.recipient}
                disabled={outcomeUnknown}
                onChange={(event) => update({ recipient: event.target.value })}
              >
                {data.options.recipients.map((option) => (
                  <MenuItem key={option} value={option}>
                    {label(option)}
                  </MenuItem>
                ))}
              </TextField>
              {(form.delivery_method === "handout" ||
                form.delivery_method === "portal") && (
                <>
                  <TextField
                    label="Material title"
                    required
                    value={form.material_title}
                    disabled={outcomeUnknown}
                    onChange={(event) =>
                      update({ material_title: event.target.value })
                    }
                  />
                  <TextField
                    label="Material link"
                    value={form.material_url}
                    disabled={outcomeUnknown}
                    onChange={(event) =>
                      update({ material_url: event.target.value })
                    }
                  />
                </>
              )}
              <TextField
                label="Language used"
                required
                value={form.language}
                disabled={outcomeUnknown}
                onChange={(event) => update({ language: event.target.value })}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.interpreter_used}
                    disabled={outcomeUnknown}
                    onChange={(event) =>
                      update({ interpreter_used: event.target.checked })
                    }
                  />
                }
                label="Interpreter used"
              />
              <TextField
                select
                label="Teach-back outcome"
                value={form.teach_back_status}
                disabled={outcomeUnknown}
                onChange={(event) =>
                  update({
                    teach_back_status: event.target.value,
                    follow_up_needed:
                      event.target.value === "needs_reteaching" ||
                      form.follow_up_needed,
                  })
                }
              >
                {data.options.teach_back_statuses.map((option) => (
                  <MenuItem key={option} value={option}>
                    {label(option)}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            {form.teach_back_status === "demonstrated" && (
              <TextField
                label="Patient or caregiver response in their own words"
                required
                multiline
                minRows={2}
                value={form.patient_response}
                disabled={outcomeUnknown}
                onChange={(event) =>
                  update({ patient_response: event.target.value })
                }
              />
            )}
            {form.teach_back_status === "needs_reteaching" && (
              <TextField
                label="How the explanation was changed"
                required
                multiline
                minRows={2}
                value={form.reteaching_summary}
                disabled={outcomeUnknown}
                onChange={(event) =>
                  update({ reteaching_summary: event.target.value })
                }
              />
            )}
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.follow_up_needed}
                  disabled={
                    outcomeUnknown ||
                    form.teach_back_status === "needs_reteaching"
                  }
                  onChange={(event) =>
                    update({ follow_up_needed: event.target.checked })
                  }
                />
              }
              label="Follow-up needed"
            />
            {form.follow_up_needed && (
              <TextField
                label="Follow-up plan"
                required
                multiline
                minRows={2}
                value={form.follow_up_plan}
                disabled={outcomeUnknown}
                onChange={(event) =>
                  update({ follow_up_plan: event.target.value })
                }
              />
            )}
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                disabled={busy}
                onClick={() => void save()}
              >
                {busy
                  ? "Saving…"
                  : outcomeUnknown
                    ? "Retry exact save"
                    : "Record education"}
              </Button>
              <Button
                disabled={busy || outcomeUnknown}
                onClick={() => {
                  setOpen(false);
                  setForm(initialForm(patient));
                }}
              >
                Cancel
              </Button>
            </Stack>
          </Stack>
        </Collapse>
        {data.events.length === 0 ? (
          <Typography color="text.secondary">
            No patient education is recorded for this encounter.
          </Typography>
        ) : (
          <Stack
            component="ul"
            spacing={1}
            sx={{ listStyle: "none", m: 0, p: 0 }}
          >
            {data.events.map((event) => (
              <Paper
                component="li"
                key={event.id}
                variant="outlined"
                sx={{ p: 1.5 }}
              >
                <Stack spacing={0.5}>
                  <Stack
                    direction="row"
                    spacing={0.75}
                    sx={{ alignItems: "center", flexWrap: "wrap" }}
                  >
                    <Typography sx={{ fontWeight: 700 }}>
                      {event.topic_title}
                    </Typography>
                    <Chip
                      size="small"
                      variant="outlined"
                      label={label(event.teach_back_status)}
                    />
                    {event.follow_up_needed && (
                      <Chip
                        size="small"
                        color="warning"
                        label="Follow-up task created"
                      />
                    )}
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {label(event.delivery_method)} · {label(event.recipient)} ·{" "}
                    {event.language}
                    {event.interpreter_used ? " · Interpreter used" : ""}
                  </Typography>
                  {event.material_title && (
                    <Typography variant="body2">
                      Material: {event.material_title}
                    </Typography>
                  )}
                  {event.patient_response && (
                    <Typography variant="body2">
                      Teach-back: {event.patient_response}
                    </Typography>
                  )}
                  {event.reteaching_summary && (
                    <Typography variant="body2">
                      Re-teaching: {event.reteaching_summary}
                    </Typography>
                  )}
                  {event.follow_up_plan && (
                    <Typography variant="body2">
                      Follow-up: {event.follow_up_plan}
                    </Typography>
                  )}
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
