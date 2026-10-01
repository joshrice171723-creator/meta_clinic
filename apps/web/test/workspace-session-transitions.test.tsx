import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";
import { loginReal, readRealFixture, realGet, realMutation, realUrl, selectReal } from "./support/authorizedRealStack";
let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
const encounterPath = "/clinic/patients/71/encounters/72";
beforeAll(async () => {
  if (process.env.QA_REAL_BASE_URL) {
    readRealFixture();
    browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH || "/usr/bin/chromium", headless: true });
    return;
  }
  const id = "\0workspace-session-transitions.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "workspace-session-fixture",
        resolveId: (value) => (value === id ? id : undefined),
        load(value) {
          if (value !== id) return;
          return `import React from "react";import {createRoot} from "react-dom/client";
 import {Workspace,useClinic} from "/src/features/clinic/Workspace";import {SessionGuard} from "/src/features/identity/SessionGuard";
 import {ClinicNavigationProvider} from "/src/features/clinic/clinicNavigation";import {api} from "/src/api/client";
 const issuedAt=Date.now();const user={id:71,email_address:"synthetic@example.invalid"};
 const session={user,clinic_access:{active:true,authorization_generation:1},session_policy:{server_time:new Date(issuedAt).toISOString(),idle_expires_at:new Date(issuedAt+7200000).toISOString(),absolute_expires_at:new Date(issuedAt+43200000).toISOString(),idle_timeout_seconds:7200}};
 window.navigationCalls=[];
 function Probe(){const context=useClinic();const [feedback,setFeedback]=React.useState("");return React.createElement(React.Fragment,null,
 React.createElement("div",{"data-testid":"context"},JSON.stringify({practice:context.practice.id,site:context.current_site?.id})),
 React.createElement("button",{onClick:context.refreshWorkspace},"Refresh context"),
 React.createElement("button",{onClick:async()=>{try{await api("/api/clinic/scheduling/appointments",{method:"POST",body:{request_key:"synthetic-request"}});}catch(error){setFeedback(error.message);}}},"Synthetic protected submit"),
 React.createElement("p",{role:"status"},feedback),React.createElement("textarea",{"aria-label":"Synthetic working text",defaultValue:"Preserve synthetic work"}));}
 function App(){const [path,setPath]=React.useState(${JSON.stringify(encounterPath)});const navigation={navigate:(href)=>{window.navigationCalls.push(href);setPath(href);return true;},registerBlocker:()=>()=>{}};return React.createElement(SessionGuard,{expectedUserId:71,initialSession:session},React.createElement(ClinicNavigationProvider,{value:navigation},React.createElement(Workspace,{user,path},React.createElement("button",{onClick:()=>setPath(path==="/clinic/work"?${JSON.stringify(encounterPath)}:"/clinic/work")},"Navigate ordinary work"),React.createElement(Probe))));}
 createRoot(document.getElementById("root")).render(React.createElement(App));`;
        },
        configureServer(s) {
          s.middlewares.use(encounterPath, async (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await s.transformIndexHtml(
                encounterPath,
                '<div id="root"></div><script type="module" src="/@id/__x00__workspace-session-transitions.tsx"></script>',
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

it.skipIf(!process.env.QA_REAL_BASE_URL)("#58 actual App cross-window clinic change rejects an invitation without losing its draft or writing it", async () => {
  const seed = readRealFixture();
  const access = seed.access_scenarios as { second_practice_id: number; second_practice_name: string };
  expect(access.second_practice_id).toBeTruthy();
  const context = await browser.newContext();
  const first = await context.newPage();
  const second = await context.newPage();
  const email = "synthetic-cross-window-invite@example.invalid";
  const submissions: unknown[] = [];
  first.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/clinic/workforce/onboarding" && request.method() === "POST") submissions.push(request.postDataJSON());
  });
  try {
    await loginReal(first, seed, "/clinic/workforce/employees");
    const baseline = await realGet<{ invitations: { email_address: string }[] }>(first, "/api/clinic/workforce/employments");
    await first.getByRole("radio", { name: "Create a new employee login", exact: true }).check();
    await first.getByLabel("Employee name", { exact: false }).fill("Synthetic cross-window employee");
    await first.getByLabel("Job title", { exact: false }).fill("Synthetic access test");
    await first.getByLabel("Employee email", { exact: false }).fill(email);
    await selectReal(first, "Access role", "Clinic Administrator");
    await first.getByRole("checkbox", { name: seed.site_name, exact: true }).check();
    await second.goto(realUrl("/clinic/workforce/employees"));
    await second.locator(".clinic-shell").waitFor({ state: "visible" });
    expect((await realGet<{ user: { id: number } }>(second, "/api/session")).user.id).toBe(seed.actor_user_id);
    const secondContext = await realGet<{ practice: { id: number }; current_site: { id: number } }>(second, "/api/clinic/context");
    expect(secondContext.practice.id).toBe(seed.practice_id);
    expect(secondContext.current_site.id).toBe(seed.site_id);
    const switched = second.waitForResponse((response) => new URL(response.url()).pathname === "/api/clinic/context" && response.request().method() === "PATCH");
    await selectReal(second, "Clinic", access.second_practice_name);
    expect((await switched).status()).toBe(200);
    await expect.poll(async () => (await realGet<{ practice: { id: number } }>(second, "/api/clinic/context")).practice.id).toBe(access.second_practice_id);
    await first.bringToFront();
    const rejected = first.waitForResponse((response) => new URL(response.url()).pathname === "/api/clinic/workforce/onboarding" && response.request().method() === "POST");
    await first.getByRole("button", { name: "Create employee invitation", exact: true }).click();
    expect((await rejected).status()).toBe(409);
    await first.getByText("Your clinic changed in another window. Reload before continuing.", { exact: true }).waitFor();
    expect(await first.getByLabel("Employee name", { exact: false }).inputValue()).toBe("Synthetic cross-window employee");
    expect(await first.getByLabel("Employee email", { exact: false }).inputValue()).toBe(email);
    expect(await first.getByLabel("Job title", { exact: false }).inputValue()).toBe("Synthetic access test");
    expect(await first.getByRole("checkbox", { name: seed.site_name, exact: true }).isChecked()).toBe(true);
    expect(await first.getByRole("button", { name: "Create employee invitation", exact: true }).isEnabled()).toBe(true);
    const other = await realGet<{ invitations: { email_address: string }[] }>(second, "/api/clinic/workforce/employments");
    expect(other.invitations.some((invitation) => invitation.email_address === email)).toBe(false);
    expect((await realMutation(second, "/api/clinic/context", { practice_id: seed.practice_id }, "PATCH")).status()).toBe(200);
    const restored = await realGet<{ invitations: { email_address: string }[] }>(second, "/api/clinic/workforce/employments");
    expect(restored.invitations).toEqual(baseline.invitations);
    expect(submissions).toHaveLength(1);
    expect(await first.getByText("Session locked", { exact: true }).count()).toBe(0);
  } finally {
    await context.close();
  }
}, 60000);
async function fixture(page: Page) {
  page.setDefaultTimeout(4000);
  const control = {
    changedPractice: false,
    contextInterrupted: false,
    mutationStatus: 200,
  };
  const contexts: (string | undefined)[] = [];
  const mutations: unknown[] = [];
  const sessionMethods: string[] = [];
  const issuedAt = Date.now();
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/clinic/context") {
      const expected = request.headers()["x-clinic-practice"];
      contexts.push(expected);
      if (control.contextInterrupted) {
        control.contextInterrupted = false;
        return route.fulfill({
          status: 503,
          json: { error: "Synthetic context interrupted" },
        });
      }
      if (control.changedPractice && expected === "81")
        return route.fulfill({
          status: 409,
          json: {
            error: "Synthetic clinic changed; reload deliberately.",
            code: "clinic_changed",
          },
        });
      const other = control.changedPractice;
      return route.fulfill({
        json: {
          user_id: 71,
          schema_version: "clinic-context-v1",
          policy_version: "clinic-authorization-v1",
          credentials: [],
          membership_id: 91,
          practice: {
            id: other ? 82 : 81,
            name: other
              ? "Other synthetic organization"
              : "Original synthetic organization",
            timezone: "UTC",
          },
          sites: [
            {
              id: other ? 201 : 101,
              code: "SITE",
              name: "Synthetic site",
              finalized: !other,
            },
          ],
          current_site: {
            id: other ? 201 : 101,
            code: "SITE",
            name: "Synthetic site",
          },
          capabilities: { patients: true, facilities_read: true },
          features: {
            configured: !other,
            finalized: !other,
            site_specialty_configured: !other,
          },
        },
      });
    }
    if (
      url.pathname === "/api/clinic/scheduling/appointments" &&
      request.method() === "POST"
    ) {
      mutations.push(request.postDataJSON());
      return route.fulfill({
        status: control.mutationStatus,
        json:
          control.mutationStatus === 401
            ? { error: "Please sign in." }
            : control.mutationStatus === 403
              ? { error: "Synthetic permission denied" }
              : {},
      });
    }
    if (url.pathname === "/api/session") sessionMethods.push(request.method());
    const now = await page.evaluate(() => Date.now());
    await route.fulfill({
      json:
        url.pathname === "/api/csrf"
          ? { csrf_token: "synthetic-token" }
          : url.pathname === "/api/session"
            ? {
                user: { id: 71 },
                clinic_access: { active: true, authorization_generation: 1 },
                session_policy: {
                  server_time: new Date(now).toISOString(),
                  idle_expires_at: new Date(issuedAt + 7200000).toISOString(),
                  absolute_expires_at: new Date(
                    issuedAt + 43200000,
                  ).toISOString(),
                  idle_timeout_seconds: 7200,
                },
              }
            : { patients: [] },
    });
  });
  await page.goto(`${baseUrl}${encounterPath}`);
  await page.getByTestId("context").waitFor();
  return { control, contexts, mutations, sessionMethods };
}
it("#213 refuses a different practice after conflict and context retry", async () => {
  const page = await browser.newPage();
  try {
    page.on("pageerror", (error) =>
      console.log("Fixture page error:", error.message),
    );
    const { control, contexts } = await fixture(page);
    control.changedPractice = true;
    await page
      .getByRole("button", { name: "Refresh context", exact: true })
      .click();
    await expect.poll(() => contexts.length).toBeGreaterThanOrEqual(2);
    expect(contexts[1]).toBe("81");
    await page
      .getByRole("alert")
      .filter({ hasText: "Synthetic clinic changed" })
      .waitFor();
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect.poll(() => contexts.length).toBeGreaterThanOrEqual(3);
    expect(contexts[2]).toBe("81");
    await page
      .getByRole("alert")
      .filter({ hasText: "Synthetic clinic changed" })
      .waitFor();
    expect(await page.getByTestId("context").count()).toBe(0);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { navigationCalls: string[] }).navigationCalls,
      ),
    ).toEqual([]);
  } finally {
    await page.close();
  }
}, 12000);
it("#208 restores the same finalized site after interrupted context loading without setup navigation", async () => {
  const page = await browser.newPage();
  try {
    const { control, contexts } = await fixture(page);
    control.contextInterrupted = true;
    await page
      .getByRole("button", { name: "Refresh context", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Synthetic context interrupted" })
      .waitFor();
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page.getByTestId("context").waitFor();
    expect(
      JSON.parse((await page.getByTestId("context").textContent())!),
    ).toEqual({ practice: 81, site: 101 });
    expect(contexts.at(-1)).toBe("81");
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { navigationCalls: string[] }).navigationCalls,
      ),
    ).toEqual([]);
  } finally {
    await page.close();
  }
}, 12000);
it("#187 follows the provided idle deadline and preserves context through ordinary navigation", async () => {
  const page = await browser.newPage();
  try {
    await page.clock.install({ time: Date.now() });
    const { mutations } = await fixture(page);
    for (let i = 0; i < 6; i++) {
      await page
        .getByRole("button", { name: "Navigate ordinary work", exact: true })
        .click();
      expect(
        JSON.parse((await page.getByTestId("context").textContent())!),
      ).toEqual({ practice: 81, site: 101 });
    }
    await page.clock.fastForward(60000);
    expect(
      await page
        .getByRole("heading", { name: "Session locked", exact: true })
        .count(),
    ).toBe(0);
    await page.clock.fastForward(7200000);
    await page
      .getByRole("heading", { name: "Session locked", exact: true })
      .waitFor();
    expect(mutations).toEqual([]);
  } finally {
    await page.close();
  }
}, 15000);

it("#215 immediately locks a denied expired-session mutation without replaying it", async () => {
  const page = await browser.newPage();
  try {
    const { control, mutations } = await fixture(page);
    control.mutationStatus = 401;
    await page
      .getByRole("button", { name: "Synthetic protected submit", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Session locked", exact: true })
      .waitFor();
    expect(mutations).toEqual([{ request_key: "synthetic-request" }]);
    expect(
      await page
        .getByRole("button", { name: "Sign in again", exact: true })
        .count(),
    ).toBe(1);
  } finally {
    await page.close();
  }
}, 12000);
it("#215 permission denial remains visible without locking a valid session", async () => {
  const page = await browser.newPage();
  try {
    const { control, mutations } = await fixture(page);
    control.mutationStatus = 403;
    await page
      .getByRole("button", { name: "Synthetic protected submit", exact: true })
      .click();
    await page
      .getByText("Synthetic permission denied", { exact: true })
      .waitFor();
    expect(
      await page
        .getByRole("heading", { name: "Session locked", exact: true })
        .count(),
    ).toBe(0);
    expect(mutations).toHaveLength(1);
  } finally {
    await page.close();
  }
}, 12000);
