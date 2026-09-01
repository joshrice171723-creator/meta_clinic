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
npm audit --audit-level=high
```

Dev binds to 127.0.0.1:3000 and proxies `/api` to 127.0.0.1:3001, preserving Host/Origin. `APPLY_API_PORT` allows a different local API port for isolated checks. Repository-root `bin/dev` starts both apps; `bin/verify-web` runs synthetic native-HTTP integration with its own database and processes.

The build outputs only static assets. Docker builds independently and serves them as an unprivileged nginx user on 8080, with strict same-origin CSP and no application secrets. The trusted edge in `ops/aws/ec2/nginx.conf` sends API requests directly to Rails. No cross-origin credential configuration is necessary.

The static image can serve the record-free clinic shell, but the default private/production host edge returns `/clinic` 404. The separately generated authenticated staging-review server may proxy that shell; Rails then permits clinic JSON only for the exact managed `StagingDemoUser` assignment. Protected page shells contain no records and data requests require a live authorized session. Browser history restoration reloads and reauthorizes; logout/account changes discard protected component state. Browser interaction/visual/accessibility acceptance remains separate from unit, build and HTTP checks.

Do not deploy from `site/`, include the vault in a build, or enter real/real-derived patient information. See [Software Architecture](../../APPlyVault/03%20Execution/Software%20Architecture.md) and [CICD](../../APPlyVault/03%20Execution/CICD.md).
