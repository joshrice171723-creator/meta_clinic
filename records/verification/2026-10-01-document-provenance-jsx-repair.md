# Document provenance JSX release repair — 2026-10-01

Branch `codex/mc05-provenance-jsx-repair`, exact combined base `99a613a6d96ed38425b241e6f24054f868209d86`. Root was explicitly assigned the concrete inherited document-provenance compiler blocker and authorized narrow/aggregate verification and isolated source publication. Relay owns integration; no PR, main merge or deployment.

## Reproduction and correction

On the unchanged base, Vite's installed Oxc transform of `src/features/clinic/PatientDocumentProvenance.tsx` failed with `Adjacent JSX elements must be wrapped in an enclosing tag` at line 192. The aggregate `pnpm run typecheck` failed with TS2657 at line 191 and TS1005 at line 196. The category field `FIELDS.map(...)` expression lacked its final `)}`. The repair adds only that closure.

After syntax repair, the aggregate compiler exposed two further errors in the same component: `Stack` layout props `alignItems` (line 94) and `flexWrap` (line 125) are not accepted directly by the installed MUI types. Move those existing values into `sx`. The source change is three lines in one component. No authority, data, contracts, category values, metadata storage, retry handling or Office/product behavior changes.

The final component passes the installed Vite TSX transform, and the full aggregate compiler reports no diagnostics in this component. The aggregate check still fails on eight errors outside the repair:

- `src/features/clinic/IntakeQuestionTasks.tsx:248,300`: direct `Stack` `flexWrap` props, TS2769.
- `src/features/clinic/LabUnitValidation.tsx:20`: direct `Typography` `display` prop, TS2769.
- `src/features/clinic/ServiceOfferingBulkTextImport.tsx:771,775,791,795`: direct `Typography` `display` props, TS2769.
- `test/prescription-attempt-provenance.test.tsx:6`: fixture lacks required `preparation_id`, TS2741.

Those paths remain unchanged for their owners/Relay. Aggregate typecheck and release acceptance are not claimed passed.

## Environment and commands

Installed the unchanged base's locked dependencies with `--frozen-lockfile --ignore-scripts` into the isolated worktree, using the existing pnpm store. Both manifest and lockfile remain unchanged. This includes the Office dependencies already present in `99a613a6`; no dependency was added or upgraded by the repair. Required jobs used the shared resource queue.

Reproduction and final narrow transform, from `apps/web`:

```sh
python ../../bin/agent-resources run -- node --input-type=module -e 'import {readFileSync} from "node:fs"; import {transformWithOxc} from "vite"; const path="src/features/clinic/PatientDocumentProvenance.tsx"; await transformWithOxc(readFileSync(path,"utf8"),path); console.log("Document provenance TSX transform passed");'
python ../../bin/agent-resources run -- pnpm run typecheck
```

Final aggregate output is retained locally in `/tmp/mc05-jsx-repair-types.log`. Whitespace diff check passed. No backend/database operation, new dependency, role/security change, reset, patient data, provider call or runtime release was performed.
