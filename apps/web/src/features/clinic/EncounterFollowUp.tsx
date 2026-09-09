import {
  Alert,
  Box,
  Button,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../api/client";
import type { EncounterDetail, Patient } from "../../api/contracts";
import { LoadState, useResource } from "../../shared/ui";
import { useWorkingDraft } from "./useWorkingDraft";
import { useClinic } from "./Workspace";

type FollowUpStatus = "not_required" | "needed" | "arranged" | "completed";
type FollowUpAppointment = {
  id: number;
  status: string;
  starts_at: string;
  ends_at: string;
  visit_modality: string;
};
export type EncounterFollowUpRecord = {
  id: number;
  patient_id: number;
  encounter_id: number;
  source_kind: "in_person" | "telehealth";
  status: FollowUpStatus;
  recorded_status: FollowUpStatus;
  plan: string;
  outcome: string;
  due_at: string | null;
  follow_up_appointment: FollowUpAppointment | null;
  assigned_to_membership_id: number | null;
  completed_at: string | null;
  version: number;
  updated_at: string;
};
type FollowUpResponse = {
  follow_up: EncounterFollowUpRecord | null;
  options: { follow_up_appointments: FollowUpAppointment[] };
};
type FollowUpDraft = {
  status: Exclude<FollowUpStatus, "completed">;
  plan: string;
  dueAt: string;
  appointmentId: string;
  requestKey: string | null;
  expectedVersion: number;
};

function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  const shifted = new Date(date.valueOf() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function dateLabel(value: string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

export function EncounterFollowUpPanel({
  patient,
  encounter,
  timezone,
}: {
  patient: Patient;
  encounter: EncounterDetail;
  timezone: string;
}) {
  const { capabilities } = useClinic();
  const canWrite = capabilities.encounters === true;
  const resource = useResource<FollowUpResponse>(
    `/api/clinic/encounters/${encounter.id}/follow_up`,
  );
  const [status, setStatus] = useState<Exclude<FollowUpStatus, "completed">>("not_required");
  const [plan, setPlan] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [appointmentId, setAppointmentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [restored, setRestored] = useState(false);
  const requestKeyRef = useRef<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  const followUp = resource.data?.follow_up ?? null;
  const recovery = useWorkingDraft<FollowUpDraft>({
    kind: "follow_up",
    patientId: patient.id,
    encounterId: encounter.id,
    enabled: canWrite,
  });

  useEffect(() => {
    if (!resource.data || restored) return;
    const draft = recovery.ready ? recovery.restored : null;
    if (draft) {
      setStatus(draft.status);
      setPlan(draft.plan);
      setDueAt(draft.dueAt);
      setAppointmentId(draft.appointmentId);
      requestKeyRef.current = draft.requestKey;
      setNotice(
        draft.requestKey
          ? "A saved follow-up attempt was restored. Reconcile the current record before retrying the same save."
          : "Unsaved follow-up changes were restored for this encounter.",
      );
      setRestored(true);
      return;
    }
    if (recovery.ready) {
      setStatus(
        followUp?.status === "completed"
          ? "not_required"
          : followUp?.status ?? "not_required",
      );
      setPlan(followUp?.plan ?? "");
      setDueAt(localDateTime(followUp?.due_at ?? null));
      setAppointmentId(String(followUp?.follow_up_appointment?.id ?? ""));
      setRestored(true);
    }
  }, [followUp, recovery.ready, recovery.restored, resource.data, restored]);

  useEffect(() => {
    if (!canWrite || !restored || followUp?.status === "completed" || requestKeyRef.current) return;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void recovery.save({
        status,
        plan,
        dueAt,
        appointmentId,
        requestKey: null,
        expectedVersion: followUp?.version ?? 0,
      });
    }, 500);
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    };
  }, [appointmentId, canWrite, dueAt, followUp?.status, followUp?.version, plan, recovery.save, restored, status]);

  if (!resource.data) return <LoadState error={resource.error} />;

  const save = async () => {
    if (!canWrite || busy) return;
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (status !== "not_required" && !plan.trim()) {
      setError("Enter the follow-up plan.");
      return;
    }
    if (status === "arranged" && !appointmentId) {
      setError("Choose the arranged appointment.");
      return;
    }
    const requestKey = requestKeyRef.current ?? crypto.randomUUID();
    const snapshot: FollowUpDraft = {
      status,
      plan,
      dueAt,
      appointmentId,
      requestKey,
      expectedVersion: followUp?.version ?? 0,
    };
    if (!(await recovery.save(snapshot))) {
      setError(recovery.error || "The follow-up could not be saved for recovery.");
      return;
    }
    requestKeyRef.current = requestKey;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ follow_up: EncounterFollowUpRecord }>(
        `/api/clinic/encounters/${encounter.id}/follow_up`,
        {
          method: "PUT",
          body: {
            follow_up: {
              request_key: requestKey,
              expected_version: snapshot.expectedVersion,
              status,
              plan: plan.trim(),
              ...(dueAt ? { due_at: new Date(dueAt).toISOString() } : {}),
              ...(status === "arranged"
                ? { follow_up_appointment_id: Number(appointmentId) }
                : {}),
            },
          },
        },
      );
      if (
        result.follow_up.patient_id !== patient.id ||
        result.follow_up.encounter_id !== encounter.id
      ) throw new Error("The saved follow-up did not match this encounter.");
      requestKeyRef.current = null;
      if (!(await recovery.clear())) {
        setError(
          recovery.error ||
            "The follow-up was saved, but its recovery record could not be cleared. Refresh before another edit.",
        );
      } else {
        setNotice("Follow-up plan saved.");
      }
      resource.refresh();
    } catch (reason) {
      if (reason instanceof ApiError && [400, 404, 409, 422].includes(reason.status)) {
        requestKeyRef.current = null;
      }
      setError(
        reason instanceof Error
          ? reason.message
          : "The follow-up save outcome could not be confirmed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const reopen = async () => {
    if (!followUp || busy) return;
    const requestKey = crypto.randomUUID();
    const snapshot: FollowUpDraft = {
      status: "needed",
      plan: followUp.plan,
      dueAt: "",
      appointmentId: "",
      requestKey,
      expectedVersion: followUp.version,
    };
    if (!(await recovery.save(snapshot))) {
      setError(recovery.error || "The reopen request could not be saved for recovery.");
      return;
    }
    setBusy(true);
    try {
      await api(`/api/clinic/operations/encounter_follow_ups/${followUp.id}`, {
        method: "PATCH",
        body: { follow_up: { action: "reopen", request_key: requestKey, expected_version: followUp.version } },
      });
      await recovery.clear();
      setRestored(false);
      resource.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The follow-up could not be reopened.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper component="section" variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Box>
          <Typography variant="subtitle2">Encounter follow-up</Typography>
          <Typography variant="body2" color="text.secondary">
            Record the next action for {patient.display_name}. Needed follow-ups also appear in Operations.
          </Typography>
        </Box>
        {resource.error && <Alert severity="error">{resource.error}</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
        {notice && <Alert severity="info">{notice}</Alert>}
        {followUp?.status === "completed" ? (
          <Stack spacing={1}>
            <Alert severity="success">Completed {followUp.completed_at ? dateLabel(followUp.completed_at, timezone) : ""}</Alert>
            <Typography variant="body2">{followUp.outcome}</Typography>
            {canWrite && <Button onClick={() => void reopen()} disabled={busy} sx={{ alignSelf: "flex-start" }}>Reopen follow-up</Button>}
          </Stack>
        ) : (
          <>
            <TextField select label="Follow-up status" value={status} disabled={!canWrite || busy}
              onChange={(event) => setStatus(event.target.value as Exclude<FollowUpStatus, "completed">)}>
              <MenuItem value="not_required">No follow-up required</MenuItem>
              <MenuItem value="needed">Follow-up needed</MenuItem>
              <MenuItem value="arranged">Appointment arranged</MenuItem>
            </TextField>
            {status !== "not_required" && (
              <TextField label="Follow-up plan" multiline minRows={3} value={plan} disabled={!canWrite || busy}
                onChange={(event) => setPlan(event.target.value)} slotProps={{ htmlInput: { maxLength: 4000 } }} />
            )}
            {status === "needed" && (
              <TextField label="Due by" type="datetime-local" value={dueAt} disabled={!canWrite || busy}
                onChange={(event) => setDueAt(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            )}
            {status === "arranged" && (
              <TextField select label="Arranged appointment" value={appointmentId} disabled={!canWrite || busy}
                onChange={(event) => setAppointmentId(event.target.value)}>
                {resource.data.options.follow_up_appointments.map((appointment) => (
                  <MenuItem key={appointment.id} value={String(appointment.id)}>
                    {dateLabel(appointment.starts_at, timezone)} · {appointment.visit_modality.replaceAll("_", " ")}
                  </MenuItem>
                ))}
              </TextField>
            )}
            {canWrite && <Button variant="contained" onClick={() => void save()} disabled={busy || recovery.status === "saving"} sx={{ alignSelf: "flex-start" }}>
              {busy ? "Saving…" : requestKeyRef.current ? "Retry same save" : "Save follow-up"}
            </Button>}
          </>
        )}
      </Stack>
    </Paper>
  );
}
