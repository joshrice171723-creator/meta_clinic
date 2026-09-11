import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import PendingOutlinedIcon from "@mui/icons-material/PendingOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Step,
  StepContent,
  StepLabel,
  Stepper,
  Typography,
} from "@mui/material";
import type {
  BillingPatientLedger,
  EncounterCompletionResponse,
  EncounterDetail,
} from "../../api/contracts";
import { useResource } from "../../shared/ui";
import {
  subscriptionDate,
  subscriptionMoney,
  type Subscription,
} from "./subscriptions/contracts";
import type { EncounterFollowUpRecord } from "./EncounterFollowUp";

type ChecklistStep = {
  label: string;
  detail: string;
  complete: boolean;
  action?: { href: string; label: string };
};

function isZero(value: string) {
  return /^[-+]?0+(?:\.0+)?$/.test(value.trim());
}

function followUpLabel(
  followUp: EncounterCompletionResponse["evidence"]["follow_up"],
) {
  if (!followUp) return "No follow-up disposition has been recorded.";
  if (followUp.status === "not_required")
    return "Follow-up is recorded as not required.";
  if (followUp.status === "arranged")
    return "A follow-up appointment is arranged.";
  if (followUp.status === "completed") return "Follow-up is complete.";
  return followUp.due_at
    ? `Follow-up is still needed by ${subscriptionDate(followUp.due_at, true)}.`
    : "Follow-up is still needed and has no recorded due date.";
}

function PackagePosition({ subscriptions }: { subscriptions: Subscription[] }) {
  const current = subscriptions.filter((subscription) =>
    ["active", "pending_payment", "pending_review"].includes(
      subscription.state,
    ),
  );

  return (
    <Paper component="section" variant="outlined" sx={{ p: 2.5 }}>
      <Stack spacing={1.5}>
        <Box>
          <Typography
            component="h3"
            variant="subtitle1"
            sx={{ fontWeight: 700 }}
          >
            Package billing and next charge
          </Typography>
          <Typography color="text.secondary" variant="body2">
            Amounts below come from recorded package invoices and the payment
            processor. They do not represent remaining included visits or
            services.
          </Typography>
        </Box>
        {current.length === 0 ? (
          <Typography color="text.secondary" variant="body2">
            No current package or membership was returned for this patient.
          </Typography>
        ) : (
          current.map((subscription) => {
            const automatic = subscription.terms.renewal === "automatic";
            return (
              <Box
                key={subscription.id}
                sx={{
                  display: "grid",
                  gap: 1,
                  gridTemplateColumns: { md: "minmax(0, 1fr) auto auto" },
                  alignItems: { md: "center" },
                  py: 0.5,
                }}
              >
                <Box>
                  <Typography sx={{ fontWeight: 700 }}>
                    {subscription.terms.package_name}
                  </Typography>
                  <Typography color="text.secondary" variant="body2">
                    {subscription.state.replaceAll("_", " ")}
                  </Typography>
                </Box>
                <Box>
                  <Typography color="text.secondary" variant="caption">
                    Package invoice amount due
                  </Typography>
                  <Typography sx={{ fontWeight: 700 }}>
                    {subscriptionMoney(
                      subscription.balance,
                      subscription.currency,
                    )}
                  </Typography>
                </Box>
                <Box sx={{ minWidth: { md: 190 } }}>
                  <Typography color="text.secondary" variant="caption">
                    Next charge
                  </Typography>
                  <Typography sx={{ fontWeight: 700 }}>
                    {automatic && subscription.renewal_amount_due
                      ? subscriptionMoney(
                          subscription.renewal_amount_due,
                          subscription.currency,
                        )
                      : automatic
                        ? "Pending processor sync"
                        : "No automatic charge"}
                  </Typography>
                  {automatic && subscription.ends_at && (
                    <Typography color="text.secondary" variant="caption">
                      Expected at term renewal{" "}
                      {subscriptionDate(subscription.ends_at)}
                    </Typography>
                  )}
                </Box>
              </Box>
            );
          })
        )}
      </Stack>
    </Paper>
  );
}

export function GuidedCheckout({
  patientId,
  encounterId,
  invoiceId,
  ledger,
}: {
  patientId: number;
  encounterId: number;
  invoiceId?: number;
  ledger: BillingPatientLedger;
}) {
  const encounter = useResource<{ encounter: EncounterDetail }>(
    `/api/clinic/encounters/${encounterId}?patient_id=${patientId}`,
  );
  const completion = useResource<EncounterCompletionResponse>(
    `/api/clinic/encounters/${encounterId}/completion?patient_id=${patientId}`,
  );
  const followUpRecord = useResource<{
    follow_up: EncounterFollowUpRecord | null;
  }>(`/api/clinic/encounters/${encounterId}/follow_up`);
  const packages = useResource<{
    subscriptions: Subscription[];
    truncated: boolean;
  }>(`/api/clinic/subscriptions?patient_id=${patientId}`);

  const invoice = ledger.invoices.find((item) => item.id === invoiceId);
  const receipt = invoice
    ? ledger.payments.find(
        (payment) =>
          payment.receipt_available &&
          payment.allocations.some(
            (allocation) => allocation.invoice_id === invoice.id,
          ),
      )
    : undefined;
  const encounterHref = `/clinic/patients/${patientId}/encounters/${encounterId}`;
  const completionEvidence = completion.data?.evidence;
  const encounterClosed =
    encounter.data?.encounter.status === "completed" &&
    Boolean(completion.data?.completion_review);
  const invoiceSettled =
    invoice?.status === "posted" && isZero(invoice.balance_amount);
  const followUp = completionEvidence?.follow_up ?? null;
  const followUpReady =
    followUp !== null &&
    ["not_required", "arranged", "completed"].includes(followUp.status);
  const steps: ChecklistStep[] = [
    {
      label: "Encounter handoff",
      complete: encounterClosed,
      detail: encounter.error
        ? "Encounter status could not be refreshed. Review the encounter before continuing."
        : encounterClosed
          ? "The encounter and completion review are recorded."
          : "The encounter still needs a recorded completion review.",
      action: { href: encounterHref, label: "Review encounter" },
    },
    {
      label: "Invoice",
      complete: invoice?.status === "posted",
      detail: invoice
        ? invoice.status === "posted"
          ? `Invoice #${invoice.id} is posted with a ${subscriptionMoney(invoice.balance_amount, invoice.currency)} balance.`
          : `Invoice #${invoice.id} is still a draft.`
        : "No active invoice is linked to this encounter yet.",
      action: { href: "#checkout-invoice-actions", label: "Review invoice" },
    },
    {
      label: "Payment",
      complete: invoiceSettled,
      detail: invoiceSettled
        ? "The server reports no remaining invoice balance."
        : invoice?.online_payment.state === "processing" ||
            invoice?.online_payment.state === "needs_reconciliation"
          ? "Online payment is unresolved. Refresh its processor status before continuing."
          : invoice?.status === "posted"
            ? `A ${subscriptionMoney(invoice.balance_amount, invoice.currency)} balance remains.`
            : "Post the invoice before collecting payment.",
      action: { href: "#checkout-invoice-actions", label: "Review payment" },
    },
    {
      label: "Receipt",
      complete: Boolean(receipt),
      detail: receipt
        ? `Receipt is available for payment #${receipt.id}.`
        : invoiceSettled
          ? "No printable receipt was returned for this invoice payment."
          : "A receipt becomes available only after a recorded eligible payment.",
      ...(receipt
        ? {
            action: {
              href: `/api/clinic/payment_events/${receipt.id}/receipt`,
              label: "Open receipt",
            },
          }
        : {}),
    },
    {
      label: "Follow-up",
      complete: followUpReady,
      detail: completion.error
        ? "Follow-up status could not be refreshed. Review the encounter before checkout handoff."
        : followUp?.status === "arranged" &&
            followUpRecord.data?.follow_up?.follow_up_appointment
          ? `Follow-up is arranged for ${subscriptionDate(followUpRecord.data.follow_up.follow_up_appointment.starts_at, true)}.`
          : followUpLabel(followUp),
      action: { href: encounterHref, label: "Review follow-up" },
    },
  ];
  const completeCount = steps.filter((step) => step.complete).length;

  return (
    <Stack spacing={2}>
      <Paper component="section" variant="outlined" sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{
              alignItems: { sm: "center" },
              justifyContent: "space-between",
            }}
          >
            <Box>
              <Typography component="h2" variant="h2">
                Guided checkout
              </Typography>
              <Typography color="text.secondary" variant="body2">
                Work from persisted encounter, billing, receipt, and follow-up
                status. Each step remains open until the server reports it done.
              </Typography>
            </Box>
            <Chip
              color={completeCount === steps.length ? "success" : "default"}
              icon={
                completeCount === steps.length ? (
                  <CheckCircleOutlineIcon />
                ) : (
                  <PendingOutlinedIcon />
                )
              }
              label={`${completeCount} of ${steps.length} ready`}
              variant="outlined"
            />
          </Stack>
          {(encounter.error || completion.error || followUpRecord.error) && (
            <Alert severity="warning">
              Some encounter readiness could not be refreshed. Financial status
              below is unchanged; review the encounter before handoff.
            </Alert>
          )}
          <Stepper orientation="vertical" nonLinear>
            {steps.map((step) => (
              <Step key={step.label} active completed={step.complete}>
                <StepLabel
                  error={!step.complete}
                  optional={
                    <Typography color="text.secondary" variant="caption">
                      {step.complete ? "Recorded" : "Needs attention"}
                    </Typography>
                  }
                >
                  {step.label}
                </StepLabel>
                <StepContent
                  slotProps={{ transition: { unmountOnExit: false } }}
                >
                  <Stack spacing={1} sx={{ pb: 1 }}>
                    <Typography color="text.secondary" variant="body2">
                      {step.detail}
                    </Typography>
                    {step.action && (
                      <Button
                        component="a"
                        href={step.action.href}
                        startIcon={
                          step.label === "Receipt" ? (
                            <ReceiptLongOutlinedIcon />
                          ) : undefined
                        }
                        sx={{ alignSelf: "flex-start" }}
                        variant="text"
                      >
                        {step.action.label}
                      </Button>
                    )}
                  </Stack>
                </StepContent>
              </Step>
            ))}
          </Stepper>
        </Stack>
      </Paper>
      {packages.error ? (
        <Alert severity="warning">
          Package balance and next charge could not be refreshed.
        </Alert>
      ) : packages.data ? (
        <PackagePosition subscriptions={packages.data.subscriptions} />
      ) : (
        <Paper component="section" variant="outlined" sx={{ p: 2.5 }}>
          <Typography color="text.secondary" variant="body2">
            Loading package balance and next charge…
          </Typography>
        </Paper>
      )}
    </Stack>
  );
}
