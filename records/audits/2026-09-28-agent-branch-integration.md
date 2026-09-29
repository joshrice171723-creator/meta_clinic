# Agent branch integration for 0.1.9

The release review compared reachable agent commits with `origin/main` at `118f0d39`. Completed, independently useful changes were adapted into the release branch and checked against its current code. Active, uncommitted work in other checkouts was preserved.

| Source commit | Disposition | Reason |
| --- | --- | --- |
| `f2a26f30` | Ported selected slices | Supplier quote package and stock-unit snapshots, cash-estimate exact retry after catalog retirement, and detail rows in paged report CSVs were still absent. The full mixed commit was stale, so these changes were adapted to current source and reviewed individually. |
| `82103cc4` | Already integrated | Muse cloud-task accounting was on main; no duplicate change was needed. |
| `c1624087` | Already integrated or superseded | Its third QA batch was present in later main implementations. |
| `d2ae8f8d` | Superseded | Its tracker snapshot predates the current dated tracker evidence. |
| `d321c601` | Held for separate review | This adds privileged PR auto-merge and a root-run deployment coordinator. It changes ongoing release authority and is outside a one-time 0.1.9 publication. |

This review does not absorb dirty active worktrees. Their owners retain those changes for a separate handoff. The 70-finding source disposition is in `records/audits/2026-09-28-muse-qa-70-disposition.md`; Muse's browser retest remains a separate evidence step.
