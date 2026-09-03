# Third-party notices

## Cline Plan/Act adaptation

APPly's `plan` and `act` skills are an original, repository-specific adaptation of the Plan/Act mode concepts documented and implemented by the Cline project. APPly does not use Cline or ship Cline host adapters.

- Upstream: <https://github.com/cline/cline>
- Reviewed revision: `5de79a75d083776552100f21645188badb7bd5aa`
- Reviewed sources:
  - `docs/core-workflows/plan-and-act.mdx`
  - `sdk/packages/shared/src/prompt/cline.ts`
  - `apps/cli/src/runtime/interactive/mode.ts`
- Upstream license: Apache License 2.0, <https://github.com/cline/cline/blob/5de79a75d083776552100f21645188badb7bd5aa/LICENSE>

Material changes: the APPly versions are Codex repository Agent Skills, not Cline runtime code or Cline workflows. They use APPly's instruction/vault routing, preserve repository authority boundaries and explicitly disclose that prompt instructions do not reproduce Cline's runtime tool filtering, command guard or mode-switch state.

The separately reviewed <https://github.com/cline/skills> repository at revision `26378461e978f2b4e2e6d67b57121b86b2a79ba5` contained no Plan or Act skill; it was used only to confirm that the upstream feature is a mode system rather than an existing skill bundle.
