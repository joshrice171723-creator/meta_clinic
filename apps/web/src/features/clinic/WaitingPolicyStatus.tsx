import { Stack, Typography } from "@mui/material";
import type { WaitingPolicyProjection } from "./operationalPolicyContracts";

// Details consumer: do not infer urgency or create an escalation action.
export function WaitingPolicyStatus({ projection }: { projection?: WaitingPolicyProjection | null }) {
  if (!projection || projection.state === "not_applicable") return null;
  if (projection.state === "unconfigured") return <Typography variant="body2" color="text.secondary">Waiting review threshold unconfigured.</Typography>;
  if (projection.state === "origin_unknown") return <Typography variant="body2" color="text.secondary">Waiting review cannot be compared: the recorded encounter start is unavailable or in the future.</Typography>;
  return <Stack spacing={0.25}>
    <Typography variant="body2">
      {projection.state === "threshold_met" && projection.matched_threshold
        ? `${projection.matched_threshold.label} · clinic threshold ${projection.matched_threshold.minutes} min reached`
        : "Below the configured waiting review thresholds"}
    </Typography>
    <Typography variant="caption" color="text.secondary">
      {projection.elapsed_minutes === null ? "Elapsed time unknown" : `${projection.elapsed_minutes} min from recorded encounter start`} · Policy revision {projection.policy_revision}. Operational comparison only; no escalation action has been recorded.
    </Typography>
  </Stack>;
}
