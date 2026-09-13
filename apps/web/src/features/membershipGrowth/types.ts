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
  practice: {
    name: string;
    slug: string;
  };
  catalog: PublishedPackage[];
  payment: {
    checkout_available: boolean;
    mode: "test";
  };
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
  email_address: string;
  phone_number: string | null;
  outreach_consent: boolean;
  intent_type: "outreach" | "purchase";
  source: string | null;
  status: MembershipProspectState;
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
  paid_at: string | null;
  receipt_sent_at: string | null;
  reviewed_at: string | null;
  invited_at: string | null;
  converted_at: string | null;
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
