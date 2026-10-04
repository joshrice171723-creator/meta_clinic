# In-app assistant: booking foundation and workflow expansion

This local, synthetic-only feature adds a conversational entry to the existing
Rails scheduling workflow. It does not create a second authority or a FHIR API.
Browser requests use the existing same-origin session, CSRF and demo namespace.
Rails alone resolves identity, membership, permissions, clinic and location.

The model can extract bounded search intent. It cannot confirm a proposal,
choose an actor, grant a permission, fabricate openings or declare a saved record.
Patient/chart/tool-result text is data, never a source of execution authority.
Consequential writes use server-held proposals and the existing booking operation.

## October 4 authorized expansion

After the locally verified booking milestone, the owner authorized connecting
the existing workflow groups. Existing clinical and operational services remain
the executable authority. A server-owned registry exposes explicit domain
handlers, semantic inputs, named selections and readable results; model text
cannot select an HTTP path, actor or permission. Every changed record uses a
server-held proposal, current authorization and version check, followed by a
persisted result and audit receipt. Signing, final approvals, destructive resets
and real external sends/payments remain human-gated.

Implementation ownership: booking_backend owns the generic backend foundation;
clinical_workflows and operations_workflows own separate domain handlers;
model_adapter owns bounded workflow intent extraction and the 116-row mapping;
assistant_frontend owns the persistent panel/forms/results; the integrator owns
routes, schema, evidence and Git. No domain handler calls a sibling controller.
Freeze all writers before the consolidated verification pass.

Acceptance delta: resolve and account for every historical criterion; prove
enabled reads and changes through assistant routes, including each changed domain,
named selections, denied/stale/duplicate/cross-context behavior, model routing,
persisted readback, and tutorial coverage. A human handoff or source mapping is
never labeled completed assistant execution. No automatic background actions.

## Standards reviewed on 2026-10-04

| Source/version | Applicability and requirement | Implementation mapping |
| --- | --- | --- |
| [Argonaut Scheduling 1.0.0, FHIR 3.0.1](https://fhir.org/guides/argonaut/scheduling/) | U.S.-oriented guide referring to US Core; useful conceptual separation of availability, booking and retrieval. No exchange partner or conformance target is selected. | Preserve search filters, explicit booking and persisted retrieval as separate backend steps. Do not import its OAuth/external-client architecture into the authenticated app. |
| [Appointment R4 4.0.1, 12.10.1.1](https://hl7.org/fhir/R4/appointment.html) | Global base specification relevant to the U.S. scheduling workflow. Available times do not guarantee an authorized booking; appointments and encounters are distinct. | Existing scheduling policy/authorization/collision checks remain authoritative at confirmation. A saved appointment is not an encounter or clinical approval. |
| [Slot R4 4.0.1](https://hl7.org/fhir/R4/slot.html) | Conceptual time-window/status reference; not a requirement to replace internal storage with FHIR resources. | Display server-derived start/end and selection; expire proposals and recheck availability. Recurrence/overbooking retain existing gates. |
| [US Core 7.0.0 STU7, R4](https://hl7.org/fhir/us/core/STU7/), [Basic Provenance](https://hl7.org/fhir/us/core/STU7/basic-provenance.html), [Security](https://hl7.org/fhir/us/core/STU7/security.html), reviewed October 4 | Published U.S. trial-use version, consulted for existing clinical record provenance and authorization. This older pinned version is a conceptual reference, not a selected exchange contract or conformance claim. | Keep source-record links and recorded facts separate from generated text; preserve backend record author/version and per-action access checks. No new exchange schema, medical inference or clinical-signing authority is introduced. |

R3 Argonaut and R4 base concepts are reviewed separately, not combined into a
claimed conformant profile. No new external interoperability exchange is built.
Proposal expiry, idempotency, actor/session binding and audit are product/security
requirements from the owner's request, not inferred FHIR mandates.

## Provider and operating boundary

The [OpenRouter pricing page](https://openrouter.ai/pricing/) lists 50 requests/day
for the free plan. The adapter must restrict routing to free models, bound every
attempt, reserve the quota durably and never fall back to paid inference. A
multi-step conversation can consume multiple requests. Shared-account usage
outside this app can exhaust the provider's quota earlier than the local counter.

The [OpenAI data-controls documentation](https://developers.openai.com/api/docs/guides/your-data)
distinguishes endpoint retention behavior and special organization controls.
Production use remains unavailable until the project owner and healthcare counsel
resolve BAA execution, retention configuration and eligible endpoint/features.
No model-provider consumer website or ChatGPT-hosted connector is in this data path.

The web panel retains transient conversation/drafts only in memory. Closing and
reopening the panel in the same context should retain them. Context/account/demo
role changes invalidate proposals and clear protected output; no browser storage
is used for chat or clinic records. Durable audit receipts are a separate backend
record. Formal operational retention and archival policy remain open.
