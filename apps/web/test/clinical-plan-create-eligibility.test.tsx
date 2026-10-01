import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright-core";
import { fileURLToPath } from "node:url";

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;

beforeAll(async () => {
  const virtualId = "\0clinical-plan-create.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "clinical-plan-create-fixture",
        enforce: "pre",
        resolveId(id, importer) {
          if (id === virtualId) return virtualId;
          if (
            importer?.endsWith("/PatientLabReports.tsx") &&
            id === "./Workspace"
          )
            return "\0plan-context";
          if (importer?.endsWith("/ClinicalPlanWorkspace.tsx")) {
            if (id === "./Workspace") return "\0plan-context";
            if (id === "../../shared/ui") return "\0plan-resource";
            if (id === "./ClinicalPlanClosurePanel") return "\0plan-closure";
            if (id === "./PrescriptionFulfillmentPanel")
              return "\0plan-prescription";
          }
        },
        load(id) {
          if (id === "\0plan-context")
            return 'export const useClinic=()=>({practice:{timezone:"UTC"},capabilities:{patients:true,notes_read:true}});';
          if (id === "\0plan-resource")
            return 'import {useResource as actualUseResource} from "/src/shared/ui"; export const useResource=(path,options)=>new URLSearchParams(location.search).has("save")?actualUseResource(path,options):({data:options?.enabled===false?undefined:path.endsWith("/events")?{attempts:[]}:window.planData,refresh:()=>{}}); export const LoadState=()=>null;';
          if (id === "\0plan-closure")
            return 'import React from "react"; export const ClinicalPlanClosurePanel=()=>React.createElement("div",{id:"shared-closure"},"Shared fulfillment fixture");';
          if (id === "\0plan-prescription")
            return "export const PrescriptionFulfillmentPanel=()=>null;";
          if (id !== virtualId) return;
          return `import React from "react";
          import {createRoot} from "react-dom/client";
          import {PatientLabReports} from "/src/features/clinic/PatientLabReports";
          import {ClinicalPlanWorkspace} from "/src/features/clinic/ClinicalPlanWorkspace";
          const params=new URLSearchParams(location.search);
          const kinds=["medication_requests","service_requests","diagnoses","procedures","care_plans","care_goals","immunizations","assessments"];
          window.planData={records:Object.fromEntries(kinds.map(k=>[k,[]])),truncated:Object.fromEntries(kinds.map(k=>[k,false])),capabilities:Object.fromEntries(kinds.map(k=>[k,!params.has("denied")])),new_work:{care_plans:!params.has("disabled")},assessment_scope:[],medication_products:[],medication_order_options:{dose_units:[],routes:[]},prior_care:[],prior_orders:[]};
          function App() {
            if(params.has("lab"))return React.createElement(PatientLabReports,{patientId:12,patientName:"Synthetic Patient"});
            const workspace=React.createElement(ClinicalPlanWorkspace,{patient:{id:12,display_name:"Synthetic plan patient"},encounter:{id:30,patient_id:12,status:params.has("closed")?"completed":"open",ended_at:params.has("ended")?"2026-09-28T12:00:00Z":null,site_id:params.has("no-facility")?null:"1"}});
            return params.has("scroll")?React.createElement(React.Fragment,null,React.createElement("div",{style:{height:1200},id:"synthetic-intake"},"Synthetic intake placeholder"),workspace,React.createElement("div",{style:{height:1600}})):workspace;
          }
          createRoot(document.getElementById("root")).render(React.createElement(App));`;
        },
        configureServer(s) {
          s.middlewares.use("/plan-create", async (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await s.transformIndexHtml(
                "/plan-create",
                '<div id="root"></div><script type="module" src="/@id/__x00__clinical-plan-create.tsx"></script>',
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

it.each(["closed", "ended", "no-facility", "denied", "disabled"])(
  "blocks the Goals Add care plan shortcut when %s",
  async (reason) => {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    await page.goto(`${baseUrl}/plan-create?${reason}`);
    await page.getByRole("tab", { name: /Goals/ }).click();
    expect(
      await page
        .getByRole("button", { name: "Add care plan", exact: true })
        .isDisabled(),
    ).toBe(true);
    await page.getByRole("tab", { name: /Care plans/ }).click();
    expect(
      await page
        .getByRole("button", { name: "Add care plan", exact: true })
        .isDisabled(),
    ).toBe(true);
    await page.close();
  },
);

it("opens the same care-plan dialog from Goals when all existing prerequisites hold", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  await page.goto(`${baseUrl}/plan-create`);
  await page.getByRole("tab", { name: /Goals/ }).click();
  await page
    .getByRole("button", { name: "Add care plan", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  expect(await page.getByRole("dialog").innerText()).toContain("care plan");
  await page.close();
});

it("#191 saves a facility-qualified open-encounter care plan from Goals and reads it after reload", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  page.setDefaultTimeout(5000);
  const base = "/api/clinic/patients/12/encounters/30";
  const records = Object.fromEntries(
    [
      "medication_requests",
      "service_requests",
      "diagnoses",
      "procedures",
      "care_plans",
      "care_goals",
      "immunizations",
      "assessments",
    ].map((kind) => [kind, [] as Record<string, unknown>[]]),
  );
  const posts: Record<string, any>[] = [];
  const unexpected: string[] = [];
  let reads = 0;
  try {
    await page.route(`${baseUrl}/api/**`, async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/api/csrf" && request.method() === "GET")
        return route.fulfill({ json: { csrf_token: "synthetic-plan-csrf" } });
      if (
        path === `${base}/clinical_plan_workspace` &&
        request.method() === "GET"
      ) {
        reads += 1;
        return route.fulfill({
          json: {
            records,
            truncated: Object.fromEntries(
              Object.keys(records).map((kind) => [kind, false]),
            ),
            capabilities: Object.fromEntries(
              Object.keys(records).map((kind) => [kind, true]),
            ),
            new_work: { care_plans: true },
            assessment_scope: [],
            medication_products: [],
            medication_order_options: { dose_units: [], routes: [] },
            prior_care: [],
            prior_orders: [],
          },
        });
      }
      if (path === `${base}/care_plans` && request.method() === "POST") {
        expect(request.headers()["x-csrf-token"]).toBe("synthetic-plan-csrf");
        const body = request.postDataJSON();
        posts.push(body);
        expect(body.care_plan).toEqual({
          status: "draft",
          title: "Synthetic Goals recovery plan",
          description: "Synthetic agreed follow-up",
          starts_on: "",
          ends_on: "",
          request_key: expect.stringMatching(/^[0-9a-f-]{36}$/),
        });
        const plan = {
          ...body.care_plan,
          id: 191,
          patient_id: 12,
          encounter_id: 30,
          site_id: 1,
          series_id: "synthetic-plan-191",
          version_number: 1,
          prior_revision_id: null,
          recorded_at: "2026-10-01T12:00:00Z",
          recorded_by_name: "Synthetic clinician",
        };
        records.care_plans.push(plan);
        return route.fulfill({ status: 201, json: { care_plan: plan } });
      }
      unexpected.push(`${request.method()} ${path}`);
      await route.abort();
    });
    await page.goto(`${baseUrl}/plan-create?save`);
    await page.getByRole("tab", { name: /Goals/ }).click();
    const add = page.getByRole("button", {
      name: "Add care plan",
      exact: true,
    });
    expect(await add.isEnabled()).toBe(true);
    await add.click();
    await page
      .getByRole("textbox", { name: "Plan title", exact: true })
      .fill("Synthetic Goals recovery plan");
    await page
      .getByRole("textbox", { name: "Plan details", exact: true })
      .fill("Synthetic agreed follow-up");
    await page
      .getByRole("button", { name: "Save revision", exact: true })
      .click();
    await expect.poll(() => posts.length).toBe(1);
    await expect.poll(() => page.getByRole("dialog").count()).toBe(0);
    await page
      .getByText("Synthetic Goals recovery plan", { exact: true })
      .waitFor();
    expect(reads).toBeGreaterThanOrEqual(2);
    const readsBeforeReload = reads;
    await page.reload();
    await page.getByRole("tab", { name: /Care plans/ }).click();
    await page
      .getByText("Synthetic Goals recovery plan", { exact: true })
      .waitFor();
    expect(reads).toBeGreaterThan(readsBeforeReload);
    expect(records.care_plans).toHaveLength(1);
    expect(posts).toHaveLength(1);
    expect(unexpected).toEqual([]);
  } finally {
    await page.close();
  }
});

it("keeps shared fulfillment outside tab-specific content and distinguishes structured assessments", async () => {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/plan-create`);
  await page.getByRole("tab", { name: /Structured assessments/ }).click();
  expect(
    await page
      .getByRole("button", { name: "Add structured assessment", exact: true })
      .isDisabled(),
  ).toBe(true);
  expect(await page.locator("#shared-closure").count()).toBe(1);
  expect(
    await page
      .locator("#shared-closure")
      .evaluate((el) =>
        Boolean(
          el.compareDocumentPosition(
            document.querySelector('[role="tablist"]')!,
          ) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ),
  ).toBe(true);
  await page.getByRole("tab", { name: /Care plans/ }).click();
  expect(await page.locator("#shared-closure").count()).toBe(1);
  await page.close();
});

it("keeps medication and lab acknowledgment spacing in rendered and accessible text", async () => {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/plan-create`);
  const empty = page.getByText(
    "No medications are recorded for this encounter.",
    { exact: true },
  );
  await empty.waitFor();
  expect(await empty.evaluate((el) => el.childNodes.length)).toBe(1);
  const cdp = await page.context().newCDPSession(page);
  expect(
    JSON.stringify(await cdp.send("Accessibility.getFullAXTree")),
  ).toContain("No medications are recorded for this encounter.");
  await page.route("**/api/csrf", (r) =>
    r.fulfill({ json: { csrf_token: "synthetic" } }),
  );
  await page.route("**/api/clinic/patients/12/lab_reports?*", (r) =>
    r.fulfill({
      json: {
        reports: [],
        can_write: false,
        can_review: false,
        pagination: { page: 1, per_page: 25, total: 0 },
      },
    }),
  );
  await page.goto(`${baseUrl}/plan-create?lab`);
  const guidance = page.getByText(
    /Review recorded reports here. Open the source encounter/,
  );
  await guidance.waitFor();
  expect(await guidance.innerText()).toContain(
    "specimen. Acknowledgment and follow-up remain separate actions.",
  );
  expect(await guidance.evaluate((el) => el.childNodes.length)).toBe(1);
  expect(
    JSON.stringify(await cdp.send("Accessibility.getFullAXTree")),
  ).toContain("Acknowledgment and follow-up remain separate actions.");
  await page.close();
});

it("keeps the clinical-plan tabs in view when switching diagnoses and procedures", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  await page.goto(`${baseUrl}/plan-create?scroll`);
  const tabs = page.getByRole("tablist");
  await tabs.waitFor();
  await tabs.evaluate((el) =>
    window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 100),
  );
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(1000);
  for (const name of [/Diagnoses/, /Procedures/, /Medications/]) {
    const tab = page.getByRole("tab", { name });
    await tab.click();
    expect(await tab.getAttribute("aria-selected")).toBe("true");
    expect(
      Math.abs((await page.evaluate(() => window.scrollY)) - before),
    ).toBeLessThan(3);
    const bounds = await tab.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThan(900);
  }
  await page.close();
});
