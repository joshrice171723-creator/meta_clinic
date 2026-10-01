import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import type { BillingPatientLedger } from "../src/api/contracts";

// Real React/MUI reconciliation and Billing handlers, isolated from all servers.
// Deliberately keep aborted promises resolvable to exercise stale-response guards.
const root = fileURLToPath(new URL("..", import.meta.url));
// Reuse an installed browser; runners may supply their exact executable path.
const chromiumExecutable =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  [
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    chromium.executablePath(),
  ].find(existsSync);
const modules: Record<string, string> = {
  "../../api/client": `export class ApiError extends Error {}
    export const api = (...args) => window.qa.request(...args);`,
  "../../shared/ui": `export const useResource = () => ({});
    export const LoadState = () => null;`,
  "./Workspace": `export const useClinic = () => ({
    practice: { id: 1 }, user_id: 1, membership_id: 1,
    capabilities: { billing_read: true, billing_invoice_draft: true,
      billing_invoice_post: window.qaCashPending !== undefined,
      billing_payment_record: window.qaCashPending !== undefined }
  });`,
  "./useWorkingDraft": `export const useWorkingDraft = () => ({
    ready: true, restored: null, save: async () => true, clear: async () => true
  });`,
  "./CashDrawerOperations": `import {useEffect} from 'react';
    export const CashDrawerOperations = ({onPendingChange, invoice}) => {
      useEffect(() => { onPendingChange?.({pending: window.qaCashPending === true,
        invoiceId: invoice?.id ?? null}); }, [invoice?.id]);
      return null;
    };
    export const hasPendingCashAttempt = () => window.qaCashPending === true;
    export const pendingCashAttemptInvoiceId = () => window.qaCashPending === true ? 77 : null;`,
  "./CashPayEstimates": `export const CashPayEstimates = () => null;`,
  "./GuidedCheckout": `export const GuidedCheckout = () => null;`,
  "./InvoiceCheckoutControls": `export const InvoiceCheckoutControls = () => null;`,
};
const entry = `
  import React from 'react';
  import { createRoot } from 'react-dom/client';
  import { Billing } from '/src/features/clinic/Billing.tsx';
  window.qa = {
    requests: [],
    request(path, options = {}) {
      if (path.startsWith('/api/clinic/billing_services?'))
        return Promise.resolve({ services: [] });
      if (!/billing_ledger$|invoices\\?encounter_id=|invoices\\/\\d+\\/draft$/.test(path))
        throw new Error('Unexpected synthetic request: ' + path);
      return new Promise(resolve => this.requests.push({
        path, options, resolve, done: false
      }));
    },
    resolve(index, value) {
      const request = this.requests[index];
      request.done = true;
      request.resolve(value);
    }
  };
  createRoot(document.getElementById('root')).render(React.createElement(Billing));
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
        name: "synthetic-billing-only",
        enforce: "pre",
        resolveId(source, importer) {
          if (source === "/qa-entry.tsx") return "\0qa-entry.tsx";
          if (importer?.includes("/src/features/clinic/") && source in modules)
            return `\0qa-mock:${encodeURIComponent(source)}`;
        },
        load(id) {
          if (id === "\0qa-entry.tsx") return entry;
          if (id.startsWith("\0qa-mock:"))
            return modules[decodeURIComponent(id.slice(9))];
        },
        configureServer(vite) {
          vite.middlewares.use((request, response, next) => {
            if (request.url?.startsWith("/qa?")) {
              response.setHeader("Content-Type", "text/html");
              response.end(
                '<div id="root"></div><script type="module" src="/qa-entry.tsx"></script>',
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
    executablePath: chromiumExecutable,
    args: ["--no-sandbox"],
  });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});
const invoice: BillingPatientLedger["invoices"][number] = {
  id: 77,
  currency: "USD",
  status: "draft",
  created_at: "2026-09-30T00:00:00Z",
  updated_at: "2026-09-30T00:00:00Z",
  total_amount: "0.00",
  allocated_amount: "0.00",
  credit_amount: "0.00",
  balance_amount: "0.00",
  online_payment: {
    collection_intent_id: null,
    state: "unavailable",
    eligible: false,
    can_cancel: false,
    amount: "0.00",
    currency: "USD",
    reason: "invoice_not_posted",
  },
  adjustment_limits: { credit_available_amount: "0.00", void_eligible: true },
  lines: [
    {
      id: 1,
      description: "Synthetic no-charge line",
      quantity: "1",
      unit_amount: "0.00",
      posted_amount: "0.00",
      billing_service_id: null,
    },
  ],
  allocations: [],
  credits: [],
};
// Patient/invoice IDs may coincide: they belong to different identity domains.
const ledger: BillingPatientLedger = {
  schema_version: "clinic-patient-ledger-v1",
  patient: { id: 77, display_name: "Synthetic Patient", reference: "" },
  currencies: [],
  invoices: [invoice],
  payments: [],
};
type RequestSummary = {
  path: string;
  method: string;
  aborted: boolean;
  body: unknown;
};
async function requests(page: Page): Promise<RequestSummary[]> {
  return page.evaluate(() =>
    (window as any).qa.requests.map((r: any) => ({
      path: r.path,
      method: r.options.method || "GET",
      aborted: r.options.signal?.aborted || false,
      body: r.options.body,
    })),
  );
}
async function resolve(page: Page, index: number, data: unknown) {
  await page.evaluate(
    ({ index, data }) => (window as any).qa.resolve(index, data),
    { index, data },
  );
}
async function waitRequests(page: Page, count: number) {
  await page.waitForFunction(
    (count) => (window as any).qa?.requests.length === count,
    count,
    { timeout: 10_000 },
  );
}
async function open() {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === new URL(base).origin &&
    !new URL(route.request().url()).pathname.startsWith("/api/")
      ? route.continue()
      : route.abort(),
  );
  await page.goto(`${base}qa?patient_id=77&encounter_id=9`);
  await waitRequests(page, 2);
  await resolve(page, 0, ledger);
  await resolve(page, 1, {
    invoices: [{ id: 77, encounter_id: 9, status: "draft" }],
  });
  await page.getByRole("button", { name: "Save draft", exact: true }).waitFor();
  return page;
}
const details = (page: Page) =>
  page.getByRole("button", { name: /^Invoice #77 details/ });
async function save(page: Page, count: number) {
  await page
    .getByRole("button", { name: "Save draft", exact: true })
    .dblclick();
  await waitRequests(page, count);
  expect(
    await page
      .getByRole("button", { name: "Saving…", exact: true })
      .isDisabled(),
  ).toBe(true);
  await resolve(page, count - 1, {
    invoice: { ...invoice, patient_id: 77, encounter_id: 9 },
  });
  await waitRequests(page, count + 2);
}
it("keeps one details control and its expanded state through repeated unchanged draft saves", async () => {
  const page = await open();
  try {
    expect(await details(page).count()).toBe(1);
    await details(page).click();
    for (const count of [3, 6]) {
      await save(page, count);
      // Refresh temporarily removes checkout editor; the selected detail survives.
      expect(await details(page).count()).toBe(1);
      expect(await details(page).getAttribute("aria-expanded")).toBe("true");
      await resolve(page, count, ledger);
      await resolve(page, count + 1, {
        invoices: [{ id: 77, encounter_id: 9, status: "draft" }],
      });
      await page
        .getByRole("button", { name: "Save draft", exact: true })
        .waitFor();
      expect(await details(page).count()).toBe(1);
      expect(
        await page
          .getByRole("table", { name: "Patient invoice ledger" })
          .getByRole("row")
          .count(),
      ).toBe(2);
    }
    expect(
      (await requests(page))
        .filter((r) => r.method !== "GET")
        .map((r) => [r.method, r.path]),
    ).toEqual([
      ["PATCH", "/api/clinic/invoices/77/draft"],
      ["PATCH", "/api/clinic/invoices/77/draft"],
    ]);
    if (process.env.QA_SCREENSHOT_PATH)
      await page.screenshot({
        path: process.env.QA_SCREENSHOT_PATH,
        fullPage: true,
      });
  } finally {
    await page.close();
  }
}, 60_000);
it("ignores an older aborted ledger response after a later save refresh", async () => {
  const page = await open();
  try {
    await save(page, 3);
    // Let checkout/editor return while its older ledger request is still pending.
    await resolve(page, 4, {
      invoices: [{ id: 77, encounter_id: 9, status: "draft" }],
    });
    await page
      .getByRole("button", { name: "Save draft", exact: true })
      .waitFor();
    await save(page, 6);
    expect((await requests(page))[3].aborted).toBe(true);
    const latest = {
      ...ledger,
      invoices: [{ ...invoice, balance_amount: "2.00" }],
    };
    await resolve(page, 6, latest);
    await resolve(page, 7, {
      invoices: [{ id: 77, encounter_id: 9, status: "draft" }],
    });
    await page
      .getByRole("button", { name: "Save draft", exact: true })
      .waitFor();
    await resolve(page, 3, ledger);
    expect(await details(page).count()).toBe(1);
    expect(await details(page).textContent()).toContain("USD 2.00");
    expect(
      (await requests(page)).filter((r) => r.method !== "GET"),
    ).toHaveLength(2);
  } finally {
    await page.close();
  }
}, 60_000);

// Muse #148: exercise the real Billing -> CheckoutSettlement -> adjustment wiring.
it.each([true, false])(
  "#148 gates invoice void with pending cash = %s",
  async (pending) => {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    try {
      await page.addInitScript((pending) => {
        (window as any).qaCashPending = pending;
      }, pending);
      await page.goto(`${base}qa?patient_id=77&encounter_id=9`);
      await waitRequests(page, 2);
      await resolve(page, 0, {
        ...ledger,
        invoices: [
          {
            ...invoice,
            status: "posted",
            total_amount: "30.00",
            balance_amount: "30.00",
            adjustment_limits: {
              credit_available_amount: "30.00",
              void_eligible: true,
            },
          },
        ],
      });
      await resolve(page, 1, {
        invoices: [{ id: 77, encounter_id: 9, status: "posted" }],
      });
      await page
        .getByRole("button", { name: "Adjust charges", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Adjust invoice charges",
      });
      const voidAction = dialog.getByRole("button", {
        name: "Void untouched unpaid invoice",
        exact: true,
      });
      await voidAction.waitFor();
      expect(await voidAction.isDisabled()).toBe(pending);
      expect(
        await dialog
          .getByText(/Cash payment for invoice #77 is pending confirmation/)
          .count(),
      ).toBe(pending ? 1 : 0);
      expect(
        (await requests(page)).filter((r) => r.method !== "GET"),
      ).toHaveLength(0);
    } finally {
      await page.close();
    }
  },
  20000,
);
