# Telehealth future verification plan

Navigation: [packet](README.md) · [sequence](ROADMAP.md) · [build specification](TELEHEALTH_BUILD_PLAN.md).

This is the telehealth verification specification. Actual completed checks and remaining gaps are recorded in [implementation evidence](IMPLEMENTATION_EVIDENCE.md); the matrix itself is not evidence of a pass. It does not add scope to, modify, or replace the active APPly Stage 1 audit.

## Preconditions and evidence

Use one integrated implementation revision after writers stop, an isolated checkout and disposable synthetic database, independent ports and explicitly owned browser contexts. No existing audit service/database/browser may be reused or restarted. Record commit, source dirtiness, dependency versions, database identity, environment and provider configuration without credentials. Use independently invented patient/staff identities only.

Distinguish source inspection, automated behavior, browser interaction, provider roundtrip, and release/professional approval. A fake adapter proves APPly behavior under simulated responses; it cannot prove two-party media, real ejection, signed webhook delivery or provider-account eligibility.

## Consolidated verification matrix

| Area | Required positive and negative proof |
| --- | --- |
| Schema/migrations | Forward migration of populated prior schema; default in-person preserved; composite foreign-record rejection; same-patient appointment/encounter linkage; one encounter and one telehealth aggregate per appointment; cyclic pointer validity; immutable consent/check-in/event/receipt protection; no secret or historical data rewrite |
| Booking | Allowed modality/rule persists; invalid clinician/site/room rejected; backend overlap checks retained; concurrent same-key booking creates exactly one visit; same key different payload conflicts; lost-response recovery finds prior result |
| Patient access | Active own identity succeeds; unauthenticated, wrong patient/practice, revoked identity, inactive account, foreign UUID, manipulated participant/actor/room IDs fail without data/token leakage; existing release gate retained |
| Preparation | Conditional required fields; no overwrite of patient permanent contact; categorical device evidence; fresh policy/version; decline/withdrawal; reschedule generation; material update invalidates prior staff verification/admission |
| Authorization | Queue/detail field redaction by site/role; front desk cannot host by default; clinical encounter permission separate; assisting membership cannot self-assign; capability spoofing and legacy-read fallback cannot issue tokens |
| Admission | Patient gets no token while merely waiting; exact identity and current check-in verified; concurrent cancel/reschedule/revoke versus admit/grant fails safely; duplicate admit creates no parallel role/access |
| Media | Two independent authenticated browser participants actually exchange audio/video; camera/mic toggle affects tracks; denied permissions, missing devices, unsupported speaker picker, browser autoplay, screen-share refusal and unsupported browser produce truthful recovery |
| Reconnect | Temporary network loss, refresh, sleep/wake, device switch and rejoin reauthorize; old room generation/token cannot enter replacement visit; removed participant remains excluded; no duplicate participant or second clinical encounter |
| Transport lifecycle | Lost create response reconciles same room; short grants bound to room/subject; token expiry behavior, participant ejection, room termination and extension validated against actual SDK/API; unknown outcome remains pending; hard expiry works |
| Provider events | Valid signature accepted; forged/expired/oversized/malformed body rejected; duplicates deduped; wrong account/room ignored safely; late joined/left events cannot reopen ended/revoked state; transactional receipt recovery after worker/DB interruption |
| Outbox/concurrency | Bounded leases/fencing; duplicate dispatch; worker death after external success; retry policy and unknown state; no remote HTTP transaction lock hold; no second active room while first outcome unknown |
| Context continuity | Same-patient chart navigation docks call; exact encounter return; route remount retains authorized media; patient/practice/account switch and logout stop tracks/clear tokens; stale responses ignored; unsaved note warning still works |
| Scribe | Actual local and remote audio captured only after separate consent; no duplicate mic or echo; visible recording state to everyone; withdrawal stops recording/processing as required; processing failure leaves call intact; reviewed export targets exact existing encounter/revision |
| Integrated Scribe continuity | In-call controls/context/review; segment rollover at server limits without silent truncation; patient decline, added participant, stale epoch, two tabs and explicit takeover; ending media during flush does not trap the call; acknowledged source set and draft provenance; ordinary microphone-only Scribe regression |
| End/wrap-up | Leave affects caller only; host end prevents new grants immediately and shows pending/confirmed transport shutdown; no automatic signing/chart closure/billing; active/unknown call blocks encounter closure; explicit existing note/instructions/closure works afterward |
| Reminders/follow-up | Existing endpoint/consent/quiet-hours rules; portal destination only; no bearer token/name in URL; stale reminders suppressed on reschedule/cancel; accepted versus delivered remains distinct; follow-up creates actual request/appointment |
| Settings | Draft versus immutable publication; missing provider/rules/policy fails closed; role/site policy checks; concurrent stale publish conflict; disabling new visits has explicit effect without silently ending active ones; no secret in API response |
| Accessibility/layout | Patient 360/390/430px; clinic 768/834/1024/1280/1440px; zoom 200%; keyboard/focus and dialog return; screen-reader state; readable labels/contrast; controls unobscured by Scribe/dock; no horizontal patient scroll |
| Privacy/audit | Protected fields encrypted through actual host mechanism; allowlisted serializer/log/version output; grants and media absent from storage/logs; immutable actor/resource/action evidence; bounded event retention; no raw protected payload in error reporting |

## Host checks after implementation freeze

Follow the then-current nested `AGENTS.md` commands. Expected API checks include relevant Rails behavior/integration tests, migration/PostgreSQL verification, Zeitwerk, RuboCop, Brakeman and dependency audit. Expected web checks include tests, format check, build, dependency audit and root web contract verification. Schema/authorization changes require the repository backend and PostgreSQL verifier. These are future requirements, not permission to run against the active audit or shared database now.

Create meaningful tests at the verification phase; do not generate assertion-only mirrors of implementation. Collect failures once, repair the named list, and rerun only failed/invalidated checks unless a changed shared contract or mandatory repository gate requires more.

The user's Scribe requirement is specified in [Scribe inside the video call](SCRIBE_IN_CALL.md). It is required delivery scope; a separate navigation link or microphone-only capture does not satisfy it.

## Release blockers and stop conditions

- Any unauthorized patient/practice access or raw credential leak.
- Silent note loss, wrong-encounter export, recording after consent withdrawal, or false completion/charge.
- Unresolved duplicate provider room, unconfirmed termination mislabeled ended, or failed revocation without visible recovery/escalation.
- Missing live-provider authorization/configuration, unproven two-party media/ejection/webhooks, or unresolved existing portal/clinic release gate.
- Interference with the independent audit's files, runtime, ports, databases, source candidate or evidence.

On an external blocker, retain the exact observed failure and implemented independent scope. Do not report the full telehealth workflow complete. A production release requires its own authorized provider, operational, clinical/privacy and deployment decisions; a build is not that decision.
