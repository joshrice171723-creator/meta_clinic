import type { DemoRunStep } from "./contracts";

export function nextDemoStep(steps: DemoRunStep[], currentId?: string) {
  const available = steps.filter(
    (step) => step.status === "available" && step.id !== currentId,
  );
  return (
    available.find((step) => currentId && step.requires.includes(currentId)) ??
    available[0]
  );
}
