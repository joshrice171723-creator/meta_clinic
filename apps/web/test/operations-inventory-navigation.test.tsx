import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright-core";
import { fileURLToPath } from "node:url";
import type { InventoryLocationData } from "../src/features/inventory/inventoryContracts";

let server: ViteDevServer;
let browser: Browser;
let base: string;
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {OperationsView} from '/src/features/clinic/Operations.tsx';
import {InventoryApp} from '/src/features/inventory/InventoryApp.tsx';
const clinic = {capabilities: {inventory_access: true}, low_stock: []};
createRoot(document.getElementById('root')).render(
  location.pathname === '/clinic/operations'
    ? React.createElement(OperationsView, {clinic})
    : React.createElement(InventoryApp, {path: location.pathname})
);
`;
const storage = {
  id: "901",
  name: "Synthetic storage cabinet",
  kind: "storage" as const,
  site_id: "4",
  parent_location_id: null,
  status: "active" as const,
  path: "Synthetic site / Synthetic storage cabinet",
  child_count: 0,
  stock_destination: true,
  areas: [],
};
const locations: InventoryLocationData = {
  schema_version: "inventory-wire-v1",
  dataset_version: "bulk_v3",
  data_version: 1,
  as_of: "2026-10-01T12:00:00Z",
  timezone: "UTC",
  practice: { id: 1, name: "Synthetic practice", timezone: "UTC" },
  users: [],
  current_user_id: "1",
  capabilities: {},
  configuration: {
    status: "configured",
    version: 1,
    reason: "Synthetic initial setup",
  },
  sites: [
    {
      id: 4,
      name: "Synthetic site",
      code: "SYN",
      status: "active",
      address_line1: null,
      address_line2: null,
      city: null,
      state: null,
      postal_code: null,
      country: "US",
    },
  ],
  location_page: {
    query: "",
    status: "all",
    page: 1,
    page_count: 1,
    page_size: 20,
    total_count: 1,
    filtered_count: 1,
  },
  locations: [storage],
  location_options: [storage],
};

beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "operations-inventory-navigation-fixture",
        resolveId: (id) =>
          id === "/qa-inventory-navigation.tsx"
            ? "\0qa-inventory-navigation"
            : undefined,
        load: (id) => (id === "\0qa-inventory-navigation" ? entry : undefined),
        configureServer(instance) {
          instance.middlewares.use((request, response, next) => {
            const pathname = new URL(request.url ?? "/", "http://fixture")
              .pathname;
            if (
              !["/clinic/operations", "/clinic/inventory/locations"].includes(
                pathname,
              )
            )
              return next();
            response.setHeader("Content-Type", "text/html");
            response.end(
              '<div id="root"></div><script type="module" src="/qa-inventory-navigation.tsx"></script>',
            );
          });
        },
      },
    ],
  });
  await server.listen();
  base = server.resolvedUrls!.local[0];
  await server.warmupRequest("/qa-inventory-navigation.tsx");
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

it("Muse106 Operations inventory locations link opens the actual storage screen", async () => {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const requests: { path: string; view: string | null; method: string }[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error")
      console.error("106 browser", message.text());
  });
  page.on("requestfailed", (request) =>
    console.error("106 request failed", request.url(), request.failure()),
  );
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      requests.push({
        path: url.pathname,
        view: url.searchParams.get("view"),
        method: request.method(),
      });
      if (url.pathname === "/api/csrf") {
        await route.fulfill({
          status: 200,
          json: { csrf_token: "synthetic-navigation-token" },
        });
        return;
      }
      await route.fulfill({
        status: url.pathname === "/api/clinic/inventory/locations" ? 200 : 404,
        contentType: "application/json",
        body: JSON.stringify({ data: locations }),
      });
    },
  );
  try {
    await page.goto(base + "clinic/operations");
    const link = page.getByRole("link", {
      name: "Inventory locations →",
      exact: true,
    });
    await link.waitFor();
    expect(await link.getAttribute("href")).toBe("/clinic/inventory/locations");
    await link.click();
    await page.waitForURL(base + "clinic/inventory/locations");
    await page
      .getByRole("heading", {
        name: "Inventory storage locations",
        exact: true,
      })
      .waitFor();
    expect(
      await page.getByLabel("Search locations", { exact: true }).isVisible(),
    ).toBe(true);
    expect(
      await page.getByText(storage.path, { exact: true }).isVisible(),
    ).toBe(true);
    expect(requests).toEqual([
      { path: "/api/csrf", view: null, method: "GET" },
      { path: "/api/clinic/inventory/locations", view: "tree", method: "GET" },
    ]);
    expect(errors).toEqual([]);
  } catch (error) {
    console.error(
      "106 diagnostic",
      JSON.stringify({
        url: page.url(),
        errors,
        requests,
        body: (await page.locator("body").innerText({ timeout: 1_000 })).slice(
          0,
          4_000,
        ),
      }),
    );
    throw error;
  } finally {
    await page.close();
  }
}, 20_000);
