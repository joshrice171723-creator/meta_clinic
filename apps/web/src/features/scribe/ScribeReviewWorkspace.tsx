import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import type {
  ScribeDraft,
  ScribeDraftSection,
  ScribeEncounter,
  ScribeSource,
  ScribeSourceSegment,
} from "./types";

export type ScribeReviewState =
  | { kind: "loading"; message?: string }
  | { kind: "error"; message: string }
  | { kind: "empty"; message?: string }
  | { kind: "unknown"; message?: string }
  | { kind: "ready"; encounter: ScribeEncounter };

export type ScribeReviewWorkspaceProps = {
  state: ScribeReviewState;
  onRetry?: () => void;
  onApprove?: (draftId: number) => void;
  onExport?: (draftId: number) => void;
  onSectionChange?: (
    sectionKey: ScribeDraftSection["section_key"],
    content: string,
  ) => void;
  onEvidenceSelect?: (segmentId: number) => void;
  onSaveSection?: (
    draftId: number,
    sectionKey: ScribeDraftSection["section_key"],
    content: string,
  ) => void | Promise<void>;
  onSaveDraft?: (
    draftId: number,
    sections: Record<ScribeDraftSection["section_key"], string>,
  ) => void | Promise<void>;
  onRestoreDraft?: (draftId: number) => void | Promise<void>;
  onAcceptSection?: (
    draftId: number,
    sectionKey: ScribeDraftSection["section_key"],
  ) => void | Promise<void>;
  onRejectSection?: (
    draftId: number,
    sectionKey: ScribeDraftSection["section_key"],
  ) => void | Promise<void>;
  pendingAction?: string | null;
  onUnsavedEditsChange?: (hasUnsavedEdits: boolean) => void;
  discardEditsToken?: number;
  documentId?: number;
  followCurrentDraftId?: number | null;
  exportLabel?: string;
};

const sectionLabels: Record<ScribeDraftSection["section_key"], string> = {
  subjective: "Subjective",
  objective: "Objective",
  assessment: "Assessment",
  plan: "Plan",
};
const speakerLabels: Record<ScribeSourceSegment["speaker"], string> = {
  patient: "Patient",
  clinician: "Clinician",
  caregiver: "Caregiver",
  unknown: "Speaker not identified",
};
const knownDraftStatuses = new Set<ScribeDraft["status"]>([
  "draft",
  "in_review",
  "approved",
  "superseded",
  "exported",
  "deleted",
]);
const currentDraftStatuses = new Set<ScribeDraft["status"]>([
  "draft",
  "in_review",
  "approved",
  "exported",
]);

function draftBelongsToDocument(draft: ScribeDraft, documentId?: number) {
  return documentId === undefined || (draft.document_id ?? 0) === documentId;
}

function currentDraft(encounter: ScribeEncounter, documentId?: number) {
  const revisions = encounter.drafts.filter((draft) =>
    draftBelongsToDocument(draft, documentId),
  );
  return (
    revisions.find(
      (draft) =>
        draft.current !== false && currentDraftStatuses.has(draft.status),
    ) ?? revisions[0]
  );
}

export function reconciledSelectedDraftId(
  encounter: ScribeEncounter,
  documentId: number | undefined,
  selectedDraftId: number | null,
  followCurrentDraftId: number | null | undefined,
) {
  const revisions = encounter.drafts.filter((draft) =>
    draftBelongsToDocument(draft, documentId),
  );
  if (
    followCurrentDraftId != null &&
    revisions.some(({ id }) => id === followCurrentDraftId)
  )
    return followCurrentDraftId;
  if (
    selectedDraftId != null &&
    revisions.some(({ id }) => id === selectedDraftId)
  )
    return selectedDraftId;
  return currentDraft(encounter, documentId)?.id ?? null;
}
function sourceForDraft(encounter: ScribeEncounter, draft?: ScribeDraft) {
  return (
    (draft &&
      encounter.sources.find((source) => source.id === draft.source_id)) ??
    encounter.sources[0]
  );
}
function sourcesForDraft(encounter: ScribeEncounter, draft?: ScribeDraft) {
  const sourceIds = draft?.input_sources
    ?.filter((source) => source.kind === "transcript")
    .map((source) => source.source_id);
  if (sourceIds?.length)
    return sourceIds
      .map((id) => encounter.sources.find((source) => source.id === id))
      .filter((source): source is ScribeSource => Boolean(source));
  const fallback = sourceForDraft(encounter, draft);
  return fallback ? [fallback] : [];
}
function baselineForDraft(draft: ScribeDraft) {
  return Object.fromEntries(
    draft.sections.map((section) => [
      section.section_key,
      section.effective_content ?? "",
    ]),
  );
}
function hasContextInput(draft: ScribeDraft) {
  return draft.input_sources?.some(
    (source) => source.kind === "reviewer_authored_context",
  );
}

function recordTime(value: string | null) {
  if (!value) return "Not recorded";
  const instant = new Date(value);
  return Number.isNaN(instant.getTime())
    ? "Time unavailable"
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(instant);
}

function approvingAccount(draft: ScribeDraft) {
  return draft.approved_by_account_reference
    ? `Account #${draft.approved_by_account_reference}`
    : "Not recorded";
}
export function hasUnsavedDraftEdits(
  draft: ScribeDraft | undefined,
  edits: Record<string, string>,
) {
  if (!draft) return false;
  return draft.sections.some(
    (section) =>
      section.section_key in edits &&
      edits[section.section_key] !== (section.effective_content ?? ""),
  );
}
export function reviewStateSummary(
  draft: ScribeDraft | undefined,
  source?: ScribeSource,
) {
  if (!draft) return { unresolved: true, approved: false, exported: false };
  const hasReviewableInput = Boolean(
    (source && source.status === "ready" && source.content !== null) ||
    hasContextInput(draft),
  );
  const unresolved =
    !knownDraftStatuses.has(draft.status) ||
    !currentDraftStatuses.has(draft.status) ||
    draft.current === false ||
    Boolean(draft.stale) ||
    !hasReviewableInput ||
    draft.sections.length === 0 ||
    draft.sections.some(
      (section) =>
        !(section.effective_content ?? "").trim() ||
        section.status === "needs_review" ||
        section.status === "rejected" ||
        section.warning_codes.length > 0,
    );
  return {
    unresolved,
    approved: draft.status === "approved" || draft.status === "exported",
    exported:
      draft.status === "exported" ||
      draft.export_state === "exported" ||
      draft.exports.some((record) => record.status === "exported"),
    chartWritten: draft.exports.some(
      (record) => record.status === "exported" && record.chart_written === true,
    ),
  };
}

function StatePanel({
  icon,
  title,
  children,
  tone = "info",
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  tone?: "info" | "warning" | "error";
}) {
  return (
    <Alert
      severity={tone}
      icon={icon}
      sx={{
        m: 3,
        alignItems: "flex-start",
        "& .MuiAlert-message": { width: "100%" },
      }}
    >
      <Typography component="h2" variant="h6" sx={{ mb: 0.5 }}>
        {title}
      </Typography>
      {children}
    </Alert>
  );
}
function formatTime(milliseconds: number) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0)
    return "Time not recorded";
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
const warningLabels: Record<string, string> = {
  abstained: "No supported content was generated",
  no_source_evidence: "No source evidence is linked",
  source_incomplete: "The source is incomplete",
  speaker_uncertain: "A speaker could not be confirmed",
  low_confidence: "Source confidence is low",
};
function warningLabel(code: string) {
  return (
    warningLabels[code] ??
    code
      .replaceAll("_", " ")
      .replace(/^./, (character) => character.toUpperCase())
  );
}
function unresolvedReasons(section: ScribeDraftSection) {
  return [
    ...section.warning_codes.map(warningLabel),
    ...(section.status === "needs_review"
      ? ["Reviewer decision required"]
      : []),
    ...(section.status === "rejected" ? ["Section rejected"] : []),
    ...(!(section.effective_content ?? "").trim()
      ? ["Content not recorded"]
      : []),
  ];
}

export function sectionAcceptBlocked(
  section: ScribeDraftSection,
  options: { dirty: boolean; stale: boolean },
) {
  return (
    options.dirty ||
    options.stale ||
    section.warning_codes.length > 0 ||
    !(section.effective_content ?? "").trim()
  );
}

function SourceTranscript({
  sources,
  contextGrounded,
  selectedSegmentId,
  onSelect,
}: {
  sources: ScribeSource[];
  contextGrounded?: boolean;
  selectedSegmentId: number | null;
  onSelect: (id: number) => void;
}) {
  if (!sources.length && contextGrounded)
    return (
      <Alert severity="info">
        Reviewer context is the grounding source for this revision. No spoken
        transcript is attached.
      </Alert>
    );
  if (
    !sources.length ||
    sources.some(
      (source) => source.content === null || source.status === "deleted",
    )
  )
    return (
      <Alert severity="warning">
        Source transcript is unavailable. Approval remains blocked.
      </Alert>
    );
  return (
    <Stack spacing={1.5}>
      <Box>
        <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
          Source transcript
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Imported evidence for this revision. This is not generated content.
        </Typography>
      </Box>
      {sources.some((source) => source.status !== "ready") && (
        <Alert severity="warning">
          One or more source segments are not ready. Resolve them before
          approval.
        </Alert>
      )}
      <List disablePadding aria-label="Transcript source spans">
        {sources.some((source) => source.segments.length) ? (
          sources.flatMap((source) =>
            source.segments.map((segment) => (
              <ListItemButton
                key={segment.id}
                id={`scribe-source-segment-${segment.id}`}
                selected={selectedSegmentId === segment.id}
                onClick={() => onSelect(segment.id)}
                sx={{ borderRadius: 1, alignItems: "flex-start", mb: 0.5 }}
              >
                <ListItemText
                  primary={`${speakerLabels[segment.speaker]} · ${formatTime(segment.start_ms)}`}
                  secondary={
                    segment.content?.trim() || "Transcript text unavailable."
                  }
                  slotProps={{
                    primary: {
                      variant: "caption",
                      color: "text.secondary",
                      sx: { fontVariantNumeric: "tabular-nums" },
                    },
                    secondary: {
                      color: "text.primary",
                      sx: {
                        mt: 0.25,
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                      },
                    },
                  }}
                />
              </ListItemButton>
            )),
          )
        ) : (
          <Typography color="text.secondary" variant="body2">
            No transcript spans are available.
          </Typography>
        )}
      </List>
    </Stack>
  );
}

function ReviewDrawer({
  open,
  onClose,
  encounter,
  draft,
  currentDraftId,
  sources,
  selectedSegmentId,
  onEvidenceSelect,
  onSelectDraft,
}: {
  open: boolean;
  onClose: () => void;
  encounter: ScribeEncounter;
  draft: ScribeDraft;
  currentDraftId?: number;
  sources: ScribeSource[];
  selectedSegmentId: number | null;
  onEvidenceSelect: (id: number) => void;
  onSelectDraft: (id: number) => void;
}) {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: { sx: { width: { xs: "100%", sm: 440 }, maxWidth: "100%" } },
      }}
    >
      <Stack sx={{ height: "100%" }}>
        <Stack
          direction="row"
          sx={{
            alignItems: "center",
            justifyContent: "space-between",
            px: 2.5,
            py: 2,
          }}
        >
          <Box>
            <Typography component="h2" variant="h6">
              Sources, review and history
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Revision {draft.revision_number ?? draft.version} ·{" "}
              {draft.status.replaceAll("_", " ")}
            </Typography>
          </Box>
          <IconButton aria-label="Close sources and review" onClick={onClose}>
            <CloseOutlinedIcon />
          </IconButton>
        </Stack>
        <Divider />
        <Box sx={{ p: 2.5, overflowY: "auto", minHeight: 0 }}>
          <Stack spacing={3}>
            <Box>
              <Typography
                component="h3"
                variant="subtitle1"
                gutterBottom
                sx={{ fontWeight: 700 }}
              >
                Revision history
              </Typography>
              <List disablePadding>
                {encounter.drafts
                  .filter(
                    (revision) =>
                      (revision.document_id ?? 0) === (draft.document_id ?? 0),
                  )
                  .map((revision) => (
                    <ListItemButton
                      key={revision.id}
                      selected={revision.id === draft.id}
                      onClick={() => onSelectDraft(revision.id)}
                      sx={{ borderRadius: 1 }}
                    >
                      <ListItemText
                        primary={`Revision ${revision.revision_number ?? revision.version}`}
                        secondary={`${revision.status.replaceAll("_", " ")}${revision.id === currentDraftId ? " · current" : " · read only"}`}
                        slotProps={{
                          secondary: { sx: { textTransform: "capitalize" } },
                        }}
                      />
                    </ListItemButton>
                  ))}
              </List>
            </Box>
            <Divider />
            <SourceTranscript
              sources={sources}
              contextGrounded={hasContextInput(draft)}
              selectedSegmentId={selectedSegmentId}
              onSelect={onEvidenceSelect}
            />
            <Divider />
            <Box>
              <Typography
                component="h3"
                variant="subtitle1"
                gutterBottom
                sx={{ fontWeight: 700 }}
              >
                Review details
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mb: 1.5, overflowWrap: "anywhere" }}
              >
                Generated draft provenance: {draft.provider} / {draft.model}{" "}
                {draft.model_version}. Input digest {draft.input_digest}.
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mb: 1.5 }}
              >
                Approval recorded: {recordTime(draft.approved_at)} · Approved
                by: {approvingAccount(draft)}
              </Typography>
              {draft.warnings.length > 0 && (
                <Alert severity="warning" sx={{ mb: 1.5 }}>
                  Draft review: {draft.warnings.map(warningLabel).join(" · ")}
                </Alert>
              )}
              <Stack spacing={1.25}>
                {draft.sections.map((section) => {
                  const reasons = unresolvedReasons(section);
                  return (
                    <Box key={section.id}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {sectionLabels[section.section_key]}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {section.human_content !== null
                          ? "Human-edited version"
                          : "Generated draft"}{" "}
                        · {section.status.replaceAll("_", " ")}
                      </Typography>
                      {reasons.length > 0 && (
                        <Typography variant="body2" color="warning.main">
                          Needs review: {reasons.join(" · ")}
                        </Typography>
                      )}
                      {section.evidence_segment_ids.length > 0 && (
                        <Stack
                          direction="row"
                          spacing={0.5}
                          useFlexGap
                          sx={{ mt: 0.5, flexWrap: "wrap" }}
                        >
                          {section.evidence_segment_ids.map((id) => {
                            const segment = sources
                              .flatMap((source) => source.segments)
                              .find((item) => item.id === id);
                            return segment ? (
                              <Button
                                key={id}
                                size="small"
                                variant="text"
                                aria-label={`Show source span ${segment.sequence} for ${sectionLabels[section.section_key]}`}
                                aria-controls={`scribe-source-segment-${id}`}
                                onClick={() => onEvidenceSelect(id)}
                              >
                                Span {segment.sequence}
                              </Button>
                            ) : (
                              <Chip
                                key={id}
                                size="small"
                                variant="outlined"
                                label={`Span ${id} unavailable`}
                              />
                            );
                          })}
                        </Stack>
                      )}
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          </Stack>
        </Box>
      </Stack>
    </Drawer>
  );
}

export function ScribeReviewWorkspace({
  state,
  onRetry,
  onApprove,
  onExport,
  onSectionChange,
  onEvidenceSelect,
  onSaveSection,
  onSaveDraft,
  onRestoreDraft,
  onAcceptSection,
  onRejectSection,
  pendingAction = null,
  onUnsavedEditsChange,
  discardEditsToken,
  documentId,
  followCurrentDraftId,
  exportLabel = "Save to chart",
}: ScribeReviewWorkspaceProps) {
  const [selectedSegmentId, setSelectedSegmentId] = useState<number | null>(
    null,
  );
  const [selectedDraftId, setSelectedDraftId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const editContextRef = useRef<{
    encounterId: number;
    draftId: number;
    baseline: Record<string, string>;
  } | null>(null);
  const discardTokenRef = useRef(discardEditsToken);
  const consumedFollowRef = useRef<number | null>(null);
  const encounter = state.kind === "ready" ? state.encounter : undefined;
  const latestDraft = useMemo(
    () => (encounter ? currentDraft(encounter, documentId) : undefined),
    [documentId, encounter],
  );
  const draft = useMemo(
    () =>
      encounter?.drafts.find(
        (item) =>
          item.id === selectedDraftId &&
          draftBelongsToDocument(item, documentId),
      ) ?? latestDraft,
    [documentId, encounter, latestDraft, selectedDraftId],
  );
  const sources = useMemo(
    () => (encounter ? sourcesForDraft(encounter, draft) : []),
    [encounter, draft],
  );
  const source = sources.at(-1);
  const isCurrentRevision = Boolean(
    draft &&
    latestDraft &&
    draft.id === latestDraft.id &&
    draft.current !== false &&
    currentDraftStatuses.has(draft.status),
  );
  const isFreshCurrentRevision = isCurrentRevision && !draft?.stale;
  const reviewSummary = reviewStateSummary(draft, source);
  const hasUnsavedEdits = draft ? hasUnsavedDraftEdits(draft, edits) : false;

  useEffect(() => {
    if (!encounter) return;
    const pendingFollow =
      followCurrentDraftId != null &&
      consumedFollowRef.current !== followCurrentDraftId
        ? followCurrentDraftId
        : null;
    const nextId = reconciledSelectedDraftId(
      encounter,
      documentId,
      selectedDraftId,
      pendingFollow,
    );
    if (pendingFollow != null && nextId === pendingFollow)
      consumedFollowRef.current = pendingFollow;
    if (nextId !== selectedDraftId) setSelectedDraftId(nextId);
  }, [documentId, encounter, followCurrentDraftId, selectedDraftId]);
  useEffect(() => {
    if (!encounter || !draft) return;
    const serverEdits = baselineForDraft(draft);
    const previous = editContextRef.current;
    setSelectedSegmentId(null);
    setEdits((current) => {
      if (
        !previous ||
        previous.encounterId !== encounter.id ||
        previous.draftId !== draft.id
      )
        return serverEdits;
      return Object.fromEntries(
        draft.sections.map((section) => {
          const key = section.section_key;
          const wasDirty =
            key in current && current[key] !== (previous.baseline[key] ?? "");
          return [key, wasDirty ? current[key] : serverEdits[key]];
        }),
      );
    });
    editContextRef.current = {
      encounterId: encounter.id,
      draftId: draft.id,
      baseline: serverEdits,
    };
  }, [encounter?.id, draft?.id, draft?.version]);
  useEffect(() => {
    if (discardTokenRef.current === discardEditsToken) return;
    discardTokenRef.current = discardEditsToken;
    setEdits({ ...(editContextRef.current?.baseline ?? {}) });
  }, [discardEditsToken]);
  useEffect(() => {
    onUnsavedEditsChange?.(hasUnsavedEdits);
  }, [hasUnsavedEdits, onUnsavedEditsChange]);
  useEffect(() => {
    if (!hasUnsavedEdits || typeof window === "undefined") return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedEdits]);

  if (state.kind === "loading")
    return (
      <Stack spacing={2} role="status" aria-live="polite" sx={{ p: 3 }}>
        <Typography component="h2" variant="h6">
          Loading scribe review
        </Typography>
        <Typography color="text.secondary">
          {state.message ?? "Loading the current note…"}
        </Typography>
        <Skeleton variant="rounded" height={320} />
      </Stack>
    );
  if (state.kind === "error")
    return (
      <Stack spacing={1.5}>
        <StatePanel
          icon={<ErrorOutlineOutlinedIcon />}
          title="Scribe review could not load"
          tone="error"
        >
          <Typography>{state.message}</Typography>
        </StatePanel>
        {onRetry && (
          <Button
            variant="outlined"
            startIcon={<RefreshOutlinedIcon />}
            onClick={onRetry}
            sx={{ alignSelf: "flex-start", ml: 3 }}
          >
            Retry loading review
          </Button>
        )}
      </Stack>
    );
  if (state.kind === "unknown")
    return (
      <StatePanel
        icon={<ErrorOutlineOutlinedIcon />}
        title="Scribe review is unavailable"
        tone="warning"
      >
        <Typography>
          {state.message ??
            "The review payload contains an unknown state. Nothing has been approved or exported."}
        </Typography>
      </StatePanel>
    );
  if (state.kind === "empty" || !encounter || !draft)
    return (
      <Box
        sx={{
          minHeight: 440,
          display: "grid",
          placeItems: "center",
          px: 3,
          textAlign: "center",
        }}
      >
        <Box sx={{ maxWidth: 440 }}>
          <ArticleOutlinedIcon color="action" sx={{ fontSize: 38, mb: 1 }} />
          <Typography component="h2" variant="h5" gutterBottom>
            Ready when you are
          </Typography>
          <Typography color="text.secondary">
            {state.kind === "empty"
              ? (state.message ??
                "Add context or import a transcript to begin a note.")
              : "Add context or import a transcript to begin a note."}
          </Typography>
        </Box>
      </Box>
    );

  const approved = reviewSummary.approved;
  const approvalBlocked =
    reviewSummary.unresolved ||
    hasUnsavedEdits ||
    !isFreshCurrentRevision ||
    !onApprove;
  const exportBlocked =
    !approved ||
    reviewSummary.unresolved ||
    reviewSummary.exported ||
    hasUnsavedEdits ||
    !isFreshCurrentRevision ||
    !onExport;
  const blockingReviewCount = draft.sections.filter(
    (section) => unresolvedReasons(section).length > 0,
  ).length;
  // A revision that has already passed approval must not continue to advertise
  // historical generation warnings as outstanding review work.
  const reviewItemCount = approved
    ? 0
    : blockingReviewCount + draft.warnings.length;
  const saveState = pendingAction?.startsWith("review:")
    ? "Saving…"
    : hasUnsavedEdits
      ? "Unsaved changes"
      : draft.stale
        ? "Grounding changed"
        : "All changes saved";
  const selectEvidence = (id: number) => {
    setSelectedSegmentId(id);
    setDrawerOpen(true);
    onEvidenceSelect?.(id);
  };

  return (
    <Box
      component="main"
      aria-label="SOAP note editor"
      sx={{
        minWidth: 0,
        height: "100%",
        backgroundColor: "#faf9f9",
        overflowY: "auto",
        p: { xs: 1, sm: 1.5 },
      }}
    >
      <Paper
        component="article"
        variant="outlined"
        sx={{
          maxWidth: "none",
          minHeight: "100%",
          mx: "auto",
          borderRadius: 1.5,
          overflow: "hidden",
          boxShadow: "0 1px 10px rgba(45, 35, 39, 0.035)",
        }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          sx={{
            alignItems: { xs: "stretch", sm: "center" },
            justifyContent: "space-between",
            px: { xs: 1.5, sm: 2 },
            py: 1,
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{ alignItems: "center", flexWrap: "wrap" }}
          >
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              SOAP note
            </Typography>
            <Chip
              size="small"
              label={`Revision ${draft.revision_number ?? draft.version}`}
            />
            {!isCurrentRevision && (
              <Chip
                size="small"
                color="warning"
                variant="outlined"
                label="Read-only history"
              />
            )}
            <Typography
              variant="caption"
              color={hasUnsavedEdits ? "warning.main" : "text.secondary"}
              aria-live="polite"
            >
              {saveState}
            </Typography>
            {onSaveDraft && (
              <Button
                size="small"
                variant={hasUnsavedEdits || draft.stale ? "contained" : "text"}
                startIcon={<SaveOutlinedIcon />}
                disabled={
                  !isCurrentRevision ||
                  pendingAction !== null ||
                  (!hasUnsavedEdits && !draft.stale)
                }
                onClick={() =>
                  void Promise.resolve(
                    onSaveDraft(
                      draft.id,
                      Object.fromEntries(
                        draft.sections.map((section) => [
                          section.section_key,
                          edits[section.section_key] ??
                            section.effective_content ??
                            "",
                        ]),
                      ) as Record<ScribeDraftSection["section_key"], string>,
                    ),
                  ).catch(() => undefined)
                }
              >
                {draft.stale ? "Save fresh revision" : "Save changes"}
              </Button>
            )}
            {!isCurrentRevision && onRestoreDraft && (
              <Button
                size="small"
                variant="outlined"
                disabled={pendingAction !== null}
                onClick={() =>
                  void Promise.resolve(onRestoreDraft(draft.id)).catch(
                    () => undefined,
                  )
                }
              >
                Restore as current
              </Button>
            )}
          </Stack>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
            <Tooltip title="Revision history">
              <IconButton
                aria-label="Open revision history"
                onClick={() => setDrawerOpen(true)}
              >
                <HistoryOutlinedIcon />
              </IconButton>
            </Tooltip>
            <Button
              size="small"
              variant="text"
              startIcon={<FactCheckOutlinedIcon />}
              onClick={() => setDrawerOpen(true)}
            >
              Review{reviewItemCount > 0 ? ` (${reviewItemCount})` : ""}
            </Button>
          </Stack>
        </Stack>
        {!isCurrentRevision && (
          <Alert severity="warning" square>
            This historical revision is read only and cannot be approved or
            exported.
          </Alert>
        )}
        {isCurrentRevision && draft.stale && (
          <Alert severity="warning" square>
            The grounding inputs changed after this revision. Save the note to
            create a fresh review revision before approval or export.
          </Alert>
        )}
        <Box
          sx={{
            px: { xs: 2, sm: 3 },
            py: { xs: 2, sm: 2.5 },
            maxWidth: "82ch",
            mx: "auto",
          }}
        >
          <Stack spacing={2.75}>
            {draft.sections.map((section) => {
              const value =
                edits[section.section_key] ?? section.effective_content ?? "";
              const isDirty = value !== (section.effective_content ?? "");
              const reasons = unresolvedReasons(section);
              return (
                <Box
                  component="section"
                  key={section.id}
                  aria-labelledby={`scribe-section-${section.id}`}
                >
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1}
                    sx={{
                      justifyContent: "space-between",
                      alignItems: { xs: "flex-start", sm: "center" },
                      mb: 0.5,
                    }}
                  >
                    <Typography
                      id={`scribe-section-${section.id}`}
                      component="h2"
                      variant="h6"
                      sx={{ fontWeight: 700 }}
                    >
                      {sectionLabels[section.section_key]}
                    </Typography>
                    <Stack direction="row" spacing={0.5}>
                      {onAcceptSection && (
                        <Button
                          size="small"
                          variant="text"
                          disabled={
                            !isCurrentRevision ||
                            pendingAction !== null ||
                            sectionAcceptBlocked(section, {
                              dirty: isDirty,
                              stale: Boolean(draft.stale),
                            })
                          }
                          onClick={() =>
                            void Promise.resolve(
                              onAcceptSection(draft.id, section.section_key),
                            ).catch(() => undefined)
                          }
                        >
                          Accept
                        </Button>
                      )}
                      {onRejectSection && (
                        <Button
                          size="small"
                          color="warning"
                          variant="text"
                          disabled={
                            !isCurrentRevision ||
                            Boolean(draft.stale) ||
                            pendingAction !== null ||
                            isDirty
                          }
                          onClick={() =>
                            void Promise.resolve(
                              onRejectSection(draft.id, section.section_key),
                            ).catch(() => undefined)
                          }
                        >
                          Reject
                        </Button>
                      )}
                    </Stack>
                  </Stack>
                  <TextField
                    fullWidth
                    multiline
                    minRows={2}
                    value={value}
                    disabled={
                      !isCurrentRevision ||
                      pendingAction !== null ||
                      (!onSaveDraft && !onSaveSection)
                    }
                    placeholder={`Add ${sectionLabels[section.section_key].toLowerCase()} documentation`}
                    onChange={(event) => {
                      const content = event.target.value;
                      setEdits((current) => ({
                        ...current,
                        [section.section_key]: content,
                      }));
                      onSectionChange?.(section.section_key, content);
                    }}
                    slotProps={{
                      input: {
                        "aria-label": `${sectionLabels[section.section_key]} human-edited version`,
                      },
                    }}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        alignItems: "flex-start",
                        backgroundColor: "background.paper",
                        borderRadius: 0,
                        transition:
                          "background-color 120ms ease, box-shadow 120ms ease",
                        "& .MuiOutlinedInput-notchedOutline": {
                          borderColor: "transparent",
                        },
                        "&:hover .MuiOutlinedInput-notchedOutline": {
                          borderColor: "divider",
                        },
                        "&.Mui-focused": {
                          backgroundColor: "action.hover",
                          boxShadow: "inset 0 0 0 1px var(--clinic-accent)",
                        },
                        "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                          borderColor: "transparent",
                        },
                      },
                      "& textarea": {
                        lineHeight: 1.7,
                        overflowWrap: "anywhere",
                      },
                    }}
                  />
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1}
                    sx={{
                      alignItems: { xs: "flex-start", sm: "center" },
                      mt: 1,
                    }}
                  >
                    {onSaveSection && (
                      <Button
                        size="small"
                        variant={isDirty ? "contained" : "text"}
                        startIcon={<SaveOutlinedIcon />}
                        disabled={
                          !isCurrentRevision ||
                          pendingAction !== null ||
                          !isDirty ||
                          !value.trim()
                        }
                        onClick={() =>
                          void Promise.resolve(
                            onSaveSection(draft.id, section.section_key, value),
                          ).catch(() => undefined)
                        }
                      >
                        Save section
                      </Button>
                    )}
                    <Typography
                      variant="caption"
                      color={reasons.length ? "warning.main" : "text.secondary"}
                    >
                      {reasons.length
                        ? `Needs review: ${reasons.join(" · ")}`
                        : section.human_content !== null
                          ? "Human-edited"
                          : "Generated draft"}
                    </Typography>
                    {section.evidence_segment_ids.length > 0 && (
                      <Button
                        size="small"
                        variant="text"
                        aria-label={`Show source span 1 for ${sectionLabels[section.section_key]}`}
                        aria-controls={`scribe-source-segment-${section.evidence_segment_ids[0]}`}
                        onClick={() =>
                          selectEvidence(section.evidence_segment_ids[0])
                        }
                      >
                        {section.evidence_segment_ids.length} source{" "}
                        {section.evidence_segment_ids.length === 1
                          ? "span"
                          : "spans"}
                      </Button>
                    )}
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        </Box>
        <Divider />
        <Alert
          severity="info"
          icon={<FactCheckOutlinedIcon fontSize="inherit" />}
          sx={{ mx: { xs: 2, sm: 3 }, mt: 2 }}
        >
          <strong>Clinical accountability:</strong> Scribe produces a draft from
          the selected encounter and source spans. A clinician or authorized
          reviewer must resolve warnings, approve the exact revision, and
          separately sign the chart note. Edits after approval create a new
          revision; they never silently replace the approved record.
        </Alert>
        <Divider />
        <Stack
          component="section"
          aria-labelledby="scribe-approval-heading"
          spacing={1.5}
          sx={{ px: { xs: 2, sm: 3 }, py: 2 }}
        >
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1.5}
            sx={{
              justifyContent: "space-between",
              alignItems: { xs: "stretch", md: "center" },
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography
                id="scribe-approval-heading"
                component="h2"
                variant="subtitle1"
                sx={{ fontWeight: 700 }}
              >
                Approval and export
              </Typography>
              <Typography
                id="scribe-approval-help"
                variant="body2"
                color="text.secondary"
                role="status"
                aria-live="polite"
              >
                {hasUnsavedEdits
                  ? "Save or discard edits before approval."
                  : reviewSummary.unresolved && blockingReviewCount > 0
                    ? `Resolve ${blockingReviewCount} review ${blockingReviewCount === 1 ? "item" : "items"} before approval.`
                    : reviewSummary.unresolved
                      ? "Complete the required review before approval."
                      : approved
                        ? "This exact revision is approved."
                        : "Review complete. Approval remains a separate action."}
              </Typography>
              <Typography
                id="scribe-export-help"
                variant="caption"
                color="text.secondary"
              >
                Saving to chart writes an unsigned note only after explicit
                confirmation. Signing remains a separate action. After saving,
                open the chart note to check its current signature status.
              </Typography>
              {approved && (
                <Typography variant="caption" color="text.secondary">
                  Approved by {approvingAccount(draft)} ·{" "}
                  {recordTime(draft.approved_at)}
                </Typography>
              )}
            </Box>
            <Stack
              direction={{ xs: "column", lg: "row" }}
              spacing={1}
              sx={{ width: { xs: "100%", md: "auto" }, minWidth: 0 }}
            >
              {hasUnsavedEdits && (
                <Button
                  color="warning"
                  variant="text"
                  disabled={pendingAction !== null}
                  onClick={() =>
                    setEdits({ ...(editContextRef.current?.baseline ?? {}) })
                  }
                >
                  Discard unsaved edits
                </Button>
              )}
              <Button
                variant="contained"
                startIcon={<CheckCircleOutlineOutlinedIcon />}
                disabled={approvalBlocked || approved || pendingAction !== null}
                onClick={() => onApprove?.(draft.id)}
                aria-describedby="scribe-approval-help"
                sx={{ whiteSpace: "nowrap" }}
              >
                {approved ? "Draft approved" : "Approve current draft"}
              </Button>
              <Button
                variant="outlined"
                startIcon={<FileDownloadOutlinedIcon />}
                disabled={exportBlocked || pendingAction !== null}
                onClick={() => onExport?.(draft.id)}
                aria-describedby="scribe-export-help"
                sx={{ whiteSpace: "nowrap" }}
              >
                {reviewSummary.chartWritten
                  ? "Saved to chart"
                  : reviewSummary.exported
                    ? "Export recorded"
                    : exportLabel}
              </Button>
              {reviewSummary.chartWritten &&
                encounter.clinical_encounter_id && (
                  <Button
                    size="small"
                    href={`/clinic/patients/${encounter.patient_id}/encounters/${encounter.clinical_encounter_id}`}
                  >
                    Open chart note
                  </Button>
                )}
            </Stack>
          </Stack>
        </Stack>
      </Paper>
      <ReviewDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        encounter={encounter}
        draft={draft}
        currentDraftId={latestDraft?.id}
        sources={sources}
        selectedSegmentId={selectedSegmentId}
        onEvidenceSelect={selectEvidence}
        onSelectDraft={(id) => {
          if (!hasUnsavedEdits) setSelectedDraftId(id);
        }}
      />
    </Box>
  );
}
