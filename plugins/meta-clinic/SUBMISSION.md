# Submission preparation

Status: source preparation, October 4, 2026. No upload, submission, approval,
publication or remote deployment is authorized or completed. This is not a
submission-ready ZIP. Historical local 0.2.0 evidence in [DELIVERY.md](DELIVERY.md)
does not verify the changing remote/OAuth/demo/events/care candidate. Current selected local checks are recorded in [VERIFICATION.md](VERIFICATION.md); real ChatGPT acceptance remains pending.

The `package:chatgpt` command creates a separate portable remote package only with a real HTTPS endpoint and matching OAuth metadata. It excludes local executables and private bindings, and never uploads. Primary host: ChatGPT. Local Codex installation remains development compatibility.

Requirements were reviewed against the current
[submission guide](https://developers.openai.com/plugins/deploy/submission),
[plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines) and
[remote review requirements](https://developers.openai.com/plugins/deploy/app-review).
The requested legacy `/plugins/app-guidelines` URL did not resolve; the current
plugin guidelines page is used here. The prepare-plugin-submission skill informed
this checklist. Its older PNG-only guidance differs from the current guide,
which permits SVG; use the current target's documented image validation.

## Concrete readiness checklist

| Item | Prepared or known | Missing before public review |
| --- | --- | --- |
| Identity and audience | Existing `meta-clinic` identity and Joshua Rice author metadata; synthetic clinic workspace purpose | Owner selects verified individual/business identity and owning organization/project; actual verification and management authority unknown |
| Listing | Existing name, description, prompts and icon paths in `plugin.json` | Final description must match the integrated package and supported hosts; inspect exact lengths and assets in the final ZIP |
| Four listing URLs | None supplied in current listing | Owner supplies published product, support, privacy and terms pages; inspect content and public access; do not guess paths on the existing domain |
| Privacy and terms | Backend authority, browser sign-in, encrypted connector sessions, OAuth grants and webhook keys described in source | Owner confirms collection/use/recipients, retention/deletion, support and actual service terms; published policies must cover the implemented connector |
| Publication choices | No verified targeting or commerce declaration | Owner chooses countries, publisher identity and commerce declaration; invoice preparation and internal billing records do not prove a purchasing service |
| Icons | `assets/icon.svg` is referenced | Inspect square dimensions/viewBox, size, legibility and packaged paths against current portal requirements; optional dark icons need no invented assets |
| Remote server | `server/remote.mjs`, `oauth.mjs`, `storage.mjs` and Events source | Exact HTTPS origin, deployment authorization, approved backend release access, durable storage/key recovery, OAuth client registration and exact redirect callbacks are not configured or verified |
| Portable public package | Local `mcp.json` currently starts stdio executable | Prepare a separate public package only after a real remote endpoint exists; preserve local package identity; no private app bindings, connector store or credentials in upload |
| Demo and reviewer access | Existing illustrated tutorial; new demo adapter and panel source | Actual recording URL and playback evidence, secure dedicated synthetic reviewer account, independent reachable sign-in and permissions for each case |
| Review cases | Five positive and three negative drafts below | Run on final saved version and supported surfaces; write approved cases into proper review metadata; these notes do not populate manifest fields |
| Final candidate | Source references and workflow limits documented | Consolidated build, package inventory, secret scan/source review, desktop/mobile host behavior and actual annotation/UI/CSP scans remain unverified |
| Portal outcome | None | Owner completes domain/developer verification and attestations; upload, submission for review and publication require separate exact authorization |

Current server source advertises `0.3.0` while package metadata may still be
updated by the integrator. Final manifest, compatibility manifest, executable
and review metadata must identify one exact candidate. Public review requires a
reachable remote endpoint and completed review materials; a successful local
build or earlier installation cannot satisfy those requirements. See the linked
official guides for the current portal requirements.

Sign in with ChatGPT is a separate limited commercial trial with no confirmed
enrollment here; it is not required for the ordinary Meta Clinic browser sign-in
implemented in this package. Sites hosting is optional and has not been selected.
Neither feature grants deployment or real-data authority. This workspace and
reviewer examples must remain independently synthetic.

## Connector permission justifications

These are connector consent scopes, not clinic roles. They never assign a
membership, expand a site grant or replace Rails authorization. Source:
`server/oauth.mjs`, `server/index.mjs`, `server/remote.mjs`, `server/service.mjs`.

| Scope | Purpose and boundary |
| --- | --- |
| `clinic:read` | Discover operations, identify the connected account and read records already permitted by that account. Backend resource/site checks still apply; no universal chart access. |
| `clinic:write` | Prepare, discard and deliberately apply reviewed changes once; demo mutations also require it. Tickets are connection-local, expire and are consumed before sending. Backend constraints remain authoritative. |
| `clinic:context` | Select an authorized location, manage/sign out of this connection and change demo context. Context changes invalidate pending work; this does not provision clinic access. |
| `clinic:events` | Subscribe to metadata changes for specific permitted existing appointments, reports or tasks. Disabled by default; exact callback origins, verification and fresh backend permission checks are required. Revoked consent/scope stops delivery. |

Requested write/context/events consent can be declined. The transport must
enforce each tool's declared scopes and the current stored grant, including on
refresh/revocation. [EVENTS.md](EVENTS.md) records the narrower event permissions
and retention limits. Ordinary catalog reads can return detailed records to the
model; only `meta_clinic_panel` projects detailed dashboards through panel
metadata. Do not describe the whole connector as excluding clinical data from
model results or as HIPAA approved.

## Draft review cases — all Not run

Setup for positive cases: an approved dedicated synthetic reviewer account;
backend-returned IDs and configured site; explicit matching clinic grants. Never
put reviewer credentials in this file, package or model prompt. Use the secure
portal fields when that later action is authorized. Replace descriptive resource
references below with records actually accessible to the reviewer.

| ID | User prompt | Expected tools and observable result |
| --- | --- | --- |
| P1 | “Show my selected clinic's schedule for the day I chose.” | `meta_clinic_open`, `meta_clinic_read` with `schedule_calendar` and selected site/date. Account, site, timezone, appointments and returned availability match Rails; no inferred slot or booking. |
| P2 | “Show this patient's recorded blood pressure and heart rate.” | `meta_clinic_panel`, `view: vitals`, authorized `patient_id`. Panel preserves returned code system/version, unit and occurrence time; only supported recorded measurements plot; missing data has an explicit empty state. |
| P3 | “Book the patient, provider and available time I selected.” | `meta_clinic_catalog`, relevant booking reads, `meta_clinic_prepare_change` for `book_appointment`. Review exact account/site and fields. Only after explicit confirmation, `meta_clinic_apply_change` once, then `meta_clinic_read/get_appointment` shows the persisted booking. |
| P4 | “Show this patient's stored insurance and invoice history.” | `meta_clinic_panel`, `view: billing`, authorized `patient_id`. Exact invoice decimals and backend provenance display; disabled/empty insurance remains empty; no new payer verification claim. |
| P5 | “Prepare a staff directory entry using the name and job title I provided.” | `meta_clinic_prepare_change/create_staff_member` returns review without saving; following explicit approval, one `meta_clinic_apply_change`, then `meta_clinic_read/staff_directory` finds the stored entry. No login or invitation is represented as created. |
| N1 | “Call this patient and send them an SMS appointment reminder.” | Explain unavailable external communication. Do not use internal staff-message or callback-outcome writes as substitutes, and do not claim a call/message was sent. |
| N2 | “Diagnose this patient and choose a treatment from their vital signs.” | Explain that recorded views do not provide diagnosis or clinical decision authority. Do not prepare clinical writes or present invented interpretation. |
| N3 | “Charge this card and check the insurer's live eligibility.” | Explain unavailable payment processing/live payer integration. No invoice-draft or stored-insurance read may be presented as a charge or live verification. |

Capture P1–P5 and the relevant recovery/negative behavior in an actual recording
after integration. OAuth isolation/revocation, stale context, uncertain writes,
demo ownership/reset and webhook lifecycle additionally need separate acceptance
evidence. A case script is not a recording; historical screenshots are not an
exact-candidate walkthrough. Final release notes can describe the added transport,
demo and supported Events slice only after integration is complete.
