import { useEffect, useRef, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { api, ApiError } from "../../../api/client";
import { LoadState, useResource } from "../../../shared/ui";
import { StripeConnectPanel } from "../billing/StripeConnectPanel";
import { useClinicNavigation } from "../clinicNavigation";
import {
  stateLabel,
  subscriptionDate,
  subscriptionMoney,
  type Subscription,
} from "./contracts";
import { catalogDisplayLabel } from "./catalogDisplayLabel";

const FILTER_STATES = [
  "pending_review",
  "review_approved",
  "review_declined",
  "pending_payment",
  "processing",
  "payment_failed",
  "outcome_unknown",
  "active",
  "canceled",
  "expired",
  "refunded",
];

type SubscriptionAction =
  "review" | "reconcile" | "cancel" | "refund" | "reconcile_ledger";

export type SubscriptionActionAttempt = {
  subscriptionId: number;
  action: SubscriptionAction;
  body: Readonly<Record<string, unknown>>;
};

type SubscriptionActionRequester = (
  path: string,
  options: { method: "POST"; body: Readonly<Record<string, unknown>> },
) => Promise<unknown>;

export function createSubscriptionActionAttempt(
  subscriptionId: number,
  action: SubscriptionAction,
  body: Record<string, unknown> = {},
  requestKey: string = crypto.randomUUID(),
): SubscriptionActionAttempt {
  return {
    subscriptionId,
    action,
    body: Object.freeze({ ...body, request_key: requestKey }),
  };
}

export function subscriptionActionOutcomeIsUnknown(reason: unknown) {
  return (
    !(reason instanceof ApiError) ||
    reason.status === 408 ||
    reason.status >= 500 ||
    reason.code === "outcome_unconfirmed"
  );
}

export function resolveSubscriptionActionAttempt(
  current: SubscriptionActionAttempt | null,
  subscriptionId: number,
  action: SubscriptionAction,
  body: Record<string, unknown> = {},
  requestKey?: string,
) {
  if (!current) {
    return createSubscriptionActionAttempt(
      subscriptionId,
      action,
      body,
      requestKey,
    );
  }
  return current.subscriptionId === subscriptionId && current.action === action
    ? current
    : null;
}

export function subscriptionActionFailure(
  attempt: SubscriptionActionAttempt,
  reason: unknown,
) {
  const outcomeUnconfirmed = subscriptionActionOutcomeIsUnknown(reason);
  return {
    outcomeUnconfirmed,
    pendingAttempt: outcomeUnconfirmed ? attempt : null,
  };
}

export function subscriptionActionResponse(
  value: unknown,
  expectedSubscriptionId: number,
): Subscription {
  if (
    !value ||
    typeof value !== "object" ||
    (value as { id?: unknown }).id !== expectedSubscriptionId ||
    typeof (value as { state?: unknown }).state !== "string" ||
    !(value as { state: string }).state.trim()
  ) {
    throw new Error(
      "The membership action returned an invalid response. Its outcome is not confirmed.",
    );
  }
  return value as Subscription;
}

export async function submitSubscriptionActionAttempt(
  attempt: SubscriptionActionAttempt,
  request: SubscriptionActionRequester = api,
) {
  const result = await request(
    `/api/clinic/subscriptions/${attempt.subscriptionId}/${attempt.action}`,
    { method: "POST", body: attempt.body },
  );
  return subscriptionActionResponse(result, attempt.subscriptionId);
}

function subscriptionActionLabel(attempt: SubscriptionActionAttempt) {
  if (attempt.action === "review") {
    return attempt.body.approved
      ? "eligibility approval"
      : "eligibility decline";
  }
  if (attempt.action === "reconcile_ledger") return "membership activation";
  if (attempt.action === "reconcile") return "payment reconciliation";
  if (attempt.action === "refund") return "membership refund";
  return "membership cancellation";
}

type SubscriptionActionNotice = {
  severity: "info" | "success";
  message: string;
};

function subscriptionActionNotice(
  attempt: SubscriptionActionAttempt,
  subscription: Subscription,
): SubscriptionActionNotice {
  const currentStatus = stateLabel(subscription.state);
  if (attempt.action === "reconcile") {
    return {
      severity: ["processing", "outcome_unknown", "payment_failed"].includes(
        subscription.state,
      )
        ? "info"
        : "success",
      message: `Payment status refreshed for membership #${attempt.subscriptionId}. Current status: ${currentStatus}.`,
    };
  }
  const label = subscriptionActionLabel(attempt);
  return {
    severity: "success",
    message: `${label.charAt(0).toUpperCase()}${label.slice(1)} confirmed for membership #${attempt.subscriptionId}. Current status: ${currentStatus}.`,
  };
}

function stateColor(
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

export function SubscriptionBilling({ onChanged }: { onChanged: () => void }) {
  const { registerBlocker } = useClinicNavigation();
  const [state, setState] = useState("");
  const [search, setSearch] = useState("");
  const resource = useResource<{
    subscriptions: Subscription[];
    truncated: boolean;
    capabilities: {
      review: boolean;
      reconcile: boolean;
      fixture_processor: boolean;
    };
  }>(`/api/clinic/subscriptions?${new URLSearchParams({ state, search })}`);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<SubscriptionActionNotice | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Subscription | null>(null);
  const [pendingAttempt, setPendingAttempt] =
    useState<SubscriptionActionAttempt | null>(null);
  const [outcomeUnconfirmed, setOutcomeUnconfirmed] = useState(false);
  const requestInFlight = useRef(false);

  useEffect(() => {
    if (!pendingAttempt) return;
    const warning = `The ${subscriptionActionLabel(pendingAttempt)} outcome is unresolved. Retry the exact request before leaving membership billing.`;
    const unregister = registerBlocker(() => warning);
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = warning;
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", warnBeforeUnload);
    };
  }, [pendingAttempt, registerBlocker]);

  const runAttempt = async (attempt: SubscriptionActionAttempt) => {
    if (requestInFlight.current) return false;
    requestInFlight.current = true;
    setPendingAttempt(attempt);
    setOutcomeUnconfirmed(false);
    setBusy(true);
    setError("");
    setNotice(null);
    try {
      const result = await submitSubscriptionActionAttempt(attempt);
      setPendingAttempt(null);
      setOutcomeUnconfirmed(false);
      setNotice(subscriptionActionNotice(attempt, result));
      resource.refresh();
      onChanged();
      return true;
    } catch (reason) {
      const failure = subscriptionActionFailure(attempt, reason);
      setOutcomeUnconfirmed(failure.outcomeUnconfirmed);
      setPendingAttempt(failure.pendingAttempt);
      setError(
        failure.outcomeUnconfirmed
          ? `${reason instanceof Error ? reason.message : "The server response did not confirm the action."} Membership records are refreshing. Review the updated record, then retry only this same request if confirmation is still needed.`
          : reason instanceof Error
            ? reason.message
            : "The membership action did not complete.",
      );
      if (failure.outcomeUnconfirmed) {
        resource.refresh();
        onChanged();
      }
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
    return false;
  };

  const act = async (
    subscription: Subscription,
    action: SubscriptionAction,
    body: Record<string, unknown> = {},
  ) => {
    const attempt = resolveSubscriptionActionAttempt(
      pendingAttempt,
      subscription.id,
      action,
      body,
    );
    return attempt ? runAttempt(attempt) : false;
  };

  const data = resource.data;
  const actionsLocked = busy || outcomeUnconfirmed;
  const cancelRetryPending =
    outcomeUnconfirmed &&
    pendingAttempt?.action === "cancel" &&
    pendingAttempt.subscriptionId === cancelTarget?.id;
  return (
    <Box
      component="section"
      className="billing-subscriptions"
      aria-label="Membership billing"
    >
      <Stack spacing={3}>
        <Paper variant="outlined" className="billing-subscription-setup">
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="h6" component="h2">
                Stripe payments
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.5 }}
              >
                Connect this clinic to collect eligible invoice balances and
                membership payments through Stripe’s hosted checkout.
              </Typography>
            </Box>
            <StripeConnectPanel />
            <Divider />
            <Typography variant="body2" color="text.secondary">
              Refunds for Stripe payments are handled in the clinic’s full
              Stripe Dashboard. Meta Clinic reflects a refund only after
              receiving and verifying Stripe’s webhook; this screen does not
              issue Stripe refunds.
            </Typography>
          </Stack>
        </Paper>

        <Paper variant="outlined" className="billing-subscription-records">
          <Stack spacing={2.5}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              sx={{
                justifyContent: "space-between",
                alignItems: { sm: "center" },
                gap: 1,
              }}
            >
              <Box>
                <Typography variant="h6" component="h2">
                  Memberships and renewals
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.5 }}
                >
                  Review enrollment, paid access periods, renewal collection and
                  cancellations from authoritative billing records.
                </Typography>
              </Box>
              <Button onClick={resource.refresh}>Refresh records</Button>
            </Stack>

            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Search memberships"
                placeholder="Program, package, tier, or service"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                fullWidth
              />
              <TextField
                select
                label="Membership status"
                value={state}
                onChange={(event) => setState(event.target.value)}
                sx={{ minWidth: { md: 230 } }}
              >
                <MenuItem value="">All statuses</MenuItem>
                {FILTER_STATES.map((value) => (
                  <MenuItem key={value} value={value}>
                    {stateLabel(value)}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>

            {(!data || resource.error) && <LoadState error={resource.error} />}
            {error && (
              <Alert
                severity={outcomeUnconfirmed ? "warning" : "error"}
                action={
                  outcomeUnconfirmed && pendingAttempt ? (
                    <Button
                      color="inherit"
                      disabled={busy}
                      onClick={() => void runAttempt(pendingAttempt)}
                      size="small"
                    >
                      {busy ? "Retrying…" : "Retry same action"}
                    </Button>
                  ) : undefined
                }
              >
                {error}
              </Alert>
            )}
            {notice && (
              <Alert severity={notice.severity}>{notice.message}</Alert>
            )}
            {data?.truncated && (
              <Alert severity="info">
                Showing the first 200 memberships. Narrow the search or status.
              </Alert>
            )}
            {data && !data.subscriptions.length && (
              <Box className="billing-empty-state">
                <Typography component="h3">
                  No memberships in this view
                </Typography>
                <Typography>
                  Adjust the search or status filter. New enrollments appear
                  here after a patient confirms the membership terms.
                </Typography>
              </Box>
            )}

            <Stack spacing={1.5}>
              {data?.subscriptions.map((subscription) => (
                <Accordion
                  key={subscription.id}
                  disableGutters
                  variant="outlined"
                  className="billing-subscription-row"
                >
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      sx={{ width: "100%", minWidth: 0, gap: 1.5, pr: 1 }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          sx={{ fontWeight: 650, overflowWrap: "anywhere" }}
                        >
                          {catalogDisplayLabel(
                            subscription.terms.family_name,
                          ) || "Membership"}{" "}
                          /{" "}
                          {catalogDisplayLabel(
                            subscription.terms.package_name,
                          ) || "Selected plan"}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Membership #{subscription.id} · Patient record #
                          {subscription.patient_id}
                        </Typography>
                      </Box>
                      <Stack
                        direction="row"
                        sx={{
                          alignItems: "center",
                          gap: 1.5,
                          flexWrap: "wrap",
                        }}
                      >
                        <Chip
                          size="small"
                          label={stateLabel(subscription.state)}
                          color={stateColor(subscription.state)}
                          variant={
                            subscription.state === "active"
                              ? "filled"
                              : "outlined"
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
                        </Typography>
                      </Stack>
                    </Stack>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Stack spacing={2}>
                      {subscription.processor ===
                        "local_membership_simulator" && (
                        <Alert severity="info">
                          Local simulator evidence. No Stripe account, card
                          network, or external vendor confirmed this payment.
                        </Alert>
                      )}
                      {["stripe", "local_membership_simulator"].includes(
                        subscription.processor || "",
                      ) &&
                        renewalNeedsPayment(subscription) && (
                          <Alert severity="warning">
                            The latest monthly renewal needs payment. Patient
                            access is limited to the last verified paid period
                            until payment is verified
                            {subscription.processor ===
                            "local_membership_simulator"
                              ? " by another signed local simulator event."
                              : " by Stripe."}
                          </Alert>
                        )}
                      {subscription.checkout_status === "expired" && (
                        <Alert severity="warning">
                          The initial{" "}
                          {subscription.processor ===
                          "local_membership_simulator"
                            ? "local payment session"
                            : "Stripe Checkout session"}{" "}
                          expired without a verified payment. Close this
                          enrollment before the patient starts again.
                        </Alert>
                      )}
                      {["processing", "outcome_unknown"].includes(
                        subscription.state,
                      ) && (
                        <Alert severity="info">
                          Payment is not verified yet. Do not create another
                          enrollment or record access for an unpaid period.
                        </Alert>
                      )}

                      <Box className="billing-subscription-facts">
                        <div>
                          <span>Invoice</span>
                          <strong>
                            #{subscription.invoice_id} ·{" "}
                            {stateLabel(subscription.invoice_status)}
                          </strong>
                        </div>
                        <div>
                          <span>Balance</span>
                          <strong>
                            {subscriptionMoney(
                              subscription.balance,
                              subscription.currency,
                            )}
                          </strong>
                        </div>
                        <div>
                          <span>Payment processor</span>
                          <strong>
                            {subscription.processor === "stripe"
                              ? "Stripe sandbox"
                              : subscription.processor ===
                                  "local_membership_simulator"
                                ? "Local membership simulator"
                                : "Local payment processor"}
                          </strong>
                        </div>
                        <div>
                          <span>Renewal</span>
                          <strong>
                            {subscription.terms.renewal === "automatic"
                              ? subscription.renewal_canceled
                                ? "Stops after paid period"
                                : "Monthly automatic"
                              : stateLabel(subscription.terms.renewal)}
                          </strong>
                        </div>
                        {subscription.starts_at && (
                          <div>
                            <span>Paid access starts</span>
                            <strong>
                              {subscriptionDate(subscription.starts_at)}
                            </strong>
                          </div>
                        )}
                        {subscription.ends_at && (
                          <div>
                            <span>
                              {subscription.renewal_canceled
                                ? "Access ends"
                                : "Current paid period ends"}
                            </span>
                            <strong>
                              {subscriptionDate(subscription.ends_at)}
                            </strong>
                          </div>
                        )}
                        {subscription.renewal_status && (
                          <div>
                            <span>
                              {subscription.processor ===
                              "local_membership_simulator"
                                ? "Local simulated renewal"
                                : "Stripe subscription"}
                            </span>
                            <strong>
                              {stateLabel(subscription.renewal_status)}
                            </strong>
                          </div>
                        )}
                        {subscription.renewal_amount_due && (
                          <div>
                            <span>Renewal amount due</span>
                            <strong>
                              {subscriptionMoney(
                                subscription.renewal_amount_due,
                                subscription.currency,
                              )}
                            </strong>
                          </div>
                        )}
                        {subscription.renewal_invoice_status && (
                          <div>
                            <span>Renewal invoice</span>
                            <strong>
                              {stateLabel(subscription.renewal_invoice_status)}
                            </strong>
                          </div>
                        )}
                        {subscription.checkout_status && (
                          <div>
                            <span>Initial checkout</span>
                            <strong>
                              {stateLabel(subscription.checkout_status)}
                            </strong>
                          </div>
                        )}
                        {subscription.last_synced_at && (
                          <div>
                            <span>
                              {subscription.processor ===
                              "local_membership_simulator"
                                ? "Last local event"
                                : "Last checked with Stripe"}
                            </span>
                            <strong>
                              {subscriptionDate(
                                subscription.last_synced_at,
                                true,
                              )}
                            </strong>
                          </div>
                        )}
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

                      {subscription.cancellation_effective_at && (
                        <Alert severity="info">
                          {subscription.terms.renewal === "automatic"
                            ? "Automatic renewal is canceled. Verified access ends "
                            : "Membership cancellation is effective "}
                          {subscriptionDate(
                            subscription.cancellation_effective_at,
                            true,
                          )}
                          .
                        </Alert>
                      )}

                      <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
                        <Button
                          href={`/clinic/billing/patients?patient_id=${subscription.patient_id}`}
                        >
                          Open patient ledger
                        </Button>
                        {data.capabilities.reconcile &&
                          subscription.terms.renewal !== "automatic" &&
                          [
                            "pending_payment",
                            "review_approved",
                            "payment_failed",
                          ].includes(subscription.state) && (
                            <Button
                              disabled={actionsLocked}
                              onClick={() =>
                                void act(subscription, "reconcile_ledger")
                              }
                            >
                              Activate from posted payment
                            </Button>
                          )}
                        {subscription.state === "pending_review" &&
                          data.capabilities.review && (
                            <>
                              <Button
                                disabled={actionsLocked}
                                onClick={() =>
                                  void act(subscription, "review", {
                                    approved: true,
                                  })
                                }
                              >
                                Approve eligibility
                              </Button>
                              <Button
                                color="error"
                                disabled={actionsLocked}
                                onClick={() =>
                                  void act(subscription, "review", {
                                    approved: false,
                                  })
                                }
                              >
                                Decline eligibility
                              </Button>
                            </>
                          )}
                        {["processing", "outcome_unknown"].includes(
                          subscription.state,
                        ) &&
                          subscription.processor === "development_fixture" &&
                          data.capabilities.reconcile &&
                          data.capabilities.fixture_processor && (
                            <>
                              {["succeeded", "failed", "unknown"].map(
                                (outcome) => (
                                  <Button
                                    key={outcome}
                                    disabled={actionsLocked}
                                    onClick={() =>
                                      void act(subscription, "reconcile", {
                                        outcome,
                                      })
                                    }
                                  >
                                    Fixture: {stateLabel(outcome)}
                                  </Button>
                                ),
                              )}
                            </>
                          )}
                        {subscription.processor === "stripe" &&
                          subscription.state !== "refunded" &&
                          data.capabilities.reconcile && (
                            <Button
                              variant={
                                subscription.checkout_status === "expired" ||
                                renewalNeedsPayment(subscription)
                                  ? "contained"
                                  : "outlined"
                              }
                              disabled={actionsLocked}
                              onClick={() =>
                                void act(subscription, "reconcile")
                              }
                            >
                              {busy
                                ? "Checking Stripe…"
                                : subscription.checkout_status === "expired"
                                  ? "Resolve expired checkout"
                                  : "Refresh from Stripe"}
                            </Button>
                          )}
                        {data.capabilities.reconcile &&
                          subscription.processor !==
                            "local_membership_simulator" &&
                          !subscription.renewal_canceled &&
                          ((subscription.terms.renewal === "automatic" &&
                            (subscription.checkout_status === "open" ||
                              (subscription.renewal_status &&
                                !["canceled", "incomplete_expired"].includes(
                                  subscription.renewal_status,
                                )))) ||
                            ![
                              "processing",
                              "outcome_unknown",
                              "canceled",
                              "expired",
                              "refunded",
                              "review_declined",
                            ].includes(subscription.state)) && (
                            <Button
                              color="error"
                              disabled={actionsLocked}
                              onClick={() => setCancelTarget(subscription)}
                            >
                              {subscription.terms.renewal === "automatic"
                                ? "Cancel future renewals"
                                : "Cancel membership"}
                            </Button>
                          )}
                        {["active", "canceled", "expired"].includes(
                          subscription.state,
                        ) &&
                          subscription.processor === "development_fixture" &&
                          subscription.terms.refund_policy ===
                            "manual_review" &&
                          data.capabilities.reconcile &&
                          data.capabilities.fixture_processor && (
                            <Button
                              disabled={actionsLocked}
                              onClick={() =>
                                void act(subscription, "refund", {
                                  amount: subscription.amount,
                                })
                              }
                            >
                              Issue full fixture refund
                            </Button>
                          )}
                      </Stack>

                      <Divider />
                      <Box>
                        <Typography
                          variant="subtitle2"
                          component="h3"
                          sx={{ mb: 1 }}
                        >
                          Membership history
                        </Typography>
                        {!subscription.events.length ? (
                          <Typography variant="body2" color="text.secondary">
                            No membership events are recorded.
                          </Typography>
                        ) : (
                          <Stack
                            component="ol"
                            spacing={0.75}
                            sx={{ m: 0, pl: 2.5 }}
                          >
                            {subscription.events.map((event, index) => (
                              <Typography
                                component="li"
                                key={`${event.occurred_at}-${index}`}
                                variant="body2"
                              >
                                {subscriptionDate(event.occurred_at, true)} ·{" "}
                                {stateLabel(event.kind)}
                              </Typography>
                            ))}
                          </Stack>
                        )}
                      </Box>
                    </Stack>
                  </AccordionDetails>
                </Accordion>
              ))}
            </Stack>
          </Stack>
        </Paper>
      </Stack>

      <Dialog
        open={Boolean(cancelTarget)}
        onClose={() => !actionsLocked && setCancelTarget(null)}
        fullWidth
        maxWidth="xs"
        aria-labelledby="cancel-membership-title"
      >
        <DialogTitle id="cancel-membership-title">
          Cancel future renewal?
        </DialogTitle>
        <DialogContent>
          <Typography>
            {cancelTarget?.terms.renewal === "automatic"
              ? `Stripe will stop future charges. Current paid access continues${cancelTarget.ends_at ? ` through ${subscriptionDate(cancelTarget.ends_at)}` : " through the verified paid period"}.`
              : "This cancels the membership according to its recorded cancellation terms."}
          </Typography>
          {cancelRetryPending && error && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            disabled={actionsLocked}
            onClick={() => setCancelTarget(null)}
          >
            Keep membership
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={
              busy ||
              !cancelTarget ||
              (outcomeUnconfirmed && !cancelRetryPending)
            }
            onClick={() => {
              if (!cancelTarget) return;
              void act(cancelTarget, "cancel").then((completed) => {
                if (completed) setCancelTarget(null);
              });
            }}
          >
            {busy
              ? "Canceling…"
              : cancelRetryPending
                ? "Retry same cancellation"
                : "Confirm cancellation"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
