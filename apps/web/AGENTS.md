# React frontend agent instructions

These instructions apply to `apps/web/` and extend the repository root contract.

## Ownership and boundaries

- The browser owns presentation and transient interaction state, never business or clinical authority.
- Use the same-origin `/api/*` transport and existing session/CSRF flow. Do not add broad CORS, browser-stored authentication tokens or database credentials.
- Do not persist records, signing content, passwords, CSRF material or protected values in local/session storage. Reauthorize restored history and clear protected state on account changes/logout.
- Never infer permissions from visible navigation. Render server-projected capabilities, while Rails rechecks every protected action.
- Failed mutations are not automatically replayed. Preserve explicit retry/idempotency behavior and accept response ownership before showing success.
- Keep Launch, Identity, Clinic and Inventory feature ownership distinct; shared components remain neutral.

Read the applicable `Software Architecture.md` domain/transport sections, the relevant product note and `CICD.md` before changing behavior.

## Contracts and dependencies

- `src/api/contracts.ts` and the Rails route/serializer contracts change together. Preserve exact decimal strings and explicit error states.
- Keep `package.json` and `package-lock.json` synchronized. Use `npm ci --ignore-scripts` for an unchanged lockfile; dependency additions or upgrades require the requested scope and an audit.
- Do not include vault files, backend source, secrets or runtime records in the frontend image or build output.
- Keep synthetic example boards and fixtures clearly labeled and isolated from API-derived records.

## Checks

From `apps/web/` run:

```sh
npm test
npm run format:check
npm run build
npm audit --audit-level=high
```

Use `npm run typecheck` for a faster intermediate check. For transport, authentication, routing or shared response-contract changes also run root `bin/verify-web` and the relevant Rails tests. Perform browser, responsive and accessibility checks when the user-facing behavior warrants them; distinguish those results from unit/build evidence.
