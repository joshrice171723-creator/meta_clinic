import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser } from "playwright-core";
import type { NurseWorkspace, Observation, EncounterIntakeRevision } from "../src/api/contracts";
import type { ClinicalHistoryResponse } from "../src/features/clinic/clinicalHistory";
import { launchRealBrowser, loginReal, readRealFixture, realGet, selectReal, realStackEnabled, type RealFixture } from "./support/authorizedRealStack";

type ClinicalFixture = RealFixture & { clinical_scenarios: {
  site_id: number; site_name: string; site_code: string;
  patient_id: number; patient_name: string; completed_encounter_id: number; open_encounter_id: number;
  initial_intake_version: number; medication_name: string; empty_patient_id: number;
  empty_patient_name: string; empty_encounter_id: number;
} };

let browser: Browser;
describe.skipIf(!realStackEnabled)("authorized intact clinical intake and history", () => {
beforeAll(async () => { browser = await launchRealBrowser(); });
afterAll(async () => { await browser?.close(); });

it("authorized completed intake medication survives Save and continue and full reload", async () => {
  const seed = readRealFixture<ClinicalFixture>();
  const scenario = seed.clinical_scenarios;
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  try {
    await loginReal(page, { ...seed, site_id: scenario.site_id, site_name: scenario.site_name, site_code: scenario.site_code }, `/clinic/patients/${scenario.patient_id}/encounters/${scenario.completed_encounter_id}`);
    const nurse = page.locator("#nurse-workspace");
    await nurse.getByRole("button", { name: "Intake", exact: true }).click();
    expect(await nurse.getByLabel("Encounter status summary").innerText()).toContain("Encounter: Completed");
    const question = nurse.locator('section[aria-label="Current medicines and supplements question"]');
    await question.getByRole("button", { name: "Enter an answer", exact: true }).click();
    await question.getByRole("button", { name: "Add medicine or supplement", exact: true }).click();
    await selectReal(page, "Medication source", "Supplement");
    await question.getByLabel("Other medicine or supplement", { exact: true }).fill(scenario.medication_name);
    await selectReal(page, "Actual use", "Taking");
    await selectReal(page, "Dose certainty", "Known");
    await question.getByLabel("Actual dose amount", { exact: true }).fill("10");
    await selectReal(page, "Actual dose unit", "mg");
    await selectReal(page, "Frequency", "Once daily");
    await selectReal(page, "Record source", "Supplement label");
    await question.getByLabel("Medication details (optional)", { exact: true }).fill("Independent synthetic intake detail");
    expect(await nurse.getByLabel("Encounter status summary").innerText()).toContain("Unsaved changes");
    const saved = page.waitForResponse(response => response.url().endsWith(`/encounters/${scenario.completed_encounter_id}/intake_revisions`) && response.request().method() === "POST");
    await nurse.getByRole("button", { name: "Save & continue", exact: true }).click();
    const receipt = await saved;
    expect(receipt.status()).toBe(201);
    const body = await receipt.json() as { intake: EncounterIntakeRevision };
    expect(body.intake.version).toBe(scenario.initial_intake_version + 1);
    const savedAnswers = body.intake.questionnaire!.answers;
    expect(savedAnswers.medications).toEqual(expect.objectContaining({ entries: [expect.objectContaining({
      name: scenario.medication_name, kind: "supplement", actual_use: "taking", dose_certainty: "known",
      dose_value: "10", dose_unit: "mg", frequency: "once_daily", source: "supplement_label",
      details: "Independent synthetic intake detail",
    })] }));
    await nurse.getByText("Group saved.", { exact: true }).waitFor();
    await expect.poll(() => nurse.getByLabel("Encounter status summary").innerText()).not.toContain("Unsaved changes");
    const path = `/api/clinic/patients/${scenario.patient_id}/encounters/${scenario.completed_encounter_id}/nurse_workspace`;
    const persisted = await realGet<NurseWorkspace>(page, path);
    expect(persisted.intake!.questionnaire!.answers.medications).toEqual(savedAnswers.medications);
    await page.reload();
    await nurse.getByRole("button", { name: "Intake", exact: true }).click();
    await nurse.locator("#intake-group-safety_history").click();
    expect(await question.getByLabel("Other medicine or supplement", { exact: true }).inputValue()).toBe(scenario.medication_name);
    expect(await question.getByLabel("Actual dose amount", { exact: true }).inputValue()).toBe("10");
    expect(await question.getByLabel("Actual use", { exact: true }).innerText()).toContain("Taking");
    expect(await nurse.getByLabel("Encounter status summary").innerText()).not.toContain("Unsaved changes");
  } finally { await context.close(); }
}, 60000);

it("authorized patient clinical history loads with one explicit empty state per section", async () => {
  const seed = readRealFixture<ClinicalFixture>();
  const scenario = seed.clinical_scenarios;
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  try {
    await loginReal(page, { ...seed, site_id: scenario.site_id, site_name: scenario.site_name, site_code: scenario.site_code }, `/clinic/patients/${scenario.empty_patient_id}`);
    const history = page.locator("#clinical-history");
    await history.getByText("Clinical history", { exact: true }).waitFor();
    await expect.poll(() => history.locator("section").filter({ hasText: "No recorded entries. No absence has been inferred." }).count()).toBe(3);
    for (const name of ["Allergies", "Medications", "Conditions"]) {
      const section = history.locator("section").filter({ has: page.getByText(name, { exact: true }) });
      expect(await section.getByText("No recorded entries. No absence has been inferred.", { exact: true }).count()).toBe(1);
      expect(await section.getByText("0 recorded", { exact: true }).count()).toBe(1);
    }
    expect(await history.getByText(/could not be loaded|configured location/i).count()).toBe(0);
    const actual = await realGet<ClinicalHistoryResponse>(page, `/api/clinic/patients/${scenario.empty_patient_id}/clinical_history`);
    expect(actual.patient_id).toBe(scenario.empty_patient_id);
    expect(actual.allergies).toEqual([]);
    expect(actual.medications).toEqual([]);
    expect(actual.conditions).toEqual([]);
    await page.reload();
    await history.getByText("Clinical history", { exact: true }).waitFor();
    await expect.poll(() => history.getByText("No recorded entries. No absence has been inferred.", { exact: true }).count()).toBe(3);
  } finally { await context.close(); }
}, 60000);

it("authorized location timezone overrides practice in vitals review while persisted observation stays UTC", async () => {
  const seed = readRealFixture<ClinicalFixture>();
  const scenario = seed.clinical_scenarios;
  const context = await browser.newContext({ timezoneId: "UTC", locale: "en-US" });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  try {
    await loginReal(page, { ...seed, site_id: scenario.site_id, site_name: scenario.site_name, site_code: scenario.site_code }, `/clinic/patients/${scenario.patient_id}/encounters/${scenario.open_encounter_id}`);
    const clinic = await realGet<{ practice: { timezone: string }; current_site: { timezone_override: string } }>(page, "/api/clinic/context");
    expect(clinic.practice.timezone).toBe("UTC");
    expect(clinic.current_site.timezone_override).toBe("America/Chicago");
    await page.locator("#nurse-workspace").getByRole("button", { name: "Room & vitals", exact: true }).click();
    await page.locator("#nurse-workspace").getByRole("button", { name: "Record vital signs", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: /^Record vital signs/ });
    await dialog.getByRole("textbox", { name: "Heart rate", exact: true }).fill("72");
    await dialog.getByLabel("Observed time (device local)", { exact: true }).fill("2026-07-15T14:30");
    await dialog.getByRole("button", { name: "Review measurements", exact: true }).click();
    expect(await dialog.getByText("Observed (clinic time · America/Chicago):", { exact: true }).count()).toBe(1);
    expect((await dialog.innerText()).replaceAll("\u202f", " ")).toContain("Jul 15, 2026, 9:30 AM");
    await dialog.getByRole("checkbox", { name: `I confirmed ${scenario.patient_name} and encounter #${scenario.open_encounter_id}.`, exact: true }).check();
    const endpoint = `/api/clinic/patients/${scenario.patient_id}/encounters/${scenario.open_encounter_id}/vital_signs`;
    const saved = page.waitForResponse(response => response.url().endsWith(endpoint) && response.request().method() === "POST");
    await dialog.getByRole("button", { name: "Record vital signs", exact: true }).click();
    const response = await saved;
    expect(response.status()).toBe(201);
    expect(response.request().postDataJSON().vital_signs.observed_at).toBe("2026-07-15T14:30:00.000Z");
    const receipt = await response.json() as { observations: Observation[] };
    const pulse = receipt.observations.find(observation => observation.code === "vital-heart-rate");
    expect(pulse).toEqual(expect.objectContaining({ patient_id: scenario.patient_id, encounter_id: scenario.open_encounter_id, numeric_value: "72.0" }));
    expect(new Date(pulse!.observed_at).toISOString()).toBe("2026-07-15T14:30:00.000Z");
    await page.reload();
    const persisted = await realGet<{ observations: Observation[] }>(page, `/api/clinic/patients/${scenario.patient_id}/observations?encounter_id=${scenario.open_encounter_id}`);
    expect(persisted.observations.find(observation => observation.id === pulse!.id)).toEqual(pulse);
  } finally { await context.close(); }
}, 60000);
});
