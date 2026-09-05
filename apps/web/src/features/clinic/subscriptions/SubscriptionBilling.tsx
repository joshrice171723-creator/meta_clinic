import { useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { api } from "../../../api/client";
import { LoadState, useResource } from "../../../shared/ui";
import { stateLabel, subscriptionMoney, type Subscription } from "./contracts";

export function SubscriptionBilling() {
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
  }>(
    `/api/clinic/subscriptions${state ? `?state=${encodeURIComponent(state)}` : ""}`,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const act = async (
    subscription: Subscription,
    action: string,
    body: Record<string, unknown> = {},
  ) => {
    setBusy(true);
    setError("");
    try {
      await api(`/api/clinic/subscriptions/${subscription.id}/${action}`, {
        method: "POST",
        body: { ...body, request_key: crypto.randomUUID() },
      });
      resource.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };
  const data = resource.data;
  return (
    <Box component="section" sx={{ py: 3 }} aria-label="Subscription billing">
      <Stack spacing={2}>
        <Stack direction="row" sx={{ justifyContent: "space-between" }}>
          <Typography variant="h6" component="h2">
            Subscription billing
          </Typography>
          <Button onClick={resource.refresh}>Refresh subscriptions</Button>
        </Stack>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            label="Product, package, tier, or service"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            fullWidth
          />
          <TextField
            select
            label="Subscription status"
            value={state}
            onChange={(e) => setState(e.target.value)}
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="">All states</MenuItem>
            {[
              "pending_review",
              "review_approved",
              "pending_payment",
              "processing",
              "payment_failed",
              "outcome_unknown",
              "active",
              "canceled",
              "expired",
              "refunded",
            ].map((v) => (
              <MenuItem key={v} value={v}>
                {stateLabel(v)}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
        {(!data || resource.error) && <LoadState error={resource.error} />}
        {error && <Alert severity="error">{error}</Alert>}
        {data?.truncated && (
          <Alert severity="info">
            Showing the first 200 subscriptions. Narrow the filters.
          </Alert>
        )}
        {data && !data.subscriptions.length && (
          <Typography color="text.secondary">
            No subscriptions match this view.
          </Typography>
        )}
        {data?.subscriptions
          .filter((s) =>
            `${s.terms.family_name} ${s.terms.package_name} ${s.terms.tier} ${s.terms.selected_components?.map((c) => c.name).join(" ")}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .map((s) => (
            <Accordion key={s.id} disableGutters variant="outlined">
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack sx={{ minWidth: 0 }}>
                  <Typography sx={{ overflowWrap: "anywhere" }}>
                    {s.terms.family_name} / {s.terms.package_name} · #{s.id}
                  </Typography>
                  <Typography variant="body2">
                    {stateLabel(s.state)} ·{" "}
                    {subscriptionMoney(s.amount, s.currency)} · invoice #
                    {s.invoice_id}
                  </Typography>
                </Stack>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={1.5}>
                  <Typography>
                    {s.terms.tier && `${s.terms.tier} · `}
                    {s.terms.duration} {s.terms.duration_unit} · version #
                    {s.version_id}
                  </Typography>
                  <Typography>
                    Balance {subscriptionMoney(s.balance, s.currency)} · invoice{" "}
                    {s.invoice_status}
                  </Typography>
                  <Typography variant="body2">
                    {s.terms.selected_components
                      ?.map((c) => `${c.name} (${c.quantity}/${c.frequency})`)
                      .join(", ")}
                  </Typography>
                  {s.starts_at && (
                    <Typography variant="body2">
                      {new Date(s.starts_at).toLocaleDateString()} –{" "}
                      {s.ends_at && new Date(s.ends_at).toLocaleDateString()}
                    </Typography>
                  )}
                  {s.cancellation_effective_at && (
                    <Typography>
                      Cancellation effective{" "}
                      {new Date(s.cancellation_effective_at).toLocaleString()}
                    </Typography>
                  )}
                  <Button
                    href={`/clinic/billing/patients?patient_id=${s.patient_id}`}
                  >
                    Open patient ledger
                  </Button>
                  {data.capabilities.reconcile &&
                    [
                      "pending_payment",
                      "review_approved",
                      "payment_failed",
                    ].includes(s.state) && (
                      <Button
                        disabled={busy}
                        onClick={() => void act(s, "reconcile_ledger")}
                      >
                        Activate from posted payment
                      </Button>
                    )}
                  {s.state === "pending_review" && data.capabilities.review && (
                    <Stack direction="row" spacing={1}>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void act(s, "review", { approved: true })
                        }
                      >
                        Approve eligibility review
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void act(s, "review", { approved: false })
                        }
                      >
                        Decline eligibility review
                      </Button>
                    </Stack>
                  )}
                  {["processing", "outcome_unknown"].includes(s.state) &&
                    data.capabilities.reconcile &&
                    data.capabilities.fixture_processor && (
                      <>
                        <Alert severity="info">
                          Local fixture processor: select the test outcome to
                          verify and reconcile. No money moves.
                        </Alert>
                        <Stack
                          direction="row"
                          sx={{ gap: 1, flexWrap: "wrap" }}
                        >
                          {["succeeded", "failed", "unknown"].map((outcome) => (
                            <Button
                              key={outcome}
                              disabled={busy}
                              onClick={() =>
                                void act(s, "reconcile", { outcome })
                              }
                            >
                              Fixture: {outcome}
                            </Button>
                          ))}
                        </Stack>
                      </>
                    )}
                  {data.capabilities.reconcile &&
                    ![
                      "processing",
                      "outcome_unknown",
                      "canceled",
                      "expired",
                      "refunded",
                      "review_declined",
                    ].includes(s.state) && (
                      <Button
                        disabled={busy}
                        onClick={() => void act(s, "cancel")}
                      >
                        Cancel subscription
                      </Button>
                    )}
                  {["active", "canceled", "expired"].includes(s.state) &&
                    s.terms.refund_policy === "manual_review" &&
                    data.capabilities.reconcile &&
                    data.capabilities.fixture_processor && (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void act(s, "refund", { amount: s.amount })
                        }
                      >
                        Issue full fixture refund
                      </Button>
                    )}
                  <Typography variant="subtitle2">History</Typography>
                  {s.events.map((event, i) => (
                    <Typography key={i} variant="body2">
                      {new Date(event.occurred_at).toLocaleString()} ·{" "}
                      {stateLabel(event.kind)}
                    </Typography>
                  ))}
                </Stack>
              </AccordionDetails>
            </Accordion>
          ))}
      </Stack>
    </Box>
  );
}
