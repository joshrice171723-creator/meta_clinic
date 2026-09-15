import type {
  PackageTerms,
  PublishedPackage,
} from "../clinic/subscriptions/contracts";

export type MembershipStorefront = {
  slug: string | null;
  enabled: boolean;
  public_path: string | null;
};

export type PublicMembershipStorefrontResponse = {
  business_date: string;
  practice: {
    name: string;
    slug: string;
  };
  catalog: PublishedPackage[];
  payment: {
    checkout_available: boolean;
    mode: "test" | "local_simulator";
    source: "stripe_test" | "local_membership_payment_simulator";
    vendor_confirmed: false;
  };
};

export type PublicMembershipDirectoryResponse = {
  storefronts: Array<{
    name: string;
    slug: string;
    public_path: string;
  }>;
};

export type MembershipProspectState =
  | "new"
  | "contacted"
  | "qualified"
  | "converted"
  | "declined"
  | "checkout_pending"
  | "payment_processing"
  | "paid_onboarding"
  | "checkout_expired"
  | "payment_failed";

export type MembershipProspect = {
  id: number;
  display_name: string;
  email_address: string | null;
  phone_number: string | null;
  preferred_contact_method?: "email" | "phone" | null;
  preferred_contact_time?: string | null;
  outreach_consent: boolean;
  intent_type: "outreach" | "purchase";
  account_activated_at: string | null;
  account_setup_sent_at: string | null;
  enrollment_stage:
    | "contact_requested"
    | "email_verification_pending"
    | "payment_pending"
    | "payment_processing"
    | "patient_onboarding"
    | "closed";
  source: string | null;
  status: MembershipProspectState;
  relationship_stage: "prospective_patient" | "patient";
  possible_duplicate: boolean;
  lock_version: number;
  created_at: string;
  updated_at: string;
  subscription_version_id: number;
  selected_terms: PackageTerms;
  patient_id: number | null;
  portal_identity_id: number | null;
  agreement_id: number | null;
  receipt_id: number | null;
  onboarding_task_id: number | null;
  checkout_status: string | null;
  staff_payment_status:
    "awaiting_card" | "payment_processing" | "paid" | "failed" | null;
  recurring_authorized_at: string | null;
  paid_at: string | null;
  receipt_sent_at: string | null;
  reviewed_at: string | null;
  invited_at: string | null;
  converted_at: string | null;
  follow_up_state:
    "not_required" | "open" | "in_progress" | "waiting" | "completed";
  follow_up_assigned_to_membership_id: number | null;
  follow_up_due_at: string | null;
  follow_up_started_at: string | null;
  follow_up_attempted_at: string | null;
  follow_up_attempt_count: number;
  follow_up_outcome:
    | "checkout_opened"
    | "phone_payment_started"
    | "no_answer"
    | "callback_requested"
    | "not_interested"
    | "payment_verified"
    | null;
};

export type MembershipProspectIndexResponse = {
  prospects: MembershipProspect[];
  capabilities: {
    review: boolean;
    configure: boolean;
  };
  storefront: MembershipStorefront;
};

export type MembershipProspectMutationResponse = {
  prospect: MembershipProspect;
};

export type MembershipEnrollmentResponse =
  MembershipProspectMutationResponse & {
    replayed: boolean;
  };

export type MembershipEnrollmentOptions = {
  practice: { name: string };
  catalog: PublishedPackage[];
};

export type StaffPhonePaymentResponse = MembershipProspectMutationResponse & {
  phone_payment: {
    status: "awaiting_card" | "payment_processing" | "paid" | "failed";
    instructions: string | null;
    simulation_available?: boolean;
  };
};
