import {
  Alert,
  Box,
  Button,
  Chip,
  GlobalStyles,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../api/client";
import type { BillingService } from "./InvoiceLineEditor";
import {
  EstimateInvoiceComparisonPanel,
  type ComparisonInvoice,
} from "./EstimateInvoiceComparisonPanel";

export type CashPayEstimate = {
  id: number;
  patient_id: number | null;
  practice_name: string;
  clinic_contact_snapshot: {
    practice_name?: string;
    site_name?: string;
    address?: string;
    phone?: string;
    email?: string;
  };
  total_amount: string;
  classification: "general_estimate" | "gfe_candidate" | "issued_gfe";
  status: "draft" | "issued" | "superseded" | "void";
  currency: string;
  policy_version: string | null;
  delivery_method: string | null;
  issued_at: string | null;
  delivered_at: string | null;
  supersedes_id: number | null;
  correction_reason: string | null;
  revision: number;
  payment_context: "unknown" | "uninsured" | "self_pay" | "other";
  request_context: string | null;
  scheduled_context: string | null;
  lines: {
    id: number;
    billing_service_id: number | null;
    source_price_revision: number | null;
    service_offering_id: number | null;
    quantity: string;
    unit_amount: string;
    expected_amount: string;
    description: string;
    inclusions: string | null;
    exclusions: string | null;
    date_basis: string | null;
  }[];
};

type DraftLine = {
  billing_service_id: number;
  service_offering_id: number | null;
  quantity: string;
  date_basis: string;
};
type EstimateOffering = {
  id: number;
  name: string;
  billing_service_id: number | null;
};
type EstimateAttempt = {
  path: string;
  body: { estimate: Record<string, unknown> };
};

export function estimateDeliveryLabel(estimate: CashPayEstimate) {
  return estimate.delivered_at
    ? `Staff-reported delivery ${new Date(estimate.delivered_at).toLocaleString()}`
    : "Delivery not recorded";
}

export function estimatePriceSourceLabel(
  line: CashPayEstimate["lines"][number],
) {
  return line.source_price_revision != null && line.billing_service_id != null
    ? `Catalog price source: billing service #${line.billing_service_id} · revision ${line.source_price_revision}`
    : "Catalog price revision not recorded";
}

function EstimateContextSnapshot({ estimate }: { estimate: CashPayEstimate }) {
  const paymentLabels = {
    unknown: "Not recorded",
    uninsured: "Uninsured",
    self_pay: "Self-pay",
    other: "Other recorded context",
  };
  return (
    <Stack spacing={0.5}>
      <Typography variant="body2">
        Recorded payment context:{" "}
        {paymentLabels[estimate.payment_context ?? "unknown"]}
      </Typography>
      <Typography variant="body2">
        Request context: {estimate.request_context ?? "Not recorded"}
      </Typography>
      <Typography variant="body2">
        Scheduled context: {estimate.scheduled_context ?? "Not recorded"}
      </Typography>
    </Stack>
  );
}

export function CashPayEstimateSnapshot({
  estimate,
  title,
}: {
  estimate: CashPayEstimate;
  title: string;
}) {
  return (
    <Paper variant="outlined" sx={{ flex: "1 1 280px", minWidth: 0, p: 2 }}>
      <Stack spacing={1}>
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ alignItems: "center", flexWrap: "wrap" }}
        >
          <Typography component="h4" variant="subtitle2">
            {title}
          </Typography>
          <Chip
            size="small"
            label={`#${estimate.id} · revision ${estimate.revision} · ${estimate.status}`}
            variant="outlined"
          />
        </Stack>
        <Typography variant="body2">
          {estimate.classification === "issued_gfe"
            ? "Issued GFE"
            : estimate.classification === "gfe_candidate"
              ? "GFE candidate"
              : "General estimate"}
          {estimate.issued_at
            ? ` · issued ${new Date(estimate.issued_at).toLocaleString()}`
            : ""}
        </Typography>
        <Typography color="text.secondary" variant="body2">
          {estimateDeliveryLabel(estimate)}
        </Typography>
        {estimate.delivery_method && (
          <Typography color="text.secondary" variant="body2">
            Planned delivery method: {estimate.delivery_method}
          </Typography>
        )}
        {estimate.policy_version && (
          <Typography variant="body2">
            Policy version: {estimate.policy_version}
          </Typography>
        )}
        {estimate.correction_reason && (
          <Typography variant="body2">
            Correction reason: {estimate.correction_reason}
          </Typography>
        )}
        <EstimateContextSnapshot estimate={estimate} />
        {estimate.lines.map((line) => (
          <Box
            key={line.id}
            sx={{ borderTop: "1px solid", borderColor: "divider", pt: 1 }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {line.description}
            </Typography>
            <Typography color="text.secondary" variant="body2">
              {line.quantity} × {estimate.currency} {line.unit_amount} ={" "}
              {estimate.currency} {line.expected_amount}
            </Typography>
            {line.service_offering_id && (
              <Typography color="text.secondary" variant="caption">
                Linked service offering #{line.service_offering_id}
              </Typography>
            )}
            <Typography color="text.secondary" variant="caption" component="p">
              {estimatePriceSourceLabel(line)}
            </Typography>
            <Typography color="text.secondary" variant="body2">
              Charge date basis: {line.date_basis ?? "Not recorded"}
            </Typography>
            {line.inclusions && (
              <Typography variant="caption">
                Includes: {line.inclusions}
              </Typography>
            )}
            {line.exclusions && (
              <Typography variant="caption">
                Excludes: {line.exclusions}
              </Typography>
            )}
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}

export function estimateFailure(reason: unknown) {
  const uncertain =
    !(reason instanceof ApiError) ||
    reason.status === 408 ||
    reason.status >= 500 ||
    reason.code === "outcome_unconfirmed";
  return {
    uncertain,
    message: uncertain
      ? "The outcome is unknown. Refresh the estimates, then retry this exact request only if the operation is still needed."
      : reason instanceof Error
        ? reason.message
        : "The estimate action could not be saved.",
  };
}

export function CashPayEstimates({
  patientId,
  patientName,
  canDraft,
  invoices = [],
  onUnknownOutcomeChange,
}: {
  patientId: number;
  patientName: string;
  canDraft: boolean;
  invoices?: ComparisonInvoice[];
  onUnknownOutcomeChange?: (unknown: boolean) => void;
}) {
  const [estimates, setEstimates] = useState<CashPayEstimate[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [services, setServices] = useState<BillingService[]>([]);
  const [serviceError, setServiceError] = useState("");
  const [offerings, setOfferings] = useState<EstimateOffering[]>([]);
  const [offeringError, setOfferingError] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    {
      billing_service_id: 0,
      service_offering_id: null,
      quantity: "1",
      date_basis: "",
    },
  ]);
  const [reason, setReason] = useState("");
  const [policyVersion, setPolicyVersion] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("");
  const [paymentContext, setPaymentContext] =
    useState<CashPayEstimate["payment_context"]>("unknown");
  const [requestContext, setRequestContext] = useState("");
  const [scheduledContext, setScheduledContext] = useState("");
  const [busy, setBusy] = useState(false);
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const attempt = useRef<EstimateAttempt | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api<{ estimates: CashPayEstimate[]; truncated: boolean }>(
      `/api/clinic/cash_pay_estimates?patient_id=${patientId}`,
      { signal: controller.signal },
    )
      .then(({ estimates: fetched, truncated: more }) => {
        if (controller.signal.aborted) return;
        setEstimates(fetched);
        setTruncated(more);
        setSelectedId((current) =>
          current && fetched.some((item) => item.id === current)
            ? current
            : (fetched[0]?.id ?? null),
        );
        setError("");
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load estimates.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [patientId, revision]);

  useEffect(() => {
    if (!canDraft) return;
    const controller = new AbortController();
    api<{ services: BillingService[] }>(
      "/api/clinic/billing_services?active=true&page=1&per_page=100",
      { signal: controller.signal },
    )
      .then((value) => {
        if (!controller.signal.aborted) setServices(value.services);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setServiceError(
            reason instanceof Error
              ? reason.message
              : "Unable to load service prices.",
          );
      });
    return () => controller.abort();
  }, [canDraft]);

  useEffect(() => {
    if (!canDraft) return;
    const controller = new AbortController();
    api<{ service_offerings: EstimateOffering[] }>(
      "/api/clinic/service_offerings?status=published",
      { signal: controller.signal },
    )
      .then((value) => {
        if (!controller.signal.aborted) setOfferings(value.service_offerings);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setOfferingError(
            reason instanceof Error
              ? reason.message
              : "Unable to load service offerings.",
          );
      });
    return () => controller.abort();
  }, [canDraft]);

  useEffect(() => {
    if (!unknownOutcome) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unknownOutcome]);

  useEffect(() => {
    onUnknownOutcomeChange?.(unknownOutcome);
  }, [onUnknownOutcomeChange, unknownOutcome]);

  const selected = estimates.find((estimate) => estimate.id === selectedId);
  useEffect(() => {
    const previous = estimates.find((estimate) => estimate.id === selectedId);
    const fromSnapshot =
      previous?.status === "issued"
        ? previous.lines
            .filter((line) => line.billing_service_id)
            .map((line) => ({
              billing_service_id: line.billing_service_id!,
              service_offering_id: line.service_offering_id,
              quantity: line.quantity,
              date_basis: line.date_basis ?? "",
            }))
        : [];
    setLines(
      fromSnapshot.length
        ? fromSnapshot
        : [
            {
              billing_service_id: 0,
              service_offering_id: null,
              quantity: "1",
              date_basis: "",
            },
          ],
    );
    setReason("");
    setPolicyVersion("");
    setDeliveryMethod("");
    setPaymentContext(previous?.payment_context ?? "unknown");
    setRequestContext(previous?.request_context ?? "");
    setScheduledContext(previous?.scheduled_context ?? "");
  }, [selectedId]);
  const predecessor = selected?.supersedes_id
    ? estimates.find((estimate) => estimate.id === selected.supersedes_id)
    : undefined;
  useEffect(() => {
    if (!selected?.supersedes_id || predecessor) return;
    const controller = new AbortController();
    api<{ estimate: CashPayEstimate }>(
      `/api/clinic/cash_pay_estimates/${selected.supersedes_id}`,
      { signal: controller.signal },
    )
      .then(({ estimate }) => {
        if (controller.signal.aborted) return;
        if (estimate.patient_id !== patientId)
          throw new Error("The prior estimate is outside this patient ledger.");
        setEstimates((current) =>
          current.some((item) => item.id === estimate.id)
            ? current
            : [...current, estimate],
        );
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load the prior issued estimate.",
          );
      });
    return () => controller.abort();
  }, [patientId, selected?.supersedes_id, predecessor]);
  const correction = selected
    ? estimates.find((estimate) => estimate.supersedes_id === selected.id)
    : undefined;
  const companion = predecessor ?? correction;
  const isCorrection =
    selected?.status === "issued" &&
    selected.classification === "issued_gfe" &&
    !correction;
  const canIssue =
    selected?.status === "draft" &&
    selected.classification === "gfe_candidate" &&
    (!selected.supersedes_id || Boolean(predecessor));
  const printable =
    selected?.classification === "issued_gfe" &&
    ["issued", "superseded"].includes(selected.status);
  const validLines =
    lines.length > 0 &&
    lines.every(
      (line) =>
        Number.isSafeInteger(line.billing_service_id) &&
        line.billing_service_id > 0 &&
        /^\d+(?:\.\d{1,3})?$/.test(line.quantity) &&
        Number(line.quantity) > 0,
    );
  const currencies = lines
    .map(
      (line) =>
        services.find((service) => service.id === line.billing_service_id)
          ?.currency,
    )
    .filter(Boolean);
  const sameCurrency =
    currencies.length === lines.length && new Set(currencies).size === 1;

  const submit = async (next: EstimateAttempt, message: string) => {
    if (busy) return;
    const exact = attempt.current ?? next;
    attempt.current = exact;
    setBusy(true);
    setError("");
    try {
      const { estimate } = await api<{ estimate: CashPayEstimate }>(
        exact.path,
        { method: "POST", body: exact.body },
      );
      attempt.current = null;
      setUnknownOutcome(false);
      setEstimates((current) => [
        estimate,
        ...current.filter((item) => item.id !== estimate.id),
      ]);
      setSelectedId(estimate.id);
      setRevision((value) => value + 1);
      setNotice(message);
      setReason("");
    } catch (reason) {
      const failure = estimateFailure(reason);
      if (!failure.uncertain) attempt.current = null;
      setUnknownOutcome(failure.uncertain);
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };
  const estimateLines = lines.map((line) => ({ ...line }));
  const estimateContext = {
    payment_context: paymentContext,
    request_context: requestContext.trim() || null,
    scheduled_context: scheduledContext.trim() || null,
  };
  const contextRecorded =
    paymentContext !== "unknown" &&
    Boolean(requestContext.trim() && scheduledContext.trim());

  return (
    <Paper component="section" variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        {printable && (
          <GlobalStyles
            styles={{
              "@media print": {
                "body *": { visibility: "hidden !important" },
                ".cash-pay-estimate-printout, .cash-pay-estimate-printout *": {
                  visibility: "visible !important",
                },
                ".cash-pay-estimate-printout": {
                  display: "block !important",
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  boxShadow: "none",
                  border: 0,
                },
              },
            }}
          />
        )}
        <Box>
          <Typography component="h3" variant="h6">
            Cash-pay estimates
          </Typography>
          <Typography color="text.secondary" variant="body2">
            Expected charges are separate from invoices and payments. Issuing a
            GFE does not record delivery.
          </Typography>
        </Box>
        {error && <Alert severity="error">{error}</Alert>}
        {notice && <Alert severity="success">{notice}</Alert>}
        {truncated && (
          <Alert severity="warning">
            Only the newest 200 estimates are shown for this patient. Older
            records are not included in this list.
          </Alert>
        )}
        {unknownOutcome && (
          <Alert
            severity="warning"
            action={
              <Button onClick={() => setRevision((value) => value + 1)}>
                Refresh estimates
              </Button>
            }
          >
            Keep this page open. The exact request key and payload are retained
            for retry here.
          </Alert>
        )}
        {loading ? (
          <Typography role="status">Loading estimates…</Typography>
        ) : estimates.length ? (
          <TextField
            select
            fullWidth
            label="Estimate to review"
            value={selectedId ?? ""}
            onChange={(event) => setSelectedId(Number(event.target.value))}
            disabled={unknownOutcome}
          >
            {estimates.map((estimate) => (
              <MenuItem key={estimate.id} value={estimate.id}>
                #{estimate.id} · revision {estimate.revision} ·{" "}
                {estimate.classification.replaceAll("_", " ")} ·{" "}
                {estimate.status}
              </MenuItem>
            ))}
          </TextField>
        ) : (
          <Typography color="text.secondary">
            No estimates are recorded for this patient.
          </Typography>
        )}
        {selected && (
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
            {predecessor && (
              <CashPayEstimateSnapshot
                estimate={predecessor}
                title="Prior issued snapshot"
              />
            )}
            <CashPayEstimateSnapshot
              estimate={selected}
              title={predecessor ? "Correction snapshot" : "Selected estimate"}
            />
            {correction && (
              <CashPayEstimateSnapshot
                estimate={correction}
                title="Correction snapshot"
              />
            )}
          </Stack>
        )}
        {selected?.issued_at &&
          ["issued", "superseded"].includes(selected.status) && (
            <EstimateInvoiceComparisonPanel
              key={`${patientId}:${selected.id}:${selected.currency}`}
              patientId={patientId}
              estimateId={selected.id}
              currency={selected.currency}
              invoices={invoices}
            />
          )}
        {printable && (
          <Button
            variant="outlined"
            onClick={() => window.print()}
            sx={{ alignSelf: "flex-start" }}
          >
            Print estimate copy
          </Button>
        )}
        {printable && (
          <Paper
            className="cash-pay-estimate-printout"
            variant="outlined"
            sx={{ display: "none", p: 4, color: "#111", bgcolor: "#fff" }}
          >
            <Typography component="h1" variant="h4" sx={{ mb: 1 }}>
              Good Faith Estimate
            </Typography>
            <Typography>
              {selected.clinic_contact_snapshot.practice_name ??
                selected.practice_name}
            </Typography>
            {selected.clinic_contact_snapshot.site_name && (
              <Typography>
                {selected.clinic_contact_snapshot.site_name}
              </Typography>
            )}
            {selected.clinic_contact_snapshot.address && (
              <Typography sx={{ whiteSpace: "pre-line" }}>
                {selected.clinic_contact_snapshot.address}
              </Typography>
            )}
            {selected.clinic_contact_snapshot.phone && (
              <Typography>
                Phone: {selected.clinic_contact_snapshot.phone}
              </Typography>
            )}
            {selected.clinic_contact_snapshot.email && (
              <Typography>
                Email: {selected.clinic_contact_snapshot.email}
              </Typography>
            )}
            <Typography>Prepared for {patientName}</Typography>
            <EstimateContextSnapshot estimate={selected} />
            <Typography>
              Estimate #{selected.id} · revision {selected.revision} ·{" "}
              {selected.status}
            </Typography>
            <Typography>
              Issued{" "}
              {selected.issued_at
                ? new Date(selected.issued_at).toLocaleString()
                : "date unavailable"}
              {selected.policy_version
                ? ` · Policy ${selected.policy_version}`
                : ""}
            </Typography>
            {selected.supersedes_id && (
              <Typography>
                Correction of estimate #{selected.supersedes_id}:{" "}
                {selected.correction_reason}
              </Typography>
            )}
            <Box
              component="table"
              sx={{ width: "100%", borderCollapse: "collapse", mt: 3 }}
            >
              <thead>
                <tr>
                  <th align="left">Service and details</th>
                  <th align="right">Quantity</th>
                  <th align="right">Unit estimate</th>
                  <th align="right">Expected amount</th>
                </tr>
              </thead>
              <tbody>
                {selected.lines.map((line) => (
                  <tr key={line.id}>
                    <td>
                      {line.description}
                      {line.inclusions ? ` · Includes: ${line.inclusions}` : ""}
                      {line.exclusions ? ` · Excludes: ${line.exclusions}` : ""}
                      <Typography
                        color="text.secondary"
                        variant="caption"
                        component="p"
                      >
                        {estimatePriceSourceLabel(line)}
                      </Typography>
                      <Typography variant="body2">
                        Charge date basis: {line.date_basis ?? "Not recorded"}
                      </Typography>
                    </td>
                    <td align="right">{line.quantity}</td>
                    <td align="right">
                      {selected.currency} {line.unit_amount}
                    </td>
                    <td align="right">
                      {selected.currency} {line.expected_amount}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={3} align="right">
                    Estimated total
                  </th>
                  <th align="right">
                    {selected.currency} {selected.total_amount}
                  </th>
                </tr>
              </tfoot>
            </Box>
            <Typography variant="body2" sx={{ mt: 3 }}>
              This estimate reflects the saved expected charges. It is not an
              invoice or receipt.
            </Typography>
          </Paper>
        )}
        {selected && companion && (
          <Typography color="text.secondary" variant="body2">
            These records are linked. The prior issued charges remain preserved
            when a correction is issued.
          </Typography>
        )}
        {canDraft &&
          selected?.status === "issued" &&
          !selected.delivered_at && (
            <Stack spacing={0.5} sx={{ alignItems: "flex-start" }}>
              <Button
                variant="outlined"
                disabled={busy || unknownOutcome || !selected.delivery_method}
                onClick={() =>
                  void submit(
                    {
                      path: `/api/clinic/cash_pay_estimates/${selected.id}/deliver`,
                      body: { estimate: { request_key: crypto.randomUUID() } },
                    },
                    "Staff-reported delivery saved for this issued GFE.",
                  )
                }
              >
                Record written delivery
              </Button>
              <Typography color="text.secondary" variant="caption">
                Record only after providing the written copy by the planned
                method. This action does not send the GFE.
              </Typography>
            </Stack>
          )}
        {canDraft && (
          <Stack spacing={1.5}>
            {serviceError && <Alert severity="error">{serviceError}</Alert>}
            {offeringError && (
              <Alert severity="warning">
                {offeringError} You can still prepare an estimate using a
                service price.
              </Alert>
            )}
            <Typography component="h4" variant="subtitle1">
              {isCorrection ? "Prepare correction" : "Prepare a GFE candidate"}
            </Typography>
            {lines.map((line, index) => (
              <Stack
                key={index}
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                useFlexGap
                sx={{ flexWrap: "wrap" }}
              >
                <TextField
                  select
                  label={`Service ${index + 1}`}
                  value={line.billing_service_id || ""}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((item, at) =>
                        at === index
                          ? {
                              ...item,
                              billing_service_id: Number(event.target.value),
                              service_offering_id: null,
                            }
                          : item,
                      ),
                    )
                  }
                  disabled={busy || unknownOutcome}
                  sx={{ flex: 2 }}
                >
                  {services.map((service) => (
                    <MenuItem key={service.id} value={service.id}>
                      {service.name} · {service.currency} {service.unit_amount}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label="Service offering (optional)"
                  value={line.service_offering_id ?? ""}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((item, at) =>
                        at === index
                          ? {
                              ...item,
                              service_offering_id: event.target.value
                                ? Number(event.target.value)
                                : null,
                            }
                          : item,
                      ),
                    )
                  }
                  disabled={busy || unknownOutcome || !line.billing_service_id}
                  sx={{ flex: 2 }}
                >
                  <MenuItem value="">No linked offering</MenuItem>
                  {line.service_offering_id &&
                    !offerings.some(
                      (offering) => offering.id === line.service_offering_id,
                    ) && (
                      <MenuItem value={line.service_offering_id}>
                        Previously linked offering #{line.service_offering_id}
                      </MenuItem>
                    )}
                  {offerings
                    .filter(
                      (offering) =>
                        offering.billing_service_id === line.billing_service_id,
                    )
                    .map((offering) => (
                      <MenuItem key={offering.id} value={offering.id}>
                        {offering.name}
                      </MenuItem>
                    ))}
                </TextField>
                <TextField
                  label="Quantity"
                  value={line.quantity}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((item, at) =>
                        at === index
                          ? { ...item, quantity: event.target.value }
                          : item,
                      ),
                    )
                  }
                  disabled={busy || unknownOutcome}
                  slotProps={{ htmlInput: { inputMode: "decimal" } }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label={`Charge date basis ${index + 1}`}
                  value={line.date_basis}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((item, at) =>
                        at === index
                          ? { ...item, date_basis: event.target.value }
                          : item,
                      ),
                    )
                  }
                  disabled={busy || unknownOutcome}
                  helperText="Record the expected charge's date basis in plain language; leave blank if unknown."
                  slotProps={{ htmlInput: { maxLength: 500 } }}
                  sx={{ flex: "1 1 100%" }}
                />
                <Button
                  onClick={() =>
                    setLines((current) =>
                      current.filter((_, at) => at !== index),
                    )
                  }
                  disabled={busy || unknownOutcome || lines.length === 1}
                >
                  Remove
                </Button>
              </Stack>
            ))}
            <Button
              onClick={() =>
                setLines((current) => [
                  ...current,
                  {
                    billing_service_id: 0,
                    service_offering_id: null,
                    quantity: "1",
                    date_basis: "",
                  },
                ])
              }
              disabled={busy || unknownOutcome}
              sx={{ alignSelf: "flex-start" }}
            >
              Add service
            </Button>
            <TextField
              select
              label="Recorded payment context"
              value={paymentContext}
              onChange={(event) =>
                setPaymentContext(
                  event.target.value as CashPayEstimate["payment_context"],
                )
              }
              disabled={busy || unknownOutcome}
              helperText="Record the facts reviewed for this estimate. This does not determine legal GFE applicability."
            >
              <MenuItem value="unknown">Not recorded</MenuItem>
              <MenuItem value="uninsured">Uninsured</MenuItem>
              <MenuItem value="self_pay">Self-pay</MenuItem>
              <MenuItem value="other">Other recorded context</MenuItem>
            </TextField>
            <TextField
              label="Request context"
              value={requestContext}
              onChange={(event) => setRequestContext(event.target.value)}
              disabled={busy || unknownOutcome}
              multiline
              minRows={2}
              slotProps={{ htmlInput: { maxLength: 500 } }}
              helperText="Record whether and when an estimate was requested, or that no request is recorded."
            />
            <TextField
              label="Scheduled context"
              value={scheduledContext}
              onChange={(event) => setScheduledContext(event.target.value)}
              disabled={busy || unknownOutcome}
              multiline
              minRows={2}
              slotProps={{ htmlInput: { maxLength: 500 } }}
              helperText="Record the known scheduled service context, or that no service is scheduled. No appointment is created."
            />
            {isCorrection && (
              <TextField
                label="Correction reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={busy || unknownOutcome}
                multiline
                minRows={2}
                slotProps={{ htmlInput: { maxLength: 500 } }}
              />
            )}
            {!sameCurrency && lines.some((line) => line.billing_service_id) && (
              <Alert severity="warning">
                Choose active services with one currency.
              </Alert>
            )}
            <Button
              variant="outlined"
              disabled={
                busy ||
                unknownOutcome ||
                !validLines ||
                !sameCurrency ||
                (isCorrection && !reason.trim())
              }
              onClick={() => {
                if (isCorrection && selected) {
                  void submit(
                    {
                      path: `/api/clinic/cash_pay_estimates/${selected.id}/correct`,
                      body: {
                        estimate: {
                          request_key: crypto.randomUUID(),
                          reason: reason.trim(),
                          ...estimateContext,
                          lines: estimateLines,
                        },
                      },
                    },
                    "Correction draft saved. Review the new snapshot before issuing.",
                  );
                } else {
                  void submit(
                    {
                      path: "/api/clinic/cash_pay_estimates",
                      body: {
                        estimate: {
                          request_key: crypto.randomUUID(),
                          patient_id: patientId,
                          classification: "gfe_candidate",
                          ...estimateContext,
                          currency: currencies[0],
                          lines: estimateLines,
                        },
                      },
                    },
                    "GFE candidate saved. Review the snapshot before issuing.",
                  );
                }
              }}
            >
              {isCorrection ? "Save correction draft" : "Save GFE candidate"}
            </Button>
            {canIssue && (
              <Stack spacing={1}>
                <TextField
                  label="Policy version"
                  value={policyVersion}
                  onChange={(event) => setPolicyVersion(event.target.value)}
                  disabled={busy || unknownOutcome}
                  helperText="Enter the reviewed clinic policy version used for this issue decision."
                  slotProps={{ htmlInput: { maxLength: 80 } }}
                />
                <TextField
                  label="Planned delivery method"
                  value={deliveryMethod}
                  onChange={(event) => setDeliveryMethod(event.target.value)}
                  disabled={busy || unknownOutcome}
                  helperText="This field does not record delivery or a delivery time."
                  slotProps={{ htmlInput: { maxLength: 40 } }}
                />
                <Button
                  variant="contained"
                  disabled={
                    busy ||
                    unknownOutcome ||
                    !policyVersion.trim() ||
                    !contextRecorded
                  }
                  onClick={() => {
                    if (!selected) return;
                    void submit(
                      {
                        path: `/api/clinic/cash_pay_estimates/${selected.id}/issue`,
                        body: {
                          estimate: {
                            request_key: crypto.randomUUID(),
                            policy_version: policyVersion.trim(),
                            ...estimateContext,
                            delivery_method: deliveryMethod.trim() || null,
                          },
                        },
                      },
                      "GFE issued. Delivery is not recorded.",
                    );
                  }}
                >
                  Issue selected GFE
                </Button>
              </Stack>
            )}
            {unknownOutcome && (
              <Button
                variant="contained"
                disabled={busy}
                onClick={() => {
                  if (attempt.current)
                    void submit(
                      attempt.current,
                      "Estimate action reconciled. Review the current record.",
                    );
                }}
              >
                Retry exact request
              </Button>
            )}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
