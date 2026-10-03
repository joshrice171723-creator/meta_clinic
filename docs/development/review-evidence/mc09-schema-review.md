# MC09 schema review transfer

Based on exact source 50ee80805fedfdb6981d33b0c82df5a33f544c2f. Schema-only commit795bde81a1bed44d82b1ac838a682137db7cacb2 contains +177/-0 from successful disposable PostgreSQL18.6 migration. Cherry-pick that commit for schema incorporation; the following documentation commit is review evidence only.

Original schema SHA25643e093f60e49b98fc5794e351b1b99ef8bd3538b16034b2db81514a71e3687bb,1244785 bytes, Git blob2138a6fbd464143abc93b4f04b0fdcd7a5fc1786. Scoped schema SHA256a8784a0a3efec7fc0783110ade5070fbf18bea125934271b112b8d847697fefa,1252329 bytes, Git blob82b4b5f1d0be3935b994230aa9085d22ad459749. Unrelated pg_dump ordering/header changes and pre-existing00800 migration-row drift excluded. Only new entitlement objects and00900 migration row added.

Candidate checks:9 entitlement cases,16 existing subscription workflow cases,2 ERD cases all passed. Combined requested suite32 cases/3921 assertions has3 failures, no errors. Migration preparation/schema dump, seven-file scoped RuboCop and eager loading passed. No new functional defect found in this bounded review. Schema-bearing authored final head and integrated gate acceptance remain required.

All three failures independently reproduce at base8c3d2358073acd14bb135a93a3adb1d7aa9034c8: focused baseline3 cases/10 assertions/3 failures, no errors. Exact candidate/baseline mismatch sets are identical, recorded in adjacent JSON. No stale contract was edited.

1. BoundariesTest API controller/view allowlist (boundaries_test.rb:18): existing platform/owner_password_reset_mailer/reset.html.erb and reset.text.erb omitted.
2. BoundariesTest API route contract (line35): pre-existing missing QA/report/configuration/day-end/service-inquiry/etc routes and owner_invitation alias. Full exact expected/actual differences are adjacent JSON; neither new entitlement route is a mismatch.
3. BoundariesTest clinic root-model allowlist (line73): existing day_end_review.rb, service_inquiry.rb, service_offering.rb, service_offering_clinician.rb and service_offering_site.rb omitted.

Source uses existing scoped billing authority; immutable history, purchased snapshot quantities, paid-active opening/use gates, unknown opening balances, exact idempotent reversal and audit rollback exercised. Practice/patient/agreement locks and database unique/FK/trigger guards inspected. No concurrent execution or new controller HTTP acceptance claimed. Runtime privilege change narrows UPDATE/DELETE for the new table; inspected only, never applied to production.

All records/credentials were synthetic and disposable. No live grants, money, provider, merge or deployment. Raw logs remain with Sage; this branch makes schema and exact failures portable to the cloud source owner. Relay retains integration ownership and baseline gate disposition.
