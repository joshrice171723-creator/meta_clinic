import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;

beforeAll(async () => {
  const virtualId = "\0setup-location-picker.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "setup-location-picker-fixture",
        resolveId: (id) => (id === virtualId ? virtualId : undefined),
        load(id) {
          if (id !== virtualId) return;
          return `import React from "react";
          import {createRoot} from "react-dom/client";
          import {Workspace,useClinic} from "/src/features/clinic/Workspace";
          function Setup() {
            const context = useClinic();
            return React.createElement("div",{"data-testid":"setup-context"},JSON.stringify({site:context.current_site,capabilities:context.capabilities}));
          }
          createRoot(document.getElementById("root")).render(React.createElement(Workspace,{user:{id:71},path:"/clinic/setup"},React.createElement(Setup)));`;
        },
        configureServer(s) {
          s.middlewares.use(
            "/setup-location-picker",
            async (_request, response) => {
              response.setHeader("Content-Type", "text/html");
              response.end(
                await s.transformIndexHtml(
                  "/setup-location-picker",
                  '<div id="root"></div><script type="module" src="/@id/__x00__setup-location-picker.tsx"></script>',
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

async function fixture(page: Page, deny = false) {
  page.setDefaultTimeout(4000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const sites = [
    { id: 101, code: "FIRST", name: "Synthetic first site", finalized: false },
    {
      id: 102,
      code: "SECOND",
      name: "Synthetic second site",
      finalized: false,
    },
  ];
  const context = {
    user_id: 71,
    schema_version: "clinic-context-v1",
    policy_version: "clinic-authorization-v1",
    practice: { id: 81, name: "Synthetic clinic" },
    sites,
    current_site: sites[0],
    capabilities: { clinic_setup_write: true, facilities_read: true },
    features: {
      configured: false,
      finalized: false,
      site_specialty_configured: false,
    },
  };
  const writes: unknown[] = [];
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/clinic/context" && request.method() === "PATCH") {
      writes.push(request.postDataJSON());
      if (deny)
        return route.fulfill({
          status: 403,
          json: { error: "Not authorized for this location." },
        });
      context.current_site = sites[1];
    }
    const json =
      path === "/api/csrf"
        ? { csrf_token: "synthetic-token" }
        : path === "/api/clinic/context"
          ? context
          : {};
    await route.fulfill({ json });
  });
  await page.goto(`${baseUrl}/setup-location-picker`);
  try {
    await page
      .getByRole("button", { name: "Choose another location" })
      .waitFor();
  } catch (error) {
    throw new Error(
      JSON.stringify({ errors, body: await page.locator("body").innerText() }),
      { cause: error },
    );
  }
  return { context, writes };
}

it("opens with an existing site, supports back/Escape/current-site selection without changing context", async () => {
  const page = await browser.newPage();
  try {
    const { context, writes } = await fixture(page);
    const original = await page.getByTestId("setup-context").textContent();
    const open = () =>
      page.getByRole("button", { name: "Choose another location" }).click();
    await open();
    const dialog = page.getByRole("dialog", { name: "Choose your location" });
    await dialog.waitFor();
    await dialog
      .getByRole("button", { name: "Back to current location" })
      .click();
    expect(await page.getByTestId("setup-context").textContent()).toBe(
      original,
    );
    await open();
    await page.keyboard.press("Escape");
    await page.getByTestId("setup-context").waitFor();
    await open();
    await dialog
      .getByRole("button", { name: "Synthetic first site", exact: true })
      .click();
    await page.getByTestId("setup-context").waitFor();
    expect(await page.getByTestId("setup-context").textContent()).toBe(
      original,
    );
    expect(context.current_site.id).toBe(101);
    expect(writes).toEqual([]);
  } finally {
    await page.close();
  }
});

it("changes site only through the existing explicit PATCH and refreshed context", async () => {
  const page = await browser.newPage();
  try {
    const { context, writes } = await fixture(page);
    await page.getByRole("button", { name: "Choose another location" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Synthetic second site", exact: true })
      .click();
    await page
      .getByTestId("setup-context")
      .filter({ hasText: '"id":102' })
      .waitFor();
    expect(writes).toEqual([{ site_id: 102 }]);
    expect(
      JSON.parse((await page.getByTestId("setup-context").textContent())!)
        .capabilities,
    ).toEqual(context.capabilities);
  } finally {
    await page.close();
  }
});

it("keeps the picker and original context on denied selection, then permits back", async () => {
  const page = await browser.newPage();
  try {
    const { context, writes } = await fixture(page, true);
    const original = await page.getByTestId("setup-context").textContent();
    await page.getByRole("button", { name: "Choose another location" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Synthetic second site", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Not authorized" })
      .waitFor();
    await page
      .getByRole("button", { name: "Back to current location" })
      .click();
    expect(await page.getByTestId("setup-context").textContent()).toBe(
      original,
    );
    expect(context.current_site.id).toBe(101);
    expect(writes).toEqual([{ site_id: 102 }]);
  } finally {
    await page.close();
  }
});
