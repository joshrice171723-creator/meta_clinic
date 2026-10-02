import type {
  ClinicalTask,
  ClinicalTaskMutationReceipt,
  ClinicWorkspaceContext,
} from "../../api/contracts";

type ClaimableTask = ClinicalTask & {
  eligible_assignees: Array<{ membership_id: number }>;
};

function recordedId(value: number | null | undefined): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

// These are entry-point guards. Rails still authorizes the actual resource/site.
export function patientFlowScheduleHref(
  task: ClinicalTask | undefined,
  context: Pick<ClinicWorkspaceContext, "capabilities" | "current_site" | "sites">,
) {
  const { capabilities, current_site, sites } = context;
  const canBook =
    capabilities.appointments === true ||
    (capabilities.appointments_book === true &&
      capabilities.appointments_read === true);
  if (
    !canBook ||
    !task ||
    !recordedId(task.id) ||
    !recordedId(task.patient_id) ||
    task.task_kind !== "patient_call" ||
    task.source_type !== "manual" ||
    task.pool_code !== "front_desk" ||
    task.encounter_id !== null ||
    !["open", "claimed", "in_progress"].includes(task.state) ||
    task.source_managed !== false ||
    task.waiting_reason ||
    task.has_recorded_appointment !== false
  )
    return null;

  const siteId = task.site_id ?? current_site?.id;
  const site = sites.find((candidate) => candidate.id === siteId);
  if (
    !recordedId(siteId) ||
    !site ||
    (site.status !== undefined && site.status !== "active")
  )
    return null;

  // Do not carry clinical clearance, task completion, provider, time or owner.
  return `/clinic/schedule?patient_id=${task.patient_id}&site_id=${siteId}`;
}

export function canClaimPatientFlowTask(
  task: ClaimableTask,
  actorMembershipId: number,
) {
  return (
    recordedId(task.id) &&
    recordedId(task.patient_id) &&
    recordedId(actorMembershipId) &&
    Number.isSafeInteger(task.version) &&
    task.version >= 0 &&
    task.eligible_assignees.some(
      (candidate) => candidate.membership_id === actorMembershipId,
    ) &&
    ["open", "claimed", "in_progress", "on_hold"].includes(task.state) &&
    (task.assigned_to_membership_id === null ||
      task.owner_unavailable === true ||
      (task.state === "open" &&
        task.assigned_to_membership_id === actorMembershipId))
  );
}

export function confirmedPatientFlowClaim(
  task: ClinicalTask,
  updated: ClinicalTask,
  receipt: ClinicalTaskMutationReceipt | undefined,
  attempt: { key: string; version: number },
  actorMembershipId: number,
) {
  return (
    updated.id === task.id &&
    updated.patient_id === task.patient_id &&
    updated.encounter_id === task.encounter_id &&
    updated.site_id === task.site_id &&
    updated.assigned_to_membership_id === actorMembershipId &&
    updated.state === (task.state === "on_hold" ? "on_hold" : "claimed") &&
    receipt?.request_key === attempt.key &&
    receipt.operation_code === "operations.clinical_task.claim" &&
    receipt.resource_id === task.id &&
    receipt.actor_membership_id === actorMembershipId &&
    receipt.resource_version === String(attempt.version + 1) &&
    updated.version === attempt.version + 1
  );
}
