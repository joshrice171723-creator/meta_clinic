---
type: architecture-pointer
status: design-baseline-pointer
updated: 2026-09-03
lifecycle: active
canonical_for: clinic-target-design-pointer
---
# Target-State Clinic ERD

Home: [[00 Home]] · Current boundary: [[Clinic Domain and Data Boundaries]] · Detailed developer design: [clinic target-state ERD](../../docs/architecture/clinic-target-state-erd.md) · Verification: [dated backend report](../../records/verification/2026-08-31-backend-verification.md)

## Scope and reading key

The complete Mermaid ERD, historical E/E+/P labels, composite-key/null-pattern contracts, lifecycle rules and proposed extensions are preserved in the detailed developer document. Those labels describe design-time origin, not current implementation status. The Rails migrations and generated structure remain executable truth.

## Overall ownership

Practice is the clinical custody boundary; optional organizations are business grouping only. Patient records remain practice-local. No diagram edge grants access. See [[Clinic Domain and Data Boundaries]] for the concise current interpretation.

## Evidence and exclusions

This is a design baseline pending recorded amendments, not evidence that a replacement ran or that clinical, professional, security or release gates passed. The full historical baseline remains reviewable at [docs/architecture/clinic-target-state-erd.md](../../docs/architecture/clinic-target-state-erd.md).
