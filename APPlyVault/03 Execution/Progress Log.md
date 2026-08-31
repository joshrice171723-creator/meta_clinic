---
type: progress-log
status: active
updated: 2026-08-30
---
# Progress Log

Home: [[00 Home]] · Tasks: [[Roadmap and Tasks]] · Decisions: [[Decisions]]

Newest entry first. Record actual changes and results, not projected achievements.

## 2026-08-30 — Broad pharmacy configurability adopted

**Direction:** founder asked to assume clinics will want the option of any pharmacy setup and build from that broad scope. Recorded D-028/U-16. One operating-model selection is no longer a prerequisite to shared-foundation design; actual clinic configuration, professional authority and real-use approval remain separate.

**Delivered:** expanded [[Pharmacy Inventory Data Requirements]] into a shared inventory core with composable administration/supply/dispensing, container/cold-chain, controlled-drug, tracing, compounding, stock-ownership and transfer capabilities. Added logical record families in [[Data Modeling]] and a dependency/acceptance sequence in [[Roadmap and Tasks#Pharmacy capability implementation sequence]]. Updated current product summaries and the stale inventory-scope statement in [[SharePoint and EMR]]. T-33 records this planning delivery; T-13 remains in progress and T-34 is the proposed next synthetic foundation build. R-13/A-07 distinguish optional product coverage from authority and validated demand.

**Review and scope:** personally reviewed all 26 Markdown notes and five JSON configurations, including templates and hidden files, with hashes tracked and changed portions re-read during the task. The pre-edit check had 291 resolving wiki links and no unreachable notes. Preserved the concurrent D-027/T-20 EC2 work and its source references. External MD/governance/SharePoint originals remain unavailable; no new external legal-source review or professional clearance was performed. Current laws and specialist workflows retain the limitations in the DD.

**Limits and next work:** this update changes planning records, not application code, permissions or production guards. No real inventory/patient records, purchases, submissions, cloud actions, outreach or automation. The first proposed build increment is configuration, typed units, receiving, counts and overlapping holds; its synthetic acceptance cases do not require patient examples. Rates/billing mechanics, responsible human reviewers and dates remain unassigned where previously unknown.

**Validation:** all 26 notes have valid required frontmatter and balanced fences; five JSON files parse; all 311 wiki links/heading targets resolve and every note remains reachable from Home. Source, evidence, task, decision and risk/assumption IDs are unique. Whitespace and incremental documentation diffs were checked; concurrent EC2 documentation refinements were reviewed and preserved. No application tests or external-source checks were rerun for this planning update.

## 2026-08-30 — EC2 staging package prepared and locally verified

**Request and delivery:** D-027/U-15 select EC2 for the current app and database. Added `site/deploy/ec2/` with an unexecuted-plan helper, CloudFormation, scoped instance IAM, immutable private ECR images, four generated managed secrets, encrypted root/data volumes, no inbound ports, SSM-only administration/private TLS, release tooling and recovery/teardown instructions. Kept the existing SQLite adapter for one-process synthetic staging; no PostgreSQL implementation, bucket integration, public access, clinic release or real data. Cost proposal is about $25/month before snapshots/extra usage/tax, not an approved budget or cap. T-20 remains awaiting input; M1 is unpassed.

**Defect found and fixed:** a production container could serve health/login pages but failed an encrypted write because the existing initializer set encryption options after eager loading. Moved the same configuration/derivation before eager loading and added writable container temporary storage. No encryption keys were rotated, local data opened, or prior records rewritten. This was a deployment-readiness fix; unrelated pharmacy/navigation changes were preserved.

**Checks:** AWS `validate-template` accepted the template; cfn-lint and ShellCheck passed. The current Rails suite passes 56 tests / 653 assertions and RuboCop passes across 79 files; Brakeman reports zero errors and warnings. The Linux amd64 image builds. The disposable container verifier passes certificate-verified TLS, bad-host denial, protected routes, production clinic denial and a valid-CSRF demo-login denial even with its enable flag set; it then verifies encrypted content, container recreation, SQLite integrity and decryption after restore to separate storage. Temporary test containers, synthetic volumes and test keys were removed. These are local tests, not EC2/SSM/EBS recovery evidence or browser QA.

**AWS access and limits:** the user renewed the CLI login; identity checks showed root and the local default region is `us-east-1`. Initially requested a non-root individual profile; the user then expressly instructed use of root until further notice, superseding that prerequisite for this task. Created and reviewed `apply-synthetic-staging` change set `awscli-cloudformation-package-deploy-1788140042`: `CREATE_COMPLETE` / execution `AVAILABLE`, 18 additions and no changes/removals to existing infrastructure. Its empty review stack exists, but the change set is unexecuted: no EC2/EBS/ECR/secrets provisioned, no IAM policy or existing bucket changed, and no image pushed or app deployed. Actual host bootstrap, certificate trust, hosted account flows, cloud restore/rollback, operating ownership, cost/region acceptance and M0 criteria remain open. L-05 and other professional/real-data gates are unchanged.

**Review:** personally reviewed all initial 24 Markdown notes and five JSON configurations, then both added research notes and all concurrent changed content: 26 notes plus five JSON files. Missing MD/governance/SharePoint originals remain unreviewed; they do not block synthetic deployment preparation. Current notes, source/decision records, Home and T-20 now distinguish prepared infrastructure from a provisioned host. Historical Sites metadata/access and Obsidian settings were preserved. S-47–S-50 record source scope and the minor public-page/Pricing-API rate discrepancy.

**Final checks:** re-read and preserved concurrent broad-pharmacy planning changes. All 26 notes and five JSON configurations validate; 311 wiki links/headings resolve, every note is reachable from Home, and canonical task/decision/source IDs are unique. Python/shell syntax, the updated root-override helper's ShellCheck run, CloudFormation linting and Git whitespace checks pass. The AWS stack remains `REVIEW_IN_PROGRESS` with its change set available for execution, not a running server.

**Next:** accept the proposed `us-east-1` region and roughly $25/month baseline, execute the reviewed change set with the authorized root session, then perform actual hosted/recovery checks. No recurring automation or notification was created.

## 2026-08-30 — Pharmacy background integrated into Rails EHR

**Request and delivery:** pulled `origin main` successfully (fast-forward `2959aa2` → `f0421ae`), preserving existing local navigation/demo edits. Reused `pharmacy-inventory/` to add [[Clinic Workspace#Pharmacy background integration]] at `/clinic/pharmacy`, accessible through EHR navigation. Catalog/NDC import, fictional lots with expiry/location, whole-package receipts and corrections/write-offs, append-only movement/status history and derived attention queues persist in Rails. Existing patient drafts, office supplies and employees remain separate.

**Source adaptation and cleanup:** retained the pharmacy specification, database design and original PostgreSQL schema; removed its standalone Vite/React UI, browser helper and npm build files after porting relevant logic to Rails. Fixed the package lookup field and expanded package options rather than always taking the first package. Replaced the Rails Ruby schema dump with `db/structure.sql` so fresh databases preserve stock-range and append-only triggers. No library was added; obsolete pharmacy source remains recoverable in `f0421ae`.

**Checks actually performed:** 56 Rails tests / 653 assertions pass on a disposable synthetic database prepared from the SQL schema, including the existing 41-test baseline. New checks cover receipt rollback/retry, underflow, composite clinic/actor references, immutable history, held/expired stock, module/production denial, package matching and tampered/expired import references. RuboCop passes across 79 files; Brakeman reports zero warnings; eager loading passes. Live public FDA name/exact-package requests pass. Native local HTTP verifies explicit demo login, optional fictional examples, FDA lookup/import, receipt/retry, filtering and logout. Restarted the loopback Rails server to load the new service directory; new isolated synthetic walkthroughs remain locally, with earlier records preserved.

**Review and limits:** personally reviewed all 24 original Markdown notes and 5 JSON configurations, then reviewed two concurrent pharmacy-research additions and every changed portion of the notes/configuration (26 notes + 5 JSON files). Preserved those additions and allocated non-conflicting source/task references. External MD, governance, SharePoint and security originals remain unavailable and unreviewed. No real inventory, patients, prescriptions, dispensing, procurement, deployment or AWS/SharePoint access. No browser visual/accessibility QA, container build, independent security assessment or clinical acceptance. Sites guidance preserves the established Rails-only/local direction and historical hosted preview; no publishing was attempted.

**Next:** review the local pharmacy experience with wholly synthetic stock; separately scope full-spec features and professional/operational release work. T-32 records bounded delivery; T-20/T-22 and L-05/E2/E3 remain open.

**Final checks:** default test storage and a second fresh disposable SQL-schema database both pass 56 tests / 653 assertions. All 26 notes and five JSON files validate; all 290 wiki links/headings resolve, all notes remain reachable from Home, and task/source IDs are unique. Git whitespace checks pass. The original pharmacy PostgreSQL schema and 13 earlier application files with local edits match the pre-implementation hashes; incremental navigation/README/route changes preserve the prior work. Concurrent research, Obsidian UI state and unrelated EC2 preparation files were left intact.

## 2026-08-30 — Pharmacy inventory data-collection diligence

**Request and outcome:** founder clarified the data-collection DD request to prioritize pharmacy inventory. Added [[Pharmacy Inventory Data Requirements]] with proposed product/package/unit, lot/container, receiving, location, movement, hold, count, purchasing and replenishment fields; conditional vaccine, controlled-drug, tracing, dispensing and disposal records; and a narrow comparison with the in-progress pharmacy source. Kept purchases, physical stock and protected patient-use links distinct, preserving ordered-inventory-value pricing without inventing its mechanics.

**Evidence:** reviewed relevant official TSBP, FDA, DEA, CDC and EPA material; added S-24–S-38 and U-13 to [[Source Register]]. Notable findings include the physician-office/Class D distinction, setting-specific inventory schedules, FDA's 2026-08-06 small-dispenser extension through 2027-11-27, and product-specific container dating. Recommendations are not universal legal requirements. Current eCFR/chapter 158 and live TAC/amendment retrieval gaps are disclosed; actual clinic classification, formulary, supplier evidence and professional findings remain unreviewed.

**Scope and checks:** personally reviewed all 24 existing Markdown notes and five JSON configurations, then re-inventoried and verified unchanged vault hashes before writing. All 257 baseline wiki links resolved and every note was reachable from Home. Updated the model/diligence links and canonical T-13/T-31 records; no new business decision or release approval. Read only the pharmacy migration/models/catalog service for the bounded implementation comparison; no runtime tests, code changes, live data, purchases, submissions, outreach or deployment. Existing concurrent application work and Obsidian configuration were preserved.

**Next:** validate the proposed fields against an authorized synthetic receiving-to-use walkthrough and the intended medication operating model under T-13/L-02/L-06. T-14 pricing mechanics and L-05 remain open. No owner commitment, due date or automation was created for that follow-up.

**Final review:** personally reviewed the concurrent pricing note and changed portions of existing notes/configuration, including the separately delivered Rails pharmacy work. Coverage now includes 26 Markdown notes and five JSON files. Preserved concurrent source/task assignments and application changes; validated frontmatter, JSON, wiki-link targets/headings, Home reachability, source/task/evidence ID uniqueness and incremental documentation diffs. This research did not rerun or independently certify the other task's implementation checks.

## 2026-08-30 — Inventory price-comparison source shortlist

**Delivered:** [[Inventory Price Comparison Sources]] identifies six supplier/manufacturer source families plus CMS NADAC and CDC vaccine references, with formats, price/access types, dates and retrieval limits. Added S-39–S-46 to [[Source Register]]. Proposed identifier, packaging and delivered-cost fields; no application schema, supplier selection, procurement or billing change.

**Evidence and limits:** inspected DiaMedical's Spring 2026 PDF sample prices and terms, Bound Tree's public unit/box/case prices, all four pages of CDC's adult vaccine PDF, and NADAC metadata, sample CSV structure and both definition pages. Dynarex's retrieved catalog contains 2019 notices and is only a historical product reference. McKesson/account pricing, current ADC variant prices and full Medline retrieval remain unavailable; these gaps are explicit. No whole-catalog or full-CSV validation, negotiated-price comparison or savings claim.

**Review and scope:** personally reviewed all 24 existing Markdown notes and five JSON configurations, with hashes tracked and rechecked before editing; all 257 baseline wiki links resolved and all notes were reachable from Home. External MD/governance/SharePoint originals remain unavailable and were not needed for this public-source shortlist. Existing application/vault work and Obsidian settings preserved. No patient data, private supplier documents, account access, outreach, purchase, import, deployment or automation.

**Next:** use a bounded non-sensitive purchasing basket and authorized dated quotes to compare exact items under T-13. Existing task statuses, T-14 billing decisions and professional/real-data gates remain unchanged.

**Concurrent review and final validation:** reviewed the newly added pharmacy-requirements note and all changed portions of the existing notes/configuration before continuing. Preserved that research and reassigned this shortlist to S-39–S-46 to avoid colliding source IDs. Frontmatter, JSON, wiki links/headings, source IDs and incremental diffs were checked; no unrelated content was intentionally changed.

## 2026-08-30 — Assigned Test Clinic and explicit login navigation

**Direction/delivery:** D-026/U-12 confirm one developer-assigned clinic per login, no selector/create action, and a generic Test Clinic. Removed the clinic-create route/UI. Explicit local demo login now provisions an isolated Test Clinic with fictional sample rows. A development-only task assigned clinics to five existing eligible generated demo accounts without changing any existing membership or session; repeating it assigned zero. Normal accounts remain developer-provisioned and cannot grant themselves access.

**Login behavior:** inspection found My launch was using an existing session, not creating one. Added an explicit development-session notice and Sign out control, and kept the login form accessible while signed in. Clinic navigation now returns straight to `/clinic` after a successful explicit login; navigation creates no account, membership or session. Invalid login preserves the intended destination, and submitted redirect/clinic parameters cannot select another clinic.

**Verification:** 41 Rails tests / 508 assertions pass; RuboCop passes across 68 files; Brakeman reports zero warnings; Zeitwerk eager-load check passes. Local native HTTP verified signed-out protection → explicit demo login → assigned Test Clinic, removed creation step, accessible login page and logout. Test accounts/records are wholly synthetic and retained locally. Browser visual/accessibility QA was not performed.

**Scope/review:** personally reviewed all 24 Markdown notes and 5 JSON configurations before changes. Updated current notes and the superseded multi-membership proposal without rewriting its historical SQL. Missing MD/governance/SharePoint originals do not block this navigation change. Preserved the existing Rails design under Sites guidance; no deployment, new dependency, cloud access, PHI or production clinic release. T-30 records bounded completion; existing release gates remain open.

## 2026-08-30 — Rails migration and two front-facing workspaces

**Direction and delivery:** D-024/D-025 record the founder's requested Rails-only implementation and final clarification: build selling/onboarding and clinic operations in the same Rails website, with front-facing separation rather than an external-site link. Rails now renders the complete local site with native ERB forms/CSS. Preserved the green/cream selling and launch experience, contact/admin inbox, provisioned login, demo paperwork/signing/receipt and training. Added a distinct clinic sidebar/dashboard and an explicit workspace switch. Corrected the unsupported opening-status copy without altering the MD evidence record.

**Clinic slice:** [[Clinic Workspace]] provides fictional patient creation/directory and encrypted append-only draft entries, office inventory with atomic/nonnegative reason-attributed adjustments and retry deduplication, and a fictional employee directory with active/inactive status. Clinic membership and section capabilities are separate from consultancy administration. Directory status is not login access; draft entries are not signed clinical notes; stock adjustments place no orders. The full EHR and production clinical architecture remain unimplemented. All clinic routes are disabled in production. SharePoint, S3 and live systems were not accessed.

**Migration and recovery:** stopped the JavaScript development server and old separate Rails port; one loopback Rails server now serves localhost:3000. Removed 100 obsolete JavaScript frontend/config/test files after native workflow checks; they remain recoverable from commit 2a25f48. Preserved existing local data, ignored dependency/build caches, original social-card assets, Git history and historical Sites metadata. The old hosted Sites preview was not changed or removed; this work was not deployed. No new paid service, dependency, AWS resource or secret was introduced. AWS-only staging guidance is in site/deploy/aws.md; region, budget, domain/operator and recovery checks remain open.

**Verification:** 37 Rails tests / 422 assertions pass, including a fresh disposable database initialized through db:prepare. A test-seed guard and empty materials fixture remove the prior seed-dependent failures. Ruby lint passes on 67 files; Brakeman reports zero warnings and the dependency audit reports no known vulnerabilities. Native HTTP checks pass for assets, demo login, paperwork review/signing/receipt, training, explicit demo-clinic setup, fictional patient/draft creation, clinic screens and logout. HTTP testing left only an isolated fictional demo walkthrough in local storage. No browser visual/accessibility QA, container build, cloud deployment, independent security review or clinical acceptance was performed.

**Documentation and review:** reviewed all 23 existing Markdown notes and five JSON configurations before changes, then preserved/reviewed the user's concurrent Obsidian workspace-state update. Added the clinic note and updated Home, boundaries, source/decision records, portal/website state and canonical tasks. T-28/T-29 record bounded local delivery, not production readiness; M0/T-22 retains CI/browser acceptance, T-20 retains cloud hosting, and confidential/clinical gates remain open. External packet/governance/SharePoint originals are still unavailable and unreviewed.

**Next:** review the two local experiences with fictional data; separately scope browser QA and fuller clinical/employee workflows. Confirm exact US East region and staging budget/operator before any AWS creation. Real applicant documents, actual clinical data, clinical releases and shared production boundaries need their existing approvals.

**Final checks:** production-mode eager loading passed with temporary in-memory configuration and generated test secrets, after quoting the configurable database path safely in YAML. No deployment or persistent production database was created. All 24 Markdown notes have valid required frontmatter/balanced fences; five JSON files parse; all 253 wiki links and heading targets resolve, with all notes reachable from Home and unique task/decision IDs. Git whitespace checks pass. Obsidian's concurrent UI-state edits were preserved.

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
