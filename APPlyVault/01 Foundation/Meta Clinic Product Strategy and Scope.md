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

### Shared core and composable capabilities — D-076

Meta Clinic is a configurable platform, not a collection of separately hardcoded clinic applications. Clinic type supplies a reviewable starter preset; actual enabled capabilities, delivery model and service configuration determine behavior. Most workflow components can be enabled, disabled or replaced by compatible variants. A specialty does not exclusively own a useful capability: chair scheduling, for example, may also serve a wellness clinic that offers infusions.

Separate these configuration dimensions:

- **Specialty/preset:** weight loss, primary care, infusion and other combinations; mixed-service clinics can compose capabilities without forcing all workflows into one specialty label.
- **Delivery and entry:** in-person, telehealth-only or hybrid; walk-in, scheduled and online self-service are separate choices. Telehealth-only still serves patients but needs no physical room/chair/arrival requirement. Keep organizational/contact context without requiring a patient-facing office.
- **Commercial model:** cash per visit, membership/package, insurance or mixed; neither specialty nor modality determines payment policy.
- **Operational capabilities:** provider/room/chair/equipment scheduling, episodic or recurring care, medication routes, stock, labs and service-specific authorization review. Vendor connection is a separate readiness state, not the switch that enables local preparation.

| Foundation shared across clinic types | What remains common | What may vary or be unused |
| --- | --- | --- |
| Organization, patient identity, access and history | Tenant/identity integrity, assigned permissions, provenance and durable history cannot be swapped away | Branding, sites, role assignments and entry routes |
| Service catalog and scheduling | One reservation/capacity truth and correct appointment links | Provider-only, room, chair, equipment and multi-resource variants; walk-in and virtual entry |
| Intake, encounter and documentation | Versioned answers, patient/encounter context, review/signing and existing consent | Specialty questions, initial/return forms, measurements and note components |
| Orders, results and medication | Source-linked requests, review, correction and fulfillment states | Labs, prescriptions, administration, outside pharmacy or in-house fulfillment |
| Money and inventory foundations | Ledger integrity, units, amounts, corrections and retries when used | Memberships, insurance, packages, procurement and stock interfaces enabled as applicable; no mandatory inventory page for virtual-only care |
| Work ownership and communication | Existing tasks/queues, dependencies, audit, coverage and patient context | Which service events create tasks, follow-up timing and outreach policy |

“Shared” means reuse the same underlying records and integrity contracts, not show every module to every clinic. Existing always-available cash functionality need not force a cash checkout step into every workflow. Disabling a component cannot disable authorization, erase history, orphan work or bypass a prerequisite still applicable to an existing action.

### Clinic capability map

This is a design catalog, not ten implementation commitments, clinical protocols or a readiness claim. Weight loss is the first implementation reference under D-075. Other rows are candidate compositions to guide extension boundaries and require their own source/field review before implementation. Capabilities listed as distinctive are not exclusive.

| Clinic example | Shared components reused | Distinctive configurable components/workflows | Not automatically required |
| --- | --- | --- | --- |
| Weight management | Memberships, intake, visits, labs, orders, billing and follow-up | Initial/return weight-management forms, goal and measurement progression, selected fulfillment routes | Specific drug/panel, universal lab hold, membership for every staff-created visit |
| Primary care | Registration, episodic visits, chart, results, billing | Broad visit-purpose templates, preventive/chronic follow-up when selected | Recurring treatment series or expiration-driven outreach without an affected service |
| Membership/direct primary care | Primary-care components and membership ledger | Membership entitlements, renewal recovery, configured access model | Insurance processing or physical-only care |
| Urgent care | Identity, clinical chart, orders, billing | Walk-in arrival/queue, room/provider capacity and episodic discharge follow-up | Membership signup or a preplanned series |
| Infusion | Clinical plan, resource schedule, medication, inventory, insurance and tasks | Chair/time and staff/equipment capacity, recurring treatment sessions, material demand projection and per-session authorization exposure | Automatic drug substitutions, automatic purchasing, authorization inferred from insurance card |
| Hormone therapy / men's or women's health | Intake, medication, labs, follow-up and billing | Clinic-selected longitudinal monitoring forms, relevant measurement/history components and prescription/administration routes | Fixed treatment eligibility, drug, dose or lab cadence |
| Aesthetics | Appointment, procedure documentation, inventory, payments | Room/equipment resource requirements, procedure-specific documentation and package/session tracking | Insurance module or recurring clinical plan for every service |
| Behavioral health | Intake, encounters, documentation, scheduling and communication | Individual/group session scheduling, selected assessment tools and longitudinal goals | Medication, pharmacy, physical room or group care for every practice |
| Rehabilitation / physical therapy | Care plans, scheduling, chart, billing and tasks | Planned visit series, functional-progress components, therapist/equipment capacity and authorization-use tracking where applicable | Medication inventory or an insurance requirement for cash care |
| Telehealth-only ambulatory clinic | Patient/account, intake, remote encounter, documentation, orders and follow-up | Virtual entry/availability, remote consent/connection recovery and outside-service coordination | Physical arrival, room/chair assignment, onsite stock or in-house fulfillment |

Telehealth-only is a delivery-model example that can overlay any compatible specialty, not a mutually exclusive clinical specialty. The catalog describes options; it must not hardcode an assumption that all clinics with a particular label operate identically.

### Treatment-plan-driven planning example

Founder example: **two treatments each week for three months**. Preserve this as entered recurrence plus actual start/end dates, timezone, preferred days/windows and clinic exceptions. Do not approximate three calendar months as twelve weeks or assume an exact visit count without resolved dates. A treatment plan is clinical intent, a projection is expected demand, a reservation holds capacity, and an administered treatment/stock event records what actually happened.

An infusion capability can use the same versioned plan to derive:

1. **Capacity outlook:** expected visits and duration, compatible chairs, staff/equipment and turnover constraints; distinguish projected demand from held/booked chairs so projections do not falsely claim a reservation or guaranteed availability.
2. **Medication/material outlook:** expected quantities from explicitly recorded plan requirements, current stock/reservations, eligible units and known incoming supply. Forecast shortages are not purchases, dispensing or guaranteed future stock; uncertain doses/mappings remain unknown.
3. **Service-linked financial work:** compare projected/booked service dates with separately recorded coverage evidence and service-specific authorization validity, approved visits/units and source limitations. Flag affected visits and create one owned review task when configured—not an indiscriminate patient-wide stop or automatic renewal request.

Coverage ending, eligibility unknown, authorization expiring and authorized units running out are distinct conditions. An appointment can matter even without a treatment plan: an ordinary insurance clinic with a booked affected visit may need review too. Conversely, an expiration date with no relevant future care does not create automatic patient-contact work under this default design. The review team chooses whether the next action is checking coverage, requesting reauthorization, correcting information or contacting the patient. No promise of insurer approval is implied.

Changing, pausing, canceling or rescheduling a plan must recompute affected projections and reconcile linked reservations/tasks without rewriting completed care, double-reserving resources or consuming stock. This is future capability direction, not an instruction to build infusion/insurance forecasting in the weight-loss assignment.

### Configuration evolves with the product

Every new or materially changed configurable feature must declare its shared owner, applicable presets, setup controls/defaults, dependencies/conflicts, permissions, enabled/disabled UI and backend behavior, vendor readiness, history/migration effects and focused acceptance. Update this map when the composition changes and update Clinic Setup in the same feature delivery when a control is needed. “Implemented but impossible to configure” is incomplete delivery.

Start building this composition contract with weight loss now: versioned preset resolution over existing practice settings, meaningful component selection, compatibility and safe disabling. Do not build ten specialties or a speculative plugin marketplace first. Detailed field/action and configuration acceptance live in the Configurable capability contract section of the [engineering guide](../../docs/development/meta-clinic-build-and-acceptance.md); [[Meta Clinic Implementation Tracker]] owns scoped work and evidence.

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
