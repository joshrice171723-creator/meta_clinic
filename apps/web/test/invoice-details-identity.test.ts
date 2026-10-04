import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
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
      if (!/billing_ledger(?:\\?|$)|invoices\\?encounter_id=|invoices\\/\\d+\\/(?:draft|post|write_offs|credits)$/.test(path))
        throw new Error('Unexpected synthetic request: ' + path);
      return new Promise((resolve,reject) => this.requests.push({
        path, options, resolve, reject, done: false
      }));
    },
    resolve(index, value) {
      const request = this.requests[index];
      request.done = true;
      request.value = value;
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
it.skipIf(!process.env.MUSE149_LEDGER_PROOF_INPUT)(
  "#149 renders a persisted thirty-dollar invoice reconciled by payment and credit",
  async () => {
    const proof = JSON.parse(
      readFileSync(process.env.MUSE149_LEDGER_PROOF_INPUT!, "utf8"),
    );
    expect(proof.schema).toBe("muse149-persisted-proof-v1");
    const page = await browser.newPage();
    try {
      await page.route("**/*", (route) =>
        new URL(route.request().url()).origin === new URL(base).origin &&
        !new URL(route.request().url()).pathname.startsWith("/api/")
          ? route.continue()
          : route.abort(),
      );
      await page.goto(`${base}qa?patient_id=${proof.ledger.patient.id}`);
      await waitRequests(page, 1);
      await resolve(page, 0, proof.ledger);
      const detail = page.getByRole("button", {
        name: new RegExp(`^Invoice #${proof.invoice.id} details`),
      });
      await detail.click();
      const row = page
        .getByRole("table", { name: "Patient invoice ledger" })
        .getByRole("row")
        .filter({ hasText: `#${proof.invoice.id}` });
      expect(await row.getByText("Paid", { exact: true }).isVisible()).toBe(
        true,
      );
      const payments = page
        .getByText("Payments allocated", { exact: true })
        .locator("..");
      const credits = page
        .getByText("Credits and write-offs", { exact: true })
        .locator("..");
      const balance = page
        .getByText("Remaining balance", { exact: true })
        .locator("..");
      expect(await payments.innerText()).toContain("USD 25.00");
      expect(await credits.innerText()).toContain("USD 5.00");
      expect(await credits.innerText()).toContain(
        `Reason: ${proof.invoice.credits[0].reason}`,
      );
      expect(await balance.innerText()).toContain("USD 0.00");
      expect(
        await page.getByText("USD 30.00", { exact: true }).count(),
      ).toBeGreaterThan(0);
      expect(
        (await requests(page)).every((request) => request.method === "GET"),
      ).toBe(true);
    } finally {
      await page.close();
    }
  },
  20000,
);
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

async function openAdjustableInvoice(
  payments: BillingPatientLedger["payments"] = [],
) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  await page.addInitScript(() => {
    (window as any).qaCashPending = false;
  });
  await page.goto(`${base}qa?patient_id=77&encounter_id=9`);
  await waitRequests(page, 2);
  await resolve(page, 0, {
    ...ledger,
    payments,
    invoices: [
      {
        ...invoice,
        status: "posted",
        total_amount: "50.00",
        balance_amount: "50.00",
        adjustment_limits: {
          credit_available_amount: "50.00",
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
  const dialog = page.getByRole("dialog", { name: "Adjust invoice charges" });
  await dialog.waitFor();
  return { page, dialog };
}

it.each([
  ["#83", "write_off", "Write off bad debt", "Write-off amount", "Write-off"],
  ["#42", "credit", "Credit charges", "Credit amount", "Credit"],
] as const)(
  "%s submits an authorized %s and shows its refreshed ledger history",
  async (_issue, action, actionLabel, amountLabel, historyLabel) => {
    const { page, dialog } = await openAdjustableInvoice();
    try {
      await dialog
        .getByRole("button", {
          name: `${actionLabel} · available USD 50.00`,
          exact: true,
        })
        .click();
      await dialog.getByLabel(amountLabel, { exact: true }).fill("5.00");
      await dialog
        .getByRole("textbox", { name: /^Reason/ })
        .fill("Synthetic bad debt");
      await dialog
        .getByRole("button", {
          name: action === "write_off" ? "Write off bad debt" : "Record credit",
          exact: true,
        })
        .click();
      await waitRequests(page, 3);
      expect((await requests(page))[2]).toMatchObject({
        path: `/api/clinic/invoices/77/${action === "write_off" ? "write_offs" : "credits"}`,
        method: "POST",
        body: {
          [action]: {
            amount: "5.00",
            reason: "Synthetic bad debt",
            request_key: expect.any(String),
          },
        },
      });
      await resolve(page, 2, { [action]: { id: 89, amount: "5.00" } });
      await waitRequests(page, 5);
      await resolve(page, 3, {
        ...ledger,
        invoices: [
          {
            ...invoice,
            status: "posted",
            total_amount: "50.00",
            credit_amount: "5.00",
            balance_amount: "45.00",
            adjustment_limits: {
              credit_available_amount: "45.00",
              void_eligible: false,
            },
            credits: [
              {
                id: 89,
                amount: "5.00",
                created_at: "2026-10-01T00:00:00Z",
                adjustment_type: action,
                reason: "Synthetic bad debt",
              },
            ],
          },
        ],
      });
      await resolve(page, 4, {
        invoices: [{ id: 77, encounter_id: 9, status: "posted" }],
      });
      await expect.poll(() => dialog.isVisible()).toBe(false);
      await details(page).click();
      await expect
        .poll(() =>
          page.getByText(new RegExp(`${historyLabel} · USD 5.00`)).count(),
        )
        .toBe(1);
      expect(
        await page
          .getByText("Reason: Synthetic bad debt", { exact: true })
          .count(),
      ).toBe(1);
      expect(await details(page).textContent()).toContain("USD 45.00 balance");
      expect(
        (await requests(page)).filter((request) => request.method !== "GET"),
      ).toHaveLength(1);
    } finally {
      await page.close();
    }
  },
  15000,
);

it("#42 preserves a failed credit and recovers through its exact retry", async () => {
  const { page, dialog } = await openAdjustableInvoice();
  try {
    await dialog.getByLabel("Credit amount", { exact: true }).fill("5.00");
    await dialog
      .getByRole("textbox", { name: /^Reason/ })
      .fill("Synthetic credit correction");
    await dialog
      .getByRole("button", { name: "Record credit", exact: true })
      .click();
    await waitRequests(page, 3);
    const original = (await requests(page))[2];
    expect(original.path).toBe("/api/clinic/invoices/77/credits");
    await page.evaluate(() => {
      (window as any).qa.requests[2].reject(new Error("Internal Server Error"));
    });
    await waitRequests(page, 5);
    await page.evaluate(() => {
      const qa = (window as any).qa;
      qa.resolve(3, qa.requests[0].value);
      qa.resolve(4, qa.requests[1].value);
    });
    await page
      .getByRole("button", { name: "Adjust charges", exact: true })
      .click();
    await dialog
      .getByText(/This charge adjustment has an unconfirmed outcome/)
      .waitFor();
    expect(
      await dialog.getByLabel("Credit amount", { exact: true }).inputValue(),
    ).toBe("5.00");
    expect(
      await dialog.getByRole("textbox", { name: /^Reason/ }).inputValue(),
    ).toBe("Synthetic credit correction");
    await dialog
      .getByRole("button", { name: "Retry exact adjustment", exact: true })
      .click();
    await waitRequests(page, 6);
    expect((await requests(page))[5]).toMatchObject({
      path: original.path,
      method: original.method,
      body: original.body,
    });
    await resolve(page, 5, { credit: { id: 89, amount: "5.00" } });
    await expect.poll(() => dialog.isVisible()).toBe(false);
    expect(
      (await requests(page)).filter((request) => request.method !== "GET"),
    ).toHaveLength(2);
  } finally {
    await page.close();
  }
}, 15000);

it("#120 labels write-off submission separately from invoice void", async () => {
  const { page, dialog } = await openAdjustableInvoice();
  try {
    await dialog
      .getByRole("button", {
        name: "Write off bad debt · available USD 50.00",
        exact: true,
      })
      .click();
    expect(
      await dialog
        .getByRole("button", { name: "Write off bad debt", exact: true })
        .count(),
    ).toBe(1);
    expect(
      await dialog
        .getByRole("button", { name: "Void invoice", exact: true })
        .count(),
    ).toBe(0);
    expect(
      await dialog.getByLabel("Write-off amount", { exact: true }).count(),
    ).toBe(1);
    expect((await requests(page)).filter((r) => r.method !== "GET")).toEqual(
      [],
    );
  } finally {
    await page.close();
  }
}, 15000);

it("#121 shows action-specific credit write-off and void explanations", async () => {
  const { page, dialog } = await openAdjustableInvoice();
  try {
    expect(
      await dialog.getByText(/A credit reduces recorded charges/).count(),
    ).toBe(1);
    await dialog
      .getByRole("button", {
        name: "Write off bad debt · available USD 50.00",
        exact: true,
      })
      .click();
    expect(
      await dialog.getByText(/A write-off reduces unpaid bad debt/).count(),
    ).toBe(1);
    expect(
      await dialog.getByText(/A credit reduces recorded charges/).count(),
    ).toBe(0);
    await dialog
      .getByRole("button", {
        name: "Void untouched unpaid invoice",
        exact: true,
      })
      .click();
    expect(
      await dialog
        .getByText(/Voiding cancels an untouched unpaid invoice/)
        .count(),
    ).toBe(1);
    expect(
      await dialog.getByText(/A credit reduces recorded charges/).count(),
    ).toBe(0);
    expect((await requests(page)).filter((r) => r.method !== "GET")).toEqual(
      [],
    );
  } finally {
    await page.close();
  }
}, 15000);

it("#147 flags an excessive credit inline and disables submission until corrected", async () => {
  const { page, dialog } = await openAdjustableInvoice();
  try {
    const amount = dialog.getByLabel("Credit amount", { exact: true });
    const submit = dialog.getByRole("button", {
      name: "Record credit",
      exact: true,
    });
    await dialog.getByLabel(/^Reason/).fill("Synthetic adjustment review");
    for (const invalid of ["999", "50.000001", "0", "abc"]) {
      await amount.fill(invalid);
      expect(await amount.getAttribute("aria-invalid")).toBe("true");
      expect(await submit.isDisabled()).toBe(true);
      expect(
        await dialog
          .getByText(/Enter a positive credit up to USD 50.00/)
          .count(),
      ).toBe(1);
    }
    await amount.fill("50.000000");
    expect(await amount.getAttribute("aria-invalid")).toBe("false");
    expect(await submit.isEnabled()).toBe(true);
    expect((await requests(page)).filter((r) => r.method !== "GET")).toEqual(
      [],
    );
  } finally {
    await page.close();
  }
}, 15000);

it("#146 links charge adjustments to the executable cash refund workflow", async () => {
  const { page, dialog } = await openAdjustableInvoice([
    {
      id: 88,
      amount: "25",
      currency: "USD",
      allocated_amount: "25",
      unapplied_amount: "0",
      created_at: "2026-10-01T00:00:00Z",
      allocations: [],
      refunds: [
        {
          id: 90,
          amount: "3.00",
          reason: "Synthetic earlier refund",
          created_at: "2026-10-01T00:00:00Z",
        },
      ],
      cash_payment: true,
      receipt_available: true,
      cash_refund_available: true,
      cash_refund_unavailable_reason: null,
    },
  ]);
  try {
    const link = dialog.getByRole("link", {
      name: "Review payments and refunds",
      exact: true,
    });
    expect(await link.count()).toBe(1);
    await link.click();
    await expect.poll(() => dialog.isVisible()).toBe(false);
    expect(new URL(page.url()).hash).toBe("#billing-payment-history");
    const history = page.locator("#billing-payment-history");
    expect(await history.locator("#billing-refund-90").textContent()).toMatch(
      /^Refund #90 · USD 3\.00 on \S/,
    );
    expect(
      await history
        .getByRole("heading", {
          name: "Payment and refund history",
          exact: true,
        })
        .count(),
    ).toBe(1);
    await history
      .getByRole("button", { name: "Refund cash", exact: true })
      .click();
    await history
      .getByRole("textbox", { name: "Cash refund amount" })
      .fill("3.00");
    await history
      .getByRole("textbox", { name: "Refund reason" })
      .fill("Synthetic return");
    await history
      .getByRole("button", { name: "Review refund", exact: true })
      .click();
    const confirmation = page.getByRole("dialog", {
      name: "Confirm cash refund",
    });
    await confirmation.waitFor();
    expect(
      await confirmation.getByText(/Reason:\s*Synthetic return/).count(),
    ).toBe(1);
    expect(
      await confirmation
        .getByRole("button", { name: "Confirm refund", exact: true })
        .isEnabled(),
    ).toBe(true);
    expect((await requests(page)).filter((r) => r.method !== "GET")).toEqual(
      [],
    );
  } finally {
    await page.close();
  }
}, 15000);

it("#93 replaces the draft details heading after posting and ledger refresh", async () => {
  const page = await browser.newPage();
  try {
    await page.addInitScript(() => {
      (window as any).qaCashPending = false;
    });
    await page.goto(`${base}qa?patient_id=77&encounter_id=9`);
    await waitRequests(page, 2);
    await resolve(page, 0, {
      ...ledger,
      invoices: [
        { ...invoice, total_amount: "50.00", balance_amount: "50.00" },
      ],
    });
    await resolve(page, 1, {
      invoices: [{ id: 77, encounter_id: 9, status: "draft" }],
    });
    await page
      .getByRole("button", { name: "Review and post invoice #77", exact: true })
      .click();
    expect(
      await page
        .getByRole("dialog", { name: "Post invoice #77" })
        .getByText("Confirm the recorded total of USD 50.00.", { exact: true })
        .textContent(),
    ).toBe("Confirm the recorded total of USD 50.00.");
    await page
      .getByRole("button", { name: "Confirm and post", exact: true })
      .click();
    await waitRequests(page, 3);
    expect((await requests(page))[2].path).toBe("/api/clinic/invoices/77/post");
    await resolve(page, 2, { invoice: { ...invoice, status: "posted" } });
    await waitRequests(page, 5);
    await resolve(page, 3, {
      ...ledger,
      invoices: [
        {
          ...invoice,
          status: "posted",
          total_amount: "50.00",
          allocated_amount: "25.00",
          balance_amount: "25.00",
        },
      ],
    });
    await resolve(page, 4, {
      invoices: [{ id: 77, encounter_id: 9, status: "posted" }],
    });
    await expect
      .poll(() => details(page).textContent())
      .toContain("Partially settled · USD 25.00 balance");
    expect(await details(page).count()).toBe(1);
    expect(await details(page).textContent()).not.toContain("Draft");
  } finally {
    await page.close();
  }
}, 20000);

it("#54 opens the recorded cash receipt and its print control invokes browser printing", async () => {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    (window as any).qaCashPending = false;
  });
  await page.goto(`${base}qa?patient_id=77`);
  await waitRequests(page, 1);
  await resolve(page, 0, {
    ...ledger,
    payments: [
      {
        id: 88,
        amount: "25",
        currency: "USD",
        unapplied_amount: "0",
        created_at: "2026-10-01T00:00:00Z",
        allocations: [],
        refunds: [],
        cash_payment: true,
        receipt_available: true,
        cash_refund_available: true,
      },
    ],
  });
  const link = page.getByRole("link", { name: "Print receipt", exact: true });
  expect(await link.getAttribute("href")).toBe(
    "/api/clinic/payment_events/88/receipt",
  );
  expect(
    await page
      .getByRole("button", { name: "Refund cash", exact: true })
      .count(),
  ).toBe(1);
  // Exercise the actual ERB print button/handler, without claiming Rails rendering or CSP coverage.
  const template = readFileSync(
    new URL(
      "../../api/app/views/clinic/billing/payment_events/receipt.html.erb",
      import.meta.url,
    ),
    "utf8",
  );
  const button = template.match(
    /<button id="print-receipt"[^>]*>.*?<\/button>/,
  )![0];
  const handler = template.match(
    /<%= javascript_tag nonce: true do %>([\s\S]*?)<% end %>/,
  )![1];
  await page
    .context()
    .route("**/api/clinic/payment_events/88/receipt", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `${button}<script>window.printCalls=0;window.print=()=>window.printCalls++;${handler}</script>`,
      }),
    );
  const popupPromise = page.waitForEvent("popup");
  await link.click();
  const receipt = await popupPromise;
  await receipt
    .getByRole("button", { name: "Print receipt", exact: true })
    .click();
  expect(await receipt.evaluate(() => (window as any).printCalls)).toBe(1);
  expect(
    (await requests(page)).every((request) => request.method === "GET"),
  ).toBe(true);
  await page.context().close();
}, 30_000);
