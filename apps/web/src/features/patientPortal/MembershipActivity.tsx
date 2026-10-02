import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import type { Subscription } from "../clinic/subscriptions/contracts";
import { subscriptionDate } from "../clinic/subscriptions/contracts";

const labels: Record<string, string> = {
  pending_review: "Clinic review pending",
  review_approved: "Clinic review recorded",
  review_declined: "Clinic review declined",
  pending_payment: "Payment pending",
  processing: "Payment processing recorded",
  active: "Active access recorded",
  payment_failed: "Payment failure recorded",
  outcome_unknown: "Payment outcome unconfirmed",
  canceled: "Cancellation recorded",
  refunded: "Refund recorded",
};

/** Uses only the owning patient's existing projection; never reconstructs receipts. */
export function MembershipActivity({
  subscription,
}: {
  subscription: Subscription;
}) {
  const local =
    subscription.processor === "local_membership_simulator" ||
    subscription.payment_source === "local_membership_payment_simulator";
  const fixture = subscription.processor === "development_fixture";
  const headingId = `membership-activity-${subscription.id}`;
  return (
    <Accordion
      variant="outlined"
      disableGutters
      slotProps={{ heading: { component: "h5" } }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        id={`${headingId}-header`}
        aria-controls={`${headingId}-content`}
      >
        <Typography component="span" variant="subtitle1">
          Membership activity ({subscription.events.length})
        </Typography>
      </AccordionSummary>
      <AccordionDetails id={`${headingId}-content`}>
        <Stack spacing={1}>
          {local && (
            <Alert severity="info">
              Local simulator records; no provider charge or external payment
              confirmation is shown.
            </Alert>
          )}
          {fixture && (
            <Alert severity="info">
              Development fixture records; no external payment confirmation is
              shown.
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary">
            Changes are listed in the order recorded by the clinic. Times show
            when records were saved, in your device time zone (
            {Intl.DateTimeFormat().resolvedOptions().timeZone}). Current access
            and paid period are shown above. Activity is separate from payment
            receipts and does not confirm notification delivery.
          </Typography>
          {!subscription.events.length ? (
            <Typography>No membership activity is recorded.</Typography>
          ) : (
            <Stack component="ol" spacing={1} sx={{ m: 0, pl: 2.5 }}>
              {subscription.events.map((event, index) => (
                <Typography
                  component="li"
                  variant="body2"
                  key={`${event.occurred_at}-${index}`}
                >
                  <time
                    dateTime={
                      typeof event.occurred_at === "string" &&
                      Number.isFinite(Date.parse(event.occurred_at))
                        ? event.occurred_at
                        : undefined
                    }
                  >
                    {subscriptionDate(event.occurred_at, true)}
                  </time>
                  {" · "}
                  {Object.hasOwn(labels, event.kind)
                    ? labels[event.kind]
                    : "Unrecognized membership activity"}
                </Typography>
              ))}
            </Stack>
          )}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
