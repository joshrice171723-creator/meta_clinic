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
