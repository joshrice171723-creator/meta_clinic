import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Checkbox,
  FormControlLabel,
  TextField,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { api, ApiError } from "../../api/client";
import type {
  ClinicalTask,
  EncounterDetail,
  EncounterHandoff,
  EncounterIntakeRevision,
  NurseWorkspace,
  Observation,
  Patient,
  PatientCareSummary,
  FacilityRoom,
} from "../../api/contracts";
import { useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";
import {
  IntakeQuestions,
  type IntakeAnswers,
} from "../patientPortal/IntakeQuestions";

type IntakeForm = Pick<
  EncounterIntakeRevision,
  | "status"
  | "identity_state"
  | "visit_reason_state"
  | "history_state"
  | "vitals_state"
> & {
  questionnaire?: {
    answers: IntakeAnswers;
    text: string;
    status: "draft" | "submitted";
    confirmed: boolean;
  };
};

const emptyIntake: IntakeForm = {
  status: "incomplete",
  identity_state: "not_confirmed",
  visit_reason_state: "not_recorded",
  history_state: "not_recorded",
  vitals_state: "not_recorded",
};

const taskLabels: Record<ClinicalTask["task_kind"], string> = {
  intake: "Finish intake",
  handoff: "Review handoff",
  result_follow_up: "Result follow-up",
  patient_call: "Patient call",
  order_execution: "Order execution",
  record_request: "Record request",
  staff_request: "Staff request",
};

function stateLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function requestKey() {
  return crypto.randomUUID();
}

const INTAKE_CHUNKS = [
  {
    label: "Today’s visit",
    description: "Why the patient is here and what they want help with.",
    fields: ["visit_reason", "symptoms", "goals"],
  },
  {
    label: "Safety and history",
    description: "Medicines, allergies, relevant history, and care needs.",
    fields: ["medications", "allergies", "history", "care_needs"],
  },
  {
    label: "What has been tried",
    description: "Previous approaches, procedures, and barriers to the plan.",
    fields: ["prior_approaches", "procedures", "barriers"],
  },
  {
    label: "Measurements",
    description: "Current measurements, when available.",
    fields: ["height", "weight"],
  },
] as const;

export function NurseEncounterWorkspace({
  patient,
  encounter,
  observations,
  careSummary,
}: {
  patient: Patient;
  encounter: EncounterDetail;
  observations: Observation[];
  careSummary: PatientCareSummary | null;
}) {
  const clinic = useClinic();
  const path = `/api/clinic/patients/${patient.id}/encounters/${encounter.id}/nurse_workspace`;
  const resource = useResource<NurseWorkspace>(path, {
    retainDataOnRefresh: true,
  });
  const roomsResource = useResource<{ rooms: FacilityRoom[] }>(
    "/api/clinic/facilities?type=rooms&per_page=100",
    { retainDataOnRefresh: true },
  );
  const [form, setForm] = useState<IntakeForm>(emptyIntake);
  const [baseline, setBaseline] = useState<IntakeForm>(emptyIntake);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [activeChunk, setActiveChunk] = useState(0);
  const [confirmedChunks, setConfirmedChunks] = useState<number[]>([]);
  const [roomId, setRoomId] = useState<number | null>(encounter.room_id);
  const contextRef = useRef(`${patient.id}:${encounter.id}`);
  contextRef.current = `${patient.id}:${encounter.id}`;
  useEffect(() => {
    setForm(emptyIntake);
    setBaseline(emptyIntake);
    setError("");
    setNotice("");
    setActiveChunk(0);
    setConfirmedChunks([]);
    setRoomId(encounter.room_id);
  }, [patient.id, encounter.id]);
  const [taskKind, setTaskKind] =
    useState<ClinicalTask["task_kind"]>("patient_call");
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const reviewIds = useMemo(
    () =>
      careSummary
        ? Object.values(careSummary.reviews)
            .map((review) => review.id)
            .filter((id): id is number => typeof id === "number")
        : [],
    [careSummary],
  );
  const observationIds = useMemo(
    () =>
      observations
        .filter((item) => item.encounter_id === encounter.id)
        .map((item) => item.id),
    [encounter.id, observations],
  );
  const selectedRooms = useMemo(
    () =>
      (roomsResource.data?.rooms ?? []).filter(
        (room) => String(room.site_id) === String(encounter.site_id),
      ),
    [encounter.site_id, roomsResource.data?.rooms],
  );

  useEffect(() => {
    const intake = resource.data?.intake;
    if (!intake || dirty) return;
    const next: IntakeForm = {
      status: intake.status,
      identity_state: intake.identity_state,
      visit_reason_state: intake.visit_reason_state,
      history_state: intake.history_state,
      vitals_state: intake.vitals_state,
      questionnaire: {
        answers: intake.questionnaire?.answers ?? {},
        text: intake.questionnaire?.text ?? "",
        status: intake.questionnaire?.status ?? "draft",
        confirmed: false,
      },
    };
    setForm(next);
    setBaseline(next);
  }, [dirty, resource.data?.intake]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get("focus") !==
      "nurse-workspace"
    )
      return;
    const timer = window.setTimeout(() => {
      const target = document.getElementById("nurse-workspace");
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      target?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [resource.data]);

  if (!resource.data && !resource.error) {
    return (
      <Paper
        id="nurse-workspace"
        tabIndex={-1}
        variant="outlined"
        sx={{ p: 2 }}
      >
        <Stack
          direction="row"
          spacing={1.5}
          sx={{ alignItems: "center" }}
          role="status"
        >
          <CircularProgress size={20} />
          <Typography>Loading intake and handoff…</Typography>
        </Stack>
      </Paper>
    );
  }
  if (!resource.data) {
    return (
      <Paper
        id="nurse-workspace"
        tabIndex={-1}
        variant="outlined"
        sx={{ p: 2 }}
      >
        <Alert
          severity="error"
          action={<Button onClick={resource.refresh}>Retry</Button>}
        >
          {resource.error || "The nurse workspace could not be loaded."}
        </Alert>
      </Paper>
    );
  }
  if (
    resource.data.patient_id !== patient.id ||
    resource.data.encounter_id !== encounter.id
  ) {
    return (
      <Alert severity="error">
        The loaded workspace does not match this patient and encounter.
      </Alert>
    );
  }

  const workspace = resource.data;
  const intakeVersion = workspace.intake?.version ?? 0;
  const canRespondToHandoff =
    workspace.capabilities.handoff_respond &&
    workspace.handoff?.requested_by_membership_id !== clinic.membership_id;
  const canCancelHandoff =
    workspace.capabilities.handoff_request &&
    Boolean(
      workspace.handoff &&
      ["pending", "accepted", "correction_requested"].includes(
        workspace.handoff.state,
      ),
    );
  const readyEvidence =
    Boolean(roomId) &&
    form.identity_state === "confirmed" &&
    form.visit_reason_state === "confirmed" &&
    form.history_state === "reviewed" &&
    reviewIds.length > 0 &&
    ((form.vitals_state === "recorded" && observationIds.length > 0) ||
      form.vitals_state === "not_applicable");

  async function perform(operation: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
      resource.refresh();
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "outcome_unconfirmed") {
        setError(
          "The server outcome is unconfirmed. Refresh this encounter before deciding whether to repeat the action.",
        );
      } else {
        setError(
          caught instanceof Error
            ? caught.message
            : "The action could not be completed.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveIntake(formToSave = form, advanceChunk = false) {
    const requestContext = `${patient.id}:${encounter.id}`;
    await perform(async () => {
      const response = await api<{ intake: EncounterIntakeRevision }>(
        `/api/clinic/patients/${patient.id}/encounters/${encounter.id}/intake_revisions`,
        {
          method: "POST",
          body: {
            intake: {
              ...formToSave,
              questionnaire:
                JSON.stringify(formToSave.questionnaire) ===
                JSON.stringify(baseline.questionnaire)
                  ? undefined
                  : formToSave.questionnaire,
              expected_version: intakeVersion,
              observation_ids:
                formToSave.vitals_state === "recorded" ? observationIds : [],
              history_review_ids:
                formToSave.history_state === "reviewed" ? reviewIds : [],
              request_key: requestKey(),
            },
          },
        },
      );
      if (
        response.intake.patient_id !== patient.id ||
        response.intake.encounter_id !== encounter.id
      )
        throw new Error(
          "The saved intake response did not match this encounter.",
        );
      if (contextRef.current !== requestContext) return;
      const saved: IntakeForm = {
        status: response.intake.status,
        identity_state: response.intake.identity_state,
        visit_reason_state: response.intake.visit_reason_state,
        history_state: response.intake.history_state,
        vitals_state: response.intake.vitals_state,
        questionnaire: {
          answers: response.intake.questionnaire?.answers ?? {},
          text: response.intake.questionnaire?.text ?? "",
          status: response.intake.questionnaire?.status ?? "draft",
          confirmed: false,
        },
      };
      setForm(saved);
      setBaseline(saved);
      if (advanceChunk) {
        setConfirmedChunks((current) =>
          current.includes(activeChunk) ? current : [...current, activeChunk],
        );
        setActiveChunk((current) =>
          Math.min(current + 1, INTAKE_CHUNKS.length - 1),
        );
        setNotice(
          activeChunk < INTAKE_CHUNKS.length - 1
            ? "Saved and confirmed. The next question group is ready."
            : "Saved and confirmed. All question groups are available for review.",
        );
      } else setNotice("Intake revision saved.");
    });
  }

  async function assignRoom(room: FacilityRoom | null) {
    if (!room) return;
    await perform(async () => {
      const response = await api<{ encounter: EncounterDetail }>(
        `/api/clinic/patients/${patient.id}/encounters/${encounter.id}/room`,
        {
          method: "PATCH",
          body: { room_id: room.id, request_key: requestKey() },
        },
      );
      if (response.encounter.id !== encounter.id) {
        throw new Error("The saved room did not match this encounter.");
      }
      setRoomId(response.encounter.room_id);
      setNotice(`Room ${room.code} recorded for this encounter.`);
    });
  }

  async function requestHandoff() {
    const intake = workspace.intake;
    if (!intake) return;
    await perform(async () => {
      const response = await api<{ handoff: EncounterHandoff }>(
        `/api/clinic/patients/${patient.id}/encounters/${encounter.id}/handoffs`,
        {
          method: "POST",
          body: {
            handoff: {
              intake_revision_id: intake.id,
              request_key: requestKey(),
            },
          },
        },
      );
      if (response.handoff.encounter_id !== encounter.id)
        throw new Error("The handoff response did not match this encounter.");
      setNotice(
        "Handoff requested. It remains pending until a clinician accepts it.",
      );
    });
  }

  async function transitionHandoff(
    action: "accept" | "reject" | "request_correction" | "complete" | "cancel",
  ) {
    if (!workspace.handoff) return;
    await perform(async () => {
      const response = await api<{ handoff: EncounterHandoff }>(
        `/api/clinic/handoffs/${workspace.handoff!.id}`,
        {
          method: "PATCH",
          body: {
            handoff: {
              action,
              expected_version: workspace.handoff!.version,
              request_key: requestKey(),
            },
          },
        },
      );
      if (response.handoff.encounter_id !== encounter.id)
        throw new Error("The handoff response did not match this encounter.");
      setNotice(`Handoff ${stateLabel(response.handoff.state).toLowerCase()}.`);
    });
  }

  async function createTask() {
    await perform(async () => {
      const response = await api<{ task: ClinicalTask }>(
        `/api/clinic/patients/${patient.id}/encounters/${encounter.id}/clinical_tasks`,
        {
          method: "POST",
          body: {
            task: {
              task_kind: taskKind,
              pool_code: "clinical",
              request_key: requestKey(),
            },
          },
        },
      );
      if (response.task.encounter_id !== encounter.id)
        throw new Error("The task response did not match this encounter.");
      setNotice("Clinical task added to this encounter.");
    });
  }

  async function transitionTask(
    task: ClinicalTask,
    action: "claim" | "start" | "complete",
  ) {
    await perform(async () => {
      const response = await api<{ task: ClinicalTask }>(
        `/api/clinic/clinical_tasks/${task.id}`,
        {
          method: "PATCH",
          body: {
            task: {
              action,
              expected_version: task.version,
              request_key: requestKey(),
              ...(action === "complete"
                ? { resolution_code: "completed" }
                : {}),
            },
          },
        },
      );
      if (response.task.encounter_id !== encounter.id)
        throw new Error("The task response did not match this encounter.");
      setNotice(`Task ${stateLabel(response.task.state).toLowerCase()}.`);
    });
  }

  return (
    <Paper
      id="nurse-workspace"
      component="section"
      tabIndex={-1}
      variant="outlined"
      sx={{ p: { xs: 2, md: 2.5 } }}
    >
      <Stack spacing={2.5}>
        <Box>
          <Typography component="h2" variant="h5" sx={{ fontWeight: 700 }}>
            Nurse workspace
          </Typography>
          <Typography color="text.secondary">
            {patient.display_name} · Encounter #{encounter.id}. Intake,
            evidence, ownership, and handoff remain separate recorded facts.
          </Typography>
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{ mt: 1, flexWrap: "wrap" }}
            aria-label="Encounter status summary"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <Chip
              label={`Encounter: ${stateLabel(encounter.status)}`}
              size="small"
              color={encounter.status === "open" ? "primary" : "success"}
            />
            <Chip
              label={`Intake: ${stateLabel(form.status)}`}
              size="small"
              variant="outlined"
            />
            <Chip
              label={`Vitals: ${stateLabel(form.vitals_state)}`}
              size="small"
              variant="outlined"
            />
            <Chip
              label={`Site: ${encounter.site_id ?? "Not recorded"}`}
              size="small"
              variant="outlined"
            />
            <Chip
              label={`Room: ${roomId ?? "Not recorded"}`}
              size="small"
              variant="outlined"
            />
          </Stack>
        </Box>
        {error && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" onClick={resource.refresh}>
                Refresh
              </Button>
            }
          >
            {error}
          </Alert>
        )}
        {notice && <Alert severity="success">{notice}</Alert>}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              lg: "minmax(0, 2fr) minmax(20rem, 1fr)",
            },
            gap: 2,
          }}
        >
          <Stack spacing={2}>
            {encounter.visit_modality !== "video" && (
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  bgcolor: roomId ? "background.paper" : "warning.50",
                }}
              >
                <Stack spacing={1.25}>
                  <Box>
                    <Typography component="h3" variant="h6">
                      Record the room
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Choose the physical room before the patient moves into the
                      encounter. This is required before clinician handoff.
                    </Typography>
                  </Box>
                  <Autocomplete
                    options={selectedRooms}
                    value={
                      selectedRooms.find((room) => room.id === roomId) ?? null
                    }
                    getOptionLabel={(room) => room.code}
                    isOptionEqualToValue={(option, value) =>
                      option.id === value.id
                    }
                    disabled={
                      busy ||
                      !workspace.capabilities.intake_write ||
                      selectedRooms.length === 0
                    }
                    onChange={(_event, room) => void assignRoom(room)}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Exam room"
                        placeholder={
                          selectedRooms.length
                            ? "Choose a room"
                            : "No rooms are configured for this site"
                        }
                        helperText={
                          roomId
                            ? "Room recorded for this encounter."
                            : "Room is still required."
                        }
                      />
                    )}
                  />
                </Stack>
              </Paper>
            )}
            {workspace.questionnaire_form && (
              <Stack spacing={2}>
                <Box>
                  <Typography component="h3" variant="h6">
                    Guided intake · staff assisted
                  </Typography>
                  <Typography color="text.secondary">
                    Work through one question group at a time. Confirming and
                    saving a group opens the next one; unanswered, unknown,
                    declined, and not applicable remain distinct.
                  </Typography>
                </Box>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  useFlexGap
                  sx={{ flexWrap: "wrap" }}
                  aria-label="Intake question groups"
                >
                  {INTAKE_CHUNKS.map((chunk, index) => (
                    <Chip
                      key={chunk.label}
                      label={`${index + 1}. ${chunk.label}`}
                      color={
                        confirmedChunks.includes(index)
                          ? "success"
                          : index === activeChunk
                            ? "primary"
                            : "default"
                      }
                      variant={index === activeChunk ? "filled" : "outlined"}
                      onClick={() =>
                        index <= Math.max(activeChunk, ...confirmedChunks) &&
                        setActiveChunk(index)
                      }
                      aria-label={`${chunk.label}${confirmedChunks.includes(index) ? ", confirmed" : ""}`}
                    />
                  ))}
                </Stack>
                <Alert severity={roomId ? "info" : "warning"}>
                  {roomId
                    ? `Group ${activeChunk + 1} of ${INTAKE_CHUNKS.length}: ${INTAKE_CHUNKS[activeChunk].description}`
                    : "Record the room first. You can still save intake drafts, but clinician handoff stays blocked until a room is recorded."}
                </Alert>
                <Typography color="text.secondary">
                  Recording answers does not reconcile medicines or allergies,
                  confirm patient consent, or complete clinical review.
                </Typography>
                {workspace.intake?.questionnaire_text && (
                  <Typography sx={{ whiteSpace: "pre-wrap" }}>
                    {workspace.intake.questionnaire_text}
                  </Typography>
                )}
                <IntakeQuestions
                  fields={workspace.questionnaire_form.fields.filter((field) =>
                    INTAKE_CHUNKS[activeChunk].fields.some(
                      (id) => id === field.id,
                    ),
                  )}
                  medicationOptions={
                    workspace.questionnaire_form.medication_options
                  }
                  answers={form.questionnaire?.answers ?? {}}
                  disabled={busy || !workspace.capabilities.intake_write}
                  onChange={(answers) =>
                    setForm((current) => ({
                      ...current,
                      questionnaire: {
                        ...current.questionnaire,
                        text: current.questionnaire?.text ?? "",
                        answers,
                        status: "draft",
                        confirmed: false,
                      },
                    }))
                  }
                />
                {activeChunk === INTAKE_CHUNKS.length - 1 && (
                  <TextField
                    label="Additional patient-reported context"
                    multiline
                    value={form.questionnaire?.text ?? ""}
                    disabled={busy || !workspace.capabilities.intake_write}
                    slotProps={{ htmlInput: { maxLength: 5000 } }}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        questionnaire: {
                          answers: current.questionnaire?.answers ?? {},
                          text: event.target.value,
                          status: "draft",
                          confirmed: false,
                        },
                      }))
                    }
                  />
                )}
                <FormControlLabel
                  label="I confirm I recorded this group from the patient. This is not a patient attestation or clinical review."
                  control={
                    <Checkbox
                      checked={form.questionnaire?.confirmed ?? false}
                      disabled={busy || !workspace.capabilities.intake_write}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          questionnaire: {
                            answers: current.questionnaire?.answers ?? {},
                            text: current.questionnaire?.text ?? "",
                            status: event.target.checked
                              ? "submitted"
                              : "draft",
                            confirmed: event.target.checked,
                          },
                        }))
                      }
                    />
                  }
                />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  <Button
                    variant="contained"
                    disabled={
                      busy ||
                      !dirty ||
                      !form.questionnaire?.confirmed ||
                      !workspace.capabilities.intake_write
                    }
                    onClick={() => void saveIntake(form, true)}
                  >
                    Confirm and save group
                  </Button>
                  <Button
                    variant="outlined"
                    disabled={
                      busy || !dirty || !workspace.capabilities.intake_write
                    }
                    onClick={() => void saveIntake()}
                  >
                    Save draft
                  </Button>
                </Stack>
              </Stack>
            )}
            <Box>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                sx={{ justifyContent: "space-between" }}
              >
                <Typography component="h3" variant="h6">
                  Intake revision
                </Typography>
                <Chip
                  variant="outlined"
                  label={`Version ${intakeVersion} · ${stateLabel(workspace.intake?.status || "not recorded")}`}
                />
              </Stack>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.5 }}
              >
                Clinical values stay in observations and history records; this
                revision records which evidence was used and whether each step
                is complete.
              </Typography>
            </Box>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                gap: 1.5,
              }}
            >
              <StateSelect
                label="Patient identity"
                value={form.identity_state}
                disabled={busy || !workspace.capabilities.intake_write}
                options={["confirmed", "not_confirmed", "unable_to_confirm"]}
                onChange={(value) =>
                  setForm({
                    ...form,
                    identity_state: value as IntakeForm["identity_state"],
                  })
                }
              />
              <StateSelect
                label="Visit reason"
                value={form.visit_reason_state}
                disabled={busy || !workspace.capabilities.intake_write}
                options={[
                  "confirmed",
                  "needs_correction",
                  "not_recorded",
                  "unable_to_obtain",
                ]}
                onChange={(value) =>
                  setForm({
                    ...form,
                    visit_reason_state:
                      value as IntakeForm["visit_reason_state"],
                  })
                }
              />
              <StateSelect
                label="History review"
                value={form.history_state}
                disabled={busy || !workspace.capabilities.intake_write}
                options={[
                  "reviewed",
                  "incomplete",
                  "not_recorded",
                  "unable_to_obtain",
                ]}
                onChange={(value) =>
                  setForm({
                    ...form,
                    history_state: value as IntakeForm["history_state"],
                  })
                }
              />
              <StateSelect
                label="Vitals"
                value={form.vitals_state}
                disabled={busy || !workspace.capabilities.intake_write}
                options={[
                  "recorded",
                  "incomplete",
                  "not_recorded",
                  "declined",
                  "unable_to_obtain",
                  "not_applicable",
                ]}
                onChange={(value) =>
                  setForm({
                    ...form,
                    vitals_state: value as IntakeForm["vitals_state"],
                  })
                }
              />
            </Box>
            <Alert severity={readyEvidence ? "info" : "warning"}>
              {readyEvidence
                ? "Recorded evidence supports requesting handoff. A clinician must still accept responsibility."
                : `Handoff is not ready. ${observationIds.length} encounter observation(s) and ${reviewIds.length} history review(s) are currently linked.`}
            </Alert>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <Button
                variant="contained"
                disabled={
                  busy || !dirty || !workspace.capabilities.intake_write
                }
                onClick={() => void saveIntake()}
              >
                Save intake revision
              </Button>
              <Button
                variant="outlined"
                disabled={
                  busy ||
                  dirty ||
                  !readyEvidence ||
                  workspace.intake?.status !== "ready_for_handoff" ||
                  !workspace.capabilities.handoff_request ||
                  Boolean(
                    workspace.handoff &&
                    ["pending", "accepted", "correction_requested"].includes(
                      workspace.handoff.state,
                    ),
                  )
                }
                onClick={() => void requestHandoff()}
              >
                Request clinician handoff
              </Button>
              <Button
                variant="text"
                disabled={busy || !dirty}
                onClick={() => setForm(baseline)}
              >
                Discard unsaved changes
              </Button>
            </Stack>
            {readyEvidence && form.status !== "ready_for_handoff" && (
              <Button
                sx={{ alignSelf: "flex-start" }}
                disabled={busy || !workspace.capabilities.intake_write}
                onClick={() =>
                  setForm({ ...form, status: "ready_for_handoff" })
                }
              >
                Mark intake ready for handoff
              </Button>
            )}
          </Stack>
          <Stack spacing={2}>
            <Box>
              <Typography component="h3" variant="h6">
                Handoff
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Opening the chart does not accept a handoff.
              </Typography>
            </Box>
            {workspace.handoff ? (
              <Stack spacing={1.25}>
                <Chip
                  sx={{ alignSelf: "flex-start" }}
                  label={stateLabel(workspace.handoff.state)}
                  variant="outlined"
                />
                <Typography variant="body2">
                  Bound to intake revision{" "}
                  {workspace.handoff.intake_revision_id}
                </Typography>
                {workspace.handoff.requested_by_membership_id ===
                  clinic.membership_id &&
                  ["pending", "accepted"].includes(workspace.handoff.state) && (
                    <Alert severity="info">
                      A different authorized clinician must respond to this
                      handoff.
                    </Alert>
                  )}
                {workspace.handoff.state === "pending" &&
                  canRespondToHandoff && (
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ flexWrap: "wrap" }}
                      useFlexGap
                    >
                      <Button
                        disabled={busy}
                        variant="contained"
                        onClick={() => void transitionHandoff("accept")}
                      >
                        Accept
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void transitionHandoff("request_correction")
                        }
                      >
                        Request correction
                      </Button>
                      <Button
                        disabled={busy}
                        color="error"
                        onClick={() => void transitionHandoff("reject")}
                      >
                        Reject
                      </Button>
                    </Stack>
                  )}
                {workspace.handoff.state === "accepted" &&
                  canRespondToHandoff && (
                    <Button
                      disabled={busy}
                      variant="outlined"
                      onClick={() => void transitionHandoff("complete")}
                    >
                      Complete handoff
                    </Button>
                  )}
                {workspace.handoff.state === "correction_requested" && (
                  <Alert severity="warning">
                    Revise and save the intake, then cancel this handoff before
                    requesting a new clinician review.
                  </Alert>
                )}
                {canCancelHandoff && (
                  <Button
                    disabled={busy}
                    color="error"
                    variant="text"
                    sx={{ alignSelf: "flex-start" }}
                    onClick={() => void transitionHandoff("cancel")}
                  >
                    Cancel handoff
                  </Button>
                )}
              </Stack>
            ) : (
              <Typography color="text.secondary">
                No handoff has been requested.
              </Typography>
            )}
          </Stack>
        </Box>
        <Divider />
        <Box>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{
              justifyContent: "space-between",
              alignItems: { sm: "center" },
            }}
          >
            <Box>
              <Typography component="h3" variant="h6">
                Encounter tasks
              </Typography>
              <Typography variant="body2" color="text.secondary">
                The task owns responsibility; its linked record owns the
                clinical fact.
              </Typography>
            </Box>
            {workspace.capabilities.tasks_write && (
              <Stack direction="row" spacing={1}>
                <FormControl size="small" sx={{ minWidth: 170 }}>
                  <InputLabel id="new-clinical-task-label">Task</InputLabel>
                  <Select
                    labelId="new-clinical-task-label"
                    label="Task"
                    value={taskKind}
                    onChange={(event) =>
                      setTaskKind(
                        event.target.value as ClinicalTask["task_kind"],
                      )
                    }
                  >
                    {(
                      [
                        "patient_call",
                        "record_request",
                        "result_follow_up",
                        "order_execution",
                      ] as const
                    ).map((kind) => (
                      <MenuItem key={kind} value={kind}>
                        {taskLabels[kind]}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  variant="outlined"
                  disabled={busy}
                  onClick={() => void createTask()}
                >
                  Add task
                </Button>
              </Stack>
            )}
          </Stack>
          <Stack spacing={1} sx={{ mt: 1.5 }}>
            {workspace.tasks.length === 0 ? (
              <Typography color="text.secondary">
                No tasks are recorded for this encounter.
              </Typography>
            ) : (
              workspace.tasks.map((task) => {
                const mine =
                  task.assigned_to_membership_id === clinic.membership_id;
                return (
                  <Paper key={task.id} variant="outlined" sx={{ p: 1.5 }}>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1}
                      sx={{
                        justifyContent: "space-between",
                        alignItems: { sm: "center" },
                      }}
                    >
                      <Box>
                        <Typography sx={{ fontWeight: 650 }}>
                          {task.source_kind
                            ? stateLabel(task.source_kind)
                            : taskLabels[task.task_kind]}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {stateLabel(task.state)} ·{" "}
                          {stateLabel(task.pool_code)} pool
                        </Typography>
                        {(task as ClinicalTask & { waiting_reason?: string })
                          .waiting_reason && (
                          <Typography variant="body2">
                            Waiting:{" "}
                            {
                              (
                                task as ClinicalTask & {
                                  waiting_reason?: string;
                                }
                              ).waiting_reason
                            }
                          </Typography>
                        )}
                        {(
                          task as ClinicalTask & {
                            assignment_exception?: string;
                          }
                        ).assignment_exception && (
                          <Typography variant="body2">
                            Assignment:{" "}
                            {
                              (
                                task as ClinicalTask & {
                                  assignment_exception?: string;
                                }
                              ).assignment_exception
                            }
                          </Typography>
                        )}
                        {(
                          task as ClinicalTask & {
                            pending_assignee_membership_id?: number;
                          }
                        ).pending_assignee_membership_id && (
                          <Typography variant="body2">
                            Transfer awaits acceptance. Current coverage remains
                            responsible.
                          </Typography>
                        )}
                        <Button size="small" href="/clinic/work">
                          Open Patient Flow
                        </Button>
                      </Box>
                      {workspace.capabilities.tasks_write &&
                        ["open", "on_hold"].includes(task.state) && (
                          <Button
                            disabled={busy}
                            onClick={() => void transitionTask(task, "claim")}
                          >
                            Claim
                          </Button>
                        )}
                      {workspace.capabilities.tasks_write &&
                        task.state === "claimed" &&
                        mine && (
                          <Button
                            disabled={
                              busy ||
                              Boolean(
                                (
                                  task as ClinicalTask & {
                                    waiting_reason?: string;
                                  }
                                ).waiting_reason,
                              )
                            }
                            onClick={() => void transitionTask(task, "start")}
                          >
                            Start
                          </Button>
                        )}
                      {workspace.capabilities.tasks_write &&
                        task.state === "in_progress" &&
                        mine && (
                          <Button
                            disabled={
                              busy ||
                              Boolean(
                                (
                                  task as ClinicalTask & {
                                    source_managed?: boolean;
                                  }
                                ).source_managed,
                              )
                            }
                            variant="contained"
                            onClick={() =>
                              void transitionTask(task, "complete")
                            }
                          >
                            Complete
                          </Button>
                        )}
                    </Stack>
                  </Paper>
                );
              })
            )}
          </Stack>
        </Box>
      </Stack>
    </Paper>
  );
}

function StateSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const labelId = `${label.toLowerCase().replaceAll(" ", "-")}-state-label`;
  return (
    <FormControl fullWidth disabled={disabled}>
      <InputLabel id={labelId}>{label}</InputLabel>
      <Select
        labelId={labelId}
        label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <MenuItem key={option} value={option}>
            {stateLabel(option)}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
