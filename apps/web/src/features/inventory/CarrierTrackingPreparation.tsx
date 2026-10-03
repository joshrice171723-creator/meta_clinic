import { useEffect, useRef, useState } from "react";
import { Alert, Button, Stack, TextField, Typography } from "@mui/material";
import { api } from "../../api/client";
import { formatDisplayDateTime } from "../../shared/dateTime";
import { useClinicNavigation } from "../clinic/clinicNavigation";
import { useClinic } from "../clinic/Workspace";

type Snapshot = {
  shipment_id: string;
  source_version: string;
  purchase_order_id: string;
  reference: string;
  supplier_reference: string;
  carrier: string;
  tracking_number: string;
  package_count: string;
  expected_units: string;
  recorded_at: string;
  source: "manual_shipment_record";
  operation: "tracking_lookup";
};
export type CarrierPreparation = {
  id: string;
  attempt_id: string;
  correlation_id: string;
  request_key: string;
  source_digest: string;
  status: "prepared";
  connection_status: "disconnected";
  delivery_outcome: "unknown";
  source: "local_preparation";
  actor_id: string;
  prepared_at: string;
  reason: string;
  snapshot: Snapshot;
};
type PreparationRead = {
  source_digest: string;
  can_prepare: boolean;
  snapshot: Snapshot;
  attempts: CarrierPreparation[];
  truncated: boolean;
  recovered_attempt: CarrierPreparation | null;
};
type FrozenRequest = {
  request_key: string;
  source_digest: string;
  reason: string;
};

export function CarrierTrackingPreparation({
  shipmentId,
  canPrepare,
  externalBusy,
  onBlockedChange,
}: {
  shipmentId: string;
  canPrepare: boolean;
  externalBusy: boolean;
  onBlockedChange: (shipmentId: string, blocked: boolean) => void;
}) {
  const { practice } = useClinic();
  const { registerBlocker } = useClinicNavigation();
  const endpoint = `/api/clinic/inventory/shipments/${shipmentId}/carrier-preparations`;
  const [data, setData] = useState<PreparationRead | null>(null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<FrozenRequest | null>(null);
  const pendingRef = useRef<FrozenRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [readFailed, setReadFailed] = useState(false);
  const [reconciledMissing, setReconciledMissing] = useState(false);
  const generation = useRef(0);
  const readSequence = useRef(0);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    onBlockedChange(shipmentId, busy || Boolean(pending));
    return () => onBlockedChange(shipmentId, false);
  }, [busy, pending, onBlockedChange, shipmentId]);

  useEffect(() => {
    if (!pending) return;
    const message =
      "This local preparation save is unconfirmed. Reconcile its retained request before leaving.";
    const unregister = registerBlocker(() => message);
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message;
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", warn);
    };
  }, [pending, registerBlocker]);

  const retain = (request: FrozenRequest | null) => {
    setReconciledMissing(false);
    pendingRef.current = request;
    setPending(request);
  };
  const read = async (fence = generation.current) => {
    const retained = pendingRef.current;
    const sequence = ++readSequence.current;
    setReading(true);
    try {
      const response = await api<{ data: PreparationRead }>(
        endpoint + (retained ? `?request_key=${retained.request_key}` : ""),
      );
      if (fence !== generation.current || sequence !== readSequence.current)
        return;
      if (!response.data || !Array.isArray(response.data.attempts))
        throw new Error(
          "The saved preparation history could not be confirmed.",
        );
      setData(response.data);
      setReadFailed(false);
      if (
        retained &&
        response.data.recovered_attempt?.request_key === retained.request_key &&
        response.data.recovered_attempt.source_digest ===
          retained.source_digest &&
        response.data.recovered_attempt.reason === retained.reason
      ) {
        retain(null);
        setReason("");
        setError("");
        setNotice(
          "Saved preparation reconciled. External carrier outcome remains unknown.",
        );
      } else if (retained) {
        setReconciledMissing(true);
        setNotice(
          "No saved preparation was found for the retained key. Retry it exactly, or explicitly review the current source.",
        );
      }
    } catch (failure) {
      if (fence !== generation.current || sequence !== readSequence.current)
        return;
      setReconciledMissing(false);
      setReadFailed(true);
      setError(
        failure instanceof Error
          ? failure.message
          : "Preparation history unavailable.",
      );
    } finally {
      if (fence === generation.current && sequence === readSequence.current)
        setReading(false);
    }
  };

  useEffect(() => {
    const fence = ++generation.current;
    setData(null);
    setReadFailed(false);
    void read(fence);
    return () => {
      generation.current++;
    };
    // The parent keys this panel by actor, practice and shipment identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipmentId]);

  const save = async () => {
    if (
      busyRef.current ||
      reading ||
      externalBusy ||
      !canPrepare ||
      !data ||
      readFailed
    )
      return;
    const request = pendingRef.current ?? {
      request_key: crypto.randomUUID(),
      source_digest: data.source_digest,
      reason: reason.trim(),
    };
    if (
      !pendingRef.current &&
      (!data.can_prepare ||
        !request.reason ||
        data.attempts.some(
          (attempt) => attempt.source_digest === data.source_digest,
        ))
    )
      return;
    const fence = generation.current;
    busyRef.current = true;
    setBusy(true);
    retain(request);
    setError("");
    setNotice("");
    try {
      const response = await api<{
        acknowledged: boolean;
        data: CarrierPreparation;
      }>(endpoint, {
        method: "POST",
        body: { preparation: request },
      });
      if (fence !== generation.current) return;
      if (
        response.acknowledged !== true ||
        response.data?.request_key !== request.request_key ||
        response.data.source_digest !== request.source_digest ||
        response.data.reason !== request.reason
      )
        throw new Error(
          "The preparation response could not be confirmed. Reconcile the retained request.",
        );
      retain(null);
      setReason("");
      setNotice(
        "Local preparation saved. External carrier outcome remains unknown.",
      );
      await read(fence);
    } catch (failure) {
      if (fence !== generation.current) return;
      setError(
        failure instanceof Error
          ? failure.message
          : "The preparation outcome is unconfirmed.",
      );
      // A denied retry cannot erase a prior uncertain commit or change its intent.
    } finally {
      if (fence === generation.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };

  const writeDisabled =
    busy || reading || externalBusy || !canPrepare || readFailed || !data;
  const alreadyPrepared = data?.attempts.some(
    (attempt) => attempt.source_digest === data.source_digest,
  );
  return (
    <Stack
      component="section"
      aria-label="Local carrier tracking preparation"
      spacing={2}
      sx={{ mt: 3 }}
    >
      <Typography component="h3" variant="h6">
        Local carrier tracking preparation
      </Typography>
      <Alert severity="info">
        Carrier connection disconnected. Prepare a local tracking lookup using recorded identifiers; nothing is sent. External carrier outcome stays unknown. No automatic submission is queued, and this does not record delivery or receiving.
      </Alert>
      {data && (
        <Typography variant="body2">
          Reviewed source: {data.snapshot.source_version} · Supplied carrier {data.snapshot.carrier || "not recorded"} · Tracking {data.snapshot.tracking_number || "not recorded"} · Source: manual shipment record
        </Typography>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="info">{notice}</Alert>}
      <Button
        variant="outlined"
        disabled={busy || reading || externalBusy}
        onClick={() => void read()}
      >
        {pending
          ? "Reconcile saved preparation"
          : "Refresh preparation history"}
      </Button>
      {pending ? (
        <>
          <Typography>
            Local save outcome unconfirmed · retained key {pending.request_key}.
            Other shipment/order actions remain locked until this request is reconciled.
          </Typography>
          <Button
            variant="contained"
            disabled={writeDisabled}
            onClick={() => void save()}
          >
            Retry exact local preparation
          </Button>
          {reconciledMissing && (
            <Button
              variant="outlined"
              disabled={busy || reading || externalBusy}
              onClick={() => {
                retain(null);
                setReason("");
                setError("");
                setNotice(
                  "Retained local request cleared after checking history. Review the current source; no carrier action was taken.",
                );
              }}
            >
              Review current source
            </Button>
          )}
        </>
      ) : data?.can_prepare && !alreadyPrepared ? (
        <Stack
          component="form"
          spacing={2}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <TextField
            label="Preparation reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={writeDisabled}
            required
            size="small"
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
          <Button
            type="submit"
            variant="contained"
            disabled={writeDisabled || !reason.trim()}
          >
            Save local preparation
          </Button>
        </Stack>
      ) : (
        <Typography>
          {alreadyPrepared
            ? "This immutable shipment source already has a saved preparation. Review its evidence below."
            : "Recorded carrier/tracking identifiers, active inventory and permission are required."}
        </Typography>
      )}
      {!canPrepare && (
        <Typography>
          View only · inventory.receive permission is required to prepare
          a tracking lookup.
        </Typography>
      )}
      {data?.truncated && (
        <Typography>
          Showing the newest 25 preparations. Earlier history remains stored.
        </Typography>
      )}
      {data?.attempts.map((attempt) => (
        <Stack
          component="article"
          aria-label={`Preparation ${attempt.attempt_id}`}
          spacing={1}
          key={attempt.attempt_id}
        >
          <Typography>
            Attempt {attempt.attempt_id} · {attempt.snapshot.source_version} ·{" "}
            {attempt.source_digest === data.source_digest
              ? "Current source"
              : "Historical source; review shipment identifiers before any future carrier action"}
          </Typography>
          <Typography>
            Prepared{" "}
            {formatDisplayDateTime(attempt.prepared_at, {
              timeZone: practice.timezone,
            })}{" "}
            · Staff #{attempt.actor_id} · Correlation {attempt.correlation_id}
          </Typography>
          <Typography>
            Source: local preparation · Connection: disconnected · External
            carrier outcome: unknown
          </Typography>
          <Typography>{attempt.reason}</Typography>
          <Typography>
            Shipment {attempt.snapshot.reference} · Order #{attempt.snapshot.purchase_order_id} · Supplier reference {attempt.snapshot.supplier_reference}
          </Typography>
          <Typography>
            Supplied carrier: {attempt.snapshot.carrier} · Tracking: {attempt.snapshot.tracking_number}
          </Typography>
          <Typography>
            Source: manual shipment record ·{" "}
            {formatDisplayDateTime(attempt.snapshot.recorded_at, {
              timeZone: practice.timezone,
            })}{" "}
            · {attempt.snapshot.package_count} packages ·{" "}
            {attempt.snapshot.expected_units} expected units
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}
