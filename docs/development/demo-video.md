# Seven-minute local walkthrough

This walkthrough uses only fictional Cedar Grove Family Care records in a dedicated local PostgreSQL container and database. It never uses live Stripe credentials: membership payment is the existing local manual, fixed-term workflow.

From the `APPly-video` worktree, keep these environment values in the same PowerShell session:

```powershell
$env:APPLY_POSTGRES_CONTAINER = 'apply-postgres-video'
$env:PGPORT = '54331'
$env:APPLY_DEVELOPMENT_DATABASE = 'apply_video_development'
$env:APPLY_TEST_DATABASE = 'apply_video_test'
$env:APPLY_WEB_PORT = '3310'
$env:APPLY_API_PORT = '3311'
$env:APP_DEVELOPMENT_LOGIN = '1'
$env:APPLY_DEMO_VIDEO = '1'
```

Prepare and start the isolated stack:

```powershell
ruby .\bin\dev setup
Set-Location .\apps\api
ruby .\bin\postgres exec bundle exec rails demo_video:prepare
Set-Location ..\..
ruby .\bin\dev start --no-browser
```

Open `http://127.0.0.1:3310/login`. The development toolbar remains available; use business date `2026-09-09`. Employee choices are shown by role, including Clinic Administrator, Clinician, Front Desk Coordinator, Billing & Accounting, and Inventory Coordinator. The patient choice is Avery Morgan.

Useful routes:

- `/clinic/scheduling` for the September 9 daytime schedule and Avery's active encounter.
- `/clinic/patients` for the fictional patient directory.
- `/clinic/subscriptions` for two published plans and the Cedar Plus draft. Avery starts without a membership so enrollment can be demonstrated. A patient purchase enters pending clinic follow-up; it does not activate instantly and is not a live Stripe checkout.
- `/clinic/billing` for the backend-owned service catalog, Avery's posted office-visit invoice, and the manual cash workflow. Open a Cedar Grove Main Clinic drawer before recording cash; no drawer or payment is pre-created.
- `/clinic/inventory`, `/clinic/inventory/replenishment`, and `/clinic/inventory/purchasing` for lots, reorder needs, the draft purchase order, and a delivered shipment that is intentionally left unreceived for the walkthrough.
- `/patient-portal` after switching to Avery Morgan.

The task is idempotent: reruns preserve later edits, published state, and patient enrollment while filling only missing walkthrough records. It refuses every database except `apply_video_development` and requires both local development login and the explicit `APPLY_DEMO_VIDEO=1` flag.
