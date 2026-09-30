import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";

const fields = [
  { id: "goals", label: "What would you like help with?" },
  { id: "care_needs", label: "Care needs" },
];
const answers = {
  goals: { state: "unknown", value: "" },
  care_needs: { state: "declined", value: "" },
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
  recorded_at: "2026-09-30T12:00:00Z",
  recorded_by_membership_id: 7,
  questionnaire: {
    answers,
    text: "",
    status: "draft",
    form_id: "meta-clinic-previsit-v3",
    questionnaire_version: 3,
    confirmed_chunks: [],
  },
};
const workspace = {
  schema_version: "nurse-workspace-v1",
  patient_id: 12,
  encounter_id: 30,
  intake,
  handoff: null,
  tasks: [],
  capabilities: {
    intake_write: true,
    tasks_write: false,
    handoff_request: false,
    handoff_respond: false,
    observations_write: false,
  },
  questionnaire_form: {
    id: "meta-clinic-previsit-v3",
    version: 3,
    fields,
    answer_states: [
      "answered",
      "unanswered",
      "unknown",
      "declined",
      "not_asked",
    ],
    chunks: [
      {
        index: 0,
        id: "today_visit",
        label: "Today’s visit",
        description: "Synthetic questions",
        fields: ["goals", "care_needs"],
      },
    ],
    medication_options: [],
  },
};
const saved = {
  goals: {
    reason: "Original reason",
    next_action: "Original next action",
    question: fields[0],
    source_answer: answers.goals,
    source_form_id: "meta-clinic-previsit-v3",
    source_questionnaire_version: 3,
    source_revision_version: 1,
    recorded_by_membership_id: 7,
    recorded_at: "2026-09-30T12:00:00Z",
  },
};
let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
beforeAll(async () => {
  const virtualId = "\0question-follow-up.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "question-follow-up-fixture",
        enforce: "pre",
        resolveId(id, importer) {
          if (
            id === "./Workspace" &&
            /\/(NurseEncounterWorkspace|VitalSignsEntry|IntakeConsentEvidence|PatientCareCoordination)\.tsx$/.test(
              importer ?? "",
            )
          )
            return "\0question-clinic-context";
          if (id === virtualId) return virtualId;
        },
        load(id) {
          if (id === "\0question-clinic-context")
            return "export const useClinic=()=>({membership_id:7});";
          if (id !== virtualId) return;
          return `import React,{useState} from "react";import {createRoot} from "react-dom/client";
        import {IntakeQuestionFollowUp,questionFollowUpDrafts} from "/src/features/clinic/IntakeQuestionFollowUp";
        import {NurseEncounterWorkspaceContent} from "/src/features/clinic/NurseEncounterWorkspace";
        function App(){const fixture=window.questionFixture;const [drafts,setDrafts]=useState(questionFollowUpDrafts(fixture.saved));
          if(fixture.workspace)return React.createElement(NurseEncounterWorkspaceContent,{
            patient:{id:12,display_name:"Synthetic question patient"},encounter:{id:30,patient_id:12,site_id:15,room_id:null,status:"open",visit_modality:"video"},
            observations:[],careSummary:null,roomsResource:{data:{rooms:[]},refresh:()=>{}},resource:{data:fixture.workspace,error:"",refresh:()=>{}}});
          return React.createElement(React.Fragment,null,React.createElement(IntakeQuestionFollowUp,{fields:fixture.fields,answers:fixture.answers,saved:fixture.saved,
            drafts,writable:fixture.writable,disabled:false,onChange:setDrafts}),React.createElement("pre",{id:"drafts",style:{whiteSpace:"pre-wrap"}},JSON.stringify(drafts)));}
        createRoot(document.getElementById("root")).render(React.createElement(App));`;
        },
        configureServer(s) {
          s.middlewares.use("/question-test", async (_req, res) => {
            res.setHeader("Content-Type", "text/html");
            res.end(
              await s.transformIndexHtml(
                "/question-test",
                '<div id="root"></div><script type="module" src="/@id/__x00__question-follow-up.tsx"></script>',
              ),
            );
          });
        },
      },
    ],
  });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === "string")
    throw new Error("Missing fixture port");
  baseUrl = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || "/usr/bin/chromium",
    headless: true,
  });
}, 15000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});
async function fixture(page: Page, value: unknown) {
  page.setDefaultTimeout(5000);
  await page.addInitScript(
    (value) => Object.assign(window, { questionFixture: value }),
    value,
  );
  await page.route("**/api/csrf", (route) =>
    route.fulfill({
      json: { csrf_token: "synthetic-fixture-not-a-credential" },
    }),
  );
  await page.goto(`${baseUrl}/question-test`);
}

it("retains staff reason and next action after a rejected save without changing unknown or declined answers", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const requests: any[] = [];
  await page.route("**/intake_revisions", async (route) => {
    requests.push(route.request().postDataJSON().intake);
    await route.fulfill({
      status: 422,
      json: { error: "Controlled intake rejection" },
    });
  });
  await fixture(page, { workspace });
  await page
    .getByRole("button", { name: "Question follow-up details (0)" })
    .click();
  await page
    .getByRole("combobox", { name: "Question for follow-up" })
    .fill("What would");
  await page
    .getByRole("option", {
      name: "What would you like help with?",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Add follow-up detail" }).click();
  const reason = page.getByRole("textbox", {
    name: "Follow-up reason — What would you like help with?",
    exact: true,
  });
  const next = page.getByRole("textbox", {
    name: "Next action — What would you like help with?",
    exact: true,
  });
  await reason.fill("Synthetic unresolved goal context");
  await next.fill("Discuss the reported goal");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page
    .getByText("Controlled intake rejection", { exact: true })
    .waitFor();
  expect(await reason.inputValue()).toBe("Synthetic unresolved goal context");
  expect(await next.inputValue()).toBe("Discuss the reported goal");
  expect(requests).toHaveLength(1);
  expect(requests[0].expected_version).toBe(1);
  expect(requests[0].questionnaire.answers).toMatchObject(answers);
  expect(requests[0].questionnaire.question_follow_up.goals).toEqual({
    reason: "Synthetic unresolved goal context",
    next_action: "Discuss the reported goal",
  });
  await page.close();
});

it("exposes preserved source context to a reader without mutation controls", async () => {
  const page = await browser.newPage();
  await fixture(page, { fields, answers, saved, writable: false });
  await page
    .getByRole("button", { name: "Question follow-up details (1)" })
    .click();
  expect(
    await page
      .getByRole("textbox", {
        name: "Follow-up reason — What would you like help with?",
        exact: true,
      })
      .isDisabled(),
  ).toBe(true);
  await page.getByText(/Saved context: intake version 1/).waitFor();
  expect(
    await page.getByRole("button", { name: "Remove follow-up detail" }).count(),
  ).toBe(0);
  expect(
    await page
      .getByRole("combobox", { name: "Question for follow-up" })
      .count(),
  ).toBe(0);
  await page.close();
});

it("flags a changed response and binds current context only after an explicit choice", async () => {
  const page = await browser.newPage({
    viewport: { width: 834, height: 1112 },
  });
  await fixture(page, {
    fields,
    answers: { ...answers, goals: { state: "declined", value: "" } },
    saved,
    writable: true,
  });
  await page
    .getByRole("button", { name: "Question follow-up details (1)" })
    .click();
  await page.getByText(/The answer changed since/).waitFor();
  expect(JSON.parse(await page.locator("#drafts").innerText()).goals).toEqual({
    reason: "Original reason",
    next_action: "Original next action",
  });
  await page
    .getByRole("button", { name: "Record current answer context on save" })
    .click();
  expect(
    JSON.parse(await page.locator("#drafts").innerText()).goals.rebind,
  ).toBe(true);
  await page.getByRole("button", { name: "Remove follow-up detail" }).click();
  expect(JSON.parse(await page.locator("#drafts").innerText())).toEqual({});
  await page.close();
});
