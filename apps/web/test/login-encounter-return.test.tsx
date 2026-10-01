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
            return `import React from "react";import {createRoot} from "react-dom/client";import {Login} from "/src/features/identity/Login";
 const accounts=[{id:"employee-synthetic",label:"Synthetic clinician",account_type:"employee",destination:"/clinic",organization:{id:1,name:"Synthetic organization"},clinic:{id:81,name:"Synthetic clinic"},locations:[{id:101,name:"Synthetic location",code:"SYN"}]},{id:"patient-synthetic",label:"Synthetic patient",account_type:"patient",destination:"/patient-portal"}];
 createRoot(document.getElementById("root")).render(React.createElement(Login,{developmentLogin:!new URLSearchParams(location.search).has("credentials"),developmentAccounts:accounts,environment:"test",businessDate:"2026-10-01"}));`;
        },
        configureServer(s) {
          s.middlewares.use("/login", async (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await s.transformIndexHtml(
                "/login",
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
async function fixture(page: Page, next: string, credentials = false) {
  page.setDefaultTimeout(4000);
  const writes: unknown[] = [];
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST") {
      const body = request.postDataJSON();
      writes.push(body);
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
    await route.fulfill({ json: { csrf_token: "synthetic-token" } });
  });
  await page.goto(
    `${baseUrl}/login?next=${encodeURIComponent(next)}${credentials ? "&credentials=1" : ""}`,
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
