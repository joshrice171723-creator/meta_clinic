import { useId, useState } from "react";
import { Alert, MenuItem, Stack, TextField, Typography } from "@mui/material";
import {
  bundledImpact,
  impactLabel,
  impactRow,
  impactSummary,
  scopeKey,
  type ImpactScope,
} from "./changeImpact";

export function useChangeImpact() {
  const [key, select] = useState("");
  return {
    key,
    select,
    scope: bundledImpact.scopes.find((scope) => scopeKey(scope) === key),
  };
}

export function QaChangeImpact({
  selection,
  revision,
}: {
  selection: ReturnType<typeof useChangeImpact>;
  revision?: string | null;
}) {
  const id = useId();
  const { scope } = selection;
  const summary = impactSummary(scope);
  return (
    <Stack spacing={1} sx={{ my: 1, overflowWrap: "anywhere" }}>
      <Typography variant="subtitle2">
        Publish change impact · read-only
      </Typography>
      <TextField
        id={id}
        select
        fullWidth
        label="Exact release comparison"
        value={selection.key}
        onChange={(event) => selection.select(event.target.value)}
      >
        <MenuItem value="">No validated release pair selected</MenuItem>
        {bundledImpact.scopes.map((item) => (
          <MenuItem
            key={scopeKey(item)}
            value={scopeKey(item)}
            sx={{ whiteSpace: "normal", overflowWrap: "anywhere" }}
          >
            {item.baselineSHA} → {item.targetSHA}
          </MenuItem>
        ))}
      </TextField>
      {bundledImpact.error && (
        <Alert severity="warning">{bundledImpact.error}</Alert>
      )}
      {!bundledImpact.scopes.length && (
        <Typography variant="body2">
          Release impact mapping unavailable. All 116 workflow IDs remain
          unknown.
        </Typography>
      )}
      {scope && (
        <>
          <Typography variant="body2">
            Baseline {scope.baselineSHA}
            <br />
            Target {scope.targetSHA}
          </Typography>
          <Typography variant="body2">
            {scope.targetSHA === revision
              ? "Selected target matches the observed build."
              : "Separate release comparison; target is not the observed build. This scope does not apply to current-build QA actions."}
          </Typography>
          <Typography variant="body2">
            Scope evidence: {scope.evidenceRefs.join(" · ")}
          </Typography>
        </>
      )}
      <Typography variant="body2">
        {summary.affected} affected · {summary.untouched} untouched ·{" "}
        {summary.unknown} unknown
      </Typography>
      <Typography variant="body2">
        Re-QA scope (affected + claimed fixes):{" "}
        {summary.reQa.join(", ") || "None identified"}. Unknown rows remain
        unresolved; they are not cleared.
      </Typography>
      <Typography variant="caption">
        Untouched rows retain historical verdicts as stale untouched, never a
        fresh pass. Impact is separate from recorded QA evidence and does not
        queue work or record verdicts.
      </Typography>
    </Stack>
  );
}

export function QaImpactDetail({
  scope,
  workflowId,
}: {
  scope?: ImpactScope;
  workflowId: string;
}) {
  const row = impactRow(scope, workflowId);
  return (
    <Stack spacing={0.5} sx={{ overflowWrap: "anywhere" }}>
      <Typography variant="body2">{impactLabel(row)}</Typography>
      <Typography variant="caption">Reason: {row.reason}</Typography>
      <Typography variant="caption">
        Source paths: {row.sourcePaths.join(" · ") || "Not supplied"}
      </Typography>
      <Typography variant="caption">
        Impact evidence: {row.evidenceRefs.join(" · ") || "Not supplied"}
      </Typography>
      <Typography variant="caption">
        Claimed-fix IDs:{" "}
        {row.claimedFixIds.map((id) => `#${id}`).join(", ") || "None supplied"}
      </Typography>
    </Stack>
  );
}
