import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const historicalNotice =
  "This lesson restarted in another demo session. Choose it again to start fresh.";
const titles = [
  "Primary care: complete a follow-up visit",
  "Weight management: complete a follow-up visit",
];
const lessons = titles.map((title, index) => ({
  id: index ? "weight_management__follow_up" : "primary_care__follow_up",
  title,
  description: "Synthetic retained lesson description.",
  role: "clinician",
  prepared: [],
  status: "available",
}));
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { LaunchLayout } from '/src/App.tsx';
import { Login } from '/src/features/identity/Login.tsx';
import { DemoJourney } from '/src/features/demo/DemoJourney.tsx';
import { MetaClinicMarketing } from '/src/features/marketing/MetaClinicMarketing.tsx';
import { GrowthMarketingPage } from '/src/features/marketing/GrowthMarketingPage.tsx';
const page = location.pathname === '/' ? React.createElement(MetaClinicMarketing)
 : location.pathname === '/meta-clinic/demo' ? React.createElement(GrowthMarketingPage, { path: location.pathname })
 : location.pathname === '/demo' ? React.createElement(DemoJourney)
 : React.createElement(LaunchLayout, { user: null, environment: 'test' },
   React.createElement(Login, { developmentLogin: true, ownerPinRequired: true, environment: 'test' }));
createRoot(document.getElementById('root')).render(page);
`;
let server: ViteDevServer;
let browser: Browser;
let base: string;
beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root,
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "synthetic-public-entry",
        enforce: "pre",
        resolveId(source) {
          if (source === "/qa-public-entry.tsx") return "\0qa-public-entry";
        },
        load(id) {
          if (id === "\0qa-public-entry") return entry;
        },
        transform(code, id) {
          if (id.endsWith("/src/App.tsx"))
            return code + "\nexport { LaunchLayout };";
        },
        configureServer(vite) {
          vite.middlewares.use((request, response, next) => {
            const path = request.url?.split("?")[0];
            if (
              ["/", "/login", "/demo", "/meta-clinic/demo"].includes(path || "")
            ) {
              response.setHeader("Content-Type", "text/html");
              response.end(
                '<div id="root"></div><script type="module" src="/qa-public-entry.tsx"></script>',
              );
            } else next();
          });
        },
      },
    ],
  });
  await server.listen();
  base = server.resolvedUrls!.local[0];
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  // Await the read-only fixture render before measuring destination navigation.
  const warmPage = await open("/login");
  try {
    await warmPage
      .getByRole("link", {
        name: "Sign in with clinic team account",
        exact: true,
      })
      .waitFor();
  } finally {
    await warmPage.close();
  }
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});
async function open(path: string): Promise<Page> {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    (route) => {
      const path = new URL(route.request().url()).pathname;
      const body = path.endsWith("/csrf")
        ? { csrf_token: "synthetic-only" }
        : {
            active: false,
            visitor_registered: true,
            lessons,
            notice: historicalNotice,
          };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    },
  );
  await page.goto(base.replace(/\/$/, "") + path);
  return page;
}
it("Muse257 describes both credential types and preserves distinct sign-in destinations", async () => {
  const page = await open("/login");
  const clinic = page.getByRole("link", {
    name: "Sign in with clinic team account",
    exact: true,
  });
  await clinic.waitFor();
  expect(await page.locator(".login-development-tools").innerText()).toContain(
    "Use the email and password for your owner or clinic team account.",
  );
  await clinic.click();
  await page.waitForURL("**/login?credentials=1&next=%2Fclinic");
  await page.getByRole("heading", { name: /Clinic team/ }).waitFor();
  await page.goto(base.replace(/\/$/, "") + "/login");
  await page
    .getByRole("link", { name: "Sign in with owner account", exact: true })
    .click();
  await page.waitForURL("**/login?credentials=1&next=%2Fowner");
  await page.getByRole("heading", { name: /Owner/ }).waitFor();
  await page.close();
});
it("Muse258 current public footer has a working sign-in link and none of the reported dead controls", async () => {
  const page = await open("/login");
  const footer = page.getByRole("contentinfo");
  await footer.waitFor();
  for (const name of [
    "Our approach",
    "Services",
    "Pricing",
    "FAQs",
    "Contact",
  ]) {
    expect(
      await footer.getByRole("button", { name, exact: true }).count(),
    ).toBe(0);
  }
  await footer.getByRole("link", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/login");
  await page
    .getByRole("heading", { name: /Streamline your practice/ })
    .waitFor();
  await page.close();
});
it("Muse252 translates the historical reset notice and preserves the shared sandbox warning", async () => {
  const page = await open("/demo");
  await page.getByRole("heading", { name: "Explore the clinic" }).waitFor();
  expect(await page.getByRole("alert").innerText()).toBe(
    "This clinic was reset in another session. Open Sandbox to continue.",
  );
  expect(await page.locator("body").innerText()).not.toContain(
    historicalNotice,
  );
  expect(
    await page
      .getByText("Sandbox · A simulated clinic shared with other visitors.", {
        exact: true,
      })
      .isVisible(),
  ).toBe(true);
  await page.close();
});
it("Muse253 exposes one named Sandbox action and no hidden lesson actions in the accessibility tree", async () => {
  const page = await open("/demo");
  const sandbox = page.getByRole("button", {
    name: "Open Sandbox",
    exact: true,
  });
  await sandbox.waitFor();
  expect(await page.getByRole("button").count()).toBe(1);
  const snapshot = await page.locator("main").ariaSnapshot();
  expect(snapshot).toContain('button "Open Sandbox"');
  for (const title of titles) expect(snapshot).not.toContain(title);
  const request = page.waitForRequest((request) =>
    new URL(request.url()).pathname.endsWith("/demo/lesson"),
  );
  await sandbox.click();
  expect((await request).postDataJSON()).toMatchObject({
    lesson_key: "sandbox",
  });
  await page.close();
});
it("Muse254 keeps historical lesson cards hidden even when returned by the server", async () => {
  const page = await open("/demo");
  await page
    .getByRole("button", { name: "Open Sandbox", exact: true })
    .waitFor();
  for (const title of titles)
    expect(await page.getByText(title, { exact: true }).count()).toBe(0);
  expect(
    await page
      .getByText("Or choose a guided demo", { exact: true })
      .isVisible(),
  ).toBe(false);
  await page.close();
});
it("Muse103 actual marketing home leads to the visitor demo without authenticating", async () => {
  const page = await open("/");
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname.startsWith("/api/") &&
      request.method() !== "GET"
    ) {
      mutations.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
  });
  const entry = page.locator(".meta-marketing__hero").getByRole("link", {
    name: "Explore the demo",
    exact: true,
  });
  await entry.waitFor();
  expect(await entry.isVisible()).toBe(true);
  expect(await entry.getAttribute("href")).toBe("/meta-clinic/demo");
  await entry.click();
  await page.waitForURL("**/meta-clinic/demo");
  const productDemo = page.locator(".growth-core__hero").getByRole("link", {
    name: "Open the guided demo",
    exact: true,
  });
  await productDemo.waitFor();
  expect(await productDemo.getAttribute("href")).toBe("/demo");
  await productDemo.click();
  await page.waitForURL("**/demo");
  await page
    .getByRole("heading", { name: "Explore the clinic", exact: true })
    .waitFor();
  expect(
    await page
      .getByRole("button", { name: "Open Sandbox", exact: true })
      .isVisible(),
  ).toBe(true);
  expect(await page.getByLabel("Password", { exact: false }).count()).toBe(0);
  expect(mutations).toEqual([]);
  await page.reload();
  await page
    .getByRole("heading", { name: "Explore the clinic", exact: true })
    .waitFor();
  expect(new URL(page.url()).pathname).toBe("/demo");
  expect(mutations).toEqual([]);
  await page.close();
}, 20_000);
