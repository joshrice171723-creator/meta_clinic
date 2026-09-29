# Atlas Build reconciliation — 2026-09-28

The canonical tracker last raised the MC-01–15 equal-weight Build estimate to 70.1% before the founder workflow preview in `70d360dd`. That preview was released for QA in `d3768227`; subsequent source repairs through `0faea4dd` remain on `main`. This checkpoint credits source contracts that are present while retaining the tracker’s separate Validation and External / human values. The percentages are bounded engineering estimates, not acceptance results.

| Slice | Build change | Source evidence credited | Still open |
| --- | ---: | --- | --- |
| MC-01 | 84→86 | Setup progress checklist in `70d360dd`; unfinalized location recovery in `1829d8ad`, with selected-site and mixed-location follow-through in the 0.1.8 candidate. | New-administrator browser journey, cross-clinic denial, configured service history. |
| MC-03 | 72→74 | Authorized empty-duplicate merge and blocking of linked records in `cf98a547`/`8e0dc9ca`. | Connected correction/reload and telehealth return. |
| MC-04 | 90→93 | Booking time readback and waitlist offer path in `70d360dd`; cancellation/offer repairs in `dba06c29`/`2d8ab14d`; 0.1.8 candidate rejects past supplied booking times. | Muse GH #21 booking retest, overbook and concurrent allocation browser proof. |
| MC-05 | 70→72 | Current vitals time default, clinician assignment prompt and check-in owner path in `70d360dd`, with QA repairs through `884aff45`. | Connected role/site and handoff journey. |
| MC-06 | 65→67 | Chart-close follow-up/recall creation in `70d360dd`. | Clinical completion/reopen and provenance browser proof. |
| MC-08 | 88→91 | One-action cash tender in `70d360dd`; payment and reasoned write-off repairs in `1d94c22b`/`cf98a547`/`8e0dc9ca`. | Ledger/drawer/receipt reconciliation and actual payment outcomes. |
| MC-11 | 82→85 | Supplier-to-bin first-run guide in `70d360dd`, with receiving navigation repair in `884aff45`. | Connected receiving/stock trace, exact retry and supplier events. |
| MC-12 | 60→62 | Selected-location staff message preselection and patient-visible waitlist offer in `70d360dd`/`2d8ab14d`. | Failed-message recovery and proactive patient notice. |
| MC-13 | 65→67 | Invite role suggestion and authorized clinician site assignment in `70d360dd`, with assignment projection repair in `884aff45`. | Permission changes, revocation and location isolation browser proof. |
| MC-14 | 53→58 | Owner morning view and linked day-end report review in `70d360dd`. | Saved reconciliation, report denial/reload, named owner and retention policy. |
| MC-15 | 51→55 | Setup progress checklist and clickable update log in `70d360dd`; release/QA recovery notes and unfinalized location follow-through. | Configuration migration recovery, integration inventory and scoped acceptance. |

These eleven changes add 30 row points across 15 equally weighted MC slices: 70.066…→72.066…%, displayed as **70.1→72.1%**. MC-02, 07, 09 and 10 are unchanged. Validation and External / human percentages are unchanged. MC-16 remains outside the Atlas average. Source presence does not settle the open founder friction acceptance items; day-end is a linked review, not a saved reconciled closeout.

Muse’s exact 0.1.7 retest at `0faea4ddbcc9d76ca6f1f50a297d48be59148ec6` marked GH #22 passed and GH #21 failed because the generic Schedule Book action supplied a past selected-day time that took precedence over the form default. The 0.1.8 candidate guards that default in `BookingFormEditor`; a hosted retest at the exact new revision is still required. No new tests were added or run for this reconciliation. TypeScript, the web production build, Ruby syntax, vault structure and vault audit checks passed. Changed-file Prettier check still warns on `CareFlow.tsx`, `ClinicUpdateLog.tsx` and `PracticeFeatureSettings.tsx`; the unmodified `HEAD` versions also fail the same formatter, and the scoped diff contains no broad reformat. Deployment and hosted retest remain open.
