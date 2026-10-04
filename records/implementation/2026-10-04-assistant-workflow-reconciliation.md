# Phase 2 workflow reconciliation — 2026-10-04

All 116 source criteria remain in the [machine-readable reconciliation](2026-10-04-assistant-workflow-reconciliation.json). The historical report is website evidence, not assistant acceptance. Both reported build references are retained; no single exact-build run is inferred.

The 19 conflicts are resolved for tool candidacy by retaining the canonical criterion and excluding the unrelated reported result. Neither claim becomes a passed assistant tool.

| Workflow | Canonical criterion versus reported subject | Decision |
| --- | --- | --- |
| WF-024 | Payroll exports criteria; reported result concerns direct timesheet entry. | No inherited acceptance; fresh criterion-specific assistant evidence required. |
| WF-045 | Recurring series criteria; reported result concerns reminder policy. | No inherited acceptance; fresh criterion-specific assistant evidence required. |
| WF-046 | Walk-in criteria; reported result concerns waitlist addition. | No inherited acceptance; fresh criterion-specific assistant evidence required. |
| WF-047 | Late-arrival criteria; reported result concerns recurrence policy. | No inherited acceptance; fresh criterion-specific assistant evidence required. |
| WF-048 | No-show criteria; reported result concerns overbooking policy. | No inherited acceptance; fresh criterion-specific assistant evidence required. |
| WF-058 | Draft/sign/complete encounter criteria; reported result concerns time-gated no-show. | No inherited acceptance; fresh criterion-specific assistant evidence required. |
| WF-067 | SOAP edit, auto-save and template criteria; reported result concerns a care plan. | No inherited acceptance; fresh criterion-specific assistant evidence required. |
| WF-068 | Amend signed note criteria; reported result concerns signing/completing an encounter. | No inherited acceptance; fresh criterion-specific assistant evidence required. |
| WF-076 | Care-plan criteria; reported result concerns patient messaging. | No inherited acceptance; fresh criterion-specific assistant evidence required. |
| WF-077 | Referral-exchange criteria; reported result concerns team broadcast. | No inherited acceptance; fresh criterion-specific assistant evidence required. |
| WF-078 | Recall creation criteria; reported result concerns document upload. | No inherited acceptance; fresh criterion-specific assistant evidence required. |
| WF-079 | Care-gap/recall worklist criteria; reported result concerns task claiming. | No inherited acceptance; fresh criterion-specific assistant evidence required. |
| WF-090 | Receipt output criteria; reported result concerns invoice ledger. | No inherited acceptance; fresh criterion-specific assistant evidence required. |
| WF-097 | Membership pipeline rendering criteria; reported result concerns activation/cancellation. | No inherited acceptance; fresh criterion-specific assistant evidence required. |
| WF-098 | Staff messaging criteria; reported result concerns subscription catalog. | No inherited acceptance; fresh criterion-specific assistant evidence required. |
| WF-100 | Patient reminder composer criteria; reported result concerns end-of-day closeout. | No inherited acceptance; fresh criterion-specific assistant evidence required. |
| WF-108 | Operations hub/closeout criteria; reported result concerns audit log. | No inherited acceptance; fresh criterion-specific assistant evidence required. |
| WF-109 | Daily report date-entry criteria; reported result concerns role denial. | No inherited acceptance; fresh criterion-specific assistant evidence required. |
| WF-110 | Large-data performance criteria; reported result concerns session expiry. | No inherited acceptance; fresh criterion-specific assistant evidence required. |

First-milestone candidates: WF-039 booking and WF-043 capacity denial; WF-001/WF-003 demo identity/isolation and WF-114/WF-115 session/audit supply related criteria. WF-001 previously changed from per-visitor tenant isolation to shared demo lessons: this phase preserves shared demo records while proving ordinary/demo separation and per-visitor session/proposal separation. It does not claim one tenant per visitor.

All other capabilities remain gated. Even the candidate workflows may contain broader website criteria than this milestone; only explicitly exercised assistant behavior may be accepted. No clinical signing, approvals, policy overrides, external sends, shared reset or provider activation is an assistant tool.
