import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Paper,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { api } from "../../api/client";
import { LoadState, useResource } from "../../shared/ui";
import { PackageCard } from "../clinic/subscriptions/PackageCard";
import { MembershipCatalog } from "./MembershipCatalog";
import {
  stateLabel,
  subscriptionDate,
  subscriptionMoney,
  type PackageTerms,
  type PublishedPackage,
  type Subscription,
  type SubscriptionReceipt,
} from "../clinic/subscriptions/contracts";

function statusColor(
  state: string,
): "default" | "success" | "warning" | "error" {
  if (state === "active") return "success";
  if (["pending_review", "pending_payment", "processing"].includes(state))
    return "warning";
  if (state === "outcome_unknown") return "warning";
  if (state === "payment_failed") return "error";
  return "default";
}

function renewalNeedsPayment(subscription: Subscription) {
  return ["past_due", "unpaid", "incomplete", "incomplete_expired"].includes(
    subscription.renewal_status || "",
  );
}

function openStripeCheckout(checkoutUrl: string) {
  const url = new URL(checkoutUrl);
  if (
    url.protocol !== "https:" ||
    !["checkout.stripe.com", "invoice.stripe.com"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port
  ) {
    throw new Error("Stripe returned an invalid Checkout address.");
  }
  window.location.assign(url.href);
}

export function PatientSubscriptions({ onChanged }: { onChanged: () => void }) {
  const phone = useMediaQuery("(max-width:599px)");
  const resource = useResource<{
    catalog: PublishedPackage[];
    subscriptions: Subscription[];
    can_purchase: boolean;
    processor: "stripe" | "development_fixture";
  }>("/api/patient_portal/subscriptions");
  const [selected, setSelected] = useState<PublishedPackage | null>(null);
  const [selections, setSelections] = useState<number[]>([]);
  const [quote, setQuote] = useState<PackageTerms | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [purchaseKey, setPurchaseKey] = useState("");
  const [receipts, setReceipts] = useState<SubscriptionReceipt[] | null>(null);
  const [receiptTarget, setReceiptTarget] = useState<Subscription | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Subscription | null>(null);
  const stripeReturn =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("stripe_payment");
  const run = async (action: () => Promise<void>, refresh = true) => {
    setBusy(true);
    setError("");
    try {
      await action();
      if (refresh) {
        resource.refresh();
        onChanged();
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
    return false;
  };
  const data = resource.data;
  const choose = (p: PublishedPackage) => {
    setSelected(p);
    setSelections([]);
    setQuote(null);
    setPurchaseKey(crypto.randomUUID());
    setError("");
  };
  return (
    <Box sx={{ minWidth: 0 }}>
      <Stack spacing={2}>
        {(!data || resource.error) && <LoadState error={resource.error} />}
        {error && !selected && <Alert severity="error">{error}</Alert>}
        {notice && (
          <Alert severity="success" onClose={() => setNotice("")}>
            {notice}
          </Alert>
        )}
        {stripeReturn === "return" && (
          <Alert severity="info">
            You returned from Stripe Checkout. Payment and access appear below
            only after Stripe confirms the charge. Use Check payment status if
            the membership is still processing.
          </Alert>
        )}
        {stripeReturn === "cancel" && (
          <Alert severity="warning">
            Stripe Checkout was closed before payment was confirmed. Your card
            was not recorded by APPly. You can safely resume the existing
            Checkout session below.
          </Alert>
        )}
        {data && (
          <MembershipCatalog
            catalog={data.catalog}
            busy={busy}
            canPurchase={data.can_purchase}
            onChoose={choose}
          />
        )}
        <Typography
          variant="h2"
          id="my-memberships"
          sx={{ pt: 3, scrollMarginTop: 24 }}
        >
          Your memberships
        </Typography>
        {data && !data.subscriptions.length && (
          <Typography color="text.secondary">
            Once you join, your membership, payment status, and receipts will
            appear here.
          </Typography>
        )}
        <Stack spacing={2}>
          {data?.subscriptions.map((subscription) => (
            <Paper
              key={subscription.id}
              variant="outlined"
              sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2 }}
            >
              <Stack spacing={2}>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  sx={{
                    justifyContent: "space-between",
                    alignItems: { sm: "flex-start" },
                    gap: 1.5,
                  }}
                >
                  <Box>
                    <Typography variant="h5" component="h3">
                      {subscription.terms.package_name}
                    </Typography>
                    <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                      {subscription.terms.family_name} · Membership #
                      {subscription.id}
                    </Typography>
                  </Box>
                  <Stack
                    direction="row"
                    sx={{ alignItems: "center", gap: 1.5, flexWrap: "wrap" }}
                  >
                    <Chip
                      size="small"
                      label={stateLabel(subscription.state)}
                      color={statusColor(subscription.state)}
                      variant={
                        subscription.state === "active" ? "filled" : "outlined"
                      }
                    />
                    <Typography
                      sx={{
                        fontWeight: 650,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {subscriptionMoney(
                        subscription.amount,
                        subscription.currency,
                      )}
                      {subscription.terms.renewal === "automatic"
                        ? " / month"
                        : ""}
                    </Typography>
                  </Stack>
                </Stack>

                {renewalNeedsPayment(subscription) && (
                  <Alert severity="warning">
                    Your latest monthly renewal needs payment. Access remains
                    tied to your last verified paid period. Use Resolve payment
                    in Stripe below, then check the payment status.
                  </Alert>
                )}
                {subscription.checkout_status === "expired" && (
                  <Alert severity="warning">
                    This Stripe Checkout session expired without a verified
                    payment. Check payment status so the clinic can close this
                    enrollment; then you can start again from the current
                    catalog.
                  </Alert>
                )}
                {["processing", "outcome_unknown"].includes(
                  subscription.state,
                ) &&
                  subscription.checkout_status !== "expired" && (
                    <Alert severity="info">
                      Stripe has not confirmed payment yet. Do not start a
                      second membership. Resume Checkout or check payment status
                      below.
                    </Alert>
                  )}
                {subscription.state === "payment_failed" &&
                  !renewalNeedsPayment(subscription) && (
                    <Alert severity="error">
                      Payment was not completed. Your membership will activate
                      only after Stripe confirms a successful charge.
                    </Alert>
                  )}
                {subscription.state === "pending_review" && (
                  <Alert severity="info">
                    The clinic must approve eligibility before payment. You do
                    not need to submit another membership request.
                  </Alert>
                )}

                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: {
                      xs: "1fr",
                      sm: "repeat(2, minmax(0, 1fr))",
                    },
                    gap: 2,
                    py: 2,
                    borderBlock: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Current paid period
                    </Typography>
                    <Typography sx={{ fontWeight: 600, mt: 0.25 }}>
                      {subscription.starts_at && subscription.ends_at
                        ? `${subscriptionDate(subscription.starts_at)} – ${subscriptionDate(subscription.ends_at)}`
                        : "No paid period confirmed"}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Renewal
                    </Typography>
                    <Typography sx={{ fontWeight: 600, mt: 0.25 }}>
                      {subscription.terms.renewal === "automatic"
                        ? subscription.renewal_canceled
                          ? "Canceled after current paid period"
                          : subscription.ends_at
                            ? `Next billing date ${subscriptionDate(subscription.ends_at)}`
                            : "Starts after the first verified payment"
                        : subscription.terms.renewal === "manual"
                          ? "Renew manually after this term"
                          : "No renewal"}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Invoice
                    </Typography>
                    <Typography sx={{ fontWeight: 600, mt: 0.25 }}>
                      #{subscription.invoice_id} ·{" "}
                      {stateLabel(subscription.invoice_status)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Balance
                    </Typography>
                    <Typography sx={{ fontWeight: 600, mt: 0.25 }}>
                      {subscriptionMoney(
                        subscription.renewal_amount_due || subscription.balance,
                        subscription.currency,
                      )}
                      {subscription.renewal_invoice_status
                        ? ` · ${stateLabel(subscription.renewal_invoice_status)}`
                        : ""}
                    </Typography>
                  </Box>
                </Box>

                {subscription.terms.selected_components?.length ? (
                  <Typography variant="body2" color="text.secondary">
                    Included services:{" "}
                    {subscription.terms.selected_components
                      .map(
                        (component) =>
                          `${component.name} (${component.quantity}/${component.frequency})`,
                      )
                      .join(", ")}
                  </Typography>
                ) : null}
                {subscription.renewal_status && (
                  <Typography variant="body2" color="text.secondary">
                    Stripe subscription:{" "}
                    {stateLabel(subscription.renewal_status)}
                    {subscription.last_synced_at
                      ? ` · checked ${subscriptionDate(subscription.last_synced_at, true)}`
                      : ""}
                  </Typography>
                )}
                {subscription.cancellation_effective_at && (
                  <Alert severity="info">
                    {subscription.terms.renewal === "automatic"
                      ? "Future renewals are canceled. Verified membership access ends "
                      : "Membership cancellation is effective "}
                    {subscriptionDate(
                      subscription.cancellation_effective_at,
                      true,
                    )}
                    .
                  </Alert>
                )}

                <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
                  {data.can_purchase &&
                    ([
                      "pending_payment",
                      "review_approved",
                      "payment_failed",
                    ].includes(subscription.state) ||
                      (subscription.processor === "stripe" &&
                        (subscription.state === "processing" ||
                          renewalNeedsPayment(subscription)))) && (
                      <Button
                        disabled={busy}
                        variant="contained"
                        onClick={() =>
                          void run(async () => {
                            const payment = await api<{
                              checkout_url?: string;
                            }>(
                              `/api/patient_portal/subscriptions/${subscription.id}/pay`,
                              {
                                method: "POST",
                                body: { request_key: crypto.randomUUID() },
                              },
                            );
                            if (payment.checkout_url)
                              openStripeCheckout(payment.checkout_url);
                          })
                        }
                      >
                        {busy
                          ? "Opening Stripe…"
                          : renewalNeedsPayment(subscription)
                            ? "Resolve payment in Stripe"
                            : subscription.processor === "stripe" ||
                                subscription.terms.renewal === "automatic"
                              ? "Resume Stripe Checkout"
                              : "Request test payment"}
                      </Button>
                    )}
                  {data.can_purchase &&
                    subscription.processor === "stripe" &&
                    ([
                      "processing",
                      "outcome_unknown",
                      "payment_failed",
                    ].includes(subscription.state) ||
                      renewalNeedsPayment(subscription)) && (
                      <Button
                        variant="outlined"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await api(
                              `/api/patient_portal/subscriptions/${subscription.id}/reconcile`,
                              {
                                method: "POST",
                                body: { request_key: crypto.randomUUID() },
                              },
                            );
                          })
                        }
                      >
                        {busy ? "Checking…" : "Check payment status"}
                      </Button>
                    )}
                  {data.can_purchase &&
                    !subscription.renewal_canceled &&
                    ((subscription.terms.renewal === "automatic" &&
                      (subscription.checkout_status === "open" ||
                        (subscription.renewal_status &&
                          !["canceled", "incomplete_expired"].includes(subscription.renewal_status)))) ||
                      ![
                        "processing",
                        "outcome_unknown",
                        "expired",
                        "canceled",
                        "refunded",
                        "review_declined",
                      ].includes(subscription.state)) && (
                      <Button
                        color="error"
                        disabled={busy}
                        onClick={() => setCancelTarget(subscription)}
                      >
                        {subscription.terms.renewal === "automatic"
                          ? "Cancel future renewals"
                          : "Cancel membership"}
                      </Button>
                    )}
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const result = await api<{
                          receipts: SubscriptionReceipt[];
                        }>(
                          `/api/patient_portal/subscriptions/${subscription.id}/receipt`,
                        );
                        setReceiptTarget(subscription);
                        setReceipts(result.receipts);
                      }, false)
                    }
                  >
                    View payment receipts
                  </Button>
                </Stack>
                {subscription.processor === "stripe" &&
                  subscription.state !== "refunded" && (
                    <Typography variant="body2" color="text.secondary">
                      Need a refund? Contact the clinic. Refund decisions and
                      Stripe actions are handled by clinic billing staff;
                      verified refunds appear in your billing history afterward.
                    </Typography>
                  )}
                {subscription.state === "refunded" && (
                  <Typography variant="body2" color="text.secondary">
                    The verified refund is included in your billing history and
                    payment receipts.
                  </Typography>
                )}
              </Stack>
            </Paper>
          ))}
        </Stack>
        <Dialog
          open={!!selected}
          onClose={() => !busy && setSelected(null)}
          maxWidth="sm"
          fullWidth
          fullScreen={phone}
          aria-labelledby="subscription-confirm-title"
        >
          <DialogTitle id="subscription-confirm-title">
            {quote
              ? "Your membership, ready to review."
              : "Make this membership yours."}
          </DialogTitle>
          <DialogContent
            sx={{ "& > .MuiStack-root > .MuiPaper-root": { border: 0, p: 0 } }}
          >
            <Stack spacing={2}>
              <Stepper activeStep={quote ? 1 : 0} sx={{ py: 1 }}>
                <Step>
                  <StepLabel>Personalize</StepLabel>
                </Step>
                <Step>
                  <StepLabel>Review & confirm</StepLabel>
                </Step>
              </Stepper>
              <Typography color="text.secondary">
                {quote
                  ? "Review your selected services, exact total, and membership terms below."
                  : "Included services come with your plan. Choose any available extras below; you’ll review the exact total next."}
              </Typography>
              {data && !data.can_purchase && (
                <Alert severity="info">
                  You’re exploring a read-only patient view. You can compare
                  services here; purchasing requires an authorized patient
                  account.
                </Alert>
              )}
              {error && <Alert severity="error">{error}</Alert>}
              {selected && (
                <PackageCard
                  terms={quote || selected.terms}
                  selections={selections}
                  onSelect={
                    quote
                      ? undefined
                      : (ids) => {
                          setSelections(ids);
                          setQuote(null);
                        }
                  }
                />
              )}
              {quote && (
                <Alert severity="info">
                  {quote.renewal === "automatic"
                    ? "This membership renews every month at the exact price shown until canceled. Cancellation stops future charges after the current paid period. "
                    : "This creates a subscription invoice. "}
                  {data?.processor === "stripe" || quote.renewal === "automatic"
                    ? "Payment details are entered securely in Stripe Checkout. This setup uses sandbox payments."
                    : "Payments use a local test processor; no real money moves."}
                </Alert>
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button
              disabled={busy}
              onClick={() => (quote ? setQuote(null) : setSelected(null))}
            >
              {quote ? "Back" : "Cancel"}
            </Button>
            <Button
              variant="contained"
              disabled={busy || (!!quote && !data?.can_purchase)}
              onClick={() =>
                selected &&
                void run(async () => {
                  if (!quote) {
                    setQuote(
                      (
                        await api<{ terms: PackageTerms }>(
                          "/api/patient_portal/subscriptions/quote",
                          {
                            method: "POST",
                            body: { version_id: selected.id, selections },
                          },
                        )
                      ).terms,
                    );
                  } else {
                    const created = await api<Subscription>(
                      "/api/patient_portal/subscriptions/checkout",
                      {
                        method: "POST",
                        body: {
                          version_id: selected.id,
                          selections,
                          request_key: purchaseKey,
                        },
                      },
                    );
                    if (
                      !quote.eligibility_review &&
                      (data?.processor === "stripe" ||
                        quote.renewal === "automatic")
                    ) {
                      const payment = await api<{ checkout_url?: string }>(
                        `/api/patient_portal/subscriptions/${created.id}/pay`,
                        {
                          method: "POST",
                          body: { request_key: crypto.randomUUID() },
                        },
                      );
                      if (payment.checkout_url)
                        openStripeCheckout(payment.checkout_url);
                    } else {
                      setSelected(null);
                      setNotice(
                        quote.eligibility_review
                          ? "Membership request received. The clinic must approve eligibility before payment."
                          : "Membership request received. Your payment step is available below.",
                      );
                    }
                  }
                }, !!quote)
              }
            >
              {busy
                ? "Please wait…"
                : quote
                  ? quote.eligibility_review
                    ? "Submit for clinic review"
                    : data?.processor === "stripe" ||
                        quote.renewal === "automatic"
                      ? "Confirm and continue to Stripe"
                      : "Confirm membership"
                  : "Review exact price"}
            </Button>
          </DialogActions>
        </Dialog>
        <Dialog
          open={Boolean(cancelTarget)}
          onClose={() => !busy && setCancelTarget(null)}
          fullWidth
          maxWidth="xs"
          aria-labelledby="patient-cancel-membership-title"
        >
          <DialogTitle id="patient-cancel-membership-title">
            Cancel future renewals?
          </DialogTitle>
          <DialogContent>
            <Typography>
              {cancelTarget?.terms.renewal === "automatic"
                ? `You will not be charged for another month. Your current paid access continues${cancelTarget.ends_at ? ` through ${subscriptionDate(cancelTarget.ends_at)}` : " through the verified paid period"}.`
                : "This cancels the membership according to the terms you accepted."}
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button disabled={busy} onClick={() => setCancelTarget(null)}>
              Keep membership
            </Button>
            <Button
              color="error"
              variant="contained"
              disabled={busy || !cancelTarget}
              onClick={() => {
                if (!cancelTarget) return;
                const target = cancelTarget;
                void run(async () => {
                  await api(
                    `/api/patient_portal/subscriptions/${target.id}/cancel`,
                    {
                      method: "POST",
                      body: { request_key: crypto.randomUUID() },
                    },
                  );
                  setCancelTarget(null);
                  setNotice(
                    target.terms.renewal === "automatic"
                      ? "Future renewals canceled. Your current paid access remains available through the date shown."
                      : "Membership canceled.",
                  );
                });
              }}
            >
              {busy ? "Canceling…" : "Confirm cancellation"}
            </Button>
          </DialogActions>
        </Dialog>
        <Dialog
          open={receipts !== null}
          onClose={() => {
            setReceipts(null);
            setReceiptTarget(null);
          }}
          fullWidth
          maxWidth="sm"
          aria-labelledby="subscription-receipts-title"
        >
          <DialogTitle id="subscription-receipts-title">
            Payment receipts
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2}>
              {receiptTarget && (
                <Typography color="text.secondary">
                  {receiptTarget.terms.family_name} /{" "}
                  {receiptTarget.terms.package_name}
                </Typography>
              )}
              {!receipts?.length && (
                <Alert severity="info">
                  No payment receipts have been issued. A receipt appears only
                  after payment is verified and applied to a paid membership
                  period.
                </Alert>
              )}
              {receipts?.map((receipt) => (
                <Paper key={receipt.id} variant="outlined" sx={{ p: 2.5 }}>
                  <Stack spacing={1}>
                    <Stack
                      direction="row"
                      sx={{ justifyContent: "space-between", gap: 2 }}
                    >
                      <Typography sx={{ fontWeight: 600 }}>
                        Receipt #{receipt.id}
                      </Typography>
                      <Typography
                        sx={{
                          fontWeight: 650,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {subscriptionMoney(receipt.amount, receipt.currency)}
                      </Typography>
                    </Stack>
                    <Divider />
                    <Typography variant="body2">
                      Invoice #{receipt.invoice_id} · {stateLabel(receipt.kind)}
                    </Typography>
                    {receipt.period_start && receipt.period_end && (
                      <Typography variant="body2">
                        Paid period {subscriptionDate(receipt.period_start)} –{" "}
                        {subscriptionDate(receipt.period_end)}
                      </Typography>
                    )}
                    <Typography variant="body2" color="text.secondary">
                      Issued {subscriptionDate(receipt.issued_at, true)}
                    </Typography>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => {
                setReceipts(null);
                setReceiptTarget(null);
              }}
            >
              Close
            </Button>
          </DialogActions>
        </Dialog>
      </Stack>
    </Box>
  );
}
