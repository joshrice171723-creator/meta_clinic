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
  effective_content: string;
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
  parent_id: number | null;
  source_id: number;
  status: ScribeDraftStatus;
  template_id: string;
  template_version: string;
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

export type ScribeEncounter = {
  id: number;
  patient_id: number;
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
  template_version: string;
  version: number;
  sources: ScribeSource[];
  drafts: ScribeDraft[];
  events: Array<{
    id: number;
    event_type: string;
    resource_type: string;
    resource_id: number;
    metadata: Record<string, unknown>;
    created_at: string;
  }>;
};
