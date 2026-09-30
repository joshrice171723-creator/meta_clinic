import { useEffect, useRef, useState } from "react";
import { Alert, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { api, ApiError } from "../../api/client";
import { LoadState, useResource } from "../../shared/ui";
import type { BlockReasonCategory, OperationalPolicy, OperationalPolicyResponse } from "./operationalPolicyContracts";

type ThresholdDraft = BlockReasonCategory & { minutes: string };
type SaveBody = {
  request_key: string;
  expected_revision: number;
  block_categories: BlockReasonCategory[];
  waiting_thresholds: (BlockReasonCategory & { minutes: number })[];
};

// Mount with key={siteId}: draft and request ownership are local to one site.
export function OperationalPolicySettings({ siteId }: { siteId: number }) {
  const path = `/api/clinic/facilities/${siteId}/operational_policy`;
  const resource = useResource<OperationalPolicyResponse>(path);
  const [categories, setCategories] = useState<BlockReasonCategory[]>([]);
  const [thresholds, setThresholds] = useState<ThresholdDraft[]>([]);
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState<SaveBody | null>(null);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const history = useResource<{ versions: OperationalPolicy[]; capped: boolean }>(`${path}/history`, { enabled: showHistory });
  const hydrated = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const adopt = (policy: OperationalPolicy) => {
    setCategories(policy.block_categories.map((entry) => ({ ...entry })));
    setThresholds(policy.waiting_thresholds.map((entry) => ({ ...entry, minutes: String(entry.minutes) })));
    setRevision(policy.revision);
  };
  useEffect(() => {
    if (!resource.data || hydrated.current) return;
    hydrated.current = true;
    adopt(resource.data.policy);
  }, [resource.data]);

  const canWrite = resource.data?.can_write === true;
  const locked = !canWrite || saving || uncertain !== null;
  const stale = resource.data !== undefined && resource.data.policy.revision !== revision;
  const invalid = categories.some((entry) => !entry.label.trim()) || thresholds.some((entry) =>
    !entry.label.trim() || !/^\d+$/.test(entry.minutes) || Number(entry.minutes) < 1 || Number(entry.minutes) > 2147483647);
  const save = async (retry = false) => {
    if (!canWrite || saving || (!retry && (uncertain || invalid || stale))) return;
    const body = retry && uncertain ? uncertain : {
      request_key: crypto.randomUUID(), expected_revision: revision,
      block_categories: categories.map((entry) => ({ key: entry.key, label: entry.label.trim() })),
      waiting_thresholds: thresholds.map((entry) => ({ key: entry.key, label: entry.label.trim(), minutes: Number(entry.minutes) })),
    };
    setSaving(true);
    setFeedback(null);
    try {
      const response = await api<{ policy: OperationalPolicy }>(path, { method: "PATCH", body: { policy: body } });
      if (!mounted.current) return;
      setUncertain(null);
      adopt(response.policy);
      setFeedback({ error: false, text: `Operational policy revision ${response.policy.revision} saved.` });
      resource.refresh();
      if (showHistory) history.refresh();
    } catch (reason) {
      if (!mounted.current) return;
      const rejected = reason instanceof ApiError && reason.code !== "outcome_unconfirmed" && [400, 401, 403, 404, 409, 422].includes(reason.status);
      setUncertain(rejected ? null : body);
      setFeedback({ error: true, text: reason instanceof Error ? reason.message : "Unable to confirm the policy save." });
      if (rejected) resource.refresh();
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  return <Paper variant="outlined" sx={{ p: 3, mt: 2 }}>
    <Stack spacing={2}>
      <Typography component="h2" variant="h6">Waiting review and block categories</Typography>
      {resource.error && <Alert severity="error">{resource.error}<Button onClick={resource.refresh}>Refresh policy</Button></Alert>}
      {!resource.data && !resource.error && <LoadState />}
      {resource.data && <>
        <Typography variant="body2" color="text.secondary">
          Location policy revision {revision} · {resource.data.policy.configured ? "Clinic configured" : "Unconfigured"}
          {resource.data.policy.effective_from ? ` · Effective ${new Date(resource.data.policy.effective_from).toLocaleString()}` : ""}
        </Typography>
        <Typography variant="body2">Enter the clinic's operational labels and review thresholds. Empty lists leave the corresponding policy unconfigured. These settings do not assign clinical urgency, contact patients, create tasks or change booking capacity.</Typography>
        <Typography variant="subtitle1">Structured block categories</Typography>
        {categories.length === 0 && <Typography variant="body2" color="text.secondary">No categories configured. Existing free-text block reasons remain available.</Typography>}
        {categories.map((entry, index) => <Stack key={entry.key} direction={{ xs: "column", sm: "row" }} spacing={1}>
          <TextField label={`Block category ${index + 1}`} value={entry.label} disabled={locked} fullWidth
            slotProps={{ htmlInput: { maxLength: 120 } }} onChange={(event) => setCategories((rows) => rows.map((row) => row.key === entry.key ? { ...row, label: event.target.value } : row))} />
          <Button disabled={locked} onClick={() => setCategories((rows) => rows.filter((row) => row.key !== entry.key))}>Remove category {index + 1}</Button>
        </Stack>)}
        {canWrite && <Button disabled={locked || categories.length >= 20} onClick={() => setCategories((rows) => [...rows, { key: crypto.randomUUID(), label: "" }])} sx={{ alignSelf: "flex-start" }}>Add block category</Button>}
        <Typography variant="subtitle1">Waiting review thresholds</Typography>
        <Typography variant="body2" color="text.secondary">The board compares whole elapsed minutes from the recorded encounter start for a waiting encounter without an assigned room. It does not measure a separately recorded waiting-stage start. Unknown or future timestamps remain unknown. Actions and escalation recipients require a separate clinic-defined workflow.</Typography>
        {thresholds.length === 0 && <Typography variant="body2" color="text.secondary">No waiting threshold configured. No default threshold applies.</Typography>}
        {thresholds.map((entry, index) => <Stack key={entry.key} direction={{ xs: "column", sm: "row" }} spacing={1}>
          <TextField label={`Waiting review label ${index + 1}`} value={entry.label} disabled={locked} fullWidth
            slotProps={{ htmlInput: { maxLength: 120 } }} onChange={(event) => setThresholds((rows) => rows.map((row) => row.key === entry.key ? { ...row, label: event.target.value } : row))} />
          <TextField label="Elapsed minutes" type="number" value={entry.minutes} disabled={locked}
            slotProps={{ htmlInput: { min: 1, max: 2147483647, step: 1 } }} onChange={(event) => setThresholds((rows) => rows.map((row) => row.key === entry.key ? { ...row, minutes: event.target.value } : row))} />
          <Button disabled={locked} onClick={() => setThresholds((rows) => rows.filter((row) => row.key !== entry.key))}>Remove threshold {index + 1}</Button>
        </Stack>)}
        {canWrite && <Button disabled={locked || thresholds.length >= 20} onClick={() => setThresholds((rows) => [...rows, { key: crypto.randomUUID(), label: "", minutes: "" }])} sx={{ alignSelf: "flex-start" }}>Add waiting threshold</Button>}
        {stale && <Alert severity="warning">Current policy is revision {resource.data.policy.revision}. Your draft is retained. Review its saved categories ({resource.data.policy.block_categories.map((row) => row.label).join(", ") || "none"}) and thresholds ({resource.data.policy.waiting_thresholds.map((row) => `${row.label}: ${row.minutes} min`).join(", ") || "none"}) before replacing it.
          <Button disabled={locked} onClick={() => setRevision(resource.data!.policy.revision)}>Use current revision and keep my draft</Button>
          <Button disabled={locked} onClick={() => adopt(resource.data!.policy)}>Load saved policy</Button>
        </Alert>}
        {uncertain && <Alert severity="warning">The save outcome is unconfirmed. Editing is paused and the original request is retained.
          <Button disabled={saving || !canWrite} onClick={() => void save(true)}>Retry original policy save</Button>
        </Alert>}
        {feedback && <Alert severity={feedback.error ? "error" : "success"}>{feedback.text}</Alert>}
        {canWrite && <Button variant="contained" disabled={locked || stale || invalid} onClick={() => void save()} sx={{ alignSelf: "flex-start" }}>{saving ? "Saving…" : "Save operational policy"}</Button>}
        <Button onClick={() => setShowHistory((value) => !value)} sx={{ alignSelf: "flex-start" }}>{showHistory ? "Hide policy history" : "Show policy history"}</Button>
        {showHistory && <>
          {history.error && <Alert severity="error">{history.error}</Alert>}
          {!history.data && !history.error && <LoadState />}
          {history.data?.versions.map((policy) => <Typography variant="body2" key={policy.revision}>Revision {policy.revision} · {policy.effective_from} · Recorded by staff #{policy.written_by_membership_id} · Categories: {policy.block_categories.map((row) => row.label).join(", ") || "none"} · Waiting: {policy.waiting_thresholds.map((row) => `${row.label}: ${row.minutes} min`).join(", ") || "none"}</Typography>)}
          {history.data?.versions.length === 0 && <Typography variant="body2">No saved policy revisions.</Typography>}
          {history.data?.capped && <Typography variant="body2">Showing the latest 25 revisions.</Typography>}
        </>}
      </>}
    </Stack>
  </Paper>;
}
