import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";
let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
beforeAll(async () => {
  const id = "\0login-selection-batch.tsx";
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
 const accounts=[{id:"employee-independent",label:"Independent synthetic team",account_type:"employee",destination:"/clinic",clinic:{id:82,name:"Omni Test Clinic"},locations:[{id:201,name:"Verify",code:"VERF"},{id:202,name:"QA Gate Test",code:"QAGT"}]},{id:"employee-synthetic",label:"Synthetic clinician",account_type:"employee",destination:"/clinic",organization:{id:1,name:"Synthetic organization"},clinic:{id:81,name:"Synthetic clinic"},locations:[{id:101,name:"Synthetic location",code:"SYN"}]},{id:"patient-synthetic",label:"Synthetic patient",account_type:"patient",destination:"/patient-portal"}];
 createRoot(document.getElementById("root")).render(React.createElement(Login,{developmentLogin:!new URLSearchParams(location.search).has("credentials"),developmentAccounts:accounts,environment:"test",businessDate:"2026-10-01"}));`;
        },
        configureServer(s) {
          s.middlewares.use("/login", async (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await s.transformIndexHtml(
                "/login",
                '<div id="root"></div><script type="module" src="/@id/__x00__login-selection-batch.tsx"></script>',
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
  deny = false,
) {
  page.setDefaultTimeout(4000);
  const writes: unknown[] = [];
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST") {
      const body = request.postDataJSON();
      writes.push(body);
      if (deny)
        return route.fulfill({
          status: 403,
          json: { error: "Synthetic sign-in denied" },
        });
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

it("#189 first fully scoped LOG IN sends one request without resetting selections", async () => {
  const page = await browser.newPage();
  try {
    const writes = await fixture(page, "/clinic");
    await clinicLogin(page);
    await page.waitForURL((url) => url.pathname === "/clinic");
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
});
it("#189 a denied LOG IN keeps original selections and error without redirect", async () => {
  const page = await browser.newPage();
  try {
    const writes = await fixture(page, "/clinic", false, true);
    await clinicLogin(page);
    await page.getByText("Synthetic sign-in denied", { exact: true }).waitFor();
    expect(new URL(page.url()).pathname).toBe("/login");
    expect(
      await page
        .getByRole("combobox", { name: "Organization", exact: true })
        .textContent(),
    ).toContain("Synthetic organization");
    expect(
      await page
        .getByRole("combobox", { name: "Location", exact: true })
        .textContent(),
    ).toContain("Synthetic location");
    expect(
      await page
        .getByRole("combobox", {
          name: "Select clinic team account",
          exact: true,
        })
        .textContent(),
    ).toContain("Synthetic clinician");
    expect(writes).toHaveLength(1);
  } finally {
    await page.close();
  }
});
it("#59 Independent clinics grouping exposes its own VERF and QAGT without mixing another clinic", async () => {
  const page = await browser.newPage();
  try {
    const writes = await fixture(page, "/clinic");
    await choose(page, "Organization", "Independent clinics · ID independent");
    await choose(page, "Clinic", "Omni Test Clinic · ID 82");
    await page.getByRole("combobox", { name: "Location", exact: true }).click();
    expect(
      await page
        .getByRole("option", { name: "Verify · ID 201", exact: true })
        .count(),
    ).toBe(1);
    expect(
      await page
        .getByRole("option", { name: "QA Gate Test · ID 202", exact: true })
        .count(),
    ).toBe(1);
    expect(
      await page
        .getByRole("option", {
          name: "Synthetic location · ID 101",
          exact: true,
        })
        .count(),
    ).toBe(0);
    await page.keyboard.press("Escape");
    await choose(page, "Location", "QA Gate Test · ID 202");
    await choose(
      page,
      "Select clinic team account",
      "Independent synthetic team",
    );
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/clinic");
    expect(writes).toEqual([
      {
        profile: "employee-independent",
        portal: "clinic",
        practice_id: "82",
        site_id: "202",
      },
    ]);
  } finally {
    await page.close();
  }
});
