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

The feature is disabled by default. Server configuration requires `APP_TELEHEALTH_ENABLED=true`, `APP_TELEHEALTH_PROVIDER=daily`, `APP_TELEHEALTH_DAILY_ACCOUNT_REF`, `APP_TELEHEALTH_DAILY_API_KEY`, and `APP_TELEHEALTH_DAILY_WEBHOOK_SECRET`. Keep secret values in the environment's secret management, never in source, browser storage, logs or this packet. Daily REST requests use the fixed `https://api.daily.co/v1` origin. The clinic's provider account reference must match the server configuration.

An authorized clinic administrator uses `/clinic/settings/telehealth` to configure visit types, region eligibility, preparation/join windows, support copy and separately approved telehealth/Scribe consent policy versions. A successful provider health check and valid published configuration are required before enabling video booking. Missing credentials or provider failures must produce an unavailable state; an ordinary local run must never fabricate a successful video room or note.

Run the existing background worker from `apps/api` through the database wrapper: `ruby bin/postgres exec bin/clinic-worker --once`, or use `--interval SECONDS` under the environment's process supervisor. It processes telehealth command retries, expiry and reconciliation alongside existing background work. A pending end-for-everyone operation is not complete until the server reconciles provider outcome.

In-call Scribe reuses the existing Scribe provider, storage, draft review and encounter export. Existing development transcription configuration uses `OPENROUTER_API_KEY` and optional `OPENROUTER_SCRIBE_MODEL`; inspect the existing provider's environment gate before hosted use. Configuring video does not configure transcription. Both require their own authorized environment and evidence.

Grant the new atomic telehealth permissions through the clinic's existing role-version and grant process. Defining permission catalog entries does not grant them to existing roles. A host needs visit read/participate/host authority, while preparation review/verification and configuration remain separate permissions. Scribe also requires its existing write/review/export permissions. The guarded local Omni account is a fixture operator and does not prove role-scoped authorization.

## Browser delivery

Use HTTPS outside loopback. The deployed document's Permissions Policy and CSP must permit the bundled video SDK, selected media transport and self-owned camera/microphone access. An upstream edge must preserve the required headers and serve authenticated clinic/patient SPA routes. API routing remains the outer edge's responsibility. Join tokens are short-lived server-issued credentials retained only in memory; visit URLs contain opaque public locators, never bearer join tokens.

The npm SDK still loads its call-object runtime from Daily. The adapter opts into `avoidEval`; the clinic and patient portal document policies allow Daily's primary and fallback script/WebSocket origins plus its documented supporting endpoint. The public Launch policy stays separate. These directives follow [Daily's call-object CSP guide](https://docs.daily.co/docs/guides/privacy-and-security/content-security-policy), consulted 2026-09-08. Virtual backgrounds and noise cancellation are not enabled by this implementation. Recheck provider requirements on SDK upgrades and verify the actual hosted edge policy with two participants before release.

Short-lived join credentials and room duration are separate limits. [Daily's token contract](https://docs.daily.co/reference/rest-api/meeting-tokens/create-meeting-token) distinguishes join expiration from ejection of an already connected participant. Tokens are obtained through the server-side meeting-token endpoint. They contain no APPly-supplied API credential or patient name. The [SDK participant control](https://docs.daily.co/reference/daily-js/instance-methods/update-participant) supports host ejection; a returned SDK call or room-delete acknowledgment is not proof that remote media ended. Provider events/presence and application authorization polling reconcile that outcome. Server-only revocation and absent-host recovery require explicit live-provider evidence before release.

## Evidence still needed for live media

An authorized configured environment must prove two independent participants can prepare, enter waiting, be admitted, join, reconnect and end a visit. Independently verify both audio sources in Scribe, visible separate consent and revocation, input-device changes, segment rollover, recording interruption, same-patient navigation, exact encounter review/export and provider end/retry behavior. Unit adapters and browser screens alone do not establish that external media or transcription worked.
