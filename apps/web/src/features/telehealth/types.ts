export type TelehealthVisitStatus =
  "scheduled" | "in_progress" | "ending" | "ended" | "cancelled" | "no_show";

export type TelehealthParticipantStatus =
  "eligible" | "waiting" | "admitted" | "left" | "removed";

export type TelehealthRoomStatus =
  | "not_prepared"
  | "pending"
  | "provisioning"
  | "ready"
  | "active"
  | "ending"
  | "ended"
  | "failed"
  | "unknown";

export type TelehealthAccessState =
  | "unavailable"
  | "prepare"
  | "continue_preparation"
  | "waiting"
  | "admitted"
  | "join"
  | "rejoin"
  | "ended";

export type TelehealthAllowedAction =
  | "telehealth.view_preparation"
  | "telehealth.verify_preparation"
  | "telehealth.start_encounter"
  | "telehealth.prepare_room"
  | "telehealth.add_participant"
  | "telehealth.admit"
  | "telehealth.remove"
  | "telehealth.join"
  | "telehealth.leave"
  | "telehealth.end"
  | "telehealth.extend"
  | "telehealth.resume"
  | "telehealth.reconcile"
  | "telehealth.configure"
  | "telehealth.check_connection"
  | "telehealth.disable"
  | "telehealth.request_scribe"
  | "telehealth.scribe_consent"
  | "telehealth.start_scribe_capture"
  | "telehealth.renew_scribe_capture"
  | "telehealth.release_scribe_capture"
  | "telehealth.take_over_scribe_capture"
  | string;

export type TelehealthEnvelope<T> = {
  data: T;
  as_of: string;
  version: number;
  allowed_actions: TelehealthAllowedAction[];
};

export type TelehealthPatientSummary = {
  id: number;
  display_name: string;
};

export type TelehealthAppointmentSummary = {
  id: number;
  starts_at: string;
  ends_at: string;
  timezone: string;
  visit_modality: "video" | "in_person";
  site_id: number | null;
  clinician_membership_id: number | null;
  clinician?: { membership_id: number; display_name: string | null } | null;
  patient: TelehealthPatientSummary;
};

export type TelehealthPolicy = {
  version: number;
  title: string;
  body: string;
  instructions: string | null;
  allow_audio_only: boolean;
  allow_staff_screen_share: boolean;
  scribe_enabled: boolean;
  require_location: boolean;
  require_callback: boolean;
  scribe_consent_title?: string | null;
  scribe_consent_body?: string | null;
};

export type TelehealthDeviceResults = {
  camera: "passed" | "failed" | "not_available" | "not_checked";
  microphone: "passed" | "failed" | "not_available" | "not_checked";
  speaker: "passed" | "failed" | "not_available" | "not_checked";
  browser: "supported" | "unsupported" | "unknown";
  audio_only_requested: boolean;
  checked_at: string;
};

export type TelehealthPreparation = {
  checkin_id?: string | number | null;
  complete: boolean;
  verified: boolean;
  reasons: string[];
  location?: {
    address_line1: string;
    unit?: string | null;
    city: string;
    region_code: string;
    postal_code?: string | null;
    country_code: string;
  } | null;
  callback_phone?: string | null;
  device_results?: TelehealthDeviceResults | null;
};

export type TelehealthParticipant = {
  id: string;
  provider_subject_id: string | null;
  role: "patient" | "clinician" | "care_team" | string;
  status: TelehealthParticipantStatus;
  is_current: boolean;
  display_name?: string | null;
  admitted_at?: string | null;
  media_present: boolean;
};

export type TelehealthWrapUpOutcome =
  "completed" | "technical_failure" | "follow_up_needed";

export type TelehealthFollowUpStatus = "none" | "needed" | "arranged";

export type TelehealthScribeReviewStatus = "not_used" | "reviewed" | "deferred";

export type TelehealthWrapUp = {
  id: number;
  status: "draft" | "finalized";
  outcome: TelehealthWrapUpOutcome | null;
  clinician_notes: string;
  patient_instructions: string;
  instruction_note_revision_id: number | null;
  follow_up_status: TelehealthFollowUpStatus | null;
  follow_up_plan: string;
  follow_up_appointment: TelehealthAppointmentSummary | null;
  scribe_review_status: TelehealthScribeReviewStatus | null;
  scribe_snapshot: {
    encounter_id: number | null;
    encounter_status: string | null;
    draft_id: number | null;
    draft_status: string | null;
    export_id: number | null;
    export_state: string | null;
    encounter_note_id: number | null;
    encounter_note_revision_id: number | null;
  };
  publication_state:
    "draft" | "awaiting_encounter_close" | "release_blocked" | "released";
  finalized_at: string | null;
  finalized_by_membership_id: number | null;
  version: number;
};

export type TelehealthWrapUpOptions = {
  instruction_revisions: {
    id: number;
    patient_instructions: string;
    signed_at: string;
  }[];
  follow_up_appointments: TelehealthAppointmentSummary[];
  blockers: string[];
};

export type PatientTelehealthCompletion = {
  status: "pending" | "ready";
  outcome: TelehealthWrapUpOutcome | null;
  instructions: string | null;
  follow_up_status: TelehealthFollowUpStatus | null;
  follow_up_plan: string | null;
  follow_up_appointment: TelehealthAppointmentSummary | null;
  published_at: string | null;
};

export type TelehealthWrapUpInput = {
  outcome: TelehealthWrapUpOutcome | null;
  clinician_notes: string;
  patient_instructions: string;
  instruction_note_revision_id: number | null;
  follow_up_status: TelehealthFollowUpStatus | null;
  follow_up_plan: string;
  follow_up_appointment_id: number | null;
  scribe_review_status: TelehealthScribeReviewStatus | null;
};

export type TelehealthVisit = {
  public_id: string;
  status: TelehealthVisitStatus;
  access_state?: TelehealthAccessState;
  access_generation: number;
  appointment: TelehealthAppointmentSummary;
  encounter_id: number | null;
  policy: TelehealthPolicy;
  preparation: TelehealthPreparation;
  room: {
    status: TelehealthRoomStatus;
    expires_at?: string | null;
    started_at?: string | null;
    ended_at?: string | null;
  };
  participants: TelehealthParticipant[];
  eligible_staff: {
    membership_id: number;
    display_name: string;
    role: "clinician" | "assistant";
  }[];
  scribe: {
    encounter_id?: number | null;
    consent_state: string;
    capture: {
      owner_participant_id?: string | null;
      epoch: number;
      lease_expires_at?: string | null;
    };
  };
  wrap_up?: TelehealthWrapUp | null;
  wrap_up_options?: TelehealthWrapUpOptions | null;
  completion?: PatientTelehealthCompletion | null;
  practice?: { id: number; name: string; timezone: string };
  clinician?: { membership_id?: number; display_name: string } | null;
  support?: {
    label: string;
    phone?: string | null;
    url?: string | null;
  } | null;
  window?: {
    opens_at: string;
    closes_at: string;
    can_prepare: boolean;
    can_enter: boolean;
  };
  identity?: { display_name: string };
  current_step?:
    | "visit"
    | "device_check"
    | "consent"
    | "waiting_room"
    | "call"
    | "instructions";
  updated_at: string;
};

export type TelehealthQueueRow = {
  public_id: string;
  status: TelehealthVisitStatus;
  appointment: TelehealthAppointmentSummary;
  clinician?: { membership_id?: number; display_name: string } | null;
  site?: { id: number; name: string } | null;
  readiness:
    | "preparation_needed"
    | "consent_needed"
    | "waiting"
    | "admitted"
    | "connected"
    | "disconnected"
    | "ended";
  waiting_since?: string | null;
  connection: "not_connected" | "connected" | "disconnected" | "ended";
  encounter_id?: number | null;
  room: { status: TelehealthRoomStatus; expires_at?: string | null };
  updated_at: string;
  allowed_actions: TelehealthAllowedAction[];
};

export type TelehealthQueueData = {
  visits: TelehealthQueueRow[];
  next_cursor: string | null;
};

export type TelehealthJoinGrant = {
  token: string;
  room_name: string;
  room_url: string | null;
  expires_at: string;
  provider: "twilio" | "daily";
  participant: { id: string; provider_subject_id: string };
  room: { expires_at: string };
};

export type TelehealthMutationData = {
  visit: TelehealthVisit;
  operation?: {
    id: string;
    status: "pending" | "leased" | "succeeded" | "failed" | "unknown";
  };
};

export type TelehealthJoinGrantData = { join_grant: TelehealthJoinGrant };

export type TelehealthSettingsDraft = {
  version: number;
  content_digest?: string;
  consent_title: string;
  consent_body: string;
  locale: string;
  patient_instructions: string;
  support_label: string;
  support_phone?: string | null;
  support_url?: string | null;
  join_early_minutes: number;
  join_late_minutes: number;
  max_room_minutes: number;
  grant_ttl_seconds: number;
  checkin_max_age_minutes: number;
  allow_audio_only: boolean;
  allow_staff_screen_share: boolean;
  scribe_enabled: boolean;
  require_location: boolean;
  require_callback: boolean;
  scribe_consent_title?: string | null;
  scribe_consent_body?: string | null;
};

export type TelehealthVisitTypeRule = {
  visit_type_id: number;
  visit_type_name?: string;
  site_id: number | null;
  enabled: boolean;
  allowed_region_codes: string[];
  min_patient_age_years?: number | null;
  max_patient_age_years?: number | null;
};

export type TelehealthSettingsData = {
  enabled: boolean;
  provider_code: string | null;
  provider_account_ref: string | null;
  health_status: "configured" | "not_configured" | "degraded" | "disabled";
  health_checked_at: string | null;
  last_error_code: string | null;
  draft: TelehealthSettingsDraft;
  active_policy:
    | (TelehealthPolicy & {
        published_at?: string | null;
        published_by?: string | null;
      })
    | null;
  visit_type_rules: TelehealthVisitTypeRule[];
  options?: {
    visit_types: { id: number; name: string }[];
    sites: { id: number; name: string }[];
  };
};

export type TelehealthActor = "staff" | "patient";
export type TelehealthCallState =
  | "idle"
  | "joining"
  | "joined"
  | "reconnecting"
  | "leaving"
  | "ended"
  | "error";

export type TelehealthMediaParticipant = {
  participantId: string;
  providerSubjectId: string | null;
  providerSessionId: string;
  displayName: string | null;
  role: string;
  isLocal: boolean;
  audioTrack: MediaStreamTrack | null;
  videoTrack: MediaStreamTrack | null;
  screenVideoTrack: MediaStreamTrack | null;
  subscribed: boolean;
};
