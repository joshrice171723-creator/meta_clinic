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
  "./BillingInsights": `export const BillingCollectionContext = () => null;
    export const BillingCollectionWorklist = () => null;
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
          import "/src/features/clinic/billing.css";
          import {createRoot} from "react-dom/client";
          import {BillingDashboard} from "/src/features/clinic/BillingDashboard";
          import {BillingPayments} from "/src/features/clinic/BillingInsights";
          import {useResource} from "/src/shared/ui";
          function Payments() {const {data}=useResource("/api/clinic/billing");return data ? React.createElement(BillingPayments,{data,canOpenPatient:false}) : null;}
          createRoot(document.getElementById("root")).render(React.createElement(new URLSearchParams(location.search).has("payments") ? Payments : BillingDashboard));`;
        },
        configureServer(vite) {
          vite.middlewares.use("/qa", async (request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await vite.transformIndexHtml(
                "/qa",
                `${request.url?.includes("theme") ? '<div class="clinic-theme">' : ""}<div id="root"></div>${request.url?.includes("theme") ? "</div>" : ""}<script type="module" src="/qa-entry.tsx"></script>`,
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

it.each(["America/Chicago", "Asia/Tokyo"])(
  "#87 keeps the recorded payment time through reload in browser timezone %s",
  async (timezoneId) => {
    const page = await browser.newPage({ timezoneId, locale: "en-US" });
    const recordedAt = "2026-09-28T09:47:00Z";
    const expectedTime = "Sep 28, 2026, 4:47 AM";
    await page.clock.install({ time: new Date("2026-09-28T10:23:00Z") });
    await page.route(`${base}/api/**`, async (route) => {
      const path = new URL(route.request().url()).pathname;
      expect(route.request().method()).toBe("GET");
      await route.fulfill({
        json:
          path === "/api/csrf"
            ? { csrf_token: "synthetic-token" }
            : {
                practice: { id: 701, timezone: "America/Chicago" },
                payment_count: 1,
                payment_activity: [
                  {
                    id: 88,
                    patient_id: 706,
                    currency: "USD",
                    amount: "25.00",
                    refunded: "0.00",
                    net_amount: "25.00",
                    created_at: recordedAt,
                    method: "cash",
                    allocations: [{ invoice_id: 705, amount: "25.00" }],
                    receipts: [
                      {
                        id: 89,
                        kind: "cash_payment",
                        amount: "25.00",
                        issued_at: recordedAt,
                      },
                    ],
                  },
                ],
              },
      });
    });
    try {
      await page.goto(`${base}/qa?payments`);
      const row = page
        .getByRole("table", { name: "Recorded payments" })
        .getByRole("row")
        .filter({ hasText: "Payment #88" });
      await expect
        .poll(() => row.getByRole("cell").nth(1).innerText())
        .toBe(expectedTime);
      await row
        .getByRole("button", { name: "Payment #88", exact: true })
        .click();
      await expect
        .poll(() => page.getByRole("dialog").innerText())
        .toContain(`Received · ${expectedTime}`);
      expect(await page.getByRole("dialog").innerText()).not.toContain(
        "4:11 AM",
      );
      await page.reload();
      await expect
        .poll(() => row.getByRole("cell").nth(1).innerText())
        .toBe(expectedTime);
    } finally {
      await page.close();
    }
  },
  15000,
);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

async function fixture(
  page: Page,
  credited: string,
  cash?: {
    pending: boolean;
    recoveryGate?: Promise<void>;
    onRequest?: (path: string, method: string) => void;
  },
  theme = false,
) {
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
    cash?.onRequest?.(url.pathname + url.search, route.request().method());
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
    else if (url.pathname === "/api/clinic/cash_drawers")
      body = {
        drawers: [
          {
            id: 707,
            site_id: 704,
            status: "open",
            currency: "USD",
            opening_float: "0",
            cash_received: "25",
            cash_refunded: "0",
            expected_cash: "25",
          },
        ],
      };
    else if (url.pathname === "/api/clinic/working_drafts/checkout") {
      await cash?.recoveryGate;
      body = {
        kind: "checkout",
        patient_id: 706,
        encounter_id: null,
        record_id: 705,
        scope: "cash_payment",
        version: cash?.pending ? 1 : 0,
        updated_at: null,
        payload: cash?.pending
          ? {
              invoiceId: 705,
              drawerId: 707,
              currency: "USD",
              tenderedAmount: "5",
              allocationAmount: "5",
              requestKey: "synthetic-pending-cash-705",
            }
          : null,
      };
    } else throw new Error(`Unexpected synthetic request: ${url.pathname}`);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.goto(
    `${base}/qa?invoice_id=705${cash ? "&cash" : ""}${theme ? "&theme" : ""}`,
  );
  const dialog = page.getByRole("dialog", {
    name: "Invoice details",
    exact: true,
  });
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
      const credit = values.locator("div").filter({
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

it("#150 restores a saved cash lock after reload and offers recovery instead of new payment", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const reads: string[] = [];
  const mutations: string[] = [];
  try {
    const dialog = await fixture(page, "0.00", {
      pending: true,
      onRequest: (path, method) => {
        if (path.includes("working_drafts")) reads.push(path);
        if (method !== "GET") mutations.push(path);
      },
    });
    const recoveryButton = dialog.getByRole("button", {
      name: "Review pending cash payment",
      exact: true,
    });
    await expect.poll(() => recoveryButton.count()).toBe(1);
    await page.reload();
    await expect.poll(() => recoveryButton.count()).toBe(1);
    await expect.poll(() => reads.length).toBe(2);
    expect(
      reads.every(
        (path) =>
          path.includes("patient_id=706") &&
          path.includes("record_id=705") &&
          path.includes("scope=cash_payment"),
      ),
    ).toBe(true);
    expect(
      await dialog
        .getByRole("button", {
          name: "Record cash payment",
          exact: true,
          includeHidden: true,
        })
        .count(),
    ).toBe(0);
    expect(
      await dialog
        .getByText(/Cash payment for invoice #705 is pending confirmation/)
        .count(),
    ).toBe(1);
    await recoveryButton.click();
    await page
      .getByRole("button", { name: "Retry same payment", exact: true })
      .waitFor();
    expect(await page.getByLabel("Tendered cash").isDisabled()).toBe(true);
    expect(await page.getByLabel("Tendered cash").inputValue()).toBe("5");
    expect(mutations).toEqual([]);
  } finally {
    await page.close();
  }
}, 15000);

it("#150 waits for the saved-payment check before offering a new cash payment", async () => {
  const page = await browser.newPage();
  let release!: () => void;
  const recoveryGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    const dialog = await fixture(page, "0.00", {
      pending: false,
      recoveryGate,
    });
    const newPayment = dialog.getByRole("button", {
      name: "Record cash payment",
      exact: true,
    });
    await expect
      .poll(
        async () =>
          (await newPayment.count()) === 0 || (await newPayment.isDisabled()),
      )
      .toBe(true);
    release();
    await expect
      .poll(
        async () =>
          (await newPayment.count()) === 1 && (await newPayment.isEnabled()),
      )
      .toBe(true);
  } finally {
    release();
    await page.close();
  }
}, 15000);

it.each([false, true])(
  "invoice dialog is accessible and restores focus at 390px with theme=%s",
  async (theme) => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    const mutations: string[] = [];
    try {
      const dialog = await fixture(
        page,
        "0.00",
        {
          pending: false,
          onRequest: (path, method) => {
            if (method !== "GET") mutations.push(path);
          },
        },
        theme,
      );
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      const opener = page.getByRole("button", { name: "#705", exact: true });
      await opener.focus();
      await opener.click();
      await dialog.waitFor();
      expect(
        await dialog.evaluate(
          (node) => node.closest('[aria-hidden="true"]') === null,
        ),
      ).toBe(true);
      expect(
        await dialog.evaluate((node) => Boolean(node.closest(".clinic-theme"))),
      ).toBe(theme);
      const bounds = await dialog.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
      for (let index = 0; index < 6; index += 1) {
        await page.keyboard.press("Tab");
        await expect
          .poll(() =>
            dialog.evaluate((node) =>
              node.contains(node.ownerDocument.activeElement),
            ),
          )
          .toBe(true);
      }
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      await expect
        .poll(() =>
          opener.evaluate((node) => node.ownerDocument.activeElement === node),
        )
        .toBe(true);
      expect(mutations).toEqual([]);
    } finally {
      await page.close();
    }
  },
  20000,
);
