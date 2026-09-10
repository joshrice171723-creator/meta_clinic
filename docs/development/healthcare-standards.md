# Standards-guided healthcare development

Healthcare standards are a primary input to Meta Clinic workflow and data design. Apply this procedure before building or substantially revising healthcare pages, domain models or exchanges. The accepted direction is recorded in [Decisions, D-066](<../../APPlyVault/03 Execution/Decisions.md>). Ordinary cosmetic edits do not require a new standards review.

## Select the right sources

### United States scope

Review only sources applicable to United States healthcare workflows. Filter registry discovery to the United States where supported, then verify the actual guide's jurisdiction, publisher and scope. Exclude other countries' implementation guides, regulations, terminology adaptations and country-specific examples from product requirements. Do not substitute a foreign guide when a U.S. guide is missing.

Use applicable U.S. federal authorities and the actual clinic state's authorities for operational requirements; do not assume one state's rules apply nationwide. Base FHIR and UCUM remain eligible as global technical foundations only where relevant to the U.S. workflow or selected U.S. guide. A global standard is not foreign-country guidance, but missing jurisdiction metadata is not proof of U.S. applicability. Record the basis for using it; if applicability is unresolved, leave the dependent requirement unresolved and continue independent work. Check linked sources and examples against this same scope.

Start with the [FHIR Implementation Guide Registry](https://fhir.org/guides/registry/). Select guides by workflow, jurisdiction and intended exchange partner. Open the actual published guide: a registry listing is discovery, not evidence that its requirements apply. Record the guide package/version, FHIR release, publication status, exact section and access date. Prefer the version required by the integration over the newest version; never mix R4 and R5 definitions silently. Drafts can inform proposals but must be identified as drafts.

The following official references were accessed on 2026-09-10 as starting references. Recheck relevant sections when designing a feature; this list is not a complete requirements assessment or a selection of one FHIR release for the product.

| Reference | Product use | Interpretation boundary |
| --- | --- | --- |
| [HL7 HealthcareService](https://hl7.org/fhir/healthcareservice.html) | Service offerings, organizations, locations, availability and referral information | The unversioned URL currently resolves to R5; pin the selected published version when mapping. Service configuration does not prove operational readiness. |
| [HL7 MedicationAdministration R5](https://hl7.org/fhir/R5/medicationadministration.html) | Administration event, medication, subject, status, timing, performer and dosage details | Distinguish the order from what was administered; inspect the appropriate Immunization resource/guide for vaccinations. |
| [NLM RxNorm](https://www.nlm.nih.gov/research/umls/rxnorm/index.html) | Normalized drug concepts and identifiers for medication search and mapping | Preserve source terminology, identifier and version; a drug concept is not a physical inventory lot or a dosing recommendation. |
| [UCUM](https://ucum.org/ucum) | Machine-readable units for quantities, doses and results | Keep display labels separate from canonical unit codes; validate dimensional compatibility. A unit standard alone does not justify dose conversions. |
| [FDA route terminology](https://www.fda.gov/drugs/data-standards-manual-monographs/route-administration) | Consistent administration-route names and mappings | Check the selected FHIR profile's terminology binding; FDA terminology is not automatically the required exchange value set or evidence of a drug's permitted route. |
| [CDC vaccine documentation](https://www.cdc.gov/vaccines/hcp/administration/after.html) | Vaccination documentation, including administration date, manufacturer, lot, administrator and vaccine information statement records | Distinguish required documentation from recommended details and determine applicability; consult immunization exchange guides separately. |
| [CMS CLIA](https://www.cms.gov/medicare/health-safety-standards/clinical-laboratory-improvement-amendments-clia/getting-started-clia) | Laboratory setup requirements and certificate/test-scope context | Operational/regulatory guidance, not a lab-result schema. Applicability depends on actual testing performed; configuration is not certification. |

## Use during development

1. Describe the user, task, outcome and relevant failure cases. Identify the U.S. clinic/service scope, state when relevant, and whether an exchange partner exists.
2. Review the applicable implementation guide, base resources, terminology and operational guidance. If no guide applies, record the search scope and rationale, then proceed with explicit product requirements and relevant base standards. Missing partner details remain unresolved rather than guessed.
3. Write a small source-to-requirement mapping in the active task or design/review artifact using the table below. Distinguish source requirements, recommendations and product choices. Interpret cardinality, conditional rules, terminology bindings and Must Support in the selected guide's context; Must Support does not automatically mean a mandatory input on every form.
4. Design backend-owned data and validation first: identifiers, code systems/versions, units, relationships, event states and history. Preserve the existing domain architecture; add explicit exchange mappings where needed. Avoid duplicating catalogs or validation in frontend fixtures.
5. Translate each requirement into user behavior: entered, selected, inherited, calculated, read-only or conditionally shown. Required exchange data can be assembled from existing records. Do not expose every resource element as a form control or add unrelated features simply because a specification describes them.
6. Verify the relevant behavior with focused synthetic examples, including missing/invalid values, incompatible units, status transitions or coding failures as appropriate. For an implemented exchange, validate against the exact profile/version and test mapping/round-trip behavior where meaningful. Record what was actually checked; a standards-informed design alone is not proven FHIR conformance.
7. In the handoff, identify reviewed sources and versions, mapped requirements, deliberate deviations, unresolved applicability and checks performed. Revisit mappings when the workflow, guide version or integration partner changes.

| Source section and version | Requirement and U.S./state applicability | Backend data/validation | UI behavior and origin of value | Verification or unresolved gap |
| --- | --- | --- | --- | --- |
| Populate for the scoped feature | Mark required, conditional, recommended or product choice | Owning model/API and coding rules | Entered, inherited, calculated, displayed or hidden | Focused evidence and any remaining question |

Keep accepted decisions and durable requirements in the canonical vault; detailed dated evidence belongs in `records/`. This procedure does not itself authorize new integrations or establish clinical, regulatory or release acceptance.
