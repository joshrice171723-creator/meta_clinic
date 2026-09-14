---
type: product-strategy
status: active
updated: 2026-09-14
lifecycle: active
canonical_for: meta-clinic-platform-strategy
---
# Meta Clinic Product Strategy and Scope

Home: [[00 Home]] · Product: [PRODUCT.md](../../PRODUCT.md) · Delivery: [[Meta Clinic Implementation Tracker]] · Engineering: [Build and acceptance guide](../../docs/development/meta-clinic-build-and-acceptance.md)

## Purpose and core promise

Meta Clinic is one operating system for a clinic's digital front door and physical front desk. It should connect online acquisition, walk-ins, scheduled visits, telehealth, clinical work, cash-pay billing, medication operations, inventory, pharmacy workflows and follow-up.

This is intended product direction, not a claim that every capability is implemented. The implementation tracker owns changing status and evidence. The separate mentoring/guidance portal is not the clinic's public patient website and does not define Meta Clinic's scope.

## Customers and business models

Serve independent and growing clinics across specialties: primary care, weight loss, hormone therapy, men's and women's health, aesthetics, wellness, longevity, functional medicine and other ambulatory services. Include clinics with medication inventory and pharmacy operations. These are supported design directions, not a promise that every specialty is ready today.

Cash-based clinics are an explicit target. Support pay-per-visit services, memberships, subscriptions and treatment packages. Preserve the always-on cash-pay core; insurance workflows are an optional clinic configuration under D-064. A clinic's specialty, payment model and in-person/virtual delivery model are separate configuration choices.

The commercial model remains clinic software subscriptions with separately scoped onboarding, integration and migration work under D-067. No prices, launch dates or customer commitments are established here.

## Shared platform

- Clinic identity, branding, public website/storefront, service offers and lead capture.
- Account creation, patient registration, intake, scheduling and walk-in arrival.
- Front-desk check-in, queues, rooms, staff handoffs and provider work.
- In-person and telehealth encounters, documentation, orders and results.
- Patient messaging, education, follow-up, recalls and recurring care.
- Estimates, invoices, payments, receipts, refunds, credits, memberships and packages.
- Medication ordering and tracking, inventory, purchasing, receiving, lots, expiration, dispensing and fulfillment workflows.
- Operational reporting, locations, employees and organization-assigned privileges.

Each workflow uses the appropriate shared patient, organization, encounter and financial records. Pharmacy and inventory records retain their own operational identity and links. Connection must reduce duplicate entry without collapsing distinct states such as payment, arrival, encounter completion and fulfillment.

## Build workflows before vendor access

Insurance is part of Meta Clinic's intended scope, configurable per clinic; it is not excluded because vendor access is currently unaffordable or unavailable. The same principle applies to supplier price checks, supplier orders, package tracking, prescription transmission and other external services.

Build as much of each complete local workflow as possible now: collect the right information, persist it through the backend, prepare requests, support organization-assigned review, retain history, and track outcomes and recovery. Keep vendor-specific connections replaceable so later access does not require rebuilding the patient or employee journey.

Missing access blocks the affected external action, not unrelated preparation or local operations. Preserve the difference between locally recorded work, ready-to-send work, actual transmission and a vendor-confirmed result. Support staff-recorded external actions where appropriate, identifying who recorded them and their source; do not present them as API confirmation. Test with synthetic records and simulated responses through the real backend boundary, not frontend-only dummy data.

Future vendor mapping, onboarding and required testing may remain. Preparation reduces that work but does not promise a universal drop-in connection. Connecting a vendor must not automatically send previously prepared work.

## Specialty configuration

Configure services, offers, intake questions, review steps, appointment types, measurements, templates, medication/inventory requirements, billing options, follow-up schedules and integrations on the shared foundation. Reuse common mechanisms; introduce specialty-specific behavior where the actual workflow requires it.

## Roles and organization responsibility

Authorized administrators for the purchasing organization assign employees their roles and privileges. Meta Clinic enforces those privileges and organization boundaries. The organization decides who is qualified for its roles.

Independent license verification, jurisdiction-based professional eligibility checks and regulatory approval determination are not default product requirements. Do not introduce them as prerequisites to employee access or normal work unless the founder explicitly adds that capability. Configured permissions and recorded approvals are operational controls, not certifications.

Pharmacy, dispensing, fulfillment and inventory software are within product scope. Providing those tools does not mean Meta Clinic itself supplies pharmacists, operates a pharmacy or manufactures medication. Clinical and professional decisions remain with the participating organizations and professionals.

## Intended differentiation

Let a clinic run its own branded patient experience and physical operations together: online interest becomes actionable clinic work; a walk-in enters the same appropriate patient record; in-person care can continue through telehealth; billing, medications and follow-up stay connected. The clinic controls its brand, patient relationship and authorized use of its data.

This is a positioning hypothesis to demonstrate through workflow quality and customer feedback, not a claim that competitors lack hybrid care.

## Build decision test

For each substantial feature, identify the patient or employee journey, the handoff it improves, the records it uses, the assigned privileges it respects and the recovery path when interrupted. Consider online, scheduled and walk-in entry where applicable. Confirm specialty configuration and payment-model implications. Require evidence of the connected journey before calling it complete.

Staff work prioritizes desktop and tablet; public clinic websites, enrollment and patient access must work well on mobile as well.
