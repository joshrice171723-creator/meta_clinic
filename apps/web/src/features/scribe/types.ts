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
      source_order?: number;
      capture_epoch?: number;
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
  telehealth_visit_id?: number | null;
  telehealth_recording_id?: number | null;
  capture_epoch?: number | null;
  recording_segment_index?: number | null;
  source_order?: number | null;
  source_set_digest?: string | null;
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
  encounter_note_id?: number | null;
  encounter_note_revision_id?: number | null;
  chart_written?: boolean;
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
  approved_by_account_reference?: string | null;
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
  clinical_encounter_id?: number | null;
  lab_selections?: Array<{
    id: number;
    lab_report_version_id: number;
    content_digest: string;
    status: string;
  }>;
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

export type ScribeDocumentationWorkItem = {
  key: string;
  kind: "scribe_draft" | "soap_note";
  state:
    | "inputs_changed"
    | "needs_review"
    | "ready_to_add_to_chart"
    | "unsigned_note";
  patient: {
    id: number;
    display_name: string;
    reference: string;
  };
  site_id: number | null;
  clinical_encounter_id: number;
  scribe_encounter_id: number | null;
  document_id: number | null;
  draft_id: number | null;
  note_id: number | null;
  note_revision_id: number | null;
  unresolved_section_count: number | null;
  updated_at: string;
};

export type ScribeDocumentationWorklist = {
  scope: "recent_completed_visits";
  candidate_limit_per_source: number;
  unsigned_notes_available: boolean;
  truncated: boolean;
  returned_count: number;
  returned_counts: Record<ScribeDocumentationWorkItem["state"], number>;
  items: ScribeDocumentationWorkItem[];
};
