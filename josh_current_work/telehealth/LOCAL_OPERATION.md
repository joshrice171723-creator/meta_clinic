# Telehealth operation and isolated verification

This runbook describes the local feature and provider prerequisites. It does not authorize deployment, external communication, provider account purchases or real patient data. Use the [handoff](AGENT_IMPLEMENTATION_HANDOFF.md) for actual verification evidence.

## Isolated local environment

The implementation clone is `C:/Users/joshr/Desktop/Work/APPly-telehealth`. Keep the audit and original `APPly` checkout untouched. This task reserves PostgreSQL container/volume `apply-telehealth-sc504`, port `55441`, development database `apply_telehealth_sc504_development`, test database `apply_telehealth_sc504_test`, web port `3104`, and API port `3105`.

Set these values in the current PowerShell process before using this clone's lifecycle commands:

```powershell
$env:APPLY_POSTGRES_CONTAINER = 'apply-telehealth-sc504'
$env:PGPORT = '55441'
$env:APPLY_DEVELOPMENT_DATABASE = 'apply_telehealth_sc504_development'
$env:APPLY_TEST_DATABASE = 'apply_telehealth_sc504_test'
$env:APPLY_WEB_PORT = '3104'
$env:APPLY_API_PORT = '3105'
```

From the clone root, `ruby bin/dev start --no-browser --no-docker-start` prepares and starts the local application after the owned database container exists. This lifecycle command includes verification, so it belongs after the implementation freeze. Rails commands from `apps/api` use `ruby bin/postgres exec bin/rails ...`; this wrapper obtains the clone's ignored local database credential without printing it. Never substitute the audit database or start a second process on its ports.

## Provider and clinic activation

The feature is disabled by default. New video setup uses the existing Twilio account, with `APP_TELEHEALTH_ENABLED=true` and `APP_TELEHEALTH_PROVIDER=twilio`. Configure these server-only values:

- `APP_TELEHEALTH_TWILIO_ACCOUNT_SID`: the existing account's live Account SID.
- `APP_TELEHEALTH_TWILIO_API_KEY_SID` and `APP_TELEHEALTH_TWILIO_API_KEY_SECRET`: a US1 API key for Video REST and room-bound access tokens.
- `APP_TELEHEALTH_TWILIO_AUTH_TOKEN`: the account authentication token for callback signature validation.
- `APP_TELEHEALTH_TWILIO_STATUS_CALLBACK_URL`: the exact public HTTPS URL for `POST /api/integrations/telehealth/twilio/events`. Loopback URLs cannot receive Twilio callbacks; provision and verify the intended public route before activation.

Keep secret values in approved secret storage or ignored local environment configuration, never source, browser storage, logs or this packet. The clinic's provider account reference must match the server configuration. Twilio Video requests use the fixed `https://video.twilio.com/v1` origin. Existing `APP_TELEHEALTH_DAILY_*` configuration is retained only for legacy Daily records; no Daily signup is required for Twilio.

The existing messaging file contains `TWILIO_TEST_ACCOUNT_SID` and `TWILIO_TEST_AUTH_TOKEN`. Those are not Video credentials: Twilio's [test-credentials documentation](https://www.twilio.com/docs/iam/test-credentials) restricts them to specific messaging, voice, lookup and phone-number resources. Do not overwrite them or change the reminder sandbox to activate video. One Twilio account can provide both services while keeping their application configuration separate.

An authorized clinic administrator uses `/clinic/settings/telehealth` to configure visit types, region eligibility, preparation/join windows, support copy and separately approved telehealth/Scribe consent policy versions. A successful provider health check and valid published configuration are required before enabling video booking. Missing credentials or provider failures must produce an unavailable state; an ordinary local run must never fabricate a successful video room or note.

Run the existing background worker from `apps/api` through the database wrapper: `ruby bin/postgres exec bin/clinic-worker --once`, or use `--interval SECONDS` under the environment's process supervisor. It processes telehealth command retries, expiry and reconciliation alongside existing background work. A pending end-for-everyone operation is not complete until the server reconciles provider outcome.

In-call Scribe reuses the existing Scribe provider, storage, draft review and encounter export. Existing development transcription configuration uses `OPENROUTER_API_KEY` and optional `OPENROUTER_SCRIBE_MODEL`; inspect the existing provider's environment gate before hosted use. Configuring video does not configure transcription. Both require their own authorized environment and evidence.

### OpenRouter account and audio setup

The user selected reuse of the existing OpenRouter account for transcription and note generation on 2026-09-08. Its existing key and model were copied into this isolated clone's ignored `.env.openrouter.ps1`; the original configuration was not modified. Load that configuration into the owned runtime process when restarting. Do not create a duplicate account or paste credentials into chat, committed files or frontend settings. The user subsequently selected Twilio for video to reuse the existing messaging account; no Daily account was created.

The current Scribe adapter uses OpenRouter's [audio-input Chat Completions contract](https://openrouter.ai/docs/guides/overview/multimodal/audio) with `input_audio`, an explicit format and a structured tool result. Transcription is produced from finalized recording segments; this is not a claim of word-by-word streaming captions. Select an audio-input model with tool-calling support before setting `OPENROUTER_SCRIBE_MODEL`, and verify the actual recording format against that provider.

The current free default, [NVIDIA Nemotron 3 Nano Omni](https://openrouter.ai/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free), supports audio and tool calls, but its provider notice prohibits confidential or personal data, including people's voices and faces. It is not an approved route for real encounter recordings. A local provider check can use independently generated fictional speech; actual-person recordings require a separately suitable provider configuration and the existing data/release approvals. No human audio has been sent as part of account setup.

Grant the new atomic telehealth permissions through the clinic's existing role-version and grant process. Defining permission catalog entries does not grant them to existing roles. A host needs visit read/participate/host authority, while preparation review/verification and configuration remain separate permissions. Scribe also requires its existing write/review/export permissions. The guarded local Omni account is a fixture operator and does not prove role-scoped authorization.

## Browser delivery

Use HTTPS outside loopback. The deployed document's Permissions Policy and CSP must permit the bundled video SDK, selected media transport and self-owned camera/microphone access. An upstream edge must preserve the required headers and serve authenticated clinic/patient SPA routes. API routing remains the outer edge's responsibility. Join tokens are short-lived server-issued credentials retained only in memory; visit URLs contain opaque public locators, never bearer join tokens.

Twilio uses its bundled JavaScript SDK; the clinic/patient document policy permits HTTPS and WebSocket connections to Twilio origins while script loading stays self-only. The public Launch policy stays separate. Daily's SDK and browser origins are removed: legacy provider records remain readable and available to backend cleanup, but Daily grants cannot start browser media. Virtual backgrounds and noise cancellation are not enabled by this implementation. Recheck provider requirements on SDK upgrades and verify the actual hosted edge policy with two participants before release.

Short-lived join credentials and room duration are separate limits. Twilio [access tokens](https://www.twilio.com/docs/video/tutorials/user-identity-access-tokens) are signed on the server and scoped to a single room and opaque participant identity. Their expiration is not proof that an already connected participant was disconnected. APPly must reconcile [room completion](https://www.twilio.com/docs/video/api/rooms-resource) and [participant disconnection](https://www.twilio.com/docs/video/api/participants) through provider state and signed callbacks; a queued command is not a completed shutdown. Server-only revocation, expiry and absent-host recovery require explicit live-provider evidence before release. No provider cloud recording is enabled; Scribe capture remains governed by its separate consent and authorization.

## Evidence still needed for live media

An authorized configured environment must prove two independent participants can prepare, enter waiting, be admitted, join, reconnect and end a visit. Independently verify both audio sources in Scribe, visible separate consent and revocation, input-device changes, segment rollover, recording interruption, same-patient navigation, exact encounter review/export and provider end/retry behavior. Unit adapters and browser screens alone do not establish that external media or transcription worked.

## Recovery and visit wrap-up

Disconnected call controls and the persistent call dock expose an explicit reconnect action. Reconnection tears down the prior media object, stops the current Scribe capture segment, and requests fresh server authorization for the same visit. A denied request clears the protected session. Reconnection must not create another encounter or replay an end/admission mutation. Clinician callback links use the current preparation phone; patient contact links use clinic-configured support details.

Twilio Video SDK 2.35.0 does not expose an in-place token refresh API. A healthy call is not periodically rejoined. If automatic SDK reconnection fails after the short-lived join token expires, the explicit reconnect action obtains a fresh grant; that interruption is not seamless recovery. An application access-window extension remains bounded by clinic policy and does not invoke a nonexistent Twilio room-expiry update API.

The clinician visit workspace includes a persistent **Visit wrap-up** section. Save a draft during the encounter, review Scribe in its existing panel, and use the exact encounter chart to sign its documentation. Select the signed patient-instruction revision, record the outcome and an explicit follow-up disposition, then finalize only when server-projected actions permit it. An arranged follow-up must link to an actual appointment for the same patient. Draft edits stay in memory across polling and conflicts; the form offers explicit load-saved or keep-edits recovery. It does not claim an unsaved draft has survived a full page reload.

Finalizing telehealth wrap-up does not sign a note, close the encounter, export Scribe or book an appointment. Patient release follows the existing encounter release boundary. Until release, the completion page shows that instructions are pending rather than exposing drafts. After release it shows only the patient instructions, outcome and follow-up fields returned by Rails. Private clinician notes and Scribe source material are excluded. An ending call remains distinct from a confirmed ended call, cancellation or missed appointment.
