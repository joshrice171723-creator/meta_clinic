# Patient Portal implementation handoff

Date: 2026-09-03
Repository: `C:\Users\joshr\Desktop\Work\APPly`
Scope: synthetic Patient Portal identity lifecycle checkpoint

## Delivered

The shared checkout contains the following lifecycle implementation in upstream commit `bf81eb3` (`Add patient reminder lifecycle foundation`):

- `apps/api/db/migrate/20260903001300_extend_patient_portal_identity_lifecycle.rb`
  adds invitation digest/expiry, accepted-terms evidence, revocation reason, and step-up timestamp fields. The migration version is unique in the checkout.
- `apps/api/app/models/clinic/patient_portal/identity.rb`
  defines the 30-minute invitation lifetime, terms version, digest helper, and invited-state validation.
- `apps/api/app/services/clinic/patient_portal/invite_identity.rb`
  issues a one-time random token, stores only its SHA-256 digest, clears prior lifecycle state, and records an audit event.
- `apps/api/app/services/clinic/patient_portal/activate_identity.rb`
  locks and consumes an unexpired invitation, requires the exact terms version and acceptance, rotates the member session, and binds the session to the portal identity.
- `apps/api/app/services/clinic/patient_portal/revoke_identity.rb`
  records the reason, clears invitation material, deletes the user sessions, and records an audit event.
- `apps/api/app/controllers/clinic/patient_portal/{invitations_controller,identity_lifecycle_controller,activation_controller,recovery_controller,step_up_controller}.rb`
  provide synthetic-only invitation/revocation/activation endpoints plus explicit unavailable fallback responses for recovery and step-up.
- `apps/api/app/controllers/application_controller.rb`
  accepts a reserved synthetic patient only when the session carries an active portal identity; revocation therefore denies the next request even when the browser still holds the old cookie.
- `apps/web/src/features/patientPortal/PatientPortalActivation.tsx`
  provides invitation activation, reads the token from the URL fragment transiently, removes it from the visible URL, requires terms acceptance, and states the support fallback.

## Deferred integration

The following working-tree files are mixed with another agent's reminder/scribe changes and remain intentionally unstaged:

- `apps/api/config/routes.rb`
- `apps/api/app/controllers/clinic/patient_portal/context_controller.rb`
- `apps/web/src/App.tsx`
- `apps/web/src/api/contracts.ts`
- `apps/web/src/features/patientPortal/PatientPortal.tsx`
- `apps/api/app/models/ability.rb`
- `apps/api/app/models/clinic/care/patient.rb`
- `apps/api/app/models/clinic/practice.rb`

Those files contain the route registration, public activation route, lifecycle capability fields, and completed-encounter/signed-revision projection changes. They need to be reconciled and committed by an agent that owns the mixed changes. The controller currently uses the existing `roles.manage` legacy authorization bridge until a dedicated patient-portal capability can be added safely to the mixed `Ability` file.

The pre-existing `apps/api/app/queries/clinic/billing/patient_ledger.rb` change was preserved and not staged.

## Boundary

This is synthetic local/test behavior only. No production identity provider, MFA method, self-service recovery, proxy access, messaging delivery, payment collection, booking, prescribing, or clinical approval was introduced.
