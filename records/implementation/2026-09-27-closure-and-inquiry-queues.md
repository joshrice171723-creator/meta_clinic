# Closure and inquiry queue delivery

Date: 2026-09-27. Scope: BR-02 (MC-04), BR-03 (MC-02).

- Closure recovery retains the authorized appointment relation and includes whole-day site exceptions using each location's timezone and separate local-midnight boundaries across daylight-saving changes. Only upcoming scheduled/confirmed visits without an encounter qualify. Queue rows explain status closure versus the local closed date. Existing explicit service replacement/reschedule and cancellation actions remain the only mutation paths. Partial-day closures and overlapping overnight visits whose start date is not closed are not covered by this start-date queue.
- Inquiry lists now paginate 25 rows with total/page metadata and server new/contacted/closed filters combined with the existing clinic-date due filter. The latest and due queues retain stable ID tie-breaking. Pages clamp after removals, filters reset to page one, and the existing resource helper isolates responses by request path. Notes/contact fields remain encrypted, read/write permission stays subscriptions.review, and no outreach is sent.

Checks: scoped Ruby lint passed. Local managed Rails runner executed the closure relation read-only and returned zero matching rows, so populated and denied-role runtime cases remain unproved. TypeScript initially rejected a Stack alignItems prop; corrected to the supported sx property and rerun. No tests added or run, no external integrations or deployment. Source walkthrough: closure filter → dated reason → existing editor; inquiry status/due filter → page navigation → existing notes/status action → refresh.

Together with prior BR-01 and the already-delivered inquiry follow-up editor, planning Build estimates move MC-04 88→90 and MC-02 78→81. Validation is unchanged. This continuation delivers two new coherent workflows, not five; the next prepared report/branding workflows remain open. It does not meet the five-slice hourly target or the >90 overall build goal.
