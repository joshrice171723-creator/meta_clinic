# Plan dashboard

Run from this repository with Python 3.11 or newer:

    python tools/tracker/server.py

Open http://127.0.0.1:8766/ . The old Atlas route redirects here while this server runs. The original dated HTML remains unchanged at `/archive`.

The dashboard discovers saved assignments under `docs/development/clinic-workflow-plans` and local development/review documents linked by the canonical implementation tracker. It is read-only, binds only to localhost, and serves only its assets and discovered Markdown documents. It does not publish, mutate plans, trigger QA agents, or claim current clinical acceptance.

Choose a plan, then Needs building, Needs QA, Blocked, or Needs review. Open plan shows readable source tables; View QA context and View blocker context jump to the source section. Search matches plan names and recorded work. Source details includes live Git history and unresolved document links.

Categories are conservative extraction of explicit recorded states. Old or ambiguous evidence is deliberately left in Needs review. Counts represent entries, not deduplicated features or a completion percentage. Document commit time, dated sections, and server read time are separate. Refresh rereads disk; GitHub changes require updating this checkout. This is not a live-agent activity monitor.

## Verification

    python -m unittest discover -s tools/tracker -p test_tracker.py
    node --check tools/tracker/app.js

The new view supersedes the old activity bubbles, percentage averages, hardcoded five-source list, giant titles, relationship-color matrix and dense source-path tables. Historic evidence is preserved rather than rewritten as verified work.
