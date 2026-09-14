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
  recover?: { label: string; run: () => void };
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

function nextChargeLabel(subscription: Subscription) {
  if (subscription.terms.renewal !== "automatic") return "No automatic charge";
  if (subscription.state !== "active") return "Unavailable until active";
  if (subscription.renewal_canceled) return "No automatic charge scheduled";
  if (
    !["stripe", "local_membership_simulator"].includes(
      subscription.processor ?? "",
    )
  )
    return "No processor-derived amount";
  if (!subscription.renewal_amount_due) return "Not returned by the processor";
  return subscriptionMoney(
    subscription.renewal_amount_due,
    subscription.currency,
  );
}

function PackagePosition({
  subscriptions,
  truncated,
}: {
  subscriptions: Subscription[];
  truncated: boolean;
}) {
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
            Amounts below come from recorded billing sources. They do not
            represent remaining included visits or services.
          </Typography>
        </Box>
        {truncated && (
          <Alert severity="warning">
            This package list was capped by the server. Verify the patient’s
            remaining package records before relying on the next-charge view.
          </Alert>
        )}
        {current.length === 0 ? (
          <Typography color="text.secondary" variant="body2">
            No current package or membership was returned for this patient.
          </Typography>
        ) : (
          current.map((subscription) => {
            const automatic = subscription.terms.renewal === "automatic";
            const processorAmountAvailable =
              automatic &&
              subscription.state === "active" &&
              !subscription.renewal_canceled &&
              ["stripe", "local_membership_simulator"].includes(
                subscription.processor ?? "",
              ) &&
              Boolean(subscription.renewal_amount_due);
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
                  {subscription.processor === "local_membership_simulator" && (
                    <Typography color="text.secondary" variant="body2">
                      Local payment simulation · no vendor-confirmed transaction
                    </Typography>
                  )}
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
                    {nextChargeLabel(subscription)}
                  </Typography>
                  {processorAmountAvailable && subscription.ends_at && (
                    <Typography color="text.secondary" variant="caption">
                      {subscription.processor === "local_membership_simulator"
                        ? "Local simulated amount"
                        : "Processor-derived amount"}{" "}
                      for renewal around{" "}
                      {subscriptionDate(subscription.ends_at)}
                    </Typography>
                  )}
                  {processorAmountAvailable && subscription.last_synced_at && (
                    <Typography
                      color="text.secondary"
                      sx={{ display: "block" }}
                      variant="caption"
                    >
                      Last synced{" "}
                      {subscriptionDate(subscription.last_synced_at)}
                    </Typography>
                  )}
                </Box>
                {subscription.renewal_invoice_status === "open" &&
                  subscription.renewal_amount_due &&
                  !isZero(subscription.renewal_amount_due) && (
                    <Alert severity="warning" sx={{ gridColumn: "1 / -1" }}>
                      Renewal invoice remains open:{" "}
                      {subscriptionMoney(
                        subscription.renewal_amount_due,
                        subscription.currency,
                      )}
                      .
                      {subscription.renewal_canceled
                        ? " Canceling future renewals does not settle this invoice."
                        : " Billing follow-up is needed."}
                      <Button
                        href={`/clinic/subscriptions?patient_id=${subscription.patient_id}`}
                        size="small"
                      >
                        Review membership billing
                      </Button>
                    </Alert>
                  )}
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

  const encounterHref = `/clinic/patients/${patientId}/encounters/${encounterId}`;
  const encounterRecord = encounter.data?.encounter;
  const encounterMatches =
    encounterRecord?.id === encounterId &&
    encounterRecord.patient_id === patientId;
  const completionMatches =
    completion.data?.patient_id === patientId &&
    completion.data.encounter_id === encounterId;
  const completionEvidence =
    completionMatches && completion.data ? completion.data.evidence : undefined;
  const completionReview =
    completionMatches && completion.data
      ? completion.data.completion_review
      : null;
  const completionReviewMatches =
    completionReview?.patient_id === patientId &&
    completionReview.encounter_id === encounterId;
  const linkedInvoiceId = completionEvidence?.checkout.invoice_id ?? null;
  const ledgerPatientMatches = ledger.patient.id === patientId;
  const invoiceLinkMismatch =
    completionMatches && (invoiceId ?? null) !== linkedInvoiceId;
  const invoiceLinkConfirmed =
    ledgerPatientMatches &&
    completionEvidence?.checkout.status === "in_progress" &&
    linkedInvoiceId !== null &&
    !invoiceLinkMismatch;
  const invoice = invoiceLinkConfirmed
    ? ledger.invoices.find((item) => item.id === linkedInvoiceId)
    : undefined;
  const allocatedPaymentIds = new Set(
    invoice?.allocations
      .filter((allocation) => !isZero(allocation.amount))
      .map((allocation) => allocation.payment_event_id) ?? [],
  );
  const recordedPayment = ledger.payments.find(
    (payment) =>
      allocatedPaymentIds.has(payment.id) &&
      payment.allocations.some(
        (allocation) =>
          allocation.invoice_id === invoice?.id && !isZero(allocation.amount),
      ),
  );
  const receipt = recordedPayment?.receipt_available
    ? recordedPayment
    : undefined;
  const encounterClosed =
    !encounter.error &&
    !completion.error &&
    encounterMatches &&
    encounterRecord?.status === "completed" &&
    completionReviewMatches;
  const invoicePosted = invoice?.status === "posted";
  const invoiceSettled =
    invoicePosted === true && isZero(invoice.balance_amount);
  const paymentReady = invoiceSettled;
  const receiptReady = paymentReady && (!recordedPayment || Boolean(receipt));
  const followUp = completionEvidence?.follow_up ?? null;
  const followUpRecordValue = followUpRecord.data?.follow_up ?? null;
  const followUpRecordMatches =
    !completion.error &&
    !followUpRecord.error &&
    followUp !== null &&
    followUpRecordValue !== null &&
    followUpRecordValue.id === followUp.id &&
    followUpRecordValue.patient_id === patientId &&
    followUpRecordValue.encounter_id === encounterId &&
    followUpRecordValue.status === followUp.status &&
    followUpRecordValue.version === followUp.version;
  const arrangedAppointmentValid =
    followUp?.status !== "arranged" ||
    (followUpRecordMatches &&
      followUpRecordValue?.follow_up_appointment !== null &&
      followUpRecordValue?.follow_up_appointment !== undefined &&
      ["scheduled", "confirmed"].includes(
        followUpRecordValue.follow_up_appointment.status,
      ));
  const followUpReady =
    followUp !== null &&
    followUpRecordMatches &&
    arrangedAppointmentValid &&
    ["not_required", "arranged", "completed"].includes(followUp.status);
  const sourceIdentityMismatch =
    (encounter.data !== undefined && !encounterMatches) ||
    (completion.data !== undefined && !completionMatches) ||
    !ledgerPatientMatches ||
    invoiceLinkMismatch ||
    (followUpRecord.data?.follow_up !== null &&
      followUpRecord.data?.follow_up !== undefined &&
      (followUpRecord.data.follow_up.patient_id !== patientId ||
        followUpRecord.data.follow_up.encounter_id !== encounterId));
  const packagePatientMismatch =
    packages.data?.subscriptions.some(
      (subscription) =>
        subscription.patient_id !== undefined &&
        subscription.patient_id !== patientId,
    ) ?? false;
  const encounterDetail = encounter.error
    ? "Encounter status could not be refreshed. Review the encounter before continuing."
    : !encounter.data
      ? "Refreshing the persisted encounter status."
      : !encounterMatches
        ? "The returned encounter does not match this patient and encounter. Refresh before continuing."
        : completion.error
          ? "Completion evidence could not be refreshed. The encounter remains open in checkout."
          : !completion.data
            ? "Refreshing the persisted completion review."
            : !completionMatches ||
                (completionReview !== null && !completionReviewMatches)
              ? "The completion review does not match this patient and encounter."
              : encounterClosed
                ? "The encounter and completion review are recorded."
                : "The encounter still needs a recorded completion review.";
  const invoiceDetail = completion.error
    ? "The server-derived checkout link could not be refreshed. Invoice status remains open."
    : !completion.data
      ? "Refreshing the server-derived checkout link."
      : !completionMatches
        ? "The checkout evidence does not match this patient and encounter."
        : invoiceLinkMismatch
          ? "The selected invoice does not match the invoice linked to this encounter. Refresh billing before continuing."
          : completionEvidence?.checkout.status !== "in_progress"
            ? "No active invoice is linked to this completed encounter yet."
            : !invoice
              ? `Linked invoice #${linkedInvoiceId} was not returned in this patient ledger. Refresh billing before continuing.`
              : invoice.status === "posted"
                ? `Invoice #${invoice.id} is posted with a ${subscriptionMoney(invoice.balance_amount, invoice.currency)} balance.`
                : `Invoice #${invoice.id} is still a draft.`;
  const paymentDetail = !invoicePosted
    ? "Post the encounter-linked invoice before resolving payment."
    : paymentReady && recordedPayment
      ? `Recorded payment #${recordedPayment.id} is allocated and the server reports no remaining balance.`
      : paymentReady && !isZero(invoice?.credit_amount ?? "0")
        ? "The recorded invoice and adjustments leave no amount due; no payment is represented."
        : paymentReady
          ? "The posted invoice has no remaining amount to collect; no payment is represented."
          : invoice?.online_payment.state === "processing" ||
              invoice?.online_payment.state === "needs_reconciliation"
            ? "Online payment is unresolved. Refresh its processor status before continuing."
            : invoicePosted
              ? `A ${subscriptionMoney(invoice.balance_amount, invoice.currency)} balance remains.`
              : "The encounter-linked invoice could not be confirmed.";
  const receiptDetail = receipt
    ? `Receipt is available for payment #${receipt.id}.`
    : paymentReady && !recordedPayment
      ? "No receipt is required because no payment is recorded for this settled invoice."
      : paymentReady
        ? "A payment is recorded, but no printable receipt was returned."
        : "A receipt becomes available only after a recorded eligible payment.";
  const followUpDetail =
    completion.error || followUpRecord.error
      ? "Follow-up status could not be refreshed. It remains open until both persisted sources can be reconciled."
      : !completion.data || !followUpRecord.data
        ? "Refreshing the persisted follow-up disposition."
        : !followUp
          ? followUpLabel(null)
          : !followUpRecordMatches
            ? "The follow-up record changed or does not match this patient encounter. Refresh before checkout handoff."
            : followUp.status === "arranged" && !arrangedAppointmentValid
              ? "The arranged follow-up has no active linked appointment and remains open."
              : followUp.status === "arranged" &&
                  followUpRecordValue?.follow_up_appointment
                ? `Follow-up is arranged for ${subscriptionDate(followUpRecordValue.follow_up_appointment.starts_at, true)}.`
                : followUpLabel(followUp);
  const steps: ChecklistStep[] = [
    {
      label: "Encounter handoff",
      complete: encounterClosed,
      detail: encounterDetail,
      action: { href: encounterHref, label: "Review encounter" },
      recover:
        encounter.error || completion.error || sourceIdentityMismatch
          ? {
              label: "Refresh encounter evidence",
              run: () => {
                encounter.refresh();
                completion.refresh();
              },
            }
          : undefined,
    },
    {
      label: "Invoice",
      complete: invoicePosted === true,
      detail: invoiceDetail,
      action: { href: "#checkout-invoice-actions", label: "Review invoice" },
      recover: completion.error
        ? { label: "Refresh checkout link", run: completion.refresh }
        : undefined,
    },
    {
      label: "Payment",
      complete: paymentReady,
      detail: paymentDetail,
      action: { href: "#checkout-invoice-actions", label: "Review payment" },
    },
    {
      label: "Receipt",
      complete: receiptReady,
      detail: receiptDetail,
      action: receipt
        ? {
            href: `/api/clinic/payment_events/${receipt.id}/receipt`,
            label: "Open receipt",
          }
        : { href: "#checkout-invoice-actions", label: "Review receipt" },
    },
    {
      label: "Follow-up",
      complete: followUpReady,
      detail: followUpDetail,
      action: { href: encounterHref, label: "Review follow-up" },
      recover:
        completion.error ||
        followUpRecord.error ||
        (completion.data !== undefined &&
          followUpRecord.data !== undefined &&
          !followUpRecordMatches)
          ? {
              label: "Refresh follow-up evidence",
              run: () => {
                completion.refresh();
                followUpRecord.refresh();
              },
            }
          : undefined,
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
          {(encounter.error ||
            completion.error ||
            followUpRecord.error ||
            sourceIdentityMismatch) && (
            <Alert severity="warning">
              Some persisted checkout evidence is unavailable or does not match
              this patient encounter. Affected steps remain open until the
              source is refreshed or corrected.
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
                    {step.recover && (
                      <Button
                        onClick={step.recover.run}
                        sx={{ alignSelf: "flex-start" }}
                        variant="outlined"
                      >
                        {step.recover.label}
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
        <Alert
          action={<Button onClick={packages.refresh}>Retry</Button>}
          severity="warning"
        >
          Package balance and next charge could not be refreshed.
        </Alert>
      ) : packagePatientMismatch ? (
        <Alert
          action={<Button onClick={packages.refresh}>Retry</Button>}
          severity="error"
        >
          Package records did not match this patient. No next-charge amount is
          shown until the source is refreshed.
        </Alert>
      ) : packages.data ? (
        <PackagePosition
          subscriptions={packages.data.subscriptions}
          truncated={packages.data.truncated}
        />
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
