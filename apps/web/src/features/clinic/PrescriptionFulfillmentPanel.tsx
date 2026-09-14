import { Alert, Autocomplete, Box, Button, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import type { MedicationRequestRevision } from "../../api/contracts";

type Event = { id: number; medication_request_revision_id: number; kind: string; source: string; note: string | null; recorded_at: string };
type Dispense = { id: number; original_dispense_id: number | null; status: string; quantity: string; stock_unit: string; reason: string | null; handed_over_at: string };
type Evidence = { events: Event[]; dispenses: Dispense[]; remaining_quantity: string | null; transmission_available: false };
type Batch = { batch_id: number; product_id: number; lot_number: string; available_quantity: string; stock_unit: string; expires_on: string };

export function PrescriptionFulfillmentPanel({ patientId, encounterId, orders, canWrite }: {
  patientId: number; encounterId: number; orders: MedicationRequestRevision[]; canWrite: boolean;
}) {
  const [orderId, setOrderId] = useState(orders[0]?.id ?? 0);
  const [evidence, setEvidence] = useState<Evidence>();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [canDispense, setCanDispense] = useState(false);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [quantity, setQuantity] = useState("");
  const [when, setWhen] = useState("");
  const [note, setNote] = useState("");
  const [scenario, setScenario] = useState("failure_before_send");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [pending, setPending] = useState<{ path: string; body: unknown } | null>(null);
  const generation = useRef(0);
  const order = orders.find((row) => row.id === orderId);
  const path = `/api/clinic/patients/${patientId}/medication_requests/${orderId}`;
  useEffect(() => {
    if (!orders.some((row) => row.id === orderId)) setOrderId(orders[0]?.id ?? 0);
  }, [orders, orderId]);
  useEffect(() => {
    const controller = new AbortController();
    generation.current += 1;
    setEvidence(undefined); setError(""); setPending(null); setNote(""); setBatch(null); setQuantity(""); setWhen(""); setBusy(false);
    void api<Evidence>(`${path}/events`, { signal: controller.signal }).then((result) => { if (!controller.signal.aborted) setEvidence(result); }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Prescription history is unavailable.");
    });
    return () => controller.abort();
  }, [path, reload]);
  useEffect(() => {
    const controller = new AbortController();
    void api<{ eligible_batches: Batch[]; can_administer: boolean }>(`/api/clinic/encounters/${encounterId}/medication_administrations`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) { setBatches(result.eligible_batches); setCanDispense(result.can_administer); } })
      .catch(() => { if (!controller.signal.aborted) { setBatches([]); setCanDispense(false); } });
    return () => controller.abort();
  }, [encounterId, reload]);
  async function execute(attempt: { path: string; body: unknown }) {
    const started = generation.current;
    setBusy(true); setError(""); setPending(attempt);
    try {
      await api(attempt.path, { method: "POST", body: attempt.body });
      if (started === generation.current) { setPending(null); setReload((value) => value + 1); }
    } catch (reason) {
      if (started === generation.current) setError(reason instanceof Error ? reason.message : "Outcome is not confirmed. Refresh or retry this exact request.");
    } finally { if (started === generation.current) setBusy(false); }
  }
  function event(kind: string, source: string, prior?: Event) {
    void execute({ path: `${path}/events`, body: { prescription_event: { kind, source, prior_event_id: prior?.id, note, request_key: crypto.randomUUID() } } });
  }
  function dispense(status: string, originalId?: number) {
    const timestamp = new Date(when);
    if (!when || !Number.isFinite(timestamp.getTime())) { setError("Record the actual handover or correction time."); return; }
    void execute({ path: `${path}/dispenses`, body: { dispense: { status, original_dispense_id: originalId, batch_id: batch?.batch_id,
      quantity, reason: note, handed_over_at: timestamp.toISOString(), request_key: crypto.randomUUID() } } });
  }
  const latest = evidence?.events.filter((event) => event.kind !== "review").at(-1);
  const unresolved = latest && ["unknown", "acknowledged"].includes(latest.kind);
  const disabled = busy || pending !== null || !canWrite || !evidence;
  return <Paper variant="outlined" sx={{ p: 2, mt: 2 }}><Stack spacing={2}>
    <Typography variant="h6">Prescription review and fulfillment</Typography>
    <TextField select label="Prescription version" value={orderId} disabled={busy || pending !== null} onChange={(event) => setOrderId(Number(event.target.value))}>
      {orders.map((row) => <MenuItem key={row.id} value={row.id}>{row.medication_name} · version {row.version_number} · {row.status}</MenuItem>)}
    </TextField>
    <Alert severity="info">Prescription preparation is local. Transmission is unavailable. Simulator outcomes remain labeled and never confirm a pharmacy dispense.</Alert>
    {error && <Alert severity="warning">{error}</Alert>}
    {pending && <Stack direction="row" spacing={1}><Button disabled={busy} onClick={() => void execute(pending)}>Retry exact request</Button>
      <Button disabled={busy} onClick={() => setReload((value) => value + 1)}>Refresh evidence</Button></Stack>}
    {order && <Typography>{order.medication_strength} {order.medication_form} · {order.dose_text} · {order.route_text} · {order.frequency_text}<br />
      {order.instructions}<br />Quantity {order.prescribed_quantity ?? "not recorded"} {order.quantity_unit} · Refills {order.refills ?? "not recorded"}<br />
      {order.fulfillment_route?.replaceAll("_", " ") ?? "Fulfillment not selected"} · {order.pharmacy_name} {order.pharmacy_location}</Typography>}
    <TextField label="Review, reconciliation or partial-handover note" value={note} multiline disabled={busy || pending !== null} onChange={(event) => setNote(event.target.value)} />
    <Button disabled={disabled || !!unresolved} onClick={() => event("review", "manual")}>Confirm current prescription review</Button>
    {unresolved ? <Box><Alert severity="warning">Confirm the previous prescription outcome before changing or repeating fulfillment.</Alert>
      <Button disabled={disabled || !note.trim()} onClick={() => event("confirmed_not_sent", latest.source, latest)}>Record confirmed not sent</Button>
      <Button disabled={disabled || !note.trim()} onClick={() => event("cancelled", latest.source, latest)}>Record confirmed cancellation</Button></Box> :
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}><TextField select label="Simulator outcome" value={scenario} onChange={(event) => setScenario(event.target.value)}>
        {["failure_before_send", "rejected", "acknowledged", "unknown"].map((value) => <MenuItem key={value} value={value}>{value.replaceAll("_", " ")}</MenuItem>)}
      </TextField><Button disabled={disabled} onClick={() => event(scenario, "simulation")}>Record simulated attempt</Button></Stack>}
    {evidence?.events.map((item) => <Typography key={item.id} variant="body2">{item.source === "simulation" ? "Simulation" : "Manual evidence"} · {item.kind.replaceAll("_", " ")} · version record {item.medication_request_revision_id} · {new Date(item.recorded_at).toLocaleString()}</Typography>)}
    {order?.fulfillment_route === "take_home" && <Stack spacing={1}>
      <Typography variant="subtitle1">Take-home handover · Remaining {evidence?.remaining_quantity ?? "unavailable"} {order.quantity_unit}</Typography>
      <Autocomplete options={batches.filter((item) => item.product_id === order.inventory_product_id)} value={batch}
        onChange={(_event, value) => setBatch(value)} getOptionLabel={(item) => `Lot ${item.lot_number} · ${item.available_quantity} ${item.stock_unit} · expires ${item.expires_on}`}
        renderInput={(params) => <TextField {...params} label="Stock lot" />} />
      <TextField label="Quantity handed over" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
      <TextField label="Actual handover or correction time" type="datetime-local" slotProps={{ inputLabel: { shrink: true } }} value={when} onChange={(event) => setWhen(event.target.value)} />
      <Button disabled={disabled || !canDispense || !!unresolved} onClick={() => dispense("handed_over")}>Record take-home handover</Button>
      <Button disabled={disabled || !canDispense || !note.trim()} onClick={() => dispense("not_done")}>Record not handed over</Button>
      {evidence?.dispenses.map((item) => <Box key={item.id}><Typography>{item.status.replaceAll("_", " ")} · {item.quantity} {item.stock_unit} · {new Date(item.handed_over_at).toLocaleString()} · {item.reason}</Typography>
        {item.status === "handed_over" && !evidence.dispenses.some((other) => other.original_dispense_id === item.id) &&
          <Button disabled={disabled || !canDispense || !note.trim()} onClick={() => dispense("reversed", item.id)}>Reverse this recorded handover</Button>}</Box>)}
    </Stack>}
  </Stack></Paper>;
}
