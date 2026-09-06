export type ScribeEncounterStatus =
  | "awaiting_consent"
  | "consented"
  | "source_ready"
  | "in_review"
  | "approved"
  | "exported"
  | "consent_declined"
  | "consent_withdrawn"
  | "deleted";

export type ScribeSourceStatus =
  "ready" | "incomplete" | "pending_deletion" | "deleted";

export type ScribeDraftStatus =
  "draft" | "in_review" | "approved" | "superseded" | "exported" | "deleted";

export type ScribeSectionStatus =
  "needs_review" | "accepted" | "edited" | "rejected";

export type ScribeExportStatus = "exported" | "failed";

export type ScribeInputSource =
  | {
      kind: "transcript";
      source_id: number;
      digest: string;
    }
  | {
      kind: "reviewer_authored_context";
      authored_by_id: number;
      digest: string;
    };

export type ScribeSourceSegment = {
  id: number;
  sequence: number;
  speaker: "patient" | "clinician" | "caregiver" | "unknown";
  start_ms: number;
  end_ms: number;
  content: string | null;
  quality_flags: string[];
};

export type ScribeSource = {
  id: number;
  source_type: "transcript";
  status: ScribeSourceStatus;
  content_digest: string;
  metadata: Record<string, unknown>;
  content: string | null;
  segments: ScribeSourceSegment[];
};

export type ScribeDraftSection = {
  id: number;
  section_key: "subjective" | "objective" | "assessment" | "plan";
  generated_content: string | null;
  human_content: string | null;
  effective_content: string | null;
  status: ScribeSectionStatus;
  warning_codes: string[];
  evidence_segment_ids: number[];
  edit_revision: number;
};

export type ScribeExport = {
  id: number;
  destination: "parent_record_adapter";
  version_checksum: string;
  status: ScribeExportStatus;
  payload_digest: string;
  exported_at: string | null;
};

export type ScribeDraft = {
  id: number;
  document_id?: number;
  revision_number?: number;
  current?: boolean;
  stale?: boolean;
  input_sources?: ScribeInputSource[];
  parent_id: number | null;
  source_id: number | null;
  status: ScribeDraftStatus;
  template_id: string;
  template_version: number;
  provider: string;
  model: string;
  model_version: string;
  prompt_digest: string;
  input_digest: string;
  output_digest: string;
  warnings: string[];
  export_state: string;
  approved_at: string | null;
  created_at: string | null;
  version: number;
  sections: ScribeDraftSection[];
  exports: ScribeExport[];
};

export type ScribeDocument = {
  id: number;
  template_id: string;
  template_version: number;
  status: string;
  current_draft_id: number | null;
  version: number;
  current_revision: ScribeDraft | null;
};

export type ScribeTemplate = {
  id: string;
  version: number;
  label: string;
  note_kind: string;
  status: "active" | "disabled";
  disabled_reason: string | null;
  sections: Record<ScribeDraftSection["section_key"], string>;
};

export type ScribeEncounter = {
  id: number;
  patient_id: number;
  patient?: {
    id: number;
    reference: string;
    display_name: string;
  };
  site_id: number | null;
  status: ScribeEncounterStatus;
  consent_status: "not_recorded" | "accepted" | "declined" | "withdrawn";
  consent_policy_version: string | null;
  consent_method: string | null;
  consented_at: string | null;
  consent_withdrawn_at: string | null;
  retention_class: string;
  retention_expires_at: string | null;
  deleted_at: string | null;
  template_id: string;
  template_version: number;
  created_at?: string | null;
  updated_at?: string | null;
  context_content?: string | null;
  version: number;
  sources: ScribeSource[];
  drafts: ScribeDraft[];
  documents?: ScribeDocument[];
  events: Array<{
    id: number;
    event_type: string;
    resource_type: string;
    resource_id: number;
    metadata: Record<string, unknown>;
    created_at: string;
  }>;
};
