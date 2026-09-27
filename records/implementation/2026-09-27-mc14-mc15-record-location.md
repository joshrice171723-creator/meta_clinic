# MC-14/15 record location from Operations — 2026-09-27

## Scoped source outcomes

1. **MC-14 invoice report:** the selected clinic-local creation date now returns up to 25 invoice IDs, patient IDs, currency and current status, alongside the existing aggregate. The Operations link opens that patient's billing workspace.
2. **MC-14 payment report:** the selected clinic-local recorded date now returns up to 25 payment IDs, patient IDs, currency and exact amount, alongside its existing aggregate.
3. **MC-14 refund report:** the same date now returns up to 25 refund IDs and linked payment IDs with patient, currency and exact amount. Refunds can belong to payments from another day.
4. **MC-15 collection inventory:** current `needs_reconciliation` intents now return up to 25 intent, patient and invoice IDs, linked to patient billing. Other current states retain counts only.
5. **MC-15 prescription inventory:** the latest attempt per medication-request revision now returns up to 25 unknown-outcome attempt IDs, patient IDs and revision IDs, linked to the patient chart. Earlier unknown attempts and superseded revisions remain distinct from unresolved current work.

Each query uses the current practice and the existing report authorization before selecting records. The interface labels each limit when more than 25 match. The links identify the owning workspace and record ID; they do not auto-select the exact record or authorize a retry.

## Checks and limits

Ruby syntax passed for four changed queries; changed-file RuboCop inspected four files with no offenses. Web TypeScript and changed-file Prettier passed. No tests ran per the current repository instruction. The local web/API listeners belong to this checkout. An authorized development sign-in for the synthetic “Review operations” lesson clinic redirected to Clinic Setup because its Guided Clinic location has no saved specialty, so populated report/reload/download and denied-role browser behavior were not proved. No clinic data was changed in that attempt.

Next proof: use a deliberately owned, setup-complete synthetic clinic to inspect populated records, exact record navigation, permitted and denied readers, reload, CSV values, and reconciliation against owning ledgers. No production, external processor, pharmacy-network or clinical acceptance follows from these source checks.
