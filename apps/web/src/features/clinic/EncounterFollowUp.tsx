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
type FollowUpRequest = {
  kind: "record" | "reopen";
  endpoint: string;
  body: {
    follow_up: {
      request_key: string;
      expected_version: number;
      status?: Exclude<FollowUpStatus, "completed">;
      plan?: string;
      due_at?: string;
      follow_up_appointment_id?: number;
      action?: "reopen";
    };
  };
};
type FollowUpDraft = {
  status: Exclude<FollowUpStatus, "completed">;
  plan: string;
  dueAt: string;
  appointmentId: string;
  requestKey: string | null;
  expectedVersion: number;
  pendingRequest?: FollowUpRequest | null;
};

function followUpMatchesRequest(
  followUp: EncounterFollowUpRecord | null,
  request: FollowUpRequest,
) {
  if (!followUp) return false;
  const expected = request.body.follow_up;
  if (request.kind === "reopen")
    return (
      followUp.recorded_status === "needed" &&
      followUp.version > expected.expected_version
    );
  return (
    followUp.recorded_status === expected.status &&
    followUp.plan === (expected.plan ?? "") &&
    followUp.version >= expected.expected_version
  );
}

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
  onChanged,
}: {
  patient: Patient;
  encounter: EncounterDetail;
  timezone: string;
  onChanged?: () => void;
}) {
  const { capabilities } = useClinic();
  const canWrite = capabilities.encounters === true;
  const resource = useResource<FollowUpResponse>(
    `/api/clinic/encounters/${encounter.id}/follow_up`,
  );
  const [status, setStatus] =
    useState<Exclude<FollowUpStatus, "completed">>("not_required");
  const [plan, setPlan] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [appointmentId, setAppointmentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [restored, setRestored] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingDraftRef = useRef<FollowUpDraft | null>(null);
  const baseVersionRef = useRef(0);
  const busyRef = useRef(false);
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
      baseVersionRef.current = draft.expectedVersion;
      let pendingDraft = draft.pendingRequest ? draft : null;
      if (!pendingDraft && draft.requestKey) {
        const followUpBody = {
          request_key: draft.requestKey,
          expected_version: draft.expectedVersion,
          status: draft.status,
          plan: draft.plan.trim(),
          ...(draft.dueAt
            ? { due_at: new Date(draft.dueAt).toISOString() }
            : {}),
          ...(draft.status === "arranged"
            ? { follow_up_appointment_id: Number(draft.appointmentId) }
            : {}),
        };
        pendingDraft = {
          ...draft,
          pendingRequest: {
            kind: "record",
            endpoint: `/api/clinic/encounters/${encounter.id}/follow_up`,
            body: { follow_up: followUpBody },
          },
        };
      }
      pendingDraftRef.current = pendingDraft;
      setPending(Boolean(pendingDraft));
      setNotice(
        pendingDraft
          ? "A saved follow-up attempt was restored. Reconcile the current record before retrying the same save."
          : "Unsaved follow-up changes were restored for this encounter.",
      );
      setRestored(true);
      return;
    }
    if (recovery.ready) {
      baseVersionRef.current = followUp?.version ?? 0;
      setStatus(
        followUp?.status === "completed"
          ? "not_required"
          : (followUp?.status ?? "not_required"),
      );
      setPlan(followUp?.plan ?? "");
      setDueAt(localDateTime(followUp?.due_at ?? null));
      setAppointmentId(String(followUp?.follow_up_appointment?.id ?? ""));
      setRestored(true);
    }
  }, [followUp, recovery.ready, recovery.restored, resource.data, restored]);

  useEffect(() => {
    if (
      !canWrite ||
      !recovery.ready ||
      !restored ||
      busyRef.current ||
      followUp?.status === "completed" ||
      pending
    )
      return;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void recovery.save({
        status,
        plan,
        dueAt,
        appointmentId,
        requestKey: null,
        expectedVersion: baseVersionRef.current,
        pendingRequest: null,
      });
    }, 500);
    return () => {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, [
    appointmentId,
    canWrite,
    dueAt,
    followUp?.status,
    pending,
    plan,
    recovery.ready,
    recovery.save,
    restored,
    status,
  ]);

  if (!resource.data) return <LoadState error={resource.error} />;

  const editableDraft = (): FollowUpDraft => ({
    status,
    plan,
    dueAt,
    appointmentId,
    requestKey: null,
    expectedVersion: baseVersionRef.current,
    pendingRequest: null,
  });

  const releasePending = async (version = baseVersionRef.current) => {
    baseVersionRef.current = version;
    pendingDraftRef.current = null;
    setPending(false);
    const editable = { ...editableDraft(), expectedVersion: version };
    if (!(await recovery.save(editable)))
      setError(
        recovery.error ||
          "The local follow-up edits are still on this page, but the recovery copy could not be updated.",
      );
  };

  const submitPending = async (draft: FollowUpDraft) => {
    const request = draft.pendingRequest;
    if (!request) return;
    try {
      const result = await api<{ follow_up: EncounterFollowUpRecord }>(
        request.endpoint,
        {
          method: request.kind === "record" ? "PUT" : "PATCH",
          body: request.body,
        },
      );
      if (
        result.follow_up.patient_id !== patient.id ||
        result.follow_up.encounter_id !== encounter.id
      )
        throw new Error("The saved follow-up did not match this encounter.");
      if (!(await recovery.clear())) {
        setError(
          recovery.error ||
            "The follow-up was saved, but its recovery record could not be cleared. Retry the same request to finish recovery.",
        );
        return;
      }
      baseVersionRef.current = result.follow_up.version;
      pendingDraftRef.current = null;
      setPending(false);
      setStatus(
        result.follow_up.status === "completed"
          ? "not_required"
          : result.follow_up.status,
      );
      setPlan(result.follow_up.plan);
      setDueAt(localDateTime(result.follow_up.due_at));
      setAppointmentId(
        String(result.follow_up.follow_up_appointment?.id ?? ""),
      );
      setNotice(
        request.kind === "record"
          ? "Follow-up plan saved."
          : "Follow-up reopened.",
      );
      resource.refresh();
      onChanged?.();
    } catch (reason) {
      const unknown =
        !(reason instanceof ApiError) ||
        reason.status === 408 ||
        reason.status >= 500 ||
        reason.code === "outcome_unconfirmed";
      if (!unknown) await releasePending();
      setError(
        unknown
          ? "The follow-up outcome is unknown. Check the current record or retry this exact request."
          : reason instanceof Error
            ? reason.message
            : "The follow-up could not be saved.",
      );
    }
  };

  const save = async () => {
    if (!canWrite || busyRef.current || !recovery.ready) return;
    busyRef.current = true;
    setBusy(true);
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    try {
      let snapshot = pendingDraftRef.current;
      if (!snapshot) {
        if (status !== "not_required" && !plan.trim()) {
          setError("Enter the follow-up plan.");
          return;
        }
        if (status === "arranged" && !appointmentId) {
          setError("Choose the arranged appointment.");
          return;
        }
        const requestKey = crypto.randomUUID();
        const request: FollowUpRequest = {
          kind: "record",
          endpoint: `/api/clinic/encounters/${encounter.id}/follow_up`,
          body: {
            follow_up: {
              request_key: requestKey,
              expected_version: baseVersionRef.current,
              status,
              plan: plan.trim(),
              ...(dueAt ? { due_at: new Date(dueAt).toISOString() } : {}),
              ...(status === "arranged"
                ? { follow_up_appointment_id: Number(appointmentId) }
                : {}),
            },
          },
        };
        snapshot = { ...editableDraft(), requestKey, pendingRequest: request };
        if (!(await recovery.save(snapshot))) {
          setError(
            recovery.error || "The follow-up could not be saved for recovery.",
          );
          return;
        }
        pendingDraftRef.current = snapshot;
        setPending(true);
      }
      setError("");
      setNotice("");
      await submitPending(snapshot);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const reopen = async () => {
    if (!followUp || busyRef.current || !recovery.ready) return;
    busyRef.current = true;
    setBusy(true);
    const requestKey = crypto.randomUUID();
    const request: FollowUpRequest = {
      kind: "reopen",
      endpoint: `/api/clinic/operations/encounter_follow_ups/${followUp.id}`,
      body: {
        follow_up: {
          action: "reopen",
          request_key: requestKey,
          expected_version: followUp.version,
        },
      },
    };
    const snapshot: FollowUpDraft = {
      status: "needed",
      plan: followUp.plan,
      dueAt: "",
      appointmentId: "",
      requestKey,
      expectedVersion: followUp.version,
      pendingRequest: request,
    };
    try {
      if (!(await recovery.save(snapshot))) {
        setError(
          recovery.error ||
            "The reopen request could not be saved for recovery.",
        );
        return;
      }
      pendingDraftRef.current = snapshot;
      setPending(true);
      setError("");
      await submitPending(snapshot);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const checkPendingStatus = async () => {
    const pendingDraft = pendingDraftRef.current;
    const request = pendingDraft?.pendingRequest;
    if (!request || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const current = await api<FollowUpResponse>(
        `/api/clinic/encounters/${encounter.id}/follow_up`,
      );
      if (
        current.follow_up &&
        (current.follow_up.patient_id !== patient.id ||
          current.follow_up.encounter_id !== encounter.id)
      )
        throw new Error(
          "The refreshed follow-up did not match this encounter.",
        );
      if (followUpMatchesRequest(current.follow_up, request)) {
        if (!(await recovery.clear())) {
          setError(
            "The saved follow-up was confirmed, but its recovery copy could not be cleared. Retry the same request to finish recovery.",
          );
          return;
        }
        baseVersionRef.current = current.follow_up?.version ?? 0;
        pendingDraftRef.current = null;
        setPending(false);
        setNotice("The saved follow-up was confirmed.");
      } else if (
        current.follow_up &&
        current.follow_up.version !== request.body.follow_up.expected_version
      ) {
        await releasePending(current.follow_up.version);
        setNotice(
          "The follow-up changed while this request was unresolved. Your local edits were kept; review them before saving a new request.",
        );
      } else {
        setError(
          "The current record does not contain this save yet. Retry the exact request.",
        );
      }
      resource.refresh();
      onChanged?.();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The current follow-up status could not be checked.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <Paper component="section" variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Box>
          <Typography variant="subtitle2">Encounter follow-up</Typography>
          <Typography variant="body2" color="text.secondary">
            Record the next action for {patient.display_name}. Needed follow-ups
            also appear in Operations.
          </Typography>
        </Box>
        {resource.error && <Alert severity="error">{resource.error}</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
        {notice && <Alert severity="info">{notice}</Alert>}
        {!recovery.ready && recovery.error && (
          <Alert
            severity="error"
            action={<Button onClick={recovery.reload}>Retry recovery</Button>}
          >
            {recovery.error}
          </Alert>
        )}
        {recovery.ready && recovery.status === "conflict" && (
          <Alert
            severity="error"
            action={
              <Button onClick={recovery.reload}>
                Reload recovery version and keep my edits
              </Button>
            }
          >
            {recovery.error}
          </Alert>
        )}
        {recovery.ready && recovery.status === "error" && !pending && (
          <Alert
            severity="error"
            action={
              <Button onClick={() => void recovery.save(editableDraft())}>
                Retry working-copy save
              </Button>
            }
          >
            {recovery.error}
          </Alert>
        )}
        {pending && (
          <Alert
            severity="warning"
            action={
              <Button onClick={() => void checkPendingStatus()} disabled={busy}>
                Check current status
              </Button>
            }
          >
            This exact follow-up request is retained. Check its status or retry
            it without changing the fields.
          </Alert>
        )}
        {followUp?.status === "completed" ? (
          <Stack spacing={1}>
            <Alert severity="success">
              Completed{" "}
              {followUp.completed_at
                ? dateLabel(followUp.completed_at, timezone)
                : ""}
            </Alert>
            <Typography variant="body2">{followUp.outcome}</Typography>
            {canWrite && (
              <Button
                onClick={() => void (pending ? save() : reopen())}
                disabled={busy || !recovery.ready}
                sx={{ alignSelf: "flex-start" }}
              >
                {pending ? "Retry same request" : "Reopen follow-up"}
              </Button>
            )}
          </Stack>
        ) : (
          <>
            <TextField
              select
              label="Follow-up status"
              value={status}
              disabled={!canWrite || busy || pending || !recovery.ready}
              onChange={(event) =>
                setStatus(
                  event.target.value as Exclude<FollowUpStatus, "completed">,
                )
              }
            >
              <MenuItem value="not_required">No follow-up required</MenuItem>
              <MenuItem value="needed">Follow-up needed</MenuItem>
              <MenuItem value="arranged">Appointment arranged</MenuItem>
            </TextField>
            {status !== "not_required" && (
              <TextField
                label="Follow-up plan"
                multiline
                minRows={3}
                value={plan}
                disabled={!canWrite || busy || pending || !recovery.ready}
                onChange={(event) => setPlan(event.target.value)}
                slotProps={{ htmlInput: { maxLength: 4000 } }}
              />
            )}
            {status === "needed" && (
              <TextField
                label="Due by"
                type="datetime-local"
                value={dueAt}
                disabled={!canWrite || busy || pending || !recovery.ready}
                onChange={(event) => setDueAt(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            )}
            {status === "arranged" && (
              <TextField
                select
                label="Arranged appointment"
                value={appointmentId}
                disabled={!canWrite || busy || pending || !recovery.ready}
                onChange={(event) => setAppointmentId(event.target.value)}
              >
                {resource.data.options.follow_up_appointments.map(
                  (appointment) => (
                    <MenuItem
                      key={appointment.id}
                      value={String(appointment.id)}
                    >
                      {dateLabel(appointment.starts_at, timezone)} ·{" "}
                      {appointment.visit_modality.replaceAll("_", " ")}
                    </MenuItem>
                  ),
                )}
              </TextField>
            )}
            {canWrite && (
              <Button
                variant="contained"
                onClick={() => void save()}
                disabled={
                  busy || !recovery.ready || recovery.status === "saving"
                }
                sx={{ alignSelf: "flex-start" }}
              >
                {busy
                  ? "Saving…"
                  : pending
                    ? "Retry same save"
                    : "Save follow-up"}
              </Button>
            )}
          </>
        )}
      </Stack>
    </Paper>
  );
}
