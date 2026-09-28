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
import { useWorkingDraft } from "./useWorkingDraft";
import { useClinic } from "./Workspace";

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

type VitalWorkingDraft = {
  schema_version: 1;
  patient_id: number;
  encounter_id: number;
  values: Record<string, string>;
  units: Record<string, string>;
  observed_at: string;
  reviewing: boolean;
  pending_attempt: Attempt | null;
};

function validVitalWorkingDraft(
  value: VitalWorkingDraft,
  patientId: number,
  encounterId: number,
) {
  const pending = value.pending_attempt?.body?.vital_signs;
  return (
    value.schema_version === 1 &&
    value.patient_id === patientId &&
    value.encounter_id === encounterId &&
    value.values !== null &&
    typeof value.values === "object" &&
    value.units !== null &&
    typeof value.units === "object" &&
    typeof value.observed_at === "string" &&
    (!pending ||
      (typeof pending.request_key === "string" &&
        typeof pending.dictionary_version === "string" &&
        typeof pending.observed_at === "string" &&
        pending.confirmed_patient === true &&
        Array.isArray(pending.readings)))
  );
}

function localDateTime(value = businessNow()) {
  const local = new Date(value.valueOf() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function isDecimal(value: string) {
  return /^[+-]?\d+(?:\.\d+)?$/.test(value);
}

function dateLabel(value: string, timezone: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: timezone,
      }).format(date);
}

export function isLatestVitalLoad(
  currentSequence: number,
  requestSequence: number,
) {
  return currentSequence === requestSequence;
}

function normalizedDecimal(value: string | null | undefined) {
  const match = value?.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const integer = match[2].replace(/^0+(?=\d)/, "");
  const fraction = (match[3] ?? "").replace(/0+$/, "");
  const sign =
    match[1] === "-" && `${integer}${fraction}`.replace(/0/g, "") ? "-" : "";
  return `${sign}${integer}${fraction ? `.${fraction}` : ""}`;
}

export function vitalSignsResponseMatches(
  observations: Observation[],
  patientId: number,
  encounterId: number,
  attempt: Attempt,
) {
  const request = attempt.body.vital_signs;
  if (
    observations.length === 0 ||
    observations.some(
      (observation) =>
        observation.patient_id !== patientId ||
        observation.encounter_id !== encounterId ||
        observation.code_system !== "urn:apply:vital-signs" ||
        observation.code_version !== request.dictionary_version,
    ) ||
    !observations.some(
      (observation) =>
        observation.code === "vital-signs" &&
        observation.value_kind === "group",
    )
  )
    return false;

  return request.readings.every((reading) =>
    observations.some(
      (observation) =>
        observation.code === reading.code &&
        observation.value_kind === "numeric" &&
        observation.unit_code === reading.unit_code &&
        normalizedDecimal(observation.numeric_value) ===
          normalizedDecimal(reading.value),
    ),
  );
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
  const { practice } = useClinic();
  const { registerBlocker } = useClinicNavigation();
  const workingDraft = useWorkingDraft<VitalWorkingDraft>({
    kind: "vitals",
    patientId,
    encounterId,
  });
  const [open, setOpen] = useState(false);
  const [definitions, setDefinitions] = useState<VitalDefinitions | null>(null);
  const [loading, setLoading] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [units, setUnits] = useState<Record<string, string>>({});
  const [observedAt, setObservedAt] = useState(localDateTime());
  const [reviewing, setReviewing] = useState(false);
  const [confirmedPatient, setConfirmedPatient] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const [error, setError] = useState("");
  const [replaceWorkingCopy, setReplaceWorkingCopy] = useState(false);
  const attempt = useRef<Attempt | null>(null);
  const loadSequence = useRef(0);
  const restored = useRef(false);
  const skipNextAutosave = useRef(false);
  const draftSaveTimer = useRef<number | null>(null);

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
    Object.values(values).some((value) => value.trim()) ||
    Object.values(units).some(Boolean);
  const blocked = open && (hasDraft || outcomeUnknown);
  const draftReady = workingDraft.ready;

  const workingSnapshot = (
    pendingAttempt = attempt.current,
  ): VitalWorkingDraft => ({
    schema_version: 1,
    patient_id: patientId,
    encounter_id: encounterId,
    values,
    units,
    observed_at: observedAt,
    reviewing,
    pending_attempt: pendingAttempt,
  });

  const cancelPendingDraftSave = () => {
    if (draftSaveTimer.current !== null) {
      window.clearTimeout(draftSaveTimer.current);
      draftSaveTimer.current = null;
    }
  };

  const reloadWorkingDraft = () => {
    cancelPendingDraftSave();
    setReplaceWorkingCopy(false);
    restored.current = false;
    workingDraft.reload();
  };

  const retryWorkingDraft = async () => {
    cancelPendingDraftSave();
    if (!(await workingDraft.save(workingSnapshot())))
      setError(
        "The current working entry is still only in this window. Keep it open and retry when the connection is available.",
      );
  };

  useEffect(() => {
    if (!workingDraft.ready || restored.current) return;
    restored.current = true;
    const saved = workingDraft.restored;
    if (!saved) return;
    if (!validVitalWorkingDraft(saved, patientId, encounterId)) {
      setError(
        "The protected working entry did not match this patient and encounter and was not loaded.",
      );
      return;
    }
    skipNextAutosave.current = true;
    setValues(saved.values ?? {});
    setUnits(saved.units ?? {});
    const hasRestoredEntry =
      saved.reviewing === true ||
      Boolean(saved.pending_attempt) ||
      Object.values(saved.values ?? {}).some((value) => String(value).trim()) ||
      Object.values(saved.units ?? {}).some(Boolean);
    setObservedAt(
      hasRestoredEntry && saved.observed_at
        ? saved.observed_at
        : localDateTime(),
    );
    setReviewing(saved.reviewing === true);
    attempt.current = saved.pending_attempt ?? null;
    if (saved.pending_attempt) {
      setConfirmedPatient(true);
      setOutcomeUnknown(true);
      setError(
        "A submitted vital-sign request was restored. Retry the exact request to reconcile its saved outcome.",
      );
    }
  }, [encounterId, patientId, workingDraft.ready, workingDraft.restored]);

  useEffect(() => {
    if (busy || !workingDraft.ready || !restored.current) return;
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false;
      return;
    }
    if (!hasDraft && !attempt.current) return;
    cancelPendingDraftSave();
    draftSaveTimer.current = window.setTimeout(() => {
      draftSaveTimer.current = null;
      void workingDraft.save(workingSnapshot());
    }, 650);
    return cancelPendingDraftSave;
  }, [
    busy,
    confirmedPatient,
    hasDraft,
    observedAt,
    reviewing,
    units,
    values,
    workingDraft.ready,
  ]);

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
    setObservedAt(localDateTime());
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
    if (!hasDraft && !attempt.current) setObservedAt(localDateTime());
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
  const discard = async () => {
    if (busy || outcomeUnknown) return;
    cancelPendingDraftSave();
    setBusy(true);
    const cleared = await workingDraft.clear();
    setBusy(false);
    if (!cleared) {
      setError(
        "The saved working entry could not be cleared. Try again before closing.",
      );
      return;
    }
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
    cancelPendingDraftSave();
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
      const durable = await workingDraft.save(workingSnapshot(current));
      if (!durable) {
        setError(
          "The working entry was not saved. Recording was stopped so these measurements are not lost on refresh.",
        );
        return;
      }
      const result = await api<{ observations: Observation[] }>(endpoint, {
        method: "POST",
        body: current.body,
      });
      if (
        !vitalSignsResponseMatches(
          result.observations,
          patientId,
          encounterId,
          current,
        )
      )
        throw new Error(
          "The recorded vital-sign response did not match this patient, encounter, and exact entry.",
        );
      onRecorded(result.observations);
      const cleared = await workingDraft.clear();
      if (!cleared) {
        setOutcomeUnknown(true);
        setError(
          "Vital signs were recorded, but the recovery copy could not be cleared. Retry the exact request to finish reconciling it.",
        );
        return;
      }
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
            {workingDraft.status === "saving" && (
              <Typography role="status" color="text.secondary">
                Saving working entry…
              </Typography>
            )}
            {workingDraft.status === "loading" && (
              <Typography role="status" color="text.secondary">
                Recovering protected working entry…
              </Typography>
            )}
            {workingDraft.status === "saved" && !outcomeUnknown && (
              <Typography role="status" color="text.secondary">
                Working entry saved.
              </Typography>
            )}
            {(workingDraft.status === "error" ||
              workingDraft.status === "conflict") && (
              <Alert
                severity="warning"
                action={
                  workingDraft.status === "error" ? (
                    <Button
                      color="inherit"
                      onClick={() => void retryWorkingDraft()}
                    >
                      Retry saving current entry
                    </Button>
                  ) : attempt.current ? undefined : (
                    <Button
                      color="inherit"
                      onClick={() => setReplaceWorkingCopy(true)}
                    >
                      Load saved entry
                    </Button>
                  )
                }
              >
                {workingDraft.error ||
                  "The working entry could not be saved. Reload it before recording."}
                {workingDraft.status === "conflict" && attempt.current
                  ? " Reconcile the exact submitted request before replacing this copy."
                  : ""}
              </Alert>
            )}
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
                  Enter only measurements taken for this encounter. BMI is
                  calculated by the server when height and weight are recorded
                  together; pain remains the patient-reported 0–10 score.
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
                          !definitions.can_write ||
                          busy ||
                          outcomeUnknown ||
                          !draftReady
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
                          outcomeUnknown ||
                          !draftReady
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
                  label="Observed time (device local)"
                  type="datetime-local"
                  value={observedAt}
                  error={
                    error === "Record when these measurements were observed."
                  }
                  onChange={(event) => setObservedAt(event.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  disabled={
                    !definitions.can_write ||
                    busy ||
                    outcomeUnknown ||
                    !draftReady
                  }
                  helperText={
                    error === "Record when these measurements were observed."
                      ? error
                      : `Enter device-local time; review shows clinic time (${practice.timezone}).`
                  }
                  fullWidth
                />
                <Button
                  size="small"
                  sx={{ alignSelf: "flex-start" }}
                  disabled={
                    !definitions.can_write ||
                    busy ||
                    outcomeUnknown ||
                    !draftReady
                  }
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
                      <strong>
                        Observed (clinic time · {practice.timezone}):
                      </strong>{" "}
                      {dateLabel(
                        new Date(observedAt).toISOString(),
                        practice.timezone,
                      )}
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
                        !definitions.can_write ||
                        busy ||
                        outcomeUnknown ||
                        !draftReady
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
            <Button color="error" onClick={() => void discard()}>
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
              <Button
                variant="contained"
                disabled={busy || !draftReady}
                onClick={startReview}
              >
                Review measurements
              </Button>
            )}
          {definitions?.can_write &&
            definitions.fields.length > 0 &&
            reviewing && (
              <>
                {!outcomeUnknown && (
                  <Button
                    disabled={busy || !draftReady}
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
                  disabled={
                    busy ||
                    !draftReady ||
                    (!confirmedPatient && !outcomeUnknown)
                  }
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
      <Dialog
        open={replaceWorkingCopy}
        onClose={() => setReplaceWorkingCopy(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Replace this working entry?</DialogTitle>
        <DialogContent>
          <Typography>
            Loading the server copy replaces the measurements currently in this
            window. Continue only after confirming those local values are no
            longer needed.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReplaceWorkingCopy(false)}>
            Keep local entry
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={reloadWorkingDraft}
          >
            Replace with saved entry
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default VitalSignsEntry;
