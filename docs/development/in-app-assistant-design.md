# In-app assistant: booking milestone

This local, synthetic-only feature adds a conversational entry to the existing
Rails scheduling workflow. It does not create a second authority or a FHIR API.
Browser requests use the existing same-origin session, CSRF and demo namespace.
Rails alone resolves identity, membership, permissions, clinic and location.

The model can extract bounded search intent. It cannot confirm a proposal,
choose an actor, grant a permission, fabricate openings or declare a saved record.
Patient/chart/tool-result text is data, never a source of execution authority.
Consequential writes use server-held proposals and the existing booking operation.

## Standards reviewed on 2026-10-04

| Source/version | Applicability and requirement | Implementation mapping |
| --- | --- | --- |
| [Argonaut Scheduling 1.0.0, FHIR 3.0.1](https://fhir.org/guides/argonaut/scheduling/) | U.S.-oriented guide referring to US Core; useful conceptual separation of availability, booking and retrieval. No exchange partner or conformance target is selected. | Preserve search filters, explicit booking and persisted retrieval as separate backend steps. Do not import its OAuth/external-client architecture into the authenticated app. |
| [Appointment R4 4.0.1, 12.10.1.1](https://hl7.org/fhir/R4/appointment.html) | Global base specification relevant to the U.S. scheduling workflow. Available times do not guarantee an authorized booking; appointments and encounters are distinct. | Existing scheduling policy/authorization/collision checks remain authoritative at confirmation. A saved appointment is not an encounter or clinical approval. |
| [Slot R4 4.0.1](https://hl7.org/fhir/R4/slot.html) | Conceptual time-window/status reference; not a requirement to replace internal storage with FHIR resources. | Display server-derived start/end and selection; expire proposals and recheck availability. Recurrence/overbooking retain existing gates. |

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
