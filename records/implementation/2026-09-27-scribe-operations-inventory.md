# 2026-09-27 - MC-15 scribe operations inventory

Added an authorized scribe activity query and Operations summary. The query starts from the existing accessible encounter scope, excludes deleted encounters, and exposes only aggregate draft/source/recording states. Current drafts are selected through active documents' current_draft_id, preventing superseded revisions from inflating current work. The response includes empty-document count, last recording update and snapshot time. Reads use the scribe permission and existing audit recorder.

The provider configuration flag reuses OpenRouter.configured? without invoking the provider or exposing keys/model configuration. It is explicitly not provider connectivity proof. Interrupted/open recordings and incomplete sources are disclosed separately from transcription success, with refresh and a link to the existing scribe workspace. Existing provider-readiness copy now points to the inventory.

Checks: three Ruby files passed scoped RuboCop; three frontend files passed formatting; TypeScript and scoped diff review passed. No tests, provider requests, patient-content reads or browser acceptance. One Python file read hit a Windows encoding error; the final copy change was reapplied with explicit UTF-8. No repeated retry loop.

This advances MC-15's remaining scribe inventory scope. Tracker/atlas updates and percentage reassessment remain scheduled for the next hourly checkpoint. Recovery actions remain in the owning scribe workflow; this inventory does not infer clinical acceptance or vendor readiness.
