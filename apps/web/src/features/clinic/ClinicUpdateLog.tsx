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
          Record cash on a posted invoice. Confirm the invoice balance, drawer
          total, payment ledger, and receipt all show the same amount.
        </li>
        <li>
          Book with a clinician who is missing the site assignment. An authorized
          setup user should be able to assign the slot from the warning and then
          save the booking.
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
