import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";
import { readRealFixture } from "./support/authorizedRealStack";
let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
beforeAll(async () => {
  if (process.env.QA_REAL_BASE_URL) {
    const url = new URL(process.env.QA_REAL_BASE_URL);
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname))
      throw new Error("Access journey requires an isolated loopback runtime.");
    baseUrl = url.origin;
    browser = await chromium.launch({
      executablePath: process.env.BROWSER_EXECUTABLE_PATH || "/usr/bin/chromium",
      headless: true,
    });
    return;
  }
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
 createRoot(document.getElementById("root")).render(React.createElement(Login,{developmentLogin:!new URLSearchParams(location.search).has("credentials"),developmentAccounts:new URLSearchParams(location.search).has("noPatient")?accounts.filter(account=>account.account_type!=="patient"):accounts,environment:"test",businessDate:"2026-10-01"}));`;
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
  // Await the read-only fixture render before measuring the sign-in interaction.
  const warmPage = await browser.newPage();
  try {
    await fixture(warmPage, "/clinic");
    await warmPage
      .getByRole("combobox", { name: "Organization", exact: true })
      .waitFor();
  } finally {
    await warmPage.close();
  }
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

it.skipIf(!process.env.QA_REAL_BASE_URL)("#189/#118 actual App first scoped login and authorized location switch preserve the session", async () => {
  if (!process.env.QA_REAL_BASE_URL || process.env.QA_REAL_ISOLATED !== "1" || !process.env.QA_REAL_FIXTURE)
    throw new Error("This real-stack case requires the isolated access runtime and profile.");
  const seed = readRealFixture();
  const context = await browser.newContext();
  const page = await context.newPage();
  const writes: { body: Record<string, unknown>; status: number }[] = [];
  page.on("response", async (response) => {
    const request = response.request();
    if (new URL(response.url()).pathname === "/api/development_session" && request.method() === "POST")
      writes.push({ body: request.postDataJSON(), status: response.status() });
  });
  try {
    await page.goto(`${baseUrl}/login?next=%2Fclinic`);
    const configuration = await context.request.get(`${baseUrl}/api/csrf`);
    expect(configuration.status()).toBe(200);
    const account = (await configuration.json()).development_accounts.find(
      (candidate: { id: string }) => candidate.id === seed.profile,
    );
    expect(account?.clinic?.id).toBeTruthy();
    expect(account.clinic.id).toBe(seed.practice_id);
    expect(account.locations.length).toBeGreaterThan(0);
    const site = account.locations[0];
    await choose(page, "Organization", account.organization
      ? `${account.organization.name} · ID ${account.organization.id}`
      : "Independent clinics · ID independent");
    await choose(page, "Clinic", `${account.clinic.name} · ID ${account.clinic.id}`);
    await choose(page, "Location", `${site.name} · ID ${site.id}`);
    await choose(page, "Select clinic team account", account.label);
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/clinic", { timeout: 35000 });
    await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
    expect(writes).toEqual([{ body: {
      profile: account.id, portal: "clinic",
      practice_id: String(account.clinic.id), site_id: String(site.id),
    }, status: 201 }]);
    const readback = async (expectedSite = site.id) => {
      const session = await context.request.get(`${baseUrl}/api/session`);
      const clinic = await context.request.get(`${baseUrl}/api/clinic/context`);
      expect(session.status()).toBe(200);
      expect(clinic.status()).toBe(200);
      const actor = await session.json();
      const workspace = await clinic.json();
      expect(workspace.user_id).toBe(actor.user.id);
      expect(workspace.practice.id).toBe(account.clinic.id);
      expect(workspace.current_site.id).toBe(expectedSite);
      return actor.user.id;
    };
    const actorId = await readback();
    await page.reload();
    await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
    expect(new URL(page.url()).pathname).toBe("/clinic");
    expect(await readback()).toBe(actorId);
    expect(writes).toHaveLength(1);
    expect(await page.getByRole("combobox", { name: "Select clinic team account", exact: true }).count()).toBe(0);
    const switchResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/clinic/context" && response.request().method() === "PATCH",
    );
    await choose(page, "Location", seed.second_site_name);
    expect((await switchResponse).status()).toBe(200);
    await expect.poll(() => readback(seed.second_site_id)).toBe(actorId);
    const csrfResponse = await context.request.get(`${baseUrl}/api/csrf`);
    const csrf = (await csrfResponse.json()).csrf_token;
    const denied = await context.request.patch(`${baseUrl}/api/clinic/context`, {
      headers: { "X-CSRF-Token": csrf, Origin: baseUrl },
      data: { site_id: seed.foreign_site_id },
    });
    expect(denied.status()).toBe(404);
    expect(await readback(seed.second_site_id)).toBe(actorId);
    await page.reload();
    await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
    expect(await readback(seed.second_site_id)).toBe(actorId);
    expect(await page.getByText("Session locked", { exact: true }).count()).toBe(0);
    expect(writes).toHaveLength(1);
  } finally {
    await context.close();
  }
}, 60000);

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

it("#100 patient sign-in remains reachable without preview accounts and sends credentials to the patient destination", async () => {
  const page = await browser.newPage();
  const postPaths: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST")
      postPaths.push(new URL(request.url()).pathname);
  });
  try {
    await page.route(`${baseUrl}/patient-portal`, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<main><h1>Patient destination reached</h1></main>",
      }),
    );
    const writes = await fixture(page, "/clinic");
    await page.goto(`${baseUrl}/login?next=%2Fclinic&noPatient=1`);
    await page
      .getByRole("link", {
        name: "Sign in with patient portal account",
        exact: true,
      })
      .click();
    await page.waitForURL("**/login?next=%2Fpatient-portal");
    await page
      .getByRole("heading", { name: "Patient portal", exact: true })
      .waitFor();
    expect(
      await page
        .getByText("No patient accounts are available.", { exact: true })
        .count(),
    ).toBe(0);
    expect(
      await page
        .getByText(
          "Patients use the account activated from their clinic invitation.",
          { exact: true },
        )
        .isVisible(),
    ).toBe(true);
    await page
      .getByLabel(/^Email address/)
      .fill("synthetic-patient@example.invalid");
    await page
      .getByLabel(/^Password/)
      .fill("Synthetic-patient-password-123!");
    const signIn = page.getByRole("button", { name: "Sign in", exact: true });
    expect(await signIn.isEnabled()).toBe(true);
    await signIn.click();
    await page.waitForURL((url) => url.pathname === "/patient-portal");
    await page
      .getByRole("heading", {
        name: "Patient destination reached",
        exact: true,
      })
      .waitFor();
    expect(postPaths).toEqual(["/api/session"]);
    expect(writes).toEqual([
      {
        email_address: "synthetic-patient@example.invalid",
        password: "Synthetic-patient-password-123!",
      },
    ]);
  } finally {
    await page.close();
  }
}, 20000);
