import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Button,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { ApiError, api } from "../../api/client";
import { LoadState, useResource } from "../../shared/ui";

type SourceRow = {
  id: number;
  patient_id?: number;
  site_id?: number;
  invoice_id?: number;
  payment_event_id?: number;
  [key: string]: unknown;
};
type Snapshot = {
  invoices: {
    date: string;
    timezone: string;
    as_of: string;
    currencies: {
      currency: string;
      posted_line_total: string;
      current_outstanding_balance: string;
    }[];
  };
  payments: {
    as_of: string;
    currencies: {
      currency: string;
      payment_amount: string;
      refund_amount: string;
    }[];
  };
  drawers: {
    as_of: string;
    open_count: number;
    awaiting_reconciliation_count: number;
    variance_count: number;
    carried_count: number;
  };
  visits: {
    as_of: string;
    total: number;
    timezone: string;
    counts: Record<string, number>;
  };
  reconciliation: {
    version: number;
    site_id: number;
    scope: string;
    sources: Record<string, SourceRow[]>;
    outcome?: string;
    source_digest?: string;
  };
};
type Preview = { snapshot: Snapshot; source_digest: string };
type Receipt = {
  id: number;
  date: string;
  reviewed_at: string;
  reviewed_by: string;
  review_note: string;
  snapshot: Snapshot;
};
type Attempt = {
  date: string;
  site_id: number;
  review_note: string;
  comparison_outcome: string;
  source_digest: string;
  request_key: string;
};

export function DayEndReconciliation({
  date,
  siteId,
}: {
  date: string;
  siteId: number;
}) {
  // An uncertain attempt
  // stays visible and cannot silently become an action for another context.
  const preview = useResource<Preview>(
    `/api/clinic/day_end_reviews/preview?date=${encodeURIComponent(date)}&site_id=${siteId}`,
  );
  const history = useResource<{ reviews: Receipt[] }>(
    `/api/clinic/day_end_reviews?date=${encodeURIComponent(date)}`,
  );
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Attempt | null>(null);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const context = useRef({ date, siteId });
  context.current = { date, siteId };
  useEffect(() => {
    if (!pending) {
      setNote("");
      setOutcome("");
      setError("");
      setReceipt(null);
    }
  }, [date, siteId]);
  const submit = async () => {
    if (pending && (pending.date !== date || pending.site_id !== siteId))
      return;
    if (busy || (!pending && (!preview.data || !note.trim() || !outcome)))
      return;
    const attempt = pending ?? {
      date,
      site_id: siteId,
      review_note: note.trim(),
      comparison_outcome: outcome,
      source_digest: preview.data!.source_digest,
      request_key: crypto.randomUUID(),
    };
    const wasUnconfirmed = pending !== null;
    setPending(attempt);
    setReceipt(null);
    setBusy(true);
    setError("");
    try {
      const result = await api<{ review: Receipt }>(
        "/api/clinic/day_end_reviews",
        { method: "POST", body: { day_end_review: attempt } },
      );
      if (
        context.current.date !== attempt.date ||
        context.current.siteId !== attempt.site_id
      )
        return;
      if (
        result.review.date !== attempt.date ||
        result.review.snapshot.reconciliation.site_id !== attempt.site_id ||
        result.review.snapshot.reconciliation.source_digest !==
          attempt.source_digest ||
        result.review.snapshot.reconciliation.outcome !==
          attempt.comparison_outcome
      )
        throw new Error("The receipt did not match this reconciliation.");
      setReceipt(result.review);
      setPending(null);
      setNote("");
      setOutcome("");
      history.refresh();
      preview.refresh();
    } catch (reason) {
      if (
        context.current.date !== attempt.date ||
        context.current.siteId !== attempt.site_id
      )
        return;
      const definitive =
        reason instanceof ApiError &&
        reason.status >= 400 &&
        reason.status < 500 &&
        reason.status !== 408 &&
        reason.code !== "outcome_unconfirmed";
      setPending(definitive && !wasUnconfirmed ? null : attempt);
      setError(
        reason instanceof Error
          ? reason.message
          : "The save outcome is unconfirmed.",
      );
      if (reason instanceof ApiError && reason.code === "source_changed")
        preview.refresh();
    } finally {
      setBusy(false);
    }
  };
  const saved =
    history.data?.reviews.filter(
      (row) => row.snapshot.reconciliation?.site_id === siteId,
    ) ?? [];
  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle1" component="h4">
        Saved source reconciliation
      </Typography>
      <Typography variant="body2">
        Compare the identified records below, then record the observed outcome.
        Financial cohorts use the practice date; visits use this site's local
        date. This staff comparison does not settle payments, balance a drawer
        or close visits.
      </Typography>
      {!preview.data ? (
        <LoadState error={preview.error} onRetry={preview.refresh} />
      ) : (
        <SnapshotView snapshot={preview.data.snapshot} />
      )}
      <TextField
        select
        label="Comparison outcome"
        value={outcome}
        onChange={(event) => setOutcome(event.target.value)}
        disabled={busy || Boolean(pending)}
      >
        <MenuItem value="no_discrepancy_observed">
          No discrepancy observed in comparison
        </MenuItem>
        <MenuItem value="follow_up_required">Follow-up required</MenuItem>
      </TextField>
      <TextField
        label="Comparison evidence or follow-up"
        multiline
        value={note}
        onChange={(event) => setNote(event.target.value)}
        disabled={busy || Boolean(pending)}
        slotProps={{ htmlInput: { maxLength: 500 } }}
      />
      <Stack direction="row" spacing={1}>
        <Button
          onClick={submit}
          disabled={
            busy ||
            Boolean(
              pending && (pending.date !== date || pending.site_id !== siteId),
            ) ||
            (!pending && (!preview.data || !note.trim() || !outcome))
          }
        >
          {pending ? "Retry same reconciliation" : "Save source reconciliation"}
        </Button>
        <Button
          onClick={() => {
            setReceipt(null);
            preview.refresh();
          }}
          disabled={busy || Boolean(pending)}
        >
          Refresh comparison sources
        </Button>
      </Stack>
      {pending && (
        <Alert severity="warning">
          Save outcome unconfirmed for {pending.date}, site {pending.site_id}.
          Return to that context to retry the same request before editing.
        </Alert>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      {receipt &&
        receipt.date === date &&
        receipt.snapshot.reconciliation.site_id === siteId && (
          <Alert severity="success">
            Reconciliation #{receipt.id} saved for {receipt.date} by{" "}
            {receipt.reviewed_by}.
          </Alert>
        )}
      <Typography variant="subtitle2">
        Saved reconciliations for this site and date
      </Typography>
      {!history.data ? (
        <LoadState error={history.error} onRetry={history.refresh} />
      ) : saved.length === 0 ? (
        <Typography>No saved source reconciliation.</Typography>
      ) : (
        saved.map((row) => (
          <Accordion key={row.id}>
            <AccordionSummary>
              Reconciliation #{row.id} · {row.reviewed_at} · {row.reviewed_by}
            </AccordionSummary>
            <AccordionDetails>
              <Typography>
                {row.snapshot.reconciliation.outcome === "follow_up_required"
                  ? "Follow-up required"
                  : "No discrepancy observed in comparison"}
                : {row.review_note}
              </Typography>
              <SnapshotView snapshot={row.snapshot} />
            </AccordionDetails>
          </Accordion>
        ))
      )}
      <Typography variant="caption">
        Latest 20 practice-date checkpoints are queried. Historical summary-only
        reviews remain separate; source links open current records, while saved
        values remain unchanged.
      </Typography>
    </Stack>
  );
}

function sourceLink(kind: string, row: SourceRow) {
  if (kind === "drawers" || kind === "carried_drawers")
    return `/clinic/billing?tab=cash&cash_drawer_id=${row.id}`;
  if (kind === "visits") return null;
  if (!row.patient_id) return null;
  const field =
    kind === "invoices"
      ? "invoice_id"
      : kind === "payments"
        ? "payment_id"
        : kind === "refunds"
          ? "refund_id"
          : null;
  if (kind === "refunds")
    return `/clinic/billing/patients?patient_id=${row.patient_id}&payment_id=${row.payment_event_id}&refund_id=${row.id}`;
  return field
    ? `/clinic/billing/patients?patient_id=${row.patient_id}&${field}=${row.id}`
    : null;
}
function SnapshotView({ snapshot }: { snapshot: Snapshot }) {
  return (
    <Stack spacing={1}>
      <Typography variant="body2">{snapshot.reconciliation.scope}</Typography>
      <Typography variant="body2">
        Financial date {snapshot.invoices.date} ({snapshot.invoices.timezone});
        visits {snapshot.visits.total} ({snapshot.visits.timezone}); open
        drawers {snapshot.drawers.open_count}; awaiting drawer reconciliation{" "}
        {snapshot.drawers.awaiting_reconciliation_count}; drawer variances{" "}
        {snapshot.drawers.variance_count}; earlier unresolved drawers{" "}
        {snapshot.drawers.carried_count}.
      </Typography>
      {snapshot.invoices.currencies.map((row) => (
        <Typography key={`invoice-${row.currency}`}>
          {row.currency}: posted invoice lines {row.posted_line_total}; current
          outstanding {row.current_outstanding_balance}.
        </Typography>
      ))}
      {snapshot.payments.currencies.map((row) => (
        <Typography key={`payment-${row.currency}`}>
          {row.currency}: payments {row.payment_amount}; refunds{" "}
          {row.refund_amount}.
        </Typography>
      ))}
      {Object.entries(snapshot.reconciliation.sources).map(([kind, rows]) => (
        <Accordion key={kind}>
          <AccordionSummary>
            {kind.replaceAll("_", " ")} · {rows.length} identified records
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={1}>
              {rows.length === 0 && (
                <Typography>No matching records.</Typography>
              )}
              {rows.map((row) => (
                <Stack key={row.id}>
                  <Typography variant="body2">
                    {Object.entries(row)
                      .map(
                        ([field, value]) =>
                          `${field}: ${value ?? "unassigned"}`,
                      )
                      .join(" · ")}
                  </Typography>
                  {sourceLink(kind, row) && (
                    <Button size="small" href={sourceLink(kind, row)!}>
                      Open current {kind.replaceAll("_", " ")} #{row.id}
                    </Button>
                  )}
                </Stack>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      ))}
      <Typography variant="caption">
        Captured source times: invoices {snapshot.invoices.as_of}; payments{" "}
        {snapshot.payments.as_of}; drawers {snapshot.drawers.as_of}; visits{" "}
        {snapshot.visits.as_of}.
      </Typography>
    </Stack>
  );
}
