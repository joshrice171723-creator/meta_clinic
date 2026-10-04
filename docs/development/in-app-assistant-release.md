# Assistant release review packet

Target for a future authorized release: existing synthetic Meta Clinic deployment
at `aimetaclinic.com`. This packet does not authorize or report a deployment.
The current candidate is on `codex/in-app-assistant`; exact delivered commits and
test evidence are in the [checkpoint](in-app-assistant-checkpoint.md).

## Expected change

One assistant entry in ordinary and demo clinic chrome. Demo visitors use the
existing automatic session flow without credentials. The panel searches existing
schedule openings, prepares a server-held proposal, confirms the exact proposal
and retrieves the saved appointment and audit receipt. Other clinic journeys and
the preserved ChatGPT plugin are outside this release's changed behavior.

Browser traffic remains same-origin. Only Rails calls the model provider, through
the free-only OpenRouter adapter. No provider account or key reaches the visitor.
Direct scheduling controls still use the backend when model assistance is unavailable.

## Schema and runtime requirements

- `20261004010000_create_clinic_assistant_booking.rb`: additive assistant context
  and booking-proposal tables with actor/tenant references, binding, state and expiry.
- `20261004010100_create_clinic_assistant_request_budgets.rb`: durable daily model
  attempt reservations with bounded counts and unique account/practice/user scopes.
- `20261004010200_remove_assistant_session_foreign_key.rb`: retain the session
  binding value while allowing normal logout/revocation to delete expired sessions.
  An old context cannot authorize a request after its session is gone.
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
proposal/appointment before attempting another booking.

After an approved release, verify the exact `build.json` revision, API/database
health, login-free demo entry, role/context invalidation, booking confirmation,
persisted read-back, audit and quota states on that exact hosted build. Local
checks cannot substitute for those observations. Do not alter or reset existing
shared demo records to make acceptance pass.

Separate authorization is still required for main integration and the exact
hosted deployment. Paid model use, real-data use and external clinical/payment
services are excluded. BAA, retention controls and eligible endpoints remain
separate future production requirements.
