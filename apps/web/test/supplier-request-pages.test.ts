import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";
import type { InventorySupplierData } from "../src/features/inventory/inventoryContracts";

// Real component and API client; HTTP outcomes are controlled, not Rails.
const entry = `
import React, {useState} from "react";
import {createRoot} from "react-dom/client";
import {SupplierPricingScreen} from "/src/features/inventory/SupplierPricing";
import {api} from "/src/api/client";
function App() {
  const [data, setData] = useState(window.initialSupplierData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  return React.createElement(SupplierPricingScreen, {data, loading, error, readBlocked: false,
    onRead: async read => {
      setLoading(true); setError("");
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(read))
        if (value !== undefined) query.set(key, String(value));
      try { setData((await api("/api/clinic/inventory/supplier-pricing?" + query)).data); }
      catch (reason) { setError(reason.message); }
      finally { setLoading(false); }
    }});
}
createRoot(document.getElementById("root")).render(React.createElement(App));`;

function data(
  page = 1,
  status: "all" | "open" | "quoted" = "all",
): InventorySupplierData {
  return {
    schema_version: "inventory-wire-v1",
    dataset_version: "synthetic",
    data_version: 1,
    as_of: "2026-09-30T12:00:00Z",
    timezone: "UTC",
    practice: { id: 1, name: "Synthetic quote clinic", timezone: "UTC" },
    users: [],
    current_user_id: "1",
    configuration: { status: "configured", version: 1, reason: "Fixture" },
    capabilities: { supplier_pricing: true, "inventory.catalog": false },
    suppliers: [{ id: "1", name: "Synthetic supply" }],
    products: [],
    supplier_products: [
      {
        id: "10",
        supplier_id: "1",
        supplier_name: "Synthetic supply",
        product_id: "100",
        ndc: "12345678901",
        supplier_sku: "SYN-QUOTE",
        description: "Synthetic liquid",
        package_quantity: "99.0",
        wholesale_unit_cost: "12.0",
        currency: "USD",
        ordering_unit: "package",
        contract_status: "active",
        imported_at: "2026-09-29T12:00:00Z",
        updated_at: "2026-09-30T12:00:00Z",
        price_source: "price_sheet",
        quote_reference: null,
        quoted_on: null,
        eligible: true,
        eligibility_reason: null,
      },
    ],
    supplier_page: {
      query: "",
      supplier_id: null,
      page: 1,
      page_count: 2,
      page_size: 25,
      total_count: 30,
      filtered_count: 30,
    },
    quote_requests: [
      {
        id: page === 1 ? "26" : "1",
        supplier_product_id: "10",
        supplier_id: "1",
        supplier_name: "Synthetic supply",
        product_id: "100",
        product_name: "Synthetic liquid",
        requested_packages: "3.0",
        package_quantity_at_request: "0.125",
        stock_unit_at_request: "mL",
        note: page === 1 ? "SYN_NEWER_REQUEST" : "SYN_OLDER_REQUEST",
        status: status === "quoted" ? "quoted" : "open",
        request_key: "synthetic-key",
        created_at: "2026-09-29T12:00:00Z",
        quote_reference: null,
        quoted_on: null,
      },
    ],
    quote_request_page: {
      status,
      page,
      page_count: status === "quoted" ? 1 : 2,
      page_size: 25,
      total_count: 28,
      filtered_count: status === "quoted" ? 2 : status === "open" ? 26 : 28,
    },
  };
}

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
beforeAll(async () => {
  const virtualId = "\0supplier-requests-test-entry.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "supplier-request-test-entry",
        resolveId(id) {
          if (id === virtualId) return virtualId;
        },
        load(id) {
          if (id === virtualId) return entry;
        },
        configureServer(s) {
          s.middlewares.use("/supplier-test", async (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await s.transformIndexHtml(
                "/supplier-test",
                '<div id="root"></div><script type="module" src="/@id/__x00__supplier-requests-test-entry.tsx"></script>',
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
    throw new Error("Missing test server port");
  baseUrl = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    ...(process.env.BROWSER_EXECUTABLE_PATH
      ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH }
      : { channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" }),
    headless: true,
  });
}, 15000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

async function withScreen(
  initial: InventorySupplierData,
  respond: (query: URLSearchParams) => {
    status?: number;
    data?: InventorySupplierData;
    error?: string;
  },
  exercise: (page: Page, reads: URLSearchParams[]) => Promise<void>,
) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  page.setDefaultTimeout(5000);
  const errors: string[] = [];
  const reads: URLSearchParams[] = [];
  const methods: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((value) => {
    Object.assign(window, { initialSupplierData: value });
  }, initial);
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      methods.push(route.request().method());
      const url = new URL(route.request().url());
      if (url.pathname === "/api/csrf") {
        await route.fulfill({ json: { csrf_token: "synthetic-only" } });
        return;
      }
      expect(url.pathname).toBe("/api/clinic/inventory/supplier-pricing");
      reads.push(url.searchParams);
      const response = respond(url.searchParams);
      // Keep the read pending long enough to verify old rows disappear.
      await new Promise((resolve) => setTimeout(resolve, 100));
      await route.fulfill({
        status: response.status ?? 200,
        json: response.data
          ? { data: response.data }
          : { error: response.error },
      });
    },
  );
  try {
    await page.goto(baseUrl + "/supplier-test");
    await page
      .getByRole("heading", { name: "Quote requests", exact: true })
      .waitFor();
    await exercise(page, reads);
    expect(errors).toEqual([]);
    expect(methods.every((method) => method === "GET")).toBe(true);
  } finally {
    await page.close();
  }
}

describe("supplier request paging with controlled HTTP responses", () => {
  it("pages independently, displays filtered counts and retains exact request snapshots", async () => {
    await withScreen(
      data(),
      (query) => ({
        data: data(
          Number(query.get("quote_request_page")),
          query.get("quote_request_status") as "all" | "open" | "quoted",
        ),
      }),
      async (page, reads) => {
        const section = page.getByRole("region", {
          name: "Local quote requests",
        });
        await section
          .getByRole("button", { name: "Go to page 2", exact: true })
          .click();
        expect(await section.getByText("SYN_NEWER_REQUEST").count()).toBe(0);
        await section.getByText("SYN_OLDER_REQUEST").waitFor();
        expect(reads.at(-1)?.get("page")).toBe("1");
        expect(await section.textContent()).toContain(
          "28 matching requests (28 for this supplier view)",
        );
        expect(await section.textContent()).toContain("3.0 packages");
        expect(await section.textContent()).toContain(
          "Recorded package size: 0.125 mL per package",
        );
        expect(await section.textContent()).not.toContain(
          "99.0 mL per package",
        );
        await section
          .getByRole("combobox", { name: "Quote request status" })
          .click();
        await page
          .getByRole("option", { name: "Awaiting response", exact: true })
          .click();
        await section.getByText("SYN_NEWER_REQUEST").waitFor();
        expect(reads.at(-1)?.get("quote_request_page")).toBe("1");
        expect(reads.at(-1)?.get("quote_request_status")).toBe("open");
        expect(await section.textContent()).toContain(
          "26 matching requests (28 for this supplier view)",
        );
        await section
          .getByRole("button", { name: "Go to page 2", exact: true })
          .click();
        await section.getByText("SYN_OLDER_REQUEST").waitFor();
        await page
          .getByRole("button", {
            name: "Synthetic supply View imported offers",
          })
          .click();
        await section.getByText("SYN_NEWER_REQUEST").waitFor();
        expect(reads.at(-1)?.get("supplier_id")).toBe("1");
        expect(reads.at(-1)?.get("quote_request_page")).toBe("1");
        expect(reads.at(-1)?.get("page")).toBe("1");
        expect(reads.at(-1)?.get("quote_request_status")).toBe("open");
      },
    );
  }, 15000);

  it("hides stale rows and counts on failure, retries the attempted page and returns to first page", async () => {
    let fail = true;
    await withScreen(
      data(),
      (query) =>
        query.get("quote_request_page") === "2" && fail
          ? { status: 503, error: "Controlled page failure" }
          : { data: data(Number(query.get("quote_request_page"))) },
      async (page, reads) => {
        const section = page.getByRole("region", {
          name: "Local quote requests",
        });
        await section
          .getByRole("button", { name: "Go to page 2", exact: true })
          .click();
        await section
          .getByRole("button", { name: "Retry", exact: true })
          .waitFor();
        expect(await section.textContent()).not.toMatch(
          /SYN_NEWER_REQUEST|SYN_OLDER_REQUEST|matching requests|No quote requests/,
        );
        fail = false;
        await section
          .getByRole("button", { name: "Retry", exact: true })
          .click();
        await section.getByText("SYN_OLDER_REQUEST").waitFor();
        expect(reads.at(-1)?.get("quote_request_page")).toBe("2");
        await section
          .getByRole("button", { name: "Go to page 1", exact: true })
          .click();
        await section.getByText("SYN_NEWER_REQUEST").waitFor();
        fail = true;
        await section
          .getByRole("button", { name: "Go to page 2", exact: true })
          .click();
        await section
          .getByRole("button", { name: "Return to first quote request page" })
          .click();
        await section.getByText("SYN_NEWER_REQUEST").waitFor();
        expect(reads.at(-1)?.get("quote_request_page")).toBe("1");
      },
    );
  }, 15000);

  it("keeps mutation controls absent for a reader and distinguishes denied reads from confirmed empty", async () => {
    let denied = true;
    const empty = data();
    empty.quote_requests = [];
    empty.quote_request_page = {
      status: "all",
      page: 1,
      page_count: 1,
      page_size: 25,
      total_count: 0,
      filtered_count: 0,
    };
    await withScreen(
      data(),
      () =>
        denied
          ? { status: 403, error: "Supplier access revoked" }
          : { data: empty },
      async (page) => {
        const section = page.getByRole("region", {
          name: "Local quote requests",
        });
        expect(
          await section
            .getByRole("button", { name: "Record response" })
            .count(),
        ).toBe(0);
        expect(
          await page
            .getByRole("button", { name: "Request quote", exact: true })
            .count(),
        ).toBe(0);
        await section
          .getByRole("button", { name: "Go to page 2", exact: true })
          .click();
        await section
          .getByRole("button", { name: "Retry", exact: true })
          .waitFor();
        expect(await section.textContent()).toContain(
          "Supplier access revoked",
        );
        expect(await section.textContent()).not.toMatch(
          /SYN_NEWER_REQUEST|0 matching requests|No quote requests/,
        );
        denied = false;
        await section
          .getByRole("button", { name: "Retry", exact: true })
          .click();
        await section
          .getByText("No quote requests recorded for this view.")
          .waitFor();
        expect(await section.textContent()).toContain("0 matching requests");
        expect(await section.getByRole("navigation").count()).toBe(0);
      },
    );
  }, 15000);

  it("does not substitute the current offer quantity for a missing historical snapshot", async () => {
    const legacy = data();
    delete legacy.quote_request_page;
    legacy.quote_requests[0].package_quantity_at_request = null;
    legacy.quote_requests[0].stock_unit_at_request = null;
    await withScreen(
      legacy,
      () => {
        throw new Error("A legacy render must not issue a read");
      },
      async (page) => {
        const section = page.getByRole("region", {
          name: "Local quote requests",
        });
        await section.getByText("SYN_NEWER_REQUEST").waitFor();
        expect(await section.textContent()).toContain(
          "Package size not recorded",
        );
        expect(await section.textContent()).not.toContain("99.0");
        expect(await section.getByRole("combobox").count()).toBe(0);
        expect(await section.getByRole("navigation").count()).toBe(0);
      },
    );
  }, 15000);
});
