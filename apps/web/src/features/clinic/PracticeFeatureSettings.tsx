import { useEffect, useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";
import type { PracticeFeatures } from "../../api/contracts";
import { LoadState, useResource } from "../../shared/ui";

export function PracticeFeatureSettings() {
  const resource = useResource<PracticeFeatures>("/api/clinic/practice_features", {
    retainDataOnRefresh: true,
  });
  const [insurance, setInsurance] = useState(false);
  const [baseline, setBaseline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    severity: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!resource.data) return;
    const enabled = resource.data.optional.insurance_workflows;
    setInsurance(enabled);
    setBaseline(enabled);
  }, [resource.data]);

  if (!resource.data) return <LoadState error={resource.error} />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const result = await api<PracticeFeatures>("/api/clinic/practice_features", {
        method: "PUT",
        body: {
          practice_features: {
            expected_version: resource.data.current_version,
            insurance_workflows_enabled: insurance,
            reason: insurance
              ? "Clinic selected insurance workflows during configuration"
              : "Clinic selected direct patient and membership billing",
            request_key: crypto.randomUUID(),
          },
        },
      });
      const saved = result.optional.insurance_workflows;
      setInsurance(saved);
      setBaseline(saved);
      setFeedback({
        severity: "success",
        text: saved
          ? "Insurance workflows are enabled for this clinic."
          : "Cash and membership workflows remain on. Insurance workflows are off.",
      });
      resource.refresh();
    } catch (reason) {
      setFeedback({
        severity: "error",
        text:
          reason instanceof Error
            ? reason.message
            : "The clinic feature selection could not be saved.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper component="section" variant="outlined" sx={{ p: 2.5, mb: 3 }}>
      <Stack component="form" spacing={2} onSubmit={(event) => void submit(event)}>
        <div>
          <Typography component="h2" variant="h5">
            Clinic operating model
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Every clinic includes patients, scheduling, charting, cash prices,
            estimates, invoices, receipts, payments, refunds, credits, packages,
            and memberships. Add insurance only when this clinic uses it.
          </Typography>
        </div>
        {feedback && <Alert severity={feedback.severity}>{feedback.text}</Alert>}
        <FormControlLabel
          control={
            <Switch
              checked={insurance}
              disabled={!resource.data.can_write || busy}
              onChange={(event) => setInsurance(event.target.checked)}
            />
          }
          label="This clinic also uses insurance workflows"
        />
        <Typography variant="body2" color="text.secondary">
          When off, payer coverage, eligibility, prior authorization, claims,
          remittance, denials, and payer accounts receivable stay out of the
          clinic workflow. Existing history is preserved.
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button
            type="submit"
            variant="contained"
            disabled={!resource.data.can_write || busy || insurance === baseline}
          >
            {busy ? "Saving…" : "Save operating model"}
          </Button>
          <Button
            type="button"
            disabled={busy || insurance === baseline}
            onClick={() => setInsurance(baseline)}
          >
            Discard change
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
