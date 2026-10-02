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
  TextField,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
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
import {
  IntakeActionFeedback,
  unresolvedIntakeGroupMessage,
  unresolvedIntakeQuestions,
  type IntakeActionFailure,
  type IntakeQuestionError,
} from "./IntakeActionFeedback";
import { VitalSignsEntry } from "./VitalSignsEntry";
import { IntakeEvidencePicker } from "./IntakeEvidencePicker";
import { IntakeConsentEvidence } from "./IntakeConsentEvidence";
import { PatientCareCoordination } from "./PatientCareCoordination";
import { IntakeAnswerProvenance } from "./IntakeAnswerProvenance";
import { IntakeQuestionTasks } from "./IntakeQuestionTasks";
import {
  IntakeQuestionFollowUp,
  questionFollowUpDrafts,
  type QuestionFollowUpDraft,
} from "./IntakeQuestionFollowUp";

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
    question_follow_up?: Record<string, QuestionFollowUpDraft>;
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
  intake: "Intake follow-up",
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

export function intakeGroupProgressLabel(saved: number, total: number) {
  return `${saved} of ${total} ${total === 1 ? "group" : "groups"} saved · Save each group to unlock the next.`;
}

export function allIntakeChunksConfirmed(
  chunks: Array<{ index: number }>,
  confirmedChunkIndexes: number[],
) {
  return (
    chunks.length === 0 ||
    chunks.every((chunk) => confirmedChunkIndexes.includes(chunk.index))
  );
}

export function intakeRevisionContinuity({
  received,
  saved,
  patientId,
  encounterId,
  editedVersion,
  dirty,
}: {
  received: EncounterIntakeRevision | null | undefined;
  saved: EncounterIntakeRevision | null;
  patientId: number;
  encounterId: number;
  editedVersion: number | null;
  dirty: boolean;
}) {
  const intake =
    [received, saved]
      .filter(
        (revision): revision is EncounterIntakeRevision =>
          revision != null &&
          revision.patient_id === patientId &&
          revision.encounter_id === encounterId,
      )
      .sort((left, right) => right.version - left.version)[0] ?? null;
  const expectedVersion = editedVersion ?? 0;
  return {
    intake,
    expectedVersion,
    conflict: dirty && (intake?.version ?? 0) > expectedVersion,
  };
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
  const [savedIntake, setSavedIntake] =
    useState<EncounterIntakeRevision | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [intakeFailure, setIntakeFailure] =
    useState<IntakeActionFailure | null>(null);
  const [questionToReview, setQuestionToReview] =
    useState<IntakeQuestionError | null>(null);
  const [activeChunk, setActiveChunk] = useState(0);
  const [groupExpanded, setGroupExpanded] = useState(true);
  const [activeWorkspace, setActiveWorkspace] = useState("intake");
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
    setSavedIntake(null);
    setError("");
    setIntakeFailure(null);
    setQuestionToReview(null);
    setNotice("");
    setActiveChunk(0);
    setGroupExpanded(true);
    setActiveWorkspace("intake");
    hydratedVersion.current = null;
    saveAttempt.current = null;
    setRoomId(encounter.room_id);
    setEncounterObservations(observations);
  }, [patient.id, encounter.id]);
  useEffect(() => {
    if (
      !questionToReview ||
      activeChunk !== questionToReview.chunkIndex ||
      !groupExpanded
    )
      return;
    const question = Array.from(
      document
        .getElementById("nurse-workspace")
        ?.querySelectorAll<HTMLElement>("[data-intake-question]") ?? [],
    ).find((element) => element.dataset.intakeQuestion === questionToReview.id);
    if (!question) return;
    question.focus({ preventScroll: true });
    question.scrollIntoView({ block: "nearest" });
    setQuestionToReview(null);
  }, [questionToReview, activeChunk, groupExpanded]);
  const [taskKind, setTaskKind] =
    useState<ClinicalTask["task_kind"]>("patient_call");
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const {
    intake: latestIntake,
    expectedVersion,
    conflict: intakeConflict,
  } = intakeRevisionContinuity({
    received: resource.data?.intake,
    saved: savedIntake,
    patientId: patient.id,
    encounterId: encounter.id,
    editedVersion: hydratedVersion.current,
    dirty,
  });
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
            MEASUREMENT_CODES.has(item.code) &&
            item.numeric_value != null,
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
        (room) =>
          String(room.site_id) === String(encounter.site_id) &&
          room.kind === "physical",
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
    const intake = latestIntake;
    if (
      !intake ||
      (hydratedVersion.current !== null &&
        hydratedVersion.current >= intake.version) ||
      dirty
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
        question_follow_up: questionFollowUpDrafts(
          intake.questionnaire?.question_follow_up,
        ),
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
    setActiveChunk(nextChunk === -1 ? 0 : nextChunk);
  }, [chunkDefinitions, dirty, latestIntake]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (!questionToReview) groupHeading.current?.focus();
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
  const encounterTasks = workspace.tasks.filter(
    (task) =>
      task.task_kind !== "handoff" &&
      !["completed", "cancelled"].includes(task.state),
  );
  const cancelledManualTasks = workspace.tasks.filter(
    (task) => task.state === "cancelled" && task.source_type === "manual",
  );
  const intakeChunks = workspace.questionnaire_form?.chunks ?? [];
  const remainingFailedQuestions =
    intakeFailure && workspace.questionnaire_form
      ? unresolvedIntakeQuestions({
          fields: workspace.questionnaire_form.fields,
          chunks: intakeChunks,
          confirmedChunks: intakeFailure.questions.map(
            (question) => question.chunkIndex,
          ),
          answers: form.questionnaire?.answers ?? {},
          measuredFields: recordedMeasurements
            .filter((item) =>
              ["vital-height", "vital-weight"].includes(item.code),
            )
            .map((item) => item.code.slice("vital-".length)),
          video: encounter.visit_modality === "video",
        }).filter((question) =>
          intakeFailure.questions.some(
            (failed) =>
              failed.id === question.id &&
              failed.chunkIndex === question.chunkIndex,
          ),
        )
      : [];
  const confirmedChunkIndexes = form.questionnaire?.confirmed_chunks ?? [];
  const activeChunkIndex = Math.min(
    activeChunk,
    Math.max(intakeChunks.length - 1, 0),
  );
  const roomRequired = encounter.visit_modality !== "video";
  const intakeVersion = latestIntake?.version ?? 0;
  const intakeQuestionGroupsSaved = allIntakeChunksConfirmed(
    intakeChunks,
    confirmedChunkIndexes,
  );
  const intakeRevisionSaved =
    latestIntake?.status === "ready_for_handoff" &&
    expectedVersion === intakeVersion &&
    !dirty;
  const staleHandoff = Boolean(
    workspace.handoff &&
    latestIntake &&
    workspace.handoff.intake_revision_id !== latestIntake.id,
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

  async function perform(
    operation: () => Promise<void>,
    onFailure?: (caught: unknown, message: string) => void,
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
      resource.refresh();
    } catch (caught) {
      const message =
        caught instanceof ApiError && caught.code === "outcome_unconfirmed"
          ? "The server outcome is unconfirmed. Refresh this encounter before deciding whether to repeat the action."
          : caught instanceof Error
            ? caught.message
            : "The action could not be completed.";
      if (onFailure) onFailure(caught, message);
      else setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function saveIntake(formToSave = form, advanceChunk = false) {
    if (intakeConflict) return;
    const requestContext = `${patient.id}:${encounter.id}`;
    const attemptedChunk = activeChunkIndex;
    const attemptedWorkspace =
      activeWorkspace === "handoff" ? "handoff" : "intake";
    const confirmedChunksToSave = formToSave.questionnaire
      ? Array.from(
          new Set([
            ...(formToSave.questionnaire.confirmed_chunks ?? []),
            ...(advanceChunk ? [activeChunkIndex] : []),
          ]),
        ).sort((left, right) => left - right)
      : [];
    await perform(
      async () => {
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
          expected_version: expectedVersion,
          observation_ids: observationIds,
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
        setIntakeFailure(null);
        const saved: IntakeForm = {
          status: response.intake.status,
          identity_state: response.intake.identity_state,
          visit_reason_state: response.intake.visit_reason_state,
          history_state: response.intake.history_state,
          vitals_state: response.intake.vitals_state,
          questionnaire: {
            answers: response.intake.questionnaire?.answers ?? {},
            question_follow_up: questionFollowUpDrafts(
              response.intake.questionnaire?.question_follow_up,
            ),
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
        setSavedIntake(response.intake);
        saveAttempt.current = null;
        hydratedVersion.current = response.intake.version;
        if (advanceChunk) {
          setActiveChunk(() =>
            Math.min(activeChunkIndex + 1, intakeChunks.length - 1),
          );
          setGroupExpanded(activeChunkIndex < intakeChunks.length - 1);
          setNotice("Group saved.");
        } else setNotice("Intake revision saved.");
      },
      (caught, message) => {
        if (contextRef.current !== requestContext) return;
        if (attemptedWorkspace === "handoff") {
          setError(message);
          return;
        }
        const questions =
          caught instanceof ApiError &&
          caught.status === 422 &&
          caught.message === unresolvedIntakeGroupMessage &&
          workspace.questionnaire_form
            ? unresolvedIntakeQuestions({
                fields: workspace.questionnaire_form.fields,
                chunks: intakeChunks,
                confirmedChunks: confirmedChunksToSave,
                answers: formToSave.questionnaire?.answers ?? {},
                measuredFields: recordedMeasurements
                  .filter(
                    (item) =>
                      observationIds.includes(item.id) &&
                      ["vital-height", "vital-weight"].includes(item.code),
                  )
                  .map((item) => item.code.slice("vital-".length)),
                video: encounter.visit_modality === "video",
              })
            : [];
        setIntakeFailure({
          message,
          chunkIndex: attemptedChunk,
          workspace: attemptedWorkspace,
          questions,
        });
        setActiveWorkspace("intake");
        setActiveChunk(attemptedChunk);
        setGroupExpanded(true);
      },
    );
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
    const intake = latestIntake;
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
    action: "claim" | "start" | "complete" | "reopen",
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

  function discardIntakeEdits() {
    hydratedVersion.current = null;
    saveAttempt.current = null;
    setForm(emptyIntake);
    setBaseline(emptyIntake);
    setError("");
    setIntakeFailure(null);
    setQuestionToReview(null);
    setNotice("");
    resource.refresh();
  }

  return (
    <Paper
      id="nurse-workspace"
      component="section"
      tabIndex={-1}
      variant="outlined"
      sx={{ p: { xs: 1.5, md: 2 } }}
    >
      <Stack spacing={1.5}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1}
          sx={{
            alignItems: { md: "center" },
            justifyContent: "space-between",
          }}
        >
          <Box sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
            <Typography component="h2" variant="h5" sx={{ fontWeight: 700 }}>
              Rooming & intake
            </Typography>
            <Typography color="text.secondary">
              {patient.display_name} · Encounter #{encounter.id} · Room{" "}
              {roomStatusLabel}
            </Typography>
          </Box>
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{ flexWrap: "wrap" }}
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
              label={dirty ? "Unsaved changes" : "Saved"}
              size="small"
              variant="outlined"
            />
            {workspace.questionnaire_form && (
              <Chip
                label={intakeGroupProgressLabel(
                  confirmedChunkIndexes.length,
                  intakeChunks.length,
                )}
                size="small"
                variant="outlined"
              />
            )}
          </Stack>
        </Stack>
        <Stack
          direction="row"
          spacing={0.5}
          useFlexGap
          aria-label="Encounter preparation"
          sx={{ flexWrap: "wrap" }}
        >
          {[
            ["rooming", "Room & vitals"],
            ["intake", "Intake"],
            ["handoff", "Clinician handoff"],
            [
              "followup",
              `Follow-up work${encounterTasks.length ? ` (${encounterTasks.length})` : ""}`,
            ],
          ].map(([value, label]) => (
            <Button
              key={value}
              id={`preparation-tab-${value}`}
              variant={activeWorkspace === value ? "outlined" : "text"}
              aria-pressed={activeWorkspace === value}
              onClick={() => setActiveWorkspace(value)}
              aria-controls={`preparation-panel-${value}`}
              sx={{ minHeight: 44, px: 1.5 }}
            >
              {label}
            </Button>
          ))}
        </Stack>
        {!readyEvidence && (
          <Alert severity="warning" icon={<WarningAmberOutlinedIcon />}>
            <Typography variant="body2">
              <Box component="span" sx={{ fontWeight: 600 }}>
                Needs attention before clinician handoff:{" "}
              </Box>
              {handoffAttention.join(" · ")}.
            </Typography>
          </Alert>
        )}
        {intakeConflict && (
          <Alert
            severity="warning"
            action={
              <Button onClick={discardIntakeEdits} disabled={busy}>
                Discard local edits and load saved intake
              </Button>
            }
          >
            A newer intake revision is available. Your unsaved changes are still
            shown. Review them before discarding and loading the saved intake.
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
                {dirty && !intakeConflict && (
                  <Button color="inherit" onClick={discardIntakeEdits}>
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
          id="preparation-panel-rooming"
          role="region"
          aria-labelledby="preparation-tab-rooming"
          hidden={activeWorkspace !== "rooming"}
          variant="outlined"
          sx={{
            p: 2,
            display: activeWorkspace === "rooming" ? "block" : "none",
          }}
        >
          <Stack spacing={1.25}>
            <Box>
              <Typography component="h3" variant="h6">
                Vitals & measurements
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Enter today’s measurements. Recorded values are available
                throughout this encounter.
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
                    "Vital signs saved. They will be linked when you save intake.",
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
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr)",
            gap: 2,
          }}
        >
          <Stack spacing={2}>
            <Box
              sx={{
                display: activeWorkspace === "rooming" ? "grid" : "none",
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
              <Stack
                spacing={2.5}
                id="preparation-panel-intake"
                role="region"
                aria-labelledby="preparation-tab-intake"
                hidden={activeWorkspace !== "intake"}
                sx={{ display: activeWorkspace === "intake" ? "flex" : "none" }}
              >
                {intakeChunks.map((chunk, index) => {
                  if (!workspace.questionnaire_form) return null;
                  const locked = intakeChunks
                    .slice(0, index)
                    .some(
                      (_item, preceding) =>
                        !confirmedChunkIndexes.includes(preceding),
                    );
                  const expanded =
                    index === activeChunkIndex && groupExpanded && !locked;
                  return (
                    <Accordion
                      key={chunk.id}
                      disableGutters
                      elevation={0}
                      expanded={expanded}
                      disabled={locked || busy}
                      onChange={(_event, nextExpanded) => {
                        setActiveChunk(index);
                        setGroupExpanded(nextExpanded);
                      }}
                      sx={{
                        border: 1,
                        borderColor: expanded ? "primary.main" : "divider",
                        borderRadius: "12px !important",
                        "&:before": { display: "none" },
                        "&.Mui-disabled": {
                          bgcolor: "background.paper",
                        },
                        "& .MuiAccordionSummary-root.Mui-disabled": {
                          opacity: 1,
                          color: "text.secondary",
                        },
                      }}
                    >
                      <AccordionSummary
                        expandIcon={
                          locked ? (
                            <LockOutlinedIcon fontSize="small" />
                          ) : (
                            <ExpandMoreIcon />
                          )
                        }
                        id={`intake-group-${chunk.id}`}
                        aria-controls={`intake-group-${chunk.id}-content`}
                      >
                        <Stack
                          direction="row"
                          spacing={2}
                          sx={{
                            width: "100%",
                            alignItems: "center",
                            justifyContent: "space-between",
                            pr: 1,
                          }}
                        >
                          <Typography sx={{ fontWeight: 650 }}>
                            {index + 1}. {chunk.label}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {locked
                              ? "Locked"
                              : confirmedChunkIndexes.includes(index)
                                ? "Saved"
                                : "To complete"}
                          </Typography>
                        </Stack>
                      </AccordionSummary>
                      <AccordionDetails>
                        {expanded && (
                          <Stack spacing={2.5}>
                            <Typography
                              color="text.secondary"
                              ref={groupHeading}
                              tabIndex={-1}
                            >
                              {chunk.description}
                            </Typography>
                            {workspace.intake && (
                              <Accordion disableGutters>
                                <AccordionSummary
                                  expandIcon={<ExpandMoreIcon />}
                                >
                                  <Typography>
                                    Compare saved intake answers
                                  </Typography>
                                </AccordionSummary>
                                <AccordionDetails>
                                  <Stack spacing={1}>
                                    <Typography
                                      variant="body2"
                                      color="text.secondary"
                                    >
                                      {workspace.intake_comparison?.source
                                        ? workspace.intake_comparison.source
                                            .kind === "previous_encounter"
                                          ? `Compared with the latest readable intake from encounter ${workspace.intake_comparison.source.encounter_id}, saved ${workspace.intake_comparison.source.recorded_at.slice(0, 10)}.`
                                          : `Compared with an earlier revision in this encounter, saved ${workspace.intake_comparison.source.recorded_at.slice(0, 10)}.`
                                        : "No readable earlier intake is available for comparison."}
                                    </Typography>
                                    {(
                                      workspace.intake_comparison?.items ?? []
                                    ).map((item) => (
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
                                          {item.changed
                                            ? " · Changed"
                                            : " · Unchanged"}
                                        </Typography>
                                        <Typography variant="body2">
                                          Previous:{" "}
                                          {item.previous || "Not recorded"}
                                        </Typography>
                                        <Typography variant="body2">
                                          Current:{" "}
                                          {item.current || "Not recorded"}
                                        </Typography>
                                      </Box>
                                    ))}
                                    {workspace.intake_comparison?.source &&
                                      !workspace.intake_comparison.items
                                        .length && (
                                        <Typography variant="body2">
                                          No comparable saved answers are
                                          available.
                                        </Typography>
                                      )}
                                  </Stack>
                                </AccordionDetails>
                              </Accordion>
                            )}
                            {latestIntake && (
                              <IntakeAnswerProvenance
                                intake={latestIntake}
                                patientId={patient.id}
                                encounterId={encounter.id}
                                fields={
                                  workspace.questionnaire_form?.fields ?? []
                                }
                                questionIds={chunk.fields}
                                scopeId={chunk.id}
                              />
                            )}
                            <IntakeQuestionFollowUp
                              fields={(
                                workspace.questionnaire_form?.fields ?? []
                              ).filter((field) =>
                                chunk.fields.includes(field.id),
                              )}
                              answers={form.questionnaire?.answers ?? {}}
                              saved={
                                latestIntake?.questionnaire?.question_follow_up
                              }
                              drafts={
                                form.questionnaire?.question_follow_up ?? {}
                              }
                              writable={workspace.capabilities.intake_write}
                              onManageTasks={() =>
                                setActiveWorkspace("followup")
                              }
                              disabled={busy || intakeConflict}
                              onChange={(question_follow_up) =>
                                setForm((current) => ({
                                  ...current,
                                  questionnaire: {
                                    ...current.questionnaire,
                                    answers:
                                      current.questionnaire?.answers ?? {},
                                    text: current.questionnaire?.text ?? "",
                                    status: "draft",
                                    confirmed: false,
                                    confirmed_chunks:
                                      current.questionnaire?.confirmed_chunks ??
                                      [],
                                    question_follow_up,
                                  },
                                }))
                              }
                            />
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
                                selected={
                                  form.questionnaire?.evidence_keys ?? []
                                }
                                disabled={
                                  busy || !workspace.capabilities.intake_write
                                }
                                onChange={(evidence_keys) =>
                                  setForm((current) => ({
                                    ...current,
                                    questionnaire: {
                                      ...current.questionnaire,
                                      answers:
                                        current.questionnaire?.answers ?? {},
                                      text: current.questionnaire?.text ?? "",
                                      evidence_keys,
                                      status: "draft",
                                      confirmed: false,
                                      confirmed_chunks: (
                                        current.questionnaire
                                          ?.confirmed_chunks ?? []
                                      ).filter(
                                        (index) => index !== activeChunkIndex,
                                      ),
                                    },
                                  }))
                                }
                              />
                            )}
                            {intakeChunks[activeChunkIndex].id ===
                              "measurements" &&
                              recordedMeasurements.length > 0 && (
                                <Stack spacing={1}>
                                  <Typography component="h4" variant="h6">
                                    Recorded measurements
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                  >
                                    From this encounter’s vital signs. These
                                    values are linked when you save intake.
                                  </Typography>
                                  {recordedMeasurements.map((measurement) => (
                                    <Typography key={measurement.id}>
                                      {measurement.display_label ||
                                        measurement.code}
                                      : {measurement.numeric_value}{" "}
                                      {measurement.unit_label ||
                                        measurement.unit_code}{" "}
                                      ·{" "}
                                      {new Date(
                                        measurement.observed_at,
                                      ).toLocaleString()}
                                    </Typography>
                                  ))}
                                  <Button
                                    sx={{ alignSelf: "start" }}
                                    onClick={() =>
                                      setActiveWorkspace("rooming")
                                    }
                                  >
                                    Record another measurement
                                  </Button>
                                </Stack>
                              )}
                            <StaffIntakeSections
                              questionErrors={Object.fromEntries(
                                remainingFailedQuestions
                                  .filter(
                                    (question) => question.chunkIndex === index,
                                  )
                                  .map((question) => [
                                    question.id,
                                    "Answer this question or choose an explicit resolution before confirming.",
                                  ]),
                              )}
                              sectionId={intakeChunks[activeChunkIndex].id}
                              definitions={workspace.questionnaire_form.fields}
                              fields={workspace.questionnaire_form.fields.filter(
                                (field) =>
                                  intakeChunks[activeChunkIndex].fields.some(
                                    (id) => id === field.id,
                                  ) &&
                                  !recordedMeasurements.some(
                                    (item) =>
                                      ["height", "weight"].includes(field.id) &&
                                      item.code === `vital-${field.id}`,
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
                              answerStates={
                                workspace.questionnaire_form.answer_states
                              }
                              medicationOptions={
                                workspace.questionnaire_form.medication_options
                              }
                              medicationReferences={
                                workspace.questionnaire_form
                                  .medication_references
                              }
                              answers={form.questionnaire?.answers ?? {}}
                              disabled={
                                busy || !workspace.capabilities.intake_write
                              }
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
                                      current.questionnaire?.confirmed_chunks ??
                                      []
                                    ).filter(
                                      (index) => index !== activeChunkIndex,
                                    ),
                                  },
                                }))
                              }
                            />
                            {activeChunkIndex === intakeChunks.length - 1 && (
                              <TextField
                                label="Additional patient-reported context"
                                multiline
                                value={form.questionnaire?.text ?? ""}
                                disabled={
                                  busy || !workspace.capabilities.intake_write
                                }
                                slotProps={{ htmlInput: { maxLength: 5000 } }}
                                onChange={(event) =>
                                  setForm((current) => ({
                                    ...current,
                                    questionnaire: {
                                      ...current.questionnaire,
                                      answers:
                                        current.questionnaire?.answers ?? {},
                                      text: event.target.value,
                                      status: "draft",
                                      confirmed: false,
                                      confirmed_chunks:
                                        current.questionnaire
                                          ?.confirmed_chunks ?? [],
                                    },
                                  }))
                                }
                              />
                            )}
                            {intakeFailure?.workspace === "intake" &&
                              intakeFailure.chunkIndex === index && (
                                <IntakeActionFeedback
                                  failure={intakeFailure}
                                  questions={remainingFailedQuestions}
                                  onRefresh={resource.refresh}
                                  onDiscard={
                                    dirty && !intakeConflict
                                      ? discardIntakeEdits
                                      : undefined
                                  }
                                  onReviewQuestion={(question) => {
                                    setActiveWorkspace("intake");
                                    setActiveChunk(question.chunkIndex);
                                    setGroupExpanded(true);
                                    setQuestionToReview(question);
                                  }}
                                />
                              )}
                            <Stack
                              direction={{ xs: "column", sm: "row" }}
                              spacing={1}
                            >
                              <Button
                                variant="contained"
                                disabled={
                                  busy ||
                                  intakeConflict ||
                                  !workspace.capabilities.intake_write
                                }
                                onClick={() =>
                                  void saveIntake(
                                    {
                                      ...form,
                                      questionnaire: {
                                        ...form.questionnaire,
                                        answers:
                                          form.questionnaire?.answers ?? {},
                                        text: form.questionnaire?.text ?? "",
                                        confirmed_chunks: confirmedChunkIndexes,
                                        status: "submitted",
                                        confirmed: true,
                                      },
                                    },
                                    true,
                                  )
                                }
                              >
                                {activeChunkIndex < intakeChunks.length - 1
                                  ? "Save & continue"
                                  : "Save group"}
                              </Button>
                              <Button
                                variant="outlined"
                                disabled={
                                  busy ||
                                  intakeConflict ||
                                  !dirty ||
                                  !workspace.capabilities.intake_write
                                }
                                onClick={() => void saveIntake()}
                              >
                                Save draft
                              </Button>
                            </Stack>
                          </Stack>
                        )}
                      </AccordionDetails>
                    </Accordion>
                  );
                })}
              </Stack>
            )}
            {activeWorkspace === "handoff" && (
              <>
                <Box>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1}
                    sx={{ justifyContent: "space-between" }}
                  >
                    <Typography component="h3" variant="h6">
                      Prepare handoff
                    </Typography>
                    <Chip
                      variant="outlined"
                      label={`Version ${intakeVersion} · ${stateLabel(latestIntake?.status || "not recorded")}`}
                    />
                  </Stack>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 0.5 }}
                  >
                    Confirm the rooming checks before sending this encounter to
                    the clinician.
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
                      busy ||
                      intakeConflict ||
                      !dirty ||
                      !workspace.capabilities.intake_write
                    }
                    onClick={() => void saveIntake()}
                  >
                    Save preparation
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
                    disabled={
                      busy ||
                      intakeConflict ||
                      !intakeQuestionGroupsSaved ||
                      !workspace.capabilities.intake_write
                    }
                    onClick={() =>
                      void saveIntake({ ...form, status: "ready_for_handoff" })
                    }
                  >
                    Save as ready for clinician
                  </Button>
                )}
              </>
            )}
          </Stack>
          {(workspace.handoff || activeWorkspace === "handoff") && (
            <Stack
              spacing={2}
              id="preparation-panel-handoff"
              role="region"
              aria-labelledby="preparation-tab-handoff"
              hidden={activeWorkspace !== "handoff"}
              sx={{ display: activeWorkspace === "handoff" ? "flex" : "none" }}
            >
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
                <Typography color="text.secondary">
                  No handoff has been requested.
                </Typography>
              )}
              {(!workspace.handoff ||
                ["cancelled", "rejected", "completed"].includes(
                  workspace.handoff.state,
                )) && (
                <Button
                  variant="contained"
                  disabled={
                    busy ||
                    dirty ||
                    !intakeRevisionSaved ||
                    !workspace.capabilities.handoff_request
                  }
                  onClick={() => void requestHandoff()}
                  sx={{ alignSelf: "flex-start" }}
                >
                  Request clinician handoff
                </Button>
              )}
            </Stack>
          )}
        </Box>
        <Box
          id="preparation-panel-followup"
          role="region"
          aria-labelledby="preparation-tab-followup"
          hidden={activeWorkspace !== "followup"}
          sx={{ display: activeWorkspace === "followup" ? "block" : "none" }}
        >
          <IntakeQuestionTasks
            patientId={patient.id}
            encounterId={encounter.id}
            tasks={workspace.tasks}
            writable={workspace.capabilities.tasks_write}
            disabled={busy || intakeConflict}
            onChanged={resource.refresh}
          />
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
                Follow-up work
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Assign a specific action that needs follow-up outside routine
                rooming.
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
                No outstanding follow-up work.
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
                          {reviewItems.find((item) => item.task_id === task.id)
                            ?.label ||
                            (task.source_kind
                              ? stateLabel(task.source_kind)
                              : taskLabels[task.task_kind])}
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
            {workspace.capabilities.tasks_write &&
              cancelledManualTasks.length > 0 && (
                <Accordion>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    Cancelled follow-up work ({cancelledManualTasks.length})
                  </AccordionSummary>
                  <AccordionDetails>
                    <Stack spacing={1.5}>
                      <Typography variant="body2" color="text.secondary">
                        Reopening returns deliberately created work to the
                        available team pool. An authorized owner must claim it.
                      </Typography>
                      {cancelledManualTasks.map((task) => (
                        <Stack key={task.id} direction="row" spacing={1}>
                          <Typography sx={{ flex: 1 }}>
                            Task #{task.id} · {taskLabels[task.task_kind]} ·{" "}
                            {stateLabel(task.pool_code)} pool
                          </Typography>
                          <Button
                            disabled={busy}
                            onClick={() => void transitionTask(task, "reopen")}
                            aria-label={`Reopen task ${task.id}`}
                          >
                            Reopen
                          </Button>
                        </Stack>
                      ))}
                    </Stack>
                  </AccordionDetails>
                </Accordion>
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
