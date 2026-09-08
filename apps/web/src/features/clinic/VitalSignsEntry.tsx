import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Observation } from "../../api/contracts";
import { api, ApiError } from "../../api/client";
import { businessNow } from "../../shared/businessDate";
import { useClinicNavigation } from "./clinicNavigation";

type VitalField = {
  code: string;
  label: string;
  group: string | null;
  units: Array<{ code: string; label: string }>;
};
type VitalDefinitions = {
  encounter_id: number;
  dictionary_version: string;
  code_system: string;
  can_write: boolean;
  fields: VitalField[];
};
type Reading = { code: string; value: string; unit_code: string };
type Attempt = {
  body: {
    vital_signs: {
      request_key: string;
      dictionary_version: string;
      observed_at: string;
      confirmed_patient: true;
      readings: Reading[];
    };
  };
};

function localDateTime(value = businessNow()) {
  const local = new Date(value.valueOf() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function isDecimal(value: string) {
  return /^[+-]?\d+(?:\.\d+)?$/.test(value);
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

export function isLatestVitalLoad(
  currentSequence: number,
  requestSequence: number,
) {
  return currentSequence === requestSequence;
}

export function VitalSignsEntry({
  patientId,
  patientName,
  encounterId,
  onRecorded,
}: {
  patientId: number;
  patientName: string;
  encounterId: number;
  onRecorded: (observations: Observation[]) => void;
}) {
  const { registerBlocker } = useClinicNavigation();
  const [open, setOpen] = useState(false);
  const [definitions, setDefinitions] = useState<VitalDefinitions | null>(null);
  const [loading, setLoading] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [units, setUnits] = useState<Record<string, string>>({});
  const [observedAt, setObservedAt] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [confirmedPatient, setConfirmedPatient] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const [error, setError] = useState("");
  const attempt = useRef<Attempt | null>(null);
  const loadSequence = useRef(0);

  const endpoint = `/api/clinic/patients/${patientId}/encounters/${encounterId}/vital_signs`;
  const readings = useMemo(() => {
    if (!definitions) return [];
    return definitions.fields.flatMap((field) => {
      const value = values[field.code]?.trim() ?? "";
      if (!value) return [];
      return [
        {
          code: field.code,
          value,
          unit_code:
            field.units.length === 1
              ? field.units[0].code
              : (units[field.code] ?? ""),
        },
      ];
    });
  }, [definitions, units, values]);
  const hasDraft =
    reviewing ||
    confirmedPatient ||
    Boolean(observedAt) ||
    Object.values(values).some((value) => value.trim()) ||
    Object.values(units).some(Boolean);
  const blocked = open && (hasDraft || outcomeUnknown);

  useEffect(() => {
    if (!blocked) return;
    const warning = outcomeUnknown
      ? "The vital-sign save outcome is unknown. Retry the exact request before leaving."
      : "You have unsaved vital-sign measurements. Leave this page?";
    const unregister = registerBlocker(() => warning);
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = warning;
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", unload);
    };
  }, [blocked, outcomeUnknown, registerBlocker]);

  const reset = () => {
    loadSequence.current += 1;
    setDefinitions(null);
    setLoading(false);
    setValues({});
    setUnits({});
    setObservedAt("");
    setReviewing(false);
    setConfirmedPatient(false);
    setBusy(false);
    setOutcomeUnknown(false);
    setError("");
    attempt.current = null;
  };
  const load = async () => {
    const requestSequence = ++loadSequence.current;
    const requestIsLatest = () =>
      isLatestVitalLoad(loadSequence.current, requestSequence);
    setLoading(true);
    setError("");
    try {
      const result = await api<VitalDefinitions>(endpoint);
      if (result.encounter_id !== encounterId)
        throw new Error(
          "The vital-sign measurement options did not match this encounter.",
        );
      if (!requestIsLatest()) return;
      setDefinitions(result);
    } catch (reason) {
      if (!requestIsLatest()) return;
      setError(
        reason instanceof Error
          ? reason.message
          : "Vital-sign measurement options could not be loaded.",
      );
    } finally {
      if (requestIsLatest()) setLoading(false);
    }
  };
  const openDialog = () => {
    reset();
    setOpen(true);
    void load();
  };
  const close = () => {
    if (busy || outcomeUnknown) return;
    if (hasDraft) {
      setError("Discard the entered measurements before closing this dialog.");
      return;
    }
    setOpen(false);
    reset();
  };
  const discard = () => {
    if (busy || outcomeUnknown) return;
    reset();
    setOpen(false);
  };
  const unitFor = (field: VitalField) =>
    field.units.length === 1 ? field.units[0].code : (units[field.code] ?? "");
  const validate = () => {
    if (!definitions)
      return "Vital-sign measurement options are not available.";
    if (!readings.length) return "Enter at least one measurement.";
    if (readings.some((reading) => !isDecimal(reading.value)))
      return "Enter each measurement as an exact decimal value.";
    if (readings.some((reading) => !reading.unit_code))
      return "Choose a unit for each entered measurement.";
    const bloodPressure = definitions.fields.filter(
      (field) => field.group === "blood_pressure",
    );
    if (
      bloodPressure.length &&
      bloodPressure.some((field) => values[field.code]?.trim()) &&
      bloodPressure.some((field) => !values[field.code]?.trim())
    )
      return "Enter every blood pressure measurement in this group, or leave the group blank.";
    if (!observedAt) return "Record when these measurements were observed.";
    if (Number.isNaN(new Date(observedAt).valueOf()))
      return "Enter a valid local observation time.";
    return "";
  };
  const startReview = () => {
    const message = validate();
    if (message) {
      setError(message);
      return;
    }
    setError("");
    setReviewing(true);
  };
  const save = async () => {
    if (busy) return;
    const message = validate();
    if (!confirmedPatient) {
      setError(
        "Confirm the patient and encounter before recording vital signs.",
      );
      return;
    }
    if (message) {
      setError(message);
      return;
    }
    const current =
      attempt.current ??
      ({
        body: {
          vital_signs: {
            request_key: crypto.randomUUID(),
            dictionary_version: definitions!.dictionary_version,
            observed_at: new Date(observedAt).toISOString(),
            confirmed_patient: true,
            readings,
          },
        },
      } satisfies Attempt);
    attempt.current = current;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ observations: Observation[] }>(endpoint, {
        method: "POST",
        body: current.body,
      });
      onRecorded(result.observations);
      setOpen(false);
      reset();
    } catch (reason) {
      if (
        !(reason instanceof ApiError) ||
        reason.status === 408 ||
        reason.status >= 500 ||
        reason.code === "outcome_unconfirmed"
      ) {
        setOutcomeUnknown(true);
        setError(
          "The save outcome is unknown. Retry this exact vital-sign request before editing or closing it.",
        );
      } else {
        attempt.current = null;
        setOutcomeUnknown(false);
        if (reason.status === 409) {
          setDefinitions(null);
          setReviewing(false);
          setConfirmedPatient(false);
          setError(
            `${reason.message} Reload the vital-sign measurement options before trying again.`,
          );
        } else {
          setError(reason.message);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button size="small" variant="outlined" onClick={openDialog}>
        Record vital signs
      </Button>
      <Dialog
        open={open}
        onClose={close}
        fullWidth
        maxWidth="sm"
        aria-labelledby={`vital-signs-${encounterId}-title`}
      >
        <DialogTitle id={`vital-signs-${encounterId}-title`}>
          Record vital signs
          <Typography component="div" variant="body2" color="text.secondary">
            {patientName} · Encounter #{encounterId}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {loading && (
              <Typography role="status" color="text.secondary">
                Loading vital-sign measurement options…
              </Typography>
            )}
            {error && <Alert severity="error">{error}</Alert>}
            {definitions && !definitions.can_write && (
              <Alert severity="info">
                Vital signs cannot be recorded for this encounter.
              </Alert>
            )}
            {definitions &&
              definitions.can_write &&
              !definitions.fields.length && (
                <Alert severity="info">
                  No vital-sign measurement options are available for this
                  encounter.
                </Alert>
              )}
            {definitions && !reviewing && (
              <>
                <Typography color="text.secondary">
                  Enter only measurements taken for this encounter. Values are
                  recorded as entered; this form does not interpret them.
                </Typography>
                {definitions.fields.map((field) => (
                  <Paper key={field.code} variant="outlined" sx={{ p: 1.5 }}>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1}
                      sx={{ alignItems: { sm: "flex-start" } }}
                    >
                      <TextField
                        label={field.label}
                        value={values[field.code] ?? ""}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            [field.code]: event.target.value,
                          }))
                        }
                        slotProps={{
                          htmlInput: { inputMode: "decimal", maxLength: 30 },
                        }}
                        fullWidth
                        disabled={
                          !definitions.can_write || busy || outcomeUnknown
                        }
                      />
                      <TextField
                        select
                        label="Unit"
                        value={unitFor(field)}
                        onChange={(event) =>
                          setUnits((current) => ({
                            ...current,
                            [field.code]: event.target.value,
                          }))
                        }
                        sx={{ minWidth: { sm: 160 } }}
                        disabled={
                          !definitions.can_write ||
                          field.units.length === 1 ||
                          busy ||
                          outcomeUnknown
                        }
                      >
                        {field.units.length !== 1 && (
                          <MenuItem value="">Choose unit</MenuItem>
                        )}
                        {field.units.map((unit) => (
                          <MenuItem key={unit.code} value={unit.code}>
                            {unit.label}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Stack>
                  </Paper>
                ))}
                <TextField
                  label="Observed time"
                  type="datetime-local"
                  value={observedAt}
                  onChange={(event) => setObservedAt(event.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  disabled={!definitions.can_write || busy || outcomeUnknown}
                  helperText="Use this device's local time."
                  fullWidth
                />
                <Button
                  size="small"
                  sx={{ alignSelf: "flex-start" }}
                  disabled={!definitions.can_write || busy || outcomeUnknown}
                  onClick={() => setObservedAt(localDateTime())}
                >
                  Use current time
                </Button>
              </>
            )}
            {definitions && reviewing && (
              <>
                <Typography color="text.secondary">
                  Review the exact measurements before recording them for this
                  patient and encounter.
                </Typography>
                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Stack spacing={1}>
                    <Typography>
                      <strong>Patient:</strong> {patientName}
                    </Typography>
                    <Typography>
                      <strong>Encounter:</strong> #{encounterId}
                    </Typography>
                    <Typography>
                      <strong>Observed:</strong>{" "}
                      {dateLabel(new Date(observedAt).toISOString())}
                    </Typography>
                    <Divider />
                    {readings.map((reading) => {
                      const field = definitions.fields.find(
                        (item) => item.code === reading.code,
                      );
                      const unit = field?.units.find(
                        (item) => item.code === reading.unit_code,
                      );
                      return (
                        <Typography key={reading.code}>
                          {field?.label || reading.code}: {reading.value}{" "}
                          {unit?.label || reading.unit_code}
                        </Typography>
                      );
                    })}
                  </Stack>
                </Paper>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={confirmedPatient}
                      onChange={(event) =>
                        setConfirmedPatient(event.target.checked)
                      }
                      disabled={
                        !definitions.can_write || busy || outcomeUnknown
                      }
                    />
                  }
                  label={`I confirmed ${patientName} and encounter #${encounterId}.`}
                />
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy || outcomeUnknown} onClick={close}>
            Close
          </Button>
          {hasDraft && !busy && !outcomeUnknown && (
            <Button color="error" onClick={discard}>
              Discard entry
            </Button>
          )}
          {error && !outcomeUnknown && (
            <Button disabled={loading || busy} onClick={() => void load()}>
              Reload options
            </Button>
          )}
          {definitions?.can_write &&
            definitions.fields.length > 0 &&
            !reviewing && (
              <Button variant="contained" disabled={busy} onClick={startReview}>
                Review measurements
              </Button>
            )}
          {definitions?.can_write &&
            definitions.fields.length > 0 &&
            reviewing && (
              <>
                {!outcomeUnknown && (
                  <Button
                    disabled={busy}
                    onClick={() => {
                      setConfirmedPatient(false);
                      setReviewing(false);
                    }}
                  >
                    Edit measurements
                  </Button>
                )}
                <Button
                  variant="contained"
                  disabled={busy || (!confirmedPatient && !outcomeUnknown)}
                  onClick={() => void save()}
                >
                  {busy
                    ? "Recording…"
                    : outcomeUnknown
                      ? "Retry exact request"
                      : "Record vital signs"}
                </Button>
              </>
            )}
        </DialogActions>
      </Dialog>
    </>
  );
}

export default VitalSignsEntry;
