# Capability roadmap progress

Updated: 2026-09-03

This is a lightweight top-level progress view for the living capability roadmaps in [`josh_current_work/`](josh_current_work/). It is an estimate for coordination, not a release, clinical, security, financial, or pilot-acceptance decision.

## Scoring basis

0 means not started. 50 means meaningful implementation exists but major integration, verification, or approval gaps remain. 100 means implemented, verified, approved, and ready for the applicable controlled pilot. Scores are qualitative estimates based on the current roadmap, build-plan, audit-plan, evidence, and handoff documents. They are not calculated from line count or feature count.

## Current estimate

| Area | Estimated completion | Short explanation |
| --- | ---: | --- |
| Roadmap/document quality | 90/100 | Clear capability roadmaps, build plans, audit plans, evidence, handoffs, shared integration rules, and release gates exist. |
| Actual end-to-end implementation | 32/100 | Several synthetic backend/domain slices exist, but shared integration, UI, runtime, and recovery proof remain incomplete. |
| Production/pilot readiness | 5–10/100 | Production use, external providers, release evidence, approvals, accessibility, support, and rollback gates remain open. |
| Shared integration foundation | 15/100 | Identity, authorization, routes, migrations, event boundaries, audit, observability, and runtime integration are only partly reconciled. |

## Capability estimates

| Capability | Overall | Phase estimates |
| --- | ---: | --- |
| Cash-pay billing | 40/100 | P0 policy 25; P1 ledger 75; P2 cash drawer 70; P3 checks 5; P4 documents 25; P5 processor 25; P6 release/pilot 20 |
| Patient reminders | 35/100 | P0 contract 35; P1 foundation 65; P2 staff/patient controls 40; P3 channel workflows 20; P4 pilot 0 |
| Staff messaging | 30/100 | P1 rules 45; P2 core messaging 40; P3 workflow support 35; P4 validation/governance 10 |
| AI scribe | 30/100 | P0 safety contract 30; P1 ingestion 45; P2 generation/provenance 45; P3 review/approval 30; P4 operations 5; P5 pilot 0 |
| Patient portal | 25/100 | P0 policy 25; P1 lifecycle 50; P2 billing 20; P3 booking/inventory 15; P4 clinical/documents 15; P5 requests/results 15; P6 pilot 0 |

## What the scores mean

- Cash-pay billing is furthest along. Synthetic ledger, drawer, reconciliation, receipt, and permission-boundary work exists, but focused Rails execution and browser evidence are blocked or incomplete. Check intake, production documents, hosted release, and pilot approval remain open.
- Patient reminders have a substantial synthetic backend/domain checkpoint and a web build, but shared route/permission wiring, runtime tests, provider callbacks, worker recovery, and live UI proof remain.
- Staff messaging is currently a backend domain checkpoint. Shared authorization, routes, seed permissions, UI, workers, API tests, accessibility, and browser verification remain.
- AI scribe has a synthetic backend with consent, provenance, approval, export, and deletion boundaries, but Rails integration, a review workspace, and browser proof remain.
- Patient portal has a synthetic identity/lifecycle slice, but most patient-facing billing, booking, clinical-document, request, and pilot phases remain incomplete.

## Cross-capability blockers

- Reconcile shared `Ability`, route, context, contract, seed, and migration changes in the owning APPly checkout.
- Run focused authorization, tenant-isolation, idempotency, retry, concurrency, and recovery tests in task-owned databases.
- Capture live desktop, narrow-layout, keyboard, accessibility, and runtime evidence for implemented flows.
- Keep professional, privacy/security, financial, clinical, release, support, and rollback decisions explicit.
- Do not treat planning documents, source inspection, syntax checks, builds, screenshots, or agent handoffs as full acceptance.

## Coordination rules

- Re-discover the current contents of `josh_current_work` on every review; capabilities and files may be added, removed, renamed, or superseded.
- Keep detailed plans and evidence in `josh_current_work`; keep this file as the concise top-level view.
- Update the estimate when a meaningful evidence event changes the status, not after every file edit.
- Update the APPly vault task register and progress log when a roadmap status, decision, risk, or verified outcome materially changes.
- Run no more than three independent implementation slices in parallel. Do not parallelize shared-file, shared-migration, shared-database, or shared-runtime work.
- Preserve unrelated worktree changes and use the owning repository's `AGENTS.md`, workflows, skills, checks, and commit rules.

## Evidence sources

- [`josh_current_work/ROADMAP_INDEX.md`](josh_current_work/ROADMAP_INDEX.md)
- Each capability's `ROADMAP.md`, `*_BUILD_PLAN.md`, `*_AUDIT_PLAN.md`, `AGENT_AUDIT_EVIDENCE.md`, and `AGENT_IMPLEMENTATION_HANDOFF.md`
- APPly's canonical task status: [`APPlyVault/03 Execution/Roadmap and Tasks.md`](APPlyVault/03%20Execution/Roadmap%20and%20Tasks.md)
- APPly's dated outcomes: [`APPlyVault/03 Execution/Progress Log.md`](APPlyVault/03%20Execution/Progress%20Log.md)
