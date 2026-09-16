import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Button,
  Chip,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import type { ClinicCapabilities } from "../../api/contracts";

function Destination({
  available,
  href,
  children,
  clinicView,
}: {
  available: boolean;
  href: string;
  children: string;
  clinicView?: "schedule" | "tracking";
}) {
  if (!available) return null;
  return (
    <Button
      component="a"
      href={href}
      data-clinic-view={clinicView}
      size="small"
      variant="text"
      sx={{ alignSelf: "flex-start", px: 0 }}
    >
      {children}
    </Button>
  );
}

const WORKFLOW_STAGES = [
  {
    label: "Patient Flow",
    record: "Prospective work item",
    status: "Open → initial contact complete",
    next: "Schedule the first appointment",
  },
  {
    label: "Schedule",
    record: "Appointment",
    status: "Scheduled → confirmed → cancelled",
    next: "Check in when the patient arrives",
  },
  {
    label: "Tracking Board",
    record: "Visit / encounter",
    status: "Checked in → in progress → completed",
    next: "Open the encounter and record care",
  },
] as const;

export function OperationsWorkflowGuide({
  capabilities,
}: {
  capabilities: ClinicCapabilities;
}) {
  const canOpenGrowth =
    capabilities.subscriptions_review === true ||
    capabilities.subscription_catalog_publish === true;
  const canOpenSchedule =
    capabilities.appointments_read === true || capabilities.patients === true;

  return (
    <Accordion
      disableGutters
      variant="outlined"
      sx={{ mb: 3, "&:before": { display: "none" } }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        aria-controls="operations-workflow-guide"
        id="operations-workflow-guide-heading"
      >
        <Stack spacing={0.25}>
          <Typography component="h2" variant="h6">
            Workflow guide
          </Typography>
          <Typography variant="body2" color="text.secondary">
            See which record owns each status and what completion does not mean.
          </Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails id="operations-workflow-guide">
        <Stack spacing={2.5} divider={<Divider flexItem />}>
          <Stack spacing={0.75}>
            <Typography
              component="h3"
              variant="subtitle1"
              sx={{ fontWeight: 700 }}
            >
              Patient Flow → Schedule → Tracking Board
            </Typography>
            <Typography variant="body2">
              <strong>Patient Flow</strong> owns prospective-patient outreach.
              Marking the initial contact complete closes that contact step; it
              does not book a visit or complete later care.
            </Typography>
            <Typography variant="body2">
              A membership prospect becomes a patient only after the server
              verifies the paid checkout event and records the patient,
              agreement, invoice, and payment. A browser return, abandoned
              checkout, or failed payment leaves the person prospective.
            </Typography>
            <Typography variant="body2">
              <strong>Schedule</strong> owns the booked time and resource.
              Booking is not arrival. <strong>Tracking Board</strong> shows the
              separately recorded operational visit or encounter state.
            </Typography>
            <Stack
              direction="row"
              spacing={2}
              useFlexGap
              sx={{ flexWrap: "wrap" }}
            >
              <Destination available={canOpenGrowth} href="/clinic/work">
                Open Patient Flow
              </Destination>
              <Destination
                available={canOpenSchedule}
                href="/clinic"
                clinicView="schedule"
              >
                Open Schedule
              </Destination>
              <Destination
                available={capabilities.patients === true}
                href="/clinic"
                clinicView="tracking"
              >
                Open Tracking Board
              </Destination>
            </Stack>
          </Stack>

          <Stack spacing={1}>
            <Typography
              component="h3"
              variant="subtitle1"
              sx={{ fontWeight: 700 }}
            >
              Record and status map
            </Typography>
            <Typography variant="body2">
              These are separate records. Completing one stage never silently
              changes the status of the next stage.
            </Typography>
            <Stack spacing={1}>
              {WORKFLOW_STAGES.map((stage, index) => (
                <Stack
                  key={stage.label}
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1.25}
                  useFlexGap
                  sx={{
                    alignItems: { xs: "flex-start", sm: "center" },
                    p: 1.25,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1,
                  }}
                >
                  <Chip
                    size="small"
                    label={`${index + 1}. ${stage.label}`}
                    color={index === 0 ? "primary" : "default"}
                  />
                  <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                    <Typography variant="body2">
                      <strong>{stage.record}</strong> · {stage.status}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Next action: {stage.next}
                    </Typography>
                  </Stack>
                </Stack>
              ))}
            </Stack>
          </Stack>

          <Stack spacing={0.75}>
            <Typography
              component="h3"
              variant="subtitle1"
              sx={{ fontWeight: 700 }}
            >
              Completion stays with its record
            </Typography>
            <Typography variant="body2">
              Completing an encounter records the end of that encounter. It does
              not sign a clinical note, post or pay an invoice, or complete
              every follow-up. Those records keep their own state and permission
              checks.
            </Typography>
            <Typography variant="body2">
              A queued, sending, or provider-accepted reminder is not confirmed
              delivered. Delivery is a later recorded outcome; an unknown or
              failed outcome remains visible for review.
            </Typography>
            <Stack
              direction="row"
              spacing={2}
              useFlexGap
              sx={{ flexWrap: "wrap" }}
            >
              <Destination
                available={capabilities.patients === true}
                href="/clinic/patients"
              >
                Open patients and encounters
              </Destination>
              <Destination
                available={capabilities.billing_read === true}
                href="/clinic/billing"
              >
                Open billing ledger
              </Destination>
              <Destination
                available={capabilities.reminders === true}
                href="/clinic/reminders"
              >
                Open reminders
              </Destination>
            </Stack>
          </Stack>

          <Stack spacing={0.75}>
            <Typography
              component="h3"
              variant="subtitle1"
              sx={{ fontWeight: 700 }}
            >
              Ownership and corrections
            </Typography>
            <Typography variant="body2">
              Authorized registration staff maintain patient identity and
              contact fields in the patient directory. Scheduling staff record
              booking and visit-status changes. An authorized clinician signs
              the current clinical-note revision; encounter completion does not
              sign it for them.
            </Typography>
            <Typography variant="body2">
              Recorded ledgers are corrected with the domain&apos;s existing
              actions—not by rewriting history. Billing uses actions such as
              invoice voids and recorded refunds; inventory uses signed stock
              adjustments that remain in the movement ledger.
            </Typography>
            <Stack
              direction="row"
              spacing={2}
              useFlexGap
              sx={{ flexWrap: "wrap" }}
            >
              <Destination
                available={capabilities.patients === true}
                href="/clinic/patients"
              >
                Open patient directory
              </Destination>
              <Destination
                available={capabilities.inventory === true}
                href="/clinic/inventory/activity"
              >
                Open inventory movements
              </Destination>
            </Stack>
            <Alert severity="info">
              Visible links follow your current server-projected access. A link
              does not grant permission, and each destination rechecks access
              before showing or changing records.
            </Alert>
          </Stack>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
