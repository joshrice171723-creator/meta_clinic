import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import type { ClinicalPlanWorkspace } from "../../api/contracts";
import { api, ApiError } from "../../api/client";
import { useClinicNavigation } from "./clinicNavigation";

type LinkSourceKind = "medication_request" | "service_request";
type LinkTargetKind = keyof ClinicalPlanWorkspace["available_link_targets"];
type Attempt = { path: string; root: "clinical_plan_link" | "referral_event"; body: Record<string, unknown> };

const LINK_TARGETS: Record<LinkSourceKind, readonly LinkTargetKind[]> = {
  medication_request: ["medication_statement", "medication_administration"],
  service_request: ["lab_report", "procedure", "document"],
};
const REFERRAL_TRANSITIONS: Record<string, readonly string[]> = {
  none: ["prepared", "sent", "received"],
  prepared: ["sent", "cancelled"],
  sent: ["received", "acknowledged", "cancelled"],
  received: ["acknowledged", "closed"],
  acknowledged: ["closed"],
  closed: [],
  cancelled: [],
};

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

export function ClinicalPlanClosurePanel({
  data,
  base,
  disabled,
  refresh,
}: {
  data: ClinicalPlanWorkspace;
  base: string;
  disabled: boolean;
  refresh: () => Promise<void> | void;
}) {
  const { registerBlocker } = useClinicNavigation();
  const [mode, setMode] = useState<"link" | "referral" | null>(null);
  const [sourceKind, setSourceKind] = useState<LinkSourceKind>("service_request");
  const [sourceRevisionId, setSourceRevisionId] = useState("");
  const [targetKind, setTargetKind] = useState<LinkTargetKind>("lab_report");
  const [targetId, setTargetId] = useState("");
  const [outcomeSummary, setOutcomeSummary] = useState("");
  const [direction, setDirection] = useState<"outbound" | "inbound">("outbound");
  const [stage, setStage] = useState("prepared");
  const [organizationName, setOrganizationName] = useState("");
  const [note, setNote] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<Attempt | null>(null);

  useEffect(
    () => registerBlocker(() => pending && "A fulfillment save outcome is unknown. Retry the exact request before leaving."),
    [pending, registerBlocker],
  );

  const sources = sourceKind === "medication_request" ? data.records.medication_requests : data.records.service_requests;
  const selectedSource = sources.find((record) => String(record.id) === sourceRevisionId);
  const allowedTargetKinds: readonly LinkTargetKind[] = sourceKind === "medication_request"
    ? LINK_TARGETS.medication_request
    : selectedSource && "request_kind" in selectedSource
      ? selectedSource.request_kind === "lab"
        ? ["lab_report", "document"]
        : selectedSource.request_kind === "procedure"
          ? ["procedure", "document"]
          : ["document"]
      : LINK_TARGETS.service_request;
  const referrals = data.records.service_requests.filter((record) => record.request_kind === "referral");
  const selectedReferral = referrals.find((record) => String(record.id) === sourceRevisionId);
  const latestReferralEvent = selectedReferral
    ? data.referral_events.find((event) => event.service_request_series_id === selectedReferral.series_id)
    : undefined;
  const allowedReferralStages = REFERRAL_TRANSITIONS[latestReferralEvent?.stage ?? "none"] ?? [];

  useEffect(() => {
    if (latestReferralEvent) setDirection(latestReferralEvent.direction);
  }, [latestReferralEvent]);
  const sourceLabels = useMemo(
    () => new Map([
      ...data.records.medication_requests.map((record) => [record.id, record.medication_name] as const),
      ...data.records.service_requests.map((record) => [record.id, record.requested_display] as const),
    ]),
    [data.records.medication_requests, data.records.service_requests],
  );

  function openLink() {
    const nextSourceKind: LinkSourceKind = data.records.service_requests.length ? "service_request" : "medication_request";
    setSourceKind(nextSourceKind);
    setSourceRevisionId("");
    setTargetKind(LINK_TARGETS[nextSourceKind][0]);
    setTargetId("");
    setOutcomeSummary("");
    setError("");
    setPending(null);
    setMode("link");
  }

  function openReferral() {
    setSourceRevisionId("");
    setDirection("outbound");
    setStage("prepared");
    setOrganizationName("");
    setNote("");
    setDocumentId("");
    setError("");
    setPending(null);
    setMode("referral");
  }

  async function execute(attempt: Attempt) {
    setBusy(true);
    setError("");
    try {
      await api(attempt.path, { method: "POST", body: { [attempt.root]: attempt.body } });
      setPending(null);
      setMode(null);
      setNotice(attempt.root === "clinical_plan_link" ? "Fulfillment evidence linked." : "Referral exchange updated.");
      await refresh();
    } catch (caught) {
      const unknown = caught instanceof ApiError && caught.code === "outcome_unconfirmed";
      if (unknown) setPending(attempt);
      setError(caught instanceof Error ? caught.message : "The clinical linkage could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  function saveLink() {
    if (!sourceRevisionId || !targetId) return;
    void execute({
      path: `${base}/clinical_plan_workspace/fulfillment_links`,
      root: "clinical_plan_link",
      body: {
        source_kind: sourceKind,
        source_revision_id: Number(sourceRevisionId),
        target_kind: targetKind,
        target_id: Number(targetId),
        outcome_summary: outcomeSummary.trim() || null,
        request_key: crypto.randomUUID(),
      },
    });
  }

  function saveReferral() {
    if (!sourceRevisionId || !stage) return;
    void execute({
      path: `${base}/clinical_plan_workspace/referral_events`,
      root: "referral_event",
      body: {
        service_request_revision_id: Number(sourceRevisionId), direction, stage,
        organization_name: organizationName.trim() || null,
        note: note.trim() || null,
        document_id: documentId ? Number(documentId) : null,
        request_key: crypto.randomUUID(),
      },
    });
  }

  return (
    <Paper component="section" variant="outlined" sx={{ p: 1.5 }}>
      <Stack spacing={1.5}>
        <Box>
          <Typography component="h3" variant="subtitle2">Fulfillment and referral loop</Typography>
          <Typography color="text.secondary" variant="body2">
            Connect an order to the record that fulfilled it and preserve each referral exchange as attributed evidence.
          </Typography>
        </Box>
        {notice && <Alert severity="success">{notice}</Alert>}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <Button variant="outlined" disabled={disabled || pending !== null ||
            (data.records.medication_requests.length === 0 && data.records.service_requests.length === 0)} onClick={openLink}>
            Link fulfillment
          </Button>
          <Button variant="outlined" disabled={disabled || pending !== null || referrals.length === 0} onClick={openReferral}>
            Record referral exchange
          </Button>
        </Stack>
        {pending && (
          <Alert severity="warning" action={<Button color="inherit" disabled={busy} onClick={() => void execute(pending)}>Retry exact request</Button>}>
            The save outcome is unknown. Do not create a replacement request.
          </Alert>
        )}
        {data.links.length > 0 && (
          <Stack spacing={0.75}>
            {data.links.slice(0, 5).map((link) => (
              <Stack key={link.id} direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                <Chip size="small" label={humanize(link.target_kind)} />
                <Typography variant="body2">
                  {sourceLabels.get(link.source_revision_id) ?? `Request ${link.source_revision_id}`} linked to record {link.target_id}
                  {link.outcome_summary ? ` · ${link.outcome_summary}` : ""}
                </Typography>
              </Stack>
            ))}
          </Stack>
        )}
        {data.referral_events.length > 0 && (
          <Stack spacing={0.75}>
            {data.referral_events.slice(0, 5).map((event) => (
              <Stack key={event.id} direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                <Chip size="small" color={event.stage === "closed" ? "success" : "default"} label={humanize(event.stage)} />
                <Typography variant="body2">
                  {sourceLabels.get(event.service_request_revision_id) ?? "Referral"} · {humanize(event.direction)}
                  {event.organization_name ? ` · ${event.organization_name}` : ""}
                </Typography>
              </Stack>
            ))}
          </Stack>
        )}
      </Stack>

      <Dialog open={mode === "link"} onClose={() => !busy && !pending && setMode(null)} fullWidth maxWidth="sm">
        <DialogTitle>Link fulfillment evidence</DialogTitle>
        <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity={pending ? "warning" : "error"}>{error}</Alert>}
          <FormControl fullWidth><InputLabel id="link-source-kind">Request type</InputLabel>
            <Select labelId="link-source-kind" label="Request type" value={sourceKind} onChange={(event) => {
              const next = event.target.value as LinkSourceKind;
              setSourceKind(next); setSourceRevisionId(""); setTargetKind(LINK_TARGETS[next][0]); setTargetId("");
            }}>
              <MenuItem value="medication_request">Medication request</MenuItem>
              <MenuItem value="service_request">Order or referral</MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth required><InputLabel id="link-source">Request</InputLabel>
            <Select labelId="link-source" label="Request" value={sourceRevisionId} onChange={(event) => {
              const nextId = event.target.value;
              const nextSource = sources.find((record) => String(record.id) === nextId);
              const nextTarget: LinkTargetKind = sourceKind === "medication_request"
                ? "medication_statement"
                : nextSource && "request_kind" in nextSource && nextSource.request_kind === "lab"
                  ? "lab_report"
                  : nextSource && "request_kind" in nextSource && nextSource.request_kind === "procedure"
                    ? "procedure"
                    : "document";
              setSourceRevisionId(nextId); setTargetKind(nextTarget); setTargetId("");
            }}>
              {sources.map((record) => <MenuItem key={record.id} value={String(record.id)}>{sourceLabels.get(record.id)} · {humanize(record.status)}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl fullWidth><InputLabel id="link-target-kind">Result type</InputLabel>
            <Select labelId="link-target-kind" label="Result type" value={targetKind} onChange={(event) => {
              setTargetKind(event.target.value as LinkTargetKind); setTargetId("");
            }}>
              {allowedTargetKinds.map((value) => <MenuItem key={value} value={value}>{humanize(value)}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl fullWidth required><InputLabel id="link-target">Result record</InputLabel>
            <Select labelId="link-target" label="Result record" value={targetId} onChange={(event) => setTargetId(event.target.value)}>
              {data.available_link_targets[targetKind].map((target) => <MenuItem key={target.id} value={String(target.id)}>{target.label}</MenuItem>)}
            </Select>
          </FormControl>
          {data.available_link_targets[targetKind].length === 0 && <Alert severity="info">No eligible {humanize(targetKind).toLowerCase()} records are available for this patient and encounter.</Alert>}
          <TextField label="Outcome summary" value={outcomeSummary} onChange={(event) => setOutcomeSummary(event.target.value)} multiline minRows={2} />
        </Stack></DialogContent>
        <DialogActions><Button disabled={busy || pending !== null} onClick={() => setMode(null)}>Cancel</Button>
          <Button variant="contained" disabled={busy || pending !== null || !sourceRevisionId || !targetId} onClick={saveLink}>Save link</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={mode === "referral"} onClose={() => !busy && !pending && setMode(null)} fullWidth maxWidth="sm">
        <DialogTitle>Record referral exchange</DialogTitle>
        <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity={pending ? "warning" : "error"}>{error}</Alert>}
          <FormControl fullWidth required><InputLabel id="referral-source">Referral</InputLabel>
            <Select labelId="referral-source" label="Referral" value={sourceRevisionId} onChange={(event) => {
              setSourceRevisionId(event.target.value); setStage("");
            }}>
              {referrals.map((record) => <MenuItem key={record.id} value={String(record.id)}>{record.requested_display} · {humanize(record.status)}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl fullWidth><InputLabel id="referral-direction">Direction</InputLabel>
            <Select labelId="referral-direction" label="Direction" value={direction} disabled={Boolean(latestReferralEvent)} onChange={(event) => setDirection(event.target.value as "outbound" | "inbound")}>
              <MenuItem value="outbound">Outbound</MenuItem><MenuItem value="inbound">Inbound</MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth required><InputLabel id="referral-stage">Next stage</InputLabel>
            <Select labelId="referral-stage" label="Next stage" value={stage} onChange={(event) => setStage(event.target.value)}>
              {allowedReferralStages.map((value) => <MenuItem key={value} value={value}>{humanize(value)}</MenuItem>)}
            </Select>
          </FormControl>
          {selectedReferral && allowedReferralStages.length === 0 && <Alert severity="success">This referral loop is terminal.</Alert>}
          <TextField label="Outside organization" value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} />
          <TextField label="Exchange note" value={note} onChange={(event) => setNote(event.target.value)} multiline minRows={2} />
          <FormControl fullWidth><InputLabel id="referral-document">Attached chart document</InputLabel>
            <Select labelId="referral-document" label="Attached chart document" value={documentId} onChange={(event) => setDocumentId(event.target.value)}>
              <MenuItem value="">No attached document</MenuItem>
              {data.available_link_targets.document.map((target) => <MenuItem key={target.id} value={String(target.id)}>{target.label}</MenuItem>)}
            </Select>
          </FormControl>
        </Stack></DialogContent>
        <DialogActions><Button disabled={busy || pending !== null} onClick={() => setMode(null)}>Cancel</Button>
          <Button variant="contained" disabled={busy || pending !== null || !sourceRevisionId || !stage} onClick={saveReferral}>Record event</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
