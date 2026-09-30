import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../../../api/client";
import { LoadState } from "../../../shared/ui";
import { useClinicNavigation } from "../clinicNavigation";
import type {
  PackageEntitlement,
  PackageEntitlementEntry,
  Subscription,
} from "./contracts";
import { subscriptionDate } from "./contracts";
import { PaidPeriodResolution } from "./PaidPeriodResolution";
import {
  createEntitlementAttempt,
  entitlementActionAllowed,
  entitlementLedgerResponse,
  entitlementAttemptAfterFailure,
  submitEntitlementAttempt,
  type EntitlementAttempt,
  type EntitlementKind,
  type EntitlementLedger,
} from "./entitlementActions";

const actionLabels: Record<EntitlementKind, string> = {
  opening: "opening balance",
  use: "service use",
  reversal: "use reversal",
};

export function PackageEntitlementBalances({
  subscription,
  canWrite,
  disabled = false,
  onSelect,
}: {
  subscription: Subscription;
  canWrite: boolean;
  disabled?: boolean;
  onSelect: (kind: EntitlementKind, balance: PackageEntitlement) => void;
}) {
  return (
    <Stack spacing={2}>
      {!subscription.entitlements?.length && (
        <Typography>No purchased service allowances are recorded.</Typography>
      )}
      {subscription.entitlements?.map((balance) => (
        <Stack key={balance.service_id} spacing={1}>
          <Typography component="h4" variant="subtitle1">
            {balance.name}
          </Typography>
          <Typography variant="body2">
            Purchased: {balance.purchased_quantity} units / {balance.frequency}.
            Remaining:{" "}
            {balance.remaining_quantity === null
              ? balance.source === "retained_recurring_allowance"
                ? balance.status === "allowance_unconfigured"
                  ? "Unknown — purchased allowance policy unconfigured"
                  : balance.status === "historical_usage_conflict"
                    ? "Unknown — another overlapping paid window retains unreversed use"
                    : "Unknown — verified paid period unavailable"
                : "Unknown — opening balance not recorded"
              : `${balance.remaining_quantity} units`}
            .
          </Typography>
          {balance.status === "unsupported_frequency" ? (
            <Typography variant="body2">
              This allowance period is not supported by the fixed-term package
              ledger.
            </Typography>
          ) : (
            balance.remaining_quantity !== null && (
              <Typography variant="body2">
                {balance.source === "retained_recurring_allowance"
                  ? "Window allowance"
                  : "Reviewed opening"}: {balance.opening_quantity}; recorded use:{" "}
                {balance.used_quantity}; reversed use:{" "}
                {balance.reversed_quantity}.
              </Typography>
            )
          )}
          {balance.window_start && balance.window_end && (
            <Typography variant="body2">
              Allowance window (UTC): {balance.window_start} through {balance.window_end} (end excluded).
              Unused units expire at the boundary. Reversals restore only their original window.
            </Typography>
          )}
          {balance.period_resolution_id && (
            <Typography variant="body2">
              Governing paid-period resolution #{balance.period_resolution_id}.
            </Typography>
          )}
          {balance.status === "historical_usage_conflict" && (
            <Typography variant="body2">
              Review the original ledger entries and recorded paid-period evidence.
              Usage remains in its original window; this view does not move or allocate it.
            </Typography>
          )}
          {balance.status === "inactive" && (
            <Typography variant="body2">
              Package access is inactive. Remaining recorded units cannot be
              used.
            </Typography>
          )}
          {balance.status === "exhausted" && (
            <Typography variant="body2">No units remain.</Typography>
          )}
          <Stack direction="row" spacing={1}>
            {entitlementActionAllowed(
              subscription,
              balance,
              canWrite,
              "opening",
            ) && (
              <Button
                disabled={disabled}
                onClick={() => onSelect("opening", balance)}
              >
                Record reviewed opening balance
              </Button>
            )}
            {entitlementActionAllowed(
              subscription,
              balance,
              canWrite,
              "use",
            ) && (
              <Button
                disabled={disabled}
                onClick={() => onSelect("use", balance)}
              >
                Record service use
              </Button>
            )}
          </Stack>
        </Stack>
      ))}
    </Stack>
  );
}

export function PackageEntitlements({
  subscriptionId,
  canWrite,
  disabled,
  onClose,
  onChanged,
  onPendingChange,
}: {
  subscriptionId: number;
  canWrite: boolean;
  disabled: boolean;
  onClose: () => void;
  onChanged: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const { registerBlocker } = useClinicNavigation();
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const scope = `${subscriptionId}:${page}:${revision}`;
  const [read, setRead] = useState<{
    scope: string;
    data?: EntitlementLedger;
    error?: string;
  }>({ scope });
  const [draft, setDraft] = useState<{
    kind: EntitlementKind;
    balance: PackageEntitlement;
    original?: PackageEntitlementEntry;
  } | null>(null);
  const [quantity, setQuantity] = useState("");
  const [reference, setReference] = useState("");
  const [confirmation, setConfirmation] = useState<EntitlementAttempt | null>(
    null,
  );
  const [pending, setPending] = useState<EntitlementAttempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resolutionOpen, setResolutionOpen] = useState(false);
  const [resolutionPending, setResolutionPending] = useState(false);
  const inFlight = useRef(false);
  const refresh = () => setRevision((value) => value + 1);
  const data = read.scope === scope ? read.data : undefined;
  const locked =
    disabled || busy || pending !== null || resolutionOpen || resolutionPending;

  useEffect(() => {
    const abort = new AbortController();
    setRead({ scope });
    api(
      `/api/clinic/subscriptions/${subscriptionId}/entitlements?page=${page}`,
      { signal: abort.signal },
    )
      .then((value) => {
        if (!abort.signal.aborted)
          setRead({
            scope,
            data: entitlementLedgerResponse(value, subscriptionId, page),
          });
      })
      .catch((reason: unknown) => {
        if (!abort.signal.aborted)
          setRead({
            scope,
            error:
              reason instanceof Error
                ? reason.message
                : "Package records are unavailable.",
          });
      });
    return () => abort.abort();
  }, [subscriptionId, page, scope]);

  useEffect(() => {
    onPendingChange(pending !== null || resolutionPending);
    if (!pending) return;
    const warning =
      "The package action outcome is unconfirmed. Retry the exact request before leaving.";
    const unregister = registerBlocker(() => warning);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = warning;
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [pending, resolutionPending, onPendingChange, registerBlocker]);

  const select = (
    kind: EntitlementKind,
    balance: PackageEntitlement,
    original?: PackageEntitlementEntry,
  ) => {
    if (locked) return;
    setDraft({ kind, balance, original });
    setQuantity("");
    setReference("");
    setError("");
    setNotice("");
  };
  const review = () => {
    if (!data || !draft || locked) return;
    try {
      const current = data.subscription.entitlements?.find(
        (item) => item.service_id === draft.balance.service_id,
      );
      if (!current)
        throw new Error("Refresh the purchased service before continuing.");
      setConfirmation(
        createEntitlementAttempt(
          data.subscription,
          current,
          canWrite,
          draft.kind,
          quantity,
          reference,
          draft.original,
        ),
      );
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Review the action fields.",
      );
    }
  };
  const submit = async (attempt: EntitlementAttempt) => {
    if (inFlight.current || disabled || !canWrite) return;
    if (!pending) {
      try {
        const current = data?.subscription.entitlements?.find(
          (item) => item.service_id === attempt.serviceId,
        );
        if (!data || !current)
          throw new Error(
            "Refresh the package records before recording this action.",
          );
        createEntitlementAttempt(
          data.subscription,
          current,
          canWrite,
          attempt.body.entitlement.kind,
          String(attempt.body.entitlement.quantity ?? ""),
          attempt.body.entitlement.source_reference,
          draft?.original,
          attempt.body.entitlement.request_key,
        );
      } catch (reason) {
        setConfirmation(null);
        setError(
          reason instanceof Error
            ? reason.message
            : "This action is no longer available.",
        );
        return;
      }
    }
    inFlight.current = true;
    setBusy(true);
    setPending(attempt);
    setConfirmation(null);
    setError("");
    setNotice("");
    try {
      const result = await submitEntitlementAttempt(attempt);
      setPending(null);
      setDraft(null);
      setNotice(
        `Recorded ${actionLabels[result.entry.kind]} #${result.entry.id}.`,
      );
      refresh();
      onChanged();
    } catch (reason) {
      const unresolved = entitlementAttemptAfterFailure(
        attempt,
        reason,
        pending,
      );
      setPending(unresolved);
      setError(
        unresolved
          ? `${reason instanceof Error ? reason.message : "The request was not confirmed."} The original action outcome remains unconfirmed. Records will refresh; retry only the exact saved request.`
          : reason instanceof Error
            ? reason.message
            : "The package action was rejected.",
      );
      refresh();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      fullWidth
      maxWidth="md"
      onClose={() => !locked && onClose()}
      aria-labelledby="package-entitlements-title"
    >
      <DialogTitle id="package-entitlements-title">
        Package services · Membership #{subscriptionId}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2">
            These are staff-recorded commercial units. A use or reversal does
            not change clinical records, charges, or stock.
          </Typography>
          {error && (
            <Alert
              severity={pending ? "warning" : "error"}
              action={
                pending && (
                  <Button
                    color="inherit"
                    disabled={busy || disabled || !canWrite}
                    onClick={() => void submit(pending)}
                  >
                    Retry exact request
                  </Button>
                )
              }
            >
              {error}
            </Alert>
          )}
          {pending && !canWrite && (
            <Alert severity="warning">
              Your current permission does not allow retry. Keep this request
              unresolved and ask an authorized billing staff member to reconcile
              the stored evidence.
            </Alert>
          )}
          {notice && <Alert severity="success">{notice}</Alert>}
          {!data ? (
            <LoadState
              error={read.scope === scope ? read.error : undefined}
              onRetry={refresh}
            />
          ) : (
            <>
              <PackageEntitlementBalances
                subscription={data.subscription}
                canWrite={canWrite}
                disabled={locked || confirmation !== null}
                onSelect={select}
              />
              {data.subscription.entitlements?.some(
                (balance) => balance.source === "retained_recurring_allowance",
              ) && (
                <Button
                  disabled={locked || confirmation !== null || draft !== null}
                  onClick={() => setResolutionOpen(true)}
                >
                  Review paid-period overlaps
                </Button>
              )}
              {draft && (
                <Stack spacing={2}>
                  <Divider />
                  <Typography component="h4" variant="subtitle1">
                    Record {actionLabels[draft.kind]} · {draft.balance.name}
                  </Typography>
                  {draft.kind === "opening" && (
                    <Typography variant="body2">
                      Review any earlier unrecorded use before setting this
                      balance. An opening balance can be recorded only once.
                    </Typography>
                  )}
                  {draft.kind === "reversal" ? (
                    <Typography>
                      Restore exactly {draft.original?.quantity} units from use
                      #{draft.original?.id}.
                    </Typography>
                  ) : (
                    <TextField
                      label={
                        draft.kind === "opening"
                          ? "Reviewed units remaining"
                          : "Units used"
                      }
                      value={quantity}
                      onChange={(event) => setQuantity(event.target.value)}
                      disabled={locked || confirmation !== null}
                      slotProps={{
                        htmlInput: { inputMode: "numeric", pattern: "[0-9]*" },
                      }}
                    />
                  )}
                  <TextField
                    label="Source reference"
                    helperText="Reference the reviewed balance, recorded use, or correction evidence."
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    disabled={locked || confirmation !== null}
                    slotProps={{ htmlInput: { maxLength: 160 } }}
                  />
                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="contained"
                      disabled={locked || confirmation !== null}
                      onClick={review}
                    >
                      Review action
                    </Button>
                    <Button
                      disabled={locked || confirmation !== null}
                      onClick={() => setDraft(null)}
                    >
                      Discard draft
                    </Button>
                  </Stack>
                </Stack>
              )}
              <Divider />
              <Typography component="h4" variant="subtitle1">
                Recorded service ledger ({data.total_count})
              </Typography>
              {!data.entries.length && (
                <Typography>No ledger entries on this page.</Typography>
              )}
              {data.entries.map((entry) => {
                const balance = data.subscription.entitlements?.find(
                  (item) => item.service_id === entry.service_id,
                );
                const alreadyReversed = data.entries.some(
                  (row) =>
                    row.reversed_entry_id === entry.id && row.ledger === entry.ledger,
                );
                return (
                  <Stack
                    key={`${entry.ledger || "fixed"}:${entry.id}`}
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1}
                    sx={{ justifyContent: "space-between" }}
                  >
                    <Typography variant="body2">
                      #{entry.id} · {actionLabels[entry.kind]} ·{" "}
                      {balance?.name || `Service #${entry.service_id}`} ·{" "}
                      {entry.quantity} units ·{" "}
                      {subscriptionDate(entry.occurred_at, true)} · Source:{" "}
                      {entry.source_reference}
                      {entry.allowance_window ? ` · Window: ${entry.allowance_window}` : ""}
                      {entry.period_resolution_id ? ` · Resolution #${entry.period_resolution_id}` : ""}
                      {entry.reversed_entry_id
                        ? ` · Reverses #${entry.reversed_entry_id}`
                        : ""}
                    </Typography>
                    {entry.kind === "use" &&
                      balance &&
                      entitlementActionAllowed(
                        data.subscription,
                        balance,
                        canWrite,
                        "reversal",
                      ) && (
                        <Button
                          disabled={
                            locked || confirmation !== null || alreadyReversed
                          }
                          onClick={() => select("reversal", balance, entry)}
                        >
                          {alreadyReversed
                            ? "Reversed"
                            : "Reverse recorded use"}
                        </Button>
                      )}
                  </Stack>
                );
              })}
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Button
                  disabled={
                    locked ||
                    page <= 1 ||
                    confirmation !== null ||
                    draft !== null
                  }
                  onClick={() => setPage((value) => value - 1)}
                >
                  Previous ledger page
                </Button>
                <Typography variant="body2">
                  Page {data.page} of {Math.max(data.total_pages, 1)}
                </Typography>
                <Button
                  disabled={
                    locked ||
                    page >= data.total_pages ||
                    confirmation !== null ||
                    draft !== null
                  }
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next ledger page
                </Button>
              </Stack>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button
          disabled={
            busy || confirmation !== null || resolutionOpen || resolutionPending
          }
          onClick={refresh}
        >
          Refresh package records
        </Button>
        <Button disabled={locked || confirmation !== null} onClick={onClose}>
          Close
        </Button>
      </DialogActions>
      {resolutionOpen && (
        <PaidPeriodResolution
          subscriptionId={subscriptionId}
          canRecord={canWrite && !disabled}
          onResolved={() => {
            refresh();
            onChanged();
          }}
          onClose={() => {
            if (!resolutionPending) setResolutionOpen(false);
          }}
          onUnknownOutcomeChange={setResolutionPending}
        />
      )}
      <Dialog
        open={confirmation !== null}
        fullWidth
        maxWidth="sm"
        onClose={() => setConfirmation(null)}
        aria-labelledby="confirm-entitlement-title"
      >
        <DialogTitle id="confirm-entitlement-title">
          Confirm{" "}
          {confirmation
            ? actionLabels[confirmation.body.entitlement.kind]
            : "package action"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography>
              Membership #{subscriptionId} · {draft?.balance.name}
            </Typography>
            <Typography>
              {confirmation?.body.entitlement.kind === "reversal"
                ? `Reverse use #${confirmation.body.entitlement.reversed_entry_id} in full (${draft?.original?.quantity} units).`
                : `${confirmation?.body.entitlement.quantity} units for ${confirmation ? actionLabels[confirmation.body.entitlement.kind] : "this action"}.`}
            </Typography>
            <Typography>
              Source: {confirmation?.body.entitlement.source_reference}
            </Typography>
            <Typography variant="body2">
              Confirm that this is the intended commercial record. The saved
              evidence will be immutable.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmation(null)}>Back to draft</Button>
          <Button
            variant="contained"
            disabled={disabled || !canWrite || !data}
            onClick={() => confirmation && void submit(confirmation)}
          >
            Confirm and record
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
