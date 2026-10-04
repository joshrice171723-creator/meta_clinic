# Demo workspace integration

The demo panel uses the same `ClinicClient` and cookie jar as the plugin's clinic tools. Rails creates the demo run, fictional visitor registration, records, account choices, lesson status and authorization. The panel keeps only form input, selection and request progress in memory. It does not import personal browser cookies or manufacture clinic records.

## Host integration

`server/demo.mjs` exports `demoSnapshot(client)` and `demoAction(client, action, args)`. Register `meta_clinic_demo` for an empty-argument snapshot and `meta_clinic_demo_action` for the actions below. Run both through the service's existing serialization queue. Session-changing actions must invalidate prepared clinic changes; notify the main workspace when the demo account or scope changes.

Both helpers return `{ demo, connection, context, links }`; `demo` is the unmodified Rails response. Preparation also returns `{ preparation: { complete, attempts: 1, bounded: true } }`. `links` are same-origin website URLs derived from the returned run step links. `connection` is the ordinary client snapshot. A patient demo has no clinic context and cannot use clinic tools.

Render `DemoWorkspace` with `{ call, onConnectionChanged, busy? }`. `call(name, args)` resolves the tool's structured content and throws on errors. `onConnectionChanged()` refreshes the parent connection and clears stale records and prepared reviews. `busy` prevents competing parent actions. The component uses existing Material UI forms, alerts, progress indicators and confirmation dialogs.

## Tool arguments and routes

| Action | Arguments | Rails endpoint |
| --- | --- | --- |
| `register` | `name`, `email`, `company`; active runs additionally need confirmation and expected run ID | `POST /api/demo/visitor` |
| `enter` | `lesson_key`, optional sandbox `account`; active runs additionally need confirmation and expected run ID | `POST /api/demo/lesson`, `restart: false` |
| `prepare` | `expected_run_id`, optional `account` | `POST /api/demo/sandbox/prepare`, then `GET /api/demo/run`; once complete, `POST /api/demo/run/view` |
| `switch_account` | `account`, `expected_run_id`, `expected_user_id` (nullable during preparation) | `POST /api/demo/run/view` |
| `switch_view` | `view: clinic\|patient`, `expected_run_id` | `POST /api/demo/run/view` |
| `resume` | `expected_run_id` | `POST /api/demo/run/resume` |
| `complete` | `expected_run_id`; backend restricts completion to review lessons | `POST /api/demo/lesson/complete` |
| `restart` | Always rejected before requests or session changes | No backend request; shared lesson and sandbox records are protected |
| `leave` | `expected_run_id` for an active run, `confirmed: true` | `POST /api/demo/run/reset`, `all: false` |
| `start_over` | `expected_run_id` for an active run, `confirmed: true` | `POST /api/demo/run/reset`, `all: true` |

Use strict schemas with this action enum and string visitor/lesson/account/view fields, string-or-positive-integer expected run/user IDs (user ID may be null), and a boolean confirmation field. Backend validation remains authoritative. Account choices and labels come from `run.accounts`; guided lesson keys come from the returned catalog. Sandbox entry uses the existing `sandbox` lesson and `admin` account key, then exposes the returned account choices. Expected run IDs are checked immediately before each current-run action. Sandbox switching also forwards Rails' expected run/user guard.

## Session and recovery behavior

Every demo request uses `scoped: false`, so an old clinic actor or practice header cannot influence demo entry. Session-changing operations discard the client's old user/context projections, increment its generation, and fetch new CSRF state after Rails replaces the session. Clinic context is read only after an active, ready clinic view is returned. Patient views keep their own session identity without acquiring clinic scope.

Preparation advances one backend stage per tool invocation. A user action continues at most 24 requests; Pause stops after the current request and Continue resumes the saved backend stage. There is no indefinite effect or polling loop. On an unconfirmed mutation the component reads current status instead of replaying registration, entry, switching, restarting or reset. Backend preparation stages are idempotent and can be explicitly continued. The API client retains its existing timeout; a slow stage may still return an unconfirmed outcome, which is resolved by reading the run and continuing explicitly.

Start over clears this plugin's demo registration and session. Leaving the sandbox does not rebuild shared records. Shared lesson restart and sandbox rebuilding are rejected by this connector because either can affect other visitors. The UI does not offer these controls. A generic confirmation does not authorize a shared reset.

Opening a returned website link creates a separate browser session. Its cookies and account are independent of the plugin's cookies; the link is navigation, not proof that the browser is authenticated as the plugin account. Continue clinic record work in the plugin, or establish a demo session separately on the website.

## Evidence boundary

Source mapping: `apps/api/config/routes.rb`, `apps/api/app/controllers/development/demo_runs_controller.rb`, `development/sandbox_accounts.rb`, `development/shared_demo_lesson.rb`, and the website's `features/demo/DemoJourney.tsx`. This integration reuses existing demo APIs and changes no database schema. The owning coordinator performs integrated checks and the host walkthrough; this worker did not run builds, tests or browser acceptance.

## Selected local evidence and preparation dependency

Registration and session export/import/start-over were exercised successfully after correcting the demo CSRF namespace. Demo clinic requests use `/api/demo-workspace/...` and keep ordinary account cookies separate. See VERIFICATION.md.

SharedDemoLesson permits only the creating visitor to advance an incomplete or unmarked shared sandbox. Joining visitors can select roles once all 21 preparation stages complete. The observed 404 is consistent with that deliberate guard; exact database state could not be reconfirmed after the local database stopped. Never reassign ownership, mark a populated run complete or reset shared records to bypass it. Recover by refreshing status or completing preparation through its owning visitor/operator workflow.
