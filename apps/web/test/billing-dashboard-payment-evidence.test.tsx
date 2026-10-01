import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";

let server: ViteDevServer;
let browser: Browser;
let base: string;
const modules: Record<string, string> = {
  "./Workspace": `const clinic = {practice: {id: 701}, user_id: 702, membership_id: 703,
    sites: [{id: 704, name: "Synthetic site"}], capabilities: {billing_read: true,
    patient_identity_read: true, billing_payment_record: new URLSearchParams(location.search).has("cash")}};
    export const useClinic = () => clinic;`,
  "./BillingInsights": `export const BillingCollectionWorklist = () => null;
    export const BillingIncomeOutlook = () => null; export const BillingPayments = () => null;`,
  "./subscriptions/SubscriptionBilling":
    "export const SubscriptionBilling = () => null;",
  "./BillingSupportRequestQueue":
    "export const BillingSupportRequestQueue = () => null;",
  "./InvoiceCheckoutControls": `export const InvoiceCheckoutControls = () => null;
    export const invoicePaymentReturnMarker = () => null;
    export const clearInvoicePaymentReturnMarker = () => {};`,
};
beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "billing-payment-evidence-test",
        enforce: "pre",
        resolveId(id, importer) {
          if (id === "/qa-entry.tsx") return "\0qa-entry.tsx";
          if (importer?.includes("/src/features/clinic/") && id in modules)
            return `\0qa-mock:${id}`;
        },
        load(id) {
          if (id.startsWith("\0qa-mock:")) return modules[id.slice(9)];
          if (id === "\0qa-entry.tsx")
            return `import React from "react";
          import {createRoot} from "react-dom/client";
          import {BillingDashboard} from "/src/features/clinic/BillingDashboard";
          createRoot(document.getElementById("root")).render(React.createElement(BillingDashboard));`;
        },
        configureServer(vite) {
          vite.middlewares.use("/qa", async (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await vite.transformIndexHtml(
                "/qa",
                '<div id="root"></div><script type="module" src="/qa-entry.tsx"></script>',
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
    throw new Error("Missing test port");
  base = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || "/usr/bin/chromium",
    headless: true,
  });
}, 15000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

async function fixture(page: Page, credited: string) {
  page.setDefaultTimeout(5000);
  page.on("pageerror", (error) => console.error(error));
  const balance = credited === "5.00" ? "0.00" : "5.00";
  const invoice = {
    id: 705,
    status: "posted",
    currency: "USD",
    total: "30.00",
    allocated: "25.00",
    credited,
    balance,
    age_days: 1,
    age_bucket: "0_30",
    created_at: "2026-09-28T12:00:00Z",
    patient: {
      id: 706,
      display_name: "Synthetic evidence patient",
      reference: "SYN-EVIDENCE",
    },
  };
  await page.route(`${base}/api/**`, async (route) => {
    const url = new URL(route.request().url());
    let body: unknown;
    if (url.pathname === "/api/csrf") body = { csrf_token: "synthetic-token" };
    else if (url.pathname === "/api/clinic/billing")
      body = {
        schema_version: "clinic-billing-v1",
        practice: { id: 701, name: "Synthetic practice", timezone: "UTC" },
        period: { start: "2026-09-01", end: "2026-10-01" },
        metrics: { draft_count: 0, currencies: [] },
        recent_invoices: [invoice],
        invoice_pagination: { total: 1, total_pages: 1, page: 1 },
        pending_online_payments: [],
        unbilled_encounters: { available: false, total: null, items: [] },
      };
    else if (url.pathname === "/api/clinic/invoices/705")
      body = {
        invoice: {
          id: 705,
          patient_id: 706,
          status: "posted",
          currency: "USD",
          total_amount: "30.00",
          allocated_amount: "25.00",
          credit_amount: credited,
          balance_amount: balance,
          lines: [],
          allocations: [],
          credits:
            credited === "5.00"
              ? [
                  {
                    id: 711,
                    amount: "5.00",
                    reason: "Synthetic recorded credit",
                  },
                ]
              : [],
          audit_timeline: [],
          online_payment: { state: "unavailable", eligible: false },
        },
      };
    else throw new Error(`Unexpected synthetic request: ${url.pathname}`);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.goto(`${base}/qa?invoice_id=705`);
  const dialog = page.getByRole("dialog", { includeHidden: true });
  await dialog.waitFor();
  return dialog;
}

it.each(["5.00", "0.00"])(
  "#149 displays the server-recorded credit %s beside payments and balance",
  async (credited) => {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    try {
      const dialog = await fixture(page, credited);
      const values = dialog.locator(".billing-invoice-detail-values");
      expect(await values.textContent()).toContain("USD 30.00");
      expect(await values.textContent()).toContain("USD 25.00");
      const credit = values
        .locator("div")
        .filter({
          has: page.getByText("Credits and write-offs", { exact: true }),
        });
      await expect
        .poll(() => credit.textContent())
        .toContain(`USD ${credited}`);
      expect(
        await dialog
          .getByText(credited === "5.00" ? "Settled" : "Partially paid", {
            exact: true,
          })
          .count(),
      ).toBe(1);
    } finally {
      await page.close();
    }
  },
  15000,
);
