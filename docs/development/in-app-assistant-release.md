# Assistant release review packet

Target for a future authorized release: existing synthetic Meta Clinic deployment
at `aimetaclinic.com`. This packet does not authorize or report a deployment.
The current candidate is on `codex/in-app-assistant`; exact delivered commits and
test evidence are in the [checkpoint](in-app-assistant-checkpoint.md).

## Expected change

One assistant entry in ordinary and demo clinic chrome. Demo visitors use the
existing automatic session flow without credentials. The panel searches existing
schedule openings, prepares a server-held proposal, confirms the exact proposal
and retrieves the saved appointment and audit receipt. The expanded workflow mode
routes requests to explicit scheduling, clinical, billing, inventory, staffing,
office and configuration operations. Named record selections and typed forms feed
the same server-held proposal contract. Read operations return source records;
changes require a separate confirmation. Signing, final approvals, protected
policy exceptions and external sends remain in their owning human workflows.
The preserved ChatGPT plugin is outside this release's changed behavior.

Browser traffic remains same-origin. Only Rails calls the model provider, through
the free-only OpenRouter adapter. No provider account or key reaches the visitor.
Direct booking and workflow controls still use the backend when model assistance
is unavailable. The provider receives the request and a bounded shortlist of
operation schemas, not chart contents, retrieved results or session credentials.

## Schema and runtime requirements

- `20261004010000_create_clinic_assistant_booking.rb`: additive assistant context
  and booking-proposal tables with actor/tenant references, binding, state and expiry.
- `20261004010100_create_clinic_assistant_request_budgets.rb`: durable daily model
  attempt reservations with bounded counts and unique account/practice/user scopes.
- `20261004010200_remove_assistant_session_foreign_key.rb`: retain the session
  binding value while allowing normal logout/revocation to delete expired sessions.
  An old context cannot authorize a request after its session is gone.
- `20261004010300_create_clinic_assistant_workflows.rb`: additive workflow context
  and proposal tables, including encrypted named selections, exact arguments,
  previews and confirmation snapshots. Patient and encounter are optional for
  clinic-wide operations; every proposal remains actor, session, clinic and site bound.
- Apply the repository's runtime grants after migration as the release runbook requires.
- Configure the key in the server's approved secret storage, never in the image or
  web build. `CLINIC_ASSISTANT_ENABLED=1` and `CLINIC_ASSISTANT_SYNTHETIC=1` enable
  model execution only for the synthetic development/staging environment.
- The default provider/model is OpenRouter `qwen/qwen3.8-27b:free`, selected from
  its zero-price free variant. The built-in `openrouter/free` router remains
  available explicitly, along with validated `:free` model variants. Paid routing is rejected.
  Default caps are 50 account, 40 clinic and 15 user requests per UTC day, each
  attempt counted. No configuration may raise a cap above 50.
- Existing identity/session, deployment allowlists, CSRF, demo namespace, scheduling
  policy and permissions stay mandatory. No hosted key or provider flag has been changed.

## Recovery and post-release verification

Before mutation, follow the existing Lightsail release runbook's exact image,
database/key backup, health and recovery requirements. Preserve the last healthy
API/web image pair. Additive tables can remain if the application images are
reverted; do not drop appointment/proposal/audit history or reverse a booking as
part of code rollback. A business booking has its ordinary authorized cancellation
workflow, separate from deployment recovery.

Disabling `CLINIC_ASSISTANT_ENABLED` stops model inference, not all direct scheduling
controls. Restore the prior reviewed API/web images to remove the assistant entry
entirely if needed. If confirmation returns an uncertain outcome, retrieve the
proposal receipt before attempting another change. Confirmed workflow receipts
describe the result at confirmation time; use the linked workspace for current data.

After an approved release, verify the exact `build.json` revision, API/database
health, login-free demo entry, role/context invalidation, booking confirmation,
persisted read-back, representative workflow reads and confirmed writes, audit
and quota states on that exact hosted build. The complete 116-criterion crosswalk
is maintained in [the workflow map](in-app-assistant-workflow-map.md); source
coverage is not per-workflow acceptance. Local
checks cannot substitute for those observations. Do not alter or reset existing
shared demo records to make acceptance pass.

Separate authorization is still required for main integration and the exact
hosted deployment. Paid model use, real-data use and external clinical/payment
services are excluded. BAA, retention controls and eligible endpoints remain
separate future production requirements.
