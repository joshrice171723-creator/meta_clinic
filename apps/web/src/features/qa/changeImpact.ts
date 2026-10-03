import { z } from "zod";
import artifact from "./change-impact.json";

export const impactWorkflowIds = Array.from(
  { length: 116 },
  (_, index) => `WF-${String(index + 1).padStart(3, "0")}`,
);
const text = z.string().trim().min(1).max(1000);
const sha = z.string().regex(/^[0-9a-f]{40}$/);
const rowSchema = z.strictObject({
  workflowId: z.enum(impactWorkflowIds as [string, ...string[]]),
  status: z.enum(["affected", "untouched", "unknown"]),
  reason: text,
  sourcePaths: z.array(text).max(100),
  evidenceRefs: z.array(text).min(1).max(100),
  claimedFixIds: z.array(z.number().int().positive()).max(100),
});
const scopeSchema = z
  .strictObject({
    baselineSHA: sha,
    targetSHA: sha,
    evidenceRefs: z.array(text).min(1).max(100),
    workflows: z.array(rowSchema).max(116),
  })
  .refine(
    (scope) => scope.baselineSHA !== scope.targetSHA,
    "Use distinct revisions",
  )
  .refine(
    (scope) =>
      new Set(scope.workflows.map((row) => row.workflowId)).size ===
      scope.workflows.length,
    "Duplicate workflow ID",
  );
const artifactSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    scopes: z.array(scopeSchema).max(100),
  })
  .refine(
    (data) => new Set(data.scopes.map(scopeKey)).size === data.scopes.length,
    "Duplicate release pair",
  );

export type ImpactScope = z.infer<typeof scopeSchema>;
export type ImpactRow = z.infer<typeof rowSchema>;
export const scopeKey = (
  scope: Pick<ImpactScope, "baselineSHA" | "targetSHA">,
) => `${scope.baselineSHA}..${scope.targetSHA}`;

// Reject the whole artifact on malformed or ambiguous evidence, never infer untouched.
export function readImpactArtifact(input: unknown) {
  const result = artifactSchema.safeParse(input);
  return result.success
    ? { scopes: result.data.scopes, error: "" }
    : {
        scopes: [] as ImpactScope[],
        error: "Change-impact artifact is invalid; all impact remains unknown.",
      };
}
export const bundledImpact = readImpactArtifact(artifact);

export function impactRow(
  scope: ImpactScope | undefined,
  workflowId: string,
): ImpactRow {
  return (
    scope?.workflows.find((row) => row.workflowId === workflowId) ?? {
      workflowId,
      status: "unknown",
      reason: scope
        ? "No explicit mapping for this workflow in the selected release pair."
        : "No validated release pair selected.",
      sourcePaths: [],
      evidenceRefs: [],
      claimedFixIds: [],
    }
  );
}
export function impactLabel(row: ImpactRow) {
  if (row.claimedFixIds.length)
    return `${row.status} · claimed fix · re-QA required`;
  if (row.status === "affected") return "affected · re-QA required";
  if (row.status === "untouched")
    return "stale untouched · historical verdict retained";
  return "unknown · scope unresolved";
}
export function impactSummary(scope?: ImpactScope) {
  const rows = impactWorkflowIds.map((id) => impactRow(scope, id));
  return {
    affected: rows.filter((row) => row.status === "affected").length,
    untouched: rows.filter((row) => row.status === "untouched").length,
    unknown: rows.filter((row) => row.status === "unknown").length,
    reQa: rows
      .filter(
        (row) => row.status === "affected" || row.claimedFixIds.length > 0,
      )
      .map((row) => row.workflowId),
  };
}
