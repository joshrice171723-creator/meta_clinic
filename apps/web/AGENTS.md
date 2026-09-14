# React frontend agent instructions

These instructions apply to `apps/web/` and extend the repository root contract.

## Ownership and boundaries

- The browser owns presentation and transient interaction state, never business or clinical authority.
- Use the same-origin `/api/*` transport and existing session/CSRF flow. Do not add broad CORS, browser-stored authentication tokens or database credentials.
- Do not persist records, signing content, passwords, CSRF material or protected values in local/session storage. Reauthorize restored history and clear protected state on account changes/logout.
- Never infer permissions from visible navigation. Render server-projected capabilities, while Rails rechecks every protected action.
- Failed mutations are not automatically replayed. Preserve explicit retry/idempotency behavior and accept response ownership before showing success.
- Keep Launch, Identity, Clinic and Inventory feature ownership distinct; shared components remain neutral.

Read the applicable `Software Architecture.md` domain/transport sections, the relevant product note and [developer documentation](../../docs/development/README.md) before changing behavior.

## Design routing

- Read root `PRODUCT.md` before product or interface work. The mentoring/guidance portal and clinic software are separate products; do not force a shared visual identity or carry clinic styles into Launch/Portal surfaces without an explicit request.
- Before changing clinic presentation, read `APPlyVault/03 Execution/Design.md` for the canonical visual system and `Clinic Workspace Design.md` for implementation history and clinical-data boundaries. Honor any recorded composition or implementation gate before editing source; a documented direction does not override workflow, accessibility or data-state safeguards.
- Treat the tracking board as the clinic's first design-defining surface. Visual emphasis may communicate operational state, freshness or required review; it must not imply clinical acuity, priority or authority that the backend contract does not provide.
- Clinic acceptance prioritizes 1280/1440px desktops and 768/834/1024px tablets. Maintain a safe phone fallback, but do not let mobile-phone layout drive clinic density or table structure. Launch/Portal surfaces remain fully mobile responsive.

## Contracts and dependencies

- `src/api/contracts.ts` and the Rails route/serializer contracts change together. Preserve exact decimal strings and explicit error states.
- Keep `package.json` and `pnpm-lock.yaml` synchronized. Use `pnpm install --frozen-lockfile --ignore-scripts` for an unchanged lockfile; dependency additions or upgrades require the requested scope and an audit.
- Do not include vault files, backend source, secrets or runtime records in the frontend image or build output.
- Keep synthetic example boards and fixtures clearly labeled and isolated from API-derived records.

## Material UI implementation hierarchy

- Material UI is the default component system for frontend implementation, not an optional visual reference. For every new or materially changed interface, first identify the applicable existing APPly component and Material UI primitive, pattern or icon.
- Use the Material UI implementation whenever an appropriate component exists. Prefer its supported composition, slots, variants, theme overrides, `sx`/`styled` APIs and owned APPly wrappers over recreating the behavior with raw HTML/CSS or a parallel component.
- If an existing APPly module or wrapper cannot meet the requirement, improve that owned underlying module so its consumers share the correction. Do not bypass it with a one-off duplicate.
- Build a focused custom control from semantic browser primitives only when Material UI has no suitable option or supported composition for the required semantics, accessibility or maintainability. Keep it narrow and add interaction/accessibility coverage proportional to the control. A custom composition does not require a special exception note; record rationale only for a new reusable design-system primitive, another component library, or a dependency patch/fork.
- Modify, vendor or fork the Material UI package only for a confirmed reusable upstream limitation worth ongoing ownership. It must be a narrow, reviewable and reproducible dependency patch, vendored package or pinned fork that survives `pnpm install --frozen-lockfile`; never leave the result only in generated `node_modules`. Record exact upstream package/version, changed source, rationale, license/provenance, clean-install application and focused regression evidence.
- CSS is normal for layout and visual treatment. The guard is against unnecessarily reimplementing Material UI's interaction and accessibility behavior in custom JavaScript.
- Existing unconverted CSS is a compatibility layer, not precedent for new hand-built controls. Do not introduce another component library for a local convenience or copy a Material UI component into the repository.
- For UI work, load the `frontend-ui` repository skill and inspect the final diff specifically for hand-built controls that duplicate Material UI.

## Checks

Use the root phase-aware selector; it runs related Vitest files, incremental TypeScript, changed-file formatting and a bundle for ordinary component work:

```sh
python -B ../../bin/agent-check --phase final --staged --path apps/web --level component --run
```

Use `integration` for transport, authentication, routing or shared response contracts. Dependency audit is selected when `package.json` or `pnpm-lock.yaml` changes; full tests and audits remain parallel CI gates. For user-facing behavior, run `pnpm run browser:smoke --route <route> --profile <development-account>` at each required viewport and distinguish browser proof from unit/build evidence.
