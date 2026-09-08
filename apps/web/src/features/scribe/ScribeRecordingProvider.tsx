import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import ExpandLessOutlinedIcon from "@mui/icons-material/ExpandLessOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import NotesOutlinedIcon from "@mui/icons-material/NotesOutlined";
import {
  Alert,
  Box,
  Button,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "../../api/client";
import { useClinicNavigation } from "../clinic/clinicNavigation";
import {
  ScribeRecordingControls,
  type ScribeRecordingAudioSource,
  type ScribeRecordingState,
  type ScribeSegmentCompletionReason,
  type ScribeTelehealthCaptureAuthorization,
} from "./ScribeRecordingControls";

export type ScribeRecordingSessionInput = {
  encounterId: number;
  encounterVersion: number;
  processingAllowed: boolean;
  scopeKey: string;
  patientLabel: string;
  contextContent: string;
  returnPath?: string;
  presentation?: "floating" | "in_call";
  telehealthVisitPublicId?: string;
  audioSource?: ScribeRecordingAudioSource;
  telehealthCapture?: ScribeTelehealthCaptureAuthorization;
  deferProcessing?: boolean;
  onSegmentFinalized?: (
    recordingId: number,
    reason: ScribeSegmentCompletionReason,
  ) => void;
};

export type PersistentScribeValue = {
  session: ScribeRecordingSessionInput | null;
  state: ScribeRecordingState;
  begin: (
    input: ScribeRecordingSessionInput,
    options?: { startRecording?: boolean },
  ) => boolean;
  reconcile: (input: {
    encounterId: number;
    encounterVersion: number;
    processingAllowed: boolean;
    contextContent: string;
    scrubContext?: boolean;
    audioSource?: ScribeRecordingAudioSource;
    telehealthCapture?: ScribeTelehealthCaptureAuthorization;
    deferProcessing?: boolean;
    onSegmentFinalized?: ScribeRecordingSessionInput["onSegmentFinalized"];
  }) => void;
  expand: () => void;
  start: () => void;
  finish: () => void;
  discard: () => void;
  terminateTelehealthCapture: (visitPublicId: string, reason?: string) => void;
  contextValue: string;
  setContextValue: (value: string) => void;
  contextDirty: boolean;
  contextSaving: boolean;
  contextError: string | null;
  latestSavedContext: string | null;
  useLatestSavedContext: () => void;
  keepTypedContext: () => void;
  saveContext: () => Promise<boolean>;
};

const initialState: ScribeRecordingState = {
  active: false,
  phase: "idle",
  recordingId: null,
  elapsedMs: 0,
  pendingChunks: 0,
  inputLevel: 0,
};
const PersistentScribeContext = createContext<PersistentScribeValue | null>(
  null,
);

export function canBeginPersistentScribeSession(
  current: ScribeRecordingSessionInput | null,
  incoming: ScribeRecordingSessionInput,
  startRecording = true,
) {
  return (
    (!startRecording || incoming.processingAllowed) &&
    (!current || current.encounterId === incoming.encounterId)
  );
}

export function scribeReviewPath(
  encounterId: number,
  reviewToken?: string | number,
) {
  const base = `/clinic/scribe?encounter_id=${encounterId}&review=1`;
  return reviewToken === undefined
    ? base
    : `${base}&review_token=${encodeURIComponent(reviewToken)}`;
}

export function useOptionalScribeRecording() {
  return useContext(PersistentScribeContext);
}

export function useScribeRecording() {
  const value = useOptionalScribeRecording();
  if (!value)
    throw new Error(
      "Persistent Scribe recording requires the clinic workspace provider.",
    );
  return value;
}

function elapsedLabel(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function ScribeRecordingProvider({ children }: { children: ReactNode }) {
  const { navigate } = useClinicNavigation();
  const [session, setSession] = useState<ScribeRecordingSessionInput | null>(
    null,
  );
  const [state, setState] = useState(initialState);
  const [expanded, setExpanded] = useState(true);
  const [contextValue, setContextValue] = useState("");
  const [contextBaseline, setContextBaseline] = useState("");
  const [encounterVersion, setEncounterVersion] = useState(0);
  const [startToken, setStartToken] = useState(0);
  const [finishToken, setFinishToken] = useState(0);
  const [discardToken, setDiscardToken] = useState(0);
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [navigationDeclined, setNavigationDeclined] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [latestSavedContext, setLatestSavedContext] = useState<string | null>(
    null,
  );
  const [latestSavedVersion, setLatestSavedVersion] = useState<number | null>(
    null,
  );
  const finishPendingRef = useRef(false);
  const contextMutationRef = useRef<Promise<boolean> | null>(null);
  const contextGenerationRef = useRef(0);
  const directFinishRef = useRef<(() => void) | null>(null);
  const dirty = contextValue !== contextBaseline;
  const sessionRef = useRef(session);
  const stateRef = useRef(state);
  const dirtyRef = useRef(dirty);
  const contextBaselineRef = useRef(contextBaseline);
  sessionRef.current = session;
  stateRef.current = state;
  dirtyRef.current = dirty;
  contextBaselineRef.current = contextBaseline;

  const begin = useCallback(
    (
      input: ScribeRecordingSessionInput,
      options: { startRecording?: boolean } = {},
    ) => {
      const startRecording = options.startRecording !== false;
      const current = sessionRef.current;
      if (!canBeginPersistentScribeSession(current, input, startRecording))
        return false;
      if (current) {
        if (current.encounterId === input.encounterId) {
          const merged = { ...current, ...input };
          sessionRef.current = merged;
          setSession(merged);
          setExpanded(true);
          if (startRecording) setStartToken((value) => value + 1);
        }
        return current.encounterId === input.encounterId;
      }
      sessionRef.current = input;
      setSession(input);
      setContextValue(input.contextContent);
      setContextBaseline(input.contextContent);
      setEncounterVersion(input.encounterVersion);
      setState(initialState);
      setError(null);
      setNavigationDeclined(false);
      setExpanded(true);
      if (startRecording) setStartToken((value) => value + 1);
      return true;
    },
    [],
  );

  const reconcile = useCallback(
    (input: {
      encounterId: number;
      encounterVersion: number;
      processingAllowed: boolean;
      contextContent: string;
      scrubContext?: boolean;
      audioSource?: ScribeRecordingAudioSource;
      telehealthCapture?: ScribeTelehealthCaptureAuthorization;
      deferProcessing?: boolean;
      onSegmentFinalized?: ScribeRecordingSessionInput["onSegmentFinalized"];
    }) => {
      const current = sessionRef.current;
      if (!current || current.encounterId !== input.encounterId) return;
      const merged = {
        ...current,
        encounterVersion: input.encounterVersion,
        processingAllowed: input.processingAllowed,
        ...(input.audioSource ? { audioSource: input.audioSource } : {}),
        ...(input.telehealthCapture
          ? { telehealthCapture: input.telehealthCapture }
          : {}),
        ...(input.deferProcessing === undefined
          ? {}
          : { deferProcessing: input.deferProcessing }),
        ...(input.onSegmentFinalized
          ? { onSegmentFinalized: input.onSegmentFinalized }
          : {}),
      };
      sessionRef.current = merged;
      setSession(merged);
      if (input.scrubContext) {
        contextGenerationRef.current += 1;
        setContextValue(input.contextContent);
        setContextBaseline(input.contextContent);
        setEncounterVersion(input.encounterVersion);
        setLatestSavedContext(null);
        setLatestSavedVersion(null);
        setError(null);
      } else if (!dirtyRef.current) {
        setContextValue(input.contextContent);
        setContextBaseline(input.contextContent);
        setEncounterVersion(input.encounterVersion);
      } else if (input.contextContent === contextBaselineRef.current) {
        setEncounterVersion(input.encounterVersion);
      } else {
        setLatestSavedContext(input.contextContent);
        setLatestSavedVersion(input.encounterVersion);
        setError(
          "Visit context changed elsewhere. Your typed context is preserved until you choose which version to keep.",
        );
        setExpanded(true);
      }
    },
    [],
  );

  const saveContext = useCallback(async () => {
    if (contextMutationRef.current) return contextMutationRef.current;
    if (!session || contextValue === contextBaseline) return true;
    const submitted = contextValue.trim();
    const generation = contextGenerationRef.current;
    const request = (async () => {
      setSaving(true);
      setError(null);
      try {
        const response = await api<{
          encounter: { version: number; context_content: string | null };
        }>(`/api/clinic/scribe/encounters/${session.encounterId}/context`, {
          method: "PATCH",
          body: {
            context: {
              content: contextValue,
              source_type: "reviewer_authored",
              expected_version: encounterVersion,
            },
          },
        });
        const saved = response.encounter.context_content ?? "";
        if (generation !== contextGenerationRef.current) return false;
        setContextValue(saved);
        setContextBaseline(saved);
        setEncounterVersion(response.encounter.version);
        setLatestSavedContext(null);
        setLatestSavedVersion(null);
        return true;
      } catch (reason) {
        try {
          const current = await api<{
            encounter: { version: number; context_content: string | null };
          }>(`/api/clinic/scribe/encounters/${session.encounterId}`);
          const authoritative = current.encounter.context_content ?? "";
          if (generation !== contextGenerationRef.current) return false;
          setEncounterVersion(current.encounter.version);
          if (authoritative === submitted) {
            setContextValue(authoritative);
            setContextBaseline(authoritative);
            setLatestSavedContext(null);
            setLatestSavedVersion(null);
            return true;
          }
          setLatestSavedContext(authoritative);
          setLatestSavedVersion(current.encounter.version);
          setError(
            "Visit context changed elsewhere. Your typed context is preserved until you choose which version to keep.",
          );
        } catch {
          setError(
            "The context save outcome is not confirmed. Your typed context is preserved; retry after the connection recovers.",
          );
        }
        setExpanded(true);
        return false;
      } finally {
        setSaving(false);
      }
    })().finally(() => {
      contextMutationRef.current = null;
    });
    contextMutationRef.current = request;
    return request;
  }, [contextBaseline, contextValue, encounterVersion, session]);

  const useLatestSavedContext = useCallback(() => {
    if (latestSavedContext === null || latestSavedVersion === null) return;
    contextGenerationRef.current += 1;
    setContextValue(latestSavedContext);
    setContextBaseline(latestSavedContext);
    setEncounterVersion(latestSavedVersion);
    setLatestSavedContext(null);
    setLatestSavedVersion(null);
    setError(null);
  }, [latestSavedContext, latestSavedVersion]);

  const keepTypedContext = useCallback(() => {
    if (latestSavedContext === null || latestSavedVersion === null) return;
    setContextBaseline(latestSavedContext);
    setEncounterVersion(latestSavedVersion);
    setLatestSavedContext(null);
    setLatestSavedVersion(null);
    setError(null);
  }, [latestSavedContext, latestSavedVersion]);

  const returnToNote = useCallback(
    (reviewToken?: string | number) => {
      if (!session) return false;
      const accepted = navigate(
        scribeReviewPath(
          session.encounterId,
          reviewToken ?? crypto.randomUUID(),
        ),
      );
      setNavigationDeclined(!accepted);
      if (!accepted) setFinishing(false);
      if (accepted) setSession(null);
      return accepted;
    },
    [navigate, session],
  );

  const requestFinish = useCallback(async () => {
    if (!session || finishPendingRef.current) return;
    finishPendingRef.current = true;
    setFinishing(true);
    const saved = await saveContext();
    finishPendingRef.current = false;
    if (!saved) {
      setFinishing(false);
      return;
    }
    if (state.recordingId === null) returnToNote();
    else setFinishToken((value) => value + 1);
  }, [returnToNote, saveContext, session, state.recordingId]);

  const startRecording = useCallback(() => {
    if (sessionRef.current && !stateRef.current.active)
      setStartToken((value) => value + 1);
  }, []);

  const registerExternalFinish = useCallback((finish: (() => void) | null) => {
    directFinishRef.current = finish;
  }, []);

  const finishRecording = useCallback(() => {
    if (!sessionRef.current || !stateRef.current.active) return;
    if (directFinishRef.current) directFinishRef.current();
    else setFinishToken((value) => value + 1);
  }, []);

  const discardRecording = useCallback(() => {
    if (sessionRef.current && stateRef.current.active)
      setDiscardToken((value) => value + 1);
  }, []);

  const terminateTelehealthCapture = useCallback(
    (visitPublicId: string, _reason?: string) => {
      if (
        sessionRef.current?.telehealthVisitPublicId === visitPublicId &&
        stateRef.current.active
      )
        if (directFinishRef.current) directFinishRef.current();
        else setFinishToken((value) => value + 1);
    },
    [],
  );

  const value = useMemo<PersistentScribeValue>(
    () => ({
      session,
      state,
      begin,
      reconcile,
      expand: () => setExpanded(true),
      start: startRecording,
      finish: finishRecording,
      discard: discardRecording,
      terminateTelehealthCapture,
      contextValue,
      setContextValue,
      contextDirty: dirty,
      contextSaving: saving,
      contextError: error,
      latestSavedContext,
      useLatestSavedContext,
      keepTypedContext,
      saveContext,
    }),
    [
      begin,
      contextValue,
      dirty,
      discardRecording,
      error,
      finishRecording,
      keepTypedContext,
      latestSavedContext,
      reconcile,
      saveContext,
      saving,
      session,
      startRecording,
      state,
      terminateTelehealthCapture,
      useLatestSavedContext,
    ],
  );

  useEffect(() => {
    if (!dirty && !state.active) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, state.active]);

  useEffect(() => {
    if (state.phase === "upload_error") setFinishing(false);
  }, [state.phase]);

  const recordingCompleted = useCallback(
    async (recordingId: number) => {
      const saved = await saveContext();
      if (!saved) {
        setFinishing(false);
        return;
      }
      returnToNote(recordingId);
    },
    [returnToNote, saveContext],
  );

  return (
    <PersistentScribeContext value={value}>
      {children}
      {session?.presentation === "in_call" && (
        <ScribeRecordingControls
          encounterId={session.encounterId}
          encounterVersion={encounterVersion}
          processingAllowed={session.processingAllowed}
          scopeKey={session.scopeKey}
          startRequestToken={startToken}
          finishRequestToken={finishToken}
          discardRequestToken={discardToken}
          onRecordingStateChange={setState}
          onCancelled={() => setSession(null)}
          audioSource={session.audioSource}
          telehealthCapture={session.telehealthCapture}
          deferProcessing={session.deferProcessing}
          onFinalized={session.onSegmentFinalized}
          registerExternalFinish={registerExternalFinish}
          headless
        />
      )}
      {session && session.presentation !== "in_call" && (
        <Paper
          component="aside"
          elevation={8}
          aria-label={`Scribe recording for ${session.patientLabel}`}
          sx={{
            position: "fixed",
            right: { xs: 1, sm: 2 },
            bottom: { xs: 1, sm: 2 },
            zIndex: (theme) => theme.zIndex.drawer + 2,
            width: { xs: "calc(100vw - 16px)", sm: 380 },
            maxHeight: "calc(100vh - 32px)",
            overflow: "auto",
            border: 1,
            borderColor: "divider",
          }}
        >
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: "center",
              px: 1.5,
              py: 1,
              borderBottom: expanded ? 1 : 0,
              borderColor: "divider",
            }}
          >
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="subtitle2" noWrap sx={{ fontWeight: 700 }}>
                {session.patientLabel}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                aria-live="polite"
              >
                {elapsedLabel(state.elapsedMs)} ·{" "}
                {state.phase.replaceAll("_", " ")}
                {dirty ? " · Unsaved context" : " · Context saved"}
              </Typography>
            </Box>
            <Tooltip
              title={expanded ? "Minimize Scribe" : "Expand Scribe notes"}
            >
              <IconButton
                aria-label={
                  expanded ? "Minimize Scribe" : "Expand Scribe notes"
                }
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? (
                  <ExpandMoreOutlinedIcon />
                ) : (
                  <ExpandLessOutlinedIcon />
                )}
              </IconButton>
            </Tooltip>
            {!state.active && state.phase === "completed" && (
              <Tooltip title="Close completed recording panel">
                <IconButton
                  aria-label="Close completed recording panel"
                  disabled={dirty || saving || finishing}
                  onClick={() => setSession(null)}
                >
                  <CloseOutlinedIcon />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
          <Box sx={{ p: 1.5 }}>
            <ScribeRecordingControls
              encounterId={session.encounterId}
              encounterVersion={encounterVersion}
              processingAllowed={session.processingAllowed}
              scopeKey={session.scopeKey}
              startRequestToken={startToken}
              finishRequestToken={finishToken}
              discardRequestToken={discardToken}
              onRecordingStateChange={setState}
              onFinishRequest={() => void requestFinish()}
              onDiscardRequest={() => setConfirmDiscard(true)}
              onCompleted={(recordingId) =>
                void recordingCompleted(recordingId)
              }
              onCancelled={() => setSession(null)}
              embedded
              compact={!expanded}
            />
          </Box>
          <Collapse in={expanded} unmountOnExit>
            <Stack spacing={1.25} sx={{ px: 1.5, pb: 1.5 }}>
              <TextField
                label="Visit context"
                multiline
                minRows={4}
                maxRows={10}
                value={contextValue}
                disabled={saving || finishing}
                onChange={(event) => setContextValue(event.target.value)}
                placeholder="Reason for visit, known history, observations, and documentation context"
                slotProps={{
                  input: {
                    "aria-describedby": "persistent-scribe-context-status",
                  },
                }}
              />
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: "center", justifyContent: "space-between" }}
              >
                <Typography
                  id="persistent-scribe-context-status"
                  variant="caption"
                  color={dirty ? "warning.main" : "text.secondary"}
                >
                  {saving
                    ? "Saving context…"
                    : dirty
                      ? "Unsaved context"
                      : "Context saved"}
                </Typography>
                <Button
                  size="small"
                  variant={dirty ? "contained" : "text"}
                  startIcon={<NotesOutlinedIcon />}
                  disabled={!dirty || saving || finishing}
                  onClick={() => void saveContext()}
                >
                  Save context
                </Button>
              </Stack>
              {error && <Alert severity="error">{error}</Alert>}
              {latestSavedContext !== null && latestSavedVersion !== null && (
                <Stack spacing={1}>
                  <TextField
                    label="Latest saved context"
                    value={latestSavedContext}
                    multiline
                    minRows={2}
                    slotProps={{ input: { readOnly: true } }}
                  />
                  <Stack direction="row" spacing={1}>
                    <Button size="small" onClick={useLatestSavedContext}>
                      Use latest saved
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={keepTypedContext}
                    >
                      Keep my typed context
                    </Button>
                  </Stack>
                </Stack>
              )}
              {!state.active && state.phase !== "completed" && (
                <Button
                  variant="outlined"
                  disabled={saving}
                  onClick={() => void requestFinish()}
                >
                  Finish context & review
                </Button>
              )}
              {navigationDeclined && (
                <Alert
                  severity="info"
                  action={
                    <Button
                      color="inherit"
                      size="small"
                      onClick={() => returnToNote()}
                    >
                      Return to note
                    </Button>
                  }
                >
                  Recording and context are saved. Finish your current page
                  changes, then return to the note.
                </Alert>
              )}
            </Stack>
          </Collapse>
          {!expanded && error && <Alert severity="error">{error}</Alert>}
        </Paper>
      )}
      <Dialog open={confirmDiscard} onClose={() => setConfirmDiscard(false)}>
        <DialogTitle>Discard this recording?</DialogTitle>
        <DialogContent>
          The saved audio chunks will be scrubbed. Unsaved visit context in this
          panel will also be discarded.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDiscard(false)}>
            Keep recording
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              setConfirmDiscard(false);
              setDiscardToken((value) => value + 1);
            }}
          >
            Discard recording
          </Button>
        </DialogActions>
      </Dialog>
    </PersistentScribeContext>
  );
}
