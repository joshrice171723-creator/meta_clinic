import type { DemoRun, DemoRunStep } from "./contracts";

export type DemoRole = { id: string; matches: (step: DemoRunStep) => boolean };
export const DEMO_ROLES: DemoRole[] = [
  {
    id: "administrator",
    matches: (step) => ["setup", "publish"].includes(step.id),
  },
  { id: "patient", matches: (step) => ["enroll", "payment"].includes(step.id) },
  {
    id: "front_desk",
    matches: (step) => ["schedule", "check_in"].includes(step.id),
  },
];
export function roleLesson(run: DemoRun, role: DemoRole) {
  return (
    run.steps.find(
      (step) => role.matches(step) && step.status === "available",
    ) ??
    run.steps.find(
      (step) => role.matches(step) && step.status === "complete",
    ) ??
    null
  );
}
export function rolePrerequisite(run: DemoRun, role: DemoRole) {
  const locked = run.steps.find(
    (step) => role.matches(step) && step.status === "locked",
  );
  const titles = (locked?.requires ?? [])
    .map((id) => run.steps.find((step) => step.id === id))
    .filter((step): step is DemoRunStep =>
      Boolean(step && step.status !== "complete"),
    )
    .map((step) => step.title);
  return titles.length
    ? `Complete ${titles.map((title) => `“${title}”`).join(", ")} to open this workspace.`
    : "This workspace has no available lesson yet.";
}

export function roleLabel(role: string) {
  const labels: Record<string, string> = {
    administrator: "Clinic administrator",
    patient: "Patient",
    front_desk: "Front desk",
    clinical_team: "Clinical team",
    inventory: "Inventory coordinator",
  };
  return labels[role] ?? role.replace(/[_-]+/g, " ");
}

export function roleContext(role: string) {
  return role === "patient"
    ? "This lesson uses the patient workspace."
    : "This lesson uses a simulated clinic-team workspace; real users sign in with assigned permissions.";
}
