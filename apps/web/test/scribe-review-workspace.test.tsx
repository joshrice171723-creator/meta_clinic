import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  hasUnsavedDraftEdits,
  reviewStateSummary,
  ScribeReviewWorkspace,
  type ScribeReviewState,
} from "../src/features/scribe/ScribeReviewWorkspace";
import type { ScribeDraft, ScribeSource } from "../src/features/scribe/types";

const draft = {
  id: 18,
  parent_id: null,
  source_id: 11,
  status: "in_review",
  template_id: "soap-v1",
  template_version: "1.0.0",
  provider: "synthetic-local",
  model: "grounded-section-abstainer",
  model_version: "1",
  prompt_digest: "prompt-digest",
  input_digest: "input-digest",
  output_digest: "output-digest",
  warnings: [],
  export_state: "not_exported",
  approved_at: null,
  created_at: "2026-09-03T12:00:00Z",
  version: 2,
  sections: [
    {
      id: 21,
      section_key: "subjective",
      generated_content: "Synthetic subject report.",
      human_content: null,
      effective_content: "Synthetic subject report.",
      status: "accepted",
      warning_codes: [],
      evidence_segment_ids: [101],
      edit_revision: 0,
    },
    {
      id: 22,
      section_key: "objective",
      generated_content: "Synthetic objective observation.",
      human_content: "Reviewer-edited synthetic observation.",
      effective_content: "Reviewer-edited synthetic observation.",
      status: "edited",
      warning_codes: [],
      evidence_segment_ids: [102],
      edit_revision: 1,
    },
    {
      id: 23,
      section_key: "assessment",
      generated_content: null,
      human_content: null,
      effective_content: "",
      status: "needs_review",
      warning_codes: ["abstained"],
      evidence_segment_ids: [],
      edit_revision: 0,
    },
    {
      id: 24,
      section_key: "plan",
      generated_content: "No supported plan content generated.",
      human_content: null,
      effective_content: "No supported plan content generated.",
      status: "accepted",
      warning_codes: [],
      evidence_segment_ids: [103],
      edit_revision: 0,
    },
  ],
  exports: [],
} satisfies ScribeDraft;

const readyState: ScribeReviewState = {
  kind: "ready",
  encounter: {
    id: 7,
    patient_id: 42,
    site_id: null,
    status: "in_review",
    consent_status: "accepted",
    consent_policy_version: "synthetic-policy-v1",
    consent_method: "in_person",
    consented_at: "2026-09-03T11:00:00Z",
    consent_withdrawn_at: null,
    retention_class: "synthetic_short",
    retention_expires_at: null,
    deleted_at: null,
    template_id: "soap-v1",
    template_version: "1.0.0",
    version: 2,
    sources: [
      {
        id: 11,
        source_type: "transcript",
        status: "ready",
        content_digest: "source-digest",
        metadata: { fixture: true },
        content: "Synthetic transcript.",
        segments: [
          {
            id: 101,
            sequence: 1,
            speaker: "patient",
            start_ms: 0,
            end_ms: 1500,
            content: "Synthetic subject report.",
            quality_flags: [],
          },
          {
            id: 102,
            sequence: 2,
            speaker: "clinician",
            start_ms: 1500,
            end_ms: 3000,
            content: "Synthetic objective observation.",
            quality_flags: ["low_confidence"],
          },
          {
            id: 103,
            sequence: 3,
            speaker: "unknown",
            start_ms: 3000,
            end_ms: 4500,
            content: "Synthetic statement with unknown speaker.",
            quality_flags: ["speaker_uncertain"],
          },
        ],
      },
    ],
    drafts: [draft],
    events: [],
  },
};

const readySource = readyState.encounter.sources[0] as ScribeSource;

describe("synthetic AI scribe review workspace", () => {
  it("keeps source, generated, edited, unresolved, approval, and export states explicit", () => {
    const html = renderToStaticMarkup(
      <ScribeReviewWorkspace state={readyState} />,
    );

    expect(html).toContain("Source transcript");
    expect(html).toContain("Generated draft");
    expect(html).toContain("Human-edited version");
    expect(html).toContain("Human-edited");
    expect(html).toContain(
      "Needs review: abstained · Reviewer decision required · Content not recorded",
    );
    expect(html).toContain("Approval and export");
    expect(html).toContain("Approve current draft");
    expect(html).toContain("Request separate export");
    expect(html).toContain("Export control is shown separately");
    expect(html).toContain("does not write an official record");
  });

  it("renders loading, error, empty, and unknown states with recovery or blocking language", () => {
    const render = (state: ScribeReviewState) =>
      renderToStaticMarkup(
        <ScribeReviewWorkspace state={state} onRetry={() => undefined} />,
      );

    expect(render({ kind: "loading" })).toContain('role="status"');
    expect(render({ kind: "loading" })).toContain("Loading scribe review");
    expect(
      render({ kind: "error", message: "Synthetic load failure." }),
    ).toContain('role="alert"');
    expect(
      render({ kind: "error", message: "Synthetic load failure." }),
    ).toContain("Retry loading review");
    expect(render({ kind: "empty" })).toContain("Nothing to review yet");
    expect(render({ kind: "unknown" })).toContain("unknown state");
  });

  it("derives approval readiness conservatively and never treats export as approval", () => {
    expect(reviewStateSummary(draft)).toEqual({
      unresolved: true,
      approved: false,
      exported: false,
    });
    const resolvedDraft: ScribeDraft = {
      ...draft,
      sections: draft.sections.map((section) => ({
        ...section,
        status: "accepted",
        warning_codes: [],
        effective_content: "Resolved synthetic content.",
      })),
    };
    expect(
      reviewStateSummary({ ...resolvedDraft, status: "approved" }, readySource),
    ).toEqual({ unresolved: false, approved: true, exported: false });
    expect(
      reviewStateSummary(
        { ...resolvedDraft, status: "exported", export_state: "exported" },
        readySource,
      ),
    ).toEqual({ unresolved: false, approved: true, exported: true });
    expect(
      reviewStateSummary(
        { ...resolvedDraft, status: "approved" },
        { ...readySource, status: "incomplete" },
      ),
    ).toEqual({ unresolved: true, approved: true, exported: false });
    expect(
      hasUnsavedDraftEdits(draft, {
        objective: "Reviewer-edited synthetic observation.",
      }),
    ).toBe(false);
    expect(
      hasUnsavedDraftEdits(draft, { subjective: "Unsaved reviewer change." }),
    ).toBe(true);
  });

  it("exposes keyboard-reachable evidence controls and live action status", () => {
    const html = renderToStaticMarkup(
      <ScribeReviewWorkspace
        state={readyState}
        onApprove={() => undefined}
        onExport={() => undefined}
        onEvidenceSelect={() => undefined}
      />,
    );

    expect(html).toContain('aria-label="Show source span 1 for Subjective"');
    expect(html).toContain('aria-controls="scribe-source-segment-101"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-describedby="scribe-approval-help"');
    expect(html).toContain('aria-describedby="scribe-export-help"');
    expect(html).toContain("grid-template-columns");
    expect(html).toContain("min-width:0");
  });
});
