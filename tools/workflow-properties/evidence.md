# Property-test execution evidence

Generated 2026-09-08T19:55:35.931Z. Base commit: 88af72e0567056707cc71a8ad37b752054d343e4. The working tree contains concurrent edits; these hashes identify reviewed source.

64 property results: 54 pass; 10 fail. 2880 generated cases in passing properties. Failed counts include shrunken counterexamples; consult raw JSON for seed/path.

| Failure | Classification | Minimal case | Seed / path |
|---|---|---|---|
| required creation fields visibly distinguish required from optional | Requested/proposed acceptance gap | ["Name"] | 20260908 / 0:0 |
| invoice catalog references must be positive | Frontend helper gap | [0] | 20260908 / 0:0 |
| recorded invoice line references must be positive | Frontend helper gap | [0] | 20260908 / 0:0 |
| observation model rejects missing numeric_value | Model validation gap | [""] | 20260908 / 0 |
| failed facility hours edit preserves facility name | Application invariant failure | [7] | 20260908 / 0:0 |
| patient creation requires an explicit sex response | Requested/proposed acceptance gap | [null] | 20260908 / 0:0 |
| patient creation rejects an explicitly provided impossible email | Requested/proposed acceptance gap | ["a"] | 20260908 / 0:0 |
| patient creation rejects an explicitly provided phone with no digits | Requested/proposed acceptance gap | ["a"] | 20260908 / 0:0 |
| failed patient edit does not partially rename the patient | Application invariant failure | [1] | 20260908 / 0:0 |
| partial patient edit preserves omitted demographics | Application invariant failure | [1] | 20260908 / 0:0 |

## Harness recovery and limits

Initial migration-backed attempt timed out during a repeated heavy fixture. A later runner/integration attempt exposed a nested Rails execution-context harness error. These are not application findings. The corrected harness uses a lean authenticated fixture, supported runner --skip-executor, explicit execution-context boundaries and a nonjoinable rollback transaction so application savepoints retain their normal rollback behavior. Payment fixture counting was corrected to query the actual PaymentEvent model. Affected persistence properties were rerun; unaffected model/frontend results were retained.

The scratch schema is loaded from structure.sql, not a migration test. No shared development/test database was reset. The wrapper validates its generated database name before dropping it. Browser/provider end-to-end flows, every create/edit/delete branch, and the entire 100-workflow inventory are not covered by these properties. See coverage.md for each workflow.

Final cleanup verified: a loopback PostgreSQL query of pg_database for names matching apply_properties_% returned no rows after the last pass. The exact initial interrupted-run scratch database was also removed. npm audit reported zero vulnerabilities; Ruby and Node syntax checks and the scoped git diff whitespace check passed. Coverage is partial for 36 of the 100 workflows; 64 have no direct executed property in this package. No application files were changed.

## Source fingerprints

| File | SHA-256 |
|---|---|
| apps/api/db/structure.sql | a432670865b113a466621a5363d2f582a65402019308ae3b9958cc9480df391e |
| apps/api/app/controllers/clinic/care/patients_controller.rb | 7f8508e8eb1939f9d7a8e24ea1f13635668c0a3b42dd924f4b020637a525e814 |
| apps/api/app/controllers/clinic/facilities_controller.rb | ede07c899d0d9fa6e8c488c3f362625112b0ea757ccb4ac2c38b1a18a1b3745b |
| apps/api/app/models/clinic/care/observation.rb | b8d21d910cf0da379d3d2b5f41288a1f95aa0886c98f966ba4c0656f53014744 |
| apps/web/src/shared/ui.tsx | 4b0a2af4295a323c5bacb9018ced0596722982d9baaa471a9e45ecdb10b60f43 |
| apps/web/src/features/clinic/InvoiceLineEditor.tsx | e77f9823b7ce2b6f9bea783f8b4b2825eb65e9b0788500c8a3241b42e006657f |
| apps/web/src/features/clinic/subscriptions/SubscriptionBilling.tsx | d52f4940a96bbccfaa7b2700bd7485401e3f4cdcecc5f396a36a3ed8a257c860 |
