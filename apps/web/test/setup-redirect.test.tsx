import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright-core";
import { fileURLToPath } from "node:url";

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;

beforeAll(async () => {
  const virtualId = "\0setup-redirect.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "setup-redirect-fixture",
        enforce: "pre",
        resolveId(id, importer) {
          if (id === virtualId) return virtualId;
          if (importer?.endsWith("/Workspace.tsx")) {
            if (id === "../../shared/ui") return "\0setup-resource";
            if (id === "./clinicNavigation") return "\0setup-navigation";
            if (id === "./Appearance") return "\0setup-appearance";
            if (
              [
                "./ClinicFrame",
                "./PatientContextBar",
                "../scribe/ScribeRecordingProvider",
                "../telehealth/TelehealthSessionProvider",
                "../telehealth/TelehealthDock",
              ].includes(id)
            )
              return "\0setup-shell";
          }
        },
        load(id) {
          if (id === "\0setup-shell")
            return "export const ClinicFrame=({children})=>children;export const ScribeRecordingProvider=({children})=>children;export const TelehealthSessionProvider=({children})=>children;export const TelehealthDock=()=>null;export const PatientContextBar=()=>null;";
          if (id === "\0setup-resource")
            return 'export {Form} from "/src/shared/ui";export const useResource=(path)=>({data:path==="/api/clinic/context"?window.syntheticContext:null,refresh:()=>{}});export const LoadState=()=>null;';
          if (id === "\0setup-navigation")
            return 'const navigate=(path)=>window.testNavigate(path);export const clinicTarget=()=>"/clinic";export const useClinicNavigation=()=>({navigate});';
          if (id === "\0setup-appearance")
            return 'import React from "react";export const AppearanceContext=React.createContext({});export const ClinicAppearanceScope=({children})=>children;export const useClinicAppearance=()=>({});';
          if (id !== virtualId) return;
          return `import React from "react";
          import {createRoot} from "react-dom/client";
          import {Workspace} from "/src/features/clinic/Workspace";
          window.syntheticContext={credentials:[],user_id:1,schema_version:"clinic-context-v1",policy_version:"clinic-authorization-v1",practice:{id:1,name:"Synthetic clinic"},current_site:{id:2,name:"Synthetic draft location"},sites:[{id:1,name:"Synthetic ready location",finalized:true},{id:2,name:"Synthetic draft location",finalized:false}],features:{configured:false,finalized:false,site_specialty_configured:false},capabilities:{clinic_setup_write:!location.search.includes("reader")}};
          const initialContext=window.syntheticContext;
          function App() {
            const [tick,setTick]=React.useState(0);
            window.setTestContext=(loading)=>{window.syntheticContext=loading?null:initialContext;setTick(v=>v+1);};
            const [path,setPath]=React.useState("/clinic/refills");
            window.testNavigate=setPath;
            return React.createElement(Workspace,{user:{id:1,development_demo:new URLSearchParams(location.search).has("demo")},path},React.createElement("p",null,path==="/clinic/setup"?"Synthetic setup screen":path==="/clinic/workforce/employees"?"Synthetic employees screen":"Forbidden refill screen"));
          }
          createRoot(document.getElementById("root")).render(React.createElement(App));`;
        },
        configureServer(s) {
          s.middlewares.use("/setup-redirect", async (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await s.transformIndexHtml(
                "/setup-redirect",
                '<div id="root"></div><script type="module" src="/@id/__x00__setup-redirect.tsx"></script>',
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

it("#213 signs out from required setup through the actual session form and preserves the demo guard", async () => {
  const page = await browser.newPage();
  const deletes: { method: string; csrf: string | undefined }[] = [];
  await page.route("**/api/csrf", (route) =>
    route.fulfill({ json: { csrf_token: "synthetic-setup-signout-csrf" } }),
  );
  await page.route("**/api/session", (route) => {
    const request = route.request();
    deletes.push({ method: request.method(), csrf: request.headers()["x-csrf-token"] });
    return route.fulfill({ status: 200, json: {} });
  });
  await page.goto(`${baseUrl}/setup-redirect`);
  await page.getByText("Synthetic setup screen", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/login");
  expect(deletes).toEqual([{ method: "DELETE", csrf: "synthetic-setup-signout-csrf" }]);
  await page.goto(`${baseUrl}/setup-redirect?demo`);
  await page.getByText("Synthetic setup screen", { exact: true }).waitFor();
  expect(await page.getByRole("button", { name: "Sign out", exact: true }).count()).toBe(0);
  expect(deletes).toHaveLength(1);
  await page.close();
}, 20000);

it.each([false, true])(
  "keeps the refill setup-redirect explanation for mixed ready/draft locations (reader=%s)",
  async (reader) => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/setup-redirect${reader ? "?reader" : ""}`);
    await page.getByText("Synthetic setup screen", { exact: true }).waitFor();
    expect(
      await page.getByText("Forbidden refill screen", { exact: true }).count(),
    ).toBe(0);
    expect(await page.getByRole("alert").innerText()).toContain(
      "Refill requests are unavailable until setup is complete for Synthetic draft location. You were taken to Clinic Setup.",
    );
    expect(
      (await page.getByRole("alert").innerText()).includes(
        "Ask a clinic administrator",
      ),
    ).toBe(reader);
    expect(
      await page
        .getByRole("button", { name: "Choose another location" })
        .count(),
    ).toBe(1);
    await page.close();
  },
);

it("retains the redirect explanation across a loading refresh of the same incomplete site", async () => {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/setup-redirect`);
  await page.getByText("Synthetic setup screen", { exact: true }).waitFor();
  await page.evaluate(() => Reflect.get(window, "setTestContext")(true));
  await expect
    .poll(() =>
      page.getByText("Synthetic setup screen", { exact: true }).count(),
    )
    .toBe(0);
  await page.evaluate(() => Reflect.get(window, "setTestContext")(false));
  await page.getByText("Synthetic setup screen", { exact: true }).waitFor();
  expect(await page.getByText(/Refill requests are unavailable/).count()).toBe(
    1,
  );
  expect(
    await page.getByText("Forbidden refill screen", { exact: true }).count(),
  ).toBe(0);
  await page.close();
});

it("does not reuse a refill redirect reason after permitted Employees navigation and manual Setup", async () => {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/setup-redirect`);
  await page.getByText("Synthetic setup screen", { exact: true }).waitFor();
  await page.evaluate(() =>
    Reflect.get(window, "testNavigate")("/clinic/workforce/employees"),
  );
  await page.getByText("Synthetic employees screen", { exact: true }).waitFor();
  await page.evaluate(() =>
    Reflect.get(window, "testNavigate")("/clinic/setup"),
  );
  await page.getByText("Synthetic setup screen", { exact: true }).waitFor();
  expect(await page.getByText(/You were taken to Clinic Setup/).count()).toBe(
    0,
  );
  expect(
    await page.getByText("Forbidden refill screen", { exact: true }).count(),
  ).toBe(0);
  await page.close();
});
