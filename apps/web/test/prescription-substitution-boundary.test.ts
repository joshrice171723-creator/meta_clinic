import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { clinicalPlanResourceMeta } from "../src/features/clinic/ClinicalPlanWorkspace";

it("accepts the editor substitution field at both API and workflow boundaries", () => {
  const field = clinicalPlanResourceMeta.medication_requests.fields.find(
    (item) => item.name === "substitution_instruction",
  )!;
  for (const file of [
    "../api/app/controllers/clinic/care/clinical_plan_workspace_controller.rb",
    "../api/app/services/clinic/care/clinical_plan_workflow.rb",
  ]) {
    const source = readFileSync(file, "utf8");
    const medicationFields = source
      .split("medication_requests:")[1]
      .split("service_requests:")[0];
    expect(medicationFields).toMatch(new RegExp(`\\b${field.name}\\b`));
  }
});
