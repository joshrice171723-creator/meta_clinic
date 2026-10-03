import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, transformWithOxc, type ViteDevServer } from "vite";
import {
  chromium,
  type Browser,
  type Page,
  type Locator,
} from "playwright-core";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
let server: ViteDevServer, browser: Browser, origin: string;
const entry = "\0follow-up-recovery.tsx";
beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root,
    cacheDir: resolve(
      root,
      "../../tmp/work-inbox-follow-up-recovery/vite-cache",
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
        name: "synthetic-follow-up-recovery",
        enforce: "pre",
        resolveId(id, importer) {
          if (id === entry) return entry;
          if (id === "./Workspace" && importer?.endsWith("/WorkInbox.tsx"))
            return "\0inbox-recovery-clinic";
        },
        async load(id) {
          if (id === "\0inbox-recovery-clinic")
            return `export const useClinic=()=>({practice:{id:94,timezone:'UTC'},user_id:71,current_site:{id:93,name:'Synthetic site'},capabilities:{patients:true,encounters:true}});`;
          if (id !== entry) return;
          return (
            await transformWithOxc(
              `
          import React from 'react'; import {createRoot} from 'react-dom/client';
          import {FollowUpFixture,WorkInbox} from '/src/features/clinic/WorkInbox';
          import {ClinicNavigationProvider,createClinicNavigationGuard} from '/src/features/clinic/clinicNavigation';
          function Fixture() {
            const [version,setVersion]=React.useState(7);
            window.refreshFollowUp=()=>setVersion(8);
            return <FollowUpFixture actorMembershipId={71}
              onChanged={()=>{window.confirmedFollowUps+=1}}
              followUp={{id:11,encounter_id:21,version,status:'needed',state:'needed',
                plan:'Synthetic follow-up',due_at:null,assigned_to_membership_id:71,
                eligible_assignees:[{membership_id:71,label:'Synthetic owner'},
                  {membership_id:72,label:'Synthetic alternate'}]}}/>;
          }
          const guard=createClinicNavigationGuard();window.fixtureGuard=guard;window.confirm=()=>true;
          createRoot(document.getElementById('root')).render(new URLSearchParams(location.search).has('inbox')
            ? <ClinicNavigationProvider value={{...guard,navigate:()=>false}}><WorkInbox/></ClinicNavigationProvider>
            : <Fixture/>);
        `,
              "follow-up-recovery.tsx",
              { lang: "tsx", jsx: { runtime: "automatic" } },
            )
          ).code;
        },
        async transform(_code, id) {
          if (!id.split("?")[0].endsWith("/src/features/clinic/WorkInbox.tsx"))
            return;
          return (
            await transformWithOxc(
              readFileSync(id.split("?")[0], "utf8") +
                "\nexport { EncounterFollowUpActions as FollowUpFixture };\n",
              id,
              { lang: "tsx", jsx: { runtime: "automatic" } },
            )
          ).code;
        },
        configureServer(vite) {
          vite.middlewares.use("/follow-up-recovery", async (_req, res) => {
            res.setHeader("Content-Type", "text/html");
            res.end(
              await vite.transformIndexHtml(
                "/follow-up-recovery",
                '<div id="root"></div><script>window.confirmedFollowUps=0</script><script type="module" src="/@id/__x00__follow-up-recovery.tsx"></script>',
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

function renderDiagnostics(page: Page, errors: string[]) {
  const diagnostics: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error")
      diagnostics.push(`console: ${message.text()}`);
  });
  page.on("requestfailed", (request) =>
    diagnostics.push(
      `request: ${request.method()} ${request.url()} ${request.failure()?.errorText}`,
    ),
  );
  page.on("response", (response) => {
    if (response.status() >= 400)
      diagnostics.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  return async (locator: Locator) => {
    try {
      await locator.waitFor({ state: "visible" });
    } catch (cause) {
      throw new Error(
        `Fixture failed to render at ${page.url()}\n${[
          ...errors.map((error) => `pageerror: ${error}`),
          ...diagnostics,
          `body: ${(await page.locator("body").innerText()).slice(0, 2000)}`,
        ].join("\n")}`,
        { cause },
      );
    }
    expect(errors, diagnostics.join("\n")).toEqual([]);
  };
}

for (const failure of ["network interrupted", "server unknown"] as const) {
  it(`retains the complete follow-up intent through ${failure} and a newer source version`, async () => {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    page.setDefaultTimeout(8000);
    const writes: unknown[] = [],
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const rendered = renderDiagnostics(page, errors);
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      if (new URL(request.url()).pathname === "/api/csrf")
        return route.fulfill({
          json: { csrf_token: "synthetic-follow-up-token" },
        });
      writes.push(request.postDataJSON());
      if (writes.length === 1) {
        if (failure === "network interrupted") return route.abort("failed");
        return route.fulfill({
          status: 503,
          json: { code: "outcome_unconfirmed" },
        });
      }
      return route.fulfill({
        json: { follow_up: { id: 11, version: 8, state: "completed" } },
      });
    });
    try {
      await page.goto(`${origin}/follow-up-recovery`, { timeout: 15000 });
      await rendered(page.getByLabel("Resolution outcome", { exact: true }));
      await page
        .getByLabel("Resolution outcome", { exact: true })
        .fill("Synthetic patient contacted");
      await page.getByRole("button", { name: "Resolve", exact: true }).click();
      await page
        .getByRole("button", { name: "Retry exact follow-up action" })
        .waitFor();
      expect(writes).toHaveLength(1);
      expect(
        await page
          .getByLabel("Resolution outcome", { exact: true })
          .isDisabled(),
      ).toBe(true);
      expect(
        await page
          .getByRole("button", { name: "Transfer", exact: true })
          .isDisabled(),
      ).toBe(true);
      await page.evaluate(() => (window as any).refreshFollowUp());
      await page
        .getByRole("button", { name: "Resolve", exact: true })
        .evaluate((button: HTMLButtonElement) => button.click());
      expect(writes).toHaveLength(1);
      await page
        .getByRole("button", { name: "Retry exact follow-up action" })
        .click();
      await page.waitForFunction(
        () => (window as any).confirmedFollowUps === 1,
      );
      expect(writes).toHaveLength(2);
      expect(writes[1]).toEqual(writes[0]);
      expect(writes[1]).toMatchObject({
        follow_up: {
          expected_version: 7,
          outcome: "Synthetic patient contacted",
          action: "complete",
        },
      });
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  });
}

for (const kind of ["task", "follow-up"] as const) {
  it(`keeps explicit ${kind} retry and navigation protection after the refreshed source row disappears`, async () => {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    page.setDefaultTimeout(8000);
    const writes: any[] = [],
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const rendered = renderDiagnostics(page, errors);
    let removed = false;
    const task = {
      id: 41,
      patient_id: 12,
      encounter_id: null,
      site_id: 93,
      task_kind: "patient_call",
      state: "in_progress",
      pool_code: "front_desk",
      assigned_to_membership_id: 71,
      pending_assignee_membership_id: null,
      due_at: null,
      source_type: "manual",
      source_id: null,
      source_managed: false,
      dependency_ids: [],
      waiting_on_task_ids: [],
      version: 7,
      assigned_to_me: true,
      assignee_label: "Synthetic owner",
      overdue: false,
      patient_display_name: "Synthetic Recovery Patient",
      patient_reference: "SYN-12",
      patient_href: "/clinic/patients/12",
      encounter_href: null,
      eligible_assignees: [{ membership_id: 71, label: "Synthetic owner" }],
    };
    const followUp = {
      id: 11,
      encounter_id: 21,
      version: 7,
      status: "needed",
      state: "needed",
      plan: "Synthetic follow-up",
      due_at: null,
      assigned_to_membership_id: 71,
      patient_display_name: "Synthetic Recovery Patient",
      patient_reference: "SYN-12",
      assigned_to_me: true,
      assignee_label: "Synthetic owner",
      overdue: false,
      eligible_assignees: [{ membership_id: 71, label: "Synthetic owner" }],
    };
    const summary = { open: 0, mine: 0, overdue: 0, unassigned: 0 };
    await page.route("**/api/**", async (route) => {
      const request = route.request(),
        path = new URL(request.url()).pathname;
      if (path === "/api/csrf")
        return route.fulfill({ json: { csrf_token: "synthetic-recovery" } });
      if (request.method() !== "GET") {
        writes.push(request.postDataJSON());
        if (writes.length === 1) {
          removed = true;
          return route.fulfill({
            status: 503,
            json: { code: "outcome_unconfirmed" },
          });
        }
        return route.fulfill({
          json:
            kind === "task"
              ? { task: { ...task, state: "completed", version: 8 } }
              : { follow_up: { ...followUp, state: "completed", version: 8 } },
        });
      }
      return route.fulfill({
        json: {
          actor_membership_id: 71,
          summary,
          encounter_summary: summary,
          clinical_task_summary: summary,
          requests: [],
          renewal_exceptions: [],
          clinical_tasks: !removed && kind === "task" ? [task] : [],
          encounter_follow_ups:
            !removed && kind === "follow-up" ? [followUp] : [],
          staff_requests_page: { page: 1, per_page: 50, total: 0 },
          encounter_follow_ups_page: {
            page: 1,
            per_page: 50,
            total: removed ? 0 : 1,
          },
          renewal_exceptions_page: { page: 1, per_page: 50, total: 0 },
          offboarded_tasks_page: {
            page: 1,
            per_page: 50,
            total: 0,
            total_pages: 1,
          },
          reminder_attention_count: null,
          can_manage_staff_requests: false,
          can_escalate_staff_requests: false,
        },
      });
    });
    try {
      await page.goto(`${origin}/follow-up-recovery?inbox=1`, {
        timeout: 15000,
      });
      await rendered(page.getByText("Actions and details", { exact: true }));
      await page.getByText("Actions and details", { exact: true }).click();
      if (kind === "follow-up")
        await page
          .getByLabel("Resolution outcome", { exact: true })
          .fill("Synthetic contact completed");
      await page.getByRole("button", { name: "Resolve", exact: true }).click();
      const recovery = page.getByRole("region", {
        name: "Unconfirmed inbox actions",
      });
      await recovery
        .getByRole("heading", { name: "Confirm unresolved work" })
        .waitFor();
      expect(
        await page.evaluate(() =>
          (window as any).fixtureGuard.confirmNavigation(),
        ),
      ).toBe(false);
      await page
        .getByRole("button", { name: "Refresh", exact: true })
        .first()
        .click();
      await page
        .getByText("Actions and details", { exact: true })
        .waitFor({ state: "detached" });
      const retry = recovery.getByRole("button", {
        name:
          kind === "task"
            ? "Retry exact task action"
            : "Retry exact follow-up action",
        exact: true,
      });
      await retry.click();
      await recovery.waitFor({ state: "detached" });
      expect(writes).toHaveLength(2);
      expect(writes[1]).toEqual(writes[0]);
      expect(
        await page.evaluate(() =>
          (window as any).fixtureGuard.confirmNavigation(),
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  });
}
