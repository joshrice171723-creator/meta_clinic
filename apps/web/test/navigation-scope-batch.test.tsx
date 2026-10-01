import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";
let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
const encounterPath = "/clinic/patients/71/encounters/72";
beforeAll(async () => {
  const id = "\0navigation-scope-batch.tsx";
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
          s.middlewares.use("/clinic", async (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await s.transformIndexHtml(
                encounterPath,
                '<div id="root"></div><script type="module" src="/@id/__x00__navigation-scope-batch.tsx"></script>',
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
async function fixture(page: Page, onlyEligible = false) {
  page.setDefaultTimeout(4000);
  const control = {
    changedPractice: false,
    contextInterrupted: false,
    mutationStatus: 200,
    siteId: 101,
    siteDenial: false,
  };
  const contexts: (string | undefined)[] = [];
  const mutations: unknown[] = [];
  const sessionMethods: string[] = [];
  const issuedAt = Date.now();
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (
      url.pathname === "/api/clinic/context" &&
      request.method() === "PATCH"
    ) {
      mutations.push(request.postDataJSON());
      if (control.siteDenial)
        return route.fulfill({
          status: 403,
          json: { error: "Synthetic location denied" },
        });
      control.siteId = request.postDataJSON().site_id;
      return route.fulfill({ json: { current_site: { id: control.siteId } } });
    }
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
            ...(onlyEligible
              ? []
              : [
                  {
                    id: 102,
                    code: "QAGT",
                    name: "QA Gate Test",
                    finalized: true,
                  },
                ]),
            {
              id: other ? 201 : control.siteId,
              code: "SITE",
              name: "Synthetic site",
              finalized: !other,
            },
          ],
          current_site: {
            id: other ? 201 : control.siteId,
            code: "SITE",
            name: control.siteId === 102 ? "QA Gate Test" : "Synthetic site",
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

it("#20 direct route entry and reload retain server-selected location without chooser", async () => {
  const page = await browser.newPage();
  try {
    const { mutations } = await fixture(page);
    await page.goto(`${baseUrl}/clinic/workforce/schedule`);
    await page.getByTestId("context").waitFor();
    expect(
      JSON.parse((await page.getByTestId("context").textContent())!),
    ).toEqual({ practice: 81, site: 101 });
    expect(
      await page.getByRole("dialog", { name: "Choose your location" }).count(),
    ).toBe(0);
    await page.reload();
    await page.getByTestId("context").waitFor();
    expect(mutations).toEqual([]);
  } finally {
    await page.close();
  }
});
it("#14 renders only server-eligible locations", async () => {
  const page = await browser.newPage();
  try {
    await fixture(page, true);
    expect(await page.getByText("QA Gate Test", { exact: true }).count()).toBe(
      0,
    );
    expect(await page.getByText("MAIN", { exact: true }).count()).toBe(0);
    expect(
      JSON.parse((await page.getByTestId("context").textContent())!).site,
    ).toBe(101);
  } finally {
    await page.close();
  }
});
it.each([false, true])(
  "#118 location switch denied=%s preserves session protections",
  async (denied) => {
    const page = await browser.newPage();
    try {
      const { control, mutations } = await fixture(page);
      control.siteDenial = denied;
      await page
        .getByRole("combobox", { name: "Location", exact: true })
        .click();
      await page
        .getByRole("option", { name: "QA Gate Test", exact: true })
        .click();
      if (denied)
        await page
          .getByText("Synthetic location denied", { exact: true })
          .waitFor();
      else
        await expect
          .poll(
            async () =>
              JSON.parse((await page.getByTestId("context").textContent())!)
                .site,
          )
          .toBe(102);
      expect(
        JSON.parse((await page.getByTestId("context").textContent())!).site,
      ).toBe(denied ? 101 : 102);
      expect(
        await page
          .getByRole("heading", { name: "Session locked", exact: true })
          .count(),
      ).toBe(0);
      expect(mutations).toEqual([{ site_id: 102 }]);
    } finally {
      await page.close();
    }
  },
);
