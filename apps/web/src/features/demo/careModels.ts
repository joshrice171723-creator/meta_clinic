import { api, setApiActor, setClinicPractice } from "../../api/client";
import type { ClinicWorkspaceContext } from "../../api/contracts";
import type { SandboxAccountKey } from "./accountSwitch";
import type { DemoRunResponse } from "./contracts";

export type SandboxCareModel = "primary_care" | "weight_management";

export const sandboxCareModels: { key: SandboxCareModel; label: string }[] = [
  { key: "primary_care", label: "Primary care" },
  { key: "weight_management", label: "Weight management" },
];

export function canEnterCareModel(
  account: SandboxAccountKey,
  model: SandboxCareModel,
) {
  return (
    model === "primary_care" ||
    (model === "weight_management" && account === "admin")
  );
}

// Select only the companion already projected for this existing Admin actor.
// This uses the ordinary context switch; it never creates actors or grants.
export async function enterSandboxCareModel(
  response: DemoRunResponse,
  model: SandboxCareModel,
) {
  if (model === "primary_care") return;
  if (model !== "weight_management")
    throw new Error("Choose an available care model.");
  if (
    !response.active ||
    !response.run.sandbox ||
    response.run.account_pending ||
    response.run.account?.key !== "admin" ||
    response.run.account.portal !== "clinic"
  )
    throw new Error(
      "Weight management is available only to the existing Admin account.",
    );

  const { run } = response;
  const account = run.account!;
  setApiActor(Number(account.user_id));
  setClinicPractice(Number(run.clinic.id));
  const context = await api<ClinicWorkspaceContext>("/api/clinic/context");
  const practices = context.practices ?? [];
  const primary = practices.find(
    (practice) => String(practice.id) === String(run.clinic.id),
  );
  const companions = practices.filter(
    (practice) =>
      primary?.organization &&
      String(practice.organization?.id) === String(primary.organization.id) &&
      String(practice.id) !== String(run.clinic.id) &&
      practice.name === "Sandbox Weight Management",
  );
  if (
    context.demo_sandbox !== true ||
    String(context.user_id) !== String(account.user_id) ||
    String(context.practice.id) !== String(run.clinic.id) ||
    companions.length !== 1
  )
    throw new Error(
      "The weight-management assignment could not be confirmed. Reopen the demo or use the clinic selector inside Primary care.",
    );

  const target = companions[0];
  const switched = await api<{ practice_id: number; membership_id: number }>(
    "/api/clinic/context",
    {
      method: "PATCH",
      body: { practice_id: target.id },
    },
  );
  if (String(switched.practice_id) !== String(target.id))
    throw new Error(
      "The clinic switch could not be confirmed. Reopen the demo before continuing.",
    );
  setClinicPractice(target.id);
  const confirmed = await api<ClinicWorkspaceContext>("/api/clinic/context");
  if (
    confirmed.demo_sandbox !== true ||
    String(confirmed.user_id) !== String(account.user_id) ||
    String(confirmed.practice.id) !== String(target.id) ||
    confirmed.membership_id !== switched.membership_id
  )
    throw new Error(
      "The clinic or account changed while opening. Reopen the demo before continuing.",
    );
}
