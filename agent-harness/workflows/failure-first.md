# Failure-first planning and review

## When to use

Every bounded change names and checks its principal failure. Use the complete record below for a substantive work chunk and for authentication, authorization, tenancy, protected values, signing, billing, migrations, auditing, clinical workflows, infrastructure or release work.

This procedure asks “How is this going to fail?” It challenges mechanisms and evidence, not people, and does not imply that a failure has occurred.

## Complete record

Before implementation, record the following in the claimed Shortcut Story or linked evidence note:

1. **Outcome and boundary:** one observable result, entry dependencies, exclusions, permitted environment/data and accountable owner. Separate design, implementation, verification and release where their gates differ.
2. **Failure hypothesis:** an assumption that could be wrong, a concrete trigger and the resulting user, data, operational or business harm.
3. **Detection and prevention:** the signal that reveals the failure, who notices it and the guard that prevents an unsafe or misleading outcome. “We will be careful” is not a control.
4. **Disproof and recovery:** a bounded synthetic negative test or authorized tabletop, expected result, stop condition and safe recovery or manual fallback. State what evidence would make the team revise or reject the plan.
5. **Exit record:** actual versus expected outcome, source version and environment, evidence reference, reviewer/date, unresolved risks and next action. Untested means untested; a plan, screenshot or passing happy path is not complete acceptance.

## Failure classes

Consider the applicable classes:

- missing, wrong or stale input;
- wrong account, clinic or excess authority;
- concurrent, repeated, partial or out-of-order actions;
- interrupted sessions and unavailable people or services;
- silent data loss or alteration;
- false acknowledgement or falsely reported completion;
- failed recovery, rollback or restore;
- for business work: scope, demand, cost, capacity, reuse rights and reliance on one person.

Use existing risk, assumption, legal-question, task and decision identifiers instead of creating parallel registers. Mark a class not applicable only with a reason.

## Evidence and recovery

- Start with local tests, mocks, wholly synthetic fixtures or an authorized tabletop.
- Preserve a material failure signal and correct consequential in-scope defects before continuing.
- Do not remove guards, manufacture evidence or normalize a bypass to make a check pass.
- A workaround is acceptable only when the defect has no consequence for the current outcome or an authorized temporary recovery is recorded with its limitation and follow-up.
- Stop the affected path when recovery needs new authority, destructive action or incompatible concurrent edits; continue independent safe work.
- Do not accept unresolved unauthorized access, silent loss or alteration, duplicate external action, false completion, or missing required audit/recovery evidence.

Testing does not authorize live penetration testing, destructive failure injection, patient access, external messages, purchases or deployment. Product acceptance, professional review, security review, real-data release and hosted release remain separate gates.
