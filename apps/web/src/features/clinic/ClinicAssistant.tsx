import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FormEvent } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Chip,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  Link,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tabs,
  Tab,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import OpenInFullRoundedIcon from "@mui/icons-material/OpenInFullRounded";
import CloseFullscreenRoundedIcon from "@mui/icons-material/CloseFullscreenRounded";
import { ApiError, api } from "../../api/client";
import type { Patient } from "../../api/contracts";
import { WorkflowCatalog } from "./assistant/WorkflowCatalog";
import { WorkflowContextPicker } from "./assistant/WorkflowContextPicker";
import { WorkflowForm } from "./assistant/WorkflowForm";
import {
  WorkflowProposalReview,
  WorkflowResultView,
} from "./assistant/WorkflowResultView";
import type {
  WorkflowContext,
  WorkflowField,
  WorkflowInput,
  WorkflowInputs,
  WorkflowMessageResult,
  WorkflowOperation,
  WorkflowOption,
  WorkflowProposal,
  WorkflowResult,
  WorkflowMode,
} from "./assistant/workflowTypes";
import "./assistant.css";

type NamedSelection = { selection_id: string; name: string };
type PatientSelection = Pick<Patient, "id" | "display_name" | "reference">;
type ContextPatient = { name: string };
type AssistantContext = {
  context_id: string;
  expires_at: string;
  practice: { id?: number; name: string; timezone?: string };
  site: { id?: number; name: string } | null;
  patient: ContextPatient | null;
  encounter: { selected?: boolean } | null;
  role?: string;
  authorization_generation: string | number;
  visit_types: NamedSelection[];
  clinicians: NamedSelection[];
};
type AssistantOpening = {
  opening_id: string;
  date?: string;
  starts_at: string;
  ends_at: string;
  time?: string;
  site_name?: string;
  patient_name?: string;
  clinician_name?: string;
  visit_type_name?: string;
  visit_modality?: string;
  room_name?: string | null;
};
type AppointmentDisplay = {
  starts_at?: string;
  ends_at?: string;
  status?: string;
  patient_name?: string;
  site_name?: string;
  clinician_name?: string;
  visit_type_name?: string;
  visit_modality?: string;
  timezone?: string;
  patient?: string | { display_name?: string };
  site?: string | { name?: string };
  clinician?: string | { name?: string };
  visit_type?: string | { name?: string };
};
type ProposalResult = {
  proposal_id: string;
  expires_at?: string;
  status?: string;
  state?: "pending" | "confirmed" | "expired" | "stale" | "denied" | string;
  appointment_preview?: AppointmentDisplay;
  appointment?: AppointmentDisplay;
  receipt_id?: string | number | null;
};
type AssistantMessage = {
  role: "user" | "assistant";
  text: string;
  sourcePath?: string;
};
type MessageResult =
  | { status: "clarify"; message: string }
  | {
      status: "intent";
      message?: string;
      intent: { date?: string; time?: string; duration_minutes?: number };
      openings: AssistantOpening[];
      timezone?: string;
    };
type LookupResult = { patients: PatientSelection[] };
type OpeningsResult = { openings: AssistantOpening[]; timezone?: string };
type WorkflowCatalogResult = { operations: WorkflowOperation[] };
type PausedWorkflowDraft = {
  id: number;
  operationKey: string;
  title: string;
  inputs: WorkflowInputs;
  options: Record<string, WorkflowOption[]>;
  messages: AssistantMessage[];
  message: string;
  suggestedFields: string[];
  source: "assistant" | "catalog" | null;
};
type WorkflowOptionsResult = { options: WorkflowOption[] };
type WorkflowProposalReadback = WorkflowProposal | WorkflowResult;

function isWorkflowResult(
  value: WorkflowProposalReadback,
): value is WorkflowResult {
  return (
    (value.status === "result" || value.status === "receipt") &&
    "sections" in value &&
    Array.isArray(value.sections)
  );
}

function routeContext(path: string, search: string) {
  const match =
    /^\/clinic\/patients\/(\d+)(?:\/encounters\/(\d+)(?:\/|$))?/.exec(path);
  const params = new URLSearchParams(search);
  const patientId = match?.[1] ?? params.get("patient_id");
  const encounterId = match?.[2] ?? params.get("encounter_id");
  return {
    patientId:
      patientId && /^[1-9]\d*$/.test(patientId) ? Number(patientId) : null,
    encounterId:
      encounterId && /^[1-9]\d*$/.test(encounterId)
        ? Number(encounterId)
        : null,
  };
}

function suggestedInputs(
  operation: WorkflowOperation,
  candidate: WorkflowMessageResult["inputs"],
): WorkflowInputs {
  const result: WorkflowInputs = {};
  if (!candidate) return result;
  for (const field of operation.fields) {
    if (!(field.key in candidate) || field.type === "record") continue;
    const value = candidate[field.key];
    if (field.type === "array" && field.items) {
      if (!Array.isArray(value)) continue;
      if (field.items.type === "select") {
        const allowed = field.items.options ?? [];
        const selected = value
          .map(
            (item) =>
              allowed.find((option) => String(option.value) === String(item))
                ?.value,
          )
          .filter((item) => item !== undefined);
        if (selected.length === value.length)
          result[field.key] = selected as WorkflowInput;
      } else if (
        field.items.type === "text" ||
        field.items.type === "date" ||
        field.items.type === "datetime"
      ) {
        if (value.every((item) => typeof item === "string"))
          result[field.key] = value as string[];
      } else if (field.items.type === "number") {
        const numbers = value.map((item) => Number(item));
        if (numbers.every(Number.isFinite)) result[field.key] = numbers;
      } else if (field.items.type === "boolean") {
        if (value.every((item) => typeof item === "boolean"))
          result[field.key] = value as boolean[];
      }
      continue;
    }
    if (field.options?.some((option) => "selection_id" in option)) continue;
    if (field.type === "select") {
      const selected = field.options?.find(
        (option) => "value" in option && String(option.value) === String(value),
      );
      if (selected && "value" in selected) result[field.key] = selected.value;
    } else if (
      (field.type === "text" ||
        field.type === "date" ||
        field.type === "datetime") &&
      typeof value === "string"
    ) {
      result[field.key] = value;
    } else if (
      field.type === "decimal" &&
      typeof value === "string" &&
      /^[+-]?\d{1,18}(?:\.\d{1,12})?$/.test(value)
    ) {
      result[field.key] = value;
    } else if (
      field.type === "number" &&
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      result[field.key] = value;
    } else if (field.type === "boolean" && typeof value === "boolean") {
      result[field.key] = value;
    }
  }
  return result;
}

function errorState(error: unknown, mode: WorkflowMode = "booking") {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return {
        kind: "warning",
        message:
          "Your session needs to be refreshed before using the assistant.",
      };
    if (error.status === 403)
      return {
        kind: "warning",
        message: "Your current role does not have permission for this action.",
      };
    if (error.status === 404)
      return {
        kind: "warning",
        message:
          "This assistant context is no longer available. Reconnect to continue.",
      };
    if (error.code === "proposal_expired")
      return {
        kind: "expired",
        message:
          "This proposal has expired. Find openings again to start a new proposal.",
      };
    if (
      error.code === "stale_context" ||
      error.code === "stale_availability" ||
      error.code === "duplicate_submission"
    )
      return {
        kind: "warning",
        message:
          "The selected availability or clinic context changed. Find openings again before continuing.",
      };
    if (error.status === 410)
      return {
        kind: "warning",
        message:
          "This proposal has expired. Find openings again to start a new proposal.",
      };
    if (error.status === 429 || error.code === "quota_exhausted")
      return {
        kind: "quota",
        message:
          mode === "workflows"
            ? "The assistant request limit has been reached. Use the workflow controls below to continue."
            : "The assistant request limit has been reached. You can still find openings directly.",
      };
    if (error.status >= 500 || error.code === "model_unavailable")
      return {
        kind: "unavailable",
        message:
          mode === "workflows"
            ? "The assistant is temporarily unavailable. You can continue with the workflow controls below."
            : "The assistant is temporarily unavailable. You can still find openings directly.",
      };
    return { kind: "error", message: error.message };
  }
  return {
    kind: "unavailable",
    message:
      "We could not confirm the assistant response. Check the current proposal before trying again.",
  };
}

function internalWorkflowPath(path?: string) {
  return path?.startsWith("/") && !path.startsWith("//") ? path : undefined;
}

function formatOpening(opening: AssistantOpening, timezone?: string) {
  if (opening.date && opening.time) return `${opening.date} · ${opening.time}`;
  const date = new Date(opening.starts_at);
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone || undefined,
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function formatAppointment(appointment: AppointmentDisplay, timezone?: string) {
  if (!appointment.starts_at) return "Appointment time not returned";
  const date = new Date(appointment.starts_at);
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone || undefined,
      timeZoneName: "short",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function scheduleHref(
  appointment: AppointmentDisplay,
  fallbackTimezone?: string,
) {
  if (!appointment.starts_at) return "/clinic/schedule";
  const timezone = appointment.timezone || fallbackTimezone;
  let date = appointment.starts_at.slice(0, 10);
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(appointment.starts_at));
    const value = Object.fromEntries(
      parts.map(({ type, value }) => [type, value]),
    );
    date = `${value.year}-${value.month}-${value.day}`;
  } catch {
    // The appointment timestamp is already expressed in the clinic timezone.
  }
  const params = new URLSearchParams({
    month: date.slice(0, 7),
    day: date,
    view: "day",
  });
  return `/clinic/schedule?${params.toString()}`;
}

function appointmentName(
  appointment: AppointmentDisplay,
  key: "patient" | "site" | "clinician" | "visit_type",
) {
  if (key === "patient")
    return (
      appointment.patient_name ||
      (typeof appointment.patient === "string"
        ? appointment.patient
        : appointment.patient?.display_name) ||
      "Patient"
    );
  if (key === "site")
    return (
      appointment.site_name ||
      (typeof appointment.site === "string"
        ? appointment.site
        : appointment.site?.name) ||
      "Location not returned"
    );
  if (key === "clinician")
    return (
      appointment.clinician_name ||
      (typeof appointment.clinician === "string"
        ? appointment.clinician
        : appointment.clinician?.name) ||
      "Clinician not returned"
    );
  return (
    appointment.visit_type_name ||
    (typeof appointment.visit_type === "string"
      ? appointment.visit_type
      : appointment.visit_type?.name) ||
    "Visit type not returned"
  );
}

export function ClinicAssistant({
  path,
  search,
  scopeKey,
  practiceName,
  siteName,
  timezone,
}: {
  path: string;
  search: string;
  scopeKey: string;
  practiceName: string;
  siteName: string;
  timezone: string;
}) {
  const initialRoute = routeContext(path, search);
  const [open, setOpen] = useState(false);
  const [expandedPanel, setExpandedPanel] = useState(false);
  const [mode, setMode] = useState<WorkflowMode>("workflows");
  const [context, setContext] = useState<AssistantContext | null>(null);
  const [contextBusy, setContextBusy] = useState(false);
  const [contextError, setContextError] = useState("");
  const [selectedPatient, setSelectedPatient] =
    useState<PatientSelection | null>(null);
  const [patientQuery, setPatientQuery] = useState("");
  const [patientOptions, setPatientOptions] = useState<PatientSelection[]>([]);
  const [patientBusy, setPatientBusy] = useState(false);
  const [patientError, setPatientError] = useState("");
  const [visitTypeId, setVisitTypeId] = useState("");
  const [clinicianId, setClinicianId] = useState("");
  const [date, setDate] = useState("");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [openings, setOpenings] = useState<AssistantOpening[]>([]);
  const [proposal, setProposal] = useState<ProposalResult | null>(null);
  const [proposalState, setProposalState] = useState<
    "ready" | "unknown" | "stale" | "expired" | "denied" | null
  >(null);
  const [actionError, setActionError] = useState<{
    kind: string;
    message: string;
  } | null>(null);
  const [responseTimezone, setResponseTimezone] = useState("");
  const [busy, setBusy] = useState("");
  const [now, setNow] = useState(Date.now());
  const [workflowContext, setWorkflowContext] =
    useState<WorkflowContext | null>(null);
  const [workflowContextBusy, setWorkflowContextBusy] = useState(false);
  const [workflowContextError, setWorkflowContextError] = useState("");
  const [workflowCatalogBusy, setWorkflowCatalogBusy] = useState(false);
  const [workflowCatalogError, setWorkflowCatalogError] = useState("");
  const [connectionSlow, setConnectionSlow] = useState(false);
  const [workflowOperations, setWorkflowOperations] = useState<
    WorkflowOperation[]
  >([]);
  const [workflowOperation, setWorkflowOperation] =
    useState<WorkflowOperation | null>(null);
  const [workflowInputs, setWorkflowInputs] = useState<WorkflowInputs>({});
  const [workflowOptions, setWorkflowOptions] = useState<
    Record<string, WorkflowOption[]>
  >({});
  const [workflowOptionsBusy, setWorkflowOptionsBusy] = useState<
    Record<string, boolean>
  >({});
  const [workflowMessages, setWorkflowMessages] = useState<AssistantMessage[]>(
    [],
  );
  const [workflowDraft, setWorkflowDraft] = useState("");
  const [suggestedFields, setSuggestedFields] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [pausedDrafts, setPausedDrafts] = useState<PausedWorkflowDraft[]>([]);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [workflowSelectionSource, setWorkflowSelectionSource] = useState<
    "assistant" | "catalog" | null
  >(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const readingPositions = useRef<Record<WorkflowMode, number>>({
    booking: 0,
    workflows: 0,
  });
  const [workflowResult, setWorkflowResult] = useState<WorkflowResult | null>(
    null,
  );
  const [workflowProposal, setWorkflowProposal] =
    useState<WorkflowProposal | null>(null);
  const [workflowProposalStatus, setWorkflowProposalStatus] = useState<
    "ready" | "unknown" | "expired" | "denied" | "stale" | null
  >(null);
  const [workflowError, setWorkflowError] = useState("");
  const attemptedBinding = useRef("");
  const contextSequence = useRef(0);
  const actionSequence = useRef(0);
  const invalidatingContext = useRef(false);
  const invalidationRequest = useRef<Promise<void> | null>(null);
  const scopeRef = useRef(scopeKey);
  const activeContext = useRef<AssistantContext | null>(null);
  const routeRef = useRef(initialRoute);
  const querySequence = useRef(0);
  const workflowContextSequence = useRef(0);
  const workflowActionSequence = useRef(0);
  const workflowOptionSequence = useRef<Record<string, number>>({});
  const workflowBindingRef = useRef("");
  const workflowContextRef = useRef<WorkflowContext | null>(null);
  const workflowFormRef = useRef<HTMLDivElement | null>(null);
  const workflowResultRef = useRef<HTMLDivElement | null>(null);
  const workflowReviewRef = useRef<HTMLDivElement | null>(null);
  const conversationEndRef = useRef<HTMLDivElement | null>(null);
  const workflowInvalidationRequest = useRef<Promise<void> | null>(null);
  const workflowLifecycleQueue = useRef<Promise<unknown>>(Promise.resolve());

  const route = routeContext(path, search);
  const targetPatientId = route.patientId ?? selectedPatient?.id ?? null;
  const targetEncounterId = route.patientId ? route.encounterId : null;
  const bindingKey = `${scopeKey}:${targetPatientId ?? "none"}:${targetEncounterId ?? "none"}`;
  const workflowBindingKey = `${scopeKey}:${targetPatientId ?? "none"}:${targetEncounterId ?? "none"}`;
  const workflowContextReady = Boolean(
    workflowContext?.context_id &&
    workflowBindingRef.current === workflowBindingKey &&
    !workflowContextBusy,
  );
  const workflowProposalExpired = Boolean(
    workflowProposal?.expires_at &&
    Date.parse(workflowProposal.expires_at) <= now,
  );
  useEffect(() => {
    setDiscardDialogOpen(false);
    setWorkflowSelectionSource(null);
    setSuggestedFields([]);
    setPausedDrafts([]);
  }, [workflowBindingKey, workflowContext?.context_id]);
  useEffect(() => {
    setFavorites([]);
  }, [scopeKey]);
  useLayoutEffect(() => {
    if (!open) return;
    if (bodyRef.current)
      bodyRef.current.scrollTop = readingPositions.current[mode];
  }, [open, mode]);
  useEffect(() => {
    const target = workflowProposal
      ? workflowReviewRef.current
      : workflowResult
        ? workflowResultRef.current
        : workflowOperation
          ? workflowFormRef.current
          : conversationEndRef.current;
    if (open && mode === "workflows")
      target?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [workflowOperation, workflowProposal, workflowResult]);
  const currentBinding =
    context?.context_id && attemptedBinding.current === bindingKey;
  const confirmedProposal = Boolean(
    proposal?.state === "confirmed" ||
    proposal?.status === "confirmed" ||
    (proposal?.appointment && proposal.receipt_id),
  );
  const expired = Boolean(
    !confirmedProposal &&
    proposal?.expires_at &&
    Date.parse(proposal.expires_at) <= now,
  );
  const displayPatient = context?.patient ?? selectedPatient;
  const requestError = actionError;

  useEffect(() => {
    activeContext.current = context;
  }, [context]);

  useEffect(() => {
    workflowContextRef.current = workflowContext;
  }, [workflowContext]);

  useEffect(() => {
    const previous = routeRef.current;
    if (
      previous.patientId !== route.patientId ||
      previous.encounterId !== route.encounterId
    ) {
      const previousPatientId =
        previous.patientId ?? selectedPatient?.id ?? null;
      const nextPatientId = route.patientId ?? selectedPatient?.id ?? null;
      const previousEncounterId = previous.patientId
        ? previous.encounterId
        : null;
      const nextEncounterId = route.patientId ? route.encounterId : null;
      const protectedContextChanged =
        previousPatientId !== nextPatientId ||
        previousEncounterId !== nextEncounterId;
      const hadAssistantContext = Boolean(
        context?.context_id || attemptedBinding.current,
      );
      const scopeChanged = scopeRef.current !== scopeKey;
      routeRef.current = route;
      setContext(null);
      activeContext.current = null;
      contextSequence.current += 1;
      actionSequence.current += 1;
      setProposal(null);
      setProposalState(null);
      setOpenings([]);
      setContextError("");
      setActionError(null);
      setVisitTypeId("");
      setClinicianId("");
      if (protectedContextChanged) {
        setMessages([]);
        setDraft("");
      }
      attemptedBinding.current = "";
      if (route.patientId)
        setSelectedPatient({
          id: route.patientId,
          display_name: "",
          reference: "",
        });
      if (hadAssistantContext && !invalidatingContext.current) {
        void invalidateServerContext().finally(() => {
          const patientId =
            route.patientId ??
            (scopeChanged ? null : (selectedPatient?.id ?? null));
          if (open && mode === "booking" && patientId)
            void bindContext(
              patientId,
              route.patientId ? route.encounterId : null,
            );
        });
      }
    }
  }, [
    route.patientId,
    route.encounterId,
    selectedPatient?.id,
    context?.context_id,
    open,
    mode,
  ]);

  useEffect(() => {
    if (route.patientId && selectedPatient?.id !== route.patientId) {
      setSelectedPatient({
        id: route.patientId,
        display_name: "",
        reference: "",
      });
    }
  }, [route.patientId, selectedPatient?.id]);

  const bindContext = async (patientId: number, encounterId: number | null) => {
    if (invalidationRequest.current) await invalidationRequest.current;
    const sequence = ++contextSequence.current;
    actionSequence.current += 1;
    const requestedBinding = `${scopeKey}:${patientId}:${encounterId ?? "none"}`;
    attemptedBinding.current = requestedBinding;
    setBusy("");
    setContextBusy(true);
    setContextError("");
    setActionError(null);
    setProposal(null);
    setProposalState(null);
    setOpenings([]);
    setVisitTypeId("");
    setClinicianId("");
    try {
      const result = await api<AssistantContext>(
        "/api/clinic/assistant/context",
        {
          method: "POST",
          body: {
            patient_id: patientId,
            ...(encounterId ? { encounter_id: encounterId } : {}),
          },
        },
      );
      if (sequence !== contextSequence.current) return;
      activeContext.current = result;
      setContext(result);
      if (result.patient && selectedPatient)
        setSelectedPatient({
          ...selectedPatient,
          display_name: result.patient.name,
        });
    } catch (error) {
      if (sequence !== contextSequence.current) return;
      setContext(null);
      setContextError(errorState(error).message);
    } finally {
      if (sequence === contextSequence.current) setContextBusy(false);
    }
  };

  const invalidateServerContext = async () => {
    if (invalidationRequest.current) return invalidationRequest.current;
    invalidatingContext.current = true;
    invalidationRequest.current = api<void>("/api/clinic/assistant/context", {
      method: "DELETE",
    })
      .catch(() => {
        // Local state stays cleared; the next context creation revalidates the session.
      })
      .finally(() => {
        invalidatingContext.current = false;
        invalidationRequest.current = null;
      });
    return invalidationRequest.current;
  };

  const queueWorkflowLifecycle = useCallback(
    <T,>(action: () => Promise<T>): Promise<T> => {
      const result = workflowLifecycleQueue.current.then(action, action);
      workflowLifecycleQueue.current = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    [],
  );

  const invalidateWorkflowServerContext = useCallback(async () => {
    if (workflowInvalidationRequest.current)
      return workflowInvalidationRequest.current;
    workflowInvalidationRequest.current = queueWorkflowLifecycle(() =>
      api<void>("/api/clinic/assistant/workflows/context", {
        method: "DELETE",
      }),
    )
      .catch(() => undefined)
      .finally(() => {
        workflowInvalidationRequest.current = null;
      });
    return workflowInvalidationRequest.current;
  }, [queueWorkflowLifecycle]);

  const loadWorkflowCatalog = useCallback(async (current: WorkflowContext) => {
    setWorkflowCatalogBusy(true);
    setWorkflowCatalogError("");
    try {
      const catalog = await api<WorkflowCatalogResult>(
        "/api/clinic/assistant/workflows/catalog?context_id=" +
          encodeURIComponent(current.context_id),
        { timeoutMs: 10_000 },
      );
      if (workflowContextRef.current?.context_id === current.context_id)
        setWorkflowOperations(catalog.operations);
    } catch (error) {
      if (workflowContextRef.current?.context_id === current.context_id)
        setWorkflowCatalogError(errorState(error, "workflows").message);
    } finally {
      if (workflowContextRef.current?.context_id === current.context_id)
        setWorkflowCatalogBusy(false);
    }
  }, []);

  useEffect(() => {
    setConnectionSlow(false);
    if (!workflowContextBusy) return;
    const timer = window.setTimeout(() => setConnectionSlow(true), 4_000);
    return () => window.clearTimeout(timer);
  }, [workflowContextBusy]);

  const bindWorkflowContext = useCallback(
    async (
      body: Record<string, unknown> = {},
      expectedBinding = workflowBindingKey,
    ) => {
      const sequence = ++workflowContextSequence.current;
      workflowActionSequence.current += 1;
      workflowBindingRef.current = expectedBinding;
      setWorkflowContextBusy(true);
      setWorkflowCatalogBusy(false);
      setWorkflowOperations([]);
      setWorkflowCatalogError("");
      setWorkflowContextError("");
      try {
        const { clear_patient: clearPatient, ...extra } = body;
        const replacesPatient =
          clearPatient === true ||
          "patient_selection_id" in extra ||
          "patient_id" in extra;
        const replacesEncounter =
          "encounter_selection_id" in extra || replacesPatient;
        const rebindingCurrentContext = "context_id" in extra;
        const patientId =
          replacesPatient || rebindingCurrentContext
            ? null
            : (route.patientId ?? null);
        const encounterId =
          replacesEncounter || rebindingCurrentContext
            ? null
            : route.patientId
              ? route.encounterId
              : null;
        const payload = {
          ...(patientId ? { patient_id: patientId } : {}),
          ...(encounterId ? { encounter_id: encounterId } : {}),
          ...extra,
        };
        const result = await queueWorkflowLifecycle(async () => {
          if (sequence !== workflowContextSequence.current) return null;
          return api<WorkflowContext>(
            "/api/clinic/assistant/workflows/context",
            { method: "POST", body: payload, timeoutMs: 10_000 },
          );
        });
        if (
          !result ||
          sequence !== workflowContextSequence.current ||
          expectedBinding !== workflowBindingKey
        )
          return;
        workflowContextRef.current = result;
        setWorkflowContext(result);
        setWorkflowContextBusy(false);
        void loadWorkflowCatalog(result);
      } catch (error) {
        if (sequence !== workflowContextSequence.current) return;
        setWorkflowContextError(errorState(error, "workflows").message);
      } finally {
        if (sequence === workflowContextSequence.current)
          setWorkflowContextBusy(false);
      }
    },
    [
      route.encounterId,
      route.patientId,
      queueWorkflowLifecycle,
      loadWorkflowCatalog,
      workflowBindingKey,
    ],
  );

  useEffect(() => {
    if (
      !workflowBindingRef.current ||
      workflowBindingRef.current === workflowBindingKey
    )
      return;
    const hadContext = Boolean(
      workflowContextRef.current?.context_id || workflowContextBusy,
    );
    workflowContextSequence.current += 1;
    workflowActionSequence.current += 1;
    workflowOptionSequence.current = {};
    workflowBindingRef.current = "";
    workflowContextRef.current = null;
    setWorkflowContext(null);
    setWorkflowContextBusy(false);
    setWorkflowCatalogBusy(false);
    setWorkflowCatalogError("");
    setWorkflowOperations([]);
    setWorkflowOperation(null);
    setWorkflowInputs({});
    setWorkflowOptions({});
    setWorkflowOptionsBusy({});
    setWorkflowResult(null);
    setWorkflowProposal(null);
    setWorkflowProposalStatus(null);
    setWorkflowMessages([]);
    setWorkflowDraft("");
    setWorkflowContextError("");
    setWorkflowError("");
    if (hadContext) void invalidateWorkflowServerContext();
  }, [
    workflowBindingKey,
    workflowContextBusy,
    invalidateWorkflowServerContext,
  ]);

  useEffect(() => {
    if (!open || mode !== "workflows" || workflowContextBusy) return;
    if (workflowProposalStatus === "unknown") return;
    if (
      workflowBindingRef.current === workflowBindingKey &&
      workflowContext?.context_id &&
      Date.parse(workflowContext.expires_at) > Date.now()
    )
      return;
    if (
      workflowBindingRef.current === workflowBindingKey &&
      workflowContextError
    )
      return;
    setWorkflowProposal(null);
    setWorkflowProposalStatus(null);
    void bindWorkflowContext({}, workflowBindingKey);
  }, [
    open,
    mode,
    workflowContextBusy,
    workflowContext?.context_id,
    workflowContextError,
    workflowProposalStatus,
    workflowBindingKey,
    bindWorkflowContext,
  ]);

  const searchWorkflowOptions = useCallback(
    async (field: string, query: string, operationKey = "context") => {
      const current = workflowContextRef.current;
      if (!current || query.trim().length < 2) return;
      const key = operationKey + ":" + field;
      const sequence = (workflowOptionSequence.current[key] ?? 0) + 1;
      workflowOptionSequence.current[key] = sequence;
      setWorkflowOptionsBusy((values) => ({ ...values, [key]: true }));
      try {
        const result = await api<WorkflowOptionsResult>(
          "/api/clinic/assistant/workflows/options",
          {
            method: "POST",
            body: {
              context_id: current.context_id,
              operation: operationKey,
              field,
              query: query.slice(0, 100),
              ...(operationKey !== "context" ? { inputs: workflowInputs } : {}),
            },
          },
        );
        if (
          sequence !== workflowOptionSequence.current[key] ||
          workflowContextRef.current?.context_id !== current.context_id
        )
          return;
        setWorkflowOptions((values) => ({ ...values, [key]: result.options }));
      } catch (error) {
        if (
          sequence !== workflowOptionSequence.current[key] ||
          workflowContextRef.current?.context_id !== current.context_id
        )
          return;
        setWorkflowError(errorState(error, "workflows").message);
      } finally {
        if (sequence === workflowOptionSequence.current[key])
          setWorkflowOptionsBusy((values) => ({ ...values, [key]: false }));
      }
    },
    [workflowInputs],
  );

  const selectWorkflowOperation = useCallback(
    (
      operation: WorkflowOperation,
      source: "assistant" | "catalog" = "catalog",
    ) => {
      setWorkflowOperation(operation);
      setSuggestedFields([]);
      setWorkflowSelectionSource(source);
      setWorkflowInputs({});
      setWorkflowOptions({});
      setWorkflowOptionsBusy({});
      workflowOptionSequence.current = {};
      setWorkflowResult(null);
      setWorkflowProposal(null);
      setWorkflowProposalStatus(null);
      setWorkflowError("");
    },
    [],
  );

  const startNewWorkflowTask = useCallback(() => {
    workflowActionSequence.current += 1;
    workflowOptionSequence.current = {};
    setWorkflowOperation(null);
    setWorkflowSelectionSource(null);
    setSuggestedFields([]);
    setDiscardDialogOpen(false);
    setWorkflowInputs({});
    setWorkflowOptions({});
    setWorkflowOptionsBusy({});
    setWorkflowResult(null);
    setWorkflowProposal(null);
    setWorkflowProposalStatus(null);
    setWorkflowError("");
    setWorkflowMessages([]);
    setWorkflowDraft("");
    setBusy("");
    composerRef.current?.focus();
  }, []);

  const requestNewWorkflowTask = () => {
    if (busy || workflowProposalStatus === "unknown") return;
    const hasDraft =
      workflowDraft.trim() ||
      (!workflowResult &&
        (workflowProposal ||
          Object.values(workflowInputs).some(
            (value) =>
              value !== null &&
              value !== "" &&
              (!Array.isArray(value) || value.length > 0),
          ) ||
          workflowMessages.some((message) => message.role === "user")));
    if (hasDraft) setDiscardDialogOpen(true);
    else startNewWorkflowTask();
  };

  const pauseWorkflowDraft = () => {
    if (
      !workflowOperation ||
      workflowProposal ||
      workflowResult ||
      busy ||
      pausedDrafts.length >= 3
    )
      return;
    setPausedDrafts((drafts) => [
      ...drafts,
      {
        id: Date.now(),
        operationKey: workflowOperation.key,
        title: workflowOperation.title,
        inputs: workflowInputs,
        options: workflowOptions,
        messages: workflowMessages,
        message: workflowDraft,
        suggestedFields,
        source: workflowSelectionSource,
      },
    ]);
    startNewWorkflowTask();
  };

  const resumeWorkflowDraft = (saved: PausedWorkflowDraft) => {
    const operation = workflowOperations.find(
      (item) =>
        item.key === saved.operationKey && item.availability === "available",
    );
    if (
      !operation ||
      !workflowContextReady ||
      busy ||
      workflowOperation ||
      workflowDraft.trim() ||
      workflowMessages.length
    )
      return;
    selectWorkflowOperation(operation, saved.source ?? "catalog");
    setWorkflowInputs(saved.inputs);
    setWorkflowOptions(saved.options);
    setWorkflowMessages(saved.messages);
    setWorkflowDraft(saved.message);
    setSuggestedFields(saved.suggestedFields);
    setPausedDrafts((drafts) => drafts.filter((item) => item.id !== saved.id));
  };

  const searchSelectedWorkflowOption = useCallback(
    (field: string, query: string) => {
      if (workflowOperation)
        void searchWorkflowOptions(field, query, workflowOperation.key);
    },
    [searchWorkflowOptions, workflowOperation],
  );

  const runWorkflowOperation = useCallback(
    async (operation: WorkflowOperation, inputs: WorkflowInputs) => {
      const current = workflowContextRef.current;
      if (!current || busy) return;
      const missing = operation.fields.filter(
        (field) =>
          field.required &&
          (inputs[field.key] === null ||
            inputs[field.key] === undefined ||
            inputs[field.key] === ""),
      );
      if (
        (operation.patient_required && !current.patient) ||
        (operation.encounter_required && !current.encounter) ||
        missing.length
      ) {
        setWorkflowOperation(operation);
        setWorkflowInputs(inputs);
        setWorkflowMessages((existing) => [
          ...existing,
          {
            role: "assistant",
            text:
              operation.patient_required && !current.patient
                ? "Select the patient context above before I can run this workflow."
                : operation.encounter_required && !current.encounter
                  ? "Select the encounter context above before I can run this workflow."
                  : "Complete " +
                    missing.map((field) => field.label).join(", ") +
                    " below to continue.",
          },
        ]);
        return;
      }
      const contextId = current.context_id;
      const sequence = ++workflowActionSequence.current;
      setBusy(
        operation.kind === "read" ? "workflow-read" : "workflow-proposal",
      );
      setWorkflowError("");
      setWorkflowResult(null);
      setWorkflowProposal(null);
      setWorkflowProposalStatus(null);
      try {
        if (operation.kind === "read") {
          const result = await api<WorkflowResult>(
            "/api/clinic/assistant/workflows/read",
            {
              method: "POST",
              body: { context_id: contextId, operation: operation.key, inputs },
            },
          );
          if (
            sequence !== workflowActionSequence.current ||
            workflowContextRef.current?.context_id !== contextId
          )
            return;
          if (result.status !== "result" || !Array.isArray(result.sections))
            throw new Error("The clinic did not return a readable result.");
          setWorkflowResult(result);
        } else {
          const result = await api<WorkflowProposal>(
            "/api/clinic/assistant/workflows/proposals",
            {
              method: "POST",
              body: { context_id: contextId, operation: operation.key, inputs },
            },
          );
          if (
            sequence !== workflowActionSequence.current ||
            workflowContextRef.current?.context_id !== contextId
          )
            return;
          if (!result.proposal_id || result.confirmation_required !== true)
            throw new Error("The clinic did not prepare a reviewable change.");
          setWorkflowProposal(result);
          setWorkflowProposalStatus("ready");
        }
      } catch (error) {
        if (
          sequence !== workflowActionSequence.current ||
          workflowContextRef.current?.context_id !== contextId
        )
          return;
        setWorkflowError(errorState(error, "workflows").message);
      } finally {
        if (sequence === workflowActionSequence.current) setBusy("");
      }
    },
    [busy],
  );

  const changeWorkflowBinding = useCallback(
    async (body: Record<string, unknown>) => {
      setWorkflowOperation(null);
      setWorkflowInputs({});
      setWorkflowOptions({});
      setWorkflowOptionsBusy({});
      workflowOptionSequence.current = {};
      setWorkflowResult(null);
      setWorkflowProposal(null);
      setWorkflowProposalStatus(null);
      setWorkflowMessages([]);
      setWorkflowDraft("");
      setWorkflowError("");
      const currentId = workflowContextRef.current?.context_id;
      await bindWorkflowContext(
        { ...(currentId ? { context_id: currentId } : {}), ...body },
        workflowBindingKey,
      );
    },
    [bindWorkflowContext, workflowBindingKey],
  );

  const searchWorkflowContextOption = useCallback(
    (field: "patient" | "encounter", query: string) => {
      void searchWorkflowOptions(field, query, "context");
    },
    [searchWorkflowOptions],
  );

  const selectWorkflowPatient = useCallback(
    (selectionId: string) => {
      void changeWorkflowBinding({ patient_selection_id: selectionId });
    },
    [changeWorkflowBinding],
  );

  const selectWorkflowEncounter = useCallback(
    (selectionId: string) => {
      void changeWorkflowBinding({ encounter_selection_id: selectionId });
    },
    [changeWorkflowBinding],
  );

  const clearWorkflowPatient = useCallback(() => {
    void changeWorkflowBinding({ clear_patient: true });
  }, [changeWorkflowBinding]);

  const sendWorkflowMessage = async (event: FormEvent) => {
    event.preventDefault();
    const current = workflowContextRef.current;
    const text = workflowDraft.trim();
    if (!current || !text || busy) return;
    const continuingOperation =
      workflowOperation && !workflowResult && !workflowProposal
        ? workflowOperation
        : null;
    const contextId = current.context_id;
    const sequence = ++workflowActionSequence.current;
    setWorkflowDraft("");
    setWorkflowMessages((existing) => [...existing, { role: "user", text }]);
    setWorkflowError("");
    setBusy("workflow-message");
    try {
      const response = await api<WorkflowMessageResult>(
        "/api/clinic/assistant/workflows/messages",
        {
          method: "POST",
          body: {
            context_id: contextId,
            message: text,
            ...(continuingOperation
              ? { operation: continuingOperation.key }
              : {}),
          },
          timeoutMs: 45_000,
        },
      );
      if (
        sequence !== workflowActionSequence.current ||
        workflowContextRef.current?.context_id !== contextId
      )
        return;
      const operation = response.operation?.key
        ? workflowOperations.find(
            (item) =>
              item.key === response.operation?.key &&
              (item.availability === "available" ||
                (response.missing_context?.includes("patient") &&
                  item.patient_required) ||
                (response.missing_context?.includes("encounter") &&
                  item.encounter_required)),
          )
        : undefined;
      const missingPatientContext =
        response.missing_context?.includes("patient") === true;
      const missingEncounterContext =
        response.missing_context?.includes("encounter") === true;
      const continuingTask =
        Boolean(operation) && continuingOperation?.key === operation?.key;
      const inputs = operation
        ? {
            ...(continuingTask ? workflowInputs : {}),
            ...suggestedInputs(operation, response.inputs),
          }
        : {};
      const missingFields = operation?.fields.filter((field) => {
        const value = inputs[field.key];
        return (
          field.required &&
          (value === null ||
            value === undefined ||
            value === "" ||
            (Array.isArray(value) && value.length === 0))
        );
      });
      const assistantText = operation
        ? missingPatientContext ||
          (operation.patient_required && !current.patient)
          ? `Select a patient above to continue with ${operation.title}.`
          : missingEncounterContext ||
              (operation.encounter_required && !current.encounter)
            ? `Select an encounter above to continue with ${operation.title}.`
            : missingFields?.length
              ? `I’ve filled in what I can. Add ${missingFields.map((field) => field.label.toLowerCase()).join(", ")} below.`
              : operation.kind === "read"
                ? `Looking up ${operation.title.toLowerCase()}…`
                : "I’ll prepare " +
                  operation.title +
                  " for review. Nothing is saved until you confirm."
        : response.operation
          ? "I couldn’t match that suggestion to an available workflow. Choose a task from the catalogue."
          : response.status === "clarify"
            ? response.message ||
              response.clarification ||
              "Add a little more detail so I can help."
            : "Choose a workflow or add details so I can help.";
      if (response.status !== "handoff")
        setWorkflowMessages((existing) => [
          ...existing,
          { role: "assistant", text: assistantText },
        ]);
      if (response.status === "handoff") {
        setWorkflowMessages((existing) => [
          ...existing,
          {
            role: "assistant",
            text:
              response.message || "Continue this task in the clinic workspace.",
            sourcePath: internalWorkflowPath(response.source_path),
          },
        ]);
        return;
      }
      if (response.operation && !operation) {
        setWorkflowError(
          "The suggested workflow is not available in this clinic context. Choose an available task from the catalogue.",
        );
        return;
      }
      if (operation) {
        // Preserve named selections and their labels while completing this draft.
        if (!continuingTask) selectWorkflowOperation(operation, "assistant");
        setWorkflowInputs(inputs);
        const filledKeys = Object.keys(
          suggestedInputs(operation, response.inputs),
        );
        setSuggestedFields((previous) => [
          ...new Set([...(continuingTask ? previous : []), ...filledKeys]),
        ]);
        if (
          missingPatientContext ||
          missingEncounterContext ||
          (operation.patient_required && !current.patient) ||
          (operation.encounter_required && !current.encounter)
        )
          return;
        await runWorkflowOperation(operation, inputs);
      }
    } catch (error) {
      if (
        sequence !== workflowActionSequence.current ||
        workflowContextRef.current?.context_id !== contextId
      )
        return;
      const failure = errorState(error, "workflows");
      setWorkflowError(failure.message);
      setWorkflowDraft((currentDraft) => currentDraft || text);
      setWorkflowMessages((existing) => [
        ...existing,
        { role: "assistant", text: failure.message },
      ]);
    } finally {
      if (sequence === workflowActionSequence.current) setBusy("");
    }
  };

  const loadWorkflowProposal = async () => {
    const current = workflowContextRef.current;
    const proposal = workflowProposal;
    if (!current || !proposal || busy) return;
    const contextId = current.context_id;
    const sequence = ++workflowActionSequence.current;
    setBusy("workflow-readback");
    try {
      const result = await api<WorkflowProposalReadback>(
        "/api/clinic/assistant/workflows/proposals/" +
          encodeURIComponent(proposal.proposal_id) +
          "?context_id=" +
          encodeURIComponent(contextId),
      );
      if (
        sequence !== workflowActionSequence.current ||
        workflowContextRef.current?.context_id !== contextId
      )
        return;
      if (isWorkflowResult(result)) {
        setWorkflowProposal(null);
        setWorkflowProposalStatus(null);
        setWorkflowResult(result);
        setWorkflowError("");
      } else {
        setWorkflowProposal(result as WorkflowProposal);
        const status = (result as WorkflowProposal).status;
        setWorkflowProposalStatus(
          status === "expired"
            ? "expired"
            : status === "denied"
              ? "denied"
              : status === "stale" || status === "conflicted"
                ? "stale"
                : status === "pending" || status === "proposal"
                  ? "ready"
                  : "unknown",
        );
        setWorkflowError(
          status === "pending" || status === "proposal"
            ? ""
            : status === "expired"
              ? "This proposal expired. Prepare a new review."
              : status === "denied"
                ? "Your current role cannot confirm this change."
                : status === "stale" || status === "conflicted"
                  ? "The record changed before confirmation. Prepare a new review."
                  : "The clinic has not confirmed the saved result yet.",
        );
      }
    } catch (error) {
      if (
        sequence !== workflowActionSequence.current ||
        workflowContextRef.current?.context_id !== contextId
      )
        return;
      setWorkflowProposalStatus("unknown");
      setWorkflowError(
        "The saved outcome is still unknown. Do not confirm again until the clinic result is checked. " +
          errorState(error, "workflows").message,
      );
    } finally {
      if (sequence === workflowActionSequence.current) setBusy("");
    }
  };

  const confirmWorkflowProposal = async () => {
    const current = workflowContextRef.current;
    const proposal = workflowProposal;
    if (
      !current ||
      !proposal ||
      busy ||
      workflowProposalExpired ||
      workflowProposalStatus !== "ready"
    )
      return;
    const contextId = current.context_id;
    const sequence = ++workflowActionSequence.current;
    setBusy("workflow-confirm");
    setWorkflowError("");
    try {
      const result = await api<WorkflowProposalReadback>(
        "/api/clinic/assistant/workflows/proposals/" +
          encodeURIComponent(proposal.proposal_id) +
          "/confirm",
        { method: "POST", body: { context_id: contextId } },
      );
      if (
        sequence !== workflowActionSequence.current ||
        workflowContextRef.current?.context_id !== contextId
      )
        return;
      if (isWorkflowResult(result)) {
        setWorkflowResult(result);
        setWorkflowProposal(null);
        setWorkflowProposalStatus(null);
      } else {
        setWorkflowProposalStatus("unknown");
        setWorkflowError(
          "The confirmation response did not include the persisted result. Check the clinic record before trying again.",
        );
      }
    } catch (error) {
      if (
        sequence !== workflowActionSequence.current ||
        workflowContextRef.current?.context_id !== contextId
      )
        return;
      if (error instanceof ApiError && error.status === 403) {
        setWorkflowProposalStatus("denied");
        setWorkflowError("Your current role cannot confirm this change.");
      } else if (
        error instanceof ApiError &&
        (error.status === 410 || error.code === "proposal_expired")
      ) {
        setWorkflowProposalStatus("expired");
        setWorkflowError("This proposal expired. Prepare a new review.");
      } else if (error instanceof ApiError && error.status === 409) {
        setWorkflowProposalStatus("stale");
        setWorkflowError(
          "The record changed before confirmation. Check its status.",
        );
      } else {
        setWorkflowProposalStatus("unknown");
        setWorkflowError(
          "The confirmation outcome is unknown. Check the saved result before trying again.",
        );
      }
    } finally {
      if (sequence === workflowActionSequence.current) setBusy("");
    }
  };

  useEffect(() => {
    if (scopeRef.current === scopeKey) return;
    scopeRef.current = scopeKey;
    const hadAssistantContext = Boolean(
      context?.context_id || attemptedBinding.current,
    );
    contextSequence.current += 1;
    actionSequence.current += 1;
    activeContext.current = null;
    setContext(null);
    setContextError("");
    setProposal(null);
    setProposalState(null);
    setOpenings([]);
    setSelectedPatient(null);
    setMessages([]);
    setDraft("");
    setVisitTypeId("");
    setClinicianId("");
    setActionError(null);
    attemptedBinding.current = "";
    if (hadAssistantContext && !invalidatingContext.current) {
      void invalidateServerContext().finally(() => {
        if (open && mode === "booking" && route.patientId)
          void bindContext(route.patientId, route.encounterId);
      });
    }
  }, [
    scopeKey,
    context?.context_id,
    route.patientId,
    route.encounterId,
    open,
    mode,
  ]);

  const rebindAfterContextConflict = (error: unknown) => {
    if (!(error instanceof ApiError) || error.code !== "stale_context") return;
    actionSequence.current += 1;
    contextSequence.current += 1;
    activeContext.current = null;
    setContext(null);
    setProposal(null);
    setProposalState(null);
    setOpenings([]);
    attemptedBinding.current = "";
    setMessages([]);
    setDraft("");
    if (targetPatientId) void bindContext(targetPatientId, targetEncounterId);
    else void invalidateServerContext();
  };

  useEffect(() => {
    if (
      !open ||
      mode !== "booking" ||
      invalidatingContext.current ||
      !targetPatientId ||
      contextBusy
    )
      return;
    const expected = `${scopeKey}:${targetPatientId}:${targetEncounterId ?? "none"}`;
    if (attemptedBinding.current === expected && context?.context_id) return;
    if (attemptedBinding.current === expected && contextError) return;
    void bindContext(targetPatientId, targetEncounterId);
  }, [
    open,
    mode,
    targetPatientId,
    targetEncounterId,
    scopeKey,
    contextBusy,
    context?.context_id,
    contextError,
  ]);

  useEffect(() => {
    const query = patientQuery.trim();
    const sequence = ++querySequence.current;
    if (!open || query.length < 2) {
      setPatientOptions([]);
      setPatientBusy(false);
      setPatientError("");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPatientBusy(true);
      setPatientError("");
      try {
        const result = await api<LookupResult>(
          `/api/clinic/patients/lookup?q=${encodeURIComponent(query.slice(0, 100))}&page=1`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted || sequence !== querySequence.current)
          return;
        setPatientOptions(result.patients);
      } catch (error) {
        if (controller.signal.aborted || sequence !== querySequence.current)
          return;
        setPatientError(errorState(error).message);
      } finally {
        if (!controller.signal.aborted && sequence === querySequence.current)
          setPatientBusy(false);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, patientQuery]);

  useEffect(() => {
    if (!proposal && !workflowProposal) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [proposal, workflowProposal]);

  const bindSelectedPatient = (patient: PatientSelection | null) => {
    setSelectedPatient(patient);
    setPatientQuery("");
    setPatientError("");
    setMessages([]);
    setDraft("");
    setProposal(null);
    setProposalState(null);
    setOpenings([]);
    setActionError(null);
    attemptedBinding.current = "";
    if (patient) void bindContext(patient.id, null);
    else {
      const hadAssistantContext = Boolean(
        activeContext.current?.context_id || attemptedBinding.current,
      );
      contextSequence.current += 1;
      actionSequence.current += 1;
      activeContext.current = null;
      setContext(null);
      setContextError("");
      setVisitTypeId("");
      setClinicianId("");
      if (hadAssistantContext) void invalidateServerContext();
    }
  };

  const selectOpening = async (opening: AssistantOpening) => {
    const current = activeContext.current;
    if (!current || busy || expired) return;
    const contextId = current.context_id;
    const sequence = ++actionSequence.current;
    setBusy("proposal");
    setActionError(null);
    setProposal(null);
    setProposalState(null);
    try {
      const result = await api<ProposalResult>(
        "/api/clinic/assistant/proposals",
        {
          method: "POST",
          body: {
            context_id: current.context_id,
            opening_id: opening.opening_id,
          },
        },
      );
      if (
        sequence !== actionSequence.current ||
        activeContext.current?.context_id !== contextId
      )
        return;
      setProposal(result);
      setProposalState("ready");
      setOpenings([]);
    } catch (error) {
      if (
        sequence !== actionSequence.current ||
        activeContext.current?.context_id !== contextId
      )
        return;
      const state = errorState(error);
      setActionError(state);
      if (state.kind === "warning") setOpenings([]);
      rebindAfterContextConflict(error);
    } finally {
      if (sequence === actionSequence.current) setBusy("");
    }
  };

  const findOpeningsDirectly = async () => {
    const current = activeContext.current;
    if (!current || !visitTypeId || !clinicianId || !date || busy) return;
    const contextId = current.context_id;
    const sequence = ++actionSequence.current;
    setBusy("openings");
    setActionError(null);
    setProposal(null);
    setProposalState(null);
    setOpenings([]);
    try {
      const result = await api<OpeningsResult>(
        "/api/clinic/assistant/openings",
        {
          method: "POST",
          body: {
            context_id: current.context_id,
            visit_type_selection_id: visitTypeId,
            clinician_selection_id: clinicianId,
            date,
          },
        },
      );
      if (
        sequence !== actionSequence.current ||
        activeContext.current?.context_id !== contextId
      )
        return;
      setOpenings(result.openings);
      if (result.timezone) setResponseTimezone(result.timezone);
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          role: "assistant",
          text: result.openings.length
            ? `The clinic returned ${result.openings.length} opening${result.openings.length === 1 ? "" : "s"}. Choose one to review it before booking.`
            : "No openings were returned for those selections. Choose another date or clinician and search again.",
        },
      ]);
    } catch (error) {
      if (
        sequence !== actionSequence.current ||
        activeContext.current?.context_id !== contextId
      )
        return;
      setActionError(errorState(error));
      rebindAfterContextConflict(error);
    } finally {
      if (sequence === actionSequence.current) setBusy("");
    }
  };

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    const current = activeContext.current;
    const text = draft.trim();
    if (!current || !visitTypeId || !clinicianId || !text || busy) return;
    setDraft("");
    setMessages((existing) => [...existing, { role: "user", text }]);
    setOpenings([]);
    setProposal(null);
    setProposalState(null);
    setActionError(null);
    setBusy("message");
    const sequence = ++actionSequence.current;
    const contextId = current.context_id;
    try {
      const result = await api<MessageResult>(
        "/api/clinic/assistant/messages",
        {
          method: "POST",
          body: {
            context_id: current.context_id,
            message: text,
            visit_type_selection_id: visitTypeId,
            clinician_selection_id: clinicianId,
            ...(date ? { date } : {}),
          },
          timeoutMs: 45_000,
        },
      );
      if (
        sequence !== actionSequence.current ||
        activeContext.current?.context_id !== contextId
      )
        return;
      if (result.status === "clarify") {
        setMessages((existing) => [
          ...existing,
          { role: "assistant", text: result.message },
        ]);
      } else {
        if (result.timezone) setResponseTimezone(result.timezone);
        const reply =
          result.message ||
          (result.openings.length
            ? `I found ${result.openings.length} available appointment option${result.openings.length === 1 ? "" : "s"}. Choose one to review it before booking.`
            : "No openings matched those details. Try another date or ask for a different time.");
        setMessages((existing) => [
          ...existing,
          { role: "assistant", text: reply },
        ]);
        setOpenings(result.openings);
        if (result.intent.date) setDate(result.intent.date);
      }
    } catch (error) {
      if (
        sequence !== actionSequence.current ||
        activeContext.current?.context_id !== contextId
      )
        return;
      setActionError(errorState(error));
      const state = errorState(error);
      if (state.kind === "quota" || state.kind === "unavailable")
        setMessages((existing) => [
          ...existing,
          { role: "assistant", text: state.message },
        ]);
      rebindAfterContextConflict(error);
    } finally {
      if (
        sequence === actionSequence.current &&
        activeContext.current?.context_id === contextId
      )
        setBusy("");
    }
  };

  const loadProposal = async (proposalId: string) => {
    const contextId = activeContext.current?.context_id;
    if (!contextId) return;
    const sequence = ++actionSequence.current;
    setBusy("readback");
    setActionError(null);
    try {
      const result = await api<ProposalResult>(
        `/api/clinic/assistant/proposals/${encodeURIComponent(proposalId)}`,
      );
      if (
        sequence !== actionSequence.current ||
        activeContext.current?.context_id !== contextId
      )
        return;
      const persisted = {
        ...result,
        proposal_id: result.proposal_id || proposalId,
      };
      setProposal(persisted);
      const state = result.state || result.status;
      if (state === "confirmed" || (result.appointment && result.receipt_id)) {
        setProposal({ ...persisted, state: "confirmed" });
        setProposalState("ready");
      } else if (state === "expired") setProposalState("expired");
      else if (
        state === "conflicted" ||
        state === "invalidated" ||
        state === "stale"
      )
        setProposalState("stale");
      else if (state === "denied") setProposalState("denied");
      else if (state === "pending") setProposalState("ready");
      else setProposalState("unknown");
    } catch (error) {
      if (
        sequence !== actionSequence.current ||
        activeContext.current?.context_id !== contextId
      )
        return;
      setActionError(errorState(error));
      if (error instanceof ApiError && error.status === 403)
        setProposalState("denied");
      rebindAfterContextConflict(error);
    } finally {
      if (sequence === actionSequence.current) setBusy("");
    }
  };

  const confirmProposal = async () => {
    const current = activeContext.current;
    if (!current || !proposal || busy || expired || proposalState !== "ready")
      return;
    const contextId = current.context_id;
    const sequence = ++actionSequence.current;
    setBusy("confirm");
    setActionError(null);
    try {
      const result = await api<ProposalResult>(
        `/api/clinic/assistant/proposals/${encodeURIComponent(proposal.proposal_id)}/confirm`,
        {
          method: "POST",
          body: { context_id: activeContext.current?.context_id },
        },
      );
      if (
        sequence !== actionSequence.current ||
        activeContext.current?.context_id !== contextId
      )
        return;
      const resultState = result.state || result.status;
      const confirmed =
        resultState === "confirmed" ||
        Boolean(result.appointment && result.receipt_id);
      const acceptedResult = confirmed
        ? {
            ...result,
            proposal_id: result.proposal_id || proposal.proposal_id,
            expires_at: result.expires_at || proposal.expires_at,
            state: "confirmed",
          }
        : {
            ...result,
            proposal_id: result.proposal_id || proposal.proposal_id,
            expires_at: result.expires_at || proposal.expires_at,
          };
      setProposal(acceptedResult);
      if (
        acceptedResult.state === "expired" ||
        acceptedResult.status === "expired"
      )
        setProposalState("expired");
      else if (
        acceptedResult.state === "stale" ||
        acceptedResult.status === "stale"
      )
        setProposalState("stale");
      else if (
        acceptedResult.state === "denied" ||
        acceptedResult.status === "denied"
      )
        setProposalState("denied");
      else setProposalState("ready");
      setOpenings([]);
      setMessages((existing) => [
        ...existing,
        {
          role: "assistant",
          text:
            acceptedResult.appointment && acceptedResult.receipt_id
              ? "The appointment is saved. I checked the persisted appointment and its audit receipt below."
              : "The confirmation response was received. Check the persisted appointment details below before continuing.",
        },
      ]);
    } catch (error) {
      if (
        sequence !== actionSequence.current ||
        activeContext.current?.context_id !== contextId
      )
        return;
      const failure = errorState(error);
      setActionError(failure);
      rebindAfterContextConflict(error);
      if (error instanceof ApiError && error.code === "stale_context") {
        setProposal(null);
        setProposalState(null);
      } else if (
        error instanceof ApiError &&
        (error.status === 410 || error.code === "proposal_expired")
      ) {
        setProposalState("expired");
      } else if (error instanceof ApiError && error.status === 403) {
        setProposalState("denied");
      } else if (error instanceof ApiError && error.status === 409) {
        setProposalState(
          error.code === "proposal_expired" ? "expired" : "stale",
        );
        await loadProposal(proposal.proposal_id);
      } else {
        setProposalState("unknown");
        await loadProposal(proposal.proposal_id);
      }
    } finally {
      if (sequence === actionSequence.current) setBusy("");
    }
  };

  const appointment = proposal?.appointment ?? proposal?.appointment_preview;
  const displayTimezone =
    responseTimezone || context?.practice.timezone || timezone;
  const contextPatientLabel =
    context?.patient?.name ||
    selectedPatient?.display_name ||
    (targetPatientId ? "Loading selected patient" : "Choose a patient");
  const visibleError = contextError
    ? { kind: "warning", message: contextError }
    : requestError;
  const contextReady = Boolean(currentBinding && context && !contextBusy);
  const selectedVisitType = useMemo(
    () =>
      context?.visit_types.find((item) => item.selection_id === visitTypeId),
    [context?.visit_types, visitTypeId],
  );

  const closeAssistant = () => {
    // Hiding the panel does not change identity or invalidate an unfinished task.
    // Scope/route effects and backend checks still enforce context changes.
    setOpen(false);
  };

  const suggestedWorkflows = workflowOperations
    .filter(
      (operation) =>
        operation.availability === "available" &&
        operation.kind !== "gated" &&
        (!operation.patient_required || workflowContext?.patient) &&
        (!operation.encounter_required || workflowContext?.encounter),
    )
    .sort((a, b) => {
      const score = (operation: WorkflowOperation) =>
        (favorites.includes(operation.key) ? 8 : 0) +
        (workflowContext?.encounter && operation.encounter_required ? 4 : 0) +
        (workflowContext?.patient && operation.patient_required ? 2 : 0) +
        (operation.kind === "read" ? 1 : 0);
      return score(b) - score(a) || a.title.localeCompare(b.title);
    })
    .slice(0, 3);
  const workflowReviewLocked = Boolean(workflowProposal);
  const workflowProgress = (
    {
      "workflow-message":
        "Interpreting your request and matching a clinic task…",
      "workflow-read": "Fetching current information from the clinic…",
      "workflow-proposal": "Preparing the exact change for your review…",
      "workflow-confirm": "Saving your confirmed change…",
      "workflow-readback": "Checking the saved result and receipt…",
    } as Record<string, string>
  )[busy];

  return (
    <>
      <Tooltip describeChild title="Open assistant" placement="right">
        <Button
          className="clinic-assistant-entry"
          aria-label="Open assistant"
          aria-haspopup="dialog"
          aria-expanded={open}
          startIcon={<ChatBubbleOutlineRoundedIcon aria-hidden="true" />}
          onClick={() => setOpen(true)}
          fullWidth
        >
          <span>Assistant</span>
        </Button>
      </Tooltip>
      <Drawer
        anchor="right"
        open={open}
        onClose={closeAssistant}
        ModalProps={{ keepMounted: true }}
        slotProps={{
          paper: {
            role: "dialog",
            "aria-modal": true,
            "aria-labelledby": "clinic-assistant-title",
          },
        }}
        sx={{
          "& .MuiDrawer-paper": {
            width: expandedPanel
              ? { xs: "100%", sm: "min(880px, 100vw)" }
              : { xs: "100%", sm: 480, md: 560 },
            maxWidth: "100vw",
          },
        }}
      >
        <Box className="clinic-assistant">
          <Stack
            className="clinic-assistant__header"
            direction="row"
            spacing={1.5}
            sx={{ alignItems: "center", justifyContent: "space-between" }}
          >
            <Box>
              <Typography
                id="clinic-assistant-title"
                component="h2"
                variant="h6"
              >
                Clinic assistant
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {mode === "booking"
                  ? "Find a time. Review the booking."
                  : "Find information. Get work ready."}
              </Typography>
            </Box>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
              <Tooltip
                title={expandedPanel ? "Use compact panel" : "Expand panel"}
              >
                <IconButton
                  aria-label={
                    expandedPanel ? "Use compact panel" : "Expand panel"
                  }
                  aria-pressed={expandedPanel}
                  onClick={() => setExpandedPanel((value) => !value)}
                  sx={{ display: { xs: "none", sm: "inline-flex" } }}
                >
                  {expandedPanel ? (
                    <CloseFullscreenRoundedIcon />
                  ) : (
                    <OpenInFullRoundedIcon />
                  )}
                </IconButton>
              </Tooltip>
              {mode === "workflows" &&
                (workflowOperation ||
                  workflowMessages.length > 0 ||
                  workflowDraft.trim()) && (
                  <Tooltip title="Start a new task">
                    <IconButton
                      aria-label="Start a new task"
                      disabled={
                        busy !== "" || workflowProposalStatus === "unknown"
                      }
                      onClick={requestNewWorkflowTask}
                    >
                      <AddRoundedIcon />
                    </IconButton>
                  </Tooltip>
                )}
              <Button
                size="small"
                data-demo-tour-control="true"
                onClick={() =>
                  window.open(
                    "/tutorials/assistant/",
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
              >
                Help
              </Button>
              <Tooltip title="Close assistant">
                <IconButton
                  aria-label="Close assistant"
                  onClick={closeAssistant}
                >
                  <CloseRoundedIcon />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>
          <Divider />
          <Tabs
            value={mode}
            onChange={(_, value: WorkflowMode) => setMode(value)}
            variant="fullWidth"
            aria-label="Assistant mode"
          >
            <Tab
              value="workflows"
              label="Ask assistant"
              id="assistant-tab-workflows"
              aria-controls="assistant-panel-workflows"
            />
            <Tab
              value="booking"
              label="Book an appointment"
              id="assistant-tab-booking"
              aria-controls="assistant-panel-booking"
            />
          </Tabs>
          <Divider />
          <Box className="clinic-assistant__context">
            <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
              {mode === "workflows"
                ? workflowContext?.practice.name || practiceName
                : practiceName}
              {" · "}
              {mode === "workflows"
                ? workflowContext?.site?.name ||
                  siteName ||
                  "Location not selected"
                : siteName || "Location not selected"}
            </Typography>
            {mode === "booking" && (
              <Typography variant="caption" color="text.secondary" noWrap>
                Patient: {contextPatientLabel}
                {context?.encounter ? " · Current encounter" : ""}
              </Typography>
            )}
            {mode === "workflows" && (
              <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
                {workflowContextReady
                  ? workflowContext?.patient
                    ? `Patient: ${workflowContext.patient.name}`
                    : "No patient selected"
                  : "Updating clinic context…"}
                {workflowContextReady && workflowContext?.encounter && (
                  <>
                    {" "}
                    · Visit:{" "}
                    {workflowContext.encounter.label || "Selected visit"}
                  </>
                )}
              </Typography>
            )}
          </Box>
          {mode === "workflows" && workflowProgress && (
            <Box
              className="clinic-assistant__progress"
              role="status"
              aria-live="polite"
            >
              <Typography variant="body2">{workflowProgress}</Typography>
              <LinearProgress aria-label={workflowProgress} />
            </Box>
          )}
          <Divider />
          <Box
            className="clinic-assistant__body"
            ref={bodyRef}
            onScroll={(event) => {
              readingPositions.current[mode] = event.currentTarget.scrollTop;
            }}
            role="tabpanel"
            id={`assistant-panel-${mode}`}
            aria-labelledby={`assistant-tab-${mode}`}
          >
            {mode === "workflows" ? (
              <>
                {workflowContextBusy && (
                  <Box role="status" className="clinic-assistant__connection">
                    <LinearProgress aria-label="Connecting to clinic" />
                    <Typography variant="caption" color="text.secondary">
                      {connectionSlow
                        ? "The clinic is taking longer to respond. You can keep writing below."
                        : "Connecting to your clinic…"}
                    </Typography>
                  </Box>
                )}
                {workflowMessages.length === 0 && !workflowOperation && (
                  <Stack spacing={2.5} className="clinic-assistant__welcome">
                    <Box>
                      <Typography
                        component="h3"
                        variant="h5"
                        sx={{ fontWeight: 600 }}
                      >
                        What would you like to get done?
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 1 }}
                      >
                        Describe a task in your own words, or choose a starting
                        point.
                      </Typography>
                    </Box>
                    <Stack spacing={1} className="clinic-assistant__starters">
                      <Button
                        variant="outlined"
                        size="large"
                        onClick={() => setMode("booking")}
                        startIcon={<EventAvailableOutlinedIcon />}
                      >
                        Find an appointment
                      </Button>
                      {suggestedWorkflows.map((operation) => (
                        <Button
                          key={operation.key}
                          variant="outlined"
                          disabled={busy !== "" || !workflowContextReady}
                          onClick={() => selectWorkflowOperation(operation)}
                        >
                          {operation.title}
                        </Button>
                      ))}
                    </Stack>
                  </Stack>
                )}
                {!workflowOperation && pausedDrafts.length > 0 && (
                  <Stack spacing={1}>
                    <Typography component="h3" variant="subtitle1">
                      Saved drafts for this context
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Resume while this clinic context is active. Drafts clear
                      when the patient, visit, or account changes.
                    </Typography>
                    {pausedDrafts.map((saved) => (
                      <Stack
                        key={saved.id}
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: "center" }}
                      >
                        <Typography
                          variant="body2"
                          sx={{
                            flex: 1,
                            minWidth: 0,
                            overflowWrap: "anywhere",
                          }}
                        >
                          {saved.title}
                        </Typography>
                        <Button
                          disabled={
                            !workflowContextReady ||
                            Boolean(
                              busy ||
                              workflowDraft.trim() ||
                              workflowMessages.length,
                            ) ||
                            !workflowOperations.some(
                              (item) =>
                                item.key === saved.operationKey &&
                                item.availability === "available",
                            )
                          }
                          onClick={() => resumeWorkflowDraft(saved)}
                        >
                          Resume
                        </Button>
                        <Button
                          aria-label={`Discard saved draft: ${saved.title}`}
                          onClick={() =>
                            setPausedDrafts((drafts) =>
                              drafts.filter((item) => item.id !== saved.id),
                            )
                          }
                        >
                          Discard
                        </Button>
                      </Stack>
                    ))}
                  </Stack>
                )}
                {workflowContextError && (
                  <Alert
                    severity="warning"
                    action={
                      <Button
                        color="inherit"
                        size="small"
                        onClick={() => {
                          workflowBindingRef.current = "";
                          void bindWorkflowContext({}, workflowBindingKey);
                        }}
                      >
                        Retry
                      </Button>
                    }
                  >
                    {workflowContextError}
                  </Alert>
                )}
                {workflowContextReady && workflowContext && (
                  <WorkflowContextPicker
                    context={workflowContext}
                    patientOptions={workflowOptions["context:patient"] ?? []}
                    encounterOptions={
                      workflowOptions["context:encounter"] ?? []
                    }
                    disabled={
                      busy !== "" || workflowContextBusy || workflowReviewLocked
                    }
                    needsPatient={Boolean(workflowOperation?.patient_required)}
                    needsEncounter={Boolean(
                      workflowOperation?.encounter_required,
                    )}
                    onSearch={searchWorkflowContextOption}
                    onSelectPatient={selectWorkflowPatient}
                    onSelectEncounter={selectWorkflowEncounter}
                    onClearPatient={clearWorkflowPatient}
                  />
                )}
                {workflowMessages.length > 0 && (
                  <Box
                    className="clinic-assistant__conversation"
                    role="log"
                    aria-label="Assistant conversation"
                    aria-live="polite"
                    aria-relevant="additions text"
                  >
                    {workflowMessages.map((message, index) => (
                      <Paper
                        key={"workflow-" + index + "-" + message.role}
                        variant="outlined"
                        className={
                          "clinic-assistant__message clinic-assistant__message--" +
                          message.role
                        }
                      >
                        <Typography variant="caption" color="text.secondary">
                          {message.role === "user" ? "You" : "Assistant"}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            whiteSpace: "pre-wrap",
                            overflowWrap: "anywhere",
                          }}
                        >
                          {message.text}
                        </Typography>
                        {message.sourcePath && (
                          <Link href={message.sourcePath} underline="hover">
                            Open clinic workflow
                          </Link>
                        )}
                      </Paper>
                    ))}
                    <Box ref={conversationEndRef} />
                  </Box>
                )}
                {workflowError && !workflowProposal && (
                  <Alert
                    severity="warning"
                    action={
                      <Button
                        color="inherit"
                        disabled={busy !== ""}
                        onClick={() => {
                          setWorkflowError("");
                          const control =
                            workflowFormRef.current?.querySelector<HTMLElement>(
                              'input:not([aria-hidden="true"]), textarea, [role="combobox"]',
                            );
                          (control ?? composerRef.current)?.focus();
                        }}
                      >
                        Return to details
                      </Button>
                    }
                  >
                    {workflowError} Your entered details are kept.
                  </Alert>
                )}
                {workflowOperation && (
                  <Stack
                    direction="row"
                    spacing={1}
                    className="clinic-assistant__task-status"
                    sx={{ alignItems: "center", flexWrap: "wrap" }}
                  >
                    <Chip
                      size="small"
                      variant="outlined"
                      label={
                        workflowProposal
                          ? "Review change"
                          : workflowResult
                            ? workflowResult.status === "receipt"
                              ? "Saved"
                              : "Results"
                            : "Complete details"
                      }
                    />
                    <Typography
                      variant="body2"
                      sx={{ flex: 1, fontWeight: 600 }}
                    >
                      {workflowOperation.title}
                    </Typography>
                    {(workflowProposal || workflowResult) && (
                      <Button
                        size="small"
                        disabled={
                          busy !== "" ||
                          workflowProposalStatus === "unknown" ||
                          workflowProposalStatus === "denied" ||
                          workflowResult?.status === "receipt"
                        }
                        startIcon={<EditOutlinedIcon />}
                        onClick={() => {
                          setWorkflowProposal(null);
                          setWorkflowProposalStatus(null);
                          setWorkflowResult(null);
                          setWorkflowError("");
                        }}
                      >
                        Edit details
                      </Button>
                    )}
                    {!workflowProposal && !workflowResult && (
                      <Button
                        size="small"
                        disabled={busy !== "" || pausedDrafts.length >= 3}
                        onClick={pauseWorkflowDraft}
                      >
                        Save for later
                      </Button>
                    )}
                  </Stack>
                )}
                {workflowOperation && !workflowProposal && !workflowResult && (
                  <Paper
                    ref={workflowFormRef}
                    variant="outlined"
                    className="clinic-assistant__workflow-form"
                  >
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <Typography component="h3" variant="subtitle1">
                        Task details
                      </Typography>
                    </Stack>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {workflowSelectionSource === "assistant"
                          ? "Suggested for your request"
                          : "Selected clinic task"}
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 0.5 }}
                      >
                        {workflowOperation.description}
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 0.5 }}
                      >
                        {workflowOperation.kind === "read"
                          ? "This task reads clinic information."
                          : "This task prepares a change for you to review before saving."}
                      </Typography>
                    </Box>
                    {workflowOperation.patient_required &&
                      !workflowContext?.patient && (
                        <Alert severity="info">
                          Choose a patient above to continue.
                        </Alert>
                      )}
                    {workflowOperation.encounter_required &&
                      !workflowContext?.encounter && (
                        <Alert severity="info">
                          Choose an encounter above to continue.
                        </Alert>
                      )}
                    <WorkflowForm
                      suggestedFields={suggestedFields}
                      operation={workflowOperation}
                      values={workflowInputs}
                      optionsByField={Object.fromEntries(
                        workflowOperation.fields.map((field) => [
                          field.key,
                          workflowOptions[
                            workflowOperation.key + ":" + field.key
                          ] ?? [],
                        ]),
                      )}
                      loadingOptions={Object.fromEntries(
                        workflowOperation.fields.map((field) => [
                          field.key,
                          workflowOptionsBusy[
                            workflowOperation.key + ":" + field.key
                          ] === true,
                        ]),
                      )}
                      disabled={!workflowContextReady || busy !== ""}
                      onChange={(key, value) => {
                        setSuggestedFields((fields) =>
                          fields.filter((field) => field !== key),
                        );
                        setWorkflowInputs((values) => ({
                          ...values,
                          [key]: value,
                        }));
                      }}
                      onSearchOption={searchSelectedWorkflowOption}
                      onSubmit={() =>
                        void runWorkflowOperation(
                          workflowOperation,
                          workflowInputs,
                        )
                      }
                    />
                  </Paper>
                )}
                {workflowProposal && (
                  <Box ref={workflowReviewRef}>
                    <WorkflowProposalReview
                      now={now}
                      suggestedLabels={
                        workflowOperation?.fields
                          .filter((field) =>
                            suggestedFields.includes(field.key),
                          )
                          .map((field) => field.label) ?? []
                      }
                      proposal={workflowProposal}
                      expired={
                        workflowProposalExpired ||
                        workflowProposalStatus === "expired"
                      }
                      busy={busy !== ""}
                      error={
                        workflowError ||
                        (workflowProposalStatus === "denied"
                          ? "Your current role cannot confirm this change."
                          : workflowProposalStatus === "stale"
                            ? "This proposal is stale."
                            : workflowProposalStatus === "unknown"
                              ? "The confirmation outcome is unknown."
                              : "")
                      }
                      onConfirm={() => void confirmWorkflowProposal()}
                      onReadback={() => void loadWorkflowProposal()}
                    />
                  </Box>
                )}
                {workflowResult && (
                  <Box ref={workflowResultRef}>
                    <WorkflowResultView result={workflowResult} />
                    <Button
                      sx={{ mt: 2 }}
                      startIcon={<AddRoundedIcon />}
                      onClick={requestNewWorkflowTask}
                      disabled={busy !== ""}
                    >
                      Start another task
                    </Button>
                  </Box>
                )}
                {workflowContextReady && workflowCatalogError && (
                  <Alert
                    severity="warning"
                    action={
                      <Button
                        color="inherit"
                        size="small"
                        onClick={() =>
                          workflowContext &&
                          void loadWorkflowCatalog(workflowContext)
                        }
                      >
                        Retry
                      </Button>
                    }
                  >
                    Couldn’t load available tasks. {workflowCatalogError}
                  </Alert>
                )}
                {workflowContextReady && !workflowOperation && (
                  <WorkflowCatalog
                    favorites={favorites}
                    onToggleFavorite={(key) =>
                      setFavorites((keys) =>
                        keys.includes(key)
                          ? keys.filter((item) => item !== key)
                          : [...keys, key],
                      )
                    }
                    operations={workflowOperations}
                    selectedKey=""
                    disabled={busy !== ""}
                    loading={workflowCatalogBusy}
                    hasPatient={Boolean(workflowContext?.patient)}
                    hasEncounter={Boolean(workflowContext?.encounter)}
                    onSelect={selectWorkflowOperation}
                  />
                )}
              </>
            ) : (
              <>
                {!displayPatient && !context && (
                  <Stack spacing={1.5}>
                    <Typography variant="subtitle2">
                      Choose the patient for this appointment
                    </Typography>
                    <Autocomplete<PatientSelection>
                      options={patientOptions}
                      value={null}
                      inputValue={patientQuery}
                      loading={patientBusy}
                      filterOptions={(options) => options}
                      getOptionKey={(option) => option.id}
                      getOptionLabel={(option) =>
                        `${option.display_name}${option.reference ? ` · ${option.reference}` : ""}`
                      }
                      isOptionEqualToValue={(option, value) =>
                        option.id === value.id
                      }
                      onInputChange={(_, value, reason) => {
                        if (reason === "input" || reason === "clear")
                          setPatientQuery(value);
                      }}
                      onChange={(_, patient) => {
                        if (patient) bindSelectedPatient(patient);
                      }}
                      noOptionsText={
                        patientQuery.trim().length < 2
                          ? "Type at least two characters."
                          : "No matching patients."
                      }
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Find patient"
                          placeholder="Name or clinic reference"
                        />
                      )}
                    />
                    {patientError && (
                      <Alert severity="error">
                        Patient search failed. {patientError}
                      </Alert>
                    )}
                  </Stack>
                )}
                {displayPatient && (
                  <Stack spacing={1.5}>
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <Typography variant="subtitle2">
                        Booking details
                      </Typography>
                      {!route.patientId && (
                        <Button
                          size="small"
                          onClick={() => bindSelectedPatient(null)}
                          disabled={busy !== "" || contextBusy}
                        >
                          Change patient
                        </Button>
                      )}
                    </Stack>
                    {contextBusy && (
                      <Alert
                        icon={<CircularProgress size={18} />}
                        severity="info"
                      >
                        Checking the current clinic context…
                      </Alert>
                    )}
                    {contextError && (
                      <Alert
                        severity="warning"
                        action={
                          <Button
                            color="inherit"
                            size="small"
                            onClick={() => {
                              attemptedBinding.current = "";
                              if (targetPatientId)
                                void bindContext(
                                  targetPatientId,
                                  targetEncounterId,
                                );
                            }}
                          >
                            Retry
                          </Button>
                        }
                      >
                        {contextError}
                      </Alert>
                    )}
                    {contextReady && context && (
                      <>
                        <FormControl fullWidth size="small">
                          <InputLabel id="assistant-visit-type-label">
                            Visit type
                          </InputLabel>
                          <Select
                            labelId="assistant-visit-type-label"
                            label="Visit type"
                            value={visitTypeId}
                            onChange={(event) =>
                              setVisitTypeId(event.target.value)
                            }
                            disabled={
                              busy !== "" || context.visit_types.length === 0
                            }
                          >
                            {context.visit_types.map((item) => (
                              <MenuItem
                                key={item.selection_id}
                                value={item.selection_id}
                              >
                                {item.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        {context.visit_types.length === 0 && (
                          <Alert severity="info">
                            No visit types are available for this clinic
                            context.
                          </Alert>
                        )}
                        <FormControl fullWidth size="small">
                          <InputLabel id="assistant-clinician-label">
                            Clinician
                          </InputLabel>
                          <Select
                            labelId="assistant-clinician-label"
                            label="Clinician"
                            value={clinicianId}
                            onChange={(event) =>
                              setClinicianId(event.target.value)
                            }
                            disabled={busy !== ""}
                          >
                            {context.clinicians.map((item) => (
                              <MenuItem
                                key={item.selection_id}
                                value={item.selection_id}
                              >
                                {item.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        {context.clinicians.length === 0 && (
                          <Alert severity="info">
                            No clinicians are available for scheduling in this
                            clinic context.
                          </Alert>
                        )}
                        <TextField
                          label="Preferred date"
                          type="date"
                          value={date}
                          onChange={(event) => setDate(event.target.value)}
                          slotProps={{
                            inputLabel: { shrink: true },
                            htmlInput: {
                              min: new Date().toISOString().slice(0, 10),
                            },
                          }}
                          fullWidth
                          size="small"
                          disabled={busy !== ""}
                        />
                        <Button
                          variant="outlined"
                          startIcon={
                            busy === "openings" ? (
                              <CircularProgress size={16} />
                            ) : (
                              <RefreshRoundedIcon />
                            )
                          }
                          disabled={
                            !date || !visitTypeId || !clinicianId || busy !== ""
                          }
                          onClick={() => void findOpeningsDirectly()}
                        >
                          Find openings directly
                        </Button>
                      </>
                    )}
                    {!contextReady && !contextBusy && !contextError && (
                      <Alert severity="info">
                        The assistant is loading clinic scheduling options.
                      </Alert>
                    )}
                  </Stack>
                )}

                <Box
                  className="clinic-assistant__conversation"
                  role="log"
                  aria-label="Assistant conversation"
                  aria-live="polite"
                  aria-relevant="additions text"
                >
                  {messages.length === 0 && contextReady && (
                    <Typography color="text.secondary" variant="body2">
                      Ask for appointment options in your own words, or use the
                      direct search above. You will review the exact appointment
                      before confirming.
                    </Typography>
                  )}
                  {messages.map((message, index) => (
                    <Paper
                      key={`${index}-${message.role}`}
                      variant="outlined"
                      className={`clinic-assistant__message clinic-assistant__message--${message.role}`}
                    >
                      <Typography variant="caption" color="text.secondary">
                        {message.role === "user" ? "You" : "Assistant"}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          whiteSpace: "pre-wrap",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {message.text}
                      </Typography>
                    </Paper>
                  ))}
                </Box>

                {visibleError && !contextError && (
                  <Alert
                    severity={
                      visibleError.kind === "warning" ||
                      visibleError.kind === "quota"
                        ? "warning"
                        : "error"
                    }
                  >
                    {visibleError.message}
                  </Alert>
                )}

                {openings.length > 0 && (
                  <Stack
                    spacing={1}
                    className="clinic-assistant__openings"
                    aria-label="Available appointment openings"
                  >
                    <Typography variant="subtitle2">
                      Available openings
                    </Typography>
                    {openings.map((opening) => (
                      <Paper
                        key={opening.opening_id}
                        variant="outlined"
                        className="clinic-assistant__opening"
                      >
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {formatOpening(opening, displayTimezone)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {[
                            opening.visit_type_name || selectedVisitType?.name,
                            opening.clinician_name,
                            opening.site_name,
                            opening.room_name,
                            opening.visit_modality,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </Typography>
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={busy !== ""}
                          onClick={() => void selectOpening(opening)}
                        >
                          {busy === "proposal"
                            ? "Preparing review…"
                            : "Review this appointment"}
                        </Button>
                      </Paper>
                    ))}
                  </Stack>
                )}

                {proposal && (
                  <Paper
                    variant="outlined"
                    className="clinic-assistant__proposal"
                  >
                    {proposalState === "unknown" ? (
                      <Alert severity="warning">
                        The confirmation outcome is unknown. Check the saved
                        result before trying again.
                      </Alert>
                    ) : proposalState === "expired" || expired ? (
                      <Alert severity="warning">
                        This proposal expired. Find openings again to make a new
                        proposal.
                      </Alert>
                    ) : proposalState === "stale" ? (
                      <Alert severity="warning">
                        The opening changed before confirmation. Find openings
                        again to choose a current time.
                      </Alert>
                    ) : proposalState === "denied" ? (
                      <Alert severity="warning">
                        Your current role cannot confirm this appointment.
                      </Alert>
                    ) : (proposal.state === "confirmed" ||
                        proposal.status === "confirmed") &&
                      appointment ? (
                      <>
                        <Typography component="h3" variant="subtitle1">
                          Saved appointment
                        </Typography>
                        <Typography variant="body2">
                          {appointmentName(appointment, "patient")}
                        </Typography>
                        <Typography variant="body2">
                          {formatAppointment(
                            appointment,
                            appointment.timezone || displayTimezone,
                          )}
                        </Typography>
                        <Typography variant="body2">
                          {appointmentName(appointment, "visit_type")} ·{" "}
                          {appointmentName(appointment, "clinician")} ·{" "}
                          {appointmentName(appointment, "site")}
                        </Typography>
                        {proposal.receipt_id && (
                          <Alert severity="success" sx={{ mt: 1 }}>
                            The persisted appointment and audit receipt were
                            read back.
                          </Alert>
                        )}
                        {!proposal.receipt_id && (
                          <Alert severity="warning" sx={{ mt: 1 }}>
                            The appointment was returned, but the audit receipt
                            was not included in the response.
                          </Alert>
                        )}
                        <Button
                          component="a"
                          size="small"
                          href={scheduleHref(appointment, displayTimezone)}
                          data-demo-tour-control="true"
                        >
                          Open appointment date in schedule
                        </Button>
                      </>
                    ) : (
                      <>
                        <Typography component="h3" variant="subtitle1">
                          Review appointment
                        </Typography>
                        <Typography variant="body2">
                          {appointment
                            ? appointmentName(appointment, "patient")
                            : context?.patient?.name ||
                              selectedPatient?.display_name ||
                              "Selected patient"}
                        </Typography>
                        <Typography variant="body2">
                          {appointment
                            ? formatAppointment(
                                appointment,
                                appointment.timezone || displayTimezone,
                              )
                            : "Appointment time not returned"}
                        </Typography>
                        <Typography variant="body2">
                          {appointment
                            ? `${appointmentName(appointment, "visit_type")} · ${appointmentName(appointment, "clinician")} · ${appointmentName(appointment, "site")}`
                            : "Review the details returned by the clinic before confirming."}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {proposal.expires_at
                            ? `Proposal expires ${new Date(proposal.expires_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                            : "Proposal expiration unavailable"}
                        </Typography>
                        <Stack
                          direction={{ xs: "column", sm: "row" }}
                          spacing={1}
                        >
                          <Button
                            variant="contained"
                            disabled={
                              busy !== "" ||
                              expired ||
                              proposalState !== "ready" ||
                              !appointment
                            }
                            onClick={() => void confirmProposal()}
                          >
                            {busy === "confirm"
                              ? "Confirming…"
                              : "Confirm appointment"}
                          </Button>
                        </Stack>
                        {busy === "readback" && (
                          <Typography variant="body2" role="status">
                            Checking the saved appointment…
                          </Typography>
                        )}
                      </>
                    )}
                    {(proposalState === "unknown" ||
                      actionError?.kind === "warning") && (
                      <Button
                        size="small"
                        disabled={busy !== ""}
                        onClick={() => void loadProposal(proposal.proposal_id)}
                      >
                        Check proposal status
                      </Button>
                    )}
                  </Paper>
                )}
              </>
            )}
          </Box>
          <Divider />
          <Box
            component="form"
            className="clinic-assistant__composer"
            onSubmit={mode === "workflows" ? sendWorkflowMessage : sendMessage}
          >
            <TextField
              label="Message the assistant"
              inputRef={composerRef}
              autoFocus
              placeholder={
                mode === "workflows"
                  ? "Ask about clinic work or request a change"
                  : "For example: Find a morning opening next week"
              }
              value={mode === "workflows" ? workflowDraft : draft}
              onChange={(event) =>
                mode === "workflows"
                  ? setWorkflowDraft(event.target.value)
                  : setDraft(event.target.value)
              }
              multiline
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  const form = event.currentTarget.closest("form");
                  const submit = form?.querySelector<HTMLButtonElement>(
                    'button[type="submit"]',
                  );
                  if (submit && !submit.disabled) form?.requestSubmit();
                }
              }}
              minRows={2}
              maxRows={5}
              fullWidth
              disabled={
                mode === "workflows"
                  ? busy !== "" || workflowReviewLocked
                  : !contextReady || !visitTypeId || !clinicianId || busy !== ""
              }
              helperText={
                mode === "workflows"
                  ? workflowReviewLocked
                    ? "Confirm this review, or choose Edit details to revise it."
                    : workflowContextBusy
                      ? "You can write while the clinic connects."
                      : workflowCatalogBusy
                        ? "Loading available tasks…"
                        : workflowOperation && !workflowResult
                          ? "Add or change a detail here. Enter to send; Shift + Enter for a new line."
                          : "Enter to send · Shift + Enter for a new line"
                  : !displayPatient
                    ? "Choose a patient to start."
                    : !visitTypeId
                      ? "Choose a visit type to continue."
                      : !clinicianId
                        ? "Choose a clinician to continue."
                        : "Your message stays in this clinic session."
              }
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: { maxLength: 1000 },
              }}
            />
            <Button
              type="submit"
              variant="contained"
              aria-label="Send message"
              disabled={
                mode === "workflows"
                  ? !workflowContextReady ||
                    workflowCatalogBusy ||
                    Boolean(workflowCatalogError) ||
                    workflowReviewLocked ||
                    !workflowDraft.trim() ||
                    busy !== ""
                  : !contextReady ||
                    !visitTypeId ||
                    !clinicianId ||
                    !draft.trim() ||
                    busy !== ""
              }
              endIcon={
                (mode === "workflows" && busy === "workflow-message") ||
                (mode === "booking" && busy === "message") ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <SendRoundedIcon />
                )
              }
            >
              Send
            </Button>
          </Box>
        </Box>
        <Dialog
          open={discardDialogOpen && open && mode === "workflows"}
          onClose={() => setDiscardDialogOpen(false)}
          aria-labelledby="assistant-discard-title"
          aria-describedby="assistant-discard-description"
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle id="assistant-discard-title">
            Start a new task?
          </DialogTitle>
          <DialogContent>
            <DialogContentText id="assistant-discard-description">
              Your current message and unfinished task details will be cleared.
              Saved clinic records will stay as they are.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button autoFocus onClick={() => setDiscardDialogOpen(false)}>
              Keep working
            </Button>
            <Button
              color="warning"
              onClick={startNewWorkflowTask}
              disabled={busy !== "" || workflowProposalStatus === "unknown"}
            >
              Discard draft and start new
            </Button>
          </DialogActions>
        </Dialog>
      </Drawer>
    </>
  );
}
