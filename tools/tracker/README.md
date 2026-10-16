# Plan dashboard

Run from this repository with Python 3.11 or newer:

    python tools/tracker/server.py

Open http://127.0.0.1:8766/ . The old Atlas route redirects here while this server runs. The original dated HTML remains unchanged at `/archive`.

The dashboard discovers saved assignments under `docs/development/clinic-workflow-plans` and local development/review documents linked by the canonical implementation tracker. It is read-only, binds only to localhost, and serves only its assets and discovered Markdown documents. It does not publish, mutate plans, trigger QA agents, or claim current clinical acceptance.

Start with the overview: three separate recorded percentage averages and sixteen expandable milestone charts. Core averages use MC-01–15; optional insurance MC-16 stays visible but is excluded. Open a milestone for remaining work, next steps, evidence, and plans that reference its ID. Expand Plans & remaining work below to drill down. Choose a plan, then Needs building, Needs QA, Blocked, or Needs review. Open plan shows readable source tables; View QA context and View blocker context jump to the source section. Search matches plan names and recorded work. Source details includes live Git history and unresolved document links.

Categories are conservative extraction of explicit recorded states. Old or ambiguous evidence is deliberately left in Needs review. Counts represent entries, not deduplicated features or a completion percentage. Document commit time, dated sections, and server read time are separate. Refresh rereads disk; GitHub changes require updating this checkout. This is not a live-agent activity monitor.

## Verification

    python -m unittest discover -s tools/tracker -p test_tracker.py
    node --check tools/tracker/app.js

The new view preserves the percentage-and-chart overview while replacing misleading live activity, the hardcoded five-source list, and dense source-path tables. Percentages come from the tracker and remain dated estimates, not new acceptance proof. Historic evidence is preserved rather than rewritten as verified work.

## One plan inventory

The relationship map and plan list render the same `plans` array. The current 37 discovered records resolve to 29 plans, five supporting documents and three shared reference guides. `SUPPORTING_DOCUMENTS` in server.py records explicit parent ownership: behavioral-health journey → behavioral-health feature plan; sandbox coverage → sandbox assignment; assistant workflow map → assistant checkpoint; patient-journey evidence → current patient journey; remaining-work review → full application review. Shared engineering, coding and Twilio guides are available under Shared reference documents, not counted as delivery plans.

Supporting work entries retain their source document links and are searchable beneath their parent. Old supporting-document selection URLs resolve to the parent. Unknown new documents remain visible as plans rather than silently disappearing; if a mapped parent is missing, its child remains visible too. Review new supporting-document ownership when adding it.

Milestone cells combine explicit MC identifiers (including ranges and slash lists) in each plan and its supporting records with the six preserved Atlas relationships. Hover a plan name for provenance. These are recorded references, not newly audited scope or completion. Plans with no references remain in both views marked Not mapped. No documents or historical evidence are deleted.

Verification for this change: 11 focused unit tests, JavaScript syntax check, and the local browser journey from the 29-row map into the Sandbox plan and its supporting coverage document. Broad clinic workflows and Muse execution were not run.
