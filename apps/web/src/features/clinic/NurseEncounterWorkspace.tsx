import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Accordion,
  AccordionDetails,
  AccordionSummary,
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
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
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
  intakeFieldVisible,
  type IntakeAnswers,
} from "../patientPortal/IntakeQuestions";
import { StaffIntakeSections } from "./StaffIntakeSections";
import { VitalSignsEntry } from "./VitalSignsEntry";
import { IntakeEvidencePicker } from "./IntakeEvidencePicker";
import { IntakeConsentEvidence } from "./IntakeConsentEvidence";
import { PatientCareCoordination } from "./PatientCareCoordination";

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
    confirmed_chunks: number[];
    evidence_keys?: string[];
  };
};

export type NurseWorkspaceResource = {
  data?: NurseWorkspace;
  error?: string;
  refresh: () => void;
};

export type FacilityRoomsResource = {
  data?: { rooms: FacilityRoom[] };
  error?: string;
  refresh: () => void;
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

const MEASUREMENT_CODES = new Set([
  "vital-height",
  "vital-weight",
  "vital-bmi",
  "vital-systolic-bp",
  "vital-diastolic-bp",
  "vital-heart-rate",
  "vital-respiratory-rate",
  "vital-oxygen-saturation",
  "vital-temperature",
  "vital-pain-score",
]);

export function allIntakeChunksConfirmed(
  chunks: Array<{ index: number }>,
  confirmedChunkIndexes: number[],
) {
  return (
    chunks.length === 0 ||
    chunks.every((chunk) => confirmedChunkIndexes.includes(chunk.index))
  );
}

export function NurseEncounterWorkspace({
  patient,
  encounter,
  observations,
  careSummary,
  onObservationsRecorded,
}: {
  patient: Patient;
  encounter: EncounterDetail;
  observations: Observation[];
  careSummary: PatientCareSummary | null;
  onObservationsRecorded?: (observations: Observation[]) => void;
}) {
  const path = `/api/clinic/patients/${patient.id}/encounters/${encounter.id}/nurse_workspace`;
  const resource = useResource<NurseWorkspace>(path, {
    retainDataOnRefresh: true,
  });
  const roomsResource = useResource<{ rooms: FacilityRoom[] }>(
    "/api/clinic/facilities?type=rooms&per_page=100",
    { retainDataOnRefresh: true },
  );
  return (
    <NurseEncounterWorkspaceContent
      patient={patient}
      encounter={encounter}
      observations={observations}
      careSummary={careSummary}
      onObservationsRecorded={onObservationsRecorded}
      resource={resource}
      roomsResource={roomsResource}
    />
  );
}

export function NurseEncounterWorkspaceContent({
  patient,
  encounter,
  observations,
  careSummary,
  onObservationsRecorded,
  resource,
  roomsResource,
}: {
  patient: Patient;
  encounter: EncounterDetail;
  observations: Observation[];
  careSummary: PatientCareSummary | null;
  onObservationsRecorded?: (observations: Observation[]) => void;
  resource: NurseWorkspaceResource;
  roomsResource: FacilityRoomsResource;
}) {
  const clinic = useClinic();
  const chunkDefinitions = resource.data?.questionnaire_form?.chunks ?? [];
  const [form, setForm] = useState<IntakeForm>(emptyIntake);
  const [baseline, setBaseline] = useState<IntakeForm>(emptyIntake);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [activeChunk, setActiveChunk] = useState(0);
  const hydratedVersion = useRef<number | null>(null);
  const saveAttempt = useRef<{ signature: string; key: string } | null>(null);
  const groupHeading = useRef<HTMLHeadingElement | null>(null);
  const [roomId, setRoomId] = useState<number | null>(encounter.room_id);
  const [encounterObservations, setEncounterObservations] =
    useState<Observation[]>(observations);
  const contextRef = useRef(`${patient.id}:${encounter.id}`);
  contextRef.current = `${patient.id}:${encounter.id}`;
  useEffect(() => {
    setForm(emptyIntake);
    setBaseline(emptyIntake);
    setError("");
    setNotice("");
    setActiveChunk(0);
    hydratedVersion.current = null;
    saveAttempt.current = null;
    setRoomId(encounter.room_id);
    setEncounterObservations(observations);
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
      encounterObservations
        .filter((item) => item.encounter_id === encounter.id)
        .map((item) => item.id),
    [encounter.id, encounterObservations],
  );
  const recordedMeasurements = useMemo(
    () =>
      encounterObservations
        .filter(
          (item) =>
            item.encounter_id === encounter.id &&
            MEASUREMENT_CODES.has(item.code),
        )
        .sort((left, right) =>
          `${left.observed_at}:${left.id}`.localeCompare(
            `${right.observed_at}:${right.id}`,
          ),
        ),
    [encounter.id, encounterObservations],
  );
  const selectedRooms = useMemo(
    () =>
      (roomsResource.data?.rooms ?? []).filter(
        (room) => String(room.site_id) === String(encounter.site_id),
      ),
    [encounter.site_id, roomsResource.data?.rooms],
  );
  const currentRoom = selectedRooms.find((room) => room.id === roomId);
  const roomStatusLabel =
    roomId == null
      ? "Not recorded"
      : (currentRoom?.code ??
        (roomsResource.data ? "Unavailable" : "Loading room…"));

  useEffect(() => {
    const intake = resource.data?.intake;
    if (
      !intake ||
      (hydratedVersion.current !== null &&
        hydratedVersion.current >= intake.version) ||
      (dirty && form.questionnaire)
    )
      return;
    hydratedVersion.current = intake.version;
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
        confirmed_chunks:
          intake.questionnaire?.questionnaire_version ===
          resource.data?.questionnaire_form?.version
            ? (intake.questionnaire?.confirmed_chunks ?? [])
            : [],
        evidence_keys:
          intake.questionnaire?.evidence_references?.map((item) => item.key) ??
          [],
      },
    };
    setForm(next);
    setBaseline(next);
    const savedChunks = next.questionnaire?.confirmed_chunks ?? [];
    const nextChunk = chunkDefinitions.findIndex(
      (_chunk, index) => !savedChunks.includes(index),
    );
    setActiveChunk(
      nextChunk === -1 ? Math.max(chunkDefinitions.length - 1, 0) : nextChunk,
    );
  }, [chunkDefinitions, dirty, resource.data?.intake]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    groupHeading.current?.focus();
  }, [activeChunk]);

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
  const reviewItems = workspace.review_items ?? [];
  const reviewGroups = [
    {
      id: "clinical",
      label: "Clinical review",
      description: "Clarify the recorded response and record the outcome.",
      items: reviewItems.filter((item) => item.pool_code === "clinical"),
    },
    {
      id: "front_desk",
      label: "Support coordination",
      description: "Coordinate the reported support preference or barrier.",
      items: reviewItems.filter((item) => item.pool_code === "front_desk"),
    },
    {
      id: "other",
      label: "Unassigned review",
      description: "Assign or resolve the review task before it is lost.",
      items: reviewItems.filter(
        (item) => !["clinical", "front_desk"].includes(item.pool_code ?? ""),
      ),
    },
  ].filter((group) => group.items.length > 0);
  const encounterTasks = workspace.tasks.filter(
    (task) => task.task_kind !== "intake",
  );
  const intakeChunks = workspace.questionnaire_form?.chunks ?? [];
  const confirmedChunkIndexes = form.questionnaire?.confirmed_chunks ?? [];
  const activeChunkIndex = Math.min(
    activeChunk,
    Math.max(intakeChunks.length - 1, 0),
  );
  const roomRequired = encounter.visit_modality !== "video";
  const intakeVersion = Math.max(
    workspace.intake?.version ?? 0,
    hydratedVersion.current ?? 0,
  );
  const intakeQuestionGroupsSaved = allIntakeChunksConfirmed(
    intakeChunks,
    confirmedChunkIndexes,
  );
  const intakeRevisionSaved =
    workspace.intake?.status === "ready_for_handoff" && !dirty;
  const handoffStageAvailable =
    intakeRevisionSaved || Boolean(workspace.handoff);
  const staleHandoff = Boolean(
    workspace.handoff &&
    workspace.intake &&
    workspace.handoff.intake_revision_id !== workspace.intake.id,
  );
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
  const vitalSignsReady =
    (form.vitals_state === "recorded" && observationIds.length > 0) ||
    form.vitals_state === "not_applicable";
  const readyEvidence =
    (!roomRequired || Boolean(roomId)) &&
    form.identity_state === "confirmed" &&
    form.visit_reason_state === "confirmed" &&
    form.history_state === "reviewed" &&
    reviewIds.length > 0 &&
    vitalSignsReady;
  const handoffAttention = [
    roomRequired && !roomId ? "Record the room" : null,
    form.identity_state !== "confirmed" ? "Confirm patient identity" : null,
    form.visit_reason_state !== "confirmed" ? "Confirm the visit reason" : null,
    form.history_state !== "reviewed" || reviewIds.length === 0
      ? "Review history evidence"
      : null,
    !vitalSignsReady ? "Record vital signs or mark them not applicable" : null,
  ].filter((item): item is string => Boolean(item));

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
      const confirmedChunksToSave = formToSave.questionnaire
        ? Array.from(
            new Set([
              ...(formToSave.questionnaire.confirmed_chunks ?? []),
              ...(advanceChunk ? [activeChunkIndex] : []),
            ]),
          ).sort((left, right) => left - right)
        : [];
      const questionnaire = formToSave.questionnaire
        ? {
            ...formToSave.questionnaire,
            confirmed_chunks: confirmedChunksToSave,
          }
        : undefined;
      const intakeRequest = {
        ...formToSave,
        questionnaire:
          JSON.stringify(questionnaire) ===
          JSON.stringify(baseline.questionnaire)
            ? undefined
            : questionnaire,
        expected_version: intakeVersion,
        observation_ids:
          formToSave.vitals_state === "recorded" ? observationIds : [],
        history_review_ids:
          formToSave.history_state === "reviewed" ? reviewIds : [],
      };
      const signature = JSON.stringify(intakeRequest);
      if (saveAttempt.current?.signature !== signature) {
        saveAttempt.current = { signature, key: requestKey() };
      }
      const response = await api<{ intake: EncounterIntakeRevision }>(
        `/api/clinic/patients/${patient.id}/encounters/${encounter.id}/intake_revisions`,
        {
          method: "POST",
          body: {
            intake: {
              ...intakeRequest,
              request_key: saveAttempt.current.key,
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
          confirmed_chunks:
            response.intake.questionnaire?.confirmed_chunks ?? [],
          evidence_keys:
            response.intake.questionnaire?.evidence_references?.map(
              (item) => item.key,
            ) ?? [],
        },
      };
      setForm(saved);
      setBaseline(saved);
      saveAttempt.current = null;
      hydratedVersion.current = response.intake.version;
      if (advanceChunk) {
        setActiveChunk((current) =>
          Math.min(activeChunkIndex + 1, intakeChunks.length - 1),
        );
        setNotice(
          activeChunkIndex < intakeChunks.length - 1
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
          body: { room: { room_id: room.id, request_key: requestKey() } },
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
              icon={
                form.status === "ready_for_handoff" ? undefined : (
                  <WarningAmberOutlinedIcon />
                )
              }
              color={
                form.status === "ready_for_handoff" ? "default" : "warning"
              }
              variant="outlined"
            />
            <Chip
              label={`Vitals: ${stateLabel(form.vitals_state)}`}
              size="small"
              icon={vitalSignsReady ? undefined : <WarningAmberOutlinedIcon />}
              color={vitalSignsReady ? "default" : "warning"}
              variant="outlined"
            />
            <Chip
              label={`Site: ${encounter.site_id ?? "Not recorded"}`}
              size="small"
              variant="outlined"
            />
            <Chip
              label={`Room: ${roomStatusLabel}`}
              size="small"
              variant="outlined"
            />
          </Stack>
        </Box>
        {!readyEvidence && (
          <Alert severity="warning" icon={<WarningAmberOutlinedIcon />}>
            <Typography variant="subtitle2" component="div">
              Needs attention before clinician handoff
            </Typography>
            <Typography variant="body2">
              {handoffAttention.join(" · ")}. These are operational intake
              requirements, not a clinical priority or treatment decision.
            </Typography>
          </Alert>
        )}
        {error && (
          <Alert
            severity="error"
            action={
              <Stack direction="row">
                <Button color="inherit" onClick={resource.refresh}>
                  Refresh
                </Button>
                {dirty && (
                  <Button
                    color="inherit"
                    onClick={() => {
                      hydratedVersion.current = null;
                      saveAttempt.current = null;
                      setForm(emptyIntake);
                      setBaseline(emptyIntake);
                      setError("");
                      resource.refresh();
                    }}
                  >
                    Discard local edits and load saved intake
                  </Button>
                )}
              </Stack>
            }
          >
            {error}
          </Alert>
        )}
        {notice && <Alert severity="success">{notice}</Alert>}
        <Paper
          id="nurse-vitals"
          variant="outlined"
          sx={{
            p: 2,
            bgcolor: vitalSignsReady ? "background.paper" : "warning.50",
          }}
        >
          <Stack spacing={1.25}>
            <Box>
              <Typography component="h3" variant="h6">
                Record vital signs
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Record measurements before clinician handoff when they apply to
                this visit. The intake revision keeps the recorded value,
                unavailable state, and not-applicable state distinct.
              </Typography>
            </Box>
            {workspace.capabilities.observations_write ? (
              <VitalSignsEntry
                patientId={patient.id}
                patientName={patient.display_name}
                encounterId={encounter.id}
                onRecorded={(newObservations) => {
                  setEncounterObservations((current) => {
                    const byId = new Map(
                      current.map((item) => [item.id, item]),
                    );
                    newObservations.forEach((item) => byId.set(item.id, item));
                    return Array.from(byId.values());
                  });
                  onObservationsRecorded?.(newObservations);
                  setForm((current) => ({
                    ...current,
                    vitals_state: "recorded",
                  }));
                  setNotice(
                    "Vital signs recorded. Save the intake revision to link them to this handoff.",
                  );
                }}
              />
            ) : (
              <Alert severity="info">
                You can review vital signs here, but your role cannot record new
                clinical observations.
              </Alert>
            )}
            {recordedMeasurements.length > 0 && (
              <Stack spacing={0.5}>
                <Typography variant="subtitle2">
                  Recorded for this encounter
                </Typography>
                {recordedMeasurements.map((measurement) => (
                  <Typography key={measurement.id} variant="body2">
                    {measurement.display_label || measurement.code}:{" "}
                    {measurement.numeric_value}{" "}
                    {measurement.unit_label || measurement.unit_code || ""}
                  </Typography>
                ))}
              </Stack>
            )}
          </Stack>
        </Paper>
        {reviewGroups.length > 0 && (
          <Paper variant="outlined" sx={{ overflow: "hidden" }}>
            <Stack spacing={0.5} sx={{ px: 2, pt: 2, pb: 1.25 }}>
              <Typography component="h3" variant="h6">
                Intake review queue
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {reviewItems.length} review items ·{" "}
                {
                  reviewItems.filter(
                    (item) => !["completed", "cancelled"].includes(item.state),
                  ).length
                }{" "}
                unresolved. Open the team queue that can take the next action.
              </Typography>
            </Stack>
            {reviewGroups.map((group) => {
              const versions = [
                ...new Set(
                  group.items.map((item) => item.source_revision_version),
                ),
              ];
              const displayedReasons = new Set<string>();
              return (
                <Accordion
                  key={group.id}
                  disableGutters
                  elevation={0}
                  sx={{
                    borderTop: 1,
                    borderColor: "divider",
                    "&:before": { display: "none" },
                  }}
                >
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={{ xs: 0.5, sm: 1 }}
                      sx={{
                        alignItems: { sm: "center" },
                        justifyContent: "space-between",
                        width: "100%",
                        pr: 1,
                      }}
                    >
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        {group.label}
                      </Typography>
                      <Stack direction="row" spacing={0.75}>
                        <Chip
                          size="small"
                          label={`${group.items.length} items`}
                        />
                        <Chip
                          size="small"
                          variant="outlined"
                          label={
                            versions.length === 1
                              ? `Intake v${versions[0]}`
                              : "Multiple intake versions"
                          }
                        />
                      </Stack>
                    </Stack>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 0, pb: 1 }}>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mb: 1 }}
                    >
                      {group.description}
                    </Typography>
                    <List disablePadding aria-label={`${group.label} tasks`}>
                      {group.items.map((item, index) => {
                        const task = workspace.tasks.find(
                          (entry) => entry.id === item.task_id,
                        );
                        const showReason = !displayedReasons.has(item.reason);
                        displayedReasons.add(item.reason);
                        const mine =
                          task?.assigned_to_membership_id ===
                          clinic.membership_id;
                        const action =
                          task &&
                          workspace.capabilities.tasks_write &&
                          task.state === "open" ? (
                            <Button
                              variant="outlined"
                              size="small"
                              disabled={busy}
                              onClick={() => void transitionTask(task, "claim")}
                            >
                              Claim
                            </Button>
                          ) : task &&
                            workspace.capabilities.tasks_write &&
                            mine &&
                            (item.pool_code !== "clinical" ||
                              workspace.capabilities.handoff_respond) &&
                            ["claimed", "in_progress"].includes(task.state) ? (
                            <Button
                              variant="contained"
                              size="small"
                              disabled={busy || dirty}
                              onClick={() =>
                                void transitionTask(task, "complete")
                              }
                            >
                              Complete
                            </Button>
                          ) : undefined;
                        return (
                          <ListItem
                            key={item.task_id}
                            disableGutters
                            divider={index < group.items.length - 1}
                            secondaryAction={action}
                            sx={{ py: 1.25, pr: action ? 11 : 0 }}
                          >
                            <ListItemText
                              primary={
                                <Stack
                                  direction={{ xs: "column", sm: "row" }}
                                  spacing={{ xs: 0.5, sm: 1 }}
                                  sx={{ alignItems: { sm: "center" } }}
                                >
                                  <Typography variant="subtitle2">
                                    {item.label}
                                  </Typography>
                                  <Chip
                                    size="small"
                                    variant="outlined"
                                    label={stateLabel(item.state)}
                                    sx={{
                                      alignSelf: {
                                        xs: "flex-start",
                                        sm: "auto",
                                      },
                                    }}
                                  />
                                </Stack>
                              }
                              secondary={
                                <Stack spacing={0.25} sx={{ mt: 0.25 }}>
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                  >
                                    {item.assigned_to_membership_id
                                      ? `Assigned to staff ${item.assigned_to_membership_id}`
                                      : "Team-owned"}
                                  </Typography>
                                  {showReason && (
                                    <Typography
                                      variant="body2"
                                      color="text.secondary"
                                    >
                                      {item.reason}
                                    </Typography>
                                  )}
                                </Stack>
                              }
                            />
                            {task?.assignment_exception && (
                              <Alert severity="warning" sx={{ mt: 1 }}>
                                {task.assignment_exception}
                              </Alert>
                            )}
                          </ListItem>
                        );
                      })}
                    </List>
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </Paper>
        )}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              lg: handoffStageAvailable
                ? "minmax(0, 2fr) minmax(20rem, 1fr)"
                : "minmax(0, 1fr)",
            },
            gap: 2,
          }}
        >
          <Stack spacing={2}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "minmax(0, 1fr)",
                  md:
                    encounter.visit_modality === "video"
                      ? "minmax(0, 1fr)"
                      : "minmax(0, 1.3fr) minmax(0, 1fr)",
                },
                gap: 2,
              }}
            >
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack spacing={1.25}>
                  <Box>
                    <Typography component="h3" variant="h6">
                      Patient profile
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      From the patient record. Open the profile to correct
                      details.
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                      gap: 1.25,
                    }}
                  >
                    <Typography variant="body2">
                      <strong>Preferred name:</strong>{" "}
                      {patient.demographics?.preferred_name ||
                        patient.demographics?.legal_name ||
                        patient.display_name}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Date of birth:</strong>{" "}
                      {patient.demographics?.date_of_birth ||
                        patient.date_of_birth ||
                        "Not recorded"}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Primary language:</strong>{" "}
                      {patient.demographics?.primary_language ||
                        careSummary?.communication.primary_language ||
                        "Not recorded"}
                      {patient.demographics?.interpreter_required === true &&
                        " · Interpreter requested"}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Phone:</strong>{" "}
                      {patient.contacts?.find(
                        (contact) =>
                          contact.contact_type === "phone" &&
                          !contact.effective_until,
                      )?.contact_value ||
                        patient.phone_hint ||
                        "Not recorded"}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Email:</strong>{" "}
                      {patient.contacts?.find(
                        (contact) =>
                          contact.contact_type === "email" &&
                          !contact.effective_until,
                      )?.contact_value || "Not recorded"}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Address:</strong>{" "}
                      {patient.primary_address?.formatted || "Not recorded"}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Emergency contact:</strong>{" "}
                      {patient.emergency_contacts?.find(
                        (contact) => !contact.effective_until,
                      )?.name || "Not recorded"}
                      {" · "}
                      {patient.emergency_contacts?.find(
                        (contact) => !contact.effective_until,
                      )?.relationship || "Relationship not recorded"}
                      {" · "}
                      {patient.emergency_contacts?.find(
                        (contact) => !contact.effective_until,
                      )?.phone || "Phone not recorded"}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Preferred contact:</strong>{" "}
                      {patient.communication_preference
                        ?.preferred_contact_method || "Not recorded"}
                    </Typography>
                  </Box>
                  <Button
                    href={`/clinic/patients/${patient.id}`}
                    sx={{ alignSelf: "start" }}
                  >
                    Open patient profile
                  </Button>
                </Stack>
              </Paper>
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
                        Choose a room for this visit. Required before clinician
                        handoff.
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
            </Box>
            {workspace.questionnaire_form && (
              <Stack spacing={2.5} sx={{ pt: 2 }}>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={2}
                  sx={{
                    justifyContent: "space-between",
                    alignItems: { sm: "center" },
                  }}
                >
                  <Box>
                    <Typography variant="overline" color="text.secondary">
                      Guided intake · staff assisted
                    </Typography>
                    <Typography
                      component="h3"
                      variant="h5"
                      ref={groupHeading}
                      tabIndex={-1}
                    >
                      {intakeChunks[activeChunkIndex].label}
                    </Typography>
                    <Typography color="text.secondary">
                      {intakeChunks[activeChunkIndex].description}
                    </Typography>
                  </Box>
                  <TextField
                    select
                    label="Intake section"
                    size="small"
                    value={activeChunkIndex}
                    disabled={busy}
                    onChange={(event) =>
                      setActiveChunk(Number(event.target.value))
                    }
                    helperText={`${confirmedChunkIndexes.length} of ${intakeChunks.length} sections saved`}
                    sx={{ minWidth: { sm: 260 }, maxWidth: { sm: 340 } }}
                  >
                    {intakeChunks.map((chunk, index) => (
                      <MenuItem
                        key={chunk.id}
                        value={index}
                        disabled={index > confirmedChunkIndexes.length}
                      >
                        {`${index + 1}. ${chunk.label}${confirmedChunkIndexes.includes(index) ? " · Saved" : ""}`}
                      </MenuItem>
                    ))}
                  </TextField>
                </Stack>
                {workspace.intake && (
                  <Accordion disableGutters>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography>Compare saved intake answers</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Stack spacing={1}>
                        <Typography variant="body2" color="text.secondary">
                          {workspace.intake_comparison?.source
                            ? workspace.intake_comparison.source.kind ===
                              "previous_encounter"
                              ? `Compared with the latest readable intake from encounter ${workspace.intake_comparison.source.encounter_id}, saved ${workspace.intake_comparison.source.recorded_at.slice(0, 10)}.`
                              : `Compared with an earlier revision in this encounter, saved ${workspace.intake_comparison.source.recorded_at.slice(0, 10)}.`
                            : "No readable earlier intake is available for comparison."}
                        </Typography>
                        {(workspace.intake_comparison?.items ?? []).map(
                          (item) => (
                            <Box
                              key={item.id}
                              sx={{
                                borderTop: 1,
                                borderColor: "divider",
                                pt: 1,
                              }}
                            >
                              <Typography variant="subtitle2">
                                {item.label}
                                {item.changed ? " · Changed" : " · Unchanged"}
                              </Typography>
                              <Typography variant="body2">
                                Previous: {item.previous || "Not recorded"}
                              </Typography>
                              <Typography variant="body2">
                                Current: {item.current || "Not recorded"}
                              </Typography>
                            </Box>
                          ),
                        )}
                        {workspace.intake_comparison?.source &&
                          !workspace.intake_comparison.items.length && (
                            <Typography variant="body2">
                              No comparable saved answers are available.
                            </Typography>
                          )}
                      </Stack>
                    </AccordionDetails>
                  </Accordion>
                )}
                {intakeChunks[activeChunkIndex].id ===
                  "patient_coordination" && (
                  <PatientCareCoordination patientId={patient.id} />
                )}
                {intakeChunks[activeChunkIndex].id ===
                  "records_consent_admin" && (
                  <IntakeConsentEvidence patientId={patient.id} />
                )}
                {intakeChunks[activeChunkIndex].id ===
                  "records_consent_admin" && (
                  <IntakeEvidencePicker
                    options={workspace.evidence_options ?? []}
                    selected={form.questionnaire?.evidence_keys ?? []}
                    disabled={busy || !workspace.capabilities.intake_write}
                    onChange={(evidence_keys) =>
                      setForm((current) => ({
                        ...current,
                        questionnaire: {
                          ...current.questionnaire,
                          answers: current.questionnaire?.answers ?? {},
                          text: current.questionnaire?.text ?? "",
                          evidence_keys,
                          status: "draft",
                          confirmed: false,
                          confirmed_chunks: (
                            current.questionnaire?.confirmed_chunks ?? []
                          ).filter((index) => index < activeChunkIndex),
                        },
                      }))
                    }
                  />
                )}
                <StaffIntakeSections
                  sectionId={intakeChunks[activeChunkIndex].id}
                  definitions={workspace.questionnaire_form.fields}
                  fields={workspace.questionnaire_form.fields.filter(
                    (field) =>
                      intakeChunks[activeChunkIndex].fields.some(
                        (id) => id === field.id,
                      ) &&
                      intakeFieldVisible(
                        field,
                        form.questionnaire?.answers ?? {},
                        workspace.questionnaire_form?.fields ?? [],
                      ) &&
                      (![
                        "telehealth_location",
                        "telehealth_physical_location",
                      ].includes(field.id) ||
                        encounter.visit_modality === "video"),
                  )}
                  answerStates={workspace.questionnaire_form.answer_states}
                  medicationOptions={
                    workspace.questionnaire_form.medication_options
                  }
                  medicationReferences={
                    workspace.questionnaire_form.medication_references
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
                        confirmed_chunks: (
                          current.questionnaire?.confirmed_chunks ?? []
                        ).filter((index) => index < activeChunkIndex),
                      },
                    }))
                  }
                />
                {activeChunkIndex === intakeChunks.length - 1 && (
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
                          ...current.questionnaire,
                          answers: current.questionnaire?.answers ?? {},
                          text: event.target.value,
                          status: "draft",
                          confirmed: false,
                          confirmed_chunks:
                            current.questionnaire?.confirmed_chunks ?? [],
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
                            ...current.questionnaire,
                            answers: current.questionnaire?.answers ?? {},
                            text: current.questionnaire?.text ?? "",
                            status: event.target.checked
                              ? "submitted"
                              : "draft",
                            confirmed: event.target.checked,
                            confirmed_chunks:
                              current.questionnaire?.confirmed_chunks ?? [],
                          },
                        }))
                      }
                    />
                  }
                />
                <Typography variant="body2" color="text.secondary">
                  Saving answers does not reconcile medicines or allergies,
                  confirm patient consent, or complete clinical review.
                </Typography>
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
            {intakeQuestionGroupsSaved && (
              <>
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
                    Clinical values stay in observations and history records;
                    this revision records which evidence was used and whether
                    each step is complete.
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
                    options={[
                      "confirmed",
                      "not_confirmed",
                      "unable_to_confirm",
                    ]}
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
                    Set ready, then save intake revision
                  </Button>
                )}
              </>
            )}
          </Stack>
          {handoffStageAvailable && (
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
                  {staleHandoff &&
                    ["pending", "accepted", "correction_requested"].includes(
                      workspace.handoff.state,
                    ) && (
                      <Alert severity="warning">
                        Intake changed after this handoff was requested. Cancel
                        this handoff, review the latest answers, and request a
                        new handoff.
                      </Alert>
                    )}
                  {workspace.handoff.requested_by_membership_id ===
                    clinic.membership_id &&
                    ["pending", "accepted"].includes(
                      workspace.handoff.state,
                    ) && (
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
                          disabled={busy || staleHandoff || dirty}
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
                        disabled={busy || staleHandoff || dirty}
                        variant="outlined"
                        onClick={() => void transitionHandoff("complete")}
                      >
                        Complete handoff
                      </Button>
                    )}
                  {workspace.handoff.state === "correction_requested" && (
                    <Alert severity="warning">
                      Revise and save the intake, then cancel this handoff
                      before requesting a new clinician review.
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
                <Stack spacing={1}>
                  <Typography color="text.secondary">
                    No handoff has been requested.
                  </Typography>
                  <Button
                    variant="contained"
                    disabled={
                      busy || dirty || !workspace.capabilities.handoff_request
                    }
                    onClick={() => void requestHandoff()}
                    sx={{ alignSelf: "flex-start" }}
                  >
                    Request clinician handoff
                  </Button>
                </Stack>
              )}
            </Stack>
          )}
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
            {encounterTasks.length === 0 ? (
              <Typography color="text.secondary">
                No separate encounter tasks are recorded. Intake review tasks
                are listed in the review queue above.
              </Typography>
            ) : (
              encounterTasks.map((task) => {
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
