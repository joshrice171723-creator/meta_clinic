import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import {
  Alert,
  Box,
  Button,
  Divider,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import type {
  BillingInvoiceSummary,
  CashDrawer,
  CashPaymentResult,
} from "../../api/contracts";
import { api } from "../../api/client";
import { useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";

function money(value: string, currency: string) {
  const [whole, fraction = ""] = value.split(".");
  return `${currency} ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}

function isPositiveDecimal(value: string) {
  return (
    /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value) && !/^0+(?:\.0+)?$/.test(value)
  );
}

function requestKey() {
  return typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `cash-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CashDrawerOperations({
  invoice,
  onRecorded,
}: {
  invoice: BillingInvoiceSummary | null;
  onRecorded: () => void;
}) {
  const { capabilities, sites } = useClinic();
  const drawers = useResource<{ drawers: CashDrawer[] }>(
    "/api/clinic/cash_drawers",
  );
  const [siteId, setSiteId] = useState(sites[0]?.id?.toString() ?? "");
  const [selectedDrawerId, setSelectedDrawerId] = useState("");
  const [openingFloat, setOpeningFloat] = useState("");
  const [tenderedAmount, setTenderedAmount] = useState("");
  const [allocationAmount, setAllocationAmount] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [explanation, setExplanation] = useState("");
  const [busy, setBusy] = useState<
    "open" | "cash" | "close" | "reconcile" | null
  >(null);
  const [reconciliationNote, setReconciliationNote] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [receiptPaymentId, setReceiptPaymentId] = useState<number | null>(null);
  const allDrawers = drawers.data?.drawers ?? [];
  const openDrawers = useMemo(
    () =>
      drawers.data?.drawers.filter((drawer) => drawer.status === "open") ?? [],
    [drawers.data],
  );
  useEffect(() => {
    if (
      !allDrawers.some(
        (candidate) => candidate.id.toString() === selectedDrawerId,
      )
    ) {
      setSelectedDrawerId(openDrawers[0]?.id.toString() ?? "");
    }
  }, [allDrawers, openDrawers, selectedDrawerId]);
  const drawer =
    allDrawers.find(
      (candidate) => candidate.id.toString() === selectedDrawerId,
    ) ?? null;
  const permitted = capabilities.billing_payment_record === true;
  const payable =
    invoice?.status === "posted" && !/^0+(?:\.0+)?$/.test(invoice.balance);

  const reportError = (reason: unknown, fallback: string) =>
    setError(reason instanceof Error ? reason.message : fallback);

  const openDrawer = async () => {
    if (
      !permitted ||
      !siteId ||
      !/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(openingFloat)
    ) {
      setError(
        "Choose a location and enter an opening cash amount with up to six decimal places.",
      );
      return;
    }
    setBusy("open");
    setError("");
    try {
      await api("/api/clinic/cash_drawers", {
        method: "POST",
        body: {
          drawer: { site_id: Number(siteId), opening_float: openingFloat },
        },
      });
      setOpeningFloat("");
      setNotice(
        "Cash drawer opened. Record every cash payment through this drawer.",
      );
      drawers.refresh();
    } catch (reason) {
      reportError(reason, "The cash drawer could not be opened.");
    } finally {
      setBusy(null);
    }
  };

  const recordCash = async () => {
    if (
      !invoice ||
      !drawer ||
      !permitted ||
      !isPositiveDecimal(tenderedAmount) ||
      !isPositiveDecimal(allocationAmount)
    ) {
      setError(
        "Enter positive tendered and allocated amounts before recording cash.",
      );
      return;
    }
    setBusy("cash");
    setError("");
    try {
      const result = await api<CashPaymentResult>(
        `/api/clinic/invoices/${invoice.id}/cash_payments`,
        {
          method: "POST",
          body: {
            cash_payment: {
              cash_drawer_session_id: drawer.id,
              tendered_amount: tenderedAmount,
              allocation_amount: allocationAmount,
              request_key: requestKey(),
            },
          },
        },
      );
      setReceiptPaymentId(result.payment_allocation.payment_event_id);
      setTenderedAmount("");
      setAllocationAmount("");
      setNotice(
        `Cash payment recorded. Change due: ${money(result.cash_tender.change_amount, invoice.currency)}.`,
      );
      drawers.refresh();
      onRecorded();
    } catch (reason) {
      reportError(reason, "The cash payment could not be recorded.");
    } finally {
      setBusy(null);
    }
  };

  const closeDrawer = async () => {
    if (
      !drawer ||
      !permitted ||
      !/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(countedCash)
    ) {
      setError("Enter the counted cash amount with up to six decimal places.");
      return;
    }
    setBusy("close");
    setError("");
    try {
      const result = await api<{ drawer: CashDrawer }>(
        `/api/clinic/cash_drawers/${drawer.id}/close`,
        {
          method: "POST",
          body: {
            drawer: {
              counted_cash: countedCash,
              discrepancy_explanation: explanation,
            },
          },
        },
      );
      setNotice(
        `Drawer closed with a ${money(result.drawer.discrepancy ?? "0", "USD")} discrepancy. It remains recorded for manager reconciliation.`,
      );
      setCountedCash("");
      setExplanation("");
      drawers.refresh();
    } catch (reason) {
      reportError(reason, "The cash drawer could not be closed.");
    } finally {
      setBusy(null);
    }
  };

  const reconcileDrawer = async () => {
    if (
      !drawer ||
      drawer.status !== "closed" ||
      capabilities.billing_cash_reconcile !== true ||
      !reconciliationNote.trim()
    ) {
      setError(
        "A manager reconciliation note is required for a closed drawer.",
      );
      return;
    }
    setBusy("reconcile");
    setError("");
    try {
      await api(`/api/clinic/cash_drawers/${drawer.id}/reconcile`, {
        method: "POST",
        body: {
          drawer: {
            reconciliation_note: reconciliationNote.trim(),
            request_key: requestKey(),
          },
        },
      });
      setReconciliationNote("");
      setNotice(
        "Drawer discrepancy reconciled and preserved for review history.",
      );
      drawers.refresh();
    } catch (reason) {
      reportError(reason, "The drawer reconciliation could not be recorded.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Paper component="section" variant="outlined" sx={{ mt: 3 }}>
      <Box sx={{ alignItems: "center", display: "flex", gap: 1, p: 2.5 }}>
        <AccountBalanceWalletOutlinedIcon color="primary" />
        <Box>
          <Typography component="h2" variant="h2">
            Cash drawer
          </Typography>
          <Typography color="text.secondary" variant="body2">
            Expected cash is server-calculated from opening float, payments,
            change, and cash refunds.
          </Typography>
        </Box>
      </Box>
      <Divider />
      <Stack spacing={2} sx={{ p: 2.5 }}>
        {drawers.error && <Alert severity="error">{drawers.error}</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
        {notice && <Alert severity="success">{notice}</Alert>}
        {!drawer ? (
          <Stack
            component="form"
            direction={{ xs: "column", md: "row" }}
            spacing={1.5}
            onSubmit={(event) => {
              event.preventDefault();
              void openDrawer();
            }}
          >
            <TextField
              select
              label="Location"
              value={siteId}
              onChange={(event) => setSiteId(event.target.value)}
              sx={{ minWidth: 180 }}
            >
              {sites.map((site) => (
                <MenuItem key={site.id} value={site.id}>
                  {site.code}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Opening cash"
              inputMode="decimal"
              value={openingFloat}
              onChange={(event) => setOpeningFloat(event.target.value)}
            />
            <Button
              disabled={!permitted || busy !== null}
              type="submit"
              variant="contained"
            >
              {busy === "open" ? "Opening…" : "Open drawer"}
            </Button>
          </Stack>
        ) : (
          <>
            {openDrawers.length > 1 && (
              <TextField
                select
                label="Cash drawer location"
                value={selectedDrawerId}
                onChange={(event) => setSelectedDrawerId(event.target.value)}
                helperText="Choose the physical site receiving this cash."
              >
                {openDrawers.map((candidate) => (
                  <MenuItem key={candidate.id} value={candidate.id}>
                    {sites.find((site) => site.id === candidate.site_id)
                      ?.code ?? `Location ${candidate.site_id}`}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <Box
              sx={{
                display: "grid",
                gap: 1.5,
                gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" },
              }}
            >
              {[
                ["Opening", drawer.opening_float],
                ["Cash received", drawer.cash_received],
                ["Cash refunded", drawer.cash_refunded],
                ["Expected", drawer.expected_cash],
              ].map(([label, value]) => (
                <Box key={label}>
                  <Typography color="text.secondary" variant="body2">
                    {label}
                  </Typography>
                  <Typography
                    sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}
                  >
                    {money(value, invoice?.currency ?? "USD")}
                  </Typography>
                </Box>
              ))}
            </Box>
            {payable && (
              <Stack
                component="form"
                direction={{ xs: "column", md: "row" }}
                spacing={1.5}
                onSubmit={(event) => {
                  event.preventDefault();
                  void recordCash();
                }}
              >
                <TextField
                  label="Tendered cash"
                  inputMode="decimal"
                  value={tenderedAmount}
                  onChange={(event) => setTenderedAmount(event.target.value)}
                />
                <TextField
                  label={`Apply to invoice #${invoice?.id}`}
                  inputMode="decimal"
                  value={allocationAmount}
                  onChange={(event) => setAllocationAmount(event.target.value)}
                  helperText={`Due: ${money(invoice?.balance ?? "0", invoice?.currency ?? "USD")}`}
                />
                <Button
                  disabled={!permitted || busy !== null}
                  type="submit"
                  variant="contained"
                >
                  {busy === "cash" ? "Recording…" : "Record cash payment"}
                </Button>
              </Stack>
            )}
            {receiptPaymentId && (
              <Button
                component="a"
                href={`/api/clinic/payment_events/${receiptPaymentId}/receipt`}
                rel="noopener"
                startIcon={<PrintOutlinedIcon />}
                target="_blank"
                variant="outlined"
              >
                Print receipt
              </Button>
            )}
            <Divider />
            <Stack
              component="form"
              direction={{ xs: "column", md: "row" }}
              spacing={1.5}
              onSubmit={(event) => {
                event.preventDefault();
                void closeDrawer();
              }}
            >
              <TextField
                label="Counted cash"
                inputMode="decimal"
                value={countedCash}
                onChange={(event) => setCountedCash(event.target.value)}
              />
              <TextField
                label="Short / over explanation (optional)"
                value={explanation}
                onChange={(event) => setExplanation(event.target.value)}
                sx={{ flex: 1 }}
              />
              <Button
                disabled={!permitted || busy !== null}
                type="submit"
                variant="outlined"
              >
                {busy === "close" ? "Closing…" : "Close drawer"}
              </Button>
            </Stack>
            {drawer.status === "closed" &&
              drawer.reconciliation_status === "pending" &&
              capabilities.billing_cash_reconcile === true && (
                <Stack
                  component="form"
                  direction={{ xs: "column", md: "row" }}
                  spacing={1.5}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void reconcileDrawer();
                  }}
                >
                  <TextField
                    label="Manager reconciliation note"
                    value={reconciliationNote}
                    onChange={(event) =>
                      setReconciliationNote(event.target.value)
                    }
                    sx={{ flex: 1 }}
                  />
                  <Button
                    disabled={busy !== null}
                    type="submit"
                    variant="contained"
                  >
                    {busy === "reconcile"
                      ? "Reconciling…"
                      : "Reconcile discrepancy"}
                  </Button>
                </Stack>
              )}
          </>
        )}
        {!permitted && (
          <Alert severity="info">
            Your account can review the drawer but cannot record or close cash
            activity.
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}
