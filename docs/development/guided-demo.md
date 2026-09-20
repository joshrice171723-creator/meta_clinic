# Independent clinic lessons

## Accepted scope — 2026-09-19 (latest revision)

The founder replaced both sequential prerequisites and per-visitor saved clinics with shared, independent lessons covering every left-navigation destination. Name, email and company are usage-contact capture only. No personal clinic names, persistent unfinished lessons or per-person completion history are wanted. Each lesson owns exactly one clinic globally, and entering or restarting resets that clinic to its prepared starting state. Other lesson clinics remain unchanged. A successful target operation displays Lesson complete for the current session only.

All unrelated prerequisites (patient, staff, availability, stock or account state) are prepared through existing local backend services. The clinic sidebar stays visible and a tutorial spotlight identifies relevant controls/forms. Payments remain explicitly simulated and the lessons cash-based. This is authorized local development; it is not deployment or live payment authority.

Latest coverage requirement: every item in the clinic left navigation needs at least one lesson; add distinct useful actions where supported. Catalog sections should match navigation labels. The catalog contains 45 lessons: 20 core action lessons, registration and 16 focused review walkthroughs, plus eight specialty action lessons. Review acknowledgement is only tutorial completion, not a saved clinical review, sent message or live integration result.

## Implementation and ownership

Baseline: `d1171b9`, branch `codex/guided-clinic-demo` in the isolated guided-clinic-demo checkout.

- Backend owner: fixed lesson clinic registry, scoped reset/provisioning, contact usage tracking, ephemeral session selection and authoritative current completion.
- Frontend owner: contact capture, stateless lesson catalog, lesson entry/restart and completion message.
- Coordinator: stock form layout, ClinicFrame navigation, DemoFrameBoundary and spotlight, integration, documentation and verification.

No new clinical decision rules or healthcare exchange requirements are introduced. The standards-guided development procedure was reviewed; no new FHIR exchange or clinical protocol applies to tutorial isolation, navigation or reset semantics. Existing domain operations remain authoritative.

## Reset boundary

Only explicitly registered shared lesson clinics may be reset. Ordinary development clinics, global roles, other lessons and contact records must remain untouched. Reset must be transactional, retain the fixed clinic identity, restore prerequisites and leave the target task incomplete. No global database reset, blanket trigger disabling or runtime protection removal is permitted. The earlier per-visitor schema migration was applied locally before this revision; corrections require a forward migration.

## Acceptance and verification gate

Finish the revised implementation before consolidated verification. Check every lesson provisions with incomplete target tasks, returning to a lesson resets it rather than resuming, fixed clinic count/identity remain stable across different visitors, restarting preserves another lesson, prior sessions cannot mutate a newly reset lesson, usage contacts remain recorded, and completion is not retained in the catalog. Verify focused backend/frontend tests, types/build/format and a short browser walkthrough of sidebar, spotlight, automatic reset, completion and inventory layout.

## Checkpoint

The fixed-clinic implementation is complete locally. Four forward migrations (20260919050000 through 20260919080000) have been applied to the isolated guided-demo development and test databases on port 54339. Reset preserves each registered clinic identity and changes only its lesson data; old sessions are revoked on reentry. Contact records remain usage data.

Browser evidence covers the full sidebar, inventory adjustment from 200 to 199 with a completion message, restarting to 200, returning to the catalog, and keeping the spotlight dimmer and directional arrow visible when its target is off-screen. Show me brings the target into view; dialogs retain their own interaction layer. This is a short local walkthrough, not end-to-end browser acceptance of all 45 lessons.

The frontend selector passed 191 related tests, type checking, formatting and bundle generation. The subsequent off-screen-target correction passed the focused demo suite; final type checking also passed. The focused Rails run verified all 45 independent lesson starts and note-template read permissions (2 tests, 326 assertions). The other 10 guided-demo tests passed in the preceding run, including reset isolation, fixed identity, stale sessions and specialty note completion; its sole failing case was corrected and passed in the focused rerun. Rails eager loading and changed Ruby formatting pass. Vault and harness checks pass. No deployment, external delivery, live payment, video call or AI generation was performed.

## Clinic-type lessons — September 19 update

The accepted initial specialty scope is primary care and weight management. Eight additional modules cover scheduling, saving a note, completing a visit, and publishing a membership for each type (45 total). Stable specialty lesson keys each own one shared resettable clinic. General modules remain available under either clinic filter. Contact capture measures usage only.

Primary care documentation prompts cover the current concern, interval history, available findings, assessment and agreed follow-up. Weight-management prompts add patient goals/preferences, weight history, eating/activity patterns, barriers and progress. These are product documentation prompts, not mandated questions or prescribing protocols; no dose, medical eligibility threshold or clinical treatment is inferred.

Source review (2026-09-19): [NIDDK, Talking with Your Patients about Weight](https://www.niddk.nih.gov/health-information/professionals/clinical-tools-patient-management/weight-management/talking-with-your-patients-about-weight), sections on permission, history, goals and follow-up, informs respectful sample context. [ONC progress-note definition](https://healthit.gov/faq/period-time-when-information-blocking-limited-united-states-core-data-interoperability-what/) (USCDI v1 July 2020 errata cited by the page) establishes general note scope, not a specialty form mandate. This change adds no exchange or FHIR mapping; the existing SOAP payload owns note data. Verify distinct note template IDs, specialty clinic profile, a saved revision completing its lesson, and fixed clinic identity on reentry.

Specialty notes use distinct templates and starting context. Backend verification exercises note completion and reset separately from browser evidence.

## Hosted isolation � September 19

The authorized AWS release keeps shared inventory/Scribe layout improvements. Tutorial requests use `/api/demo-workspace/` and a separate encrypted `_apply_demo_session` cookie; ordinary app sessions retain `_apply_session`. The prefix is handled locally and routed to a separate API process on AWS. Sample Scribe creation requires the current active Scribe lesson and its operator/clinic binding.

Hosted lessons require staging, `APP_GUIDED_DEMO=1`, and the dedicated `apply_guided_demo` database. The regular API keeps that flag off. The demo database login has no CONNECT privilege to the ordinary `apply` database. Demo secrets are generated on the server independently; no payment, AI, SMTP, or telehealth provider credentials are copied. The existing same-origin UI renders lessons; same-origin framing is permitted for clinic/demo/membership shells.

Focused regression checks cover preservation of an ordinary signed-in session across demo entry/reset, prefix cookie isolation, rejection of sample creation in ordinary clinics, acceptance in the Scribe lesson, and refusal of hosted activation against the normal database. Deployment verification is recorded separately after the release.
