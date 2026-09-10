import { useState } from "react";
import { Alert, Button, FormControlLabel, Paper, Stack, Switch, Typography } from "@mui/material";
import { api } from "../../api/client";
import type { PracticeFeatures } from "../../api/contracts";
import { LoadState, useResource } from "../../shared/ui";

export function PracticeFeatureSettings({ canWrite }: { canWrite: boolean }) {
  const { data, error, refresh } = useResource<{ features: PracticeFeatures }>("/api/clinic/practice_features");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  if (!data) return <LoadState error={error} />;

  const features = data.features;
  const save = async (enabled: boolean) => {
    setSaving(true);
    setFeedback(null);
    try {
      await api("/api/clinic/practice_features", {
        method: "PUT",
        body: { features: { insurance_workflows_enabled: enabled, expected_revision: features.revision, request_key: crypto.randomUUID() } },
      });
      setFeedback(enabled ? "Insurance workflows are available for this clinic." : "Insurance workflows are hidden for this cash-based clinic.");
      refresh();
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : "Unable to save clinic features.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
      <Stack spacing={2}>
        <div>
          <Typography variant="h2">Clinic model</Typography>
          <Typography color="text.secondary">
            Cash prices, estimates, invoices, receipts, card payments, refunds, credits, packages, and memberships are always available.
          </Typography>
        </div>
        {feedback && <Alert severity={feedback.startsWith("Unable") ? "error" : "success"}>{feedback}</Alert>}
        <FormControlLabel
          control={<Switch checked={features.insurance_workflows_enabled} disabled={!canWrite || saving} onChange={(_, checked) => void save(checked)} />}
          label="This clinic uses insurance workflows"
        />
        <Typography variant="body2" color="text.secondary">
          Turn this on only when the clinic needs coverage, eligibility, prior authorization, claims, remittance, denials, and payer balances.
        </Typography>
        {saving && <Button disabled>Saving clinic model…</Button>}
      </Stack>
    </Paper>
  );
}
