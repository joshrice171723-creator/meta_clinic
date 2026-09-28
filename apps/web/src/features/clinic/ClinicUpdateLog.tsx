import { Box, Stack, Typography } from "@mui/material";
import { version as clinicVersion } from "../../../package.json";

const changes = [
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
          Booking defaults (#21): Schedule &gt; Book appointment now uses the
          current real time rounded up to the next 15-minute interval, with a
          30-minute duration. Retest while viewing September 1, 2026, and today;
          choose Start new appointment if a saved draft appears. Confirm the
          fresh times follow the current clock, then close without booking.
          Held slots, clicked slots, and Schedule another at this time retain
          their selected times. Recovered drafts remain unchanged until cleared;
          the default time does not guarantee slot availability.
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
          Day-end currently combines live reports and links to the source
          actions. Saving a reconciled closeout is still in progress.
        </li>
      </Box>
    </Stack>
  );
}
