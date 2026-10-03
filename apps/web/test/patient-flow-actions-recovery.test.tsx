import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, transformWithOxc, type ViteDevServer } from "vite";
import { chromium, type Browser, type Route } from "playwright-core";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// Install as apps/web/test/patient-flow-actions-recovery.test.tsx.
// Independently synthetic records. Real PatientFlowCard, both TaskActions,
// InboxRow, API client and receipt validator; private export is fixture-only.
const root = fileURLToPath(new URL("../", import.meta.url));
const entry = "\0patient-flow-recovery-fixture.tsx";
let server: ViteDevServer, browser: Browser, origin: string;
const task = {
  id: 9101,
  patient_id: 9201,
  encounter_id: null,
  site_id: 93,
  task_kind: "patient_call",
  state: "open",
  pool_code: "front_desk",
  assigned_to_membership_id: null,
  pending_assignee_membership_id: null,
  due_at: null,
  source_type: "manual",
  source_id: null,
  resolution_code: null,
  source_managed: false,
  has_recorded_appointment: false,
  owner_unavailable: false,
  dependency_ids: [],
  waiting_on_task_ids: [],
  waiting_reason: null,
  version: 7,
  updated_at: "2031-04-08T10:00:00Z",
  assigned_to_me: false,
  assignee_label: null,
  overdue: false,
  patient_display_name: "Synthetic Flow Patient",
  patient_reference: "SYN-FLOW-9201",
  patient_href: "/clinic/patients/9201",
  encounter_href: null,
  eligible_assignees: [
    { membership_id: 71, label: "Synthetic front desk" },
    { membership_id: 72, label: "Synthetic alternate" },
  ],
};
const item = {
  id: "task-9101",
  type: "patient",
  title: "Complete initial contact",
  patient: "Synthetic Flow Patient",
  patientReference: "SYN-FLOW-9201",
  detail: "Synthetic contact task",
  status: "open",
  dueAt: null,
  dateCaption: "Due",
  overdue: false,
  href: "/clinic/patients/9201",
  action: "Open patient",
  icon: "assignment",
  nextAction: "Claim or transfer this task",
  owner: "Unassigned",
  sourceLabel: "manual",
  mutation: { kind: "task", task },
};

beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root,
    cacheDir: resolve(
      root,
      "../../tmp/patient-flow-actions-runtime/vite-cache",
    ),
    server: { host: "127.0.0.1", port: 0, hmr: false },
    optimizeDeps: {
      entries: [],
      noDiscovery: true,
      include: [
        "react",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "react-dom",
        "react-dom/client",
        "@mui/material",
        "@mui/material/Alert",
        "@emotion/react",
        "@emotion/styled",
        "@mui/icons-material/AssignmentOutlined",
        "@mui/icons-material/DescriptionOutlined",
        "@mui/icons-material/ForumOutlined",
        "@mui/icons-material/PaymentOutlined",
        "@mui/icons-material/ScienceOutlined",
      ],
    },
    oxc: { jsx: { runtime: "automatic" } },
    plugins: [
      {
        name: "controlled-patient-flow-actions",
        enforce: "pre",
        resolveId(id, importer) {
          if (id === entry) return entry;
          if (id === "./Workspace" && importer?.endsWith("/WorkInbox.tsx"))
            return "\0patient-flow-clinic";
        },
        async load(id) {
          if (id === "\0patient-flow-clinic")
            return `export const useClinic=()=>({
          practice:{id:94,timezone:'UTC'},user_id:71,current_site:{id:93},
          sites:[{id:93,status:'active'}],capabilities:{appointments_read:true,appointments_book:true}
        });`;
          if (id !== entry) return;
          return (
            await transformWithOxc(
              `
          import React from 'react'; import {createRoot} from 'react-dom/client';
          import {PatientFlowCardFixture} from '/src/features/clinic/WorkInbox';
          const item=${JSON.stringify(item)};
          createRoot(document.getElementById('root')).render(<PatientFlowCardFixture
            item={item} work={{actor_membership_id:71,clinical_tasks:[item.mutation.task]}}
            onChanged={(message)=>{window.fixtureChanges.push(message || 'changed')}} />);
        `,
              "patient-flow-recovery-fixture.tsx",
              { lang: "tsx", jsx: { runtime: "automatic" } },
            )
          ).code;
        },
        async transform(code, id) {
          if (!id.split("?")[0].endsWith("/src/features/clinic/WorkInbox.tsx"))
            return;
          // Use the complete current source, adding only a private fixture export.
          return (
            await transformWithOxc(
              readFileSync(id.split("?")[0], "utf8") +
                "\nexport { PatientFlowCard as PatientFlowCardFixture };\n",
              id,
              { lang: "tsx", jsx: { runtime: "automatic" } },
            )
          ).code;
        },
        configureServer(vite) {
          vite.middlewares.use(
            "/patient-flow-recovery-fixture",
            async (_req, res) => {
              res.setHeader("Content-Type", "text/html");
              res.end(
                await vite.transformIndexHtml(
                  "/patient-flow-recovery-fixture",
                  '<title>Synthetic Patient Flow recovery</title><div id="root"></div><script>window.fixtureChanges=[]</script><script type="module" src="/@id/__x00__patient-flow-recovery-fixture.tsx"></script>',
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
    throw new Error("Missing fixture port");
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.BROWSER_EXECUTABLE_PATH ||
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  });
}, 60000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
}, 30000);

type Body = {
  task: { action: string; expected_version: number; request_key: string };
};
async function open(respond: (route: Route, body: Body) => Promise<void>) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
  });
  page.setDefaultTimeout(8000);
  const mutations: Body[] = [],
    errors: string[] = [],
    unexpected: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (
      url.origin === origin &&
      !url.pathname.startsWith("/api/") &&
      req.method() === "GET"
    )
      return route.continue();
    if (
      url.origin === origin &&
      req.method() === "GET" &&
      url.pathname === "/api/csrf"
    )
      return route.fulfill({
        json: { csrf_token: "synthetic-fixture-not-a-credential" },
      });
    if (
      url.origin === origin &&
      req.method() === "PATCH" &&
      url.pathname === "/api/clinic/clinical_tasks/9101"
    ) {
      const body = req.postDataJSON() as Body;
      mutations.push(body);
      return respond(route, body);
    }
    unexpected.push(`${req.method()} ${url.origin}${url.pathname}`);
    return route.abort();
  });
  // Cold Vite dependency discovery is startup work, separate from action waits.
  await page.goto(origin + "/patient-flow-recovery-fixture", {
    waitUntil: "domcontentloaded",
    timeout: 15000,
  });
  await page
    .getByRole("button", { name: "Claim work", exact: true })
    .waitFor({ state: "visible" });
  await page.getByText("Actions and details", { exact: true }).click();
  const detail = page.locator("details");
  await detail.getByRole("combobox", { name: "Owner", exact: true }).click();
  await page
    .getByRole("option", { name: "Synthetic alternate", exact: true })
    .click();
  const claim = page.getByRole("button", {
    name: /^(Claim work|Retry claim)$/,
  });
  const transfer = detail.getByRole("button", {
    name: "Request transfer",
    exact: true,
  });
  expect(await transfer.isEnabled()).toBe(true);
  return { page, claim, transfer, mutations, errors, unexpected };
}
function confirmed(body: Body, mismatch = false) {
  return {
    task: {
      ...task,
      state: "claimed",
      assigned_to_membership_id: 71,
      version: 8,
    },
    task_receipt: {
      request_key: mismatch ? "synthetic-wrong-key" : body.task.request_key,
      operation_code: "operations.clinical_task.claim",
      resource_id: 9101,
      actor_membership_id: 71,
      resource_version: "8",
    },
  };
}
async function clean(fixture: Awaited<ReturnType<typeof open>>) {
  expect(fixture.errors).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
  await fixture.page.close();
}

it("pending top claim blocks the separate detail action without another mutation", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const f = await open(async (route, body) => {
    await gate;
    await route.fulfill({ json: confirmed(body) });
  });
  try {
    await f.claim.click();
    await f.page.waitForFunction(() =>
      document.body.textContent?.includes("Claiming"),
    );
    expect(f.mutations).toHaveLength(1);
    expect(await f.transfer.isDisabled()).toBe(true);
    // Attempt activation of the blocked control; it must produce no request.
    await f.transfer.evaluate((button: HTMLButtonElement) => button.click());
    expect(f.mutations).toHaveLength(1);
    release();
    await f.page.waitForFunction(
      () => (window as any).fixtureChanges.length === 1,
    );
    expect(f.mutations[0].task.action).toBe("claim");
  } finally {
    release();
    await clean(f);
  }
});

for (const failure of [
  "server unknown",
  "mismatched receipt",
  "network interrupted",
  "request timeout",
] as const) {
  it(`${failure} blocks detail conflicts and permits only explicit exact claim retry`, async () => {
    let responses = 0;
    const f = await open(async (route, body) => {
      responses += 1;
      if (responses === 1 && failure === "network interrupted")
        return route.abort("failed");
      if (responses === 1 && failure === "request timeout")
        return route.fulfill({
          status: 408,
          json: { error: "Synthetic timeout" },
        });
      if (responses === 1 && failure === "server unknown")
        return route.fulfill({
          status: 503,
          json: { error: "Synthetic unknown", code: "outcome_unconfirmed" },
        });
      return route.fulfill({ json: confirmed(body, responses === 1) });
    });
    try {
      await f.claim.click();
      await f.page
        .getByRole("alert")
        .filter({ hasText: "outcome is unknown" })
        .first()
        .waitFor();
      expect(await f.transfer.isDisabled()).toBe(true);
      await f.transfer.evaluate((button: HTMLButtonElement) => button.click());
      expect(f.mutations).toHaveLength(1);
      expect(
        await f.page.evaluate(() => (window as any).fixtureChanges),
      ).toEqual([]);
      const initial = f.mutations[0];
      expect(initial.task.action).toBe("claim");
      expect(initial.task.expected_version).toBe(7);
      expect(initial.task.request_key).toMatch(/^[0-9a-f-]{36}$/);
      await f.page
        .getByRole("button", { name: "Retry exact task action", exact: true })
        .first()
        .click();
      await f.page.waitForFunction(
        () => (window as any).fixtureChanges.length === 1,
      );
      expect(f.mutations).toHaveLength(2);
      expect(f.mutations[1]).toEqual(initial);
      expect(
        await f.page.evaluate(() => (window as any).fixtureChanges),
      ).toEqual(["Work claimed."]);
    } finally {
      await clean(f);
    }
  });
}
