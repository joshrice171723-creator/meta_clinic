import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { useClinic } from "../clinic/Workspace";
import {
  ScribeReviewWorkspace,
  type ScribeReviewState,
} from "./ScribeReviewWorkspace";
import type { ScribeDraft, ScribeDraftSection, ScribeEncounter } from "./types";

type PatientOption = { id: number; reference: string; display_name: string };
type EncounterSummary = Pick<
  ScribeEncounter,
  "id" | "patient_id" | "site_id" | "status" | "consent_status" | "version"
> & { patient: PatientOption };
type Pagination = { page: number; per_page: number; total: number; total_pages: number };
type EncounterIndex = {
  encounters: EncounterSummary[];
  patient_options: PatientOption[];
  patient_pagination: Pagination;
  pagination: Pagination;
};
type Confirmation =
  | { kind: "consent"; decision: "accepted" | "declined" | "withdrawn"; encounterId: number; encounterVersion: number; scopeKey: string }
  | { kind: "approve"; draftId: number; draftVersion: number; encounterId: number; scopeKey: string }
  | { kind: "export"; draftId: number; draftVersion: number; encounterId: number; scopeKey: string }
  | { kind: "delete"; encounterId: number; encounterVersion: number; scopeKey: string }
  | null;

const PAGE_SIZE = 25;

function capability(capabilities: object, name: string): boolean {
  return (capabilities as Record<string, boolean | undefined>)[name] === true;
}

function currentDraft(encounter: ScribeEncounter | null): ScribeDraft | undefined {
  return encounter?.drafts.find((draft) => !["superseded", "deleted"].includes(draft.status));
}

function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}

export function LiveScribeReviewWorkspace() {
  const { capabilities, current_site, membership_id } = useClinic();
  const scopeKey = `${membership_id ?? "none"}:${current_site?.id ?? "all"}`;
  const scopeRef = useRef(scopeKey);
  scopeRef.current = scopeKey;
  const mounted = useRef(true);
  const listVersion = useRef(0);
  const patientListVersion = useRef(0);
  const detailVersion = useRef(0);
  const selectedEncounterRef = useRef<number | null>(null);
  const actionLock = useRef(new Set<string>());
  const exportKeys = useRef(new Map<string, string>());

  const [summaries, setSummaries] = useState<EncounterSummary[]>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [patientPage, setPatientPage] = useState(1);
  const [patientTotalPages, setPatientTotalPages] = useState(1);
  const [loadingMorePatients, setLoadingMorePatients] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedEncounterId, setSelectedEncounterId] = useState<number | "">("");
  const [selectedPatientId, setSelectedPatientId] = useState<number | "">("");
  const [reviewState, setReviewState] = useState<ScribeReviewState>({ kind: "loading" });
  const [encounter, setEncounter] = useState<ScribeEncounter | null>(null);
  const [transcript, setTranscript] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [outcomeUnknown, setOutcomeUnknown] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [hasUnsavedReviewEdits, setHasUnsavedReviewEdits] = useState(false);
  const [discardEditsToken, setDiscardEditsToken] = useState(0);

  const isCurrent = useCallback(
    (requestScope: string) => mounted.current && scopeRef.current === requestScope,
    [],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      listVersion.current += 1;
      patientListVersion.current += 1;
      detailVersion.current += 1;
    };
  }, []);

  useEffect(() => {
    listVersion.current += 1;
    patientListVersion.current += 1;
    detailVersion.current += 1;
    selectedEncounterRef.current = null;
    actionLock.current.clear();
    exportKeys.current.clear();
    setSummaries([]);
    setPatients([]);
    setPatientPage(1);
    setPatientTotalPages(1);
    setLoadingMorePatients(false);
    setSelectedEncounterId("");
    setSelectedPatientId("");
    setEncounter(null);
    setTranscript("");
    setActionError(null);
    setOutcomeUnknown(null);
    setConfirmation(null);
    setHasUnsavedReviewEdits(false);
  }, [scopeKey]);

  const loadEncounter = useCallback(async (encounterId: number) => {
    const requestScope = scopeKey;
    const requestVersion = ++detailVersion.current;
    setReviewState({ kind: "loading", message: "Loading the selected encounter and current revision…" });
    try {
      const result = await api<{ encounter: ScribeEncounter }>(
        `/api/clinic/scribe/encounters/${encounterId}`,
      );
      if (!isCurrent(requestScope) || requestVersion !== detailVersion.current || selectedEncounterRef.current !== encounterId) return;
      setEncounter(result.encounter);
      setReviewState({ kind: "ready", encounter: result.encounter });
      setOutcomeUnknown(null);
    } catch (reason) {
      if (!isCurrent(requestScope) || requestVersion !== detailVersion.current || selectedEncounterRef.current !== encounterId) return;
      setEncounter(null);
      setReviewState({ kind: "error", message: errorMessage(reason, "Unable to load this scribe encounter.") });
    }
  }, [isCurrent, scopeKey]);

  const loadIndex = useCallback(async (preferredEncounterId?: number) => {
    const requestScope = scopeKey;
    const requestVersion = ++listVersion.current;
    patientListVersion.current += 1;
    setReviewState({ kind: "loading" });
    try {
      const result = await api<EncounterIndex>(
        `/api/clinic/scribe/encounters?page=1&per_page=${PAGE_SIZE}`,
      );
      if (!isCurrent(requestScope) || requestVersion !== listVersion.current) return;
      setSummaries(result.encounters);
      setPatients(result.patient_options);
      setPatientPage(result.patient_pagination.page);
      setPatientTotalPages(result.patient_pagination.total_pages);
      setLoadingMorePatients(false);
      setPage(result.pagination.page);
      setTotalPages(result.pagination.total_pages);
      setLoadingMore(false);
      setActionError(null);
      setOutcomeUnknown(null);
      const nextId = preferredEncounterId && result.encounters.some(({ id }) => id === preferredEncounterId)
        ? preferredEncounterId
        : result.encounters[0]?.id;
      selectedEncounterRef.current = nextId ?? null;
      setSelectedEncounterId(nextId ?? "");
      if (nextId) await loadEncounter(nextId);
      else {
        setEncounter(null);
        setReviewState({ kind: "empty", message: "Create a scribe encounter to begin consent and source review." });
      }
    } catch (reason) {
      if (!isCurrent(requestScope) || requestVersion !== listVersion.current) return;
      setReviewState({ kind: "error", message: errorMessage(reason, "Unable to load scribe encounters.") });
    }
  }, [isCurrent, loadEncounter, scopeKey]);

  useEffect(() => { void loadIndex(); }, [loadIndex]);

  const loadMore = async () => {
    if (loadingMore || page >= totalPages) return;
    const requestScope = scopeKey;
    const requestVersion = ++listVersion.current;
    setLoadingMore(true);
    try {
      const result = await api<EncounterIndex>(
        `/api/clinic/scribe/encounters?page=${page + 1}&per_page=${PAGE_SIZE}`,
      );
      if (!isCurrent(requestScope) || requestVersion !== listVersion.current) return;
      setSummaries((current) => {
        const ids = new Set(current.map(({ id }) => id));
        return [...current, ...result.encounters.filter(({ id }) => !ids.has(id))];
      });
      setPage(result.pagination.page);
      setTotalPages(result.pagination.total_pages);
      setLoadingMore(false);
    } catch (reason) {
      if (!isCurrent(requestScope) || requestVersion !== listVersion.current) return;
      setLoadingMore(false);
      setActionError(errorMessage(reason, "Unable to load more scribe encounters."));
    }
  };

  const selectEncounter = (encounterId: number) => {
    if (encounterId === selectedEncounterRef.current) return;
    if (hasUnsavedReviewEdits) {
      setActionError("Save or discard the unsaved reviewer edits before switching encounters.");
      return;
    }
    selectedEncounterRef.current = encounterId;
    setSelectedEncounterId(encounterId);
    setEncounter(null);
    setTranscript("");
    setActionError(null);
    setOutcomeUnknown(null);
    setConfirmation(null);
    void loadEncounter(encounterId);
  };

  const loadMorePatients = async () => {
    if (loadingMorePatients || patientPage >= patientTotalPages) return;
    const requestScope = scopeKey;
    const requestVersion = ++patientListVersion.current;
    setLoadingMorePatients(true);
    try {
      const result = await api<EncounterIndex>(
        `/api/clinic/scribe/encounters?page=1&per_page=${PAGE_SIZE}&patient_page=${patientPage + 1}`,
      );
      if (!isCurrent(requestScope) || requestVersion !== patientListVersion.current) return;
      setPatients((current) => {
        const ids = new Set(current.map(({ id }) => id));
        return [...current, ...result.patient_options.filter(({ id }) => !ids.has(id))];
      });
      setPatientPage(result.patient_pagination.page);
      setPatientTotalPages(result.patient_pagination.total_pages);
      setLoadingMorePatients(false);
    } catch (reason) {
      if (!isCurrent(requestScope) || requestVersion !== patientListVersion.current) return;
      setLoadingMorePatients(false);
      setActionError(errorMessage(reason, "Unable to load more patient options."));
    }
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
        setActionError(errorMessage(reason, "The scribe action could not be completed."));
        if (uncertainMessage) setOutcomeUnknown(uncertainMessage);
      }
      throw reason;
    } finally {
      actionLock.current.delete(scopedKey);
      if (isCurrent(scopeKey)) setPendingAction(null);
    }
  };

  const createEncounter = () => runMutation("create", async () => {
    if (!selectedPatientId) throw new Error("Choose a patient before creating the encounter.");
    const result = await api<{ encounter: ScribeEncounter }>("/api/clinic/scribe/encounters", {
      method: "POST",
      body: { encounter: { patient_id: selectedPatientId, site_id: current_site?.id } },
    });
    if (!isCurrent(scopeKey)) return;
    setSelectedPatientId("");
    await loadIndex(result.encounter.id);
  }, "Creation outcome is not confirmed. Reload the encounter list before trying again.");

  const decideConsent = (decision: "accepted" | "declined" | "withdrawn") => {
    const encounterId = selectedEncounterRef.current;
    if (!encounterId) return Promise.resolve();
    return runMutation(`consent:${decision}`, async () => {
      await api(`/api/clinic/scribe/encounters/${encounterId}/consent`, {
        method: "POST",
        body: { consent: { decision, method: "in_person" } },
      });
      if (isCurrent(scopeKey) && selectedEncounterRef.current === encounterId) await loadEncounter(encounterId);
    }, "Consent outcome is not confirmed. Reload the encounter before making another decision.");
  };

  const importSource = () => {
    const encounterId = selectedEncounterRef.current;
    const content = transcript.trim();
    if (!encounterId || !content) return Promise.resolve();
    if (hasUnsavedReviewEdits) {
      setActionError("Save or discard the unsaved reviewer edits before importing another transcript.");
      return Promise.reject(new Error("Unsaved reviewer edits must be resolved first."));
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

  const generateDraft = () => {
    const encounterId = selectedEncounterRef.current;
    if (!encounterId) return Promise.resolve();
    if (hasUnsavedReviewEdits) {
      setActionError("Save or discard the unsaved reviewer edits before generating another draft.");
      return Promise.reject(new Error("Unsaved reviewer edits must be resolved first."));
    }
    return runMutation("generate", async () => {
      await api(`/api/clinic/scribe/encounters/${encounterId}/generate`, { method: "POST", body: {} });
      if (isCurrent(scopeKey) && selectedEncounterRef.current === encounterId) await loadEncounter(encounterId);
    }, "Generation outcome is not confirmed. Reload the encounter before generating again.");
  };

  const reviewSection = (
    draftId: number,
    draftVersion: number,
    sectionKey: ScribeDraftSection["section_key"],
    action: "edit" | "accept" | "reject",
    content?: string,
  ) => {
    const encounterId = selectedEncounterRef.current;
    if (!encounterId) return Promise.resolve();
    return runMutation(`review:${sectionKey}`, async () => {
      await api(`/api/clinic/scribe/drafts/${draftId}/review`, {
        method: "POST",
        body: { review: { action, section_key: sectionKey, content, expected_version: draftVersion } },
      });
      const latestDraft = currentDraft(encounter);
      if (isCurrent(scopeKey) && selectedEncounterRef.current === encounterId && latestDraft?.id === draftId && latestDraft.version === draftVersion) {
        await loadEncounter(encounterId);
      }
    }, "Review outcome is not confirmed. Reload the current revision before another review action.");
  };

  const approveDraft = (draftId: number, draftVersion: number) => {
    const encounterId = selectedEncounterRef.current;
    if (!encounterId) return Promise.resolve();
    return runMutation("approve", async () => {
      await api(`/api/clinic/scribe/drafts/${draftId}/approve`, { method: "POST", body: { expected_version: draftVersion } });
      const latestDraft = currentDraft(encounter);
      if (isCurrent(scopeKey) && selectedEncounterRef.current === encounterId && latestDraft?.id === draftId && latestDraft.version === draftVersion) await loadEncounter(encounterId);
    }, "Approval outcome is not confirmed. Reload the current revision before trying again.");
  };

  const exportDraft = (draftId: number, draftVersion: number) => {
    const encounterId = selectedEncounterRef.current;
    if (!encounterId) return Promise.resolve();
    const identity = `${draftId}:${draftVersion}`;
    const idempotencyKey = exportKeys.current.get(identity) || crypto.randomUUID();
    exportKeys.current.set(identity, idempotencyKey);
    return runMutation("export", async () => {
      await api(`/api/clinic/scribe/drafts/${draftId}/export`, {
        method: "POST",
        body: { export: { destination: "parent_record_adapter", idempotency_key: idempotencyKey, confirmed: true, expected_version: draftVersion } },
      });
      if (!isCurrent(scopeKey)) return;
      exportKeys.current.delete(identity);
      if (selectedEncounterRef.current === encounterId) await loadEncounter(encounterId);
    });
  };

  const deleteEncounter = (encounterId: number) => runMutation("delete", async () => {
    await api(`/api/clinic/scribe/encounters/${encounterId}`, { method: "DELETE" });
    if (isCurrent(scopeKey) && selectedEncounterRef.current === encounterId) await loadIndex();
  }, "Deletion outcome is not confirmed. Reload the encounter list before trying again.");

  const confirmAction = async () => {
    const value = confirmation;
    setConfirmation(null);
    if (!value) return;
    const loadedDraft = currentDraft(encounter);
    const confirmationCurrent = value.scopeKey === scopeKey && value.encounterId === selectedEncounterRef.current &&
      (value.kind === "consent" || value.kind === "delete"
        ? encounter?.version === value.encounterVersion
        : loadedDraft?.id === value.draftId && loadedDraft.version === value.draftVersion);
    if (!confirmationCurrent) {
      setActionError("The selected encounter or revision changed. Review it again before confirming this action.");
      return;
    }
    if (value.kind === "consent") await decideConsent(value.decision);
    if (value.kind === "approve") await approveDraft(value.draftId, value.draftVersion);
    if (value.kind === "export") await exportDraft(value.draftId, value.draftVersion);
    if (value.kind === "delete") await deleteEncounter(value.encounterId);
  };

  const draft = currentDraft(encounter);
  const canWrite = capability(capabilities, "scribe_write");
  const canApprove = capability(capabilities, "scribe_approve");
  const canExport = capability(capabilities, "scribe_export");
  const canDelete = capability(capabilities, "scribe_delete");
  const encounterDeleted = Boolean(encounter?.deleted_at || encounter?.status === "deleted");
  const processingAllowed = encounter?.consent_status === "accepted" && !encounterDeleted;

  return (
    <Stack spacing={2.5}>
      {actionError && <Alert severity="error">{actionError}</Alert>}
      {hasUnsavedReviewEdits && (
        <Alert
          severity="warning"
          action={
            <Button
              color="inherit"
              disabled={pendingAction !== null}
              onClick={() => setDiscardEditsToken((current) => current + 1)}
            >
              Discard edits
            </Button>
          }
        >
          Save or explicitly discard reviewer edits before changing the encounter or source revision.
        </Alert>
      )}
      {outcomeUnknown && (
        <Alert severity="warning" action={<Button color="inherit" onClick={() => void loadIndex(selectedEncounterRef.current ?? undefined)}>Reload</Button>}>
          {outcomeUnknown}
        </Alert>
      )}
      <Paper component="section" variant="outlined" sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Stack spacing={2}>
          <Typography component="h2" variant="h5">Scribe encounters</Typography>
          <FormControl fullWidth disabled={!summaries.length || pendingAction !== null}>
            <InputLabel id="scribe-encounter-label">Encounter</InputLabel>
            <Select
              labelId="scribe-encounter-label"
              label="Encounter"
              value={selectedEncounterId}
              onChange={(event) => selectEncounter(Number(event.target.value))}
            >
              {summaries.map((summary) => (
                <MenuItem key={summary.id} value={summary.id}>
                  {summary.patient.display_name} · {summary.patient.reference} · {summary.status.replaceAll("_", " ")}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {page < totalPages && <Button variant="outlined" disabled={loadingMore || pendingAction !== null} onClick={() => void loadMore()}>{loadingMore ? "Loading…" : "Load more encounters"}</Button>}
          {canWrite && (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <FormControl fullWidth disabled={pendingAction !== null || Boolean(outcomeUnknown)}>
                <InputLabel id="scribe-patient-label">Patient</InputLabel>
                <Select labelId="scribe-patient-label" label="Patient" value={selectedPatientId} onChange={(event) => setSelectedPatientId(Number(event.target.value))}>
                  {patients.map((patient) => <MenuItem key={patient.id} value={patient.id}>{patient.display_name} · {patient.reference}</MenuItem>)}
                </Select>
              </FormControl>
              <Button variant="contained" disabled={!selectedPatientId || pendingAction !== null || Boolean(outcomeUnknown)} onClick={() => void createEncounter().catch(() => undefined)}>Create encounter</Button>
            </Stack>
          )}
          {canWrite && patientPage < patientTotalPages && <Button variant="outlined" disabled={loadingMorePatients || pendingAction !== null} onClick={() => void loadMorePatients()}>{loadingMorePatients ? "Loading patients…" : "Load more patients"}</Button>}
        </Stack>
      </Paper>

      {encounter && canWrite && (
        <Paper component="section" variant="outlined" sx={{ p: { xs: 2, sm: 2.5 } }}>
          <Stack spacing={2}>
            <Typography component="h2" variant="h5">Consent and source</Typography>
            <Typography color="text.secondary">Consent policy {encounter.consent_policy_version || "not yet recorded"}. Capture and processing remain unavailable unless the server records accepted consent.</Typography>
            {!encounterDeleted && <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              {encounter.consent_status !== "accepted" && <Button variant="outlined" disabled={pendingAction !== null || Boolean(outcomeUnknown)} onClick={() => setConfirmation({ kind: "consent", decision: "accepted", encounterId: encounter.id, encounterVersion: encounter.version, scopeKey })}>Record accepted consent</Button>}
              {encounter.consent_status !== "declined" && <Button variant="outlined" disabled={pendingAction !== null || Boolean(outcomeUnknown)} onClick={() => setConfirmation({ kind: "consent", decision: "declined", encounterId: encounter.id, encounterVersion: encounter.version, scopeKey })}>Record declined consent</Button>}
              {encounter.consent_status === "accepted" && <Button color="warning" variant="outlined" disabled={pendingAction !== null || Boolean(outcomeUnknown)} onClick={() => setConfirmation({ kind: "consent", decision: "withdrawn", encounterId: encounter.id, encounterVersion: encounter.version, scopeKey })}>Withdraw consent</Button>}
            </Stack>}
            <TextField label="Imported transcript" multiline minRows={5} value={transcript} onChange={(event) => setTranscript(event.target.value)} disabled={!processingAllowed || pendingAction !== null} helperText="Paste only an authorized transcript. The server stores it as protected source evidence; no microphone or cloud provider is used here." slotProps={{ htmlInput: { maxLength: 250000 } }} />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <Button variant="contained" disabled={!processingAllowed || !transcript.trim() || hasUnsavedReviewEdits || pendingAction !== null || Boolean(outcomeUnknown)} onClick={() => void importSource().catch(() => undefined)}>Import transcript</Button>
              <Button variant="outlined" disabled={!processingAllowed || !encounter.sources.some(({ status }) => status === "ready") || hasUnsavedReviewEdits || pendingAction !== null || Boolean(outcomeUnknown)} onClick={() => void generateDraft().catch(() => undefined)}>Generate local grounded draft</Button>
              {canDelete && <Button color="error" variant="outlined" disabled={pendingAction !== null || Boolean(outcomeUnknown)} onClick={() => setConfirmation({ kind: "delete", encounterId: encounter.id, encounterVersion: encounter.version, scopeKey })}>Delete encounter content</Button>}
            </Stack>
          </Stack>
        </Paper>
      )}

      <ScribeReviewWorkspace
        key={`${scopeKey}:${encounter?.id ?? "none"}`}
        state={reviewState}
        pendingAction={pendingAction}
        onUnsavedEditsChange={setHasUnsavedReviewEdits}
        discardEditsToken={discardEditsToken}
        onRetry={() => selectedEncounterRef.current ? void loadEncounter(selectedEncounterRef.current) : void loadIndex()}
        onSaveSection={canWrite && draft ? (draftId, sectionKey, content) => reviewSection(draftId, draft.version, sectionKey, "edit", content) : undefined}
        onAcceptSection={canWrite && draft ? (draftId, sectionKey) => reviewSection(draftId, draft.version, sectionKey, "accept") : undefined}
        onRejectSection={canWrite && draft ? (draftId, sectionKey) => reviewSection(draftId, draft.version, sectionKey, "reject") : undefined}
        onApprove={canApprove && draft && encounter ? (draftId) => setConfirmation({ kind: "approve", draftId, draftVersion: draft.version, encounterId: encounter.id, scopeKey }) : undefined}
        onExport={canExport && draft && encounter ? (draftId) => setConfirmation({ kind: "export", draftId, draftVersion: draft.version, encounterId: encounter.id, scopeKey }) : undefined}
      />

      <Dialog open={confirmation !== null} onClose={() => pendingAction === null && setConfirmation(null)} fullWidth maxWidth="sm">
        <DialogTitle>Confirm scribe action</DialogTitle>
        <DialogContent>
          <Typography>
            {confirmation?.kind === "approve" && "Approve this exact draft revision after confirming every section against the source evidence?"}
            {confirmation?.kind === "export" && "Export this exact approved revision to the local parent-record adapter? Approval alone never exports."}
            {confirmation?.kind === "delete" && "Delete the encounter content under the configured retention workflow? This cannot be undone from this workspace."}
            {confirmation?.kind === "consent" && `Record the in-person consent decision as ${confirmation.decision.replaceAll("_", " ")}?`}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button disabled={pendingAction !== null} onClick={() => setConfirmation(null)}>Cancel</Button>
          <Button color={confirmation?.kind === "delete" ? "error" : "primary"} variant="contained" disabled={pendingAction !== null} onClick={() => void confirmAction().catch(() => undefined)}>Confirm</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export const ScribeReviewPage = LiveScribeReviewWorkspace;
