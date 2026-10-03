import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";

let server: ViteDevServer;
let browser: Browser;
let base: string;

// Keep the envelope aligned with Clinic::Billing::Dashboard.call.
function dashboardFixture(invoices: Array<{ status: string }>) {
  return {
    schema_version: "clinic-billing-v1",
    practice: { id: 701, name: "Synthetic practice", timezone: "UTC" },
    period: { start: "2026-10-01", end: "2026-11-01" },
    metrics: {
      invoice_count: invoices.length,
      posted_count: invoices.filter((invoice) => invoice.status === "posted")
        .length,
      draft_count: invoices.filter((invoice) => invoice.status === "draft")
        .length,
      void_count: invoices.filter((invoice) => invoice.status === "void")
        .length,
      currencies: [],
    },
    recent_invoices: invoices,
    invoice_pagination: {
      total: invoices.length,
      total_pages: invoices.length ? 1 : 0,
      page: 1,
      per_page: 25,
    },
    recent_payments: [],
    payment_activity: [],
    payment_count: 0,
    card_collection: {
      available: false,
      reason: "Synthetic checkout is unavailable.",
    },
    pending_online_payments: [],
    collection_worklist: { limit: 50, total_count: 0, items: [] },
    unbilled_encounters: { available: false, total: null, items: [] },
  };
}

it.each(["success", "stale", "unknown"])(
  "posts the reviewed draft with exact retry data after a %s outcome",
  async (outcome) => {
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    page.setDefaultNavigationTimeout(30000);
    let reviewedAt = "2026-10-03T10:00:00.000000Z";
    let status = "draft";
    const attempts: Array<{
      invoice_post: { request_key: string; expected_updated_at: string };
    }> = [];
    await page.route(`${base}/api/**`, async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/clinic/invoices/705/post") {
        const payload = route.request().postDataJSON();
        attempts.push(payload);
        if (attempts.length === 1 && outcome === "unknown") {
          await route.abort("failed");
          return;
        }
        if (attempts.length === 1 && outcome === "stale") {
          reviewedAt = "2026-10-03T10:01:00.000000Z";
          await route.fulfill({
            status: 422,
            json: {
              error: "This invoice changed after review.",
              code: "invalid_request",
            },
          });
          return;
        }
        expect(payload.invoice_post.expected_updated_at).toBe(reviewedAt);
        status = "posted";
        await route.fulfill({ json: { invoice: { id: 705, status } } });
        return;
      }
      const invoice = {
        id: 705,
        patient_id: 706,
        status,
        currency: "USD",
        total: "30.00",
        allocated: "0.00",
        credited: "0.00",
        balance: "30.00",
        created_at: reviewedAt,
        patient: {
          id: 706,
          display_name: "Synthetic review patient",
          reference: "SYN-REVIEW",
        },
      };
      const body =
        path === "/api/csrf"
          ? { csrf_token: "synthetic-token" }
          : path === "/api/clinic/billing"
            ? dashboardFixture([invoice])
            : path === "/api/clinic/invoices/705"
              ? {
                  invoice: {
                    ...invoice,
                    updated_at: reviewedAt,
                    total_amount: "30.00",
                    allocated_amount: "0.00",
                    credit_amount: "0.00",
                    balance_amount: "30.00",
                    lines: [],
                    credits: [],
                    audit_timeline: [],
                    online_payment: { state: "unavailable", eligible: false },
                  },
                }
              : null;
      if (!body) throw new Error(`Unexpected synthetic request: ${path}`);
      await route.fulfill({ json: body });
    });
    try {
      await page.goto(`${base}/qa?invoice_id=705`);
      const review = page.getByRole("button", {
        name: "Post invoice to ledger",
        exact: true,
      });
      await expect.poll(() => review.isEnabled()).toBe(true);
      await review.click();
      await page
        .getByRole("button", { name: "Post invoice", exact: true })
        .click();
      if (outcome === "stale") {
        await page
          .getByText("This invoice changed after review.", { exact: true })
          .waitFor();
        await expect.poll(() => review.isEnabled()).toBe(true);
        await review.click();
        await page
          .getByRole("button", { name: "Post invoice", exact: true })
          .click();
      } else if (outcome === "unknown") {
        await page.getByRole("alert").filter({ hasText: /fetch/i }).waitFor();
        await page
          .getByRole("button", { name: "Post invoice", exact: true })
          .click();
      }
      await page
        .getByText("Invoice #705 was posted to the ledger.", { exact: true })
        .waitFor();
      expect(attempts[0].invoice_post.expected_updated_at).toBe(
        "2026-10-03T10:00:00.000000Z",
      );
      expect(attempts[0].invoice_post.request_key).toBeTruthy();
      if (outcome === "unknown") expect(attempts[1]).toEqual(attempts[0]);
      if (outcome === "stale") {
        expect(attempts[1].invoice_post.expected_updated_at).toBe(reviewedAt);
        expect(attempts[1].invoice_post.request_key).not.toBe(
          attempts[0].invoice_post.request_key,
        );
      }
    } finally {
      await page.close();
    }
  },
  45000,
);
const modules: Record<string, string> = {
  "./Workspace": `const clinic = {practice: {id: 701}, user_id: 702, membership_id: 703,
    sites: [{id: 704, name: "Synthetic site"}], capabilities: {billing_read: true,
    patient_identity_read: true, billing_invoice_post: true,
    billing_payment_record: new URLSearchParams(location.search).has("cash")}};
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

it("retains a committed posting retry when refresh and search hide the original invoice", async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const attempts: Array<{ invoiceId: number; payload: unknown }> = [];
  const statuses: Record<number, string> = { 705: "draft", 706: "draft" };
  const invoice = (id: number) => ({
    id,
    patient_id: 707,
    status: statuses[id],
    currency: "USD",
    total: "30.00",
    allocated: "0.00",
    credited: "0.00",
    balance: "30.00",
    created_at: "2026-10-03T10:00:00.000000Z",
    patient: {
      id: 707,
      display_name: "Synthetic retry patient",
      reference: "SYN-POST-RETRY",
    },
  });
  await page.route(`${base}/api/**`, async (route) => {
    const url = new URL(route.request().url());
    const post = url.pathname.match(
      /^\/api\/clinic\/invoices\/(705|706)\/post$/,
    );
    if (post) {
      const id = Number(post[1]);
      attempts.push({ invoiceId: id, payload: route.request().postDataJSON() });
      statuses[id] = "posted";
      if (attempts.length === 1) await route.abort("failed");
      else await route.fulfill({ json: { invoice: { id, status: "posted" } } });
      return;
    }
    const detail = url.pathname.match(/^\/api\/clinic\/invoices\/(705|706)$/);
    let body: unknown;
    if (url.pathname === "/api/csrf") body = { csrf_token: "synthetic-token" };
    else if (url.pathname === "/api/clinic/billing") {
      const q = url.searchParams.get("q");
      body = dashboardFixture(
        [705, 706].filter((id) => !q || q === String(id)).map(invoice),
      );
    } else if (detail) {
      body = {
        invoice: {
          ...invoice(Number(detail[1])),
          updated_at: "2026-10-03T10:00:00.000000Z",
          total_amount: "30.00",
          allocated_amount: "0.00",
          credit_amount: "0.00",
          balance_amount: "30.00",
          lines: [],
          credits: [],
          audit_timeline: [],
          online_payment: { state: "unavailable", eligible: false },
        },
      };
    } else throw new Error(`Unexpected synthetic request: ${url.pathname}`);
    await route.fulfill({ json: body });
  });
  try {
    await page.goto(`${base}/qa?invoice_id=705`);
    const review = page.getByRole("button", {
      name: "Post invoice to ledger",
      exact: true,
    });
    await expect.poll(() => review.isEnabled()).toBe(true);
    await review.click();
    await page
      .getByRole("button", { name: "Post invoice", exact: true })
      .click();
    await page.getByRole("alert").filter({ hasText: /fetch/i }).waitFor();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    const retry = page.getByRole("button", {
      name: "Retry invoice #705 posting",
      exact: true,
    });
    await expect.poll(() => retry.isEnabled()).toBe(true);
    await page
      .getByLabel("Search invoices by number, patient name or reference")
      .fill("706");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("button", { name: "#706", exact: true }).click();
    await page
      .getByText("Loading invoice detail.", { exact: true })
      .waitFor({ state: "hidden" });
    await expect.poll(() => review.isDisabled()).toBe(true);
    expect(attempts).toHaveLength(1);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await retry.click();
    await expect.poll(() => retry.count()).toBe(0);
    expect(attempts[1]).toEqual(attempts[0]);
    await page.getByRole("button", { name: "#706", exact: true }).click();
    await expect.poll(() => review.isEnabled()).toBe(true);
    await review.click();
    await page
      .getByRole("button", { name: "Post invoice", exact: true })
      .click();
    await page
      .getByText("Invoice #706 was posted to the ledger.", { exact: true })
      .waitFor();
    expect(attempts.map((attempt) => attempt.invoiceId)).toEqual([
      705, 705, 706,
    ]);
  } finally {
    await page.close();
  }
}, 20000);

beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    optimizeDeps: {
      entries: [],
      noDiscovery: true,
      include: [
        "react",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "react-dom",
        "react-dom/client",
        "@mui/material",
        "@emotion/react",
        "@emotion/styled",
        "@mui/icons-material/CreditCardOutlined",
        "@mui/icons-material/Refresh",
        "@mui/icons-material/ArrowForward",
        "@mui/icons-material/AccountBalanceWalletOutlined",
        "@mui/icons-material/PrintOutlined",
        "@mui/icons-material/ExpandMore",
      ],
    },
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
}, 60000);

it.each(["America/Chicago", "Asia/Tokyo"])(
  "#87 keeps the recorded payment time through reload in browser timezone %s",
  async (timezoneId) => {
    const page = await browser.newPage({ timezoneId, locale: "en-US" });
    const recordedAt = "2026-09-28T09:47:00Z";
    const expectedTime = "Sep 28, 2026, 4:47 AM (America/Chicago)";
    await page.clock.install({ time: new Date("2026-09-28T10:23:00Z") });
    await page.route(`${base}/api/**`, async (route) => {
      const path = new URL(route.request().url()).pathname;
      expect(route.request().method()).toBe("GET");
      await route.fulfill({
        json:
          path === "/api/csrf"
            ? { csrf_token: "synthetic-token" }
            : {
                ...dashboardFixture([]),
                practice: {
                  id: 701,
                  name: "Synthetic practice",
                  timezone: "America/Chicago",
                },
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
                    method: "Cash",
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
}, 60000);

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
    age_bucket: "0-30 days",
    created_at: "2026-09-28T12:00:00Z",
    source_site_id: null,
    source_site_name: "Shared / unassigned",
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
        ...dashboardFixture([invoice]),
        period: { start: "2026-09-01", end: "2026-10-01" },
      };
    else if (url.pathname === "/api/clinic/invoices/705")
      body = {
        invoice: {
          id: 705,
          patient_id: 706,
          encounter_id: null,
          status: "posted",
          currency: "USD",
          rounding_policy_version: "v1",
          created_at: "2026-09-28T12:00:00Z",
          updated_at: "2026-09-28T12:00:00.000000Z",
          source_site_id: null,
          source_site_name: "Shared / unassigned",
          total_amount: "30.00",
          allocated_amount: "25.00",
          credit_amount: credited,
          balance_amount: balance,
          adjustment_limits: {
            credit_available_amount: credited === "5.00" ? "25.00" : "30.00",
            void_eligible: false,
          },
          lines: [
            {
              id: 710,
              quantity: "1.0",
              unit_amount: "30.00",
              posted_amount: "30.00",
              billing_service_id: null,
              description: "Synthetic invoice charge",
            },
          ],
          credits:
            credited === "5.00"
              ? [
                  {
                    id: 711,
                    invoice_id: 705,
                    amount: "5.00",
                    currency: "USD",
                    adjustment_type: "credit",
                    reason: "Synthetic recorded credit",
                    issued_at: "2026-09-28T12:00:00Z",
                    issued_by_membership_id: 703,
                  },
                ]
              : [],
          audit_timeline: [],
          void_reason: null,
          voided_at: null,
          voided_by_membership_id: null,
          online_payment: {
            state: balance === "0.00" ? "paid" : "unavailable",
            eligible: false,
            can_cancel: false,
            amount: balance,
            currency: "USD",
            reason: balance === "0.00" ? "no_balance" : "stripe_unavailable",
            collection_intent_id: null,
          },
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
            counted_cash: null,
            discrepancy: null,
            discrepancy_explanation: null,
            opened_at: "2026-09-28T12:00:00Z",
            closed_at: null,
            reconciliation_status: "pending",
            reconciled_by_id: null,
            reconciled_at: null,
            reconciliation_note: null,
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
