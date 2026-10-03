import { useCallback, useEffect, useRef, useState } from "react";
import CalendarTodayOutlinedIcon from "@mui/icons-material/CalendarTodayOutlined";
import LanguageOutlinedIcon from "@mui/icons-material/LanguageOutlined";
import MenuOutlinedIcon from "@mui/icons-material/MenuOutlined";
import MicNoneOutlinedIcon from "@mui/icons-material/MicNoneOutlined";
import NoteAddOutlinedIcon from "@mui/icons-material/NoteAddOutlined";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { ApiError, api } from "../../api/client";
import type { EncounterNoteSummary } from "../../api/contracts";
import { useClinic } from "../clinic/Workspace";
import { useClinicNavigation } from "../clinic/clinicNavigation";
import { isDemoFrame } from "../demo/frame";
import { ScribePatientPicker, type PatientOption } from "./ScribePatientPicker";
import { ScribeAudioMeter } from "./ScribeAudioMeter";
import { ScribeChartAndLabs } from "./ScribeChartAndLabs";
import { useScribeRecording } from "./ScribeRecordingProvider";
import {
  ScribeReviewWorkspace,
  type ScribeReviewState,
} from "./ScribeReviewWorkspace";
import {
  ScribeSessionRail,
  type ScribeEncounterSummary,
} from "./ScribeSessionRail";
import type {
  ScribeDraft,
  ScribeDraftSection,
  ScribeDocumentationWorklist,
  ScribeDocument,
  ScribeEncounter,
  ScribeTemplate,
} from "./types";

type Pagination = {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
};
type EncounterIndex = {
  encounters: ScribeEncounterSummary[];
  pagination: Pagination;
  documentation_worklist: ScribeDocumentationWorklist;
};
type Confirmation =
  | {
      kind: "consent";
      decision: "accepted" | "declined" | "withdrawn";
      encounterId: number;
      encounterVersion: number;
      scopeKey: string;
    }
  | {
      kind: "approve";
      draftId: number;
      draftVersion: number;
      encounterId: number;
      scopeKey: string;
    }
  | {
      kind: "export";
      draftId: number;
      draftVersion: number;
      draftOutputDigest: string;
      encounterId: number;
      scopeKey: string;
      correctionTarget?: {
        noteId: number;
        revisionId: number;
        revisionNo: number;
      };
    }
  | {
      kind: "delete";
      encounterId: number;
      encounterVersion: number;
      scopeKey: string;
    }
  | null;

const PAGE_SIZE = 25;
const EMPTY_WORKLIST: ScribeDocumentationWorklist = {
  scope: "recent_completed_visits",
  candidate_limit_per_source: 25,
  unsigned_notes_available: false,
  truncated: false,
  returned_count: 0,
  returned_counts: {
    inputs_changed: 0,
    needs_review: 0,
    ready_to_add_to_chart: 0,
    unsigned_note: 0,
  },
  items: [],
};
function capability(capabilities: object, name: string) {
  return (capabilities as Record<string, boolean | undefined>)[name] === true;
}
function activeDraft(encounter: ScribeEncounter | null, documentId?: number) {
  return encounter?.drafts.find(
    (draft) =>
      (documentId === undefined || (draft.document_id ?? 0) === documentId) &&
      draft.current !== false &&
      !["superseded", "deleted"].includes(draft.status),
  );
}
function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}
function formatSessionDate(value?: string | null) {
  if (!value) return "Date unavailable";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return "Date unavailable";
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function elapsedLabel(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function currentVersionForRestore(
  encounter: ScribeEncounter,
  historicalDraftId: number,
) {
  const historicalDraft = encounter.drafts.find(
    ({ id }) => id === historicalDraftId,
  );
  if (!historicalDraft) return null;
  return (
    encounter.documents?.find(({ id }) => id === historicalDraft.document_id)
      ?.current_revision?.version ?? null
  );
}

export function scribeReturnTarget(search: string) {
  const params = new URLSearchParams(search);
  const rawId = params.get("encounter_id");
  if (!rawId || !/^\d+$/.test(rawId)) return null;
  const encounterId = Number(rawId);
  if (!Number.isSafeInteger(encounterId) || encounterId <= 0) return null;
  const rawDocumentId = params.get("document_id");
  const documentId =
    rawDocumentId && /^\d+$/.test(rawDocumentId) ? Number(rawDocumentId) : null;
  return {
    encounterId,
    review: params.get("review") === "1",
    ...(documentId && Number.isSafeInteger(documentId) && documentId > 0
      ? { documentId }
      : {}),
  };
}

export function scribeContextTarget(search: string) {
  const params = new URLSearchParams(search);
  const rawPatientId = params.get("patient_id");
  const rawEncounterId = params.get("clinical_encounter_id");
  if (
    !rawPatientId ||
    !rawEncounterId ||
    !/^\d+$/.test(rawPatientId) ||
    !/^\d+$/.test(rawEncounterId)
  )
    return null;
  const patientId = Number(rawPatientId);
  const clinicalEncounterId = Number(rawEncounterId);
  if (
    !Number.isSafeInteger(patientId) ||
    patientId <= 0 ||
    !Number.isSafeInteger(clinicalEncounterId) ||
    clinicalEncounterId <= 0
  )
    return null;
  return { patientId, clinicalEncounterId };
}

export function LiveScribeReviewWorkspace() {
  const { capabilities, current_site, membership_id } = useClinic();
  const { navigate, registerBlocker } = useClinicNavigation();
  const recording = useScribeRecording();
  const recordingRef = useRef(recording);
  recordingRef.current = recording;
  const locationSearch =
    typeof window === "undefined" ? "" : window.location.search;
  const sampleSession =
    isDemoFrame() &&
    new URLSearchParams(locationSearch).get("demo_step") === "scribe_review";
  const compactRail = useMediaQuery("(max-width: 759.95px)");
  const scopeKey = `${membership_id ?? "none"}:${current_site?.id ?? "all"}`;
  const scopeRef = useRef(scopeKey);
  scopeRef.current = scopeKey;
  const mounted = useRef(true);
  const listVersion = useRef(0);
  const detailVersion = useRef(0);
  const selectedEncounterRef = useRef<number | null>(null);
  const newSessionRef = useRef(false);
  const searchRef = useRef("");
  const skipNextSearchRef = useRef(true);
  const returnReviewEncounterRef = useRef<number | null>(null);
  const returnReviewDocumentRef = useRef<number | null>(null);
  const actionLock = useRef(new Set<string>());
  const exportKeys = useRef(new Map<string, string>());

  const [summaries, setSummaries] = useState<ScribeEncounterSummary[]>([]);
  const [documentationWorklist, setDocumentationWorklist] =
    useState<ScribeDocumentationWorklist>(EMPTY_WORKLIST);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [railSearch, setRailSearch] = useState("");
  const [railOpen, setRailOpen] = useState(false);
  const [newSession, setNewSession] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientOption | null>(
    null,
  );
  const [contextualClinicalEncounterId, setContextualClinicalEncounterId] =
    useState<number | null>(null);
  const [selectedEncounterId, setSelectedEncounterId] = useState<number | null>(
    null,
  );
  const [encounter, setEncounter] = useState<ScribeEncounter | null>(null);
  const [reviewState, setReviewState] = useState<ScribeReviewState>({
    kind: "loading",
  });
  const [activeTab, setActiveTab] = useState("context");
  const [contextValue, setContextValue] = useState("");
  const [contextBaseline, setContextBaseline] = useState("");
  const [transcript, setTranscript] = useState("");
  const [templates, setTemplates] = useState<ScribeTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [outcomeUnknown, setOutcomeUnknown] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [correctionReason, setCorrectionReason] = useState("");
  const [hasUnsavedReviewEdits, setHasUnsavedReviewEdits] = useState(false);
  const [discardEditsToken, setDiscardEditsToken] = useState(0);
  const [followCurrentDraftId, setFollowCurrentDraftId] = useState<
    number | null
  >(null);
  const hasUnsavedContext = contextValue !== contextBaseline;
  const contextDirtyRef = useRef(hasUnsavedContext);
  contextDirtyRef.current = hasUnsavedContext;

  useEffect(
    () =>
      registerBlocker(() => {
        if (pendingAction)
          return "A scribe action is still in progress. Leave this workspace?";
        if (hasUnsavedReviewEdits || hasUnsavedContext || transcript.trim())
          return "Unsaved scribe content will be lost. Leave this workspace?";
        return null;
      }),
    [
      registerBlocker,
      pendingAction,
      hasUnsavedReviewEdits,
      hasUnsavedContext,
      transcript,
    ],
  );

  const isCurrent = useCallback(
    (requestScope: string) =>
      mounted.current && scopeRef.current === requestScope,
    [],
  );

  useEffect(
    () => () => {
      mounted.current = false;
      listVersion.current += 1;
      detailVersion.current += 1;
    },
    [],
  );

  const adoptEncounter = useCallback(
    (next: ScribeEncounter, forceContext = false) => {
      setEncounter(next);
      setReviewState({ kind: "ready", encounter: next });
      recordingRef.current.reconcile({
        encounterId: next.id,
        encounterVersion: next.version,
        processingAllowed:
          next.consent_status === "accepted" &&
          !next.deleted_at &&
          next.status !== "deleted",
        contextContent: next.context_content ?? "",
        scrubContext:
          next.consent_status === "withdrawn" ||
          Boolean(next.deleted_at) ||
          next.status === "deleted",
      });
      if (forceContext || !contextDirtyRef.current) {
        const context = next.context_content ?? "";
        setContextValue(context);
        setContextBaseline(context);
      }
    },
    [],
  );

  const loadEncounter = useCallback(
    async (encounterId: number) => {
      const requestScope = scopeKey;
      const requestVersion = ++detailVersion.current;
      setReviewState({
        kind: "loading",
        message: "Loading the selected session…",
      });
      try {
        const result = await api<{ encounter: ScribeEncounter }>(
          `/api/clinic/scribe/encounters/${encounterId}`,
        );
        if (
          !isCurrent(requestScope) ||
          requestVersion !== detailVersion.current ||
          selectedEncounterRef.current !== encounterId
        )
          return;
        adoptEncounter(result.encounter);
        if (returnReviewEncounterRef.current === encounterId) {
          const requestedDocumentId = returnReviewDocumentRef.current;
          const currentDocument =
            result.encounter.documents?.find(
              (document) =>
                document.id === requestedDocumentId &&
                document.current_revision,
            ) ??
            result.encounter.documents?.find(
              (document) => document.current_revision,
            );
          setActiveTab(
            currentDocument ? `document:${currentDocument.id}` : "transcript",
          );
          if (currentDocument) setTemplateId(currentDocument.template_id);
          returnReviewEncounterRef.current = null;
          returnReviewDocumentRef.current = null;
        }
        setOutcomeUnknown(null);
      } catch (reason) {
        if (
          !isCurrent(requestScope) ||
          requestVersion !== detailVersion.current ||
          selectedEncounterRef.current !== encounterId
        )
          return;
        setEncounter(null);
        setReviewState({
          kind: "error",
          message: errorMessage(reason, "Unable to load this scribe session."),
        });
      }
    },
    [adoptEncounter, isCurrent, scopeKey],
  );

  const loadIndex = useCallback(
    async (preferredEncounterId?: number, query = searchRef.current) => {
      const requestScope = scopeKey;
      const requestVersion = ++listVersion.current;
      try {
        const queryParam = query.trim()
          ? `&q=${encodeURIComponent(query.trim())}`
          : "";
        const result = await api<EncounterIndex>(
          `/api/clinic/scribe/encounters?page=1&per_page=${PAGE_SIZE}${queryParam}`,
        );
        if (!isCurrent(requestScope) || requestVersion !== listVersion.current)
          return;
        setSummaries(result.encounters);
        setDocumentationWorklist(result.documentation_worklist);
        setPage(result.pagination.page);
        setTotalPages(result.pagination.total_pages);
        setLoadingMore(false);
        setActionError(null);
        if (newSessionRef.current) return;
        const nextId = preferredEncounterId
          ? preferredEncounterId
          : selectedEncounterRef.current &&
              result.encounters.some(
                ({ id }) => id === selectedEncounterRef.current,
              )
            ? selectedEncounterRef.current
            : result.encounters[0]?.id;
        selectedEncounterRef.current = nextId ?? null;
        setSelectedEncounterId(nextId ?? null);
        if (nextId) await loadEncounter(nextId);
        else {
          setEncounter(null);
          setReviewState({
            kind: "empty",
            message:
              "Start a new session to add context or import a transcript.",
          });
        }
      } catch (reason) {
        if (isCurrent(requestScope) && requestVersion === listVersion.current)
          setReviewState({
            kind: "error",
            message: errorMessage(reason, "Unable to load scribe sessions."),
          });
      }
    },
    [isCurrent, loadEncounter, scopeKey],
  );

  const prepareContextualLaunch = useCallback(
    async (
      target: { patientId: number; clinicalEncounterId: number },
      reconciliation = false,
    ) => {
      const requestScope = scopeKey;
      const requestVersion = ++listVersion.current;
      setReviewState({
        kind: "loading",
        message: reconciliation
          ? "Checking for the linked Scribe session…"
          : "Checking this patient and visit…",
      });
      try {
        const encounterResult = await api<{
          encounter: { id: number; patient_id: number };
        }>(
          `/api/clinic/encounters/${target.clinicalEncounterId}?patient_id=${target.patientId}`,
        );
        if (
          encounterResult.encounter.id !== target.clinicalEncounterId ||
          encounterResult.encounter.patient_id !== target.patientId
        )
          throw new Error(
            "The selected visit does not match the intended patient.",
          );
        const patientResult = await api<{ patient: PatientOption }>(
          `/api/clinic/patients/${target.patientId}`,
        );
        if (patientResult.patient.id !== target.patientId)
          throw new Error("The selected patient could not be verified.");
        const result = await api<EncounterIndex>(
          `/api/clinic/scribe/encounters?page=1&per_page=${PAGE_SIZE}&patient_id=${target.patientId}&clinical_encounter_id=${target.clinicalEncounterId}`,
        );
        if (!isCurrent(requestScope) || requestVersion !== listVersion.current)
          return;
        const existing = result.encounters.find(
          (item) =>
            item.patient_id === target.patientId &&
            item.clinical_encounter_id === target.clinicalEncounterId &&
            item.status !== "deleted",
        );
        setSummaries(result.encounters);
        setDocumentationWorklist(result.documentation_worklist);
        setPage(result.pagination.page);
        setTotalPages(result.pagination.total_pages);
        setLoadingMore(false);
        if (existing) {
          newSessionRef.current = false;
          setNewSession(false);
          setSelectedPatient(null);
          setContextualClinicalEncounterId(null);
          selectedEncounterRef.current = existing.id;
          setSelectedEncounterId(existing.id);
          setOutcomeUnknown(null);
          setActionError(null);
          await loadEncounter(existing.id);
          return;
        }
        if (reconciliation) {
          setActionError(
            "No linked Scribe session was found. The earlier creation outcome remains unconfirmed; do not start another session.",
          );
          return;
        }
        newSessionRef.current = true;
        setNewSession(true);
        setSelectedPatient(patientResult.patient);
        setContextualClinicalEncounterId(target.clinicalEncounterId);
        selectedEncounterRef.current = null;
        setSelectedEncounterId(null);
        setEncounter(null);
        setActionError(null);
        setReviewState({
          kind: "empty",
          message:
            "Confirm the linked patient and visit, then start the session.",
        });
      } catch (reason) {
        if (isCurrent(requestScope) && requestVersion === listVersion.current) {
          const message = errorMessage(
            reason,
            "Unable to verify the intended patient and visit.",
          );
          setActionError(message);
          setReviewState({ kind: "error", message });
        }
      }
    },
    [isCurrent, loadEncounter, scopeKey],
  );

  useEffect(() => {
    mounted.current = true;
    selectedEncounterRef.current = null;
    searchRef.current = "";
    setRailSearch("");
    setDocumentationWorklist(EMPTY_WORKLIST);
    newSessionRef.current = false;
    setNewSession(false);
    setSelectedPatient(null);
    setContextualClinicalEncounterId(null);
    setEncounter(null);
    setTranscript("");
    setTemplates([]);
    setTemplateId("");
    setActionError(null);
    setOutcomeUnknown(null);
    setConfirmation(null);
    setHasUnsavedReviewEdits(false);
    setFollowCurrentDraftId(null);
    const returnTarget = scribeReturnTarget(locationSearch);
    const contextTarget = scribeContextTarget(locationSearch);
    returnReviewEncounterRef.current = returnTarget?.review
      ? returnTarget.encounterId
      : null;
    returnReviewDocumentRef.current = returnTarget?.review
      ? (returnTarget.documentId ?? null)
      : null;
    skipNextSearchRef.current = true;
    if (contextTarget) void prepareContextualLaunch(contextTarget);
    else void loadIndex(returnTarget?.encounterId);
    void api<{ templates: ScribeTemplate[] }>("/api/clinic/scribe/templates")
      .then((result) => {
        if (!isCurrent(scopeKey)) return;
        setTemplates(result.templates);
        const available = result.templates.find(
          (template) => template.status === "active",
        );
        if (available) setTemplateId(available.id);
      })
      .catch((reason) => {
        if (isCurrent(scopeKey))
          setActionError(
            errorMessage(reason, "Unable to load note templates."),
          );
      });
  }, [isCurrent, loadIndex, locationSearch, prepareContextualLaunch, scopeKey]);

  useEffect(() => {
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }
    searchRef.current = railSearch;
    const timeout = window.setTimeout(
      () => void loadIndex(undefined, railSearch),
      250,
    );
    return () => window.clearTimeout(timeout);
  }, [railSearch, loadIndex, locationSearch]);

  const loadMore = async () => {
    if (loadingMore || page >= totalPages) return;
    const requestScope = scopeKey;
    const requestVersion = ++listVersion.current;
    setLoadingMore(true);
    try {
      const queryParam = searchRef.current.trim()
        ? `&q=${encodeURIComponent(searchRef.current.trim())}`
        : "";
      const result = await api<EncounterIndex>(
        `/api/clinic/scribe/encounters?page=${page + 1}&per_page=${PAGE_SIZE}${queryParam}`,
      );
      if (!isCurrent(requestScope) || requestVersion !== listVersion.current)
        return;
      setSummaries((current) => [
        ...current,
        ...result.encounters.filter(
          (item) => !current.some(({ id }) => id === item.id),
        ),
      ]);
      setPage(result.pagination.page);
      setTotalPages(result.pagination.total_pages);
      setLoadingMore(false);
    } catch (reason) {
      if (isCurrent(requestScope) && requestVersion === listVersion.current) {
        setLoadingMore(false);
        setActionError(errorMessage(reason, "Unable to load more sessions."));
      }
    }
  };

  const unsavedMessage = () =>
    hasUnsavedReviewEdits || hasUnsavedContext || transcript.trim()
      ? "Save or discard unsaved note, context, and transcript changes before switching sessions."
      : null;
  const selectEncounter = (id: number) => {
    if (id === selectedEncounterRef.current && !newSession) return;
    const blocked = unsavedMessage();
    if (blocked) {
      setActionError(blocked);
      return;
    }
    setNewSession(false);
    newSessionRef.current = false;
    setSelectedPatient(null);
    setContextualClinicalEncounterId(null);
    setFollowCurrentDraftId(null);
    selectedEncounterRef.current = id;
    setSelectedEncounterId(id);
    setEncounter(null);
    setTranscript("");
    setActionError(null);
    setOutcomeUnknown(null);
    setActiveTab("context");
    setRailOpen(false);
    void loadEncounter(id);
  };
  const beginNewSession = () => {
    const blocked = unsavedMessage();
    if (blocked) {
      setActionError(blocked);
      return;
    }
    setNewSession(true);
    newSessionRef.current = true;
    setSelectedPatient(patient ?? null);
    setContextualClinicalEncounterId(null);
    setFollowCurrentDraftId(null);
    selectedEncounterRef.current = null;
    setSelectedEncounterId(null);
    setEncounter(null);
    setContextValue("");
    setContextBaseline("");
    setTranscript("");
    setReviewState({
      kind: "empty",
      message: "Choose a patient to start this session.",
    });
    setActiveTab("context");
    setRailOpen(false);
  };

  const runMutation = async (
    key: string,
    action: () => Promise<void>,
    uncertainMessage?: string,
  ) => {
    const scopedKey = `${scopeKey}:${key}`;
    if (actionLock.current.has(scopedKey) || outcomeUnknown) return;
    actionLock.current.add(scopedKey);
    setPendingAction(key);
    setActionError(null);
    try {
      await action();
    } catch (reason) {
      if (isCurrent(scopeKey)) {
        setActionError(
          errorMessage(reason, "The scribe action could not be completed."),
        );
        if (
          uncertainMessage &&
          !(
            reason instanceof ApiError &&
            reason.status >= 400 &&
            reason.status < 500 &&
            reason.status !== 408 &&
            reason.code !== "outcome_unconfirmed"
          )
        )
          setOutcomeUnknown(uncertainMessage);
      }
      throw reason;
    } finally {
      actionLock.current.delete(scopedKey);
      if (isCurrent(scopeKey)) setPendingAction(null);
    }
  };

  const createEncounter = () =>
    runMutation(
      "create",
      async () => {
        if (!selectedPatient)
          throw new Error("Choose a patient before starting the session.");
        const content = contextValue.trim();
        const result = await api<{ encounter: ScribeEncounter }>(
          "/api/clinic/scribe/encounters",
          {
            method: "POST",
            body: {
              encounter: {
                patient_id: selectedPatient.id,
                ...(contextualClinicalEncounterId
                  ? {
                      clinical_encounter_id: contextualClinicalEncounterId,
                    }
                  : { site_id: current_site?.id }),
                ...(content
                  ? { context: { content, source_type: "reviewer_authored" } }
                  : {}),
              },
            },
          },
        );
        if (!isCurrent(scopeKey)) return;
        if (
          contextualClinicalEncounterId &&
          (result.encounter.patient_id !== selectedPatient.id ||
            result.encounter.clinical_encounter_id !==
              contextualClinicalEncounterId)
        )
          throw new Error(
            "The created Scribe session did not match the intended patient and visit.",
          );
        setNewSession(false);
        newSessionRef.current = false;
        setSelectedPatient(null);
        setContextualClinicalEncounterId(null);
        selectedEncounterRef.current = result.encounter.id;
        setSelectedEncounterId(result.encounter.id);
        adoptEncounter(result.encounter);
        await loadIndex(result.encounter.id);
      },
      "Session creation is not confirmed. Reload the session list before trying again.",
    );

  const createSyntheticEncounter = () =>
    runMutation(
      "create-synthetic",
      async () => {
        if (!selectedPatient)
          throw new Error(
            "Choose a patient before creating a sample encounter.",
          );
        const result = await api<{ encounter: ScribeEncounter }>(
          "/api/clinic/scribe/encounters/create_synthetic",
          {
            method: "POST",
            body: {
              encounter: {
                patient_id: selectedPatient.id,
                site_id: current_site?.id,
              },
            },
          },
        );
        if (!isCurrent(scopeKey)) return;
        setNewSession(false);
        newSessionRef.current = false;
        setSelectedPatient(null);
        selectedEncounterRef.current = result.encounter.id;
        setSelectedEncounterId(result.encounter.id);
        adoptEncounter(result.encounter);
        await loadIndex(result.encounter.id);
      },
      "The sample encounter may have been created. Reload the session list before trying again.",
    );

  const saveContext = () => {
    if (!encounter || !hasUnsavedContext) return Promise.resolve();
    const encounterId = encounter.id;
    const expectedVersion = encounter.version;
    return runMutation(
      "context",
      async () => {
        const result = await api<{ encounter: ScribeEncounter }>(
          `/api/clinic/scribe/encounters/${encounterId}/context`,
          {
            method: "PATCH",
            body: {
              context: {
                content: contextValue,
                expected_version: expectedVersion,
              },
            },
          },
        );
        if (isCurrent(scopeKey) && selectedEncounterRef.current === encounterId)
          adoptEncounter(result.encounter, true);
      },
      "Context save is not confirmed. Reload this session before editing again.",
    );
  };

  const decideConsent = (decision: "accepted" | "declined" | "withdrawn") => {
    const encounterId = selectedEncounterRef.current;
    if (!encounterId) return Promise.resolve();
    return runMutation(
      `consent:${decision}`,
      async () => {
        await api(`/api/clinic/scribe/encounters/${encounterId}/consent`, {
          method: "POST",
          body: { consent: { decision, method: "in_person" } },
        });
        if (isCurrent(scopeKey) && selectedEncounterRef.current === encounterId)
          await loadEncounter(encounterId);
      },
      "Consent outcome is not confirmed. Reload the session before making another decision.",
    );
  };

  const importSource = () => {
    const encounterId = selectedEncounterRef.current;
    const content = transcript.trim();
    if (!encounterId || !content) return Promise.resolve();
    if (hasUnsavedContext || hasUnsavedReviewEdits) {
      setActionError(
        "Save or discard note and context changes before importing a transcript.",
      );
      return Promise.reject(
        new Error("Unsaved changes must be resolved first."),
      );
    }
    return runMutation("source", async () => {
      await api(`/api/clinic/scribe/encounters/${encounterId}/sources`, {
        method: "POST",
        body: { source: { content } },
      });
      if (isCurrent(scopeKey) && selectedEncounterRef.current === encounterId) {
        setTranscript("");
        await loadEncounter(encounterId);
      }
    });
  };

  const selectedDocumentId = activeTab.startsWith("document:")
    ? Number(activeTab.split(":")[1])
    : undefined;
  const generateDraft = () => {
    const encounterId = selectedEncounterRef.current;
    if (!encounterId || !encounter) return Promise.resolve();
    const selectedDocument = encounter.documents?.find(
      ({ id }) => id === selectedDocumentId,
    );
    return runMutation(
      "generate",
      async () => {
        const result = await api<{
          draft: ScribeDraft;
          document: ScribeDocument;
          encounter: ScribeEncounter;
        }>(`/api/clinic/scribe/encounters/${encounterId}/generate`, {
          method: "POST",
          body: {
            generation: {
              template_id: templateId,
              ...(selectedDocumentId
                ? { document_id: selectedDocumentId }
                : {}),
              expected_version: selectedDocument
                ? selectedDocument.version
                : encounter.version,
            },
          },
        });
        if (
          isCurrent(scopeKey) &&
          selectedEncounterRef.current === encounterId
        ) {
          adoptEncounter(result.encounter);
          setActiveTab(`document:${result.document.id}`);
        }
      },
      "Note creation is not confirmed. Reload the current session before trying again.",
    );
  };

  const saveDraft = (
    draftId: number,
    sections: Record<ScribeDraftSection["section_key"], string>,
  ) => {
    const draft = encounter?.drafts.find((item) => item.id === draftId);
    if (!draft || !encounter) return Promise.resolve();
    return runMutation(
      "review:all",
      async () => {
        const result = await api<{
          draft: ScribeDraft;
          document: ScribeDocument;
        }>(`/api/clinic/scribe/drafts/${draftId}/sections`, {
          method: "POST",
          body: { revision: { expected_version: draft.version, sections } },
        });
        if (
          isCurrent(scopeKey) &&
          selectedEncounterRef.current === encounter.id
        )
          setFollowCurrentDraftId(result.draft.id);
        if (
          isCurrent(scopeKey) &&
          selectedEncounterRef.current === encounter.id
        )
          await loadEncounter(encounter.id);
      },
      "Note save is not confirmed. Reload the current revision before editing again.",
    );
  };
  const restoreDraft = (draftId: number) => {
    const draft = encounter?.drafts.find((item) => item.id === draftId);
    const currentVersion = encounter
      ? currentVersionForRestore(encounter, draftId)
      : null;
    if (!draft || !encounter || currentVersion === null) {
      setActionError(
        "The current document revision is unavailable. Reload the session before restoring history.",
      );
      return Promise.reject(
        new Error("Current document revision is required for restore."),
      );
    }
    return runMutation(
      "restore",
      async () => {
        const result = await api<{
          draft: ScribeDraft;
          document: ScribeDocument;
        }>(`/api/clinic/scribe/drafts/${draftId}/restore`, {
          method: "POST",
          body: { restore: { expected_version: currentVersion } },
        });
        if (
          isCurrent(scopeKey) &&
          selectedEncounterRef.current === encounter.id
        )
          setFollowCurrentDraftId(result.draft.id);
        if (
          isCurrent(scopeKey) &&
          selectedEncounterRef.current === encounter.id
        )
          await loadEncounter(encounter.id);
      },
      "Restore outcome is not confirmed. Reload the current revision before trying again.",
    );
  };
  const reviewSection = (
    draftId: number,
    sectionKey: ScribeDraftSection["section_key"],
    action: "accept" | "reject",
  ) => {
    const draft = encounter?.drafts.find((item) => item.id === draftId);
    if (!draft || !encounter) return Promise.resolve();
    return runMutation(
      `review:${sectionKey}`,
      async () => {
        await api(`/api/clinic/scribe/drafts/${draftId}/review`, {
          method: "POST",
          body: {
            review: {
              action,
              section_key: sectionKey,
              expected_version: draft.version,
            },
          },
        });
        if (
          isCurrent(scopeKey) &&
          selectedEncounterRef.current === encounter.id
        )
          await loadEncounter(encounter.id);
      },
      "Review outcome is not confirmed. Reload the current revision before another review action.",
    );
  };

  const approveDraft = (draftId: number, version: number) =>
    runMutation(
      "approve",
      async () => {
        await api(`/api/clinic/scribe/drafts/${draftId}/approve`, {
          method: "POST",
          body: { expected_version: version },
        });
        if (
          encounter &&
          isCurrent(scopeKey) &&
          selectedEncounterRef.current === encounter.id
        )
          await loadEncounter(encounter.id);
      },
      "Approval outcome is not confirmed. Reload the current revision before trying again.",
    );
  const exportDraft = (
    draftId: number,
    version: number,
    correctionTarget?: {
      noteId: number;
      revisionId: number;
      revisionNo: number;
    },
  ) => {
    const identity = `${draftId}:${version}`;
    const idempotencyKey =
      exportKeys.current.get(identity) || crypto.randomUUID();
    exportKeys.current.set(identity, idempotencyKey);
    return runMutation("export", async () => {
      await api(`/api/clinic/scribe/drafts/${draftId}/export`, {
        method: "POST",
        body: {
          export: {
            destination: "parent_record_adapter",
            idempotency_key: idempotencyKey,
            confirmed: true,
            expected_version: version,
            ...(correctionTarget
              ? {
                  existing_note_action: "append_correction",
                  encounter_note_id: correctionTarget.noteId,
                  expected_note_revision_id: correctionTarget.revisionId,
                  expected_note_revision: correctionTarget.revisionNo,
                  correction_reason: correctionReason.trim(),
                }
              : {}),
          },
        },
      });
      exportKeys.current.delete(identity);
      if (
        encounter &&
        isCurrent(scopeKey) &&
        selectedEncounterRef.current === encounter.id
      )
        await loadEncounter(encounter.id);
    });
  };
  const prepareExport = async (draftId: number, version: number) => {
    if (!encounter) return;
    const targetDraft = activeDraft(encounter, selectedDocumentId);
    if (
      !targetDraft ||
      targetDraft.id !== draftId ||
      targetDraft.version !== version
    ) {
      setActionError(
        "The selected Scribe revision changed. Review it again before exporting.",
      );
      return;
    }
    if (!encounter.clinical_encounter_id) {
      setConfirmation({
        kind: "export",
        draftId,
        draftVersion: version,
        draftOutputDigest: targetDraft.output_digest,
        encounterId: encounter.id,
        scopeKey,
      });
      return;
    }
    setPendingAction("chart-lookup");
    setActionError(null);
    try {
      const result = await api<{ notes: EncounterNoteSummary[] }>(
        `/api/clinic/encounters/${encounter.clinical_encounter_id}/notes`,
      );
      const signedSoapNotes = result.notes.filter(
        (note) =>
          note.note_kind === "soap" && note.current_revision_signed === true,
      );
      const matching = signedSoapNotes.filter(
        (note) =>
          note.current_template_id === "scribe-reviewed-soap" &&
          note.current_template_version === 1 &&
          note.current_revision_id != null &&
          note.latest_revision != null,
      );
      if (signedSoapNotes.length && matching.length !== 1) {
        setActionError(
          "A signed chart note exists, but it does not match this Scribe template. Open the chart to create a correction manually.",
        );
        return;
      }
      const target = matching[0];
      const correctionTarget =
        target &&
        typeof target.current_revision_id === "number" &&
        typeof target.latest_revision === "number"
          ? {
              noteId: target.id,
              revisionId: target.current_revision_id,
              revisionNo: target.latest_revision,
            }
          : undefined;
      setCorrectionReason("");
      setConfirmation({
        kind: "export",
        draftId,
        draftVersion: version,
        draftOutputDigest: targetDraft.output_digest,
        encounterId: encounter.id,
        scopeKey,
        ...(correctionTarget ? { correctionTarget } : {}),
      });
    } catch (reason) {
      setActionError(
        errorMessage(reason, "Unable to check the current chart note."),
      );
    } finally {
      if (isCurrent(scopeKey)) setPendingAction(null);
    }
  };
  const deleteEncounter = (id: number) =>
    runMutation(
      "delete",
      async () => {
        await api(`/api/clinic/scribe/encounters/${id}`, { method: "DELETE" });
        if (isCurrent(scopeKey) && selectedEncounterRef.current === id)
          await loadIndex();
      },
      "Deletion outcome is not confirmed. Reload the session list before trying again.",
    );

  const confirmAction = async () => {
    const value = confirmation;
    setConfirmation(null);
    if (!value) return;
    const draft = activeDraft(encounter, selectedDocumentId);
    const current =
      value.scopeKey === scopeKey &&
      value.encounterId === selectedEncounterRef.current &&
      (value.kind === "consent" || value.kind === "delete"
        ? encounter?.version === value.encounterVersion
        : draft?.id === value.draftId &&
          draft.version === value.draftVersion &&
          (value.kind !== "export" ||
            draft.output_digest === value.draftOutputDigest) &&
          !(
            recording.session?.encounterId === value.encounterId &&
            recording.state.active
          ));
    if (!current) {
      setActionError(
        "The selected session or revision changed. Review it again before confirming this action.",
      );
      return;
    }
    if (value.kind === "consent") await decideConsent(value.decision);
    if (value.kind === "approve")
      await approveDraft(value.draftId, value.draftVersion);
    if (value.kind === "export") {
      if (value.correctionTarget && !correctionReason.trim()) {
        setConfirmation(value);
        setActionError("Enter a reason before appending this correction.");
        return;
      }
      await exportDraft(
        value.draftId,
        value.draftVersion,
        value.correctionTarget,
      );
    }
    if (value.kind === "delete") await deleteEncounter(value.encounterId);
  };

  const draft = activeDraft(encounter, selectedDocumentId);
  const canWrite = capability(capabilities, "scribe_write");
  const canApprove = capability(capabilities, "scribe_approve");
  const canExport =
    capability(capabilities, "scribe_export") &&
    capability(capabilities, "notes_write") &&
    capability(capabilities, "notes_read");
  const canDelete = capability(capabilities, "scribe_delete");
  const deleted = Boolean(
    encounter?.deleted_at || encounter?.status === "deleted",
  );
  const processingAllowed =
    encounter?.consent_status === "accepted" && !deleted;
  const hasGrounding = Boolean(
    encounter?.context_content?.trim() ||
    encounter?.sources.some(({ status }) => status === "ready"),
  );
  const documents =
    encounter?.documents ??
    (draft
      ? [
          {
            id: draft.document_id ?? 0,
            template_id: draft.template_id,
            template_version: draft.template_version,
            status: draft.status,
            current_draft_id: draft.id,
            version: 1,
            current_revision: draft,
          },
        ]
      : []);
  const selectedSummary = summaries.find(
    ({ id }) => id === selectedEncounterId,
  );
  const patient = encounter?.patient ?? selectedSummary?.patient;
  const sameEncounterRecordingActive = Boolean(
    encounter &&
    recording.session?.encounterId === encounter.id &&
    recording.state.active,
  );
  const otherEncounterRecording = Boolean(
    recording.session && recording.session.encounterId !== encounter?.id,
  );
  const actionHints: string[] = [];
  if (!canWrite) {
    actionHints.push(
      "Scribe write access is required to create, edit, generate, or record documentation.",
    );
  } else {
    if (encounter && deleted) {
      actionHints.push(
        "This Scribe session is deleted and cannot be recorded or processed.",
      );
    } else if (encounter && !processingAllowed) {
      actionHints.push(
        "Accept recording consent on the Context tab before recording, importing a transcript, or generating a draft.",
      );
    }
    if (hasUnsavedContext) {
      actionHints.push(
        "Save or discard visit context before generating a draft or starting a recording.",
      );
    }
    if (hasUnsavedReviewEdits) {
      actionHints.push(
        "Save or discard note edits before generating another draft.",
      );
    }
    if (otherEncounterRecording) {
      actionHints.push(
        "Another Scribe session is recording. Finish it before starting a recording here.",
      );
    }
    if (encounter && processingAllowed && !hasGrounding) {
      actionHints.push(
        "Add visit context or a ready source to enable draft generation.",
      );
    }
    if (selectedDocumentId) {
      actionHints.push("Template selection is fixed for this saved document.");
    }
    if (encounter && processingAllowed && hasGrounding && !templateId) {
      actionHints.push("Select an active template before generating a draft.");
    }
  }
  const openRecordingDock = (startRecording: boolean) => {
    if (!encounter) return;
    if (recording.session?.encounterId === encounter.id && !startRecording) {
      recording.expand();
      return;
    }
    const opened = recording.begin(
      {
        encounterId: encounter.id,
        encounterVersion: encounter.version,
        processingAllowed,
        scopeKey: `${scopeKey}:${encounter.id}`,
        patientLabel:
          patient?.display_name ??
          patient?.reference ??
          `Session ${encounter.id}`,
        contextContent: encounter.context_content ?? "",
        returnPath: `/clinic/scribe?encounter_id=${encounter.id}&review=1`,
        treatmentPath:
          patient && encounter.clinical_encounter_id
            ? `/clinic/patients/${patient.id}/encounters/${encounter.clinical_encounter_id}`
            : undefined,
      },
      { startRecording },
    );
    if (!opened)
      setActionError(
        "Finish or discard the current recording before starting another.",
      );
  };
  const rail = (
    <ScribeSessionRail
      summaries={summaries}
      worklist={documentationWorklist}
      selectedId={selectedEncounterId}
      search={railSearch}
      disabled={
        Boolean(outcomeUnknown) ||
        pendingAction !== null ||
        hasUnsavedReviewEdits ||
        hasUnsavedContext ||
        Boolean(transcript.trim())
      }
      loadingMore={loadingMore}
      hasMore={page < totalPages}
      onSearchChange={setRailSearch}
      onSelect={selectEncounter}
      onOpenWorkItem={(href) => {
        if (navigate(href)) setRailOpen(false);
      }}
      onNewSession={beginNewSession}
      onLoadMore={() => void loadMore()}
    />
  );

  return (
    <Box
      sx={{
        display: "flex",
        height: { xs: "auto", md: "100dvh" },
        minHeight: { xs: 640, md: 620 },
        overflow: "hidden",
        backgroundColor: "background.paper",
      }}
    >
      {!compactRail && rail}
      <Drawer
        open={compactRail && railOpen}
        onClose={() => setRailOpen(false)}
        slotProps={{ paper: { sx: { width: 190 } } }}
      >
        {rail}
      </Drawer>
      <Stack sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        {(actionError ||
          outcomeUnknown ||
          hasUnsavedReviewEdits ||
          hasUnsavedContext) && (
          <Stack spacing={0}>
            {actionError && (
              <Alert severity="error" onClose={() => setActionError(null)}>
                {actionError}
              </Alert>
            )}
            {outcomeUnknown && (
              <Alert
                severity="warning"
                action={
                  <Button
                    color="inherit"
                    onClick={() => {
                      if (selectedEncounterRef.current) {
                        void loadEncounter(selectedEncounterRef.current);
                        return;
                      }
                      const target = scribeContextTarget(locationSearch);
                      if (target) void prepareContextualLaunch(target, true);
                      else void loadIndex();
                    }}
                  >
                    Reload
                  </Button>
                }
              >
                {outcomeUnknown}
              </Alert>
            )}
            {(hasUnsavedReviewEdits || hasUnsavedContext) && (
              <Alert
                severity="warning"
                action={
                  <Button
                    color="inherit"
                    disabled={pendingAction !== null}
                    onClick={() => {
                      setDiscardEditsToken((value) => value + 1);
                      setContextValue(contextBaseline);
                    }}
                  >
                    Discard edits
                  </Button>
                }
              >
                Unsaved changes must be saved or discarded before switching
                sessions.
              </Alert>
            )}
          </Stack>
        )}

        <Stack
          component="header"
          direction={{ xs: "column", lg: "row" }}
          sx={{
            minHeight: 94,
            alignItems: { xs: "stretch", lg: "flex-start" },
            justifyContent: "space-between",
            gap: 1.5,
            px: { xs: 1.5, sm: 2.25 },
            pt: 1.75,
            pb: 1,
          }}
        >
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "flex-start", minWidth: 0 }}
          >
            {compactRail && (
              <IconButton
                aria-label="Open session list"
                onClick={() => setRailOpen(true)}
                sx={{ mt: 0.25 }}
              >
                <MenuOutlinedIcon />
              </IconButton>
            )}
            {!newSession && (
              <Avatar
                sx={{
                  width: 26,
                  height: 26,
                  bgcolor: "background.paper",
                  color: "text.secondary",
                  border: 1,
                  borderColor: "divider",
                  fontSize: 14,
                  mt: 0.25,
                }}
              >
                {patient?.display_name?.trim().charAt(0).toUpperCase() ?? "P"}
              </Avatar>
            )}
            <Box sx={{ minWidth: 0, flex: 1 }}>
              {newSession ? (
                <ScribePatientPicker
                  value={selectedPatient}
                  onChange={setSelectedPatient}
                  disabled={
                    !canWrite ||
                    pendingAction !== null ||
                    contextualClinicalEncounterId !== null
                  }
                  scopeKey={scopeKey}
                />
              ) : (
                <>
                  <Typography
                    component="h1"
                    variant="h6"
                    sx={{ m: 0, overflowWrap: "anywhere" }}
                  >
                    {patient?.display_name ?? "Scribe"}
                  </Typography>
                  <Stack
                    direction="row"
                    spacing={1.5}
                    useFlexGap
                    sx={{
                      flexWrap: "wrap",
                      alignItems: "center",
                      color: "text.secondary",
                      mt: 0.5,
                    }}
                  >
                    <Stack
                      direction="row"
                      spacing={0.5}
                      sx={{ alignItems: "center" }}
                    >
                      <CalendarTodayOutlinedIcon sx={{ fontSize: 13 }} />
                      <Typography variant="body2">
                        {formatSessionDate(
                          encounter?.created_at ?? selectedSummary?.created_at,
                        )}
                      </Typography>
                    </Stack>
                    <Stack
                      direction="row"
                      spacing={0.5}
                      sx={{ alignItems: "center" }}
                    >
                      <LanguageOutlinedIcon sx={{ fontSize: 13 }} />
                      <Typography variant="body2">English</Typography>
                    </Stack>
                  </Stack>
                </>
              )}
            </Box>
          </Stack>
          {newSession ? (
            <Stack
              spacing={0.75}
              sx={{ alignItems: { xs: "stretch", sm: "flex-end" } }}
            >
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Button
                  variant="contained"
                  disabled={
                    !canWrite || !selectedPatient || pendingAction !== null
                  }
                  onClick={() =>
                    void (
                      sampleSession && !contextualClinicalEncounterId
                        ? createSyntheticEncounter()
                        : createEncounter()
                    ).catch(() => undefined)
                  }
                  sx={{ minHeight: 44 }}
                >
                  {pendingAction === "create" ||
                  pendingAction === "create-synthetic"
                    ? "Starting session…"
                    : contextualClinicalEncounterId
                      ? "Start linked session"
                      : "Start session"}
                </Button>
              </Stack>
              {!canWrite && (
                <Typography variant="body2" color="text.secondary">
                  {actionHints[0]}
                </Typography>
              )}
              {isDemoFrame() && !contextualClinicalEncounterId && (
                <Typography variant="body2" color="text.secondary">
                  {sampleSession
                    ? "Starts the guided sample visit session."
                    : "Starts a session for the selected patient."}{" "}
                  Recording is unavailable in this demo; supplied context and
                  transcripts can be reviewed.
                </Typography>
              )}
            </Stack>
          ) : (
            <Stack
              spacing={0.65}
              sx={{
                width: { xs: "100%", lg: "auto" },
                alignItems: { xs: "stretch", lg: "flex-end" },
              }}
            >
              <Stack
                direction="row"
                spacing={1}
                useFlexGap
                sx={{
                  width: "100%",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: { xs: "flex-start", lg: "flex-end" },
                }}
              >
                <FormControl
                  size="small"
                  sx={{
                    width: 148,
                    flex: "0 1 148px",
                    "& .MuiInputBase-root": { height: 44, fontSize: 16 },
                  }}
                  disabled={
                    !canWrite ||
                    pendingAction !== null ||
                    Boolean(selectedDocumentId)
                  }
                >
                  <InputLabel id="scribe-template-label">Template</InputLabel>
                  <Select
                    labelId="scribe-template-label"
                    label="Template"
                    value={templateId}
                    onChange={(event) => setTemplateId(event.target.value)}
                  >
                    {templates.map((template) => (
                      <MenuItem
                        key={`${template.id}:${template.version}`}
                        value={template.id}
                        disabled={template.status !== "active"}
                      >
                        {template.label}
                        {template.disabled_reason
                          ? ` — ${template.disabled_reason}`
                          : ""}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  variant="contained"
                  startIcon={<NoteAddOutlinedIcon sx={{ fontSize: 16 }} />}
                  disabled={
                    !canWrite ||
                    !encounter ||
                    !templateId ||
                    !processingAllowed ||
                    !hasGrounding ||
                    hasUnsavedContext ||
                    hasUnsavedReviewEdits ||
                    pendingAction !== null ||
                    Boolean(outcomeUnknown)
                  }
                  onClick={() => void generateDraft().catch(() => undefined)}
                  sx={{
                    minWidth: 140,
                    borderRadius: 1,
                    whiteSpace: "normal",
                  }}
                >
                  Generate draft
                </Button>
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<MicNoneOutlinedIcon sx={{ fontSize: 18 }} />}
                  disabled={
                    !canWrite ||
                    !encounter ||
                    !processingAllowed ||
                    hasUnsavedContext ||
                    pendingAction !== null ||
                    otherEncounterRecording
                  }
                  onClick={() =>
                    sameEncounterRecordingActive
                      ? recording.expand()
                      : openRecordingDock(true)
                  }
                  sx={{
                    minWidth: 136,
                    borderRadius: 1,
                    whiteSpace: "normal",
                  }}
                >
                  {sameEncounterRecordingActive
                    ? "Recording"
                    : isDemoFrame()
                      ? "Start recording"
                      : "Transcribe"}
                </Button>
              </Stack>
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: "center", pr: 0.25 }}
              >
                <MicNoneOutlinedIcon
                  sx={{
                    fontSize: 14,
                    color: sameEncounterRecordingActive
                      ? "success.main"
                      : "text.disabled",
                  }}
                />
                <Typography
                  variant="body2"
                  sx={{
                    minWidth: 34,
                    fontVariantNumeric: "tabular-nums",
                    color: "text.secondary",
                  }}
                >
                  {elapsedLabel(
                    sameEncounterRecordingActive
                      ? recording.state.elapsedMs
                      : 0,
                  )}
                </Typography>
                <ScribeAudioMeter
                  level={
                    sameEncounterRecordingActive
                      ? recording.state.inputLevel
                      : 0
                  }
                  active={sameEncounterRecordingActive}
                />
              </Stack>
              {actionHints.length > 0 && (
                <Stack spacing={0.25}>
                  {actionHints.map((hint) => (
                    <Typography
                      key={hint}
                      variant="caption"
                      color="text.secondary"
                    >
                      {hint}
                    </Typography>
                  ))}
                </Stack>
              )}
            </Stack>
          )}
        </Stack>

        {!newSession && (
          <Tabs
            value={activeTab}
            onChange={(_, value: string) => {
              const documentId = value.startsWith("document:")
                ? Number(value.split(":")[1])
                : undefined;
              const document = encounter?.documents?.find(
                ({ id }) => id === documentId,
              );
              if (document) setTemplateId(document.template_id);
              setFollowCurrentDraftId(null);
              setActiveTab(value);
            }}
            variant="scrollable"
            scrollButtons="auto"
            aria-label="Scribe session documents"
            sx={{
              px: { xs: 1, sm: 1.75 },
              minHeight: 44,
              borderBottom: 1,
              borderColor: "divider",
              "& .MuiTab-root": {
                minHeight: 44,
                minWidth: 80,
                px: 1.25,
                fontSize: 14,
                textTransform: "none",
              },
              "& .MuiTabs-indicator": { height: 2 },
            }}
          >
            <Tab value="context" label="Context" />
            <Tab value="transcript" label="Transcript" />
            {documents.map((document, index) => (
              <Tab
                key={document.id}
                value={`document:${document.id}`}
                label={
                  documents.length === 1
                    ? (templates.find(({ id }) => id === document.template_id)
                        ?.label ?? "SOAP")
                    : `${templates.find(({ id }) => id === document.template_id)?.label ?? "SOAP"} ${index + 1}`
                }
              />
            ))}
          </Tabs>
        )}

        <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          {newSession ? (
            <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 760 }}>
              <Typography component="h2" variant="h6" gutterBottom>
                Start a new session
              </Typography>
              <Typography color="text.secondary">
                {contextualClinicalEncounterId
                  ? `Start a Scribe session for the verified patient and visit #${contextualClinicalEncounterId}. Consent is still required before recording or processing.`
                  : "Choose the patient above, then add visit context or import a transcript."}
              </Typography>
            </Box>
          ) : activeTab === "context" ? (
            <Box
              sx={{
                p: { xs: 1, sm: 1.5 },
                height: "100%",
                overflowY: "auto",
                backgroundColor: "background.default",
              }}
            >
              <Stack
                spacing={1.25}
                sx={{
                  minHeight: "100%",
                  p: { xs: 1.5, sm: 2 },
                  borderRadius: 1.5,
                  backgroundColor: "background.paper",
                  boxShadow: "0 1px 10px rgba(45, 35, 39, 0.035)",
                }}
              >
                <Stack
                  direction="row"
                  sx={{ alignItems: "center", justifyContent: "space-between" }}
                >
                  <Typography component="h2" variant="subtitle1">
                    Visit context
                  </Typography>
                  <Stack direction="row" sx={{ alignItems: "center" }}>
                    <Button
                      size="small"
                      disabled={
                        !encounter ||
                        !hasUnsavedContext ||
                        pendingAction !== null ||
                        Boolean(outcomeUnknown)
                      }
                      onClick={() => void saveContext().catch(() => undefined)}
                      variant="outlined"
                      sx={{
                        minWidth: 64,
                        borderRadius: 1,
                      }}
                    >
                      {pendingAction === "context" ? "Saving…" : "Save context"}
                    </Button>
                  </Stack>
                </Stack>
                <TextField
                  fullWidth
                  multiline
                  minRows={12}
                  value={contextValue}
                  onChange={(event) => setContextValue(event.target.value)}
                  disabled={
                    !canWrite || !encounter || deleted || pendingAction !== null
                  }
                  placeholder="Reason for visit, known history, observations, and documentation context"
                  slotProps={{
                    input: { disableUnderline: true },
                    htmlInput: {
                      maxLength: 250000,
                      "aria-label": "Visit context",
                    },
                  }}
                  variant="standard"
                  sx={{
                    flex: 1,
                    "& .MuiInputBase-root": {
                      alignItems: "flex-start",
                      fontSize: 16,
                      lineHeight: 1.5,
                    },
                  }}
                />
                {encounter && (
                  <Box sx={{ borderTop: 1, borderColor: "divider", pt: 1 }}>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mb: 0.75 }}
                    >
                      Recording consent:{" "}
                      {encounter.consent_status.replaceAll("_", " ")}.
                    </Typography>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1}
                      useFlexGap
                      sx={{
                        flexWrap: "wrap",
                        "& .MuiButton-root": {
                          minHeight: 44,
                          px: 1.5,
                          borderRadius: 1,
                          whiteSpace: "normal",
                        },
                      }}
                    >
                      {encounter.consent_status !== "accepted" && (
                        <Button
                          size="small"
                          color="success"
                          variant="outlined"
                          disabled={pendingAction !== null || hasUnsavedContext}
                          onClick={() =>
                            setConfirmation({
                              kind: "consent",
                              decision: "accepted",
                              encounterId: encounter.id,
                              encounterVersion: encounter.version,
                              scopeKey,
                            })
                          }
                        >
                          Accept consent
                        </Button>
                      )}
                      {encounter.consent_status !== "declined" && (
                        <Button
                          size="small"
                          color="inherit"
                          variant="outlined"
                          disabled={pendingAction !== null || hasUnsavedContext}
                          onClick={() =>
                            setConfirmation({
                              kind: "consent",
                              decision: "declined",
                              encounterId: encounter.id,
                              encounterVersion: encounter.version,
                              scopeKey,
                            })
                          }
                        >
                          Decline consent
                        </Button>
                      )}
                      {encounter.consent_status === "accepted" && (
                        <Button
                          size="small"
                          color="warning"
                          variant="text"
                          disabled={pendingAction !== null || hasUnsavedContext}
                          onClick={() =>
                            setConfirmation({
                              kind: "consent",
                              decision: "withdrawn",
                              encounterId: encounter.id,
                              encounterVersion: encounter.version,
                              scopeKey,
                            })
                          }
                        >
                          Withdraw consent
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          size="small"
                          color="error"
                          variant="text"
                          disabled={pendingAction !== null || hasUnsavedContext}
                          onClick={() =>
                            setConfirmation({
                              kind: "delete",
                              encounterId: encounter.id,
                              encounterVersion: encounter.version,
                              scopeKey,
                            })
                          }
                        >
                          Delete session
                        </Button>
                      )}
                    </Stack>
                  </Box>
                )}
                {encounter && patient && (
                  <ScribeChartAndLabs
                    key={encounter.id}
                    scribeEncounterId={encounter.id}
                    patientId={patient.id}
                    clinicalEncounterId={encounter.clinical_encounter_id}
                    expectedVersion={encounter.version}
                    labSelections={encounter.lab_selections ?? []}
                    canBind={
                      canWrite &&
                      capabilities.notes_write === true &&
                      processingAllowed
                    }
                    canSelectLabs={
                      canWrite &&
                      capabilities.patients === true &&
                      capabilities.notes_read === true &&
                      processingAllowed
                    }
                    hasUnsavedReview={
                      hasUnsavedReviewEdits || hasUnsavedContext
                    }
                    onChanged={() => void loadEncounter(encounter.id)}
                  />
                )}
                <Box
                  sx={{
                    mt: "auto",
                    minHeight: 50,
                    border: "1px solid #ebe8e9",
                    borderRadius: 2,
                    display: "flex",
                    alignItems: "center",
                    px: 2,
                    color: "text.secondary",
                    boxShadow: "0 5px 18px rgba(47, 35, 40, 0.08)",
                  }}
                >
                  <Typography variant="body2">
                    Add context or edit your note above…
                  </Typography>
                </Box>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  align="center"
                >
                  Medical knowledge only. Check sources and use your clinical
                  judgment.
                </Typography>
              </Stack>
            </Box>
          ) : activeTab === "transcript" ? (
            <Box
              sx={{
                p: { xs: 2, sm: 3 },
                maxWidth: 840,
                height: "100%",
                overflowY: "auto",
              }}
            >
              <Stack spacing={2}>
                <Box>
                  <Typography component="h2" variant="h6">
                    Transcript
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Record the session or import an authorized transcript as
                    source evidence. Finishing a recording creates a transcript
                    and review-required SOAP draft when OpenRouter is available.
                  </Typography>
                </Box>
                {canWrite && encounter && (
                  <Box
                    sx={{
                      p: 2,
                      border: 1,
                      borderColor: "divider",
                      borderRadius: 1.5,
                      backgroundColor: "action.hover",
                    }}
                  >
                    <Stack
                      direction={{ xs: "column", md: "row" }}
                      spacing={1.5}
                      sx={{
                        alignItems: { xs: "stretch", md: "center" },
                        justifyContent: "space-between",
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle2">
                          Record this session
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Recording stays available in the clinic bar while you
                          move between pages. Finish it to return to this note.
                        </Typography>
                      </Box>
                      {sameEncounterRecordingActive ? (
                        <Button
                          variant="outlined"
                          startIcon={<MicNoneOutlinedIcon />}
                          onClick={recording.expand}
                          sx={{
                            alignSelf: { xs: "stretch", md: "auto" },
                            whiteSpace: "nowrap",
                          }}
                        >
                          Open recording bar
                        </Button>
                      ) : (
                        <Stack
                          direction={{ xs: "column", sm: "row" }}
                          spacing={1}
                          sx={{ flexShrink: 0 }}
                        >
                          <Button
                            variant="text"
                            disabled={
                              hasUnsavedContext ||
                              pendingAction !== null ||
                              otherEncounterRecording
                            }
                            onClick={() => openRecordingDock(false)}
                            sx={{ whiteSpace: "nowrap" }}
                          >
                            Open visit notes
                          </Button>
                          <Button
                            variant="outlined"
                            startIcon={<MicNoneOutlinedIcon />}
                            disabled={
                              !processingAllowed ||
                              hasUnsavedContext ||
                              pendingAction !== null ||
                              otherEncounterRecording
                            }
                            onClick={() => openRecordingDock(true)}
                            sx={{ whiteSpace: "nowrap" }}
                          >
                            {otherEncounterRecording
                              ? "Recording another session"
                              : "Start recording"}
                          </Button>
                        </Stack>
                      )}
                    </Stack>
                  </Box>
                )}
                {encounter?.sources.map((source) => (
                  <Box
                    key={source.id}
                    sx={{ py: 1.5, borderBottom: 1, borderColor: "divider" }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      {source.metadata.provider === "openrouter"
                        ? "Recorded transcript"
                        : "Imported source"}{" "}
                      · {source.status.replaceAll("_", " ")}
                    </Typography>
                    <Typography
                      sx={{ mt: 0.5, whiteSpace: "pre-wrap", lineHeight: 1.65 }}
                    >
                      {source.content ?? "Transcript content unavailable."}
                    </Typography>
                  </Box>
                ))}
                <TextField
                  label="Import transcript"
                  multiline
                  minRows={8}
                  value={transcript}
                  onChange={(event) => setTranscript(event.target.value)}
                  disabled={!processingAllowed || pendingAction !== null}
                  helperText={
                    processingAllowed
                      ? "Review the transcript before import. Imported text becomes protected source evidence."
                      : "Accepted consent is required before transcript import."
                  }
                  slotProps={{ htmlInput: { maxLength: 250000 } }}
                />
                <Button
                  variant="contained"
                  sx={{ alignSelf: "flex-start" }}
                  disabled={
                    !processingAllowed ||
                    !transcript.trim() ||
                    hasUnsavedReviewEdits ||
                    hasUnsavedContext ||
                    pendingAction !== null ||
                    Boolean(outcomeUnknown)
                  }
                  onClick={() => void importSource().catch(() => undefined)}
                >
                  Import transcript
                </Button>
              </Stack>
            </Box>
          ) : (
            <ScribeReviewWorkspace
              key={`${scopeKey}:${selectedEncounterId ?? "none"}:${selectedDocumentId ?? "none"}`}
              state={reviewState}
              documentId={selectedDocumentId}
              followCurrentDraftId={followCurrentDraftId}
              pendingAction={pendingAction}
              onUnsavedEditsChange={setHasUnsavedReviewEdits}
              discardEditsToken={discardEditsToken}
              onRetry={() =>
                selectedEncounterRef.current
                  ? void loadEncounter(selectedEncounterRef.current)
                  : void loadIndex()
              }
              onSaveDraft={canWrite ? saveDraft : undefined}
              onRestoreDraft={canWrite ? restoreDraft : undefined}
              onAcceptSection={
                canWrite
                  ? (draftId, section) =>
                      reviewSection(draftId, section, "accept")
                  : undefined
              }
              onRejectSection={
                canWrite
                  ? (draftId, section) =>
                      reviewSection(draftId, section, "reject")
                  : undefined
              }
              onApprove={
                canApprove &&
                draft &&
                encounter &&
                !sameEncounterRecordingActive
                  ? (draftId) =>
                      setConfirmation({
                        kind: "approve",
                        draftId,
                        draftVersion: draft.version,
                        encounterId: encounter.id,
                        scopeKey,
                      })
                  : undefined
              }
              onExport={
                canExport && draft && encounter && !sameEncounterRecordingActive
                  ? (draftId) => void prepareExport(draftId, draft.version)
                  : undefined
              }
            />
          )}
        </Box>
      </Stack>

      <Dialog
        open={confirmation !== null}
        onClose={() => pendingAction === null && setConfirmation(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Confirm scribe action</DialogTitle>
        <DialogContent>
          <Typography>
            {confirmation?.kind === "approve" &&
              "Approve this exact current revision after confirming every section against its source evidence?"}
            {confirmation?.kind === "export" &&
              (confirmation.correctionTarget
                ? `Append this approved Scribe revision as a correction to chart note #${confirmation.correctionTarget.noteId}, revision ${confirmation.correctionTarget.revisionNo}? The signed note remains unchanged.`
                : `Save this reviewed draft as an unsigned note in ${patient?.display_name ?? "this patient"}'s visit? Signing remains a separate action.`)}
            {confirmation?.kind === "delete" &&
              "Delete this session content under the configured retention workflow? This cannot be undone here."}
            {confirmation?.kind === "consent" &&
              `Record the in-person consent decision as ${confirmation.decision.replaceAll("_", " ")}?`}
          </Typography>
          {confirmation?.kind === "export" && confirmation.correctionTarget && (
            <TextField
              autoFocus
              fullWidth
              required
              label="Reason for correction"
              value={correctionReason}
              onChange={(event) => setCorrectionReason(event.target.value)}
              multiline
              minRows={3}
              slotProps={{ htmlInput: { maxLength: 2_000 } }}
              helperText="This reason is saved with the appended correction."
              sx={{ mt: 2 }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button
            disabled={pendingAction !== null}
            onClick={() => {
              setConfirmation(null);
              setCorrectionReason("");
            }}
          >
            Cancel
          </Button>
          <Button
            color={confirmation?.kind === "delete" ? "error" : "primary"}
            variant="contained"
            disabled={
              pendingAction !== null ||
              (confirmation?.kind === "export" &&
                Boolean(confirmation.correctionTarget) &&
                !correctionReason.trim())
            }
            onClick={() => void confirmAction().catch(() => undefined)}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export const ScribeReviewPage = LiveScribeReviewWorkspace;
