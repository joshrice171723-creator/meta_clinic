# Clinic workflow properties

This package uses **fast-check against real APPly code**. It is a failure-finding
suite, not a replacement for operating the 100 workflows in a browser. A passing
helper or model property does not establish a complete workflow, visible field
validation, a provider transaction, or production readiness.

## Run

From this directory after installing the existing web dependencies:

```powershell
npm ci
npm test
npm run test:api
node coverage.mjs
```

`test` imports the real frontend helpers and renders the shared Field component.
`test:api` creates one randomly named `apply_properties_<12 hex digits>` database
on loopback PostgreSQL, loads the repository `apps/api/db/structure.sql` through
stdin (including Docker-wrapped PostgreSQL), authenticates a synthetic clinic,
and rolls back each generated case. It drops only that exact generated database
in an ensure block. It never resets the shared development or test databases.
It uses the configured `bin/postgres exec` credential mechanism without printing
credentials. The structure snapshot, rather than migration replay, is the
schema basis; migration coverage is not claimed.

Default seed is `20260908`; each frontend property runs 200 generated cases and
each Rails property runs 20. A failure shrinks to a minimal counterexample.
`results-frontend.json` and `results-api.json` contain the actual seed, path,
counterexample, execution count and assertion error. Failure exit status is
intentional when an application gap is found. Never weaken a requirement merely
to make this audit suite green.

Reproduce only one property:

```powershell
$env:FC_FILTER = 'partial patient edit preserves'
$env:FC_SEED = '20260908'
$env:FC_PATH = '0'
npm run test:api
Remove-Item Env:FC_FILTER, Env:FC_SEED, Env:FC_PATH
```

Set `FC_RUNS` to adjust generation counts. `FC_PATH` requires a filter. A filtered
run overwrites that layer's result file, so preserve a full result before using
it. A harness/fixture/startup failure is not evidence of an application defect.
For a targeted repair pass, `FC_MATCH` accepts a regular expression and merges
the affected results by property name into the previous result file. Run
`node coverage.mjs` and `node evidence.mjs` after the final pass.
`FC_ONLY_NEW=1` executes only property names missing from that layer's saved
results and retains previous results. `node --import tsx manifest.mjs` lists
declared properties; its manifest is deliberately not execution evidence.
Combine `FC_ONLY_NEW=1` with `FC_RERUN_MATCH` to rerun specific repaired harness
cases alongside new additions in one scratch-database pass.
Startup is bounded to 180 seconds (`FC_STARTUP_TIMEOUT_MS` overrides it); cases
are bounded to 120 seconds. A timeout terminates only the harness's spawned
process tree, and database cleanup still targets the generated scratch name.

## What an assertion means

- **Frontend helper / SSR:** only the imported function or rendered component.
  For example, accepting invoice ID zero in the helper does not establish API
  acceptance. Native HTML `required` and a visible required label are separate.
- **ActiveRecord validation:** each record is first verified valid with a
  complete baseline. After removing a field, validation must fail on that exact
  field. These properties do not call a creation form or save the invalid model.
- **Rails integration / persistence:** requests use a real authenticated Rails
  integration session. Rejected creation must not increase record count; failed
  edits must preserve prior values. It is not a live browser or HTTP server run.
- **Application service:** real billing/stock logic and database records, with
  generated quantities and exact retry checks. External processors are not used.
- **Model policy:** Scribe processing eligibility across consent/deletion states;
  this does not execute recording, transcription or an AI provider.

The explicit-sex-selection property represents the user's requested example of
minimum data, not an existing clinical approval. Impossible provided email/phone
values and visible required markers are proposed product acceptance requirements.
Other missing fields come from current model/API contracts. Optional patient
contact information is not made globally mandatory, and no assertion requires
staff to fabricate unknown clinical information.

## Failure-first boundary

Principal risks checked: incomplete creation, invalid provided data, partial
editing, destructive deletion, duplicate retry, stock overdraw and payment
overallocation. Preserve shrunken failures and fix product code separately under
an appropriate claim. Concurrent dirty product files are imported as they exist;
this package does not modify them. Missing coverage remains missing.

`coverage.md` enumerates all 100 document workflows and labels partial coverage
versus uncovered/external flows. It explicitly separates creation, editing and
deletion gaps. The required-label property is cross-cutting and cannot by itself
make any workflow covered. Existing application test suites are not silently
counted as run by this package.
