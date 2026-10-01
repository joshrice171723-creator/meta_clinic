import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright-core";
import { fileURLToPath } from "node:url";
import type {
  InventoryData,
  InventoryCatalogData,
  InventoryDeliveryData,
  InventoryLocationData,
} from "../src/features/inventory/inventoryContracts";

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
              ![
                "/clinic/operations",
                "/clinic/inventory",
                "/clinic/inventory/locations",
                "/clinic/inventory/receiving",
              ].includes(pathname)
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

function catalogFixture(): InventoryCatalogData {
  return {
    schema_version: "inventory-wire-v1",
    dataset_version: "bulk_v3",
    data_version: 1,
    as_of: "2026-09-05T12:00:00Z",
    timezone: "America/Chicago",
    practice: { id: 1, name: "Catalog fixture", timezone: "America/Chicago" },
    users: [],
    current_user_id: "1",
    capabilities: {},
    configuration: { status: "configured", version: 1, reason: "Fixture" },
    catalog_page: {
      query: "",
      status: "all",
      sort: "name",
      page: 2,
      page_count: 3,
      page_size: 20,
      total_count: 45,
      filtered_count: 45,
    },
    products: [
      {
        id: "21",
        name: "Catalog fixture liquid",
        schedule: null,
        preferred_supplier: null,
        category: "medication",
        ndc: "",
        device_identifier: "",
        active: true,
        package_id: "pkg_21",
        base_unit: "mL",
        units_per_package: "1.25",
        reorder_point_units: "1",
        available_units: "2.5",
        on_hand_units: "2.5",
        low_stock: false,
      },
    ],
    packages: [],
    can_create_purchase_order: true,
    attention_count: 25,
    first_run: {
      supplier: false,
      product: true,
      offer: false,
      purchase_order: false,
      received: false,
      binned: false,
      supplier_id: null,
      product_id: "21",
      product_name: "Catalog fixture liquid",
      purchase_order_id: null,
      purchase_order_status: null,
      shipment_id: null,
    },
    attention: [
      {
        id: "1",
        product_id: "21",
        product_name: "Catalog fixture liquid",
        lot_number: "HELD-FIXTURE",
        expiration_date: "2099-01-01",
        status: "quarantined",
      },
    ],
  };
}

function receivingFixture(): InventoryDeliveryData {
  const data: InventoryData = {
    schema_version: "1",
    dataset_version: "fixture",
    data_version: 1,
    as_of: "2026-09-05T12:00:00Z",
    timezone: "UTC",
    practice: { id: 1, name: "Fixture clinic", timezone: "UTC" },
    users: [],
    current_user_id: "1",
    capabilities: { "inventory.receive": true },
    products: [
      {
        id: "1",
        name: "Fixture liquid",
        category: "medication",
        active: true,
        ndc: "",
        device_identifier: "",
        schedule: null,
        package_id: "pkg",
        base_unit: "mL",
        units_per_package: "10.5",
        reorder_point_units: "0",
        preferred_supplier: null,
        available_units: "0",
        on_hand_units: "0",
        low_stock: false,
      },
    ],
    packages: [
      {
        id: "pkg",
        product_id: "1",
        description: "Catalog 10.5 mL",
        input_unit: "package",
        units_per_package: "10.5",
      },
    ],
    locations: [
      {
        id: "1",
        name: "Shelf",
        kind: "storage",
        areas: [],
        site_id: null,
        parent_location_id: null,
        status: "active",
        path: "Shelf",
        child_count: 0,
        stock_destination: true,
      },
    ],
    lots: [],
    balances: [],
    movements: [],
    receipts: [],
    recalls: [],
    controlled_reconciliations: [],
    audit_events: [],
    purchase_orders: [
      {
        id: "po",
        number: "Fixture PO",
        status: "sent",
        supplier: null,
        destination: "Shelf",
        created_at: "2026-09-05T12:00:00Z",
        subtotal: "3",
        tax: "0",
        shipping: "0",
        total: "3",
        lines: [
          {
            id: "line",
            product_id: "1",
            package_id: "pkg",
            ordered_packages: "3",
            units_per_package: "7.25",
            ordered_units: "21.75",
            package_price: "1",
            currency: "USD",
            received_units: "0",
            received_packages: "0",
          },
        ],
      },
    ],
    shipments: [
      {
        id: "shipment",
        po_id: "po",
        supplier_reference: "Fixture delivery",
        status: "delivered",
        package_count: 2,
        delivered_at: "2026-09-05T12:00:00Z",
        expected_units: "14.5",
        allocations: [
          { purchase_order_line_id: "line", expected_packages: "2" },
        ],
      },
    ],
  };
  return {
    ...data,
    locations: [],
    configuration: {
      status: "configured",
      version: 1,
      reason: "Synthetic fixture",
    },
    delivery_page: {
      query: "",
      status: "all",
      page: 1,
      page_count: 1,
      page_size: 20,
      total_count: 1,
      filtered_count: 1,
      selected_shipment_id: "shipment",
    },
    delivery_options: [
      {
        id: "shipment",
        supplier_reference: "Fixture delivery",
        order_number: "Fixture PO",
        supplier_name: null,
        status: "delivered",
      },
    ],
  };
}

it("Muse156 unfinished bin step opens the actual receiving screen even when earlier guide steps remain", async () => {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const catalog = catalogFixture();
  catalog.first_run.shipment_id = "shipment";
  const receiving = receivingFixture();
  const unexpected: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      const body =
        path === "/api/csrf"
          ? { csrf_token: "synthetic-inventory-proof" }
          : path === "/api/clinic/inventory/catalog"
            ? { data: catalog }
            : path === "/api/clinic/inventory/receiving"
              ? { data: receiving }
              : undefined;
      if (!body) unexpected.push(path);
      await route.fulfill({
        status: body ? 200 : 500,
        json: body ?? { error: "Unexpected synthetic request" },
      });
    },
  );
  try {
    await page.goto(base + "clinic/inventory");
    await page
      .getByRole("heading", { name: "First inventory run", exact: true })
      .waitFor();
    expect(
      await page.getByText("Next: Add a supplier", { exact: true }).count(),
    ).toBe(1);
    const link = page.getByRole("link", {
      name: "Continue to Put stock in a bin →",
      exact: true,
    });
    expect(await link.getAttribute("href")).toBe(
      "/clinic/inventory/receiving?shipment_id=shipment&delivery_status=all&wizard=1",
    );
    await link.click();
    await page.waitForURL(
      base +
        "clinic/inventory/receiving?shipment_id=shipment&delivery_status=all&wizard=1",
    );
    await page
      .getByRole("heading", { name: "Receive & put away", exact: true })
      .waitFor();
    expect(
      await page.getByLabel("Destination", { exact: true }).isVisible(),
    ).toBe(true);
    expect(
      await page
        .getByRole("button", { name: "Confirm receipt", exact: true })
        .isDisabled(),
    ).toBe(true);
    expect(errors).toEqual([]);
    expect(unexpected).toEqual([]);
  } finally {
    await page.close();
  }
}, 20_000);

it("Muse102 receiving exposes native leaf creation and posts a receipt to that exact destination", async () => {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const receiving = receivingFixture();
  const locationData: InventoryLocationData = structuredClone(locations);
  locationData.capabilities = { "inventory.configure": true };
  locationData.locations = [];
  locationData.location_options = [];
  locationData.location_page.total_count =
    locationData.location_page.filtered_count = 0;
  const posts: { path: string; body: any }[] = [];
  const errors: string[] = [];
  const unexpected: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      let body: unknown;
      if (request.method() === "POST") {
        const input = request.postDataJSON();
        posts.push({ path, body: input });
        if (path === "/api/clinic/inventory/locations") {
          const created = {
            ...storage,
            name: input.location.name,
            path: input.location.name,
            site_id: input.location.site_id,
            parent_location_id: input.location.parent_location_id,
          };
          locationData.locations = locationData.location_options = [created];
          locationData.location_page.total_count =
            locationData.location_page.filtered_count = 1;
          receiving.locations = [created];
          body = { acknowledged: true };
        } else if (path === "/api/clinic/inventory/receipts")
          body = { acknowledged: true };
      } else
        body =
          path === "/api/csrf"
            ? { csrf_token: "synthetic-inventory-proof" }
            : path === "/api/clinic/inventory/locations"
              ? { data: locationData }
              : path === "/api/clinic/inventory/receiving"
                ? { data: receiving }
                : path === "/api/clinic/inventory/lots"
                  ? { data: { lot: null, recalls: [] } }
                  : undefined;
      if (!body) unexpected.push(request.method() + " " + path);
      await route.fulfill({
        status: body ? 200 : 500,
        json: body ?? { error: "Unexpected synthetic request" },
      });
    },
  );
  try {
    await page.goto(
      base +
        "clinic/inventory/receiving?shipment_id=shipment&delivery_status=all",
    );
    await page
      .getByText("Create an active leaf location before receiving stock.", {
        exact: false,
      })
      .waitFor();
    expect(
      await page
        .getByLabel("Destination", { exact: true })
        .locator("option")
        .count(),
    ).toBe(0);
    expect(
      await page
        .getByRole("button", { name: "Confirm receipt", exact: true })
        .isDisabled(),
    ).toBe(true);
    await page
      .getByRole("link", { name: "Manage storage locations", exact: true })
      .click();
    await page.waitForURL(
      base + "clinic/inventory/locations?return_to=/clinic/inventory/receiving",
    );
    await page
      .getByRole("textbox", { name: /^Location name/ })
      .fill("Synthetic new leaf bin");
    await page.getByRole("combobox", { name: "Facility", exact: true }).click();
    await page
      .getByRole("option", { name: "Synthetic site · active", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Add location", exact: true })
      .click();
    await page.getByText("Location created.", { exact: true }).waitFor();
    expect(posts[0].path).toBe("/api/clinic/inventory/locations");
    expect(posts[0].body.location).toMatchObject({
      name: "Synthetic new leaf bin",
      kind: "storage",
      site_id: "4",
      parent_location_id: null,
      status: "active",
    });
    await page.getByRole("link", { name: "← Back", exact: true }).click();
    await page.waitForURL(base + "clinic/inventory/receiving");
    const destination = page.getByLabel("Destination", { exact: true });
    await destination.waitFor();
    expect(await destination.inputValue()).toBe("901");
    expect(await destination.locator("option").innerText()).toBe(
      "Synthetic new leaf bin",
    );
    await page.getByLabel("Lot number", { exact: true }).fill("SYN-102-LOT");
    await page.getByLabel("Expiration", { exact: true }).fill("2099-01-01");
    await page
      .getByLabel("Reason", { exact: true })
      .fill("Synthetic received delivery");
    const confirm = page.getByRole("button", {
      name: "Confirm receipt",
      exact: true,
    });
    await expect
      .poll(async () => confirm.isDisabled(), { timeout: 5_000 })
      .toBe(false);
    await confirm.click();
    await page
      .getByRole("dialog", { name: "Confirm inventory action", exact: true })
      .getByRole("button", { name: "Confirm action", exact: true })
      .click();
    await page.getByText("Receipt recorded", { exact: true }).waitFor();
    expect(posts).toHaveLength(2);
    expect(posts[1].path).toBe("/api/clinic/inventory/receipts");
    expect(posts[1].body.receipt).toMatchObject({
      purchase_order_id: "po",
      shipment_id: "shipment",
      purchase_order_line_id: "line",
      destination_location_id: "901",
      lot_number: "SYN-102-LOT",
      quantity_packages: "2",
    });
    expect(posts[1].body.receipt.request_key).toMatch(/^[0-9a-f-]{36}$/i);
    expect(unexpected).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}, 20_000);
