import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright-core";
import { fileURLToPath } from "node:url";

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
const task = (id: number, state: string, source_type: string) => ({
  id,
  state,
  source_type,
  patient_id: 12,
  encounter_id: 30,
  site_id: 15,
  task_kind: "patient_call",
  pool_code: "clinical",
  assigned_to_membership_id: null,
  due_at: null,
  source_id: null,
  resolution_code: null,
  version: 3,
  updated_at: "2026-09-30T12:00:00Z",
});
const workspace = {
  schema_version: "nurse-workspace-v1",
  patient_id: 12,
  encounter_id: 30,
  intake: null,
  handoff: null,
  tasks: [
    task(71, "cancelled", "manual"),
    task(72, "cancelled", "order"),
    task(73, "completed", "manual"),
  ],
  capabilities: {
    tasks_write: true,
    intake_write: false,
    handoff_request: false,
    handoff_respond: false,
    observations_write: false,
  },
};

beforeAll(async () => {
  const virtualId = "\0nurse-task-recovery.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "nurse-task-recovery",
        enforce: "pre",
        resolveId(id, importer) {
          if (
            id === "./Workspace" &&
            /\/(NurseEncounterWorkspace|VitalSignsEntry|IntakeConsentEvidence|PatientCareCoordination)\.tsx$/.test(
              importer ?? "",
            )
          )
            return "\0recovery-clinic-context";
          if (id === virtualId) return virtualId;
        },
        load(id) {
          if (id === "\0recovery-clinic-context")
            return "export const useClinic = () => ({membership_id:7});";
          if (id !== virtualId) return;
          return `import React,{useState} from "react"; import {createRoot} from "react-dom/client";
          import {NurseEncounterWorkspaceContent} from "/src/features/clinic/NurseEncounterWorkspace";
          function App(){
            const [data,setData]=useState(window.initialRecoveryWorkspace);
            return React.createElement(NurseEncounterWorkspaceContent,{
              patient:{id:12,display_name:"Synthetic recovery patient"},
              encounter:{id:30,patient_id:12,site_id:15,room_id:null,status:"open",visit_modality:"video"},
              observations:[],careSummary:null,roomsResource:{data:{rooms:[]},refresh:()=>{}},
              resource:{data,error:"",refresh:()=>{window.recoveryRefreshes=(window.recoveryRefreshes||0)+1;
                if(window.recoveredTask)setData({...data,tasks:data.tasks.map(t=>t.id===window.recoveredTask.id?window.recoveredTask:t)});}}
            });
          }
          createRoot(document.getElementById("root")).render(React.createElement(App));`;
        },
        configureServer(s) {
          s.middlewares.use("/recovery-test", async (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await s.transformIndexHtml(
                "/recovery-test",
                '<div id="root"></div><script type="module" src="/@id/__x00__nurse-task-recovery.tsx"></script>',
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

it("reopens only cancelled manual work using the exact task revision, then exposes claim separately", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  page.setDefaultTimeout(5000);
  await page.addInitScript(
    (value) => Object.assign(window, { initialRecoveryWorkspace: value }),
    workspace,
  );
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/clinic/clinical_tasks/*", async (route) => {
    expect(route.request().method()).toBe("PATCH");
    expect(new URL(route.request().url()).pathname).toBe(
      "/api/clinic/clinical_tasks/71",
    );
    requests.push(route.request().postDataJSON().task);
    const recovered = { ...task(71, "open", "manual"), version: 4 };
    await page.evaluate(
      (value) => Object.assign(window, { recoveredTask: value }),
      recovered,
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ task: recovered }),
    });
  });
  await page.route("**/api/csrf", (route) =>
    route.fulfill({
      json: { csrf_token: "synthetic-fixture-not-a-credential" },
    }),
  );
  await page.goto(`${baseUrl}/recovery-test`);
  await page
    .getByRole("button", { name: "Follow-up work", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cancelled follow-up work (1)" })
    .click();
  expect(
    await page.getByRole("button", { name: "Reopen task 72" }).count(),
  ).toBe(0);
  expect(
    await page.getByRole("button", { name: "Reopen task 73" }).count(),
  ).toBe(0);
  await page.getByRole("button", { name: "Reopen task 71" }).click();
  await page.getByRole("button", { name: "Claim", exact: true }).waitFor();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ action: "reopen", expected_version: 3 });
  expect(typeof requests[0].request_key).toBe("string");
  expect(requests[0]).not.toHaveProperty("resolution_code");
  expect(
    await page.getByRole("button", { name: "Reopen task 71" }).count(),
  ).toBe(0);
  await page.close();
});

it.each([403, 409])(
  "retains cancelled work after a %s denial/conflict and sends no automatic replay",
  async (status) => {
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    await page.addInitScript(
      (value) => Object.assign(window, { initialRecoveryWorkspace: value }),
      workspace,
    );
    let calls = 0;
    await page.route("**/api/clinic/clinical_tasks/*", async (route) => {
      calls++;
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Controlled recovery denied",
          code: status === 403 ? "forbidden" : "stale",
        }),
      });
    });
    await page.route("**/api/csrf", (route) =>
      route.fulfill({
        json: { csrf_token: "synthetic-fixture-not-a-credential" },
      }),
    );
    await page.goto(`${baseUrl}/recovery-test`);
    await page
      .getByRole("button", { name: "Follow-up work", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Cancelled follow-up work (1)" })
      .click();
    await page.getByRole("button", { name: "Reopen task 71" }).click();
    await page
      .getByText("Controlled recovery denied", { exact: true })
      .waitFor();
    expect(
      await page.getByRole("button", { name: "Reopen task 71" }).isEnabled(),
    ).toBe(true);
    expect(
      await page.getByRole("button", { name: "Claim", exact: true }).count(),
    ).toBe(0);
    expect(calls).toBe(1);
    expect(
      await page.evaluate(() => Reflect.get(window, "recoveryRefreshes") || 0),
    ).toBe(0);
    await page.close();
  },
);

it("hides mutation recovery for a reader", async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  await page.addInitScript(
    (value) => Object.assign(window, { initialRecoveryWorkspace: value }),
    {
      ...workspace,
      capabilities: { ...workspace.capabilities, tasks_write: false },
    },
  );
  await page.route("**/api/csrf", (route) =>
    route.fulfill({
      json: { csrf_token: "synthetic-fixture-not-a-credential" },
    }),
  );
  await page.goto(`${baseUrl}/recovery-test`);
  await page
    .getByRole("button", { name: "Follow-up work", exact: true })
    .click();
  await page
    .getByText("Synthetic recovery patient", { exact: false })
    .first()
    .waitFor();
  expect(
    await page
      .getByRole("button", { name: /Cancelled follow-up work|Reopen task/ })
      .count(),
  ).toBe(0);
  await page.close();
});
