import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import { ApiError, api } from "../../api/client";
import type { Patient } from "../../api/contracts";
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
type AssistantMessage = { role: "user" | "assistant"; text: string };
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

function errorState(error: unknown) {
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
          "The assistant request limit has been reached. You can still find openings directly.",
      };
    if (error.status >= 500 || error.code === "model_unavailable")
      return {
        kind: "unavailable",
        message:
          "The assistant is temporarily unavailable. You can still find openings directly.",
      };
    return { kind: "error", message: error.message };
  }
  return {
    kind: "unavailable",
    message:
      "We could not confirm the assistant response. Check the current proposal before trying again.",
  };
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
  const attemptedBinding = useRef("");
  const contextSequence = useRef(0);
  const actionSequence = useRef(0);
  const invalidatingContext = useRef(false);
  const invalidationRequest = useRef<Promise<void> | null>(null);
  const scopeRef = useRef(scopeKey);
  const activeContext = useRef<AssistantContext | null>(null);
  const routeRef = useRef(initialRoute);
  const querySequence = useRef(0);

  const route = routeContext(path, search);
  const targetPatientId = route.patientId ?? selectedPatient?.id ?? null;
  const targetEncounterId = route.patientId ? route.encounterId : null;
  const bindingKey = `${scopeKey}:${targetPatientId ?? "none"}:${targetEncounterId ?? "none"}`;
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
          if (open && patientId)
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
        if (open && route.patientId)
          void bindContext(route.patientId, route.encounterId);
      });
    }
  }, [scopeKey, context?.context_id, route.patientId, route.encounterId, open]);

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
    if (!open || invalidatingContext.current || !targetPatientId || contextBusy)
      return;
    const expected = `${scopeKey}:${targetPatientId}:${targetEncounterId ?? "none"}`;
    if (attemptedBinding.current === expected && context?.context_id) return;
    if (attemptedBinding.current === expected && contextError) return;
    void bindContext(targetPatientId, targetEncounterId);
  }, [
    open,
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
    if (!proposal) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [proposal]);

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

  return (
    <>
      <Tooltip describeChild title="Open assistant" placement="right">
        <Button
          className="clinic-assistant-entry"
          aria-label="Open assistant"
          aria-haspopup="dialog"
          aria-expanded={open}
          startIcon={<EventAvailableOutlinedIcon aria-hidden="true" />}
          onClick={() => setOpen(true)}
          fullWidth
        >
          <span>Assistant</span>
        </Button>
      </Tooltip>
      <Drawer
        anchor="right"
        open={open}
        onClose={() => setOpen(false)}
        slotProps={{ paper: { "aria-labelledby": "clinic-assistant-title" } }}
        sx={{
          "& .MuiDrawer-paper": {
            width: { xs: "100%", sm: 440, md: 480 },
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
                Assistant
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Appointment scheduling
              </Typography>
            </Box>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
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
                  onClick={() => setOpen(false)}
                >
                  <CloseRoundedIcon />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>
          <Divider />
          <Box className="clinic-assistant__context">
            <Typography variant="body2" noWrap>
              {practiceName} · {siteName || "Location not selected"}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              Patient: {contextPatientLabel}
              {context?.encounter ? " · Current encounter" : ""}
            </Typography>
          </Box>
          <Divider />
          <Box className="clinic-assistant__body">
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
                  sx={{ alignItems: "center", justifyContent: "space-between" }}
                >
                  <Typography variant="subtitle2">Booking details</Typography>
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
                  <Alert icon={<CircularProgress size={18} />} severity="info">
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
                        onChange={(event) => setVisitTypeId(event.target.value)}
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
                        No visit types are available for this clinic context.
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
                        onChange={(event) => setClinicianId(event.target.value)}
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
                    sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
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
                <Typography variant="subtitle2">Available openings</Typography>
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
              <Paper variant="outlined" className="clinic-assistant__proposal">
                {proposalState === "unknown" ? (
                  <Alert severity="warning">
                    The confirmation outcome is unknown. Check the saved result
                    before trying again.
                  </Alert>
                ) : proposalState === "expired" || expired ? (
                  <Alert severity="warning">
                    This proposal expired. Find openings again to make a new
                    proposal.
                  </Alert>
                ) : proposalState === "stale" ? (
                  <Alert severity="warning">
                    The opening changed before confirmation. Find openings again
                    to choose a current time.
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
                        The persisted appointment and audit receipt were read
                        back.
                      </Alert>
                    )}
                    {!proposal.receipt_id && (
                      <Alert severity="warning" sx={{ mt: 1 }}>
                        The appointment was returned, but the audit receipt was
                        not included in the response.
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
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
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
          </Box>
          <Divider />
          <Box
            component="form"
            className="clinic-assistant__composer"
            onSubmit={sendMessage}
          >
            <TextField
              label="Message the assistant"
              placeholder="For example: Find a morning opening next week"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              multiline
              minRows={2}
              maxRows={5}
              fullWidth
              disabled={
                !contextReady || !visitTypeId || !clinicianId || busy !== ""
              }
              helperText={
                !displayPatient
                  ? "Choose a patient to start."
                  : !visitTypeId
                    ? "Choose a visit type to continue."
                    : !clinicianId
                      ? "Choose a clinician to continue."
                      : "Your message stays in this clinic session."
              }
              slotProps={{ htmlInput: { maxLength: 1000 } }}
            />
            <Button
              type="submit"
              variant="contained"
              aria-label="Send message"
              disabled={
                !contextReady ||
                !visitTypeId ||
                !clinicianId ||
                !draft.trim() ||
                busy !== ""
              }
              endIcon={
                busy === "message" ? (
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
      </Drawer>
    </>
  );
}
