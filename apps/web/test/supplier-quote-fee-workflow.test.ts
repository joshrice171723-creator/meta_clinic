import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";
import type { InventorySupplierData } from "../src/features/inventory/inventoryContracts";

// Mounted production quote form; synthetic HTTP only, no Rails/provider claims.
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
  respond: (
    query: URLSearchParams,
    method: string,
    body: any,
  ) => {
    status?: number;
    data?: InventorySupplierData;
    error?: string;
    acknowledged?: boolean;
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
      expect([
        "/api/clinic/inventory/supplier-pricing",
        "/api/clinic/inventory/supplier-products/10/manual-quote",
      ]).toContain(url.pathname);
      reads.push(url.searchParams);
      const response = respond(
        url.searchParams,
        route.request().method(),
        route.request().postDataJSON(),
      );
      // Keep the read pending long enough to verify old rows disappear.
      await new Promise((resolve) => setTimeout(resolve, 100));
      await route.fulfill({
        status: response.status ?? 200,
        json: response.data
          ? { data: response.data }
          : { error: response.error, acknowledged: response.acknowledged },
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
    expect(methods.every((method) => ["GET", "PATCH"].includes(method))).toBe(
      true,
    );
  } finally {
    await page.close();
  }
}

describe("supplier quoted fee workflow with synthetic HTTP", () => {
  it("requires supplier basis, sends exact evidence, refreshes after a rejected save and renders the confirmed snapshot", async () => {
    const initial = data();
    initial.capabilities["inventory.catalog"] = true;
    const saved = structuredClone(initial);
    Object.assign(saved.supplier_products[0], {
      price_source: "manual_quote",
      quote_reference: "SYN-FEE",
      quoted_on: "2026-09-30",
      quoted_fee_amount: "1.230001",
      quoted_fee_currency: "USD",
      quoted_fee_basis: "Entire quoted shipment",
    });
    const attempts: any[] = [];
    await withScreen(
      initial,
      (_query, method, body) => {
        if (method === "PATCH") {
          attempts.push(body.quote);
          return attempts.length === 1
            ? { status: 422, error: "Synthetic quote save rejected" }
            : { acknowledged: true };
        }
        return { data: attempts.length < 2 ? initial : saved };
      },
      async (page) => {
        await page
          .getByRole("button", { name: "Record quote", exact: true })
          .click();
        const dialog = page.getByRole("dialog");
        await dialog.getByLabel(/^Quote reference/).fill("SYN-FEE");
        await dialog.getByLabel(/^Quoted on/).fill("2026-09-30");
        await dialog
          .getByLabel("Quoted fee amount", { exact: true })
          .fill("1.230001");
        await dialog
          .getByRole("button", { name: "Save quote", exact: true })
          .click();
        expect(attempts).toHaveLength(0);
        await dialog
          .getByLabel(/^Supplier-stated fee basis/)
          .fill("Entire quoted shipment");
        await dialog
          .getByRole("button", { name: "Save quote", exact: true })
          .click();
        await dialog.waitFor({ state: "hidden" });
        expect(attempts).toHaveLength(1);
        await page
          .getByRole("button", { name: "Record quote", exact: true })
          .click();
        await dialog.getByLabel(/^Quote reference/).fill("SYN-FEE");
        await dialog.getByLabel(/^Quoted on/).fill("2026-09-30");
        await dialog
          .getByLabel("Quoted fee amount", { exact: true })
          .fill("1.230001");
        await dialog
          .getByLabel(/^Supplier-stated fee basis/)
          .fill("Entire quoted shipment");
        await dialog
          .getByRole("button", { name: "Save quote", exact: true })
          .click();
        await dialog.waitFor({ state: "hidden" });
        expect(attempts).toHaveLength(2);
        expect(attempts[1]).toEqual(attempts[0]);
        expect(attempts[1]).toMatchObject({
          quoted_fee_amount: "1.230001",
          quoted_fee_basis: "Entire quoted shipment",
          currency: "USD",
          expected_updated_at: "2026-09-30T12:00:00Z",
        });
        await page
          .getByText(
            "Quoted fee: USD 1.230001 · Entire quoted shipment · not included in merchandise totals",
            { exact: false },
          )
          .waitFor();
      },
    );
  }, 15000);
});
