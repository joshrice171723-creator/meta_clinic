---
type: progress-record
status: archived
event_date: 2026-09-03
source: APPlyVault/03 Execution/Progress Log.md
---

# 2026-09-03 — Patient portal implementation roadmap prepared

**Request and outcome:** translated the requested concierge/cash-pay patient portal into [[Patient Portal Implementation Roadmap]] and added proposed T-50. The plan sequences portal identity/lifecycle, ledger/Stripe and unapplied credit, intake/booking/inventory holds, clinician-released visit summaries and financial documents, then bounded messages/refills/results. It gives each slice explicit scope, likely blockers, failure cases, fallback, and exit evidence rather than assuming a 12-week build or a final compliance-polish phase.

**Evidence and limits:** the roadmap is grounded in the current synthetic staff-side clinic, cash-pay ledger, scheduling, inventory, and encounter-draft baseline, plus the existing access, operations, and workflow gates. It adds R-14 for the risk of treating patient portal work as ordinary frontend work. It does not select an identity vendor, processor, scribe/lab/e-prescribing integration, production environment, clinical content policy, payment/tax policy, or accepting reviewer; it neither implements features nor authorizes patient data, charges, clinical content, HIPAA/security acceptance, or release.

**Next action:** obtain the Milestone 0 lifecycle/identity and support-policy inputs, then implement only the synthetic authorization-model slice with its tenant, recovery, revocation, audit, and browser evidence.
