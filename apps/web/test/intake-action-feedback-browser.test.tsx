import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const evidence = resolve(root, "../../tmp/intake-feedback-evidence");
const outcomes: string[] = [];
let server: ViteDevServer;
let browser: Browser;
let url: string;
const validation =
  "Answer or explicitly resolve each question in the group before confirming.";
const fillerFields = Array.from({ length: 8 }, (_, index) => ({
  id: `detail_${index}`,
  label: `Synthetic coordination detail ${index + 1}`,
}));
function fixture(sensitive = false, writable = true) {
  const answers = {
    visit_reason: { state: "answered", value: "Synthetic visit" },
    care_needs: {
      state: sensitive ? "answered" : "unanswered",
      value: sensitive ? "Synthetic care needs" : "",
    },
    sensitive_support: {
      state: sensitive ? "unanswered" : "unknown",
      value: "",
    },
    ...Object.fromEntries(
      fillerFields.map((field) => [
        field.id,
        { state: "answered", value: "Synthetic retained coordination context" },
      ]),
    ),
  };
  const intake = {
    id: 10,
    patient_id: 12,
    encounter_id: 30,
    version: 1,
    status: "incomplete",
    identity_state: "not_confirmed",
    visit_reason_state: "not_recorded",
    history_state: "not_recorded",
    vitals_state: "not_recorded",
    observation_ids: [],
    history_review_ids: [],
    recorded_at: "2026-10-02T12:00:00Z",
    recorded_by_membership_id: 7,
    questionnaire: {
      answers,
      text: "",
      status: "draft",
      form_id: "meta-clinic-previsit-v3",
      questionnaire_version: 3,
      confirmed_chunks: [0],
    },
  };
  return {
    schema_version: "nurse-workspace-v1",
    patient_id: 12,
    encounter_id: 30,
    intake,
    handoff: null,
    tasks: [],
    capabilities: {
      intake_write: writable,
      tasks_write: false,
      handoff_request: false,
      handoff_respond: false,
      observations_write: false,
    },
    questionnaire_form: {
      id: "meta-clinic-previsit-v3",
      version: 3,
      fields: [
        { id: "visit_reason", label: "Visit reason" },
        { id: "care_needs", label: "Care needs" },
        ...fillerFields,
        {
          id: "sensitive_support",
          label: "Sensitive support",
          sensitive: true,
        },
        { id: "final", label: "Final synthetic question" },
      ],
      answer_states: [
        "answered",
        "unanswered",
        "unknown",
        "declined",
        "not_asked",
      ],
      medication_options: [],
      chunks: [
        {
          index: 0,
          id: "today_visit",
          label: "Today's visit",
          description: "Synthetic saved visit context",
          fields: ["visit_reason"],
        },
        {
          index: 1,
          id: "patient_coordination",
          label: "Patient and coordination",
          description:
            "Confirm chart context and capture encounter-specific needs.",
          fields: [
            "care_needs",
            ...fillerFields.map((field) => field.id),
            "sensitive_support",
          ],
        },
        {
          index: 2,
          id: "synthetic_final",
          label: "Final synthetic group",
          description: "Synthetic next group",
          fields: ["final"],
        },
      ],
    },
  };
}
beforeAll(async () => {
  mkdirSync(evidence, { recursive: true });
  const entry = "\0intake-feedback-fixture.tsx";
  server = await createServer({
    configFile: false,
    root,
    cacheDir: resolve(evidence, "vite-cache"),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "controlled-intake-feedback",
        enforce: "pre",
        resolveId(id, importer) {
          if (id === entry) return entry;
          if (
            id === "./Workspace" &&
            /\/(NurseEncounterWorkspace|VitalSignsEntry|IntakeConsentEvidence|PatientCareCoordination)\.tsx$/.test(
              importer ?? "",
            )
          )
            return "\0feedback-clinic";
        },
        load(id) {
          if (id === "\0feedback-clinic")
            return "export const useClinic=()=>({membership_id:7,user_id:700,practice:{id:1,timezone:'UTC'},authorization_generation:1,capabilities:{patients:true,patients_write:false}});";
          if (id !== entry) return;
          return `import React,{useState} from "react";import {createRoot} from "react-dom/client";
          import {NurseEncounterWorkspaceContent} from "/src/features/clinic/NurseEncounterWorkspace";
          function App(){const [workspace,setWorkspace]=useState(window.feedbackFixture);
            window.switchFeedbackContext=()=>setWorkspace({...window.feedbackFixture,patient_id:13,encounter_id:31,intake:{...window.feedbackFixture.intake,patient_id:13,encounter_id:31}});
            return React.createElement(NurseEncounterWorkspaceContent,{
              patient:{id:workspace.patient_id,display_name:"SYN_feedback_patient"},
              encounter:{id:workspace.encounter_id,patient_id:workspace.patient_id,site_id:15,room_id:null,status:"open",visit_modality:"video"},
              observations:[],careSummary:null,roomsResource:{data:{rooms:[]},refresh:()=>{}},
              resource:{data:workspace,error:"",refresh:()=>{window.feedbackRefreshes=(window.feedbackRefreshes||0)+1;}}});}
          createRoot(document.getElementById("root")).render(React.createElement(App));`;
        },
        configureServer(vite) {
          vite.middlewares.use(
            "/feedback-fixture",
            async (_request, response) => {
              response.setHeader("Content-Type", "text/html");
              response.end(
                await vite.transformIndexHtml(
                  "/feedback-fixture",
                  '<title>Synthetic intake feedback fixture</title><style>body{margin:0;font-family:Arial}#root{padding:20px;max-width:1160px;margin:auto}</style><div id="root"></div><script type="module" src="/@id/__x00__intake-feedback-fixture.tsx"></script>',
                ),
              );
            },
          );
        },
      },
    ],
  });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === "string")
    throw new Error("Missing controlled fixture port");
  url = `http://127.0.0.1:${address.port}/feedback-fixture`;
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || "/usr/bin/chromium",
    headless: true,
  });
}, 30000);
afterAll(async () => {
  writeFileSync(
    resolve(evidence, "outcomes.json"),
    JSON.stringify(
      {
        layer: "controlled rendered fixture; mock API only; no database",
        passed: outcomes,
      },
      null,
      2,
    ),
  );
  await browser?.close();
  await server?.close();
}, 30000);
async function open(page: Page, workspace = fixture()) {
  page.setDefaultTimeout(8000);
  await page.addInitScript(
    (workspace) => Object.assign(window, { feedbackFixture: workspace }),
    workspace,
  );
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith("/api/")) return route.continue();
    if (route.request().method() !== "GET")
      throw new Error("Unexpected fixture mutation");
    if (path === "/api/csrf")
      return route.fulfill({
        json: { csrf_token: "synthetic-fixture-not-a-credential" },
      });
    if (path.endsWith("/care_coordination"))
      return route.fulfill({
        json: {
          coordination: {
            id: null,
            patient_id: workspace.patient_id,
            revision: 0,
            payload: Object.fromEntries(
              ["primary_care", "specialists", "pharmacy"].map((group) => [
                group,
                { state: "not_recorded", entries: [] },
              ]),
            ),
            recorded_at: null,
            recorded_by_membership_id: null,
          },
          can_write: false,
          limits: { primary_care: 1, specialists: 10, pharmacy: 1 },
        },
      });
    return route.fulfill({ json: { references: [], limited: false } });
  });
  await page.goto(url);
  await page
    .getByRole("button", { name: "Save & continue", exact: true })
    .waitFor();
}
async function reject(
  page: Page,
  requests: any[],
  successAfter = Infinity,
  unconfirmed = false,
) {
  await page.route("**/intake_revisions", async (route) => {
    const body = route.request().postDataJSON().intake;
    requests.push(body);
    if (requests.length >= successAfter)
      return route.fulfill({
        json: {
          intake: {
            ...fixture().intake,
            ...body,
            id: 11,
            version: 2,
            questionnaire: {
              ...body.questionnaire,
              form_id: "meta-clinic-previsit-v3",
              questionnaire_version: 3,
            },
          },
        },
      });
    return route.fulfill({
      status: unconfirmed ? 503 : 422,
      json: {
        error: unconfirmed ? "Controlled uncertain outcome" : validation,
        ...(unconfirmed ? { code: "outcome_unconfirmed" } : {}),
      },
    });
  });
}
it("keeps a scrolled failed save visible, announces it, retains the draft and permits corrected explicit retry", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const requests: any[] = [];
  try {
    await open(page);
    await reject(page, requests, 2);
    await page
      .getByRole("textbox", {
        name: "Synthetic coordination detail 1",
        exact: true,
      })
      .fill("Synthetic unsaved draft retained");
    const save = page.getByRole("button", {
      name: "Save & continue",
      exact: true,
    });
    await save.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(300);
    await page.screenshot({
      path: resolve(evidence, "before-scrolled-save.png"),
    });
    await save.focus();
    await page.keyboard.press("Enter");
    const alert = page.getByRole("alert", {
      name: "Intake save failed",
      exact: true,
    });
    await alert.waitFor();
    expect(
      await alert.evaluate((node) => node === document.activeElement),
    ).toBe(true);
    const geometry = await alert.boundingBox();
    expect(geometry!.y).toBeGreaterThanOrEqual(0);
    expect(geometry!.y + geometry!.height).toBeLessThanOrEqual(900);
    expect(await alert.getAttribute("aria-atomic")).toBe("true");
    expect(await alert.innerText()).toContain(validation);
    expect(
      await alert
        .getByRole("button", {
          name: "Discard local edits and load saved intake",
        })
        .isVisible(),
    ).toBe(true);
    expect(
      await page
        .getByRole("textbox", {
          name: "Synthetic coordination detail 1",
          exact: true,
        })
        .inputValue(),
    ).toBe("Synthetic unsaved draft retained");
    expect(await save.isEnabled()).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0].questionnaire.confirmed_chunks).toEqual([0, 1]);
    await page.screenshot({ path: resolve(evidence, "after-local-error.png") });
    await alert
      .getByRole("button", { name: "Review first unresolved question" })
      .focus();
    await page.keyboard.press("Enter");
    const question = page.locator('[data-intake-question="care_needs"]');
    expect(
      await question.evaluate((node) => node === document.activeElement),
    ).toBe(true);
    expect(await question.getAttribute("aria-describedby")).toBeTruthy();
    await page.screenshot({
      path: resolve(evidence, "after-question-focus.png"),
    });
    await question
      .getByRole("textbox", { name: "Care needs", exact: true })
      .fill("Synthetic corrected care needs");
    await save.click();
    await page.getByText("Group saved.", { exact: true }).waitFor();
    expect(await alert.count()).toBe(0);
    expect(requests).toHaveLength(2);
    expect(requests[1].questionnaire.answers.detail_0.value).toBe(
      "Synthetic unsaved draft retained",
    );
    expect(requests[1].questionnaire.answers.care_needs.value).toBe(
      "Synthetic corrected care needs",
    );
    expect(requests[1].request_key).not.toBe(requests[0].request_key);
    expect(errors).toEqual([]);
    outcomes.push(
      "scrolled422/persistentlocalerror/announcement/questionfocus/draft/correctedexplicitretry",
    );
  } finally {
    await page.close();
  }
}, 30000);

it("keeps sensitive disclosure closed during keyboard error navigation", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const requests: any[] = [];
  try {
    await open(page, fixture(true));
    await reject(page, requests);
    await page
      .getByRole("button", { name: "Save & continue", exact: true })
      .click();
    const alert = page.getByRole("alert", { name: "Intake save failed" });
    await alert.waitFor();
    await alert
      .getByRole("button", { name: "Review first unresolved question" })
      .focus();
    await page.keyboard.press("Enter");
    const question = page.locator('[data-intake-question="sensitive_support"]');
    expect(
      await question.evaluate((node) => node === document.activeElement),
    ).toBe(true);
    const disclosure = question.locator('[aria-expanded="false"]');
    expect(await disclosure.count()).toBe(1);
    expect(await question.getByRole("textbox").count()).toBe(0);
    await page.keyboard.press("Tab");
    expect(
      await disclosure.evaluate((node) => node === document.activeElement),
    ).toBe(true);
    await page.keyboard.press("Enter");
    await question
      .getByRole("button", { name: /^Choose a response for/ })
      .click();
    await page.getByRole("menuitem", { name: "Unknown", exact: true }).click();
    expect(await question.getByText("Recorded as Unknown").count()).toBe(1);
    await page.screenshot({
      path: resolve(evidence, "sensitive-deliberate-resolution.png"),
    });
    outcomes.push(
      "keyboardfirstquestion/sensitivestaysclosed/explicitresolutionpreserved",
    );
  } finally {
    await page.close();
  }
}, 30000);

it("keeps uncertain-outcome instructions and the unchanged request key without automatic replay", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const requests: any[] = [];
  try {
    await open(page);
    await reject(page, requests, Infinity, true);
    const save = page.getByRole("button", {
      name: "Save & continue",
      exact: true,
    });
    await save.click();
    const alert = page.getByRole("alert", { name: "Intake save failed" });
    await alert.waitFor();
    expect(await alert.innerText()).toContain(
      "Refresh this encounter before deciding whether to repeat the action.",
    );
    expect(
      await alert
        .getByRole("button", { name: "Review first unresolved question" })
        .count(),
    ).toBe(0);
    expect(requests).toHaveLength(1);
    await save.click();
    await page.waitForFunction(
      () =>
        document.querySelector('[aria-label="Intake save failed"]') ===
        document.activeElement,
    );
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    outcomes.push(
      "unconfirmedinstruction/nofalsefieldguidance/noautoreplay/unchangedexplicitretrykey",
    );
  } finally {
    await page.close();
  }
}, 30000);

it("retains capability denial and ignores a failed response from the previous encounter", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  try {
    await open(page, fixture(false, false));
    expect(
      await page
        .getByRole("button", { name: "Save & continue", exact: true })
        .isDisabled(),
    ).toBe(true);
    await page.close();
    const next = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    try {
      await open(next);
      let release: (() => void) | undefined;
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      let started = false;
      await next.route("**/intake_revisions", async (route) => {
        started = true;
        await pending;
        await route.fulfill({ status: 422, json: { error: validation } });
      });
      await next
        .getByRole("button", { name: "Save & continue", exact: true })
        .click();
      await expect.poll(() => started).toBe(true);
      await next.evaluate(() => (window as any).switchFeedbackContext());
      release!();
      await next
        .locator("p")
        .filter({ hasText: /^SYN_feedback_patient.*Encounter #31/ })
        .waitFor();
      await expect
        .poll(() =>
          next
            .getByRole("button", { name: "Save & continue", exact: true })
            .isEnabled(),
        )
        .toBe(true);
      expect(
        await next.getByRole("alert", { name: "Intake save failed" }).count(),
      ).toBe(0);
      outcomes.push("capabilitydenied/latepreviousencounterfailureignored");
    } finally {
      await next.close();
    }
  } finally {
    if (!page.isClosed()) await page.close();
  }
}, 30000);
