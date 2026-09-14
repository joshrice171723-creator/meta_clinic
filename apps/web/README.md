# APPly frontend

React/TypeScript with Vite and npm. Owns screens, navigation, forms, accessibility and styles. Rails in [../api](../api/README.md) owns sessions, permissions, domain rules, records and integrations.

## Ownership

- `src/features/launch`: selling site, Contact, paperwork, training and inbox.
- `src/features/identity`: login UI only; no authentication authority.
- `src/features/clinic`: clinic shell, overview, synthetic patients and staff.
- `src/features/inventory`: office stock, pharmacy catalog, receipts and histories.
- `src/api`: same-origin HTTP client and response types.
- `src/shared`: neutral controls and loading/error handling.
- `public`: preserved brand, shared, launch and clinic styles.

No backend imports, database SDK, persistent browser record/token storage, service worker or raw-HTML injection. Capability flags hide unavailable controls; server checks remain mandatory. Quantities are strings; do not recalculate availability or infer clinical conversions here. Failed mutations are never automatically replayed. Retry keys survive uncertain form submissions until acknowledged or the page is left.

## Commands

Use Node 24 (`.node-version`) and the committed npm lockfile.

```sh
npm ci --ignore-scripts
npm run dev
npm test
npm run build
npm run browser:smoke -- --route /clinic --profile clinic-administrator
npm audit --audit-level=high
```

Dev defaults to 127.0.0.1:3000 and proxies `/api` to 127.0.0.1:3001, preserving Host/Origin. `APPLY_WEB_PORT` and `APPLY_API_PORT` support isolated checkouts. Repository-root `bin/dev` is the canonical combined lifecycle; package-level `npm run dev` remains a frontend-only component command. `bin/verify-web` runs synthetic native-HTTP integration with its own database and processes.

`browser:smoke` starts or reuses that managed stack, signs in through the loopback-only development session, opens one requested same-origin route in installed Edge, and saves a screenshot under the ignored `outputs/browser-smoke/` directory. Use `--viewport phone`, `--headed`, or another listed development account when the acceptance contract requires it; run `--help` for all options. It is local synthetic browser evidence, not production or provider verification.

For a fresh isolated worktree, run `ruby bin/dev prewarm` once from the repository root before the first build or test. It uses npm's machine-wide package cache with `--prefer-offline`; normal tests and builds then reuse that worktree's installed dependencies.

The build outputs only static assets. Docker builds independently and serves them as an unprivileged nginx user on 8080, with strict same-origin CSP and no application secrets. The provider-neutral edge in `ops/portable/nginx.conf` sends API requests directly to Rails. No cross-origin credential configuration is necessary.

The static image can serve the record-free clinic shell, but the default private/production host edge returns `/clinic` 404. The separately generated authenticated staging-review server may proxy that shell; Rails then permits clinic JSON only for the exact managed `StagingDemoUser` assignment. Protected page shells contain no records and data requests require a live authorized session. Browser history restoration reloads and reauthorizes; logout/account changes discard protected component state. Browser interaction/visual/accessibility acceptance remains separate from unit, build and HTTP checks.

Do not deploy from `site/`, include the vault in a build, or enter real/real-derived patient information. See [developer documentation](../../docs/development/README.md) and [Software Architecture](../../APPlyVault/03%20Execution/Software%20Architecture.md).
