// Browser-facing response types only. Business rules live in apps/api.
export type Decimal = string;
export type AppearancePreference = {
  palette: "astra" | "owner" | "juniper" | "cobalt" | "plum" | "saffron";
  mode: "system" | "light" | "dark";
};
export type UserSettings = {
  user_id: number;
  appearance: AppearancePreference & { version: number };
  development_access?: {
    profile: string;
    options: {
      id: string;
      label: string;
      description: string;
    }[];
  };
};
export type User = {
  id: number;
  email_address: string;
  admin: boolean;
  development_demo?: boolean;
  development_account_id?: string | null;
};
export type RuntimeEnvironment =
  "development" | "test" | "production" | "unknown";
export type DevelopmentAccount = {
  id: string;
  label: string;
  account_type: "employee" | "patient" | "omni";
  destination: string;
  organization?: { id: number; name: string } | null;
  clinic?: { id: number; name: string };
  locations?: { id: number; name: string; code: string }[];
};
export type PatientPortalContext = {
  schema_version: "patient-portal-context-v1";
  development_only: boolean;
  practice: { id: number; name: string; timezone: string };
  patient: { id: number; display_name: string; reference: string };
  balances: {
    currency: string;
    invoiced_amount: Decimal;
    balance_amount: Decimal;
    allocated_amount: Decimal;
    credited_amount: Decimal;
    refunded_amount: Decimal;
  }[];
  billing: {
    invoices: {
      id: number;
      currency: string;
      status: string;
      created_at: string;
      total_amount: Decimal;
      allocated_amount: Decimal;
      credit_amount: Decimal;
      balance_amount: Decimal;
      online_payment: InvoiceOnlinePayment;
      lines: {
        id: number;
        description: string;
        quantity: Decimal;
        posted_amount: Decimal;
      }[];
      allocations: {
        id: number;
        payment_event_id: number;
        amount: Decimal;
        created_at: string;
      }[];
      credits: { id: number; amount: Decimal; created_at: string }[];
    }[];
    payments: {
      id: number;
      currency: string;
      amount: Decimal;
      allocated_amount: Decimal;
      unapplied_amount: Decimal;
      created_at: string;
      cash_payment: boolean;
      receipt_available: boolean;
      allocations: {
        id: number;
        invoice_id: number;
        amount: Decimal;
        created_at: string;
      }[];
      refunds: {
        id: number;
        amount: Decimal;
        reason: string;
        created_at: string;
      }[];
    }[];
    pagination: {
      invoices: { next_cursor: number | null };
      payments: { next_cursor: number | null };
    };
  };
  capabilities: {
    billing_read: boolean;
    payment_collection: boolean;
    password_change: boolean;
  };
  notices: string[];
  development_preview?: {
    selected_patient_id: number;
    patients: { id: number; display_name: string; reference: string }[];
  };
};
export type PatientPortalBillingHistoryPage = {
  schema_version: "patient-portal-billing-history-v1";
  patient_id: number;
  kind: "invoices" | "payments";
  items:
    | PatientPortalContext["billing"]["invoices"]
    | PatientPortalContext["billing"]["payments"];
  next_cursor: number | null;
};
export type PatientBillingSupportRequest = {
  id: number;
  status: "pending" | "in_review" | "resolved" | "declined";
  requested_at: string;
  reviewed_at: string | null;
};
export type ClinicBillingSupportRequest = PatientBillingSupportRequest & {
  content: string;
  review_note: string | null;
  patient: Pick<Patient, "id" | "display_name" | "reference">;
};
export type PatientReminder = {
  id: number;
  patient_id: number;
  patient: Pick<Patient, "id" | "display_name" | "reference">;
  category: string;
  channel: string;
  safe_preview: string;
  content?: string;
  scheduled_at: string;
  timezone: string;
  local_schedule_label: string;
  status: string;
  priority: string;
  expires_at: string | null;
  created_at: string;
  appointment?: {
    id: number;
    starts_at: string;
    ends_at: string;
    status: string;
    site_id: number | null;
  };
  endpoint: { type: string; label: string; masked_value: string };
  action_types: string[];
  staff_handoff: {
    eligible: boolean;
    source_type: "action" | "delivery" | null;
    source_id: number | null;
    reason_code: string | null;
    request: {
      id: number;
      state: string;
      assignee_membership_id: number | null;
      due_at: string | null;
    } | null;
  };
  delivery_attempts?: {
    attempt_number: number;
    status: string;
    failure_class: string | null;
    retryable: boolean;
    provider: string;
    masked_destination: string;
    queued_at: string | null;
    accepted_at: string | null;
    completed_at: string | null;
  }[];
};
export type ReminderPreference = {
  channel: string;
  setting: string;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string;
  locale: string;
  version: number;
};
export type Paperwork = {
  id: number;
  title: string;
  document_version: string;
  demo: boolean;
  signing_available: boolean;
  status: string;
  started_at: string | null;
  signed_at: string | null;
  body?: string;
  content_digest?: string;
  signature_name?: string;
  signature_digest?: string;
  consent_version?: string;
};
export type Material = {
  id: number;
  title: string;
  summary: string;
  status: string;
  sample: boolean;
  body?: string;
};
export type Item = {
  id: number;
  name: string;
  sku: string;
  quantity: number;
  reorder_level: number;
};
export type PatientActivityHistory = {
  coverage: {
    source:
      | "registration"
      | "appointments"
      | "notes"
      | "encounters"
      | "invoices"
      | "payments"
      | "subscriptions"
      | "reminders";
    label: string;
    status: "included" | "not_authorized" | "not_included";
  }[];
  has_more: boolean;
  entries: {
    id: number;
    source:
      | "registration"
      | "appointments"
      | "notes"
      | "encounters"
      | "invoices"
      | "payments"
      | "subscriptions"
      | "reminders";
    section: string;
    record_type: string;
    record_id: number;
    event: string;
    actor_reference: string | null;
    occurred_at: string | null;
    changed_fields: string[];
  }[];
};

export type Patient = {
  id: number;
  updated_at?: string;
  display_name: string;
  reference: string;
  date_of_birth?: string | null;
  phone_hint?: string | null;
  primary_address_version_id?: number | null;
  primary_address?: { id: number; version: number; formatted: string } | null;
  demographics?: {
    legal_name: string | null;
    preferred_name: string | null;
    date_of_birth: string | null;
    date_of_birth_status?: "known" | "unknown";
    sex: string;
    primary_language: string;
    interpreter_required: boolean | null;
  } | null;
  contacts?: {
    id: number;
    contact_type: string;
    contact_value: string;
    preferred: boolean;
    effective_from: string;
    effective_until: string | null;
  }[];
  emergency_contacts?: {
    id: number;
    name: string;
    relationship: string;
    phone: string;
    permission_to_contact: boolean;
    effective_from: string;
    effective_until: string | null;
  }[];
  communication_preference?: {
    preferred_contact_method: string;
    appointment_reminders_consent: boolean;
    general_communications_consent: boolean;
  } | null;
  social_histories?: {
    id: number;
    tobacco_use: string | null;
    alcohol_use: string | null;
    exercise_habits: string | null;
    diet: string | null;
    occupation: string | null;
    living_situation: string | null;
    relevant_social_factors: string | null;
    effective_from: string;
    effective_until: string | null;
  }[];
  vital_signs?: {
    id: number;
    code: string;
    numeric_value: string;
    unit_code: string;
    observed_at: string;
  }[];
};
export type PatientCareSummaryState =
  "known" | "none_reported" | "not_recorded" | "none_active" | "not_applicable";
export type PatientCareSummaryReviewState =
  | "not_reviewed"
  | "current_list_confirmed"
  | "none_reported"
  | "follow_up_needed"
  | "unable_to_obtain";
export type PatientCareSummary = {
  schema_version: "patient-care-summary-v1";
  patient_id: number;
  encounter_id: number | null;
  as_of: string;
  allergies: {
    state: PatientCareSummaryState;
    active_count: number;
    items: {
      id: number;
      allergen: string;
      reaction: string | null;
      category: string | null;
      criticality: string | null;
      severity: string | null;
      clinical_status: string;
      verification_status: string;
      onset_at: string | null;
      recorded_at: string | null;
      last_reviewed_at: string | null;
      lock_version: number;
    }[];
  };
  medications: {
    state: PatientCareSummaryState;
    active_count: number;
    items: {
      id: number;
      medication: string;
      dose: string | null;
      route: string | null;
      frequency: string | null;
      purpose: string | null;
      status: string;
      information_source: string | null;
      effective_from: string | null;
      effective_until: string | null;
      asserted_at: string | null;
      recorded_at: string | null;
      last_reconciled_at: string | null;
      lock_version: number;
    }[];
  };
  communication: {
    state: PatientCareSummaryState;
    primary_language: string | null;
    interpreter_required: boolean | null;
    needs: PatientCareNeedSummary[];
  };
  care_needs: {
    state: PatientCareSummaryState;
    active_count: number;
    items: PatientCareNeedSummary[];
  };
  current_care_conditions: {
    state: PatientCareSummaryState;
    active_count: number;
    items: {
      id: number;
      condition: string;
      clinical_status: string;
      verification_status: string;
      instruction: string | null;
      onset_at: string | null;
      recorded_at: string | null;
      last_reviewed_at: string | null;
      lock_version: number;
    }[];
  };
  precautions: {
    state: PatientCareSummaryState;
    active_count: number;
    items: {
      id: number;
      type: string;
      evidence_status: string;
      status: string;
      instructions: string | null;
      recorded_at: string | null;
      last_reassessed_at: string | null;
      lock_version: number;
    }[];
  };
  reviews: Record<
    "allergies" | "medications" | "care_needs",
    {
      id?: number;
      state: PatientCareSummaryReviewState;
      information_source?: string | null;
      reviewed_at?: string | null;
    }
  >;
  review_needed: boolean | null;
  review_needed_topics: string[] | null;
};
export type EncounterIntakeRevision = {
  questionnaire?: {
    answers: import("../features/patientPortal/IntakeQuestions").IntakeAnswers;
    text: string;
    status: "draft" | "submitted";
    form_id?: string;
    questionnaire_version?: number;
    confirmed_chunks?: number[];
    recorder?: "patient" | "staff";
    staff_confirmation?: boolean;
    evidence_references?: Array<{
      key: string;
      kind: string;
      id: number;
      version: string | number | null;
    }>;
    items?: Record<
      string,
      {
        source: string;
        recorded_at: string;
        recorded_by_membership_id: number;
        confirmation: string;
        confirmed_at: string | null;
        supersedes_revision_id: number | null;
      }
    >;
  } | null;
  questionnaire_text?: string | null;
  id: number;
  patient_id: number;
  encounter_id: number;
  version: number;
  status: "incomplete" | "ready_for_handoff" | "unable_to_complete";
  identity_state: "confirmed" | "not_confirmed" | "unable_to_confirm";
  visit_reason_state:
    "confirmed" | "needs_correction" | "not_recorded" | "unable_to_obtain";
  history_state:
    "reviewed" | "incomplete" | "not_recorded" | "unable_to_obtain";
  vitals_state:
    | "recorded"
    | "incomplete"
    | "not_recorded"
    | "declined"
    | "unable_to_obtain"
    | "not_applicable";
  observation_ids: number[];
  history_review_ids: number[];
  recorded_at: string;
  recorded_by_membership_id: number;
};
export type EncounterHandoff = {
  id: number;
  patient_id: number;
  encounter_id: number;
  intake_revision_id: number;
  state:
    | "pending"
    | "accepted"
    | "rejected"
    | "correction_requested"
    | "completed"
    | "cancelled";
  requested_by_membership_id: number;
  accepted_by_membership_id: number | null;
  requested_at: string;
  responded_at: string | null;
  version: number;
};
export type ClinicalTask = {
  id: number;
  patient_id: number;
  encounter_id: number | null;
  site_id: number | null;
  task_kind:
    | "intake"
    | "handoff"
    | "result_follow_up"
    | "patient_call"
    | "order_execution"
    | "record_request"
    | "staff_request";
  state:
    "open" | "claimed" | "in_progress" | "on_hold" | "completed" | "cancelled";
  pool_code: "clinical" | "front_desk" | "records";
  assigned_to_membership_id: number | null;
  due_at: string | null;
  source_type: string;
  source_kind?: "medication_request" | "service_request" | null;
  pending_assignee_membership_id?: number | null;
  dependency_ids?: number[];
  waiting_on_task_ids?: number[];
  waiting_reason?: string | null;
  assignment_exception?: string | null;
  owner_unavailable?: boolean;
  source_managed?: boolean;
  has_recorded_appointment?: boolean;
  history?: Array<{
    id: number;
    action: string;
    actor_membership_id: number;
    task_version: number;
    recorded_at: string;
    snapshot: Record<string, unknown>;
  }>;
  source_id: number | null;
  resolution_code: string | null;
  version: number;
  updated_at: string;
};
export type NurseWorkspace = {
  evidence_options?: IntakeEvidenceOption[];
  review_items?: IntakeReviewItem[];
  questionnaire_form?: {
    id: string;
    version: number;
    fields: import("../features/patientPortal/IntakeQuestions").IntakeField[];
    answer_states: string[];
    provenance: string[];
    medication_options: string[];
    medication_references?: Array<{ id: string; name: string }>;
    chunks: Array<{
      index: number;
      id: string;
      label: string;
      description: string;
      fields: string[];
    }>;
  };
  schema_version: "nurse-workspace-v1";
  patient_id: number;
  encounter_id: number;
  intake: EncounterIntakeRevision | null;
  intake_comparison?: {
    source: {
      kind: "previous_encounter" | "earlier_revision";
      encounter_id: number;
      version: number;
      recorded_at: string;
    } | null;
    items: Array<{
      id: string;
      label: string;
      previous: string | null;
      current: string | null;
      changed: boolean;
    }>;
  };
  handoff: EncounterHandoff | null;
  tasks: ClinicalTask[];
  capabilities: {
    intake_write: boolean;
    handoff_request: boolean;
    handoff_respond: boolean;
    tasks_write: boolean;
    observations_write: boolean;
  };
};
export type IntakeEvidenceOption = {
  key: string;
  kind: string;
  id: number;
  version: string | number | null;
  label: string;
  source: string;
  recorded_at: string;
  collected_at?: string | null;
  status: string;
  href?: string;
  results?: Array<{
    name: string;
    value: string;
    unit?: string;
    reference_range?: string;
  }>;
};
export type IntakeReviewItem = {
  question_id: string;
  label: string;
  category: string;
  task_id: number;
  state: string;
  pool_code: string | null;
  assigned_to_membership_id: number | null;
  reason: string;
  next_action: string;
  source_revision_version: number;
  recorded_at: string;
  resolution_code: string | null;
};
export type ClinicalRevisionBase = {
  completion_reconciliation_required?: boolean;
  id: number;
  patient_id: number;
  encounter_id: number;
  site_id: number;
  series_id: string;
  version_number: number;
  prior_revision_id: number | null;
  status: string;
  allowed_statuses: string[];
  recorded_by_membership_id: number;
  recorded_at: string;
};
export type MedicationRequestRevision = ClinicalRevisionBase & {
  fulfillment_route?:
    "outside_pharmacy" | "take_home" | "administration" | null;
  medication_strength?: string | null;
  medication_form?: string | null;
  medication_code_system?: string | null;
  medication_code?: string | null;
  medication_code_version?: string | null;
  catalog_source?: string | null;
  pharmacy_name?: string | null;
  pharmacy_location?: string | null;
  pharmacy_identifier?: string | null;
  prescribed_quantity?: string | null;
  quantity_unit?: string | null;
  refills?: number | null;
  starts_on?: string | null;
  duration_text?: string | null;
  intent: "proposal" | "plan" | "order";
  transmission_state:
    | "not_requested"
    | "pending"
    | "accepted"
    | "rejected"
    | "failed"
    | "unknown";
  medication_name: string;
  inventory_product_id: number | null;
  requester_membership_id: number | null;
  dose_value: string | null;
  dose_unit_code: string | null;
  dose_text: string | null;
  route_code: string | null;
  route_text: string | null;
  frequency_text: string | null;
  quantity_text: string | null;
  scheduled_for: string | null;
  reason_text: string | null;
  instructions: string | null;
  source_medication_statement_id: number | null;
  completion_exception: string | null;
};
export type ServiceRequestRevision = ClinicalRevisionBase & {
  request_kind:
    "lab" | "imaging" | "procedure" | "referral" | "therapy" | "other";
  intent: "proposal" | "plan" | "order";
  priority: "routine" | "urgent" | "asap" | "stat";
  requested_code_system: string | null;
  requested_code: string | null;
  requested_display: string;
  destination: string | null;
  reason_text: string | null;
  due_at: string | null;
  completion_exception: string | null;
};
export type EncounterDiagnosisRevision = ClinicalRevisionBase & {
  classification: "primary" | "secondary" | "differential" | "historical";
  code_system: string | null;
  diagnosis_code: string | null;
  diagnosis_display: string;
  clinical_note: string | null;
};
export type ProcedureRevision = ClinicalRevisionBase & {
  code_system: string | null;
  procedure_code: string | null;
  procedure_display: string;
  performed_at: string | null;
  outcome_text: string | null;
  complication_state:
    "not_assessed" | "none_reported" | "known" | "unknown" | "unable_to_obtain";
  complication_text: string | null;
  service_request_revision_id: number | null;
};
export type CarePlanRevision = ClinicalRevisionBase & {
  title: string;
  description: string | null;
  starts_on: string | null;
  ends_on: string | null;
};
export type CareGoalRevision = ClinicalRevisionBase & {
  care_plan_revision_id: number;
  description: string;
  outcome_text: string | null;
  target_on: string | null;
};
export type ImmunizationRevision = ClinicalRevisionBase & {
  vaccine_name: string;
  cvx_code: string | null;
  manufacturer: string | null;
  manufacturer_mvx_code: string | null;
  lot_number: string | null;
  lot_expiration_date: string | null;
  dose_text: string | null;
  route_text: string | null;
  administration_site_text: string | null;
  administered_at: string | null;
  occurrence_source:
    "administered_here" | "patient_reported" | "external_record" | "registry";
  refusal_reason: string | null;
  source_document_id: number | null;
  medication_administration_id: number | null;
  vis_edition_date: string | null;
  vis_given_date: string | null;
  vaccinator_membership_id: number | null;
  vaccinator_label: string | null;
  administering_site_id: number | null;
  administering_site_label: string | null;
};
export type AssessmentRevision = ClinicalRevisionBase & {
  category: ClinicAssessmentCode;
  instrument_name: string;
  instrument_version: string | null;
  score_value: string | null;
  interpretation: string | null;
  response_summary: string | null;
  follow_up_plan: string | null;
  assessed_at: string | null;
};
export type ClinicalPlanLink = {
  id: number;
  source_kind: "medication_request" | "service_request";
  source_revision_id: number;
  target_kind:
    | "medication_statement"
    | "medication_administration"
    | "lab_report"
    | "procedure"
    | "document";
  target_id: number;
  outcome_summary: string | null;
  recorded_by_membership_id: number;
  recorded_at: string;
};
export type ReferralExchangeEvent = {
  id: number;
  service_request_revision_id: number;
  service_request_series_id: string;
  direction: "outbound" | "inbound";
  stage:
    "prepared" | "sent" | "received" | "acknowledged" | "closed" | "cancelled";
  organization_name: string | null;
  note: string | null;
  document_id: number | null;
  recorded_by_membership_id: number;
  recorded_at: string;
};
export type ClinicalPlanLinkTarget = { id: number; label: string };
export type MedicationAdministrationLinkTarget = ClinicalPlanLinkTarget & {
  status: "completed";
  movement_count: number;
  lot_numbers: string[];
  lot_number: string;
  lot_expiration_date: string;
  administered_at: string;
  dose_text: string;
  route_text: string;
  administration_site_text: string | null;
  vaccinator_membership_id: number;
  vaccinator_label: string;
  administering_site_id: number;
  administering_site_label: string;
};
export type ClinicalPlanWorkspace = {
  prior_orders?: {
    kind: string;
    id: number;
    revision: number;
    encounter_id: number;
    recorded_at: string;
    status: string;
    label: string;
  }[];
  new_work?: Record<string, boolean>;
  weight_context?:
    | {
        note_id: number;
        revision: number;
        form_id: string;
        appointment_id: number;
        recorded_at: string;
        source: string;
        goals: string | null;
        weight: string | null;
        progress: string | null;
      }[]
    | null;
  schema_version: "clinical-plan-workspace-v2";
  patient_id: number;
  encounter_id: number;
  records: {
    medication_requests: MedicationRequestRevision[];
    service_requests: ServiceRequestRevision[];
    diagnoses: EncounterDiagnosisRevision[];
    procedures: ProcedureRevision[];
    care_plans: CarePlanRevision[];
    care_goals: CareGoalRevision[];
    immunizations: ImmunizationRevision[];
    assessments: AssessmentRevision[];
  };
  truncated: Record<
    | "medication_requests"
    | "service_requests"
    | "diagnoses"
    | "procedures"
    | "care_plans"
    | "care_goals"
    | "immunizations"
    | "assessments",
    boolean
  >;
  capabilities: Record<
    | "medication_requests"
    | "service_requests"
    | "diagnoses"
    | "procedures"
    | "care_plans"
    | "care_goals"
    | "immunizations"
    | "assessments",
    boolean
  >;
  medication_products: {
    id: number;
    name: string;
    generic_name: string | null;
    ndc: string | null;
    dosage_form: string | null;
    route: string | null;
    stock_unit: string;
  }[];
  medication_order_options: {
    dose_units: { code: string; label: string }[];
    routes: { code: string; label: string }[];
  };
  assessment_scope: ClinicAssessmentCode[];
  links: ClinicalPlanLink[];
  referral_events: ReferralExchangeEvent[];
  available_link_targets: {
    medication_statement: ClinicalPlanLinkTarget[];
    medication_administration: MedicationAdministrationLinkTarget[];
    lab_report: ClinicalPlanLinkTarget[];
    procedure: ClinicalPlanLinkTarget[];
    document: ClinicalPlanLinkTarget[];
  };
};
export type PatientCareNeedSummary = {
  id: number;
  category: string;
  code: string;
  description: string;
  instructions: string | null;
  status: string;
  effective_from: string | null;
  effective_until: string | null;
  recorded_at: string | null;
  last_reviewed_at: string | null;
  lock_version: number;
};
export type Pagination = {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
};
export type PatientRefillRequest = {
  id: number;
  status: "pending" | "in_review" | "resolved" | "declined";
  requested_at: string;
  reviewed_at: string | null;
  medication_name: string | null;
  pharmacy_destination: string | null;
  request_note: string | null;
  source: "patient" | "staff" | null;
  decision: "approved" | "changed" | "declined" | null;
  patient_message: string | null;
  source_encounter_id: number | null;
  medication_request_revision_id: number | null;
  response_delivery_state:
    "pending" | "delivered" | "failed" | "retry_pending" | null;
  response_delivery_failure_code: "portal_identity_unavailable" | null;
  reviewed_by: { display_name: string } | null;
};
export type ClinicRefillRequest = PatientRefillRequest & {
  reconciliation_acknowledged: boolean;
  reconciliation_note: string | null;
  patient: Pick<Patient, "id" | "display_name" | "reference">;
};

export type ClinicCapabilities = {
  telehealth_read?: boolean;
  telehealth_prepare_read?: boolean;
  telehealth_prepare_verify?: boolean;
  telehealth_host?: boolean;
  telehealth_participate?: boolean;
  telehealth_configure?: boolean;
  telehealth_reconcile?: boolean;
  workforce_self?: boolean;
  workforce_admin?: boolean;
  workforce_settings?: boolean;
  workforce_badges?: boolean;
  workforce_timecards_read?: boolean;
  workforce_timecards_review?: boolean;
  workforce_timecards_approve?: boolean;
  workforce_schedule_read?: boolean;
  workforce_schedule_manage?: boolean;
  workforce_schedule_publish?: boolean;
  workforce_requests_review?: boolean;
  workforce_payroll_configure?: boolean;
  workforce_payroll_export?: boolean;
  facilities_read?: boolean;
  facilities_write?: boolean;
  clinic_setup_write?: boolean;
  patient_identity_read?: boolean;
  patient_portal_invite?: boolean;
  appointments_read?: boolean;
  appointments_book?: boolean;
  appointments_status_transition?: boolean;
  staff_write?: boolean;
  billing_read?: boolean;
  billing_write?: boolean;
  billing_catalog_manage?: boolean;
  subscription_catalog_read?: boolean;
  subscription_catalog_publish?: boolean;
  subscriptions_review?: boolean;
  billing_invoice_draft?: boolean;
  billing_invoice_post?: boolean;
  billing_payment_record?: boolean;
  billing_cash_reconcile?: boolean;
  patients: boolean;
  patients_write: boolean;
  staff: boolean;
  inventory: boolean;
  appointments: boolean;
  encounters: boolean;
  encounters_assign_provider?: boolean;
  notes_read: boolean;
  notes_write: boolean;
  notes_sign?: boolean;
  observations_write?: boolean;
  clinical_records_read?: boolean;
  medication_requests_write?: boolean;
  documents: boolean;
  messages: boolean;
  staff_messaging_read?: boolean;
  staff_messaging_send?: boolean;
  staff_messaging_create_conversation?: boolean;
  staff_messaging_acknowledge?: boolean;
  staff_messaging_transition?: boolean;
  staff_messaging_escalate?: boolean;
  reminders?: boolean;
  reminders_write?: boolean;
  scribe_read?: boolean;
  scribe_write?: boolean;
  scribe_approve?: boolean;
  scribe_export?: boolean;
  scribe_delete?: boolean;
  billing: boolean;
  roles: boolean;
};
export type ClinicInvoice = {
  id: number;
  patient_id: number;
  currency: string;
  status: string;
  rounding_policy_version: string;
  created_at: string;
  lines?: {
    quantity: Decimal;
    unit_amount: Decimal;
    description_snapshot: string;
  }[];
  total_amount?: Decimal;
  allocated_amount?: Decimal;
  credit_amount?: Decimal;
  balance_amount?: Decimal;
};
export type BillingCurrencyMetrics = {
  currency: string;
  monthly_invoiced: Decimal;
  monthly_collected: Decimal;
  collected: Decimal;
  outstanding: Decimal;
  open_invoice_count: number;
};
export type BillingInvoiceSummary = {
  id: number;
  status: "draft" | "posted" | "void";
  currency: string;
  total: Decimal;
  allocated: Decimal;
  balance: Decimal;
  created_at: string;
  online_payment?: InvoiceOnlinePayment;
};
export type BillingInvoiceDetail = {
  id: number;
  patient_id: number;
  encounter_id: number | null;
  currency: string;
  status: "draft" | "posted" | "void";
  rounding_policy_version: string;
  created_at: string;
  lines: {
    id: number;
    quantity: Decimal;
    unit_amount: Decimal;
    posted_amount: Decimal;
    description: string;
  }[];
  allocated_amount: Decimal;
  credit_amount: Decimal;
  adjustment_limits: {
    credit_available_amount: Decimal;
    void_eligible: boolean;
  };
  void_reason?: string | null;
  voided_at?: string | null;
  voided_by?: string | null;
  online_payment: InvoiceOnlinePayment;
};
export type InvoiceOnlinePayment = {
  state:
    | "available"
    | "processing"
    | "needs_reconciliation"
    | "paid"
    | "unavailable";
  eligible: boolean;
  can_cancel: boolean;
  amount: Decimal;
  currency: string;
  checkout_url?: string;
  reason:
    | "membership_managed"
    | "invoice_not_posted"
    | "no_balance"
    | "unsupported_currency"
    | "stripe_unavailable"
    | "checkout_active"
    | "provider_reconciliation_required"
    | null;
};
export type BillingPatientLedger = {
  schema_version: "clinic-patient-ledger-v1";
  patient: Pick<Patient, "id" | "display_name" | "reference">;
  currencies: {
    currency: string;
    invoiced_amount: Decimal;
    allocated_amount: Decimal;
    credited_amount: Decimal;
    balance_amount: Decimal;
    refunded_amount: Decimal;
  }[];
  invoices: {
    id: number;
    currency: string;
    status: "draft" | "posted" | "void";
    created_at: string;
    updated_at: string;
    total_amount: Decimal;
    allocated_amount: Decimal;
    credit_amount: Decimal;
    balance_amount: Decimal;
    online_payment: InvoiceOnlinePayment;
    adjustment_limits: {
      credit_available_amount: Decimal;
      void_eligible: boolean;
    };
    void_reason?: string | null;
    voided_at?: string | null;
    voided_by?: string | null;
    lines: {
      id: number;
      description: string;
      quantity: Decimal;
      unit_amount: Decimal;
      posted_amount: Decimal;
      billing_service_id: number | null;
    }[];
    allocations: {
      id: number;
      payment_event_id: number;
      amount: Decimal;
      created_at: string;
    }[];
    credits: {
      id: number;
      amount: Decimal;
      created_at: string;
      reason?: string | null;
      issued_at?: string | null;
      issued_by?: string | null;
    }[];
  }[];
  payments: {
    id: number;
    currency: string;
    amount: Decimal;
    allocated_amount: Decimal;
    unapplied_amount: Decimal;
    created_at: string;
    cash_payment: boolean;
    cash_refund_available: boolean;
    cash_refund_unavailable_reason:
      | "not_cash_payment"
      | "cash_drawer_closed"
      | "payment_fully_refunded"
      | null;
    receipt_available: boolean;
    allocations: {
      id: number;
      invoice_id: number;
      amount: Decimal;
      created_at: string;
    }[];
    refunds: {
      id: number;
      amount: Decimal;
      reason: string;
      created_at: string;
    }[];
  }[];
};
export type BillingCollectionStatus =
  | "requested"
  | "processing"
  | "paid"
  | "failed"
  | "needs_reconciliation"
  | "canceled";
export type BillingCollectionNextAction =
  | "continue_checkout"
  | "refresh_status"
  | "review_receipt"
  | "review_failure"
  | "reconcile"
  | "review_balance";
export type BillingCollectionWorklistItem = {
  id: number;
  invoice_id: number;
  status: BillingCollectionStatus;
  next_action: BillingCollectionNextAction;
  processor: string;
  mode: "test" | "live";
  amount: Decimal;
  currency: string;
  requested_at: string;
  updated_at: string;
  invoice_status: string;
  patient: {
    id: number;
    display_name: string;
    reference: string | null;
  } | null;
};
export type BillingDashboard = {
  schema_version: "clinic-billing-v1";
  practice: { id: number; name: string; timezone: string };
  period: { start: string; end: string };
  metrics: {
    invoice_count: number;
    posted_count: number;
    draft_count: number;
    void_count: number;
    currencies: BillingCurrencyMetrics[];
  };
  recent_invoices: BillingInvoiceSummary[];
  recent_payments: {
    invoice_id: number;
    currency: string;
    amount: Decimal;
    created_at: string;
  }[];
  unbilled_encounters: {
    available: boolean;
    total: number | null;
    items: {
      encounter_id: number;
      patient: { id: number; display_name: string; reference: string };
      site: { id: number; code: string; name: string } | null;
      started_at: string;
      ended_at: string;
      previous_void_invoice_id: number | null;
    }[];
  };
  pending_online_payments: {
    invoice_id: number;
    state: "processing" | "needs_reconciliation";
  }[];
  collection_worklist: {
    limit: number;
    total_count: number;
    items: BillingCollectionWorklistItem[];
  };
};
export type CashDrawer = {
  id: number;
  site_id: number;
  status: "open" | "closed";
  opening_float: Decimal;
  cash_received: Decimal;
  cash_refunded: Decimal;
  expected_cash: Decimal;
  counted_cash: Decimal | null;
  discrepancy: Decimal | null;
  discrepancy_explanation: string | null;
  opened_at: string;
  closed_at: string | null;
  reconciliation_status: "pending" | "reconciled";
  reconciled_by_id: number | null;
  reconciled_at: string | null;
  reconciliation_note: string | null;
};
export type CashPaymentResult = {
  payment_allocation: {
    id: number;
    amount: Decimal;
    payment_event_id: number;
  };
  cash_tender: {
    id: number;
    tendered_amount: Decimal;
    change_amount: Decimal;
    cash_drawer_session_id: number;
  };
};
export type ClinicSite = {
  id: number;
  code: string;
  name?: string;
  status?: "draft" | "active" | "temporarily_closed" | "retired";
  timezone_override: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  phone?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  operating_hours?: SiteOperatingHour[];
  hour_exceptions?: SiteHourException[];
};
export type SiteOperatingHour = {
  id: number;
  day_of_week: number;
  closed: boolean;
  open_time: string | null;
  close_time: string | null;
};
export type SiteHourException = {
  id: number;
  date: string;
  closed: boolean;
  open_time: string | null;
  close_time: string | null;
  reason: string | null;
};
export type ClinicWorkspaceContext = {
  schema_version: "clinic-context-v1";
  user_id: number;
  practice: { id: number; name: string; timezone: string };
  practices?: {
    id: number;
    name: string;
    organization: { id: number; name: string } | null;
  }[];
  membership_id: number;
  authorization_generation: number;
  current_clinician_profile_id: string | null;
  credentials: string[];
  policy_version: "clinic-authorization-v1";
  features?: PracticeFeatures;
  capabilities: ClinicCapabilities;
  current_site: ClinicSite | null;
  sites: ClinicSite[];
};
export type PracticeFeatures = {
  finalized?: boolean;
  finalized_at?: string | null;
  selected_services?: ClinicServiceCode[];
  starter_profile?: {
    id?: string;
    version?: number;
    components?: string[];
    visits?: Record<
      string,
      { name: string; form_id: string; visit_type_id: number }
    >;
  };
  change_handoff?: string;
  core: Record<string, true>;
  optional: {
    insurance_workflows: boolean;
    clinic_type: ClinicType | null;
    service_scope: ClinicServiceCode[];
    assessment_scope: ClinicAssessmentCode[];
  };
  insurance_workflows_enabled: boolean;
  clinic_type: ClinicType | null;
  service_scope: ClinicServiceCode[];
  assessment_scope: ClinicAssessmentCode[];
  assessment_configured: boolean;
  configured: boolean;
  recommended_clinic_type: ClinicType;
  recommended_service_scope: ClinicServiceCode[];
  recommended_assessment_scope: ClinicAssessmentCode[];
  revision: number;
  effective_from: string | null;
};
export type ClinicType =
  | "weight_loss"
  | "primary_care"
  | "membership_primary_care"
  | "urgent_care"
  | "specialty_outpatient"
  | "behavioral_health"
  | "custom_ambulatory";
export type ClinicServiceCode =
  | "prescription_preparation"
  | "take_home_fulfillment"
  | "telehealth"
  | "external_lab_coordination"
  | "minor_office_procedures"
  | "in_office_medications"
  | "vaccinations"
  | "point_of_care_testing"
  | "infusions"
  | "controlled_medications"
  | "patient_supplied_medications";
export type ClinicAssessmentCode =
  | "depression"
  | "anxiety"
  | "alcohol_use"
  | "tobacco_use"
  | "social_needs"
  | "fall_risk"
  | "functional_status"
  | "cognitive_status";
export type TelehealthSummary = {
  public_id: string;
  status: string;
  access_state: string;
  prepare_href: string;
  clinic_href: string | null;
  allowed_actions: string[];
};
export type Appointment = {
  id: number;
  patient_id: number;
  site_id: number | null;
  room_id: number | null;
  booked_clinician_id: number | null;
  visit_type_id: number | null;
  reason?: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  encounter_id: number | null;
  needs_setup?: boolean;
  readiness?: "ready" | "needs_setup";
  setup_missing?: ("site" | "clinician" | "visit_type")[];
  visit_modality?: "in_person" | "video";
  telehealth?: TelehealthSummary | null;
  patient?: Pick<Patient, "id" | "display_name" | "reference"> & {
    phone?: string | null;
  };
};
export type FacilitySite = ClinicSite;
export type FacilityRoom = { id: number; site_id: number; code: string };
export type CalendarSlot = {
  starts_at: string;
  ends_at: string;
  clinician_id: number;
  room_ids: number[];
};
export type CalendarAppointment = Appointment & {
  clinician_name: string | null;
  room_name: string | null;
  visit_type_name: string | null;
  calendar_status: string;
  conflict: boolean;
};
export type CalendarDay = {
  date: string;
  scheduled: number;
  confirmed: number;
  available: number | null;
  conflicts: number;
  slots: CalendarSlot[];
  appointments: CalendarAppointment[];
};
export type CalendarResponse = {
  month: string;
  /** Server time at which this calendar projection was generated. */
  as_of?: string;
  timezone: string;
  site_id: number;
  slot_minutes: number;
  capacity_configured: boolean;
  policy?: {
    recurrence: "not_configured" | "configured";
    overbook: "not_configured" | "configured";
    external_sync: "read_only_export" | "configured";
  };
  days: CalendarDay[];
  clinicians: { id: number; name: string }[];
  rooms: { id: number; name: string }[];
};
export type VisitType = { id: number; code: string; retired_at: string | null };
export type Clinician = {
  id: number;
  membership_id: number;
  reference: string | null;
  assignments?: {
    id: number;
    department_id: number | null;
    site_id: number | null;
    effective_from: string;
    effective_until: string | null;
  }[];
  credentials?: {
    id: number;
    credential_type: string;
    jurisdiction: string;
    review_status: string;
    valid_until: string | null;
  }[];
};
export type Encounter = {
  telehealth?: TelehealthSummary | null;
  id: number;
  patient_id: number;
  appointment_id: number | null;
  site_id: string | null;
  room_id: number | null;
  started_at: string;
  ended_at: string | null;
  status: "open" | "completed";
};
export type EncounterDetail = Encounter & {
  visit_modality?: "in_person" | "video";
  participants: {
    id: string;
    membership_id: string;
    participation_role: string;
    effective_from: string;
    effective_until: string | null;
  }[];
  note_ids: number[];
  notes: EncounterNoteSummary[];
  observation_count: number;
  document_count: number;
};
export type EncounterCompletionTaskSnapshot = {
  id: number;
  version: number;
  task_kind: ClinicalTask["task_kind"];
  state: "open" | "claimed" | "in_progress";
  pool_code: ClinicalTask["pool_code"];
  assigned_to_membership_id: number | null;
  due_at: string | null;
};
export type EncounterCompletionReview = {
  id: number;
  patient_id: number;
  encounter_id: number;
  disposition_code:
    | "completed_as_planned"
    | "left_before_completion"
    | "transferred_to_higher_level_of_care"
    | "emergency_services"
    | "other";
  instructions_status: "provided" | "not_required" | "unable_to_complete";
  education_status: "recorded" | "not_required" | "unable_to_complete";
  follow_up_id: number;
  follow_up_version: number;
  follow_up_state: "not_required" | "needed" | "arranged" | "completed";
  instruction_note_revision_id: number | null;
  education_event_ids: number[];
  open_work_snapshot: EncounterCompletionTaskSnapshot[];
  exception_note: string | null;
  recorded_by_membership_id: number;
  recorded_at: string;
};
export type EncounterCompletionEvidence = {
  follow_up: {
    id: number;
    status: "not_required" | "needed" | "arranged" | "completed";
    recorded_status: "not_required" | "needed" | "arranged" | "completed";
    version: number;
    due_at: string | null;
    assigned_to_membership_id: number | null;
  } | null;
  signed_instruction: {
    note_id: number;
    revision_id: number;
    revision_no: number;
    signed_at: string | null;
  } | null;
  education_events: {
    id: number;
    topic_title: string;
    teach_back_status: string;
    follow_up_needed: boolean;
    recorded_at: string;
  }[];
  open_tasks: EncounterCompletionTaskSnapshot[];
  checkout: {
    status: "pending_completion" | "queued" | "in_progress";
    invoice_id: number | null;
  };
};
export type EncounterCompletionResponse = {
  schema_version: "encounter-completion-v1";
  patient_id: number;
  encounter_id: number;
  completion_review: EncounterCompletionReview | null;
  evidence: EncounterCompletionEvidence;
  options: {
    disposition_codes: EncounterCompletionReview["disposition_code"][];
    instructions_statuses: EncounterCompletionReview["instructions_status"][];
    education_statuses: EncounterCompletionReview["education_status"][];
  };
  can_complete: boolean;
};
export type SoapNoteSections = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
};
export type SoapNoteBody = {
  schema: "soap-note-v1";
  note_kind: "soap";
  template_id: string;
  template_version: number;
  sections: SoapNoteSections;
  patient_instructions?: string | null;
  correction?: {
    corrected_revision_id: number;
    reason: string;
    source: string;
  };
};
export type EncounterNoteSummary = {
  id: number;
  patient_id: number;
  encounter_id: number;
  note_kind: string;
  version: number;
  latest_revision: number | null;
  signed: boolean;
  has_signed_history?: boolean;
  current_revision_signed?: boolean;
  current_revision_id?: number | null;
  current_template_id?: string | null;
  current_template_version?: number | null;
};
export type EncounterNote = EncounterNoteSummary & {
  current_revision: {
    id: number;
    revision_no: number;
    author_membership_id: number;
    payload_version: number;
    created_at: string;
    signed: boolean;
    body?: SoapNoteBody;
    content_digest?: string;
  } | null;
  revisions: {
    id: number;
    revision_no: number;
    prior_revision_id: number | null;
    author_membership_id: number;
    payload_version: number;
    created_at: string;
    signed: boolean;
    body?: SoapNoteBody;
    content_digest?: string;
  }[];
  signatures?: {
    id: number;
    revision_id: number;
    signer_membership_id: number;
    content_digest: string;
    attestation_version: string;
    signed_at: string;
  }[];
};
export type ClinicTrackingBoardVisit = {
  id: number;
  row_type: "appointment" | "encounter";
  operational_state:
    "upcoming" | "on_time" | "late" | "waiting_room" | "unrecorded";
  patient_id: number;
  encounter_id: number | null;
  chart_status: "unopened" | "draft" | "signed" | "unavailable";
  provider_assignment_available: boolean;
  intake_ownership?: {
    participant_id: string;
    token: string;
    owner: { membership_id: string; display_name: string };
    lease_expires_at: string | null;
    state: "claimed" | "stale";
    claim_available: boolean;
    release_available: boolean;
  } | null;
  intake_claim_available?: boolean;
  nurse_workflow?: {
    stage: "waiting" | "intake" | "ready" | "clinician";
    intake_status: "not_recorded" | EncounterIntakeRevision["status"];
    handoff_state: "not_recorded" | EncounterHandoff["state"];
    open_task_count: number;
  } | null;
  exceptions?: {
    code: "missing_checkout" | "stale_intake_ownership";
    message: string;
  }[];
  patient: Pick<Patient, "id" | "display_name" | "reference"> & {
    demographics?: { age: number | null; sex: string };
    membership?: "member" | "nonmember" | "not_verified";
  };
  vitals?: {
    blood_pressure?: {
      systolic: string | null;
      diastolic: string | null;
      unit?: string | null;
    };
    heart_rate?: { value: string | null; unit?: string | null };
    weight?: { value: string | null; unit?: string | null };
  } | null;
  provider?: {
    clinician_profile_id: string;
    display_name: string;
    token: string | null;
  } | null;
  encounter: {
    id: number;
    status: "open" | "completed";
    started_at: string;
    ended_at: string | null;
    site_id: string | null;
    site_code: string | null;
    room_id: number | null;
    room_code: string | null;
  } | null;
  appointment: {
    id: number;
    status: string;
    starts_at: string;
    ends_at: string;
    visit_type_code: string | null;
    reason?: string | null;
    site_id: string | null;
    site_code: string | null;
    room_id: number | null;
    room_code: string | null;
  } | null;
  care_summary: PatientCareSummary | null;
  /** @deprecated The live board ignores scenario data and derives only persisted operations state. */
  synthetic_scenario?: {
    stage:
      "waiting" | "intake" | "ready" | "clinician" | "checkout" | "unrecorded";
    reason: string;
  };
};
export type ClinicTrackingBoard = {
  schema_version: "tracking-board-v2";
  as_of: string;
  truncated: boolean;
  visits: ClinicTrackingBoardVisit[];
  eligible_providers: {
    clinician_profile_id: string;
    display_name: string;
    site_ids: string[];
  }[];
};
export type PreviousSignedSoapResponse = {
  schema_version: "previous-signed-soap-v1";
  patient_id: number;
  excluded_encounter_id: number | null;
  chart: {
    encounter_id: number;
    note_id: number;
    signed_at: string;
    encounter_started_at: string;
  } | null;
};
export type NoteTemplate = {
  id: string;
  version: number;
  label: string;
  note_kind: "soap";
  source_label: string;
  source_url: string;
  caution: string;
  sections: SoapNoteSections;
};
export type Observation = {
  id: number;
  display_label?: string | null;
  unit_label?: string | null;
  patient_id: number;
  encounter_id: number | null;
  parent_observation_id: number | null;
  author_membership_id: number;
  code: string;
  code_system: string;
  code_version: string;
  value_kind: "numeric" | "text" | "coded" | "missing" | "group";
  numeric_value: string | null;
  text_value: string | null;
  coded_value: string | null;
  unit_code: string | null;
  missing_reason: string | null;
  observed_at: string;
  recorded_at: string;
};
export type StaffMember = {
  id: number;
  display_name: string;
  job_title: string;
  active: boolean;
};
export type ClinicOverview = {
  practice: { id: number; name: string; timezone: string };
  capabilities: {
    patients_access: boolean;
    inventory_access: boolean;
    staff_access: boolean;
  };
  inventory_actions: Record<
    | "catalog"
    | "receive"
    | "adjust"
    | "hold"
    | "release"
    | "count"
    | "configure",
    boolean
  >;
  development_demo: boolean;
  patient_count: number | null;
  active_staff_count: number | null;
  low_stock: Item[] | null;
};
export type Product = {
  id: number;
  name: string;
  sku: string;
  ndc: string | null;
  product_ndc: string | null;
  generic_name: string | null;
  ingredients: string | null;
  dosage_form: string | null;
  route: string | null;
  labeler: string | null;
  package_description: string | null;
  source: string;
  imported_at: string | null;
  reorder_point: number;
  active: boolean;
  stock_unit: string;
  quantity_scale: number;
  package_size: Decimal;
  unit_reference: string | null;
  available_quantity: Decimal;
  on_hand_quantity: Decimal;
  low_stock: boolean;
  locations: string[];
  next_expiry: string | null;
};
export type StockEvent = {
  id: number;
  actor_id: number;
  created_at: string;
  reason: string;
  kind: string;
  quantity: Decimal | null;
};
export type BatchSummary = {
  id: number;
  product_id: number;
  product_name: string;
  stock_unit: string;
  lot_number: string;
  location: string;
  expires_on: string;
  quantity: Decimal;
  available: boolean;
  status: string;
  expiring: boolean;
};
export type Catalog = {
  product_count: number;
  active_count: number;
  low_count: number;
  query: string;
  filter: string;
  page: number;
  filtered_count: number;
  unit_totals: { unit: string; available: Decimal; unavailable: Decimal }[];
  products: Product[];
  low_stock: Product[];
  attention: BatchSummary[];
  movements: (StockEvent & {
    product_id: number;
    product_name: string;
    lot_number: string;
    location: string;
    stock_unit: string;
  })[];
  profile: { version: number; status: string } | null;
};
export type Batch = BatchSummary & {
  holds: { id: number; kind: string; reason: string }[];
  counts: {
    id: number;
    expected_quantity: Decimal;
    observed_quantity: Decimal;
    reason: string;
    approved_by: number | null;
  }[];
  receipts: {
    id: number;
    received_at: string;
    input_quantity: Decimal;
    input_unit: string;
    conversion_factor: Decimal;
    quantity: Decimal;
    stock_unit: string;
    supplier: string | null;
    unit_cost: Decimal | null;
    currency: string | null;
    invoice_reference: string | null;
  }[];
  histories: StockEvent[];
};
export type ProductDetails = {
  product: Product;
  batches: Batch[];
  batch_page: number;
  batch_count: number;
  timezone: string;
};
export type NdcResult = {
  name: string;
  ingredients: string;
  dosage_form: string;
  package_description: string;
  ndc: string;
  labeler: string;
  reference_token: string;
};
