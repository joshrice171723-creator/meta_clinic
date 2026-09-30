import {
  Alert,
  Button,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type {
  BillingPatientLedger,
  EstimateInvoiceComparison,
} from "../../api/contracts";

export type ComparisonInvoice = Pick<
  BillingPatientLedger["invoices"][number],
  "id" | "status" | "currency"
>;

export function EstimateInvoiceComparisonPanel({
  patientId,
  estimateId,
  currency,
  invoices,
}: {
  patientId: number;
  estimateId: number;
  currency: string;
  invoices: ComparisonInvoice[];
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data?: EstimateInvoiceComparison;
    error?: string;
  }>();
  const eligible = invoices.filter(
    (invoice) => invoice.status === "posted" && invoice.currency === currency,
  );
  const invoiceId = eligible.some((invoice) => invoice.id === selectedId)
    ? selectedId
    : null;
  const requestIdentity = `${patientId}:${estimateId}:${currency}:${invoiceId}`;
  const current = result?.key === requestIdentity ? result : undefined;

  useEffect(() => {
    if (invoiceId === null) return;
    let active = true;
    const controller = new AbortController();
    setResult({ key: requestIdentity });
    api<{ comparison: EstimateInvoiceComparison }>(
      `/api/clinic/cash_pay_estimates/${estimateId}/invoice_comparison?patient_id=${patientId}&invoice_id=${invoiceId}`,
      { signal: controller.signal },
    )
      .then(({ comparison }) => {
        if (!active) return;
        if (
          comparison.schema_version !== "estimate-invoice-comparison-v1" ||
          comparison.patient_id !== patientId ||
          comparison.estimate.id !== estimateId ||
          comparison.invoice.id !== invoiceId ||
          comparison.currency !== currency ||
          comparison.invoice.status !== "posted" ||
          comparison.comparison_basis !==
            "posted_charges_before_payments_and_credits"
        ) {
          throw new Error(
            "The comparison does not match the selected records. Refresh the comparison.",
          );
        }
        setResult({ key: requestIdentity, data: comparison });
      })
      .catch((reason: unknown) => {
        if (active)
          setResult({
            key: requestIdentity,
            error:
              reason instanceof Error
                ? reason.message
                : "Unable to load the comparison.",
          });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [patientId, estimateId, currency, invoiceId, requestIdentity, revision]);

  return (
    <Paper
      component="section"
      aria-label="Estimate and invoice comparison"
      variant="outlined"
      sx={{ p: 2, minWidth: 0 }}
    >
      <Stack spacing={1.5}>
        <Typography component="h4" variant="subtitle1">
          Compare with posted invoice
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Choose records for manual review. Payments and credits are separate;
          review the line items to confirm the services correspond.
        </Typography>
        {eligible.length ? (
          <TextField
            select
            fullWidth
            label="Posted invoice to compare"
            value={invoiceId ?? ""}
            onChange={(event) =>
              setSelectedId(
                event.target.value ? Number(event.target.value) : null,
              )
            }
          >
            <MenuItem value="">Choose an invoice</MenuItem>
            {eligible.map((invoice) => (
              <MenuItem key={invoice.id} value={invoice.id}>
                Invoice #{invoice.id} · {invoice.currency}
              </MenuItem>
            ))}
          </TextField>
        ) : (
          <Typography variant="body2">
            No posted {currency} invoices are loaded for this patient.
          </Typography>
        )}
        {invoiceId !== null && !current?.data && !current?.error && (
          <Typography role="status">Loading comparison…</Typography>
        )}
        {current?.error && (
          <Alert
            severity="error"
            action={
              <Button onClick={() => setRevision((value) => value + 1)}>
                Refresh comparison
              </Button>
            }
          >
            {current.error}
          </Alert>
        )}
        {current?.data && (
          <ComparisonSnapshot
            comparison={current.data}
            onRefresh={() => setRevision((value) => value + 1)}
          />
        )}
      </Stack>
    </Paper>
  );
}

function ComparisonSnapshot({
  comparison,
  onRefresh,
}: {
  comparison: EstimateInvoiceComparison;
  onRefresh: () => void;
}) {
  const { estimate, invoice, currency } = comparison;
  return (
    <Stack spacing={1.5}>
      <Typography variant="body2" color="text.secondary">
        Compared {new Date(comparison.generated_at).toLocaleString()}
      </Typography>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h5" variant="subtitle2">
            Estimate #{estimate.id} · revision {estimate.revision} ·{" "}
            {estimate.status}
          </Typography>
          <Typography variant="body2">
            Issued {new Date(estimate.issued_at).toLocaleString()}
          </Typography>
          <Typography variant="body2">
            Expected total: {currency} {estimate.total_amount}
          </Typography>
          {estimate.lines.map((line) => (
            <Stack
              key={line.id}
              spacing={0.25}
              sx={{ overflowWrap: "anywhere" }}
            >
              <Typography variant="body2">
                {line.description} · quantity {line.quantity} · unit price{" "}
                {currency} {line.unit_amount} · expected {currency}{" "}
                {line.expected_amount}
              </Typography>
              {line.inclusions && (
                <Typography variant="body2">
                  Includes: {line.inclusions}
                </Typography>
              )}
              {line.exclusions && (
                <Typography variant="body2">
                  Excludes: {line.exclusions}
                </Typography>
              )}
            </Stack>
          ))}
        </Stack>
        <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h5" variant="subtitle2">
            Invoice #{invoice.id} · {invoice.status}
          </Typography>
          <Typography variant="body2">
            Record created {new Date(invoice.created_at).toLocaleString()}
          </Typography>
          <Typography variant="body2">
            Posted charges: {currency} {invoice.total_amount}
          </Typography>
          {invoice.lines.map((line) => (
            <Typography
              key={line.id}
              variant="body2"
              sx={{ overflowWrap: "anywhere" }}
            >
              {line.description} · quantity {line.quantity} · unit price{" "}
              {currency} {line.unit_amount} · posted {currency}{" "}
              {line.posted_amount}
            </Typography>
          ))}
        </Stack>
      </Stack>
      <Typography variant="body2">
        Difference (posted charges − estimate): {currency}{" "}
        {comparison.difference_amount}
      </Typography>
      <Button
        variant="outlined"
        sx={{ alignSelf: "flex-start" }}
        onClick={onRefresh}
      >
        Refresh comparison
      </Button>
    </Stack>
  );
}
