import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/shared/ui", () => {
  const terms = {
    family_id: 1,
    family_name: "Direct primary care",
    package_id: 2,
    package_name: "North Clinic membership",
    description: "Ongoing access published by North Clinic.",
    tier: "Individual",
    amount: "79.25",
    currency: "USD",
    duration: 1,
    duration_unit: "months",
    renewal: "manual",
    cancellation: "end_of_term",
    refund_policy: "manual_review",
    terms: "Synthetic membership terms.",
    eligibility_review: false,
    max_per_patient: 1,
    available_from: null,
    available_until: null,
    components: [
      {
        service_id: 3,
        name: "Routine visit",
        description: "One included routine visit.",
        mode: "included",
        group: "",
        min: 0,
        max: 100,
        quantity: 1,
        frequency: "term",
        price_adjustment: "0.0",
        eligibility_review: false,
      },
    ],
  };
  const published = { id: 7, number: 1, terms };
  return {
    LoadState: ({ error }: { error?: string }) => <span>{error}</span>,
    useResource: (path: string) => {
      if (path === "/api/public/membership_storefronts") {
        return {
          data: {
            storefronts: [
              {
                name: "North Clinic",
                slug: "north-clinic",
                public_path: "/memberships/north-clinic",
              },
              {
                name: "South Clinic",
                slug: "south-clinic",
                public_path: "/memberships/south-clinic",
              },
            ],
          },
          refresh: () => {},
        };
      }
      if (path === "/api/clinic/membership_prospects") {
        return {
          data: {
            storefront: {
              slug: "north-clinic",
              enabled: true,
              public_path: "/memberships/north-clinic",
            },
            capabilities: {
              review: true,
              configure: true,
            },
            prospects: [
              {
                id: 11,
                display_name: "Future Patient",
                email_address: "future.patient@example.invalid",
                phone_number: "555-010-2026",
                outreach_consent: true,
                intent_type: "outreach",
                source: "membership_storefront",
                status: "new",
                relationship_stage: "prospective_patient",
                possible_duplicate: false,
                lock_version: 0,
                created_at: "2026-09-12T12:00:00Z",
                updated_at: "2026-09-12T12:00:00Z",
                subscription_version_id: 7,
                selected_terms: terms,
                patient_id: null,
                portal_identity_id: null,
                agreement_id: null,
                receipt_id: null,
                onboarding_task_id: null,
                checkout_status: null,
                paid_at: null,
                receipt_sent_at: null,
                reviewed_at: null,
                invited_at: null,
                converted_at: null,
                follow_up_state: "not_required",
                follow_up_assigned_to_membership_id: null,
                follow_up_due_at: null,
                follow_up_started_at: null,
                follow_up_attempted_at: null,
                follow_up_attempt_count: 0,
                follow_up_outcome: null,
              },
            ],
          },
          refresh: () => {},
        };
      }
      if (path.startsWith("/api/public/membership_storefronts/")) {
        return {
          data: {
            practice: { name: "North Clinic", slug: "north-clinic" },
            business_date: "2026-09-14",
            catalog: [published],
            payment: { checkout_available: true, mode: "test" },
          },
          refresh: () => {},
        };
      }
      return {
        data: {
          catalog: [published],
          subscriptions: [],
          can_purchase: true,
          processor: "development_fixture",
          payment: { checkout_available: false, next_step: "clinic_follow_up" },
          requested_membership: { version_id: 7, selected_service_ids: [] },
        },
        refresh: () => {},
      };
    },
  };
});

import { MembershipGrowth } from "../src/features/membershipGrowth/MembershipGrowth";
import { PublicMembershipDirectory } from "../src/features/membershipGrowth/PublicMembershipDirectory";
import { PublicMembershipStorefront } from "../src/features/membershipGrowth/PublicMembershipStorefront";
import { PublicMembershipEntry } from "../src/App";

describe("clinic-specific membership growth", () => {
  it("makes clinic identity and both payment and contact paths prominent", () => {
    const html = renderToStaticMarkup(
      <PublicMembershipStorefront slug="north-clinic" />,
    );

    expect(html.match(/North Clinic/g)?.length).toBeGreaterThanOrEqual(3);
    expect(html).toContain("Memberships offered by this clinic");
    expect(html).toContain("North Clinic membership");
    expect(html).toContain("purchase an eligible membership now");
    expect(html).toContain("request clinic contact before paying");
    expect(html).not.toContain("South Clinic");
  });

  it("lets a future patient choose a clinic before viewing memberships", () => {
    const html = renderToStaticMarkup(<PublicMembershipDirectory />);

    expect(html).toContain("Find your clinic");
    expect(html).toContain("without an account");
    expect(html).toContain("North Clinic");
    expect(html).toContain("South Clinic");
    expect(html).toContain('href="/memberships/north-clinic"');
    expect(html).toContain('href="/memberships/south-clinic"');
    expect(html).toContain('href="/login"');
  });

  it("holds public membership content until the existing session is cleared", () => {
    const html = renderToStaticMarkup(
      <PublicMembershipEntry>
        <span>Public storefront content</span>
      </PublicMembershipEntry>,
    );

    expect(html).toContain("Loading this page");
    expect(html).not.toContain("Public storefront content");
  });

  it("renders the clinic growth pipeline and its clinic-specific public address", () => {
    const html = renderToStaticMarkup(<MembershipGrowth />);

    expect(html).toContain("Membership pipeline");
    expect(html).toContain("Prospective patients");
    expect(html).toContain("/memberships/north-clinic");
    expect(html).toContain("Future Patient");
    expect(html).toContain("North Clinic membership");
    expect(html).toContain("Account created → email verified → payment");
    expect(html).toContain("Contact first");
    expect(html).toContain("Prospective patient");
  });

  it("describes verified-payment onboarding separately from contact-first leads", () => {
    const html = renderToStaticMarkup(<MembershipGrowth />);

    expect(html).toContain("Verified payment moves them to the");
    expect(html).toContain("existing login");
    expect(html).toContain("No second account invitation is needed");
    expect(html).toContain("receipt email");
    expect(html).toContain("front-desk onboarding task");
  });
});
