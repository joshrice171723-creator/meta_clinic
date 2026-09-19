import type { DemoRun, DemoRunStep } from "./contracts";

export type DemoRole = {
  id:
    "administrator" | "patient" | "front_desk" | "clinical_team" | "inventory";
  title: string;
  description: string;
  view: DemoRun["view"];
  matches: (step: DemoRunStep) => boolean;
};

export const DEMO_ROLES: DemoRole[] = [
  {
    id: "administrator",
    title: "Clinic administrator",
    description: "Configure and publish the clinic offering.",
    view: "clinic",
    matches: (step) => ["setup", "publish"].includes(step.id),
  },
  {
    id: "patient",
    title: "Patient",
    description:
      "Enroll in an offering and complete the simulated payment step.",
    view: "patient",
    matches: (step) => ["enroll", "payment"].includes(step.id),
  },
  {
    id: "front_desk",
    title: "Front desk",
    description: "Schedule the sample patient and record check-in.",
    view: "clinic",
    matches: (step) => ["schedule", "check_in"].includes(step.id),
  },
  {
    id: "clinical_team",
    title: "Clinical team",
    description: "Open the sample patient visit workflow.",
    view: "clinic",
    matches: (step) => step.id === "visit",
  },
  {
    id: "inventory",
    title: "Inventory coordinator",
    description: "Use the independent receiving, count, and use lessons.",
    view: "clinic",
    matches: (step) => step.id.startsWith("inventory_"),
  },
];

export function roleLesson(run: DemoRun, role: DemoRole) {
  const lessons = run.steps.filter(role.matches);
  return (
    lessons.find((step) => step.status === "available") ??
    lessons.find((step) => step.status === "complete") ??
    null
  );
}

export function rolePrerequisite(run: DemoRun, role: DemoRole) {
  const lockedLesson = run.steps.find(
    (step) => role.matches(step) && step.status === "locked",
  );
  const titles = (lockedLesson?.requires ?? [])
    .map((id) => run.steps.find((step) => step.id === id))
    .filter((step): step is DemoRunStep =>
      Boolean(step && step.status !== "complete"),
    )
    .map((step) => step.title);
  return titles.length
    ? `Complete ${titles.map((title) => `“${title}”`).join(", ")} to open this workspace.`
    : "This workspace has no available lesson yet.";
}
