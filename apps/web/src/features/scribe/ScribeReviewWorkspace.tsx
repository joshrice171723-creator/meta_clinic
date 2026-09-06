import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import EditNoteOutlinedIcon from "@mui/icons-material/EditNoteOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import HourglassEmptyOutlinedIcon from "@mui/icons-material/HourglassEmptyOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  LinearProgress,
  Paper,
  Skeleton,
  Stack,
  TextField,
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
  onAcceptSection?: (
    draftId: number,
    sectionKey: ScribeDraftSection["section_key"],
  ) => void | Promise<void>;
  onRejectSection?: (
    draftId: number,
    sectionKey: ScribeDraftSection["section_key"],
  ) => void | Promise<void>;
  pendingAction?: string | null;
};

const encounterStatusLabels: Record<ScribeEncounter["status"], string> = {
  awaiting_consent: "Awaiting consent",
  consented: "Consent accepted",
  source_ready: "Source ready",
  in_review: "In review",
  approved: "Approved",
  exported: "Exported",
  consent_declined: "Consent declined",
  consent_withdrawn: "Consent withdrawn",
  deleted: "Deleted",
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

function formatSectionLabel(sectionKey: string) {
  return (
    sectionLabels[sectionKey as ScribeDraftSection["section_key"]] ?? sectionKey
  );
}

function formatTime(milliseconds: number) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0)
    return "Time not recorded";
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function statusChipSx(status: "neutral" | "attention" | "success" | "error") {
  if (status === "attention")
    return {
      color: "var(--clinic-warning)",
      backgroundColor: "var(--clinic-warning-background)",
    };
  if (status === "success")
    return {
      color: "var(--clinic-success)",
      backgroundColor: "var(--clinic-success-background)",
    };
  if (status === "error")
    return {
      color: "var(--clinic-error)",
      backgroundColor: "var(--clinic-error-background)",
    };
  return { color: "text.secondary", backgroundColor: "action.hover" };
}

function selectedDraft(encounter: ScribeEncounter) {
  return (
    encounter.drafts.find(
      (draft) => draft.status !== "superseded" && draft.status !== "deleted",
    ) ?? encounter.drafts[0]
  );
}

function sourceForDraft(encounter: ScribeEncounter, draft?: ScribeDraft) {
  return (
    (draft &&
      encounter.sources.find((source) => source.id === draft.source_id)) ??
    encounter.sources[0]
  );
}

export function hasUnsavedDraftEdits(
  draft: ScribeDraft | undefined,
  edits: Record<string, string>,
) {
  if (!draft) return false;
  return draft.sections.some((section) => {
    if (!(section.section_key in edits)) return false;
    return edits[section.section_key] !== (section.human_content ?? "");
  });
}

export function reviewStateSummary(
  draft: ScribeDraft | undefined,
  source?: ScribeSource,
) {
  if (!draft) return { unresolved: true, approved: false, exported: false };
  const sourceUnavailable =
    !source || source.status !== "ready" || source.content === null;
  const unresolved =
    !knownDraftStatuses.has(draft.status) ||
    !currentDraftStatuses.has(draft.status) ||
    sourceUnavailable ||
    draft.sections.length === 0 ||
    draft.sections.some(
      (section) =>
        !section.effective_content.trim() ||
        section.status === "needs_review" ||
        section.status === "rejected" ||
        section.warning_codes.length > 0,
    );
  const approved = draft.status === "approved" || draft.status === "exported";
  const exported =
    draft.status === "exported" ||
    draft.export_state === "exported" ||
    draft.exports.some((exportRecord) => exportRecord.status === "exported");
  return { unresolved, approved, exported };
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

function LoadingState({ message }: { message?: string }) {
  return (
    <Paper component="section" variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack spacing={2} role="status" aria-live="polite">
        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
          <HourglassEmptyOutlinedIcon aria-hidden="true" color="action" />
          <Typography component="h1" variant="h5">
            Loading scribe review
          </Typography>
        </Stack>
        <Typography color="text.secondary">
          {message ?? "Loading the transcript and current draft…"}
        </Typography>
        <Skeleton variant="rounded" height={72} aria-hidden="true" />
        <Skeleton variant="rounded" height={160} aria-hidden="true" />
      </Stack>
    </Paper>
  );
}

function EmptyState({ message }: { message?: string }) {
  return (
    <StatePanel icon={<ArticleOutlinedIcon />} title="Nothing to review yet">
      <Typography>
        {message ??
          "A transcript and draft must be available before review can begin."}
      </Typography>
    </StatePanel>
  );
}

function UnresolvedBadge({ section }: { section: ScribeDraftSection }) {
  const reasons = [
    ...section.warning_codes,
    ...(section.status === "needs_review"
      ? ["Reviewer decision required"]
      : []),
    ...(section.status === "rejected" ? ["Section rejected"] : []),
    ...(!section.effective_content.trim() ? ["Content not recorded"] : []),
  ];
  if (!reasons.length) return null;
  return (
    <Alert
      severity="warning"
      icon={<WarningAmberOutlinedIcon />}
      sx={{ mt: 1.5, py: 0.25, "& .MuiAlert-message": { minWidth: 0 } }}
    >
      <Typography variant="body2">
        Needs review: {reasons.join(" · ")}
      </Typography>
    </Alert>
  );
}

function EvidenceReferences({
  section,
  segments,
  selectedSegmentId,
  onSelect,
}: {
  section: ScribeDraftSection;
  segments: ScribeSourceSegment[];
  selectedSegmentId: number | null;
  onSelect: (segmentId: number) => void;
}) {
  if (!section.evidence_segment_ids.length)
    return (
      <Typography variant="body2" color="text.secondary">
        No source span linked. Treat this content as unresolved until a reviewer
        confirms it.
      </Typography>
    );
  return (
    <Stack
      direction="row"
      spacing={0.75}
      useFlexGap
      sx={{ flexWrap: "wrap", alignItems: "center" }}
    >
      <Typography variant="body2" color="text.secondary" sx={{ mr: 0.25 }}>
        Source spans
      </Typography>
      {section.evidence_segment_ids.map((segmentId) => {
        const segment = segments.find(
          (candidate) => candidate.id === segmentId,
        );
        return segment ? (
          <Button
            key={segmentId}
            size="small"
            variant={selectedSegmentId === segmentId ? "contained" : "outlined"}
            onClick={() => onSelect(segmentId)}
            aria-label={`Show source span ${segment.sequence} for ${formatSectionLabel(section.section_key)}`}
            aria-controls={`scribe-source-segment-${segmentId}`}
            sx={{ minHeight: 36, borderRadius: 1.5 }}
          >
            Span {segment.sequence}
          </Button>
        ) : (
          <Chip
            key={segmentId}
            label={`Span ${segmentId} unavailable`}
            color="warning"
            variant="outlined"
            aria-label={`Source span ${segmentId} unavailable`}
          />
        );
      })}
    </Stack>
  );
}

function DraftSectionCard({
  draftId,
  section,
  segments,
  editValue,
  selectedSegmentId,
  onEdit,
  onEvidenceSelect,
  onSave,
  onAccept,
  onReject,
  pendingAction,
}: {
  draftId: number;
  section: ScribeDraftSection;
  segments: ScribeSourceSegment[];
  editValue: string;
  selectedSegmentId: number | null;
  onEdit: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onEvidenceSelect: (segmentId: number) => void;
  onSave?: (draftId: number, sectionKey: ScribeDraftSection["section_key"], content: string) => void | Promise<void>;
  onAccept?: (draftId: number, sectionKey: ScribeDraftSection["section_key"]) => void | Promise<void>;
  onReject?: (draftId: number, sectionKey: ScribeDraftSection["section_key"]) => void | Promise<void>;
  pendingAction?: string | null;
}) {
  const hasHumanEdit = Boolean(section.human_content) || editValue !== "";
  const hasUnsavedSectionEdit = editValue !== (section.human_content ?? "");
  const sectionUnknown = ![
    "needs_review",
    "accepted",
    "edited",
    "rejected",
  ].includes(section.status);
  return (
    <Paper
      component="article"
      variant="outlined"
      sx={{ p: { xs: 2, sm: 2.5 }, minWidth: 0 }}
    >
      <Stack spacing={1.5}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          sx={{
            justifyContent: "space-between",
            alignItems: { xs: "flex-start", sm: "center" },
          }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <EditNoteOutlinedIcon color="action" aria-hidden="true" />
            <Typography component="h3" variant="h6">
              {formatSectionLabel(section.section_key)}
            </Typography>
          </Stack>
          <Chip
            size="small"
            label={
              sectionUnknown
                ? "Unknown section state"
                : hasHumanEdit
                  ? "Human-edited"
                  : "Generated draft"
            }
            icon={
              sectionUnknown ? (
                <ErrorOutlineOutlinedIcon aria-hidden="true" />
              ) : hasHumanEdit ? (
                <EditNoteOutlinedIcon aria-hidden="true" />
              ) : (
                <AutoAwesomeOutlinedIcon aria-hidden="true" />
              )
            }
            sx={statusChipSx(
              sectionUnknown || section.status === "needs_review"
                ? "attention"
                : "neutral",
            )}
          />
        </Stack>
        <Box>
          <Typography variant="overline" color="text.secondary">
            Generated draft
          </Typography>
          <Typography
            component="p"
            sx={{
              m: 0,
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              color: "text.primary",
              lineHeight: 1.6,
            }}
          >
            {section.generated_content?.trim() ||
              "No generated content recorded."}
          </Typography>
        </Box>
        <TextField
          fullWidth
          multiline
          minRows={3}
          disabled={pendingAction !== null}
          label="Human-edited version"
          value={editValue}
          onChange={onEdit}
          placeholder="Add a reviewer edit only when needed. The generated draft stays visible above."
          helperText={onSave ? "Save creates a new server revision; the generated text remains visible." : "Edits are transient in this isolated slice until a server-authorized save is connected."}
          slotProps={{
            input: {
              "aria-label": `${formatSectionLabel(section.section_key)} human-edited version`,
            },
          }}
        />
        {(onSave || onAccept || onReject) && (
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            {onSave && (
              <Button
                variant="contained"
                disabled={pendingAction !== null || !editValue.trim() || !hasUnsavedSectionEdit}
                onClick={() => void Promise.resolve().then(() => onSave(draftId, section.section_key, editValue)).catch(() => undefined)}
              >
                Save reviewer edit
              </Button>
            )}
            {onAccept && (
              <Button
                variant="outlined"
                disabled={pendingAction !== null || hasUnsavedSectionEdit || section.warning_codes.length > 0 || !section.effective_content.trim()}
                onClick={() => void Promise.resolve().then(() => onAccept(draftId, section.section_key)).catch(() => undefined)}
              >
                Accept section
              </Button>
            )}
            {onReject && (
              <Button
                color="warning"
                variant="outlined"
                disabled={pendingAction !== null || hasUnsavedSectionEdit}
                onClick={() => void Promise.resolve().then(() => onReject(draftId, section.section_key)).catch(() => undefined)}
              >
                Reject section
              </Button>
            )}
          </Stack>
        )}
        <EvidenceReferences
          section={section}
          segments={segments}
          selectedSegmentId={selectedSegmentId}
          onSelect={onEvidenceSelect}
        />
        <UnresolvedBadge section={section} />
      </Stack>
    </Paper>
  );
}

function TranscriptPanel({
  source,
  selectedSegmentId,
  onSelect,
}: {
  source?: ScribeSource;
  selectedSegmentId: number | null;
  onSelect: (segmentId: number) => void;
}) {
  if (!source)
    return (
      <StatePanel icon={<ArticleOutlinedIcon />} title="Transcript unavailable">
        <Typography>
          No source artifact is linked to the current draft. Review and approval
          remain blocked.
        </Typography>
      </StatePanel>
    );
  if (source.status === "deleted" || source.content === null)
    return (
      <StatePanel
        icon={<WarningAmberOutlinedIcon />}
        title="Transcript content unavailable"
        tone="warning"
      >
        <Typography>
          The source artifact is not available for review. Do not infer content
          from the draft.
        </Typography>
      </StatePanel>
    );
  const sourceUnknown = ![
    "ready",
    "incomplete",
    "pending_deletion",
    "deleted",
  ].includes(source.status);
  return (
    <Paper
      component="section"
      variant="outlined"
      sx={{ p: { xs: 2, sm: 2.5 }, minWidth: 0 }}
      aria-labelledby="scribe-transcript-heading"
    >
      <Stack spacing={2}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "flex-start", justifyContent: "space-between" }}
        >
          <Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <ArticleOutlinedIcon color="primary" aria-hidden="true" />
              <Typography
                id="scribe-transcript-heading"
                component="h2"
                variant="h5"
              >
                Source transcript
              </Typography>
            </Stack>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 0.75 }}
            >
              Original imported text and timestamped evidence. This is not
              generated content.
            </Typography>
          </Box>
          <Chip
            size="small"
            label={
              sourceUnknown
                ? "Unknown source state"
                : source.status === "ready"
                  ? "Ready"
                  : "Needs review"
            }
            sx={statusChipSx(
              sourceUnknown || source.status !== "ready"
                ? "attention"
                : "neutral",
            )}
          />
        </Stack>
        {sourceUnknown && (
          <Alert severity="warning" icon={<ErrorOutlineOutlinedIcon />}>
            The source returned an unknown state. Evidence linking is not
            considered complete.
          </Alert>
        )}
        {source.status === "incomplete" && (
          <Alert severity="warning" icon={<WarningAmberOutlinedIcon />}>
            This transcript is incomplete. Missing intervals must be resolved
            before approval.
          </Alert>
        )}
        {source.status === "pending_deletion" && (
          <Alert severity="warning" icon={<WarningAmberOutlinedIcon />}>
            This source is pending deletion and is not safe to treat as
            available evidence.
          </Alert>
        )}
        <Box
          component="ol"
          aria-label="Transcript source spans"
          sx={{ m: 0, pl: { xs: 2.5, sm: 3 }, display: "grid", gap: 1.25 }}
        >
          {source.segments.length ? (
            source.segments.map((segment) => (
              <Box
                component="li"
                id={`scribe-source-segment-${segment.id}`}
                key={segment.id}
                sx={{
                  pl: 1,
                  scrollMarginTop: 16,
                  ...(selectedSegmentId === segment.id
                    ? {
                        backgroundColor: "action.selected",
                        outline: "2px solid",
                        outlineColor: "primary.main",
                        outlineOffset: 3,
                      }
                    : {}),
                }}
              >
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={{ xs: 0.5, sm: 1.5 }}
                >
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ minWidth: 124, fontVariantNumeric: "tabular-nums" }}
                  >
                    {speakerLabels[segment.speaker]} ·{" "}
                    {formatTime(segment.start_ms)}
                  </Typography>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ overflowWrap: "anywhere" }}>
                      {segment.content?.trim() ||
                        "Transcript text unavailable."}
                    </Typography>
                    {segment.quality_flags.length > 0 && (
                      <Stack
                        direction="row"
                        spacing={0.75}
                        useFlexGap
                        sx={{ mt: 0.75, flexWrap: "wrap" }}
                      >
                        {segment.quality_flags.map((flag) => (
                          <Chip
                            key={flag}
                            size="small"
                            variant="outlined"
                            label={`Quality flag: ${flag}`}
                          />
                        ))}
                      </Stack>
                    )}
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => onSelect(segment.id)}
                      aria-label={`Focus transcript span ${segment.sequence}`}
                      sx={{ mt: 0.5, minHeight: 36, px: 0.5 }}
                    >
                      Focus evidence
                    </Button>
                  </Box>
                </Stack>
              </Box>
            ))
          ) : (
            <Typography component="li" color="text.secondary">
              No transcript spans are available.
            </Typography>
          )}
        </Box>
      </Stack>
    </Paper>
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
  onAcceptSection,
  onRejectSection,
  pendingAction = null,
}: ScribeReviewWorkspaceProps) {
  const [selectedSegmentId, setSelectedSegmentId] = useState<number | null>(
    null,
  );
  const [edits, setEdits] = useState<Record<string, string>>({});

  const encounter = state.kind === "ready" ? state.encounter : undefined;
  const draft = useMemo(
    () => (encounter ? selectedDraft(encounter) : undefined),
    [encounter],
  );
  const source = useMemo(
    () => (encounter ? sourceForDraft(encounter, draft) : undefined),
    [encounter, draft],
  );
  const reviewSummary = reviewStateSummary(draft, source);
  const hasUnsavedEdits = hasUnsavedDraftEdits(draft, edits);
  const staleDraft = Boolean(
    draft && ["superseded", "deleted"].includes(draft.status),
  );

  useEffect(() => {
    setSelectedSegmentId(null);
    setEdits(
      draft
        ? Object.fromEntries(
            draft.sections
              .filter((section) => section.human_content !== null)
              .map((section) => [
                section.section_key,
                section.human_content ?? "",
              ]),
          )
        : {},
    );
  }, [draft?.id, draft?.version]);

  useEffect(() => {
    if (!hasUnsavedEdits || typeof window === "undefined") return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [hasUnsavedEdits]);

  if (state.kind === "loading") return <LoadingState message={state.message} />;
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
            sx={{ alignSelf: "flex-start" }}
          >
            Retry loading review
          </Button>
        )}
      </Stack>
    );
  if (state.kind === "empty") return <EmptyState message={state.message} />;
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
  if (!encounter)
    return <EmptyState message="The review encounter is unavailable." />;

  const encounterUnknown = !encounterStatusLabels[encounter.status];
  const approved = reviewSummary.approved;
  const approvalBlocked =
    reviewSummary.unresolved ||
    encounterUnknown ||
    hasUnsavedEdits ||
    !onApprove;
  const exportBlocked =
    !approved ||
    reviewSummary.unresolved ||
    reviewSummary.exported ||
    hasUnsavedEdits ||
    !onExport;
  const actionStatus = hasUnsavedEdits
    ? "Unsaved reviewer edits are not part of the server revision. Save or discard them before requesting approval or export."
    : staleDraft
      ? "This draft revision is no longer current. Reload the current draft before reviewing or exporting."
      : reviewSummary.unresolved &&
          (!source || source.status !== "ready" || source.content === null)
        ? "The source transcript is unavailable or not ready. Approval and export are blocked until reviewable evidence is available."
        : reviewSummary.exported
          ? "Export recorded for this approved revision."
          : approved
            ? "Approved revision is eligible for a separate export request."
            : reviewSummary.unresolved
              ? "Resolve every warning and section before requesting approval."
              : "Review complete. Approval is still a separate explicit action.";

  return (
    <Box
      component="main"
      aria-labelledby="scribe-review-heading"
      sx={{
        maxWidth: 1440,
        mx: "auto",
        p: { xs: 2, sm: 3, lg: 4 },
        minWidth: 0,
      }}
    >
      <Stack spacing={{ xs: 2, lg: 3 }}>
        <Paper
          component="header"
          variant="outlined"
          sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}
        >
          <Stack spacing={2}>
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
              sx={{
                justifyContent: "space-between",
                alignItems: { xs: "flex-start", md: "center" },
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ mb: 0.75, alignItems: "center" }}
                >
                  <AutoAwesomeOutlinedIcon color="primary" aria-hidden="true" />
                  <Typography
                    id="scribe-review-heading"
                    component="h1"
                    variant="h4"
                    sx={{ overflowWrap: "anywhere" }}
                  >
                    Documentation review
                  </Typography>
                </Stack>
                <Typography color="text.secondary">
                  Compare source evidence with a human-reviewed documentation
                  draft before any export request.
                </Typography>
              </Box>
              <Chip
                label={
                  encounterUnknown
                    ? "Unknown encounter state"
                    : encounterStatusLabels[encounter.status]
                }
                icon={
                  encounterUnknown ? (
                    <ErrorOutlineOutlinedIcon aria-hidden="true" />
                  ) : undefined
                }
                sx={statusChipSx(
                  encounterUnknown
                    ? "attention"
                    : approved
                      ? "success"
                      : "neutral",
                )}
              />
            </Stack>
            <Divider />
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={{ xs: 0.75, sm: 2 }}
              useFlexGap
              sx={{ flexWrap: "wrap" }}
            >
              <Typography variant="body2" color="text.secondary">
                Encounter reference {encounter.id}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Revision {draft?.version ?? "not available"}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Consent {encounter.consent_status}
              </Typography>
            </Stack>
            <Alert severity="info" icon={<ArticleOutlinedIcon />}>
              Source text, generated draft text, human edits, and approved
              content remain separate states. This workspace does not write an
              official record.
            </Alert>
          </Stack>
        </Paper>

        {encounterUnknown && (
          <Alert
            severity="warning"
            icon={<ErrorOutlineOutlinedIcon />}
            role="alert"
          >
            The encounter returned an unknown state. Review actions are blocked
            until the server contract is understood.
          </Alert>
        )}

        {!draft ? (
          <EmptyState message="A transcript may be present, but no draft version is available for review." />
        ) : (
          <>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "minmax(0, 1fr)",
                  lg: "minmax(0, 0.9fr) minmax(0, 1.1fr)",
                },
                gap: { xs: 2, lg: 3 },
                alignItems: "start",
                minWidth: 0,
              }}
            >
              <TranscriptPanel
                source={source}
                selectedSegmentId={selectedSegmentId}
                onSelect={(segmentId) => {
                  setSelectedSegmentId(segmentId);
                  onEvidenceSelect?.(segmentId);
                }}
              />
              <Paper
                component="section"
                variant="outlined"
                sx={{ p: { xs: 2, sm: 2.5 }, minWidth: 0 }}
                aria-labelledby="scribe-draft-heading"
              >
                <Stack spacing={2}>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1}
                    sx={{
                      justifyContent: "space-between",
                      alignItems: { xs: "flex-start", sm: "center" },
                    }}
                  >
                    <Box>
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: "center" }}
                      >
                        <EditNoteOutlinedIcon
                          color="primary"
                          aria-hidden="true"
                        />
                        <Typography
                          id="scribe-draft-heading"
                          component="h2"
                          variant="h5"
                        >
                          Current draft
                        </Typography>
                      </Stack>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 0.75 }}
                      >
                        Generated sections stay visible beside reviewer edits
                        and evidence links.
                      </Typography>
                    </Box>
                    <Chip
                      size="small"
                      label={
                        knownDraftStatuses.has(draft.status)
                          ? draft.status.replace("_", " ")
                          : "Unknown draft state"
                      }
                      sx={statusChipSx(
                        !knownDraftStatuses.has(draft.status) ||
                          reviewSummary.unresolved
                          ? "attention"
                          : approved
                            ? "success"
                            : "neutral",
                      )}
                    />
                  </Stack>
                  <Box sx={{ display: "grid", gap: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Template {draft.template_id} v{draft.template_version} ·
                      Model provenance {draft.provider} / {draft.model}{" "}
                      {draft.model_version}
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ overflowWrap: "anywhere" }}
                    >
                      Input digest {draft.input_digest}
                    </Typography>
                  </Box>
                  {draft.warnings.length > 0 && (
                    <Alert
                      severity="warning"
                      icon={<WarningAmberOutlinedIcon />}
                    >
                      Draft warnings require reviewer attention:{" "}
                      {draft.warnings.join(" · ")}
                    </Alert>
                  )}
                  <Stack spacing={1.5}>
                    {draft.sections.length ? (
                      draft.sections.map((section) => (
                        <DraftSectionCard
                          key={section.id}
                          draftId={draft.id}
                          section={section}
                          segments={source?.segments ?? []}
                          editValue={edits[section.section_key] ?? ""}
                          selectedSegmentId={selectedSegmentId}
                          onEdit={(event) => {
                            const content = event.target.value;
                            setEdits((current) => ({
                              ...current,
                              [section.section_key]: content,
                            }));
                            onSectionChange?.(section.section_key, content);
                          }}
                          onEvidenceSelect={(segmentId) => {
                            setSelectedSegmentId(segmentId);
                            onEvidenceSelect?.(segmentId);
                          }}
                          onSave={onSaveSection}
                          onAccept={onAcceptSection}
                          onReject={onRejectSection}
                          pendingAction={pendingAction}
                        />
                      ))
                    ) : (
                      <EmptyState message="This draft has no sections. Approval is blocked." />
                    )}
                  </Stack>
                </Stack>
              </Paper>
            </Box>

            <Paper
              component="section"
              variant="outlined"
              sx={{ p: { xs: 2, sm: 2.5 }, minWidth: 0 }}
              aria-labelledby="scribe-approval-heading"
            >
              <Stack spacing={2}>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: "center" }}
                >
                  <CheckCircleOutlineOutlinedIcon
                    color={approved ? "success" : "action"}
                    aria-hidden="true"
                  />
                  <Typography
                    id="scribe-approval-heading"
                    component="h2"
                    variant="h5"
                  >
                    Approval and export
                  </Typography>
                </Stack>
                <Typography color="text.secondary">
                  Approval marks this exact draft revision as reviewer-approved.
                  Export is a separate request to the parent-record adapter.
                </Typography>
                {hasUnsavedEdits && (
                  <Alert severity="warning" icon={<WarningAmberOutlinedIcon />}>
                    Unsaved reviewer edits are visible only in this review
                    session. Save them through the server-authorized integration
                    or discard them before leaving; approval and export remain
                    blocked.
                  </Alert>
                )}
                <Box
                  role="status"
                  aria-live="polite"
                  sx={{ color: "text.secondary" }}
                >
                  {actionStatus}
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={
                    reviewSummary.exported
                      ? 100
                      : approved
                        ? 75
                        : reviewSummary.unresolved
                          ? 25
                          : 50
                  }
                  aria-label="Review lifecycle progress"
                  sx={{ height: 6, borderRadius: 1 }}
                />
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1.5}
                  sx={{ alignItems: { xs: "stretch", sm: "center" } }}
                >
                  <Button
                    variant="contained"
                    startIcon={<CheckCircleOutlineOutlinedIcon />}
                    disabled={approvalBlocked || approved || pendingAction !== null}
                    onClick={() => draft && onApprove?.(draft.id)}
                    aria-describedby="scribe-approval-help"
                  >
                    {approved ? "Draft approved" : "Approve current draft"}
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<FileDownloadOutlinedIcon />}
                    disabled={exportBlocked || pendingAction !== null}
                    onClick={() => draft && onExport?.(draft.id)}
                    aria-describedby="scribe-export-help"
                  >
                    {reviewSummary.exported
                      ? "Export recorded"
                      : "Request separate export"}
                  </Button>
                </Stack>
                <Stack spacing={0.5}>
                  <Typography
                    id="scribe-approval-help"
                    variant="body2"
                    color="text.secondary"
                  >
                    {hasUnsavedEdits
                      ? "Approval remains blocked while reviewer edits are unsaved."
                      : onApprove
                        ? "Approval remains blocked while any section, source, or draft revision is unresolved."
                        : "Approval control is shown for the eventual integration; no save handler is connected in this isolated slice."}
                  </Typography>
                  <Typography
                    id="scribe-export-help"
                    variant="body2"
                    color="text.secondary"
                  >
                    {hasUnsavedEdits
                      ? "Export remains blocked until reviewer edits are saved or discarded; it never exports local-only text."
                      : onExport
                        ? "Export is enabled only for an approved current revision with reviewable source evidence and is never implied by approval."
                        : "Export control is shown separately; no export handler is connected in this isolated slice."}
                  </Typography>
                </Stack>
              </Stack>
            </Paper>
          </>
        )}
      </Stack>
    </Box>
  );
}
