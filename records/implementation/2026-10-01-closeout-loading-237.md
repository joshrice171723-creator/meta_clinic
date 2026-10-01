# Internal Muse #237: closeout loading repair

The four daily closeout report siblings used the same selected-date key. In a mounted synthetic Operations fixture this duplicated report rows, repeated requests and left detached rows showing Loading after successful responses. The same keys are present in inspected live-source 0cad7038e4bf21b6ae2c2189fc7f6c35944816bb. No live retest is claimed.

Each sibling now has a report-specific key including its date. Date changes still remount the report and reset its state, while distinct reports keep independent identities. This changes only React reconciliation; permissions, requests, report definitions and accounting are unchanged.

Focused before/after evidence:

- The new success regression failed before repair with `expected 2 to be 1` plus duplicate-key warnings.
- All three new browser regressions pass on the minimal repaired source: successful responses leave one completed row per report; failures leave explicit errors; changing dates during interrupted requests preserves only the new date, including after releasing old responses.
- The inventory-enabled fixture covers all four siblings, including stock movements.
- Three existing bulk-import tests and nine existing Operations date tests passed in the combined focused run. The closeout error assertion initially used an incorrect exact text selector; it was corrected to assert the rendered error alert and its message, and all three closeout cases passed afterward.
- TypeScript passed. New frontend-test formatting and diff whitespace checks passed. Full-file formatter warnings predate the repair; unrelated formatter edits were removed rather than included in this fix.
- Three isolated Rails request cases / 35 assertions passed for the three financial reports' empty envelopes, permission denials and invalid dates. The initial diagnostic expectations incorrectly used 422 instead of the actual 400 contract and UTC instead of Etc/UTC; original failures were preserved. The corrected test passes and its scoped RuboCop check reports one file, no offenses.

The Rails cases use ordinary synthetic test fixtures and existing action codes in a uniquely named disposable loopback PostgreSQL database. Its container and generated temporary password file were removed. No shared/live data, account authority or static permission definitions changed.

This is focused local repair evidence, not a full suite, live acceptance or release. The bulk preview selector correction is a separate preceding test-only commit a09be57570b793bb3f5cbf58ccd9971672431eff. Release branch/main remain untouched. Canonical release and Office-owner handoff gates remain in force.
