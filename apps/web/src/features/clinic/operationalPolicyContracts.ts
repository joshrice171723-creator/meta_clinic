export type BlockReasonCategory = { key: string; label: string };
export type WaitingThreshold = BlockReasonCategory & { minutes: number };
export type OperationalPolicy = {
  site_id: number;
  revision: number;
  configured: boolean;
  block_categories: BlockReasonCategory[];
  waiting_thresholds: WaitingThreshold[];
  effective_from: string | null;
  written_by_membership_id: number | null;
  waiting_time_source: "encounter.started_at";
  waiting_action: "display_only";
};
export type OperationalPolicyResponse = { policy: OperationalPolicy; can_write: boolean };
export type WaitingPolicyProjection = {
  state: "not_applicable" | "unconfigured" | "origin_unknown" | "below_threshold" | "threshold_met";
  policy_revision: number;
  elapsed_minutes: number | null;
  time_source: "encounter.started_at";
  matched_threshold: WaitingThreshold | null;
  action: "display_only";
};
export type RecordedBlockCategory = {
  state: "not_recorded" | "unavailable" | "recorded";
  key: string | null;
  label: string | null;
  policy_revision: number | null;
};
