# Clinic design exploration

`clinic-workspace-directions.html` is a self-contained comparison fragment for the staff intake, clinician and inventory concepts in [Clinic Workspace Design](../../../APPlyVault/03%20Execution/Clinic%20Workspace%20Design.md). It is not imported by React, included in `public/`, or connected to Rails. All examples are invented and nothing is persisted or sent.

The Codex conversation renders the fragment with its visualization wrapper. For local inspection where the bundled visualization skill is available, run its `scripts/render.py` with the absolute fragment path and `--serve`; it serves only the rendered preview on loopback. Do not serve or upload the repository/vault. The wrapper supplies comparison-control styling and decorative icons; product styling is scoped inside the fragment.

This is design material, not a releasable clinical UI. Staff intake/triage, visits, note signing and prescribing remain proposals. Palette selection is independent of layout; appearance follows the system by default. No external fonts or new dependencies were added. The runtime now uses `src/features/identity/Settings.tsx` for account-owned preferences and `src/features/clinic/Appearance.tsx` for theme application; the comparison fragment stays isolated and does not persist anything. The conceptual workflow layouts remain unimplemented.
