import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { useClinicNavigation } from "../clinic/clinicNavigation";
import {
  inventoryMutationAttempt,
  inventoryOutcomeUnconfirmed,
  type PendingInventoryMutation,
} from "./InventoryApp";
import {
  decimalAdd,
  decimalMultiply,
  decimalSum,
  type InventoryPurchaseOrder,
} from "./inventoryContracts";

type Evidence = {
  id: string;
  purchase_order_id: string;
  request_key: string;
  reference: string;
  reason: string;
  status?: string;
  amount?: string;
  quantity?: string;
  currency?: string;
  details: {
    discrepancies?: string[];
    maximum_credit?: string;
    currency?: string;
  };
};
type Reconciliation = {
  truncated: boolean;
  receipt_lines: {
    id: string;
    product: string;
    lot: string;
    quantity: string;
    stock_unit: string;
    returned: string;
  }[];
  locations: { id: string; name: string; kind: string }[];
  returns: Evidence[];
  credits: Evidence[];
  invoices: Evidence[];
  receiving_sessions: Evidence[];
};
type DeliveryLine = {
  selected: boolean;
  delivered: string;
  accepted: string;
  lot: string;
  expiry: string;
  temperature: string;
  location: string;
  missing: string;
  rejected: string;
  excess: string;
  exception: string;
};
export function OrderReconciliation({
  order,
  capabilities,
  onChanged,
  onBlockedChange,
}: {
  order: InventoryPurchaseOrder;
  capabilities: Record<string, boolean>;
  onChanged: () => void;
  onBlockedChange: (blocked: boolean) => void;
}) {
  const { registerBlocker } = useClinicNavigation();
  const [data, setData] = useState<Reconciliation>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingInventoryMutation | null>(null);
  const mounted = useRef(true);
  const [mode, setMode] = useState("receive");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [receiptLine, setReceiptLine] = useState("");
  const [returnId, setReturnId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(order.lines[0]?.currency ?? "");
  const [tax, setTax] = useState("0");
  const [shipping, setShipping] = useState("0");
  const [supersedes, setSupersedes] = useState("");
  const [delivery, setDelivery] = useState<Record<string, DeliveryLine>>({});
  const [invoice, setInvoice] = useState<
    Record<string, { selected: boolean; quantity: string; price: string }>
  >({});
  const base = `/api/clinic/inventory/purchase-orders/${order.id}`;
  const load = async () => {
    const result = await api<{ data: Reconciliation }>(
      `${base}/reconciliation`,
    );
    if (mounted.current) setData(result.data);
  };
  useEffect(() => {
    mounted.current = true;
    void load().catch((e: Error) => {
      if (mounted.current) setError(e.message);
    });
    return () => {
      mounted.current = false;
    };
  }, [order.id]);
  useEffect(() => {
    if (!pending) return;
    const warning =
      "This inventory submission has an unknown outcome. Retry the unchanged form to reconcile it.";
    const unregister = registerBlocker(() => warning);
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = warning;
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", unload);
    };
  }, [pending, registerBlocker]);
  const permission =
    mode === "receive"
      ? "inventory.receive"
      : mode === "return"
        ? "inventory.adjust"
        : "procurement.approve";
  const frozen = busy || !!pending;
  useEffect(() => {
    onBlockedChange(frozen);
    return () => onBlockedChange(false);
  }, [frozen, onBlockedChange]);
  const defaultDelivery: DeliveryLine = {
    selected: false,
    delivered: "",
    accepted: "",
    lot: "",
    expiry: "",
    temperature: "",
    location: "",
    missing: "0",
    rejected: "0",
    excess: "0",
    exception: "short_delivery",
  };
  const updateDelivery = (id: string, values: Partial<DeliveryLine>) =>
    setDelivery((old) => ({
      ...old,
      [id]: { ...defaultDelivery, ...old[id], ...values },
    }));
  const updateInvoice = (
    id: string,
    values: Partial<{ selected: boolean; quantity: string; price: string }>,
  ) =>
    setInvoice((old) => ({
      ...old,
      [id]: {
        ...(old[id] ?? { selected: false, quantity: "", price: "" }),
        ...values,
      },
    }));
  const submit = async () => {
    let endpoint = "";
    let body: Record<string, unknown>;
    try {
      const common = { reference: reference.trim(), reason: reason.trim() };
      if (mode === "receive") {
        endpoint = `${base}/receiving-sessions`;
        const lines = order.lines
          .filter((line) => delivery[line.id]?.selected)
          .map((line) => {
            const row = delivery[line.id];
            const discrepancy = [row.missing, row.rejected, row.excess].some(
              (v) => v !== "0" && v !== "",
            );
            return {
              purchase_order_line_id: line.id,
              delivered_packages: row.delivered,
              accepted_packages: row.accepted,
              lot_number: row.lot,
              expiration_date: row.expiry,
              temperature_c: row.temperature,
              destination_location_id: row.location,
              ...(discrepancy
                ? {
                    reconciliation: {
                      missing_packages: row.missing,
                      rejected_packages: row.rejected,
                      excess_packages: row.excess,
                      exception: row.exception,
                    },
                  }
                : {}),
            };
          });
        if (!lines.length)
          throw new Error("Select at least one delivery line.");
        body = { session: { ...common, lines } };
      } else if (mode === "return") {
        endpoint = `${base}/returns`;
        body = {
          return: { ...common, receipt_line_id: receiptLine, quantity },
        };
      } else if (mode === "credit") {
        endpoint = `${base}/credits`;
        body = {
          credit: { ...common, vendor_return_id: returnId, amount, currency },
        };
      } else {
        endpoint = `${base}/invoices`;
        const lines = order.lines
          .filter((line) => invoice[line.id]?.selected)
          .map((line) => ({
            purchase_order_line_id: line.id,
            quantity_packages: invoice[line.id].quantity,
            unit_price: invoice[line.id].price,
          }));
        if (!lines.length) throw new Error("Select at least one invoice line.");
        body = {
          invoice: {
            ...common,
            lines,
            amount,
            currency,
            tax,
            shipping,
            ...(supersedes ? { supersedes_id: supersedes } : {}),
          },
        };
      }
      const attempt = inventoryMutationAttempt(pending, endpoint, body);
      if (!attempt) throw new Error("Retry the unchanged submission first.");
      setBusy(true);
      setError("");
      setNotice("");
      setPending(attempt);
      const root = Object.keys(body)[0];
      const result = await api<{ data: Evidence }>(endpoint, {
        method: "POST",
        body: {
          [root]: {
            ...(body[root] as Record<string, unknown>),
            request_key: attempt.key,
          },
        },
      });
      if (!mounted.current) return;
      if (
        !result.data?.id ||
        result.data.purchase_order_id !== order.id ||
        result.data.request_key !== attempt.key ||
        !result.data.details
      ) {
        throw new Error(
          "The inventory response could not be confirmed. Retry the unchanged submission.",
        );
      }
      setPending(null);
      setNotice(
        result.data.status === "discrepancy"
          ? `Invoice saved for review: ${result.data.details.discrepancies?.join("; ")}`
          : `Recorded ${result.data.reference}${result.data.status ? ` · ${result.data.status}` : ""}.`,
      );
      setReference("");
      setReason("");
      setDelivery({});
      setInvoice({});
      setAmount("");
      setQuantity("");
      setSupersedes("");
      await load();
      onChanged();
    } catch (e) {
      if (mounted.current) {
        setError(
          e instanceof Error
            ? e.message
            : "Unable to submit inventory operation.",
        );
        if (!inventoryOutcomeUnconfirmed(e)) setPending(null);
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const total = () => {
    try {
      return decimalAdd(
        decimalAdd(
          decimalSum(
            Object.values(invoice)
              .filter((r) => r.selected)
              .map((r) => decimalMultiply(r.quantity || "0", r.price || "0")),
          ),
          tax || "0",
        ),
        shipping || "0",
      );
    } catch {
      return "Enter valid quantities and prices";
    }
  };
  return (
    <Box
      component="section"
      sx={{ borderTop: 1, borderColor: "divider", pt: 2 }}
      aria-label="Delivery and supplier reconciliation"
    >
      <Typography variant="h6">Delivery and supplier reconciliation</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="info">{notice}</Alert>}
      {pending && (
        <Alert severity="warning">
          Outcome unconfirmed. Keep this form unchanged and retry.
        </Alert>
      )}
      {!data ? (
        <Button
          disabled={busy}
          onClick={() => void load().catch((e: Error) => setError(e.message))}
        >
          Load order records
        </Button>
      ) : (
        <Stack spacing={2}>
          {data.truncated && (
            <Alert severity="warning">
              Showing up to 100 recent records per category. Older records
              remain stored.
            </Alert>
          )}
          <TextField
            select
            size="small"
            label="Operation"
            value={mode}
            disabled={frozen}
            onChange={(e) => {
              setMode(e.target.value);
              setReference("");
              setSupersedes("");
            }}
          >
            <MenuItem value="receive">Receive packing slip</MenuItem>
            <MenuItem value="return">Record supplier return</MenuItem>
            <MenuItem value="credit">Record supplier credit</MenuItem>
            <MenuItem value="invoice">Match supplier invoice</MenuItem>
          </TextField>
          <TextField
            size="small"
            label={
              mode === "receive"
                ? "Packing slip reference"
                : mode === "return"
                  ? "Return authorization / RMA"
                  : mode === "credit"
                    ? "Supplier credit reference"
                    : "Supplier invoice number"
            }
            required
            value={reference}
            disabled={frozen}
            onChange={(e) => setReference(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 160 } }}
          />
          <TextField
            size="small"
            label="Reason"
            required
            value={reason}
            disabled={frozen}
            onChange={(e) => setReason(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
          {mode === "receive" && (
            <>
              <Typography>
                Select each delivered item and record its lot and destination.
                All selected lines are posted together.
              </Typography>
              {order.lines.map((line) => {
                const row = delivery[line.id] ?? defaultDelivery;
                return (
                  <Box
                    key={line.id}
                    sx={{ borderBottom: 1, borderColor: "divider", pb: 2 }}
                  >
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={row.selected}
                          disabled={frozen}
                          onChange={(e) =>
                            updateDelivery(line.id, {
                              selected: e.target.checked,
                            })
                          }
                        />
                      }
                      label={`${line.product_name} · ${line.received_packages} of ${line.ordered_packages} packages received`}
                    />
                    {row.selected && (
                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit,minmax(180px,1fr))",
                          gap: 2,
                        }}
                      >
                        {(
                          [
                            ["delivered", "Allocated packages"],
                            ["accepted", "Accepted packages"],
                            ["lot", "Lot number"],
                            ["expiry", "Expiration (YYYY-MM-DD)"],
                            ["temperature", "Temperature °C (if required)"],
                            ["missing", "Missing packages"],
                            ["rejected", "Rejected packages"],
                            ["excess", "Excess rejected packages"],
                          ] as const
                        ).map(([key, label]) => (
                          <TextField
                            key={key}
                            size="small"
                            label={label}
                            value={row[key]}
                            disabled={frozen}
                            onChange={(e) =>
                              updateDelivery(line.id, { [key]: e.target.value })
                            }
                          />
                        ))}
                        <TextField
                          size="small"
                          select
                          label="Destination bin"
                          value={row.location}
                          disabled={frozen}
                          onChange={(e) =>
                            updateDelivery(line.id, {
                              location: e.target.value,
                            })
                          }
                        >
                          <MenuItem value="">Choose bin</MenuItem>
                          {data.locations.map((l) => (
                            <MenuItem key={l.id} value={l.id}>
                              {l.name} · {l.kind}
                            </MenuItem>
                          ))}
                        </TextField>
                        <TextField
                          size="small"
                          select
                          label="Discrepancy reason"
                          value={row.exception}
                          disabled={frozen}
                          onChange={(e) =>
                            updateDelivery(line.id, {
                              exception: e.target.value,
                            })
                          }
                        >
                          {[
                            "short_delivery",
                            "damaged",
                            "wrong_item",
                            "wrong_lot",
                            "temperature",
                            "expiry",
                            "excess",
                            "other",
                          ].map((v) => (
                            <MenuItem key={v} value={v}>
                              {v.replaceAll("_", " ")}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Box>
                    )}
                  </Box>
                );
              })}
            </>
          )}
          {mode === "return" && (
            <>
              <Alert severity="info">
                Record stock actually returned to the supplier. This deducts
                units from the original receiving bin and preserves the receipt.
                Recalled stock uses Recall cases.
              </Alert>
              <TextField
                size="small"
                select
                label="Original receipt line"
                value={receiptLine}
                disabled={frozen}
                onChange={(e) => setReceiptLine(e.target.value)}
              >
                <MenuItem value="">Choose receipt</MenuItem>
                {data.receipt_lines.map((r) => (
                  <MenuItem key={r.id} value={r.id}>
                    {r.product} · lot {r.lot} · received {r.quantity}, returned{" "}
                    {r.returned} {r.stock_unit}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                label="Units returned (stock units)"
                value={quantity}
                disabled={frozen}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </>
          )}
          {mode === "credit" && (
            <>
              <Typography>
                Record a confirmed supplier credit against returned merchandise;
                this does not transfer money.
              </Typography>
              <TextField
                size="small"
                select
                label="Return record"
                value={returnId}
                disabled={frozen}
                onChange={(e) => {
                  setReturnId(e.target.value);
                  setCurrency(
                    data.returns.find((r) => r.id === e.target.value)?.details
                      .currency ?? "",
                  );
                }}
              >
                <MenuItem value="">Choose return</MenuItem>
                {data.returns.map((r) => (
                  <MenuItem key={r.id} value={r.id}>
                    {r.reference} · merchandise value {r.details.maximum_credit}{" "}
                    {r.details.currency}
                  </MenuItem>
                ))}
              </TextField>
            </>
          )}
          {mode === "invoice" && (
            <>
              <Typography>
                Enter the supplier’s actual quantities and prices. Differences
                are saved for review; only matching accepted receipts count as
                matched.
              </Typography>
              <TextField
                select
                size="small"
                label="Correct prior discrepancy (optional)"
                value={supersedes}
                disabled={frozen}
                onChange={(e) => {
                  setSupersedes(e.target.value);
                  if (e.target.value)
                    setReference(
                      data.invoices.find((r) => r.id === e.target.value)
                        ?.reference ?? "",
                    );
                }}
              >
                <MenuItem value="">New invoice</MenuItem>
                {data.invoices
                  .filter((r) => r.status === "discrepancy")
                  .map((r) => (
                    <MenuItem value={r.id} key={r.id}>
                      {r.reference}
                    </MenuItem>
                  ))}
              </TextField>
              {order.lines.map((line) => {
                const row = invoice[line.id] ?? {
                  selected: false,
                  quantity: "",
                  price: "",
                };
                return (
                  <Stack
                    key={line.id}
                    direction={{ xs: "column", sm: "row" }}
                    spacing={2}
                  >
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={row.selected}
                          disabled={frozen}
                          onChange={(e) =>
                            updateInvoice(line.id, {
                              selected: e.target.checked,
                            })
                          }
                        />
                      }
                      label={line.product_name}
                    />
                    {row.selected && (
                      <>
                        <TextField
                          size="small"
                          label="Invoiced packages"
                          value={row.quantity}
                          disabled={frozen}
                          onChange={(e) =>
                            updateInvoice(line.id, { quantity: e.target.value })
                          }
                        />
                        <TextField
                          size="small"
                          label="Invoice package price"
                          value={row.price}
                          disabled={frozen}
                          onChange={(e) =>
                            updateInvoice(line.id, { price: e.target.value })
                          }
                        />
                      </>
                    )}
                  </Stack>
                );
              })}
              <TextField
                size="small"
                label="Invoice tax"
                value={tax}
                disabled={frozen}
                onChange={(e) => setTax(e.target.value)}
              />
              <TextField
                size="small"
                label="Invoice shipping"
                value={shipping}
                disabled={frozen}
                onChange={(e) => setShipping(e.target.value)}
              />
              <Typography>Calculated invoice total: {total()}</Typography>
            </>
          )}
          {(mode === "credit" || mode === "invoice") && (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                size="small"
                label={
                  mode === "credit" ? "Credit amount" : "Supplier invoice total"
                }
                value={amount}
                disabled={frozen}
                onChange={(e) => setAmount(e.target.value)}
              />
              <TextField
                size="small"
                label="Currency"
                value={currency}
                disabled={frozen}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              />
            </Stack>
          )}
          {!capabilities[permission] && (
            <Alert severity="info">
              View only · {permission} permission is required.
            </Alert>
          )}
          {mode === "receive" &&
            !["sent", "partially_received"].includes(order.status) && (
              <Alert severity="info">
                Receive packing slips after the order is marked sent.
              </Alert>
            )}
          <Button
            variant="contained"
            disabled={
              busy ||
              (!pending &&
                mode === "receive" &&
                !["sent", "partially_received"].includes(order.status)) ||
              !reference.trim() ||
              !reason.trim() ||
              !capabilities[permission]
            }
            onClick={() => void submit()}
          >
            {pending
              ? "Retry unchanged submission"
              : mode === "receive"
                ? "Confirm and receive selected lines"
                : mode === "return"
                  ? "Confirm returned stock"
                  : mode === "credit"
                    ? "Record confirmed credit"
                    : "Save invoice and check match"}
          </Button>
          <Typography variant="subtitle1">Recorded history</Typography>
          {(
            [
              ["Receiving sessions", data.receiving_sessions],
              ["Returns", data.returns],
              ["Supplier credits", data.credits],
              ["Supplier invoices", data.invoices],
            ] as const
          ).map(([label, records]) => (
            <Box key={label}>
              <Typography variant="subtitle2">{label}</Typography>
              {!records.length && (
                <Typography color="text.secondary">None recorded</Typography>
              )}
              {records.map((r) => (
                <Typography key={r.id}>
                  {r.reference} · {r.status ?? "recorded"}
                  {r.amount ? ` · ${r.amount} ${r.currency}` : ""}
                  {r.quantity ? ` · ${r.quantity} units` : ""}
                  {r.details.discrepancies?.length
                    ? ` · ${r.details.discrepancies.join("; ")}`
                    : ""}
                </Typography>
              ))}
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}
