# Clinic setup and Implementation Specialist (FDE) verification

Date: 2026-09-10
Scope: synthetic local Meta Clinic source and disposable test database only

## Outcome and boundary

Meta Clinic now has one canonical `/clinic/setup` surface for a clinic type, intended services, payment model, visit types, sites and hours. The versioned backend profile is the source of the clinic's stated implementation scope. It does not automatically enable clinical actions.

The new `implementation-specialist` role represents the FDE who brings the base software, configures one assigned practice and hands it to the clinic. Its exact permissions are `facilities.read` and `facilities.write`. It is not an administrator and has no patient, chart, medication, billing, inventory or role-management permission.

## Failure-first record

| Item | Record |
| --- | --- |
| Principal failure | A selected service is presented as clinically approved/ready, or the FDE gains patient-record access while configuring a clinic. |
| Harm | Staff could rely on an incomplete workflow, or an implementation user could access records outside setup duties. |
| Prevention | Setup says it records intent only; services display software-readiness labels; the server versions complete profiles; the FDE gets only facilities read/write; clinical APIs continue to authorize independently. |
| Negative tests | Reject unsupported clinic types/services; reject stale edits; reject a reused key with different content; prove FDE facilities access while patient and role-management access remain denied. |
| Recovery/stop | A failed or stale update creates no replacement version. Existing profile revisions remain append-only. Do not activate a selected hardening/implementation-required workflow until its separate acceptance path is complete. |

## Foundational questions and researched answers

| ID | Question | Working answer | Evidence and consequence |
| --- | --- | --- | --- |
| 0A | What kind of clinic is this, and which services will it actually provide? | Do not infer services from one label. Store clinic type and a separate service list. The recommended Meta Clinic base is primary care with telehealth, external-lab coordination, minor office procedures and in-office medication administration intended; insurance is off. | HL7 HealthcareService separates service category/type/specialty/location. CMS place-of-service categories are billing settings, not service definitions. In-office medication administration remains hardening-required. |
| 0B | What authorizes a nurse to perform an administration or procedure? | Require a patient-specific order or a clinic-approved protocol/standing-order path, the responsible authorizing clinician, effective version, eligibility/hold checks and an explicit exception/escalation path. FDE setup cannot create clinical authority. | HL7 MedicationAdministration links the event to a request and distinguishes performer/verifier, status and not-given reasons. Exact delegation and standing-order rules require clinic/jurisdiction review before activation. |
| 0C | How should medication, dose, unit, route and body site be represented? | Medication identity should be searched from an authoritative catalog and linked to the ordered product and, when clinic stock is used, the selected inventory lot. Dose/unit/route/site should be structured pickers with a controlled exception path, not unconstrained primary fields. | NLM RxNorm supports normalized drug identity, UCUM supports units, FDA provides route terms, and HL7 models dose/rate/route/site/method. Terminology integration remains implementation work. |
| 0D | What must a generic administration record capture downstream? | At minimum: linked order/protocol, medication/product, dose and unit, route, site when relevant, occurrence time, performer, status, reason/not-given reason, notes, source lot/expiry when stock is used, and required verifier/check evidence. | HL7 MedicationAdministration identifies these event elements. Inventory decrement, medication history, encounter timeline, charge capture, adverse-event/follow-up and audit should consume the committed event, never a UI checkbox alone. |
| 0E | Can vaccination use the generic medication workflow? | Share primitives, but use a vaccine-specific workflow and record. | CDC documentation adds manufacturer, lot, vaccinator and VIS details. The existing generic medication surface is insufficient by itself. |
| 0F | Can point-of-care testing be turned on from setup? | It can be selected as intended scope, but remains hardening-required until the lab profile, test complexity/certificate path, device/lot/QC, specimen, result, review and follow-up workflows are configured. | CMS CLIA distinguishes testing from specimen collection and requires the applicable certificate for covered testing. |
| 0G | Can controlled or patient-supplied medication handling be bundled into ordinary administration? | No. Keep each as a separate implementation-required service with additional authority, custody, inventory, witness/count and exception controls. | DEA guidance is role/registration-specific; neither a clinic-type selection nor an FDE permission establishes controlled-substance authority. |
| 0H | Should the FDE be a shared global super-user? | No. Use a unique identity, one practice-scoped role, minimum setup permissions and attributed version history. Clinic ownership retains role administration and clinical authority. | HHS unique-user guidance supports attributable identities. The implementation role is deliberately denied patient and role-management permissions. |

## Verification completed

- `npm test -- clinic-navigation.test.ts`: 9 tests passed.
- `npm run typecheck`: passed.
- `npm run build`: 1,354 modules transformed and the production bundle completed.
- Targeted Prettier check: all seven changed frontend/test files passed.
- `ruby .\\bin\\postgres exec env RAILS_ENV=test bin/rails db:prepare`: migration `20260910001500` applied to the disposable test database.
- `ruby .\\bin\\postgres exec bin/rails test test/integration/practice_features_test.rb test/services/development_role_accounts_test.rb`: 12 runs, 139 assertions, 0 failures, 0 errors.
- Targeted RuboCop: 7 files inspected with no offenses; Rails eager loading completed successfully.
- `python .\\bin\\verify-vault`: 44 notes and 521 links passed; `python .\\bin\\verify-agent-harness`: 28 documents, 7 skills and 9 commands passed.
- Browser walkthrough as the synthetic `Implementation Specialist (FDE)`: `/clinic` routed directly to `/clinic/setup`; the clinic shell exposed Operations, Clinic setup and Settings but no patient navigation; the setup page rendered the profile, visit-type and site configuration; the recommended profile saved as revision 1 with primary care, four intended services and insurance off.

## Local runtime observations

- The first managed start after the schema change completed in about 63 seconds; approximately 47 seconds was database preparation and migration. The frontend and API then answered over loopback.
- A later managed restart exposed an existing process-ownership defect: Rails continued serving on port 3001 after its recorded parent exited, so strict `bin/dev status` could not verify the API PID even though HTTP checks passed. This remains a development-lifecycle issue, not a clinic-setup acceptance result.
- The full development-account preparation task remains blocked by an existing frozen Omni role-version mutation. `Development::RoleAccounts.prepare!` created the synthetic FDE account independently, allowing the bounded browser verification above without changing Omni's permission history.

Full repository and release acceptance are not claimed. No hosted change, real data, professional approval or clinical activation is claimed.
