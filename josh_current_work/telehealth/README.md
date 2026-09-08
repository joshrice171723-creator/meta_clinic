# APPly telehealth architecture

Prepared 2026-09-08. **Implemented in an isolated clone; targeted verification and the collected repair pass are complete. Live-provider evidence and global regression gates remain open.**

The original design packet remains outside the APPly repository. This living implementation copy belongs to `C:/Users/joshr/Desktop/Work/APPly-telehealth`, independent of the original checkout and active Stage 1 audit's folders, services, databases and evidence. See the [implementation handoff](AGENT_IMPLEMENTATION_HANDOFF.md) for current integration and evidence.

Source reference: `C:/Users/joshr/Desktop/Work/APPly`, branch `main`, observed HEAD `88af72e0567056707cc71a8ad37b752054d343e4`, with pre-existing uncommitted changes. The independent implementation clone uses only that committed base. Reconcile the audit's resulting changes before any later merge.

- [Workflow and delivery boundaries](ROADMAP.md)
- [Detailed architecture: screens, controls, schema, contracts, services, integration](TELEHEALTH_BUILD_PLAN.md)
- [Future verification and failure-recovery requirements](TELEHEALTH_AUDIT_PLAN.md)
- [Required Scribe integration inside the video call](SCRIBE_IN_CALL.md)
- [Implementation and verification evidence](IMPLEMENTATION_EVIDENCE.md)
- [Local operation and provider configuration](LOCAL_OPERATION.md)

The design covers scheduled video visits from booking through patient preparation, consent, waiting, staff assistance, clinician admission, video and charting, reconnect, wrap-up, documentation, instructions, and existing billing/follow-up workflows. It includes configuration and operational recovery. It does not claim clinical approval or invent new prescribing, emergency-care, proxy-identity, or payment authority.

The user's follow-up explicitly includes Scribe inside the video call. In-call controls, both parties' audio, typed context, review, and encounter-bound export are required scope. A separate launch link alone does not satisfy this requirement. Recording remains optional for the patient under separate consent.

Implementation was explicitly requested after the architecture. Shortcut connectivity was recovered and [sc-504](https://app.shortcut.com/apply-1/story/504) claimed before source writes. That Story owns task status. The branch `codex/sc-504/telehealth-scribe` starts from the committed source reference above and excludes unrelated uncommitted main changes. The active audit remains outside this task's write scope.

Recommended implementation decision: extend the existing Rails/PostgreSQL and React/MUI app with `Clinic::Telehealth`; use Daily behind an application-owned provider adapter. Purchasing/enabling a provider account, sending messages, connecting real data, or deploying remain separate actions. All initial implementation and verification use independently invented local records.
