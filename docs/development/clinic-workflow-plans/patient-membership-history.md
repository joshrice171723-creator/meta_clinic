# Patient membership activity history

## Assignment and authority

2026-09-30: Nova implements a bounded MC-09/MC-12 patient-facing source slice under Josh's dedicated Meta Clinic builder instruction. Relay owns one combined release PR; no feature PR targeting main, merge, deployment, credentials, live fixtures, provider transaction or policy change is authorized here.

Read this brief and the relevant canonical references before resuming. Reconcile its inspected baseline with newer user direction; preserve existing owners and branches.

## Current sources and decisions

Baseline PR66: `8c3d2358073acd14bb135a93a3adb1d7aa9034c8`. PR64 estimate comparison and PR65 prescription worklist are already delivered. Timecard source `6b8dcc526ad12ba89052034dba6df7be579939c1` is independently approved and preserved on its separate branch; this slice does not depend on it.

The [canonical tracker](../../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md) owns MC-09 membership failure/cancellation/unknown outcomes and MC-12 precise patient visibility. The [score reconciliation at 419b822f](https://github.com/joshrice171723-creator/meta_clinic/blob/419b822fbe5ac8ca0ba16ae67f52d14982a47391/records/progress/2026/09/2026-09-30-tracker-score-reconciliation.md) retains 65% Build for both rows: renewal exists, remaining entitlement/unknown-payment source coverage and patient-visible follow-up remain partial. This slice closes a small patient visibility gap, not those entire workflows; no score increment is assigned. The tracker/review owner maintains reconciliation.

`PatientPortal::SubscriptionsController#index` already projects only owning patient agreements through `SubscriptionProjection.collection`, removing patient IDs. Existing events contain only `kind` and `occurred_at`; no details, actor identifiers, provider payload or new fields are added. Staff `SubscriptionBilling.tsx` displays these events. `PatientSubscriptions.tsx` does not render them at baseline. The existing append-only subscription events and payment receipts remain separate authorities.

[Product strategy](../../../APPlyVault/01%20Foundation/Meta%20Clinic%20Product%20Strategy%20and%20Scope.md), [engineering guide](../meta-clinic-build-and-acceptance.md), [membership connected-acceptance design](membership-portal-connected-acceptance.md) and [healthcare reference map](../us-healthcare-reference-map.md) remain canonical. No clinical/exchange data, financial rule, consent requirement or regulatory interpretation changes. Requirements are presentation of existing product states; no external clinical guide is applicable and no standards compliance is claimed.

## Connected journey

Patient opens Memberships in the existing portal and expands a membership's activity using keyboard or pointer. The history displays exactly that returned agreement's recorded events in server order, including repeated active entries and failure/unknown/cancellation records. Current access/paid period remains the independent existing projection above; activity cannot reconstruct prior paid periods or imply a charge, notification, pharmacy action or clinical approval.

Empty history remains explicit. Unknown kinds use neutral text rather than internal identifiers. Invalid record times show Date unavailable. Existing denied/failed reads expose no history; a fresh read must supply records before anything can be displayed. Simulator and development-fixture histories are clearly labeled. No history action writes records or starts payments.

## Fields and action rules

| Field/control | Rule and source |
| --- | --- |
| Activity expansion | Existing MUI Accordion/Summary/Details, unique agreement-bound accessible IDs. No browser storage or extra API call. |
| Event label | Bounded presentation of existing kinds: pending/review/processing/active/failure/unknown/cancel/refund. Active says access recorded; cancellation says recorded, not immediately ended. Unknown kinds remain neutral. |
| Record time | Existing server `occurred_at`, which projection derives from event `created_at`. Display device timezone and retain valid ISO value in semantic time; invalid dates remain unavailable. |
| Ordering/count | Existing returned array order and length; never collapse repeated/equal-time events or sort by a guessed effective time. |
| Source limits | Explicit local simulator/development fixture notice; activity is separate from payment receipts and notification delivery. No live provider proof inferred. |
| Visibility | Only events in the existing scoped patient projection. No staff lookup, raw event details or another patient selector. |

## Ownership and dependency matrix references

Reuse OP-06 (missing provider), OP-10 (failed/stale reads and unknown outcomes), and the existing payment/access gates in the [shared matrix](../meta-clinic-build-and-acceptance.md). No matrix changes. External payment/renewal execution stays blocked by its existing prerequisites; viewing locally recorded activity is independently available. Existing patient identity/access checks and server event/receipt owners remain authoritative. No assignment, approval, signing or notification semantics change.

## Implementation and acceptance

Source changes are `PatientSubscriptions.tsx` (one imported child per existing membership) and `MembershipActivity.tsx` (read-only MUI accordion). No backend, contract, schema or dependency change. Installed MUI types are the fallback because no MUI MCP documentation tools are exposed.

Authored Chromium regressions mount the real PatientSubscriptions/React/MUI and same-origin API transport against independent synthetic responses. Cases cover lifecycle labels and keyboard expansion, membership separation/server order, empty/unknown/invalid time, denied initial read, denied fresh read/recovery, and repeated equal-time events with a prototype-name negative. No live browser or real identity is used; these are controlled transport/UI checks, not Rails auth integration or provider evidence.

From `apps/web`:

```sh
python ../../bin/agent-resources run -- node node_modules/vitest/vitest.mjs run test/patient-membership-activity.test.tsx --maxWorkers=1
python ../../bin/agent-resources run -- node node_modules/typescript/bin/tsc --noEmit
python ../../bin/agent-resources run -- node node_modules/vite/bin/vite.js build
```

Ruby is absent; no provisioning or backend execution. If the reviewer wants unchanged endpoint regression evidence, route `ruby -S bundle exec rails test test/integration/subscription_portal_test.rb` to the existing isolated runtime owner. Independent review and connected patient-account A/B visibility/API acceptance remain pending; no percentage or full membership/portal acceptance claim.

## Checkpoint

Source implemented. Final six controlled Chromium cases passed (10.24 seconds); TypeScript, scoped Prettier, Vite production bundle (1,476 modules; 946 ms) and diff checks passed. An initial denial case used an overly exact locator; that harness-only issue was corrected before the final pass. No Rails or provider execution is claimed.

## Last run

2026-09-30: inspected PR66 source and tracker reconciliation `419b822fbe5ac8ca0ba16ae67f52d14982a47391`. Missing patient event display verified against staff UI and existing scoped projection. Source and synthetic tests implemented. Next: Relay integrates the verified source commit and the tracker owner links this brief; independent/connected acceptance remains separate. Tracker score changes remain owned elsewhere.
