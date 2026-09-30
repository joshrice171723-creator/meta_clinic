# MC-15 explicit existing-draft field mapping — 2026-09-30

Integration base: `b14adecdf47897441f5348e41f69e69f666d1466`. Dedicated source branch: `codex/mc15-explicit-draft-field-mapping`. Source thread: `01a0f311-36d2-71bb-805a-99b08ef83021`. Relay owns integration. This extends the bounded durable text review, not general migration or business/clinical approval. Office and other product lanes remain outside this diff.

## Inventory and supported contract

The authoritative existing update is `Clinic::Configuration::ManageServiceOffering.update` and its `normalize` method. This review permits only its fourteen editable fields, restricted further to existing DRAFT offerings and explicit configured values:

| Fields | Import representation / boundary |
| --- | --- |
| `name`, `code`, `description`, `contact_instructions`, `referral_instructions` | Nonblank trimmed source text; existing maxima 160, 50, 500, 500, 500. No clearing. Destination/batch code uniqueness remains enforced. |
| `duration_minutes` | Explicit integer 5–1440; missing/null source values excluded. |
| `modality` | Explicit `in_person`, `video`, or `either`. |
| `booking_required`, `requires_room`, `public_visible` | Explicit source booleans, including false; never inferred. Visibility does not publish a draft. |
| `visit_type_id`, `billing_service_id` | One positive source ID deliberately mapped to one existing eligible destination record. Source IDs never substitute for destination IDs. |
| `site_ids`, `clinician_ids` | Every positive source ID deliberately mapped to a distinct eligible destination record; selected lists replace the destination list and use canonical sorted IDs. Empty source lists are excluded. No consolidation or inferred all-clinician expansion. |

The new authorized destination catalog exposes nonretired visit types, active locations, active clinician profiles with active same-practice memberships/users, and active billing services. Billing selections display the destination service's existing exact amount/currency for informed choice; these values are never imported or edited. Billing catalog availability follows existing `billing.catalog.manage`, `billing.read`, `billing.invoice_draft` / legacy `billing.write` authority, with no new grants or widened site authority. Billing authority is rechecked on saved-plan release, prepare, receipt reconciliation and application.

Status/publish/retire, prices/currency, new records, merging, protected settings/profiles, clinical defaults, request identities and tenant identities are not importable fields. Reference clearing, source nulls, empty eligibility lists and inactive destination references are deliberately narrower than the ordinary editor. Missing fields in earlier format-1 snapshots remain excluded; original four-text-field imports and saved reviews remain supported. The existing format-1 export now additionally includes description, billing-service ID and explicit clinician IDs, without catalog-match claims or source price metadata.

## Complete review and continuation path

The operator chooses each existing destination, each source offering, and every field individually. Reference selections start blank and require an explicit destination choice for each source ID. Preview shows exact typed before/after values, destination reference IDs and frozen labels, source-to-destination reference pairs, the destination revision and request key. Nothing is automatically selected or applied. Destination catalog responses are bound to the batch actor/membership/practice/site/authorization-generation context before reference selection is available.

The saved encrypted document retains original source clinic/digest/time, destination IDs/revisions, exact selected field changes and reference mappings, original PATCH requests, per-item outcomes, receipt IDs and reconciliation times. Saved responses are validated against both original request identity and plan identity. The server validates preview before values and active tenant-scoped references at save, then revalidates references before the existing owning update. Receipt payload normalization calls the owning operation's existing normalization, including canonical association lists.

The inherited durable workflow commits unknown intent before application. It applies sequentially, stops at unresolved outcomes, and never reconstructs a failed request from a new revision. A successful application also reconciles and records the original committed receipt before reporting applied. Reload performs no destination writes and resets browser repeat eligibility until explicit receipt reconciliation; explicit repeat preserves the original exact request and reconciles again first. No automatic retry, rollback or all-applied claim when any item remains unresolved. Initial read authorization/session failures stop continuation, and backend context/authorization checks remain authoritative at every write.

## Limits and verification boundary

- Existing bounds remain 1 MB / 500 explicitly selected offerings per saved review, unique source/destination mappings and distinct item request keys. Latest 25 reviews are listed; older reviews require the exact batch identity.
- Saved review access/continuation remains original actor, membership, clinic, site and authorization generation only. No ownership transfer or resurrection after permission regrant is introduced.
- Retention remains explicitly `unselected`; no legal retention, deletion TTL, cleanup job, or operational retention policy was invented. That deployment decision remains unresolved.
- The inherited encrypted-batch migration is source-only and has not been applied. Canonical `structure.sql` regeneration remains deferred as in the combined base; this change adds no migration/schema edits.
- Static source review by independent frontend/backend builders, scoped Prettier parsing/formatting, and `git diff --check` only. Existing browser-fixture selectors were aligned to new labels; no tests were added or executed. No build, lint, typecheck, Ruby execution, live data/provider call, credential handling, grant, PR, main merge, deployment, acceptance score or percentage award.
- Runtime, authorization-race, database-migration, browser and receipt integration behavior remain unverified. Source publication is not release acceptance.
