# APPly all-work synchronization - 2026-09-06

Joshua explicitly requested pull, merge and push everything, including previously excluded inventory. This supersedes the inventory exclusion in the earlier non-inventory sync record. Coordination: sc-146.

- Preserved and committed the remaining local schema, inventory login/CSS and Connect test changes. Updated the old Connect fixture for the implemented Accounts v2 API.
- Merged the inventory task's stable `8d76633` checkpoint through M10 scanning. Its owner paused writes and retained the branch/worktree. M3f delivery-intake pagination and narrow create/configure reads remain future work; see the M10 record.
- Resolved the dev seed clock overlap using the transaction timestamp. Regenerated the combined SQL schema from all migrations in new scratch database `apply_sc146_all_fresh_20260906`, then regenerated the actual route contract. No existing application database was reset.
- Corrected the scanner's nullable pending target, updated two typed inventory fixtures, and applied formatting only to touched inventory files. No deployment, force push or branch deletion.
- Earlier remote portal/scribe branches have no missing compatible implementation: portal is already integrated and scribe is superseded by later safety changes. Their refs remain preserved.

Verification:

- Fresh migrations, frontend production build and Rails eager loading passed.
- Stripe Connect, membership and architecture tests: 16 runs, 554 assertions, all passed.
- Combined API check: 52 runs, 736 assertions, 1 failure and 14 errors. Inventory receiving/activity/catalog fixtures use an uncreated Shelf under the new location rules; cart expects HTTP 409 where eligibility now returns 422. These remain unresolved QA work.
- Frontend subscription/inventory tests: 24 passed, 3 failed inventory source-string assertions. Membership tests passed.
- Repository formatting check reported 61 files before focused formatting; broad formatting was intentionally not performed. Ruby lint's three findings were corrected as whitespace-only changes.
- Diff whitespace check and credential-shaped scans of the publication diff and unpublished history passed.
- Backend/PostgreSQL verification harnesses were started against their own generated scratch databases; final results are recorded in the synchronization Story. Full product QA, browser acceptance and actual Stripe renewal/payment acceptance remain open.

The first scratch schema attempt (`apply_sc146_all_sync_20260906`) encountered unresolved merge markers before the successful clean migration run. Both explicitly named scratch databases are separate from application data. This synchronization is source publication, not feature or release acceptance.
