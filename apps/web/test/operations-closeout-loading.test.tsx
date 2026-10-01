import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page, type Route } from "playwright-core";
import { fileURLToPath } from "node:url";

let server: ViteDevServer, browser: Browser, baseUrl: string;
const reports = [
  ["daily_cash_drawers", "Cash drawer sessions opened"],
  ["daily_invoices", "Invoices created"],
  ["daily_payment_activity", "Payments and refunds recorded"],
  ["daily_stock_movements", "Stock movements"],
] as const;

beforeAll(async () => {
  const id = "\0operations-closeout-fixture.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    cacheDir: fileURLToPath(
      new URL("../../../tmp/closeout-vite-cache", import.meta.url),
    ),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "operations-closeout-fixture",
        resolveId: (value) => (value === id ? id : undefined),
        load: (value) =>
          value === id
            ? 'import React from "react";import {createRoot} from "react-dom/client";import {OperationsReportsCatalog} from "/src/features/clinic/OperationsReportsCatalog";createRoot(document.getElementById("root")).render(React.createElement(OperationsReportsCatalog,{timezone:"UTC",capabilities:{billing_read:true,billing_cash_reconcile:true,inventory:true}}));'
            : undefined,
        configureServer(instance) {
          instance.middlewares.use(
            "/closeout-fixture",
            async (_request, response) => {
              response.setHeader("Content-Type", "text/html");
              response.end(
                await instance.transformIndexHtml(
                  "/closeout-fixture",
                  '<div id="root"></div><script type="module" src="/@id/__x00__operations-closeout-fixture.tsx"></script>',
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
    throw new Error("No fixture port");
  baseUrl = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || "/usr/bin/chromium",
    headless: true,
  });
}, 20000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

function report(date: string) {
  const pagination = { page: 1, per_page: 50, total: 0, total_pages: 0 };
  return {
    date,
    timezone: "UTC",
    as_of: `${date}T00:00:00Z`,
    definition: {
      source: `Synthetic source ${date}`,
      revision: 1,
      date_basis: "created_at",
      exclusions: "Fixture",
    },
    records: [],
    carried_records: [],
    currencies: [],
    movements: [],
    payment_records: [],
    refund_records: [],
    pagination,
    carried_pagination: pagination,
    payment_pagination: pagination,
    refund_pagination: pagination,
    office_pagination: pagination,
    open_count: 0,
    awaiting_reconciliation_count: 0,
    variance_count: 0,
    carried_count: 0,
    low_product_count: 0,
    low_office_count: 0,
    office_quantity: "0",
    pharmacy_units: [],
    pharmacy_records: [],
    office_records: [],
  };
}

async function fixture(page: Page, mode: "success" | "error" | "interrupted") {
  const requests: { name: string; date: string }[] = [],
    held: Route[] = [],
    warnings: string[] = [];
  page.setDefaultTimeout(5000);
  page.on("console", (message) => {
    if (message.type() === "error") warnings.push(message.text());
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const name = url.pathname.split("/").at(-1)!;
    if (name === "csrf")
      return route.fulfill({ json: { csrf_token: "synthetic-fixture-only" } });
    const date = url.searchParams.get("date") || "2026-10-01";
    if (reports.some(([id]) => id === name)) {
      requests.push({ name, date });
      if (mode === "interrupted" && date === "2026-10-01") {
        held.push(route);
        return;
      }
      if (mode === "error")
        return route.fulfill({
          status: 503,
          json: { error: "Synthetic report unavailable" },
        });
      return route.fulfill({ json: { report: report(date) } });
    }
    return route.fulfill({
      json:
        name === "current_stock" ? { report: report(date) } : { reviews: [] },
    });
  });
  await page.goto(`${baseUrl}/closeout-fixture?date=2026-10-01`);
  return { requests, held, warnings };
}

async function assertSettled(page: Page, error = false, date = "2026-10-01") {
  for (const [, heading] of reports) {
    const rows = page.getByRole("heading", { name: heading, exact: true });
    await expect.poll(() => rows.count()).toBe(1);
    const parent = rows.locator("..");
    if (error) {
      const alert = parent.locator('[data-resource-state="error"]');
      await alert.waitFor();
      expect(await alert.innerText()).toContain("Synthetic report unavailable");
    } else
      await parent
        .getByText(`Synthetic source ${date}`, { exact: false })
        .waitFor();
    expect(
      await parent.locator('[data-resource-state="loading"]').count(),
    ).toBe(0);
    expect(await parent.locator('[data-resource-state="error"]').count()).toBe(
      error ? 1 : 0,
    );
  }
}

it("successful closeout reports leave one completed row each without phantom loaders", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  try {
    const state = await fixture(page, "success");
    await page
      .getByText("No stock movements were recorded on this date.", {
        exact: true,
      })
      .first()
      .waitFor();
    await assertSettled(page);
    expect(state.requests).toHaveLength(4);
    expect(
      state.warnings.filter((message) => message.includes("same key")),
    ).toEqual([]);
  } finally {
    await page.close();
  }
}, 20000);

it("failed closeout requests replace every loader with an explicit error", async () => {
  const page = await browser.newPage();
  try {
    await fixture(page, "error");
    await assertSettled(page, true);
  } finally {
    await page.close();
  }
}, 15000);

it("changing the date during interrupted loads keeps only the new date and resets report pages", async () => {
  const page = await browser.newPage();
  try {
    const state = await fixture(page, "interrupted");
    await expect.poll(() => state.held.length).toBe(4);
    await page.getByLabel("Clinic date", { exact: true }).fill("2026-10-02");
    await page
      .getByRole("button", { name: "Show report", exact: true })
      .click();
    await assertSettled(page, false, "2026-10-02");
    for (const route of state.held)
      await route
        .fulfill({ json: { report: report("2026-10-01") } })
        .catch(() => undefined);
    await assertSettled(page, false, "2026-10-02");
    expect(
      state.requests.filter((request) => request.date === "2026-10-02"),
    ).toHaveLength(4);
    for (const [, heading] of reports)
      expect(
        await page
          .getByRole("heading", { name: heading, exact: true })
          .locator("..")
          .innerText(),
      ).not.toContain("Synthetic source 2026-10-01");
    expect(
      state.warnings.filter((message) => message.includes("same key")),
    ).toEqual([]);
  } finally {
    await page.close();
  }
}, 20000);
