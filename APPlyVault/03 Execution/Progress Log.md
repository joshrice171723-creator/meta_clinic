---
type: progress-log
status: active
updated: 2026-08-30
---
# Progress Log

Home: [[00 Home]] · Tasks: [[Roadmap and Tasks]] · Decisions: [[Decisions]]

Newest entry first. Record actual changes and results, not projected achievements.

## 2026-08-30 — Site moved into the main Git repository

**Request and outcome:** founder reported Git's embedded-repository warning, then specified that `site/` should not have its own history. Replaced the staged `160000` repository pointer with 201 ordinary site files, including the existing local-demo edits without changing their contents. Moved the former `site/.git` into `.git/local-backups/site-20260831T000043Z/site.git` and saved the prior parent index alongside it for local recovery. No nested repository or submodule remains in `site/`; no old commits were imported or shared history rewritten. Changes are staged locally, not committed or pushed by this repair.

**Documentation:** recorded D-023, updated [[Website MVP]], and annotated the historical repository/CI baseline in [[Roadmap and Tasks]]. Future website publication must use only site source/build from an isolated export, never send the parent repository or vault to Sites. No application code, dependency, hosting/access setting, or task-completion status changed.

**Checks and limits:** personally reviewed all 23 Markdown notes and five JSON configurations and rechecked their hashes before writing. Every site's source-file hash and mode matched the pre-repair snapshot. A Git archive of the staged site contained all 201 files with matching content; the site entry is a normal tree and Git invoked from `site/` resolves to APPly. Existing ignore rules still exclude local environments, keys, databases, logs, dependencies and build output. Git whitespace checks passed. No application build/test, external source review, deployment or patient-data access was needed or performed. External MD/governance/security originals remain unavailable and unreviewed.

**Next:** review and commit the staged repair, then push normally to `origin main`; no force push or remote-history cleanup is needed.

## 2026-08-30 — Current-state review and development milestones

**Delivered:** reviewed the entire vault and the application code, then added the proposed M0–M6 sequence and separate SharePoint/EHR path to [[Roadmap and Tasks#Development plan — proposed 2026-08-30]]. Each milestone names dependencies, observable exit criteria, evidence and proposed accepting roles. Added T-22–T-27 while preserving existing task IDs/history and G0–G3 business gates. Updated [[00 Home]], [[Client Portal]], [[Website MVP]] and [[Source Register]]. No further business interview was necessary; host/operator, source-review, signing and pilot choices remain questions at the relevant gates. No deadlines, budgets or human commitments were invented.

**Current-state findings:** the non-clinical portal already implements account-scoped demo paperwork, training, Contact and guarded local demo access. Production Rails hosting, client activation/recovery operations, reviewed content, protected activity evidence and real signing remain open. Identified a nested CI workflow, seed-dependent test setup and a homepage opening-status implication unsupported by the current MD record. Real PDF/submission work stays later; the clinical PostgreSQL proposal is not the portal schema or approval to build an EHR.

**Checks actually rerun:** five frontend tests, frontend typecheck/lint, Rails lint (43 files) and Brakeman (zero warnings) passed. In separate synthetic scratch databases, `db:prepare test` produced 26 tests / 194 assertions with two failures caused by seeded sample guides; `db:schema:load test` passed all 26 tests / 214 assertions. The failed initialization path remains recorded for M0/T-22 rather than hidden by the clean run. No code was edited, dependencies installed, development records inspected, or production data used. Build, HTTP/browser QA, container, hosted-state checks, dependency audits and independent security review were not rerun.

**Review coverage and limits:** all 23 Markdown notes and five JSON configurations personally reviewed, with hashes kept in-session. Re-inventoried and read four concurrent note updates before editing; the updated baseline had 208 resolving wiki links and every note reachable from Home. Mentorship note now exists and D-019 contextualizes historical discrepancies. Stale `Welcome.md` UI references and Sync enablement were observed but settings preserved. External MD/governance/security originals remain unavailable; none is treated as reviewed. Site runtime secrets, credentials, databases/logs and unused generated UI internals were outside the content review; the first-party flows, models, schema, tests and deployment configuration were inspected.

**Final document checks:** all 23 notes passed frontmatter/date/code-fence checks; all five JSON files parsed; all 225 wiki links resolved including headings/aliases; every note remained reachable from Home, with unique names and task IDs. Both repositories passed Git whitespace checks. Inspected incremental diffs against the reviewed pre-edit snapshot: only the six intended planning notes changed, and site-source hashes and Obsidian configuration were unchanged. The two scratch test databases were temporary synthetic verification artifacts, not client stores.

**Next:** accept an owner/scope for T-22, establish repeatable checks and browser acceptance, and resolve the hosting choice while authorized packet review progresses independently. This planning task does not authorize publishing, outreach, professional engagement, spending, real applicant signatures or patient-data work.

## 2026-08-30 — Local development login enabled

**Request and diagnosis:** founder encountered ChatGPT sign-in and authorized a generic development login. Confirmed the private Sites preview has an owner-only hosting gate, separate from the existing Rails email/password authentication. No public-access change or Rails deployment was requested or performed.

**Delivered:** local login offers **Continue as demo client**. Each entry provisions a fresh non-admin synthetic account and demo document, with sample-only training and persistent local progress for the session. Demo signing needs no password but retains review/consent/version checks. Regular accounts keep password confirmation. The shortcut and existing demo-session access require Rails development mode, explicit enablement, loopback and origin checks; the frontend proxy also rejects the shortcut outside local development. Production remains disabled even if the enable flag is accidentally set.

**Verification:** 26 Rails tests / 214 assertions and five frontend helper tests passed; frontend typecheck/lint/build, Rails lint and Brakeman passed. Native HTTP checks passed for both demo and regular login, protected pages, demo signing, training, contact/admin, logout and cookie replay. Tests cover disabled/production/remote-origin paths, isolation and privilege restrictions. Only temporary synthetic smoke accounts and their records/inquiry were removed; no user records or documents were deleted. No browser interaction/visual QA or production security assessment performed.

**Vault and handoff:** personally reviewed all 23 Markdown notes and five JSON files, including hidden configuration, and rechecked unchanged hashes before editing. External legal/packet/governance material remains unavailable and unreviewed. Updated [[Client Portal]], [[Website MVP]] and T-19; preserved clinical modeling work and Obsidian settings. Local servers were left running for the requested walkthrough at [local login](http://localhost:3000/login). This is a development handoff, not a new hosted publication; T-20 remains awaiting input.

## 2026-08-30 — Rails client portal and website revisions implemented

**Founder direction:** removed the entire clinic brief, added Contact and Rails login, then expanded the signed-in area to Paperwork and Onboarding & Training. Accounts are provisioned after payment, not publicly registered. Recorded D-021/D-022 and U-08/U-09. No EHR belongs in this portal.

**Implemented locally:** [[Client Portal]] dashboard; per-client paperwork with Not Started / Started / Completed; explicit review, consent/password confirmation and demo signing; encrypted document/name fields and fixed version/timestamp/digests; downloadable demo record; three labeled generic training guides with personal progress; future-video placeholder; encrypted contact persistence and administrator inbox. Added provisioning and assisted-reset tasks with hidden password entry. No real user account, public password, credential email, payment, institutional submission or patient data was introduced.

**Checks:** 20 Rails tests / 158 assertions, four frontend helper tests, frontend typecheck/lint/build, Rails lint, Brakeman and dependency audits passed. Native HTTP smoke checks passed through the frontend and Rails for authentication, CSRF/origin checks, protected content, personal training, contact/inbox and logout/cookie replay. Temporary synthetic smoke records were removed. No browser visual/interaction QA, container build, independent security review or signature/legal/compliance certification.

**Hosting:** the revised owner-only frontend publication succeeded at [APPly private preview](https://apply-clinic-launch.wdmcdonough.chatgpt.site), with the hosted canonical origin configured. This also corrects the earlier initial-publication entry's in-progress state. Rails was built/tested locally only; Sites cannot run Ruby. Contact/login online require the separate host/configuration in T-20. Actual signing is server-disabled for non-demo documents. No accounts, paperwork records or contact inquiries remain in the development database; only three labeled sample guides remain.

**Vault handling:** reviewed the original 21 notes and five JSON files, then read the concurrently added [[Data Modeling]] and all modified files/configuration before continuing (22 notes and five JSON files before this new portal note). Preserved the separate clinical-model work, existing edits and Obsidian settings. Source materials remain unavailable; no clinical-model implementation inferred.

**Final vault checks:** 23 Markdown notes and five JSON configurations; all 205 wiki links resolved and all notes were reachable from Home. Git whitespace checks passed. Existing user/parallel work and Obsidian configuration were preserved.

**Next:** connect an approved Rails host, provision the first administrator through the interactive task, and ingest reviewed packet/training material. PDF generation, institutional delivery and feedback are explicitly future work in T-21.

## 2026-08-30 — Multi-clinic data modeling proposal documented

**Requested and delivered:** founder asked for backend data modeling in the vault. Added [[Data Modeling]] with PostgreSQL table catalogs and core DDL examples, composite tenant/patient constraints, role and resource access rules, RLS/helper boundaries, emergency/support access, read/change/export auditing, independent failure evidence, retention/recovery requirements, and synthetic acceptance scenarios.

**Scope:** design proposal only; a schema cannot certify HIPAA compliance. SharePoint remains the starter direction, hosting/architecture is unapproved, and actual workflows and external MD/governance/security materials remain unreviewed. L-05 and professional/operational gates are unchanged. No patient data, database, credentials, integration, deployment, or automation was introduced; illustrative SQL was not executed.

**Evidence and vault handling:** personally reviewed all 21 existing Markdown notes and 5 JSON configurations before changes; the 169-link baseline had no missing targets and every note was reachable from Home. Rechecked official sources in [[Source Register]] and added U-07 for the request. Linked the proposal from [[SharePoint and EMR]] and recorded T-18 delivery in [[Roadmap and Tasks]] while leaving T-13 open. Existing changes and Obsidian settings were preserved, including a concurrent workspace-state update that was re-read.

**Validation:** all 22 notes passed frontmatter/code-fence/whitespace checks; all 187 wiki links resolved, including headings/aliases, and every note remained reachable from Home. Source IDs resolved, JSON parsed, and touched tracked files passed the Git whitespace check. Inspected changes against the session's pre-edit snapshot; no unrelated note content was overwritten. These documentation checks do not validate the SQL or security controls.

**Next:** use the proposal during T-13 requirements work; reconcile against an authorized synthetic workflow and obtain implementation/security/clinical review before any patient-system use. No owner, deadline, or deployment commitment was invented.

## 2026-08-30 — Consultancy website bootstrapped

**Direction:** founder asked to bootstrap the site and move forward, explicitly deferring further business-decision questions. Recorded D-019 for the latest ownership/developer/inventory-pricing answers and D-020 for website-first implementation. Historical answers remain contextualized rather than silently replaced.

**Implemented:** [[Website MVP]] in the separate `site/` project: responsive consultancy landing page, service/process sections, founder experience, FAQs, local clinic-brief generator and text download, favicon, and generated social card. The brief collects no patient data or identifiers and sends no inquiry. No software product, billing system, released mentorship library, or applicant portal was built.

**Checks:** production build, TypeScript, application-code lint, and four unit tests passed; final dependency audit reported zero known vulnerabilities. HTTP 200 and streamed social metadata checked locally. No browser interaction/visual QA or clinical/security assessment performed. Private publication is in progress; a working deployed URL is not yet claimed.

**Vault review and changes:** after a new root AGENTS.md appeared, personally reviewed all 19 existing Markdown notes and 5 JSON configurations before continuing. Reconciled latest founder answers, deferred the business-question queue, added the missing [[Knowledge Bank and Mentorship]] concept note, and added [[Website MVP]]. All 21 notes were reachable from Home and all 166 wiki links resolved at the first post-update check; later additions require final recheck. Obsidian configuration and the user-created AGENTS.md were preserved. External MD/governance originals remain unavailable and unreviewed.

**Next:** finish private publication and its canonical-origin configuration; record the review link. T-17 tracks future real inquiry routing once its destination and flow are supplied. Public release, legal/brand/copy approval, and patient-data work remain separate.

## 2026-08-30 — Execution ownership and commercial model clarified

**Founder answers recorded:** both NPs and PAs, Sherman/North Texas; consultancy executes the launch with minimal provider input; Kevin supplies physician collaboration/delegation support, help with physician arrangements, and mentorship; his attorney helped his setup process.

**Commercial and organizational direction:** launch package plus ongoing support; separate software implementation fee plus recurring transactional-value fees; consultancy formed and software entity not yet formed, with different owners. Founder reports 49% consultancy interest and sole direction-setting responsibility, and is bringing on a senior-developer friend. Remaining ownership, governance documents, developer arrangement, exact software ownership, transaction definition, and fee amounts were not supplied and were not inferred.

**Pipeline:** founder is unsure how many first applicants are available. Kept that distinct from the earlier report of strong local demand.

**Changed:** aligned the dashboard, foundation, offer, packet, business model, entity boundary, MD role, diligence, software notes, discovery, source log, decisions, risks, working conventions, and tasks. Recorded round 2 answers and prepared focused round 3 questions. No new note was needed.

**Verification:** all 19 notes passed structural checks, all 144 internal wiki links resolved, and all notes remain reachable from Home. No Obsidian settings changed.

**Next:** define transaction-pricing metric, support/cost coverage, governance/developer arrangements, and Kevin's service capacity; ingest existing materials when available. Added T-14 and T-15 for the pricing metric and physician/mentorship operating plan. No product build, filing, outreach, or other external action was taken.

## 2026-08-30 — Offer and entity boundary clarified

**Founder answers recorded:** cash-pay primary-care / concierge-adjacent APP clinics; MD cofounder and two software engineers; end-to-end consultancy through readiness to see the first patient; existing documented MD setup process to become an applicant packet; starter SharePoint EHR; substantial local demand reported. Botox/aesthetics was noted as an adjacent example, not added to initial scope.

**Additional direction:** eventual bespoke replacement for SharePoint, with EC2/S3 only candidate technologies; EHR and inventory-management offering in a separate entity; no deadline pressure; substantial existing materials expected to become accessible on 2026-08-31 morning.

**Public reference reviewed:** browser skill used to read the rendered [clinic homepage](https://stacksadultmedicine.com/) and [provider profile](https://stacksadultmedicine.com/provider) after web-reader retrieval failed. The site identifies Kevin Stacks, MD, PLLC, general adult medicine in Sherman. No internal diligence, legal clearance, software controls, pricing, patient records, or operating metrics were inferred from the website.

**Changed:** updated current-state strategy, offer, economics, pilot, diligence, product, questions, sources, risks, decisions, and task notes. Added [[Clinic Launch Packet]] and [[Entity and Product Boundary]]. Preserved the original initialization record and founder premise while documenting refinements in [[Decisions]].

**Verification:** 19 Markdown notes passed structural checks; all 140 internal wiki links resolved, including heading references; every note is reachable from Home. Existing Obsidian settings were left unchanged.

**Next:** resolve focused business/scope questions; index the existing documentation when the founder can provide access; capture concrete local prospects and a synthetic SharePoint demonstration. Material ingestion remains awaiting input, not completed.

**Boundaries:** no patient or applicant data collected; no external forms submitted; no clinic website edited; no cloud/product build, entity formation, outreach, professional engagement, or reminder/automation created.

## 2026-08-30 — Vault initialized

**Context received:** the founder described a consultancy + SaaS company for APPs starting Texas clinics, an MD collaborator currently opening a clinic and gathering diligence, and a SharePoint patient-management workflow reported as HIPAA-compliant.

**Completed:** located the existing, empty APPlyVault; created a linked dashboard plus foundation, customer/offer, economics, questions, MD pilot, customer research, Texas diligence, SharePoint/EMR, sources, roadmap/tasks, decisions, risk, working-convention, and reusable-template notes.

**Verification:** all 17 Markdown notes passed structural checks; all 106 internal wiki links resolved, including the referenced heading. No existing Obsidian settings were changed.

**Research:** reviewed preliminary official Texas, HHS, and Microsoft sources listed in [[Source Register]]. BON scope material was discovered but could not be fully retrieved; that review remains open. No case-specific legal assessment or patient-system review was performed.

**Distinctions established in the notes:** founder-reported context versus independent evidence; MD clinic versus our company versus customer clinics; administrative software versus patient-management software; proposed milestones versus commitments.

**Still unresolved:** first segment/locality/offer, clinic profile, founder and MD roles, commercial rights, budget/capacity, actual workflow evidence, professional review, pricing, and patient-data boundary. No paying customers or interviews have been documented; this is not a claim that none exist.

**Next:** discuss round 1 of [[Foundation Questions]], incorporate answers, and confirm owners and evidence-gathering priorities. No outreach, professional engagement, clinic-system access, production change, or automation occurred.

## Entry format

- Date and short title:
- Completed / changed, with links:
- Evidence learned, including contrary evidence:
- Explicit decisions and who made them:
- Blockers / open questions:
- Next action, owner, agreed date:
