import {
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../api/client";
import type { BillingService } from "./InvoiceLineEditor";

export type CashPayEstimate = {
  id: number;
  patient_id: number | null;
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
  lines: {
    id: number;
    billing_service_id: number | null;
    service_offering_id: number | null;
    quantity: string;
    unit_amount: string;
    expected_amount: string;
    description: string;
    inclusions: string | null;
    exclusions: string | null;
  }[];
};

type DraftLine = { billing_service_id: number; quantity: string };
type EstimateAttempt = {
  path: string;
  body: { estimate: Record<string, unknown> };
};

export function estimateDeliveryLabel(estimate: CashPayEstimate) {
  return estimate.delivered_at
    ? `Staff-reported delivery ${new Date(estimate.delivered_at).toLocaleString()}`
    : "Delivery not recorded";
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
  canDraft,
  onUnknownOutcomeChange,
}: {
  patientId: number;
  canDraft: boolean;
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
  const [lines, setLines] = useState<DraftLine[]>([
    { billing_service_id: 0, quantity: "1" },
  ]);
  const [reason, setReason] = useState("");
  const [policyVersion, setPolicyVersion] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("");
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
              quantity: line.quantity,
            }))
        : [];
    setLines(
      fromSnapshot.length
        ? fromSnapshot
        : [{ billing_service_id: 0, quantity: "1" }],
    );
    setReason("");
    setPolicyVersion("");
    setDeliveryMethod("");
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

  return (
    <Paper component="section" variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
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
            <Typography component="h4" variant="subtitle1">
              {isCorrection ? "Prepare correction" : "Prepare a GFE candidate"}
            </Typography>
            {lines.map((line, index) => (
              <Stack
                key={index}
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
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
                  { billing_service_id: 0, quantity: "1" },
                ])
              }
              disabled={busy || unknownOutcome}
              sx={{ alignSelf: "flex-start" }}
            >
              Add service
            </Button>
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
                  disabled={busy || unknownOutcome || !policyVersion.trim()}
                  onClick={() => {
                    if (!selected) return;
                    void submit(
                      {
                        path: `/api/clinic/cash_pay_estimates/${selected.id}/issue`,
                        body: {
                          estimate: {
                            request_key: crypto.randomUUID(),
                            policy_version: policyVersion.trim(),
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
