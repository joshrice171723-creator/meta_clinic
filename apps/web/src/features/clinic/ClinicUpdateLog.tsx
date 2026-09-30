import { Box, Stack, Typography } from "@mui/material";
import { version as clinicVersion } from "../../../package.json";

const changes = [
  [
    "Visitor sandbox reset",
    "Reset Sandbox now rebuilds the shared clinic baseline when a different registered visitor starts the reset.",
  ],
  [
    "Booking attempt reconciliation",
    "Recovered booking requests identify when their saved site or time differs from the selected slot, and a mismatched server result remains unconfirmed instead of appearing successful.",
  ],
  [
    "Booking rejection recovery",
    "A rejected booking stays blocked until the form changes, while an unknown outcome keeps the exact idempotent request available for safe reconciliation.",
  ],
  [
    "Recurring booking recovery",
    "An authorized setup user can assign the selected clinician to the previewed series period, then refresh the preview before scheduling.",
  ],
  [
    "Staff conversations",
    "An authorized administrator can create a conversation without a workforce employment row; invited staff still need eligible access.",
  ],
  [
    "Location selection",
    "The selected site remains selected after reload, and site-scoped workforce access no longer expands the location list to every site.",
  ],
  [
    "Clinic sign-in",
    "The public demo sign-in page now has a direct clinic-team credential entry alongside the owner entry.",
  ],
  [
    "Visit completion",
    "Instructions and education marked not required now show an informational state instead of missing-evidence warnings.",
  ],
  [
    "Labels and appearance",
    "Booking sites show names, appearance settings use plain language, and the note template uses Meta Clinic casing.",
  ],
  [
    "Cash payments",
    "Enter cash tendered, see change due, and record with one action.",
  ],
  [
    "Clinician assignment",
    "Assign a clinician to the selected site and slot from the scheduling warning.",
  ],
  ["Vitals", "Observed time starts at the current time."],
  [
    "Booking confirmation",
    "Review appointment time in your timezone and the clinic timezone.",
  ],
  [
    "Staff invites",
    "Front desk hiring suggests the Front Desk Coordinator role.",
  ],
  [
    "Inventory",
    "Follow one first-run path from supplier to offer, purchase order, receipt, and bins.",
  ],
  [
    "Supplier quote snapshots",
    "Quote requests retain the requested package quantity and stock unit, and closing an offer checks for later catalog changes.",
  ],
  [
    "Cash estimate retries",
    "An exact retry can return the original estimate after its catalog offering is retired.",
  ],
  [
    "Report exports",
    "Visit, payment, invoice, and stock CSV exports include the current page's detail rows and pagination context.",
  ],
  ["Encounter recalls", "Create a six-month follow-up from chart close."],
  [
    "Staff messages",
    "Participants start with all staff at the selected location.",
  ],
  ["Tracking board", "New check-ins receive an owner automatically."],
  [
    "Future patient navigation",
    "The dead-end shortcut is removed; membership and storefront links remain.",
  ],
  [
    "Morning view",
    "See today's schedule, drawer status, open invoices, and staffing gaps together.",
  ],
  [
    "End-of-day closeout",
    "Review drawer, invoices, and visits together, with links to each source workflow.",
  ],
  [
    "Waitlist slot offers",
    "Cancellations offer the open slot to waitlisted patients.",
  ],
  [
    "Setup progress",
    "A checklist and progress bar show what remains before location finalization.",
  ],
] as const;

export function ClinicUpdateLog() {
  return (
    <Stack spacing={2} sx={{ maxWidth: 800 }}>
      <Typography component="h1" variant="h4">
        Update log
      </Typography>
      <Typography variant="body1">Version {clinicVersion}</Typography>
      <Typography component="h2" variant="h6">
        Changes to check
      </Typography>
      <Box component="ol" sx={{ pl: 3, my: 0, "& li": { mb: 1.5 } }}>
        {changes.map(([title, description]) => (
          <li key={title}>
            <strong>{title}.</strong> {description}
          </li>
        ))}
      </Box>
      <Typography component="h2" variant="h6">
        Notes for QA
      </Typography>
      <Box component="ul" sx={{ pl: 3, my: 0, "& li": { mb: 1 } }}>
        <li>
          Visitor sandbox reset: register one visitor and make a synthetic edit
          in the full Sandbox. Open the same shared Sandbox as a second
          registered visitor, choose Reset Sandbox, and confirm preparation
          progress remains visible until the workspace reopens. After reload,
          confirm the edit is gone and the tracking board matches its prepared
          baseline. This source fix is not a browser pass until that exact
          cross-visitor journey succeeds on the deployed revision.
        </li>
        <li>
          Version 0.2.0: confirm the exact build revision in /build.json.
          The separate private QA findings and retests are tracked at
          /qa?view=atlas; Atlas Build coverage is not a QA pass rate. The
          repository record at
          records/audits/2026-09-28-qa-handoff-value-selection.md preserves
          source dispositions for the recovered historical handoff; those are
          not browser acceptance.
        </li>
        <li>
          Retest the carried-forward signing, cancellation-reconciliation, and
          badge-list refresh fixes on their original screens. Confirm the
          signing destination exists in every chart state, an uncertain cancel
          refreshes the schedule before retry, and a newly issued badge appears
          in the refreshed list. Also verify booking recovery, cash-payment
          reconciliation, authorization, and persistence on the exact build.
          Repeat affected checks if the revision changes during QA.
        </li>
        <li>
          The 70-item Muse retest export and the recovered 100-workflow PDF are
          separate historical sources. Retest the original actionable steps
          against this exact revision; do not count a source fix as a browser
          pass or treat these inventories as a deduplicated total.
        </li>
        <li>
          Retest #179 and #181 together. Recover a saved booking request from a
          different selected slot and confirm the form names the saved request
          time rather than silently substituting the clicked slot. Retry the
          exact saved request. Confirm the response patient, site, start, and
          end match the submitted values; any mismatch must remain unconfirmed.
          After a definite rejection, confirm Schedule stays blocked until a
          form change clears the error. An unknown outcome must remain safely
          retryable with the same request key.
        </li>
        <li>
          Recheck #168 without merging two clinical meanings. A medication
          entered in encounter Intake must persist in the saved questionnaire
          and reappear there after reload. The chart's Current medicines list
          is a separate reconciled medication-statement record. Intake does not
          automatically create that record in 0.2.0. Record a defect only if
          the intake answer itself disappears; a future reconciliation flow
          requires separate product and clinical direction.
        </li>
        <li>
          Retest the original steps for the prior 70-finding audit against this
          exact revision. Record actor, clinic, site, input, visible result,
          relevant API response, and state after reload. A source fix is not a
          browser pass; record a pass only after observing the expected outcome.
        </li>
        <li>
          Highest-value scheduling checks: BUG-002 nonoverlapping same-day
          visits, BUG-004 recurring clinician assignment and fresh preview,
          BUG-005 walk-in reason and conflict guards, and BUG-007 eligible and
          ineligible no-show actions. Check that denied roles cannot use the
          assignment or exception paths.
        </li>
        <li>
          Access and recovery checks: BUG-022 create a staff conversation as
          Omni Administrator, then verify participant access and an ineligible
          recipient denial; BUG-025 regrant the Front Desk Coordinator role
          after revocation and reload; BUG-037 reload a selected clinic site;
          BUG-039 compare site-scoped and practice-scoped location choices and
          confirm an unauthorized site switch is denied.
        </li>
        <li>
          Patient and workforce journey checks: BUG-013 opt out of written
          instructions and education without a false warning; BUG-015 submit
          vitals with an empty observed time and confirm visible feedback;
          BUG-026 and BUG-028 complete workforce setup and retry timecard,
          payroll, and schedule actions. Recheck public membership and portal
          entry for BUG-032 with published synthetic data and an activated
          synthetic patient account.
        </li>
        <li>
          Inspect BUG-044, BUG-045, BUG-049, BUG-052, BUG-055, BUG-057,
          BUG-058, BUG-069, and BUG-070 on their original screens. Confirm the
          new clinic credential link, permission matrix, palette/site/template
          wording, and distinct write-off, void, and credit explanations.
        </li>
        <li>
          Open runtime questions: BUG-036 Reset Sandbox previously returned
          404; repeat the reset and check restored baseline and visitor
          isolation. BUG-067 previously locked the QA Gate Test session on a
          clinic switch; capture the context response and session state before
          and after. For BUG-003, BUG-032, and BUG-051, include the exact
          synthetic actor, profile, location assignment, and service state.
          Preserve authorization and session guards while investigating.
        </li>
        <li>
          Release gate follow-up: the first 0.1.9 candidate failed while
          opening a newly prepared Sandbox and rolled back automatically. The
          shared prepared Sandbox behavior was restored for this revision.
          Open it after registering a visitor, switch location, reset it, and
          verify a second visitor can enter the prepared Sandbox. A reset also
          replaces another visitor's synthetic changes.
        </li>
        <li>
          The audit records 23 source-backed fixes, implementations, or
          clarified recovery paths and 47 findings with specific current-source
          explanations, missing reproduction evidence, or product/authority
          decisions. Those counts are dispositions, not 70 browser passes.
        </li>
        <li>
          Supplier pricing: create a quote request, change the underlying
          package quantity or stock unit, and confirm a stale offer cannot
          close. Older requests without a snapshot should remain reviewable.
          Cash estimates: repeat the exact request after retiring the offering
          and confirm the original result returns. In each paged operations
          report, export CSV and compare the detail rows and page metadata to
          the visible page.
        </li>
        <li>
          Booking defaults (#21): Schedule &gt; Book appointment uses the current
          real time rounded up to the next 15-minute interval, with a 30-minute
          duration. Retest while viewing September 1, 2026, and today; choose
          Start new appointment if a saved draft appears. Confirm the fresh
          times follow the current clock, then close without booking. Held slots,
          clicked slots, and Schedule another at this time retain their selected
          times. Existing saved drafts still require review and remain unchanged
          until cleared. This default does not guarantee slot availability.
        </li>
        <li>
          Location setup: a new location becomes the selected site after it is
          created. The location picker labels unfinished sites so a setup
          administrator can return to finalization.
        </li>
        <li>
          Encounter signing: completed encounters open their chart workspace so
          the Signing destination contains the draft, signing, or correction
          controls, loading state, or access state instead of an empty anchor.
          Retest Avery Example Encounter #1 and confirm the persisted-note state.
        </li>
        <li>
          Encounter navigation: Return to tracking board now performs a direct
          route navigation from the completion review.
        </li>
        <li>
          Bad debt: Adjust charges now records a write-off separately from an
          ordinary credit, with an amount, reason, actor, timestamp, audit
          event, and exact-retry key. Retest a partly paid invoice: write-offs
          stop at the unpaid balance and appear as write-offs in the ledger.
        </li>
        <li>
          Duplicate patients: authorized staff can merge an empty duplicate into
          a canonical patient. Records with linked activity or portal identity
          are blocked for reconciliation rather than silently moved. Registration
          details remain on the hidden record and must be copied manually.
        </li>
        <li>
          Provider assignment: the tracking board now projects active clinician
          accounts with a current site assignment at the encounter location.
          Confirm QA Test Clinician appears, can be assigned, and remains after reload.
        </li>
        <li>
          Workforce badges: issuing a badge now validates the selected employee
          and location and keeps the confirmed issued row visible without an
          immediate second list read. Retest Sim Frontdesk and reload the row.
        </li>
        <li>
          Appointment cancellation: cancellation commits before its optional
          waitlist follow-up. Retest Avery Example at 11:00 AM on September 29;
          confirm Cancelled persists and any replacement offer is separate.
        </li>
        <li>
          Waitlist offers: offer start and accept-before values now use separate
          date and time fields so each value commits before publishing.
          Clinician eligibility still follows the active SIMT site assignment
          used by scheduling. Retest the original Avery Example offer and
          confirm Offered persists after reload or a capacity error is visible.
        </li>
        <li>
          Inventory receiving: an empty Destination links to Storage locations.
          Create an active leaf, return, and confirm the receipt destination persists.
        </li>
        <li>
          Schedule cancellation: appointment details consistently show Cancel
          appointment. It is enabled only for eligible scheduled or confirmed
          appointments without an encounter. Cancel an eligible appointment
          there and confirm the status persists after reload.
        </li>
        <li>
          Visitor demo: Development tools now includes an Open visitor demo
          entry to the shared synthetic clinic journey. Open the visitor demo,
          enter the sandbox, make a synthetic edit, and confirm Reset Sandbox
          restores its baseline. Reset removes other visitors' changes too.
        </li>
        <li>
          Booking draft recovery: earlier-session drafts are explicit; drafts at
          least 24 hours old show their saved timestamp and a stale warning. Review
          the recovered intent or choose Start new appointment.
        </li>
        <li>
          Payment times: cash payment, allocation, and receipt rows now share
          one server-captured recording instant. Compare the ledger and receipt
          in the clinic timezone.
        </li>
        <li>
          Development tools: the invitation activation shortcut is now labeled
          Activate with invitation code; Log in remains the selected
          test-account sign-in action.
        </li>
        <li>
          Cash payment: immutable payment rows no longer request a database
          update lock. Retry the exact pending payment once, then confirm
          invoice balance, ledger, drawer, receipt, and financial summary agree.
          An uncertain request stays locked until its result is confirmed; it is
          never replayed automatically.
        </li>
        <li>
          Booking: the booking form now keeps a stable React hook order while
          loading. Open Book appointment at both locations, including with the
          new clinician, and complete one booking. Clinician site eligibility
          still applies.
        </li>
        <li>
          Registration: the final Register a separate patient action now submits
          the reviewed form. Register a new synthetic patient and confirm the
          chart opens after reload. Staff still must review possible identity
          matches before creating a separate chart.
        </li>
        <li>
          Credit adjustment: immutable credit rows no longer request a database
          update lock. Record a USD 5 credit on a posted invoice, check the
          ledger and balance, and confirm Close exits an uncertain dialog. The
          exact request remains retained for safe retry after closing.
        </li>
        <li>
          Vitals: Review measurements now focuses the empty Observed time field
          and shows its error. Clear the time, review, and confirm the field is
          identified; entering a time permits review. Time is not inferred.
        </li>
        <li>
          Inventory setup: Omni now receives the current practice grant on login
          or clinic switch, including an existing SIMT membership. Reopen the
          Omni session and configure inventory at SIMT. Ordinary roles keep
          their existing inventory permissions.
        </li>
        <li>
          Release packaging: the low-memory BuildWebOnHost path was already
          present on main. The encrypted recovery copy now makes an upload and
          download round trip before decryption and hash verification. Confirm
          the locked web install, local build, small Nginx image, and recovery
          gate in the scheduled release; no alternate build path is used.
        </li>
        <li>
          Record cash on a posted invoice. Confirm the invoice balance, drawer
          total, payment ledger, and receipt all show the same amount.
        </li>
        <li>
          Book with a clinician who is missing the site assignment. An
          authorized setup user should be able to assign the slot from the
          warning and then save the booking.
        </li>
        <li>
          Start inventory from the catalog's first-run guide. Check that the
          supplier, offer, order, receipt, and bin refer to the same item.
        </li>
        <li>
          Cancel a future in-person appointment with a matching waitlist entry.
          The patient can see and accept the offer in the portal; a separate
          patient alert is not sent yet.
        </li>
        <li>
          Day-end combines live reports and source-action links and now saves an
          attributed closeout review. Save one, reload, and inspect its
          captured totals and discrepancy notes.
        </li>
      </Box>
    </Stack>
  );
}
