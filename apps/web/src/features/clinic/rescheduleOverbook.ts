export type RescheduleOverbookPolicy = {
  policy: {
    revision: number;
    overbook_enabled: boolean;
    eligible_visit_type_ids: number[];
  };
  can_overbook: boolean;
};

export type RescheduleOverbookDraft = {
  overbookRequested: boolean;
  overbookReason: string;
  expectedPolicyRevision?: number;
  visitTypeId: string;
};

export function rescheduleOverbookIssue(
  draft: RescheduleOverbookDraft,
  policy?: RescheduleOverbookPolicy,
) {
  if (!draft.overbookRequested) return "";
  if (!policy?.can_overbook || !policy.policy.overbook_enabled)
    return "Overbooking is unavailable for this site or your role.";
  if (draft.expectedPolicyRevision !== policy.policy.revision)
    return "Scheduling policy changed. Review it and select the exception again.";
  if (
    !policy.policy.eligible_visit_type_ids.includes(Number(draft.visitTypeId))
  )
    return "Choose a visit type eligible for overbooking.";
  if (!draft.overbookReason.trim() || draft.overbookReason.trim().length > 500)
    return "Enter an overbook reason of 1–500 characters.";
  return "";
}

export function rescheduleOverbookRequest(draft: RescheduleOverbookDraft) {
  return draft.overbookRequested
    ? {
        overbook_reason: draft.overbookReason.trim(),
        expected_policy_revision: draft.expectedPolicyRevision,
      }
    : {};
}
