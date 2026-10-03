import type {
  EncounterDetail,
  EncounterNote,
  NoteTemplate,
  SoapNoteSections,
} from "../../api/contracts";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, currentLoginDestination } from "../../api/client";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { ErrorMessage, LoadState, useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";
import { useClinicNavigation } from "./clinicNavigation";
import { ReviewOfSystems } from "./ReviewOfSystems";
import { HistoryOfPresentIllness } from "./HistoryOfPresentIllness";
import { appendPrevisitNote, PrevisitNoteImport } from "./PrevisitNoteImport";
import { EncounterNoteSigning } from "./EncounterNoteSigning";
import { useWorkingDraft } from "./useWorkingDraft";
import {
  encounterDetailPath,
  operationReceiptPath,
  noteSaveRequestKey,
  noteSaveRequestBody,
  encounterNoteRefreshMatches,
  noteReceiptMatches,
  noteReconciliationMatches,
  type OperationReceipt,
  EMPTY_SOAP_SECTIONS,
  SOAP_SECTION_LABELS,
  hasSoapContent,
  type NoteSaveState,
  noteSaveAllowsMutation,
  type NoteSaveAttempt,
  type CorrectionTarget,
  type SoapEditorBaseline,
  type SoapWorkingDraft,
  validSoapSections,
  validSessionDuration,
  noteAttemptMatchesContext,
  NoteReconciliationError,
  isUnknownNoteSaveError,
  templateWouldOverwrite,
  hasTemplatePrompts,
  applySoapTemplate,
} from "./careFlowState";

export function SoapNoteForm({
  encounterId,
  patientId,
  patientName,
  note,
  templates,
  canWrite,
  canSign = false,
  onCreated,
  onRefresh,
}: {
  encounterId: number;
  patientId?: number;
  patientName?: string;
  note?: EncounterNote;
  templates: NoteTemplate[];
  canWrite: boolean;
  canSign?: boolean;
  onCreated?: (note: EncounterNote) => void;
  onRefresh?: () => void;
}) {
  const { registerBlocker } = useClinicNavigation();
  const [savedNote, setSavedNote] = useState(note);
  const currentNote =
    savedNote &&
    savedNote.id === note?.id &&
    (savedNote.current_revision?.revision_no ?? 0) >
      (note?.current_revision?.revision_no ?? 0)
      ? savedNote
      : note;
  const savedBody = currentNote?.current_revision?.body;
  const workingDraft = useWorkingDraft<SoapWorkingDraft>({
    kind: "soap",
    patientId,
    encounterId,
    enabled: canWrite,
  });
  const initialBaseline = (): SoapEditorBaseline => ({
    noteId: currentNote?.id ?? null,
    revisionId: currentNote?.current_revision?.id ?? null,
    revisionNo: currentNote?.current_revision?.revision_no ?? null,
    sections: savedBody?.sections ?? EMPTY_SOAP_SECTIONS,
    patientInstructions: savedBody?.patient_instructions ?? "",
    sessionDurationMinutes: savedBody?.session_duration_minutes ?? null,
    template: savedBody
      ? { id: savedBody.template_id, version: savedBody.template_version }
      : null,
  });
  const [baseline, setBaseline] = useState<SoapEditorBaseline>(initialBaseline);
  const [sections, setSections] = useState<SoapNoteSections>(baseline.sections);
  const [patientInstructions, setPatientInstructions] = useState(
    baseline.patientInstructions,
  );
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState<
    number | null
  >(baseline.sessionDurationMinutes);
  const [appliedTemplate, setAppliedTemplate] = useState<{
    id: string;
    version: number;
  } | null>(baseline.template);
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    templates[0]?.id ?? "",
  );
  const [templateConfirmation, setTemplateConfirmation] =
    useState<NoteTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saveState, setSaveState] = useState<NoteSaveState>("idle");
  const [resetConfirmation, setResetConfirmation] = useState(false);
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const [correctionDialogOpen, setCorrectionDialogOpen] = useState(false);
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionConfirmed, setCorrectionConfirmed] = useState(false);
  const [correctionTarget, setCorrectionTarget] =
    useState<CorrectionTarget | null>(null);
  const [incomingNote, setIncomingNote] = useState<EncounterNote | null>(null);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [historyRevisionId, setHistoryRevisionId] = useState<number | null>(
    null,
  );
  const historyRevision = currentNote?.revisions.find(
    (revision) => revision.id === historyRevisionId,
  );
  const [replaceWorkingCopy, setReplaceWorkingCopy] = useState(false);
  const saveAttemptRef = useRef<NoteSaveAttempt | null>(null);
  const restoredDraft = useRef(false);
  const resetAfterDraftReload = useRef(false);
  const skipNextDraftSave = useRef(false);
  const draftSaveTimer = useRef<number | null>(null);
  const hasWorkingDraftEdits = useRef(false);
  const [workingCopyPending, setWorkingCopyPending] = useState(false);
  const workingCopyGeneration = useRef(0);
  const latestWorkingSnapshot = useRef<string | null>(null);
  const templateChanged =
    appliedTemplate?.id !== baseline.template?.id ||
    appliedTemplate?.version !== baseline.template?.version;
  const dirty =
    SOAP_SECTION_LABELS.some(
      ([key]) => sections[key] !== baseline.sections[key],
    ) ||
    patientInstructions !== baseline.patientInstructions ||
    sessionDurationMinutes !== baseline.sessionDurationMinutes ||
    templateChanged;
  const signed = currentNote?.current_revision?.signed === true;
  const editorDisabled =
    busy ||
    !workingDraft.ready ||
    !noteSaveAllowsMutation(saveState) ||
    Boolean(incomingNote) ||
    (signed && !correctionTarget) ||
    !canWrite;
  const selectedTemplate =
    templates.find((template) => template.id === selectedTemplateId) ?? null;
  const saveRequirement = !appliedTemplate
    ? templates.length
      ? "Choose a SOAP template, then use it without prompts or apply its prompts before saving."
      : "No SOAP template is available. A supported template is required to save a chart draft."
    : !hasSoapContent(sections)
      ? "Enter note content before saving a chart draft."
      : "";

  const applyTemplate = (template: NoteTemplate) => {
    if (!hasTemplatePrompts(template)) {
      setNotice(
        `${template.label} contains no prompt text. Select it without prompts; your note text is unchanged.`,
      );
      return;
    }
    setSections((current) => applySoapTemplate(current, template));
    setAppliedTemplate({ id: template.id, version: template.version });
    setNotice(
      `${template.label} prompts were added. Review and replace every prompt with this encounter's recorded facts.`,
    );
  };

  const requestTemplateApplication = () => {
    if (!selectedTemplate || editorDisabled) return;
    if (templateWouldOverwrite(sections, selectedTemplate)) {
      setTemplateConfirmation(selectedTemplate);
      return;
    }
    applyTemplate(selectedTemplate);
  };
  const workingSnapshot = (
    pendingAttempt = saveAttemptRef.current,
  ): SoapWorkingDraft | null =>
    patientId == null
      ? null
      : {
          schema_version: 1,
          patient_id: patientId,
          encounter_id: encounterId,
          baseline,
          sections,
          patient_instructions: patientInstructions,
          session_duration_minutes: sessionDurationMinutes,
          applied_template: appliedTemplate,
          correction_target: correctionTarget,
          pending_attempt: pendingAttempt,
        };
  latestWorkingSnapshot.current = JSON.stringify(workingSnapshot());

  const persistWorkingSnapshot = async (snapshot: SoapWorkingDraft) => {
    const generation = ++workingCopyGeneration.current;
    const encoded = JSON.stringify(snapshot);
    setWorkingCopyPending(true);
    const acknowledged = await workingDraft.save(snapshot);
    if (
      acknowledged &&
      generation === workingCopyGeneration.current &&
      encoded === latestWorkingSnapshot.current
    )
      setWorkingCopyPending(false);
    return acknowledged;
  };

  const cancelPendingDraftSave = () => {
    if (draftSaveTimer.current !== null) {
      window.clearTimeout(draftSaveTimer.current);
      draftSaveTimer.current = null;
    }
  };

  const reloadWorkingDraft = () => {
    cancelPendingDraftSave();
    setReplaceWorkingCopy(false);
    restoredDraft.current = false;
    workingDraft.reload();
  };

  const retryWorkingDraft = async () => {
    cancelPendingDraftSave();
    const snapshot = workingSnapshot();
    if (!snapshot || !(await persistWorkingSnapshot(snapshot)))
      setError(
        "The current working note is still only in this window. Keep it open and retry when the connection is available.",
      );
  };

  useEffect(() => {
    if (!workingDraft.ready || restoredDraft.current) return;
    restoredDraft.current = true;
    const restored = workingDraft.restored;
    if (
      !restored ||
      patientId == null ||
      restored.schema_version !== 1 ||
      restored.patient_id !== patientId ||
      restored.encounter_id !== encounterId ||
      !restored.baseline ||
      !validSoapSections(restored.baseline.sections) ||
      !validSoapSections(restored.sections) ||
      typeof restored.patient_instructions !== "string" ||
      !validSessionDuration(restored.baseline.sessionDurationMinutes) ||
      !validSessionDuration(restored.session_duration_minutes) ||
      (restored.pending_attempt !== null &&
        !noteAttemptMatchesContext(
          restored.pending_attempt,
          restored.baseline,
          encounterId,
        ))
    ) {
      if (restored)
        setError(
          "The protected working note did not match this editor version and was not loaded.",
        );
      return;
    }
    skipNextDraftSave.current = true;
    setBaseline({
      ...restored.baseline,
      sessionDurationMinutes: restored.baseline.sessionDurationMinutes ?? null,
    });
    setSections(restored.sections);
    setPatientInstructions(restored.patient_instructions);
    setSessionDurationMinutes(restored.session_duration_minutes ?? null);
    setAppliedTemplate(restored.applied_template);
    setCorrectionTarget(restored.correction_target);
    saveAttemptRef.current = restored.pending_attempt;
    if (restored.pending_attempt) {
      setRequestKey(restored.pending_attempt.requestKey);
      setSaveState("outcome_unconfirmed");
      setError(
        "A submitted note save was restored. Check its retained status before continuing.",
      );
    }
    if (
      note?.id !== restored.baseline.noteId ||
      note?.current_revision?.revision_no !== restored.baseline.revisionNo
    ) {
      setIncomingNote(note ?? null);
    }
  }, [encounterId, note, patientId, workingDraft.ready, workingDraft.restored]);

  useEffect(() => {
    if (!workingDraft.ready || !resetAfterDraftReload.current) return;
    resetAfterDraftReload.current = false;
    const restored = workingDraft.restored;
    if (!restored) {
      saveAttemptRef.current = null;
      setRequestKey(null);
      setSaveState("idle");
      setError("");
      setBusy(false);
      return;
    }
    if (
      patientId == null ||
      restored.schema_version !== 1 ||
      restored.patient_id !== patientId ||
      restored.encounter_id !== encounterId ||
      !restored.baseline ||
      !validSoapSections(restored.baseline.sections) ||
      !validSoapSections(restored.sections) ||
      typeof restored.patient_instructions !== "string"
    ) {
      setError(
        "The latest protected working note did not match this encounter. The save attempt was not reset.",
      );
      setBusy(false);
      return;
    }
    void workingDraft
      .save({ ...restored, pending_attempt: null })
      .then((saved) => {
        if (!saved) {
          setError(
            "The latest protected working note changed again before its pending save could be cleared.",
          );
          return;
        }
        saveAttemptRef.current = null;
        setRequestKey(null);
        setSaveState("idle");
        setError("");
      })
      .finally(() => setBusy(false));
  }, [
    encounterId,
    patientId,
    workingDraft.ready,
    workingDraft.restored,
    workingDraft.save,
  ]);

  useEffect(() => {
    const revision = note?.current_revision;
    if (!revision?.body || revision.revision_no === baseline.revisionNo) return;
    if (
      dirty ||
      correctionTarget ||
      saveAttemptRef.current ||
      workingDraft.status === "saving" ||
      workingDraft.status === "conflict"
    ) {
      setIncomingNote(note ?? null);
      return;
    }
    const next = initialBaseline();
    setBaseline(next);
    setSections(next.sections);
    setPatientInstructions(next.patientInstructions);
    setSessionDurationMinutes(next.sessionDurationMinutes);
    setAppliedTemplate(next.template);
    setIncomingNote(null);
  }, [note?.current_revision?.id, note?.current_revision?.revision_no]);

  useEffect(() => {
    if (busy || !workingDraft.ready || !restoredDraft.current) return;
    if (dirty || correctionTarget || saveAttemptRef.current)
      hasWorkingDraftEdits.current = true;
    if (skipNextDraftSave.current) {
      skipNextDraftSave.current = false;
      return;
    }
    // Returning to the baseline is also a working-copy change: otherwise a
    // previously autosaved keystroke can reappear on the next reload.
    if (!hasWorkingDraftEdits.current) return;
    const snapshot = workingSnapshot();
    if (!snapshot) return;
    cancelPendingDraftSave();
    setWorkingCopyPending(true);
    draftSaveTimer.current = window.setTimeout(
      () => {
        draftSaveTimer.current = null;
        void persistWorkingSnapshot(snapshot);
      },
      dirty ? 650 : 0,
    );
    return cancelPendingDraftSave;
  }, [
    appliedTemplate,
    baseline,
    busy,
    correctionTarget,
    dirty,
    patientInstructions,
    sessionDurationMinutes,
    sections,
    workingDraft.ready,
  ]);

  useEffect(() => {
    if ((!dirty && !workingCopyPending) || typeof window === "undefined")
      return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, workingCopyPending]);

  useEffect(
    () =>
      registerBlocker(
        dirty || workingCopyPending
          ? () =>
              dirty
                ? "This SOAP draft has unsaved changes. Leave the chart and discard them?"
                : "The latest working-note changes are not confirmed for refresh recovery. Leave the chart and discard them?"
          : null,
      ),
    [dirty, workingCopyPending, registerBlocker],
  );

  const save = async () => {
    if (
      !appliedTemplate ||
      busy ||
      !noteSaveAllowsMutation(saveState) ||
      incomingNote ||
      (signed && !correctionTarget) ||
      !canWrite ||
      (!dirty && !correctionTarget)
    )
      return;
    cancelPendingDraftSave();
    const operationCode = correctionTarget
      ? "notes.correct"
      : baseline.noteId
        ? "notes.revise"
        : "notes.create";
    const fields = {
      template_id: appliedTemplate.id,
      template_version: appliedTemplate.version,
      ...sections,
      patient_instructions: patientInstructions,
      session_duration_minutes: sessionDurationMinutes,
    };
    const requestKey = noteSaveRequestKey(
      saveAttemptRef.current?.requestKey ?? null,
    );
    const noteId = baseline.noteId;
    const endpoint =
      operationCode === "notes.create"
        ? `/api/clinic/encounters/${encounterId}/notes`
        : operationCode === "notes.correct"
          ? `/api/clinic/notes/${noteId}/corrections`
          : `/api/clinic/notes/${noteId}/revisions`;
    const attempt: NoteSaveAttempt = {
      requestKey,
      operationCode,
      noteId,
      expectedRevision: correctionTarget
        ? correctionTarget.revisionNo + 1
        : baseline.revisionNo
          ? baseline.revisionNo + 1
          : 1,
      endpoint,
      body: noteSaveRequestBody(
        operationCode,
        fields,
        requestKey,
        baseline.revisionNo ?? undefined,
        correctionTarget
          ? {
              reason: correctionTarget.reason,
              expectedRevisionId: correctionTarget.revisionId,
              expectedRevision: correctionTarget.revisionNo,
            }
          : undefined,
      ),
    };
    saveAttemptRef.current = attempt;
    setRequestKey(attempt.requestKey);
    setBusy(true);
    setError("");
    setNotice("");
    setSaveState("saving");
    try {
      const snapshot = workingSnapshot(attempt);
      if (!snapshot || !(await workingDraft.save(snapshot))) {
        setSaveState("idle");
        setError(
          "The working note was not saved. The official save was stopped so this documentation remains recoverable.",
        );
        return;
      }
      if (
        (attempt.operationCode === "notes.revise" ||
          attempt.operationCode === "notes.correct") &&
        attempt.noteId
      ) {
        await api<{ revision: { revision_no: number } }>(attempt.endpoint, {
          method: "POST",
          body: attempt.body,
        });
      } else {
        const result = await api<{ note: EncounterNote }>(attempt.endpoint, {
          method: "POST",
          body: attempt.body,
        });
        attempt.noteId = result.note.id;
      }
      const reconciled = await reconcileNoteSave(attempt);
      await completeNoteSave(attempt, reconciled);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        window.location.replace(
          `/login?next=${encodeURIComponent(currentLoginDestination())}`,
        );
        return;
      }
      if (isUnknownNoteSaveError(caught)) {
        setSaveState("outcome_unconfirmed");
        setError(
          "Save outcome not confirmed. No automatic retry was made; check the retained save status explicitly.",
        );
      } else {
        setSaveState("rejected");
        setError(
          caught instanceof Error ? caught.message : "The draft was rejected.",
        );
        if (
          caught instanceof ApiError &&
          (caught.code === "stale_record" || caught.code === "already_exists")
        )
          onRefresh?.();
      }
    } finally {
      setBusy(false);
    }
  };

  const reconcileNoteSave = async (
    attempt: NoteSaveAttempt,
  ): Promise<EncounterNote> => {
    setSaveState("reconciling");
    const exactPatientId = patientId ?? currentNote?.patient_id;
    if (exactPatientId === undefined) {
      throw new NoteReconciliationError(
        "The saved draft cannot be reconciled without the selected patient.",
      );
    }
    try {
      let exactEncounter: EncounterDetail | undefined;
      let exactNoteId = attempt.noteId;
      if (exactNoteId === null) {
        const encounterResult = await api<{ encounter: EncounterDetail }>(
          encounterDetailPath(exactPatientId, encounterId),
        );
        exactEncounter = encounterResult.encounter;
        if (
          exactEncounter.id !== encounterId ||
          exactEncounter.patient_id !== exactPatientId
        )
          throw new NoteReconciliationError(
            "The refreshed encounter did not match the selected patient and encounter.",
          );
        const candidates = exactEncounter.notes.filter(
          (candidate) =>
            candidate.note_kind === "soap" &&
            candidate.latest_revision === attempt.expectedRevision,
        );
        if (candidates.length !== 1)
          throw new NoteReconciliationError(
            "The committed draft could not be matched to exactly one SOAP note.",
          );
        exactNoteId = candidates[0].id;
      }
      const noteResult = await api<{ note: EncounterNote }>(
        `/api/clinic/notes/${exactNoteId}`,
      );
      if (
        !noteReconciliationMatches(
          noteResult.note,
          exactPatientId,
          encounterId,
          exactNoteId,
          attempt.expectedRevision,
        )
      )
        throw new NoteReconciliationError(
          "The refreshed note did not match the selected patient, encounter, unsigned SOAP note, or expected revision.",
        );
      if (!exactEncounter) {
        const encounterResult = await api<{ encounter: EncounterDetail }>(
          encounterDetailPath(exactPatientId, encounterId),
        );
        exactEncounter = encounterResult.encounter;
      }
      if (
        !encounterNoteRefreshMatches(
          exactEncounter,
          exactPatientId,
          encounterId,
          exactNoteId,
        )
      )
        throw new NoteReconciliationError(
          "The refreshed encounter did not contain the expected SOAP note.",
        );
      attempt.noteId = exactNoteId;
      return noteResult.note;
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) throw caught;
      if (caught instanceof NoteReconciliationError) throw caught;
      throw new NoteReconciliationError(
        "The committed draft could not be refreshed and verified. The outcome remains unconfirmed.",
      );
    }
  };

  const completeNoteSave = async (
    attempt: NoteSaveAttempt,
    reconciled: EncounterNote,
  ) => {
    cancelPendingDraftSave();
    setSavedNote(reconciled);
    const body = reconciled.current_revision?.body;
    if (body) {
      setSections(body.sections);
      setPatientInstructions(body.patient_instructions ?? "");
      setAppliedTemplate({
        id: body.template_id,
        version: body.template_version,
      });
      setBaseline({
        noteId: reconciled.id,
        revisionId: reconciled.current_revision?.id ?? null,
        revisionNo: reconciled.current_revision?.revision_no ?? null,
        sections: body.sections,
        patientInstructions: body.patient_instructions ?? "",
        sessionDurationMinutes: body.session_duration_minutes ?? null,
        template: {
          id: body.template_id,
          version: body.template_version,
        },
      });
    }
    if (!(await workingDraft.clear())) {
      setSaveState("outcome_unconfirmed");
      setError(
        "The note was saved, but its recovery copy could not be cleared. Check the retained save status to finish reconciliation.",
      );
      return;
    }
    hasWorkingDraftEdits.current = false;
    workingCopyGeneration.current += 1;
    setWorkingCopyPending(false);
    setSaveState("idle");
    setNotice(
      attempt.operationCode === "notes.correct"
        ? `Unsigned correction revision ${attempt.expectedRevision} saved after note and encounter verification. Review and sign it separately.`
        : `Unsigned draft ${attempt.operationCode === "notes.create" ? "created" : `revision ${attempt.expectedRevision} saved`} after note and encounter verification.`,
    );
    saveAttemptRef.current = null;
    setRequestKey(null);
    if (attempt.operationCode === "notes.correct") setCorrectionTarget(null);
    if (attempt.operationCode === "notes.create") onCreated?.(reconciled);
    else onRefresh?.();
  };

  const checkSaveStatus = async () => {
    const attempt = saveAttemptRef.current;
    if (busy || !attempt) return;
    setBusy(true);
    setError("");
    setSaveState("reconciling");
    try {
      const expectedResourceId =
        attempt.operationCode === "notes.create" ? encounterId : attempt.noteId;
      if (expectedResourceId === null)
        throw new NoteReconciliationError(
          "The retained save attempt has no note identity to reconcile.",
        );
      const result = await api<{ receipt: OperationReceipt }>(
        operationReceiptPath(attempt.requestKey),
      );
      if (
        !noteReceiptMatches(
          result.receipt,
          attempt.operationCode,
          expectedResourceId,
        )
      )
        throw new NoteReconciliationError(
          "The saved status did not match this note. The outcome remains unconfirmed.",
        );
      if (result.receipt.outcome !== "committed") {
        setSaveState("outcome_unconfirmed");
        setError(
          "The saved status is still unconfirmed. The draft remains protected and no automatic retry was made.",
        );
        return;
      }
      const reconciled = await reconcileNoteSave(attempt);
      await completeNoteSave(attempt, reconciled);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        window.location.replace(
          `/login?next=${encodeURIComponent(currentLoginDestination())}`,
        );
        return;
      }
      if (caught instanceof ApiError && caught.status === 404) {
        setSaveState("not_found");
        setError(
          "No saved result was found for this attempt. The outcome remains unconfirmed; reset only after checking the note.",
        );
      } else if (isUnknownNoteSaveError(caught)) {
        setSaveState("outcome_unconfirmed");
        setError(
          "The save outcome remains unconfirmed. No automatic retry was made; check the retained save status again.",
        );
      } else {
        setSaveState("rejected");
        setError(
          caught instanceof Error
            ? caught.message
            : "The save status request was rejected.",
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const retryExactNoteSave = async () => {
    const attempt = saveAttemptRef.current;
    if (busy || !attempt || saveState !== "not_found") return;
    cancelPendingDraftSave();
    setBusy(true);
    setError("");
    setSaveState("saving");
    try {
      const snapshot = workingSnapshot(attempt);
      if (!snapshot || !(await workingDraft.save(snapshot))) {
        setSaveState("not_found");
        setError(
          "The exact save attempt could not be preserved. Reload the working note before retrying.",
        );
        return;
      }
      await api(attempt.endpoint, { method: "POST", body: attempt.body });
      const reconciled = await reconcileNoteSave(attempt);
      await completeNoteSave(attempt, reconciled);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        window.location.replace(
          `/login?next=${encodeURIComponent(currentLoginDestination())}`,
        );
        return;
      }
      setSaveState(
        isUnknownNoteSaveError(caught) ? "outcome_unconfirmed" : "rejected",
      );
      setError(
        caught instanceof Error
          ? caught.message
          : "The exact note save could not be reconciled.",
      );
      if (
        caught instanceof ApiError &&
        (caught.code === "stale_record" || caught.code === "already_exists")
      )
        onRefresh?.();
    } finally {
      setBusy(false);
    }
  };

  const resetSaveAttempt = async () => {
    if (busy || !saveAttemptRef.current) return;
    cancelPendingDraftSave();
    setResetConfirmation(false);
    setBusy(true);
    const snapshot = workingSnapshot(null);
    if (!snapshot || !(await workingDraft.save(snapshot))) {
      resetAfterDraftReload.current = true;
      restoredDraft.current = false;
      workingDraft.reload();
      return;
    }
    saveAttemptRef.current = null;
    setRequestKey(null);
    setSaveState("idle");
    setError("");
    setBusy(false);
  };

  const startCorrection = () => {
    if (!currentNote || !savedBody || !currentNote.current_revision || !signed)
      return;
    if (!correctionReason.trim() || !correctionConfirmed) return;
    setSections(savedBody.sections);
    setPatientInstructions(savedBody.patient_instructions ?? "");
    setAppliedTemplate({
      id: savedBody.template_id,
      version: savedBody.template_version,
    });
    setCorrectionTarget({
      revisionId: currentNote.current_revision.id,
      revisionNo: currentNote.current_revision.revision_no,
      reason: correctionReason.trim(),
    });
    setCorrectionDialogOpen(false);
    setCorrectionConfirmed(false);
    setNotice(
      `Preparing a correction to signed revision ${currentNote.current_revision.revision_no}. Review the full copied note, then save it as an unsigned correction.`,
    );
  };

  const incomingBody = incomingNote?.current_revision?.body;
  const useIncomingRevision = async () => {
    if (!incomingNote?.current_revision || !incomingBody || busy) return;
    cancelPendingDraftSave();
    setBusy(true);
    if (!(await workingDraft.clear())) {
      setBusy(false);
      setError(
        "The preserved working note could not be cleared. Keep this copy open and try again.",
      );
      return;
    }
    hasWorkingDraftEdits.current = false;
    const next: SoapEditorBaseline = {
      noteId: incomingNote.id,
      revisionId: incomingNote.current_revision.id,
      revisionNo: incomingNote.current_revision.revision_no,
      sections: incomingBody.sections,
      patientInstructions: incomingBody.patient_instructions ?? "",
      sessionDurationMinutes: incomingBody.session_duration_minutes ?? null,
      template: {
        id: incomingBody.template_id,
        version: incomingBody.template_version,
      },
    };
    saveAttemptRef.current = null;
    setRequestKey(null);
    setSaveState("idle");
    setBaseline(next);
    setSections(next.sections);
    setPatientInstructions(next.patientInstructions);
    setSessionDurationMinutes(next.sessionDurationMinutes);
    setAppliedTemplate(next.template);
    setCorrectionTarget(null);
    setIncomingNote(null);
    setConflictDialogOpen(false);
    setError("");
    setNotice(`Loaded saved revision ${next.revisionNo}.`);
    setBusy(false);
  };

  const rebaseOntoIncomingRevision = () => {
    if (
      !incomingNote?.current_revision ||
      !incomingBody ||
      incomingNote.current_revision.signed
    )
      return;
    cancelPendingDraftSave();
    saveAttemptRef.current = null;
    setRequestKey(null);
    setSaveState("idle");
    setBaseline({
      noteId: incomingNote.id,
      revisionId: incomingNote.current_revision.id,
      revisionNo: incomingNote.current_revision.revision_no,
      sections: incomingBody.sections,
      patientInstructions: incomingBody.patient_instructions ?? "",
      sessionDurationMinutes: incomingBody.session_duration_minutes ?? null,
      template: {
        id: incomingBody.template_id,
        version: incomingBody.template_version,
      },
    });
    setAppliedTemplate({
      id: incomingBody.template_id,
      version: incomingBody.template_version,
    });
    setCorrectionTarget(null);
    setIncomingNote(null);
    setConflictDialogOpen(false);
    setError("");
    setNotice(
      `Your preserved text is now based on saved revision ${incomingNote.current_revision.revision_no}. Review it before saving.`,
    );
  };

  return (
    <Box className="soap-workspace">
      {currentNote && savedBody && (
        <Alert severity={signed ? "info" : "warning"}>
          {signed
            ? `Signed revision ${currentNote.current_revision?.revision_no} is read-only. Start a correction to prepare a separate unsigned revision.`
            : correctionTarget
              ? `Correction in progress for signed revision ${correctionTarget.revisionNo}. Save creates an unsigned correction that must be reviewed and signed separately.`
              : `Draft revision ${currentNote.current_revision?.revision_no}. Template provenance is fixed after creation.`}
        </Alert>
      )}
      {incomingNote && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" onClick={() => setConflictDialogOpen(true)}>
              Resolve note conflict
            </Button>
          }
        >
          Saved revision {incomingNote.current_revision?.revision_no} changed
          while this working note was open. Your text is preserved and official
          save is blocked until you review both versions.
        </Alert>
      )}
      <Paper
        component="section"
        variant="outlined"
        className="soap-save-panel"
        aria-label="SOAP save and recovery"
      >
        {!canWrite && !signed && (
          <Alert severity="info">
            You have read access but cannot change this note.
          </Alert>
        )}
        {error && <ErrorMessage message={error} />}
        {workingDraft.status === "loading" && canWrite && (
          <Typography variant="caption" role="status" color="text.secondary">
            Recovering protected working note…
          </Typography>
        )}
        <Box role="status" aria-live="polite" aria-atomic="true">
          {saveState === "saving"
            ? "Saving unsigned draft…"
            : saveState === "reconciling"
              ? "Checking the saved note and encounter…"
              : notice}
        </Box>
        {workingDraft.status === "saving" && (
          <Typography variant="caption" role="status" color="text.secondary">
            Saving protected working note…
          </Typography>
        )}
        {workingCopyPending && !dirty && (
          <Alert severity="warning">
            The latest working-note changes are not confirmed for refresh
            recovery. Keep this chart open until they are saved; leaving now may
            restore the earlier working copy.
          </Alert>
        )}
        {currentNote?.current_revision?.created_at && !signed && (
          <Typography variant="body2" color="text.secondary">
            Draft last saved{" "}
            {new Date(currentNote.current_revision.created_at).toLocaleString()}
            {dirty ? " · Current edits are not in a saved chart revision" : ""}
          </Typography>
        )}
        {workingDraft.status === "saved" && dirty && (
          <Typography variant="caption" role="status" color="text.secondary">
            Last recovery save completed. Recovery copies do not create chart
            revisions; save the note explicitly to record one.
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
                  Retry saving current note
                </Button>
              ) : saveAttemptRef.current ? undefined : (
                <Button
                  color="inherit"
                  onClick={() => setReplaceWorkingCopy(true)}
                >
                  Load saved copy
                </Button>
              )
            }
          >
            {workingDraft.error ||
              "The protected working note could not be saved."}
            {workingDraft.status === "conflict" && saveAttemptRef.current
              ? " Check the submitted save before replacing this copy."
              : null}
          </Alert>
        )}
        {canWrite && (!signed || correctionTarget) && saveRequirement && (
          <Typography
            id="soap-save-requirement"
            variant="body2"
            color="text.secondary"
          >
            {saveRequirement}
          </Typography>
        )}
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          useFlexGap
          sx={{ scrollMarginTop: 16, flexWrap: "wrap" }}
        >
          {(!signed || correctionTarget) && (
            <Button
              variant="contained"
              onClick={() => void save()}
              aria-describedby={
                saveRequirement ? "soap-save-requirement" : undefined
              }
              disabled={
                busy ||
                !workingDraft.ready ||
                !canWrite ||
                (!dirty && !correctionTarget) ||
                !noteSaveAllowsMutation(saveState) ||
                Boolean(incomingNote) ||
                !appliedTemplate ||
                !hasSoapContent(sections)
              }
            >
              {busy
                ? "Saving…"
                : correctionTarget
                  ? "Save unsigned correction"
                  : currentNote
                    ? "Save new revision"
                    : "Save draft"}
            </Button>
          )}
          {signed && !correctionTarget && canWrite && (
            <Button
              variant="contained"
              onClick={() => setCorrectionDialogOpen(true)}
              disabled={busy || !noteSaveAllowsMutation(saveState)}
            >
              Start correction
            </Button>
          )}
          {requestKey && (
            <Button
              variant="outlined"
              onClick={() => void checkSaveStatus()}
              disabled={busy}
            >
              {busy && saveState !== "saving"
                ? "Checking save status…"
                : "Check save status"}
            </Button>
          )}
          {requestKey && !busy && (
            <Button variant="text" onClick={() => setResetConfirmation(true)}>
              Reset save attempt
            </Button>
          )}
          {requestKey && saveState === "not_found" && !busy && (
            <Button
              variant="outlined"
              onClick={() => void retryExactNoteSave()}
            >
              Retry exact save
            </Button>
          )}
        </Stack>
      </Paper>
      {currentNote?.revisions.length ? (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Saved revision history
          </Typography>
          <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap", mt: 0.75 }}>
            {currentNote.revisions.map((revision) => (
              <Chip
                key={revision.id}
                size="small"
                sx={{ minHeight: 44 }}
                variant={
                  revision.id === currentNote.current_revision?.id
                    ? "filled"
                    : "outlined"
                }
                color={revision.signed ? "success" : "default"}
                label={`Revision ${revision.revision_no}${revision.signed ? " · signed" : " · unsigned"}`}
                onClick={() => setHistoryRevisionId(revision.id)}
              />
            ))}
          </Stack>
        </Box>
      ) : null}
      <Stack spacing={1} className="soap-sections">
        {!currentNote && !signed && (
          <Paper className="soap-template-panel" variant="outlined">
            <Stack spacing={1.25}>
              <Box>
                <Typography component="h3" variant="subtitle1">
                  Start with a SOAP template
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Choose a template for this visit. Use it with your own text or
                  apply its editable prompts. Prompts do not document findings
                  on their own.
                </Typography>
              </Box>
              <FormControl fullWidth size="small">
                <InputLabel id="soap-template-label">SOAP template</InputLabel>
                <Select
                  labelId="soap-template-label"
                  label="SOAP template"
                  value={selectedTemplateId}
                  disabled={editorDisabled || templates.length === 0}
                  onChange={(event) =>
                    setSelectedTemplateId(event.target.value)
                  }
                >
                  {templates.map((template) => (
                    <MenuItem key={template.id} value={template.id}>
                      {template.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {selectedTemplate && (
                <Alert severity="info">
                  <strong>{selectedTemplate.source_label}</strong>
                  {selectedTemplate.caution
                    ? ` ${selectedTemplate.caution}`
                    : null}
                </Alert>
              )}
              <Button
                variant="outlined"
                sx={{ alignSelf: "flex-start" }}
                disabled={!selectedTemplate || editorDisabled}
                onClick={() => {
                  if (!selectedTemplate || editorDisabled) return;
                  setAppliedTemplate({
                    id: selectedTemplate.id,
                    version: selectedTemplate.version,
                  });
                  setNotice(
                    `${selectedTemplate.label} selected. Your text is unchanged; review it before saving.`,
                  );
                }}
              >
                Use template without prompts
              </Button>
              <Button
                variant="outlined"
                sx={{ alignSelf: "flex-start" }}
                disabled={
                  !selectedTemplate ||
                  editorDisabled ||
                  !hasTemplatePrompts(selectedTemplate)
                }
                onClick={requestTemplateApplication}
              >
                Apply template prompts
              </Button>
              {selectedTemplate && !hasTemplatePrompts(selectedTemplate) && (
                <Typography variant="body2" color="text.secondary">
                  This template has no prompt text. Select it without prompts.
                </Typography>
              )}
            </Stack>
          </Paper>
        )}
        {patientId != null && (
          <PrevisitNoteImport
            key={`${patientId}:${encounterId}`}
            patientId={patientId}
            encounterId={encounterId}
            patientName={patientName}
            subjective={sections.subjective}
            disabled={editorDisabled}
            onAppend={(source) =>
              setSections((current) => ({
                ...current,
                subjective: appendPrevisitNote(current.subjective, source),
              }))
            }
          />
        )}
        <HistoryOfPresentIllness
          value={sections.subjective}
          onChange={(subjective) =>
            setSections((current) => ({ ...current, subjective }))
          }
          disabled={editorDisabled}
        />
        <ReviewOfSystems
          value={sections.subjective}
          onChange={(subjective) =>
            setSections((current) => ({ ...current, subjective }))
          }
          disabled={editorDisabled}
        />
        {SOAP_SECTION_LABELS.filter(([key]) => key !== "subjective").map(
          ([key, label]) => (
            <Box
              key={key}
              id={
                key === "assessment" || key === "plan"
                  ? `chart-${key}`
                  : undefined
              }
              sx={{ scrollMarginTop: 16 }}
            >
              <TextField
                fullWidth
                name={key}
                label={`${label} (${label.charAt(0)})`}
                value={sections[key]}
                onChange={(event) =>
                  setSections((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
                multiline
                minRows={4}
                slotProps={{ htmlInput: { maxLength: 50_000 } }}
                disabled={editorDisabled}
                helperText={
                  key === "objective" && appliedTemplate && !signed
                    ? "Template text is editable and remains unverified until the author reviews it."
                    : undefined
                }
              />
            </Box>
          ),
        )}
        <TextField
          label="Patient instructions"
          value={patientInstructions}
          onChange={(event) => setPatientInstructions(event.target.value)}
          multiline
          minRows={4}
          slotProps={{ htmlInput: { maxLength: 5_000 } }}
          disabled={editorDisabled}
          helperText="Optional. These exact instructions are available to the patient portal only after this revision is signed and the encounter is completed."
        />
        <TextField
          label="Actual session duration (minutes)"
          type="number"
          value={sessionDurationMinutes ?? ""}
          onChange={(event) => {
            const value = event.target.value;
            setSessionDurationMinutes(value === "" ? null : Number(value));
          }}
          slotProps={{ htmlInput: { min: 1, max: 1440, step: 1 } }}
          disabled={editorDisabled}
          helperText="Optional. Record the actual documented session duration; this does not infer billing time, a treatment, or a clinical finding."
        />
      </Stack>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{ scrollMarginTop: 16 }}
      >
        {currentNote && patientId && canSign && (
          <EncounterNoteSigning
            note={currentNote}
            patientId={patientId}
            patientName={patientName}
            encounterId={encounterId}
            canSign={canSign}
            disabled={
              busy ||
              dirty ||
              !noteSaveAllowsMutation(saveState) ||
              Boolean(saveAttemptRef.current)
            }
            onSigned={() => onRefresh?.()}
            onRefresh={onRefresh}
          />
        )}
      </Stack>
      <Dialog
        open={Boolean(templateConfirmation)}
        onClose={() => setTemplateConfirmation(null)}
      >
        <DialogTitle>Replace note prompts?</DialogTitle>
        <DialogContent>
          <Typography>
            Applying {templateConfirmation?.label} will replace the sections
            where it supplies prompt text. Structured HPI fields and recorded
            review-of-systems findings will be preserved; review all remaining
            text before saving the unsigned draft.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTemplateConfirmation(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (templateConfirmation) applyTemplate(templateConfirmation);
              setTemplateConfirmation(null);
            }}
          >
            Apply template
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={resetConfirmation}
        onClose={() => !busy && setResetConfirmation(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Reset save attempt?</DialogTitle>
        <DialogContent>
          Check the saved note before resetting this attempt. Resetting does not
          send another save.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetConfirmation(false)} disabled={busy}>
            Go back
          </Button>
          <Button onClick={() => void resetSaveAttempt()} disabled={busy}>
            Reset attempt
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={replaceWorkingCopy}
        onClose={() => setReplaceWorkingCopy(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Replace this working note?</DialogTitle>
        <DialogContent>
          Loading the server copy replaces newer note edits currently held in
          this window. Continue only after confirming those local edits are no
          longer needed.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReplaceWorkingCopy(false)}>
            Keep local note
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={reloadWorkingDraft}
          >
            Replace with saved copy
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={Boolean(historyRevision)}
        onClose={() => setHistoryRevisionId(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Saved revision {historyRevision?.revision_no}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="info">
              {historyRevision?.signed ? "Signed" : "Unsigned"} saved revision.
              This history view is read-only and does not replace your working
              text. Corrections use the current revision workflow.
            </Alert>
            {historyRevision?.body ? (
              <>
                {SOAP_SECTION_LABELS.map(([key, label]) => (
                  <Box key={key}>
                    <Typography variant="subtitle2">{label}</Typography>
                    <Typography sx={{ whiteSpace: "pre-wrap" }}>
                      {historyRevision.body?.sections[key] || "Not recorded"}
                    </Typography>
                  </Box>
                ))}
                <Typography sx={{ whiteSpace: "pre-wrap" }}>
                  Patient instructions:{" "}
                  {historyRevision.body.patient_instructions || "Not recorded"}
                </Typography>
                <Typography>
                  Actual session duration:{" "}
                  {historyRevision.body.session_duration_minutes == null
                    ? "Not recorded"
                    : `${historyRevision.body.session_duration_minutes} minutes`}
                </Typography>
              </>
            ) : (
              <Typography>
                Revision content is unavailable. Reload the chart to retrieve
                it.
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryRevisionId(null)}>
            Close history
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={conflictDialogOpen && Boolean(incomingNote)}
        onClose={() => !busy && setConflictDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Resolve saved-note conflict</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="warning">
              Your working text remains preserved. Choosing the saved revision
              discards it. Rebasing keeps your text but makes the displayed
              saved revision its new editing base.
            </Alert>
            <Typography variant="subtitle2">
              Saved revision {incomingNote?.current_revision?.revision_no}
            </Typography>
            {SOAP_SECTION_LABELS.map(([key, label]) => (
              <Box key={key}>
                <Typography sx={{ fontWeight: 700 }}>{label}</Typography>
                <Typography sx={{ whiteSpace: "pre-wrap" }}>
                  {incomingBody?.sections[key] || "Not recorded"}
                </Typography>
              </Box>
            ))}
            <Divider />
            <Typography variant="subtitle2">
              Your preserved working text
            </Typography>
            {SOAP_SECTION_LABELS.map(([key, label]) => (
              <Box key={key}>
                <Typography sx={{ fontWeight: 700 }}>{label}</Typography>
                <Typography sx={{ whiteSpace: "pre-wrap" }}>
                  {sections[key] || "Not recorded"}
                </Typography>
              </Box>
            ))}
            {incomingNote?.current_revision?.signed && (
              <Alert severity="info">
                The newer revision is signed. Load it, then start a correction
                if further documentation is required.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConflictDialogOpen(false)} disabled={busy}>
            Keep reviewing
          </Button>
          <Button
            onClick={rebaseOntoIncomingRevision}
            disabled={busy || incomingNote?.current_revision?.signed === true}
          >
            Keep my text and rebase
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => void useIncomingRevision()}
            disabled={busy}
          >
            Use saved revision
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={correctionDialogOpen}
        onClose={() => !busy && setCorrectionDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Start correction to signed SOAP note</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="info">
              This keeps signed revision{" "}
              {currentNote?.current_revision?.revision_no} intact and creates a
              separate unsigned correction for review and signature.
            </Alert>
            <Typography color="text.secondary">
              {patientName || `Patient #${patientId ?? "unavailable"}`} ·
              Encounter #{encounterId} · Signed revision{" "}
              {currentNote?.current_revision?.revision_no}
            </Typography>
            {SOAP_SECTION_LABELS.map(([key, label]) => (
              <Box key={key}>
                <Typography sx={{ fontWeight: 700 }}>{label}</Typography>
                <Typography sx={{ whiteSpace: "pre-wrap" }}>
                  {savedBody?.sections[key] || "Not recorded"}
                </Typography>
              </Box>
            ))}
            <Box>
              <Typography sx={{ fontWeight: 700 }}>
                Patient instructions
              </Typography>
              <Typography sx={{ whiteSpace: "pre-wrap" }}>
                {savedBody?.patient_instructions ||
                  "No patient instructions recorded."}
              </Typography>
            </Box>
            <TextField
              label="Reason for correction"
              value={correctionReason}
              onChange={(event) => setCorrectionReason(event.target.value)}
              multiline
              minRows={3}
              required
              slotProps={{ htmlInput: { maxLength: 2_000 } }}
              helperText="This reason is saved with the correction."
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={correctionConfirmed}
                  onChange={(event) =>
                    setCorrectionConfirmed(event.target.checked)
                  }
                />
              }
              label="I confirmed the displayed patient, encounter, signed revision, and copied note content."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            disabled={busy}
            onClick={() => setCorrectionDialogOpen(false)}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={busy || !correctionConfirmed || !correctionReason.trim()}
            onClick={startCorrection}
          >
            Start correction
          </Button>
        </DialogActions>
      </Dialog>
      <Typography variant="caption" color="text.secondary">
        {signed
          ? "The signed revision remains read-only. A correction is a separate unsigned revision until it is reviewed and signed."
          : "Saving stores an unsigned chart draft; it does not sign the note or close the encounter."}
      </Typography>
    </Box>
  );
}

function ExistingSoapNote({
  patientId,
  patientName,
  encounterId,
  noteId,
  templates,
  canWrite,
  canSign,
  onChanged,
}: {
  patientId: number;
  patientName?: string;
  encounterId: number;
  noteId: number;
  templates: NoteTemplate[];
  canWrite: boolean;
  canSign: boolean;
  onChanged?: () => void;
}) {
  const resource = useResource<{ note: EncounterNote }>(
    `/api/clinic/notes/${noteId}`,
  );
  if (!resource.data) return <LoadState error={resource.error} />;
  if (
    resource.data.note.id !== noteId ||
    resource.data.note.patient_id !== patientId ||
    resource.data.note.encounter_id !== encounterId ||
    resource.data.note.note_kind !== "soap"
  )
    return (
      <ErrorMessage message="The loaded note did not match this patient and encounter." />
    );
  if (!resource.data.note.current_revision?.body)
    return (
      <ErrorMessage message="This SOAP note does not contain a supported draft payload." />
    );
  return (
    <SoapNoteForm
      patientId={patientId}
      patientName={patientName}
      encounterId={encounterId}
      note={resource.data.note}
      templates={templates}
      canWrite={canWrite}
      canSign={canSign}
      onRefresh={() => {
        resource.refresh();
        onChanged?.();
      }}
    />
  );
}

export function SoapNoteWorkspace({
  encounter,
  patientName,
  onChanged,
}: {
  encounter: EncounterDetail;
  patientName?: string;
  onChanged?: () => void;
}) {
  const context = useClinic();
  const [created, setCreated] = useState<EncounterNote | null>(null);
  const templates = useResource<{ templates: NoteTemplate[] }>(
    `/api/clinic/note_templates?encounter_id=${encounter.id}`,
  );
  if (!context.capabilities.notes_read)
    return (
      <div className="care-blocked">
        <strong>Note access restricted</strong>
        <span>Your current clinic permissions do not allow note review.</span>
      </div>
    );
  if (!templates.data) return <LoadState error={templates.error} />;
  const existing = encounter.notes.find((note) => note.note_kind === "soap");
  const noteId = created?.id ?? existing?.id;
  return noteId ? (
    <ExistingSoapNote
      patientId={encounter.patient_id}
      patientName={patientName}
      encounterId={encounter.id}
      noteId={noteId}
      templates={templates.data.templates}
      canWrite={context.capabilities.notes_write}
      canSign={context.capabilities.notes_sign === true}
      onChanged={onChanged}
    />
  ) : context.capabilities.notes_write ? (
    <SoapNoteForm
      encounterId={encounter.id}
      patientId={encounter.patient_id}
      patientName={patientName}
      templates={templates.data.templates}
      canWrite
      onCreated={setCreated}
      onRefresh={onChanged}
    />
  ) : (
    <div className="care-blocked">
      <strong>No SOAP note recorded</strong>
      <span>You can review existing notes but cannot create a draft.</span>
    </div>
  );
}
