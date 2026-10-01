import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";
let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
beforeAll(async () => {
  const id = "\0login-encounter-return.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "login-return-fixture",
        resolveId: (value) => (value === id ? id : undefined),
        load(value) {
          if (value === id)
            return `import React from "react";import {createRoot} from "react-dom/client";import {Login} from "/src/features/identity/Login";import {SessionGuard} from "/src/features/identity/SessionGuard";import {api} from "/src/api/client";
 const accounts=[{id:"employee-synthetic",label:"Synthetic clinician",account_type:"employee",destination:"/clinic",organization:{id:1,name:"Synthetic organization"},clinic:{id:81,name:"Synthetic clinic"},locations:[{id:101,name:"Synthetic location",code:"SYN"}]},{id:"patient-synthetic",label:"Synthetic patient",account_type:"patient",destination:"/patient-portal"}];
 function EncounterReturnProbe(){const [context,setContext]=React.useState(null);React.useEffect(()=>{api("/api/clinic/context").then(setContext);},[]);return React.createElement(React.Fragment,null,React.createElement("p",{"data-testid":"restored-scope"},context?JSON.stringify({practice:context.practice.id,site:context.current_site.id}):"Loading scope"),React.createElement("button",{onClick:()=>api("/api/clinic/scheduling/appointments",{method:"POST",body:{request_key:"synthetic-expired-session"}}).catch(()=>{})},"Synthetic protected submit"));}
 const login=React.createElement(Login,{developmentLogin:!new URLSearchParams(location.search).has("credentials"),developmentAccounts:accounts,environment:"test",businessDate:"2026-10-01"});
 createRoot(document.getElementById("root")).render(location.pathname==="/login"?login:React.createElement(SessionGuard,{expectedUserId:71},React.createElement(EncounterReturnProbe)));`;
        },
        configureServer(s) {
          s.middlewares.use(async (request, response, next) => {
            const path = new URL(request.url!, "http://localhost").pathname;
            if (
              path !== "/login" &&
              path !== "/clinic/patients/71/encounters/72"
            )
              return next();
            response.setHeader("Content-Type", "text/html");
            response.end(
              await s.transformIndexHtml(
                path,
                '<div id="root"></div><script type="module" src="/@id/__x00__login-encounter-return.tsx"></script>',
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
async function fixture(
  page: Page,
  next: string,
  credentials = false,
  lockEntry = false,
) {
  page.setDefaultTimeout(4000);
  const writes: unknown[] = [];
  let scope = { practice: 81, site: 101 };
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST") {
      const body = request.postDataJSON();
      writes.push(body);
      if (lockEntry && path === "/api/clinic/scheduling/appointments")
        return route.fulfill({
          status: 401,
          json: { error: "Synthetic expired session", code: "session_changed" },
        });
      if (lockEntry && path === "/api/development_session")
        scope = {
          practice: Number(body.practice_id),
          site: Number(body.site_id),
        };
      return route.fulfill({
        json: {
          user: { id: 71 },
          ...(path === "/api/development_session"
            ? {
                destination:
                  body.portal === "patient" ? "/patient-portal" : "/clinic",
              }
            : {}),
        },
      });
    }
    if (lockEntry && path === "/api/session") {
      const now = Date.now();
      return route.fulfill({
        json: {
          user: { id: 71 },
          clinic_access: { active: true, authorization_generation: 1 },
          session_policy: {
            server_time: new Date(now).toISOString(),
            idle_expires_at: new Date(now + 7200000).toISOString(),
            absolute_expires_at: new Date(now + 43200000).toISOString(),
            idle_timeout_seconds: 7200,
          },
        },
      });
    }
    if (lockEntry && path === "/api/clinic/context")
      return route.fulfill({
        json: {
          practice: { id: scope.practice },
          current_site: { id: scope.site },
        },
      });
    await route.fulfill({ json: { csrf_token: "synthetic-token" } });
  });
  await page.goto(
    lockEntry
      ? `${baseUrl}${next}`
      : `${baseUrl}/login?next=${encodeURIComponent(next)}${credentials ? "&credentials=1" : ""}`,
  );
  return writes;
}
async function choose(page: Page, label: string, name: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name, exact: true }).click();
}
async function clinicLogin(page: Page) {
  await choose(page, "Organization", "Synthetic organization · ID 1");
  await choose(page, "Clinic", "Synthetic clinic · ID 81");
  await choose(page, "Location", "Synthetic location · ID 101");
  await choose(page, "Select clinic team account", "Synthetic clinician");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
}
it("#193 clinic development sign-in resumes the allowed encounter return URL and original selected scope", async () => {
  const page = await browser.newPage();
  try {
    const next = "/clinic/patients/71/encounters/72?mode=previous";
    const writes = await fixture(page, next);
    await clinicLogin(page);
    await page.waitForURL(
      (url) =>
        url.pathname === "/clinic/patients/71/encounters/72" &&
        url.searchParams.get("mode") === "previous",
    );
    expect(writes).toEqual([
      {
        profile: "employee-synthetic",
        portal: "clinic",
        practice_id: "81",
        site_id: "101",
      },
    ]);
  } finally {
    await page.close();
  }
}, 12000);
it("#193 credential sign-in retains the existing allowed encounter return", async () => {
  const page = await browser.newPage();
  try {
    await fixture(page, "/clinic/patients/71/encounters/72", true);
    await page.getByLabel(/Email address/).fill("synthetic@example.invalid");
    await page.getByLabel(/^Password/).fill("Synthetic-test-only-value");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL(
      (url) => url.pathname === "/clinic/patients/71/encounters/72",
    );
  } finally {
    await page.close();
  }
}, 12000);
it("#193 explicit patient portal choice does not adopt a clinic encounter return URL", async () => {
  const page = await browser.newPage();
  try {
    await fixture(page, "/clinic/patients/71/encounters/72");
    await page.getByRole("button", { name: "Patient", exact: true }).click();
    await choose(page, "Select patient account", "Synthetic patient");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/patient-portal");
  } finally {
    await page.close();
  }
}, 12000);
it("#193 rejects an off-origin return without changing the selected clinic scope", async () => {
  const page = await browser.newPage();
  try {
    await fixture(page, "https://example.invalid/clinic/patients/71");
    await clinicLogin(page);
    await page.waitForURL((url) => url.pathname === "/clinic");
    expect(new URL(page.url()).origin).toBe(baseUrl);
  } finally {
    await page.close();
  }
}, 12000);

it("#193 actual session lock generates next and reauthentication restores encounter URL and scope", async () => {
  const page = await browser.newPage();
  try {
    const next = "/clinic/patients/71/encounters/72?mode=previous";
    const writes = await fixture(page, next, false, true);
    await expect
      .poll(() => page.getByTestId("restored-scope").textContent())
      .toBe(JSON.stringify({ practice: 81, site: 101 }));
    await page
      .getByRole("button", { name: "Synthetic protected submit", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Session locked", exact: true })
      .waitFor();
    expect(writes).toEqual([{ request_key: "synthetic-expired-session" }]);
    await page
      .getByRole("button", { name: "Sign in again", exact: true })
      .click();
    await page.waitForURL((url) => url.pathname === "/login");
    expect(new URL(page.url()).searchParams.get("next")).toBe(next);
    await clinicLogin(page);
    await page.waitForURL(
      (url) =>
        url.pathname === "/clinic/patients/71/encounters/72" &&
        url.searchParams.get("mode") === "previous",
    );
    await expect
      .poll(() => page.getByTestId("restored-scope").textContent())
      .toBe(JSON.stringify({ practice: 81, site: 101 }));
    expect(writes).toEqual([
      { request_key: "synthetic-expired-session" },
      {
        profile: "employee-synthetic",
        portal: "clinic",
        practice_id: "81",
        site_id: "101",
      },
    ]);
    expect(
      await page
        .getByRole("heading", { name: "Session locked", exact: true })
        .count(),
    ).toBe(0);
  } finally {
    await page.close();
  }
}, 15000);
