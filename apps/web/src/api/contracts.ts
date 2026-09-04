// Browser-facing response types only. Business rules live in apps/api.
export type Decimal = string;
export type AppearancePreference = {
  palette: "juniper" | "cobalt" | "plum" | "saffron";
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
};
export type PatientPortalContext = {
  schema_version: "patient-portal-context-v1";
  development_only: boolean;
  practice: { id: number; name: string; timezone: string };
  patient: { id: number; display_name: string; reference: string };
  upcoming_appointments: {
    id: number;
    starts_at: string;
    ends_at: string;
    status: string;
    site: string | null;
    visit_type: string | null;
  }[];
  balances: {
    currency: string;
    balance_amount: Decimal;
    allocated_amount: Decimal;
    credited_amount: Decimal;
  }[];
  billing: {
    invoices: {
      id: number;
      currency: string;
      status: string;
      created_at: string;
      total_amount: Decimal;
      allocated_amount: Decimal;
      balance_amount: Decimal;
      lines: {
        id: number;
        description: string;
        quantity: Decimal;
        posted_amount: Decimal;
      }[];
    }[];
    payments: {
      id: number;
      currency: string;
      amount: Decimal;
      created_at: string;
      cash_payment: boolean;
      receipt_available: boolean;
    }[];
  };
  intake: {
    status: string;
    emergency_contact_count: number;
    consent_status: string;
  };
  visit_summaries: {
    id: number;
    encounter_id: number;
    signed_at: string | null;
    assessment: string;
    plan: string;
  }[];
  results: {
    id: number;
    code: string;
    value_kind: string;
    numeric_value: Decimal | null;
    text_value: string | null;
    coded_value: string | null;
    unit_code: string | null;
    observed_at: string;
  }[];
  medications: {
    id: number;
    medication: string | null;
    dose: string | null;
    route: string | null;
    frequency: string | null;
    purpose: string | null;
    status: string;
    effective_from: string | null;
    effective_until: string | null;
  }[];
  messages: {
    id: number;
    purpose_code: string;
    created_at: string;
  }[];
  reminders: PatientReminder[];
  reminder_preferences: ReminderPreference[];
  appointment_requests: {
    id: number;
    starts_at: string;
    ends_at: string;
    status: string;
    requested_at: string;
  }[];
  requests: {
    id: number;
    request_type: "message" | "refill";
    status: "pending" | "in_review" | "resolved" | "declined";
    requested_at: string;
    reviewed_at: string | null;
  }[];
  capabilities: {
    appointments_read: boolean;
    billing_read: boolean;
    intake_read: boolean;
    messages_read: boolean;
    results_read: boolean;
    visit_summaries_read: boolean;
    payment_collection: boolean;
    appointment_requests_write: boolean;
    messages_write: boolean;
    refill_requests_write: boolean;
    step_up: boolean;
    recovery: boolean;
  };
  notices: string[];
};
export type PatientReminder = {
  id: number;
  patient_id: number;
  category: string;
  channel: string;
  safe_preview: string;
  scheduled_at: string;
  timezone: string;
  local_schedule_label: string;
  status: string;
  priority: string;
  expires_at: string | null;
  endpoint: { type: string; label: string; masked_value: string };
  action_types: string[];
  delivery_attempts?: { attempt_number: number; status: string; failure_class: string | null; retryable: boolean }[];
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
export type Patient = {
  id: number;
  display_name: string;
  reference: string;
  primary_address_version_id?: number | null;
  demographics?: {
    date_of_birth: string | null;
    sex: string;
    primary_language: string;
    interpreter_required: boolean;
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
      state: PatientCareSummaryReviewState;
      information_source?: string | null;
      reviewed_at?: string | null;
    }
  >;
  review_needed: boolean | null;
  review_needed_topics: string[] | null;
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
export type ClinicCapabilities = {
  patient_identity_read?: boolean;
  appointments_read?: boolean;
  appointments_book?: boolean;
  appointments_status_transition?: boolean;
  staff_write?: boolean;
  billing_read?: boolean;
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
  documents: boolean;
  messages: boolean;
  reminders?: boolean;
  reminders_write?: boolean;
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
};
export type BillingInvoiceDetail = {
  id: number;
  patient_id: number;
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
    total_amount: Decimal;
    allocated_amount: Decimal;
    credit_amount: Decimal;
    balance_amount: Decimal;
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
    refunds: { id: number; amount: Decimal; created_at: string }[];
  }[];
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
  timezone_override: string | null;
};
export type ClinicWorkspaceContext = {
  schema_version: "clinic-context-v1";
  user_id: number;
  practice: { id: number; name: string; timezone: string };
  membership_id: number;
  credentials: string[];
  policy_version: "clinic-authorization-v1";
  capabilities: ClinicCapabilities;
  sites: ClinicSite[];
};
export type Appointment = {
  id: number;
  patient_id: number;
  site_id: number | null;
  room_id: number | null;
  booked_clinician_id: number | null;
  visit_type_id: number | null;
  starts_at: string;
  ends_at: string;
  status: string;
  encounter_id: number | null;
  patient?: Pick<Patient, "id" | "display_name" | "reference">;
};
export type FacilitySite = ClinicSite;
export type FacilityRoom = { id: number; site_id: number; code: string };
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
};
export type EncounterNoteSummary = {
  id: number;
  patient_id: number;
  encounter_id: number;
  note_kind: string;
  version: number;
  latest_revision: number | null;
  signed: boolean;
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
  } | null;
  revisions: {
    id: number;
    revision_no: number;
    prior_revision_id: number | null;
    author_membership_id: number;
    payload_version: number;
    created_at: string;
    signed: boolean;
  }[];
};
export type ClinicTrackingBoardVisit = {
  id: number;
  row_type: "appointment" | "encounter";
  operational_state:
    "upcoming" | "on_time" | "late" | "waiting_room" | "unrecorded";
  patient_id: number;
  encounter_id: number | null;
  provider_assignment_available: boolean;
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
    site_id: string | null;
    site_code: string | null;
    room_id: number | null;
    room_code: string | null;
  } | null;
  care_summary: PatientCareSummary | null;
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
