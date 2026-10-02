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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  BillingInvoiceSummary,
  CashDrawer,
  CashPaymentResult,
  ClinicWorkspaceContext,
} from "../../api/contracts";
import { api, ApiError } from "../../api/client";
import { useResource } from "../../shared/ui";
import { useWorkingDraft } from "./useWorkingDraft";
import { useClinic } from "./Workspace";
import { cashCloseoutError } from "./cashCloseoutRoute";
import { useClinicNavigation } from "./clinicNavigation";

function money(value: string, currency: string) {
  const [whole, fraction = ""] = value.split(".");
  return `${currency} ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}

function isPositiveDecimal(value: string) {
  return (
    /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value) && !/^0+(?:\.0+)?$/.test(value)
  );
}

function decimalUnits(value: string) {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(value.trim());
  if (!match) return null;
  return BigInt(match[1]) * 1_000_000n + BigInt((match[2] ?? "").padEnd(6, "0"));
}

function decimalFromUnits(value: bigint) {
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function cashAmounts(tenderedAmount: string, balance: string) {
  const tendered = decimalUnits(tenderedAmount);
  const due = decimalUnits(balance);
  if (tendered === null || due === null || tendered <= 0n || due <= 0n)
    return null;
  const allocation = tendered < due ? tendered : due;
  return {
    allocationAmount: decimalFromUnits(allocation),
    changeAmount: decimalFromUnits(tendered - allocation),
  };
}

function requestKey() {
  return typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `cash-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type CashAttempt = {
  invoiceId: number;
  drawerId: number;
  currency: string;
  tenderedAmount: string;
  allocationAmount: string;
  requestKey: string;
};

type CashScope = Pick<
  ClinicWorkspaceContext,
  "practice" | "user_id" | "membership_id"
>;

// Retain an uncertain payment across ledger refreshes and in-app navigation,
// without writing patient financial data to browser storage.
const pendingCashAttempts = new Map<string, CashAttempt>();
function cashScopeKey(scope: CashScope) {
  return `${scope.practice.id}:${scope.user_id}:${scope.membership_id}`;
}
function persistCashAttempt(scope: CashScope, value: CashAttempt | null) {
  if (value) pendingCashAttempts.set(cashScopeKey(scope), value);
  else pendingCashAttempts.delete(cashScopeKey(scope));
}
function storedCashAttempt(scope: CashScope): CashAttempt | null {
  return pendingCashAttempts.get(cashScopeKey(scope)) ?? null;
}

export function pendingCashAttemptInvoiceId(scope: CashScope) {
  return storedCashAttempt(scope)?.invoiceId ?? null;
}

export function hasPendingCashAttempt(scope: CashScope) {
  return pendingCashAttemptInvoiceId(scope) !== null;
}

function deterministicCashError(reason: unknown) {
  return (
    reason instanceof ApiError &&
    reason.code !== "outcome_unconfirmed" &&
    (reason.status === 400 || reason.status === 404 || reason.status === 422)
  );
}

export function CashDrawerOperations({
  invoice,
  onRecorded,
  onPendingChange,
  patientId,
  encounterId,
  recoveryInvoiceId,
  refreshVersion = 0,
}: {
  invoice: BillingInvoiceSummary | null;
  onRecorded: (invoiceId?: number) => void;
  onPendingChange?: (state: {
    pending: boolean;
    invoiceId: number | null;
  }) => void;
  patientId?: number;
  encounterId?: number;
  recoveryInvoiceId?: number;
  refreshVersion?: number;
}) {
  const clinic = useClinic();
  const { registerBlocker } = useClinicNavigation();
  const { capabilities, sites } = clinic;
  const [routeSearch, setRouteSearch] = useState(window.location.search);
  const closeoutRoute = new URLSearchParams(routeSearch).has("cash_closeout");
  const drawers = useResource<{ drawers: CashDrawer[] }>(
    "/api/clinic/cash_drawers",
  );
  const [siteId, setSiteId] = useState(sites[0]?.id?.toString() ?? "");
  const [selectedDrawerId, setSelectedDrawerId] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get(
      "cash_drawer_id",
    );
    return requested &&
      /^[1-9]\d*$/.test(requested) &&
      Number.isSafeInteger(Number(requested))
      ? requested
      : "";
  });
  const [newDrawerMode, setNewDrawerMode] = useState(false);
  const [openingFloat, setOpeningFloat] = useState("");
  const [drawerCurrency, setDrawerCurrency] = useState(
    invoice?.currency ?? "USD",
  );
  const [tenderedAmount, setTenderedAmount] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [explanation, setExplanation] = useState("");
  const [busy, setBusy] = useState<
    "open" | "cash" | "close" | "reconcile" | null
  >(null);
  const [reconciliationNote, setReconciliationNote] = useState("");
  useEffect(() => {
    const restore = () => {
      const previous = new URLSearchParams(routeSearch);
      const next = new URLSearchParams(window.location.search);
      const sameSession = [
        "cash_drawer_id",
        "cash_practice_id",
        "cash_site_id",
        "cash_currency",
      ].every((name) => previous.get(name) === next.get(name));
      // Hash/history changes within this session must retain the physical count.
      // The route owner handles deliberate departure and remounts a new target
      // only after the registered unsaved-work blocker permits navigation.
      if (sameSession || countedCash || explanation) return;
      setRouteSearch(window.location.search);
      setSelectedDrawerId(next.get("cash_drawer_id") ?? "");
      setCountedCash("");
      setExplanation("");
      setNewDrawerMode(false);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [routeSearch, countedCash, explanation]);
  useEffect(() => {
    if (!countedCash && !explanation) return;
    const warning =
      "Cash closeout has an unsaved physical count or explanation. Leave this session and discard it?";
    const unregister = registerBlocker(() => warning);
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = warning;
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", warn);
    };
  }, [countedCash, explanation, registerBlocker]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [receiptPaymentId, setReceiptPaymentId] = useState<number | null>(null);
  const [cashAttempt, setCashAttempt] = useState<CashAttempt | null>(() =>
    storedCashAttempt(clinic),
  );
  const selectDrawer = useCallback((drawerId: number | string) => {
    const id = String(drawerId);
    setSelectedDrawerId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("cash_drawer_id", id);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, []);
  const permitted = capabilities.billing_payment_record === true;
  const exactInvoiceId = recoveryInvoiceId ?? invoice?.id;
  const durableRecoveryEnabled =
    permitted && patientId !== undefined && exactInvoiceId !== undefined;
  const recovery = useWorkingDraft<CashAttempt>({
    kind: "checkout",
    scope: "cash_payment",
    patientId,
    encounterId,
    recordId: exactInvoiceId,
    enabled: durableRecoveryEnabled,
  });
  const onRecordedRef = useRef(onRecorded);
  const onPendingChangeRef = useRef(onPendingChange);
  const lastPendingNotification = useRef<string | null>(null);
  const routedAttempt = useRef("");
  const consumedRestoration = useRef("");
  onRecordedRef.current = onRecorded;
  onPendingChangeRef.current = onPendingChange;
  const drawerRefreshVersion = useRef(refreshVersion);
  const closeAttempt = useRef<{ signature: string; requestKey: string } | null>(
    null,
  );
  const cashRecoveryLoading = durableRecoveryEnabled && !recovery.ready;
  const restoredCashAttempt =
    recovery.ready &&
    exactInvoiceId !== undefined &&
    recovery.restored !== null &&
    recovery.restored.invoiceId === exactInvoiceId &&
    consumedRestoration.current !==
      `${recovery.restored.invoiceId}:${recovery.restored.requestKey}`
      ? recovery.restored
      : null;
  const pendingCashAttempt = cashAttempt ?? restoredCashAttempt;
  useEffect(() => {
    persistCashAttempt(clinic, cashAttempt);
    const pending = cashRecoveryLoading || pendingCashAttempt !== null;
    const invoiceId =
      pendingCashAttempt?.invoiceId ??
      (cashRecoveryLoading ? exactInvoiceId ?? null : null);
    const notificationKey = `${pending}:${invoiceId ?? ""}`;
    if (lastPendingNotification.current !== notificationKey) {
      lastPendingNotification.current = notificationKey;
      onPendingChangeRef.current?.({ pending, invoiceId });
    }
  }, [
    clinic,
    cashAttempt,
    cashRecoveryLoading,
    exactInvoiceId,
    pendingCashAttempt,
  ]);
  useEffect(() => {
    if (
      !cashAttempt ||
      exactInvoiceId === undefined ||
      exactInvoiceId === cashAttempt.invoiceId
    ) {
      if (!cashAttempt || exactInvoiceId === cashAttempt?.invoiceId)
        routedAttempt.current = "";
      return;
    }
    const identity = `${cashAttempt.invoiceId}:${cashAttempt.requestKey}`;
    if (routedAttempt.current === identity) return;
    routedAttempt.current = identity;
    onRecordedRef.current(cashAttempt.invoiceId);
  }, [cashAttempt, exactInvoiceId]);
  useEffect(() => {
    const restored = recovery.restored;
    if (!recovery.ready || !restored || cashAttempt) return;
    const identity = `${restored.invoiceId}:${restored.requestKey}`;
    if (consumedRestoration.current === identity) return;
    if (restored.invoiceId !== exactInvoiceId) {
      setError(
        "The recovered cash payment belongs to another invoice. Return to that invoice before retrying it.",
      );
      if (exactInvoiceId !== undefined && routedAttempt.current !== identity) {
        routedAttempt.current = identity;
        onRecordedRef.current(restored.invoiceId);
      }
      return;
    }
    consumedRestoration.current = identity;
    setCashAttempt(restored);
    selectDrawer(restored.drawerId);
    setTenderedAmount(restored.tenderedAmount);
    setError(
      "A saved cash payment attempt was restored. Refresh payment activity before retrying the same payment.",
    );
  }, [
    cashAttempt,
    exactInvoiceId,
    recovery.ready,
    recovery.restored,
    selectDrawer,
  ]);
  useEffect(() => {
    if (drawerRefreshVersion.current === refreshVersion) return;

    drawerRefreshVersion.current = refreshVersion;
    drawers.refresh();
  }, [refreshVersion]);
  const allDrawers = drawers.data?.drawers ?? [];
  const openDrawers = useMemo(
    () =>
      drawers.data?.drawers.filter((drawer) => drawer.status === "open") ?? [],
    [drawers.data],
  );
  useEffect(() => {
    if (!drawers.data) return;
    if (closeoutRoute) return;
    if (newDrawerMode && !cashAttempt) return;
    if (
      !allDrawers.some(
        (candidate) => candidate.id.toString() === selectedDrawerId,
      )
    ) {
      setSelectedDrawerId(
        cashAttempt?.drawerId.toString() ?? openDrawers[0]?.id.toString() ?? "",
      );
    }
  }, [
    allDrawers,
    cashAttempt,
    closeoutRoute,
    drawers.data,
    newDrawerMode,
    openDrawers,
    selectedDrawerId,
  ]);
  const drawer =
    allDrawers.find(
      (candidate) => candidate.id.toString() === selectedDrawerId,
    ) ?? null;
  const payable =
    invoice?.status === "posted" && !/^0+(?:\.0+)?$/.test(invoice.balance);
  const countedCashUnits = decimalUnits(countedCash);
  const expectedCashUnits = drawer ? decimalUnits(drawer.expected_cash) : null;
  const cashCountNeedsReview =
    countedCashUnits !== null &&
    expectedCashUnits !== null &&
    (countedCashUnits === 0n || countedCashUnits !== expectedCashUnits);
  const tenderSummary = cashAttempt
    ? cashAmounts(cashAttempt.tenderedAmount, cashAttempt.allocationAmount)
    : invoice
      ? cashAmounts(tenderedAmount, invoice.balance)
      : null;

  const reportError = (reason: unknown, fallback: string) =>
    setError(reason instanceof Error ? reason.message : fallback);

  const openDrawer = async () => {
    if (
      !permitted ||
      !siteId ||
      !/^[A-Z]{3}$/.test(drawerCurrency) ||
      !/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(openingFloat)
    ) {
      setError(
        "Choose a location, a three-letter currency, and an opening cash amount with up to six decimal places.",
      );
      return;
    }
    setBusy("open");
    setError("");
    try {
      const result = await api<{ drawer: CashDrawer }>(
        "/api/clinic/cash_drawers",
        {
          method: "POST",
          body: {
            drawer: {
              site_id: Number(siteId),
              opening_float: openingFloat,
              currency: drawerCurrency,
            },
          },
        },
      );
      setOpeningFloat("");
      selectDrawer(result.drawer.id);
      setNewDrawerMode(false);
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
    if (!permitted || busy !== null || cashRecoveryLoading) return;
    const amounts = pendingCashAttempt
      ? cashAmounts(
          pendingCashAttempt.tenderedAmount,
          pendingCashAttempt.allocationAmount,
        )
      : invoice
        ? cashAmounts(tenderedAmount, invoice.balance)
        : null;
    if (
      !pendingCashAttempt &&
      (!invoice ||
        !drawer ||
        !isPositiveDecimal(tenderedAmount) ||
        !amounts)
    ) {
      setError("Enter the cash amount tendered before recording payment.");
      return;
    }
    if (
      !pendingCashAttempt &&
      (!drawer?.currency || drawer.currency !== invoice?.currency)
    ) {
      setError(
        "Choose a drawer with the same recorded currency as the invoice before taking cash.",
      );
      return;
    }
    const attempt = pendingCashAttempt ?? {
      invoiceId: invoice!.id,
      drawerId: drawer!.id,
      currency: invoice!.currency,
      tenderedAmount,
      allocationAmount: amounts!.allocationAmount,
      requestKey: requestKey(),
    };
    setBusy("cash");
    if (durableRecoveryEnabled && !(await recovery.save(attempt))) {
      setBusy(null);
      setError(
        recovery.error ||
          "The cash payment attempt could not be saved for recovery. Try again before recording cash.",
      );
      return;
    }
    persistCashAttempt(clinic, attempt);
    setCashAttempt(attempt);
    setError("");
    setNotice("");
    try {
      const result = await api<CashPaymentResult>(
        `/api/clinic/invoices/${attempt.invoiceId}/cash_payments`,
        {
          method: "POST",
          body: {
            cash_payment: {
              cash_drawer_session_id: attempt.drawerId,
              tendered_amount: attempt.tenderedAmount,
              allocation_amount: attempt.allocationAmount,
              request_key: attempt.requestKey,
            },
          },
        },
      );
      const allocation = result?.payment_allocation;
      const tender = result?.cash_tender;
      const matchesAmount = (value: unknown, expected: string) =>
        typeof value === "string" &&
        decimalUnits(value) !== null &&
        decimalUnits(value) === decimalUnits(expected);
      if (
        ![allocation?.id, allocation?.payment_event_id, tender?.id].every(
          (id) => Number.isSafeInteger(id) && id! > 0,
        ) ||
        tender?.cash_drawer_session_id !== attempt.drawerId ||
        !matchesAmount(allocation?.amount, attempt.allocationAmount) ||
        !matchesAmount(tender?.tendered_amount, attempt.tenderedAmount) ||
        !amounts ||
        !matchesAmount(tender?.change_amount, amounts.changeAmount)
      ) {
        throw new Error(
          "The recorded cash payment did not match the submitted payment. Refresh payment activity before another action.",
        );
      }
      if (durableRecoveryEnabled && !(await recovery.clear())) {
        setError(
          recovery.error ||
            "The cash payment was recorded, but its saved recovery details could not be cleared. Refresh payment activity before another action.",
        );
        drawers.refresh();
        onRecorded(attempt.invoiceId);
        return;
      }
      persistCashAttempt(clinic, null);
      setCashAttempt(null);
      setReceiptPaymentId(result.payment_allocation.payment_event_id);
      setTenderedAmount("");
      setNotice(
        `Cash payment recorded. Change due: ${money(result.cash_tender.change_amount, attempt.currency)}.`,
      );
      drawers.refresh();
      onRecorded(attempt.invoiceId);
    } catch (reason) {
      // A rejected retry cannot establish that an earlier uncertain attempt
      // never committed. Keep its exact identity until acknowledgment matches.
      if (!pendingCashAttempt && deterministicCashError(reason)) {
        if (!durableRecoveryEnabled || (await recovery.clear())) {
          persistCashAttempt(clinic, null);
          setCashAttempt(null);
          reportError(reason, "The cash payment could not be recorded.");
        } else {
          setError(
            recovery.error ||
              "The payment was rejected, but its saved recovery details could not be cleared. Refresh before another action.",
          );
        }
      } else {
        setError(
          `${reason instanceof Error ? reason.message : "The payment outcome could not be confirmed."} Review the refreshed payment activity, then retry only this same cash payment if it is still missing.`,
        );
        drawers.refresh();
        onRecorded(attempt.invoiceId);
      }
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
    const signature = JSON.stringify({
      drawerId: drawer.id,
      countedCash,
      explanation: explanation.trim(),
    });
    const attempt =
      closeAttempt.current?.signature === signature
        ? closeAttempt.current
        : { signature, requestKey: requestKey() };
    closeAttempt.current = attempt;
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
              request_key: attempt.requestKey,
            },
          },
        },
      );
      setNotice(
        result.drawer.currency
          ? `Drawer closed with a ${money(result.drawer.discrepancy ?? "0", result.drawer.currency)} discrepancy. It remains recorded for manager reconciliation.`
          : `Drawer closed with a ${result.drawer.discrepancy ?? "0"} discrepancy; its currency is not recorded. It remains recorded for manager reconciliation.`,
      );
      closeAttempt.current = null;
      setCountedCash("");
      setExplanation("");
      selectDrawer(result.drawer.id);
      setNewDrawerMode(false);
      drawers.refresh();
    } catch (reason) {
      drawers.refresh();
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

  if (!drawers.data) {
    return (
      <Paper component="section" variant="outlined" sx={{ mt: 3, p: 2.5 }}>
        <Typography component="h2" variant="h2">
          Cash drawer
        </Typography>
        {drawers.error ? (
          <Alert
            severity="error"
            sx={{ mt: 2 }}
            action={
              <Button color="inherit" onClick={drawers.refresh}>
                Retry
              </Button>
            }
          >
            {drawers.error}
          </Alert>
        ) : (
          <Typography role="status" sx={{ mt: 1 }}>
            Refreshing drawer totals…
          </Typography>
        )}
      </Paper>
    );
  }

  const closeoutError = cashCloseoutError(routeSearch, clinic, drawer);
  if (closeoutError) {
    return (
      <Paper component="section" variant="outlined" sx={{ mt: 3, p: 2.5 }}>
        <Typography component="h2" variant="h2">
          Cash drawer
        </Typography>
        <Alert severity="warning" sx={{ mt: 2 }}>
          {closeoutError}
        </Alert>
        <Button href="/clinic/operations" sx={{ mt: 1 }}>
          Return to Morning view
        </Button>
      </Paper>
    );
  }

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
        {closeoutRoute && drawer && (
          <Typography variant="body2">
            Closeout session #{drawer.id} ·{" "}
            {sites.find((site) => site.id === drawer.site_id)?.code ??
              `Location ${drawer.site_id}`}{" "}
            · {drawer.currency ?? "Currency not recorded"}
          </Typography>
        )}
        {drawers.error && <Alert severity="error">{drawers.error}</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
        {notice && <Alert severity="success">{notice}</Alert>}
        {cashRecoveryLoading && (
          <Alert
            severity={recovery.status === "error" ? "warning" : "info"}
            action={
              recovery.status === "error" ? (
                <Button color="inherit" onClick={recovery.reload} size="small">
                  Retry check
                </Button>
              ) : undefined
            }
          >
            {recovery.status === "error"
              ? `The existing cash payment status could not be checked. Resolve the recovery issue before recording another payment. ${recovery.error}`
              : "Checking for an unconfirmed cash payment before enabling another payment…"}
          </Alert>
        )}
        {pendingCashAttempt && (
          <Alert
            severity="warning"
            action={
              <Button
                color="inherit"
                disabled={busy !== null}
                onClick={() => {
                  drawers.refresh();
                  onRecorded(pendingCashAttempt.invoiceId);
                }}
                size="small"
              >
                Refresh activity
              </Button>
            }
          >
            <Stack spacing={1}>
              <span>
                Cash payment outcome is pending confirmation for invoice #
                {pendingCashAttempt.invoiceId}. Its drawer and amounts are locked.
                Review activity, then retry this same payment if it is missing.
                Retrying uses the same request key, so it cannot create a
                duplicate payment.
              </span>
            </Stack>
          </Alert>
        )}
        {drawer && !drawer.currency && (
          <Alert severity="warning">
            This older drawer has no recorded currency. New cash payments and
            refunds are blocked. Preserve its reconciliation record, close it,
            and open a new drawer with an explicit currency.
          </Alert>
        )}
        {drawer?.currency && (
          <Typography variant="body2">
            Drawer currency: {drawer.currency}
          </Typography>
        )}
        {drawer?.status === "closed" && (
          <Stack spacing={1.5}>
            <Alert severity="info">
              Closed drawer · Counted{" "}
              {money(
                drawer.counted_cash ?? "0",
                drawer.currency ?? "Unspecified",
              )}{" "}
              · Discrepancy{" "}
              {money(
                drawer.discrepancy ?? "0",
                drawer.currency ?? "Unspecified",
              )}{" "}
              ·{" "}
              {drawer.reconciliation_status === "reconciled"
                ? "Manager reconciled"
                : "Awaiting manager reconciliation"}
            </Alert>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <Button
                disabled={pendingCashAttempt !== null || cashRecoveryLoading || busy !== null}
                onClick={() => setNewDrawerMode(true)}
                variant="outlined"
              >
                Open another drawer
              </Button>
              {openDrawers.length > 0 && (
                <TextField
                  select
                  label="Choose available open drawer"
                  onChange={(event) => {
                    selectDrawer(event.target.value);
                    setNewDrawerMode(false);
                  }}
                  sx={{ minWidth: 240 }}
                  value=""
                >
                  <MenuItem disabled value="">
                    Select an open drawer
                  </MenuItem>
                  {openDrawers.map((candidate) => (
                    <MenuItem key={candidate.id} value={candidate.id}>
                      {sites.find((site) => site.id === candidate.site_id)
                        ?.code ?? `Location ${candidate.site_id}`}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            </Stack>
            {drawer.reconciliation_status === "pending" &&
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
                    required
                    value={reconciliationNote}
                    disabled={pendingCashAttempt !== null || cashRecoveryLoading || busy !== null}
                    onChange={(event) =>
                      setReconciliationNote(event.target.value)
                    }
                    sx={{ flex: 1 }}
                  />
                  <Button
                    disabled={busy !== null || pendingCashAttempt !== null || cashRecoveryLoading}
                    type="submit"
                    variant="contained"
                  >
                    {busy === "reconcile"
                      ? "Reconciling…"
                      : "Reconcile discrepancy"}
                  </Button>
                </Stack>
              )}
          </Stack>
        )}
        {!drawer && cashAttempt ? (
          <Alert severity="info">
            Refreshing the drawer for the locked cash payment. The pending
            request remains unchanged.
          </Alert>
        ) : !drawer || (newDrawerMode && !pendingCashAttempt) ? (
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
              label="Drawer currency"
              value={drawerCurrency}
              onChange={(event) =>
                setDrawerCurrency(event.target.value.toUpperCase())
              }
              slotProps={{ htmlInput: { maxLength: 3 } }}
              helperText="Three-letter code; fixed for this session."
              required
              sx={{ width: 200 }}
            />
            <TextField
              label="Opening cash"
              inputMode="decimal"
              value={openingFloat}
              onChange={(event) => setOpeningFloat(event.target.value)}
            />
            <Button
              disabled={!permitted || cashRecoveryLoading || pendingCashAttempt !== null || busy !== null}
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
                onChange={(event) => selectDrawer(event.target.value)}
                disabled={
                  closeoutRoute ||
                  pendingCashAttempt !== null ||
                  cashRecoveryLoading
                }
                helperText="Choose the physical site receiving this cash."
              >
                {(cashAttempt
                  ? allDrawers.filter(
                      (candidate) => candidate.id === cashAttempt.drawerId,
                    )
                  : openDrawers
                ).map((candidate) => (
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
                    {money(value, drawer.currency ?? "Unspecified")}
                  </Typography>
                </Box>
              ))}
            </Box>
            {((drawer.status === "open" && payable) || pendingCashAttempt) && (
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
                  value={pendingCashAttempt?.tenderedAmount ?? tenderedAmount}
                  onChange={(event) => setTenderedAmount(event.target.value)}
                  disabled={pendingCashAttempt !== null || cashRecoveryLoading}
                  helperText={
                    tenderSummary
                      ? `Change due: ${money(tenderSummary.changeAmount, pendingCashAttempt?.currency ?? invoice?.currency ?? "USD")}`
                      : `Invoice balance: ${money(invoice?.balance ?? "0", invoice?.currency ?? "USD")}`
                  }
                />
                <Button
                  disabled={!permitted || cashRecoveryLoading || busy !== null}
                  type="submit"
                  variant="contained"
                >
                  {busy === "cash"
                    ? "Recording…"
                    : pendingCashAttempt
                      ? "Retry same payment"
                      : "Record cash payment"}
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
            {drawer.status === "open" && (
              <>
                <Divider />
                {cashCountNeedsReview && (
                  <Alert severity="warning">
                    {countedCashUnits === 0n
                      ? `You entered ${money(countedCash, drawer.currency ?? "Unspecified")} as the physical count. Confirm the drawer is empty before closing.`
                      : "Counted cash differs from the server-calculated expected amount. Review the physical count before closing."}
                  </Alert>
                )}
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
                    disabled={
                      !permitted || busy !== null || pendingCashAttempt !== null || cashRecoveryLoading
                    }
                    type="submit"
                    variant="outlined"
                  >
                    {busy === "close" ? "Closing…" : "Close drawer"}
                  </Button>
                </Stack>
              </>
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
