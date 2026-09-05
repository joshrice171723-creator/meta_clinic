import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { LoadState, useResource } from "../../shared/ui";
import { PackageCard } from "../clinic/subscriptions/PackageCard";
import {
  stateLabel,
  subscriptionMoney,
  type PackageTerms,
  type PublishedPackage,
  type Subscription,
} from "../clinic/subscriptions/contracts";

export function PatientSubscriptions({ onChanged }: { onChanged: () => void }) {
  const resource = useResource<{
    catalog: PublishedPackage[];
    subscriptions: Subscription[];
    can_purchase: boolean;
  }>("/api/patient_portal/subscriptions");
  const [selected, setSelected] = useState<PublishedPackage | null>(null);
  const [selections, setSelections] = useState<number[]>([]);
  const [quote, setQuote] = useState<PackageTerms | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [purchaseKey, setPurchaseKey] = useState("");
  const [receipts, setReceipts] = useState<
    | {
        id: number;
        kind: string;
        issued_at: string;
        amount: string;
        currency: string;
      }[]
    | null
  >(null);
  const run = async (action: () => Promise<void>, refresh = true) => {
    setBusy(true);
    setError("");
    try {
      await action();
      if (refresh) {
        resource.refresh();
        onChanged();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
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
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}>
      <Stack spacing={2}>
        <Typography variant="h5" component="h2">
          Clinic subscriptions
        </Typography>
        {(!data || resource.error) && <LoadState error={resource.error} />}
        {error && <Alert severity="error">{error}</Alert>}
        {data && !data.catalog.length && (
          <Typography color="text.secondary">
            No subscription packages are currently available.
          </Typography>
        )}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "repeat(2,minmax(0,1fr))" },
            gap: 2,
          }}
        >
          {data?.catalog.map((p) => (
            <Stack key={p.id} spacing={1}>
              <PackageCard terms={p.terms} />
              <Button
                variant="outlined"
                disabled={!data.can_purchase || busy}
                onClick={() => choose(p)}
              >
                Choose {p.terms.package_name}
              </Button>
            </Stack>
          ))}
        </Box>
        <Typography variant="h6" component="h3">
          Your subscriptions
        </Typography>
        {data && !data.subscriptions.length && (
          <Typography color="text.secondary">
            Your purchases will appear here.
          </Typography>
        )}
        {data?.subscriptions.map((s) => (
          <Paper key={s.id} variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={1}>
              <Typography sx={{ fontWeight: 600 }}>
                {s.terms.family_name} / {s.terms.package_name}
              </Typography>
              <Typography>
                {stateLabel(s.state)} ·{" "}
                {subscriptionMoney(s.amount, s.currency)} · invoice #
                {s.invoice_id}
              </Typography>
              <Typography variant="body2">
                {s.terms.selected_components
                  ?.map((c) => `${c.name} (${c.quantity}/${c.frequency})`)
                  .join(", ")}
              </Typography>
              <Typography variant="body2">
                {s.terms.duration} {s.terms.duration_unit} ·{" "}
                {s.terms.renewal === "manual"
                  ? "Renew manually after this term"
                  : "No automatic renewal"}
              </Typography>
              {s.starts_at && (
                <Typography variant="body2">
                  {new Date(s.starts_at).toLocaleDateString()} –{" "}
                  {s.ends_at && new Date(s.ends_at).toLocaleDateString()}
                </Typography>
              )}
              {s.cancellation_effective_at && (
                <Typography variant="body2">
                  Cancellation effective{" "}
                  {new Date(s.cancellation_effective_at).toLocaleString()}
                </Typography>
              )}
              {["processing", "outcome_unknown"].includes(s.state) && (
                <Alert severity="info">
                  Payment outcome is awaiting clinic reconciliation. Do not
                  start a second payment.
                </Alert>
              )}
              {s.state === "pending_review" && (
                <Typography>
                  Waiting for the clinic to review eligibility before payment.
                </Typography>
              )}
              <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
                {data.can_purchase &&
                  [
                    "pending_payment",
                    "review_approved",
                    "payment_failed",
                  ].includes(s.state) && (
                    <Button
                      disabled={busy}
                      variant="contained"
                      onClick={() =>
                        void run(async () => {
                          await api(
                            `/api/patient_portal/subscriptions/${s.id}/pay`,
                            {
                              method: "POST",
                              body: { request_key: crypto.randomUUID() },
                            },
                          );
                        })
                      }
                    >
                      Request test payment
                    </Button>
                  )}
                {data.can_purchase &&
                  ![
                    "processing",
                    "outcome_unknown",
                    "expired",
                    "canceled",
                    "refunded",
                    "review_declined",
                  ].includes(s.state) && (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await api(
                            `/api/patient_portal/subscriptions/${s.id}/cancel`,
                            {
                              method: "POST",
                              body: { request_key: crypto.randomUUID() },
                            },
                          );
                        })
                      }
                    >
                      Cancel subscription
                    </Button>
                  )}
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(
                      async () =>
                        setReceipts(
                          (
                            await api<{
                              receipts: NonNullable<typeof receipts>;
                            }>(
                              `/api/patient_portal/subscriptions/${s.id}/receipt`,
                            )
                          ).receipts,
                        ),
                      false,
                    )
                  }
                >
                  View receipts
                </Button>
              </Stack>
            </Stack>
          </Paper>
        ))}
        <Dialog
          open={!!selected}
          onClose={() => !busy && setSelected(null)}
          maxWidth="sm"
          fullWidth
          aria-labelledby="subscription-confirm-title"
        >
          <DialogTitle id="subscription-confirm-title">
            {quote ? "Confirm purchase terms" : "Choose your services"}
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2}>
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
                  This creates a subscription invoice. Payments use a local test
                  processor; no real money moves.
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
              disabled={busy}
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
                    await api("/api/patient_portal/subscriptions/checkout", {
                      method: "POST",
                      body: {
                        version_id: selected.id,
                        selections,
                        request_key: purchaseKey,
                      },
                    });
                    setSelected(null);
                  }
                }, !!quote)
              }
            >
              {quote ? "Confirm subscription" : "Review exact price"}
            </Button>
          </DialogActions>
        </Dialog>
        <Dialog
          open={receipts !== null}
          onClose={() => setReceipts(null)}
          fullWidth
          maxWidth="sm"
          aria-labelledby="subscription-receipts-title"
        >
          <DialogTitle id="subscription-receipts-title">
            Subscription receipts
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2}>
              {!receipts?.length && (
                <Typography>No receipts have been issued yet.</Typography>
              )}
              {receipts?.map((r) => (
                <Paper key={r.id} variant="outlined" sx={{ p: 2 }}>
                  <Typography>
                    Receipt #{r.id} · {stateLabel(r.kind)}
                  </Typography>
                  <Typography>
                    {subscriptionMoney(r.amount, r.currency)}
                  </Typography>
                  <Typography>
                    {new Date(r.issued_at).toLocaleString()}
                  </Typography>
                </Paper>
              ))}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setReceipts(null)}>Close</Button>
          </DialogActions>
        </Dialog>
      </Stack>
    </Paper>
  );
}
