import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Constructed regression data, not captured raw LIVE-009 timestamps. The capture
// identifies payment/allocation 10168 and invoice 13554; their real ISO values
// still require A's read-only confirmation. Allocation and payment instants differ.
const paymentAt = "2026-10-01T22:34:00Z";
const allocationAt = "2026-10-01T22:37:00Z";
const patient = {
  id: 706,
  display_name: "Rowan Brooks",
  reference: "SBX-1-009",
};
const invoice = {
  id: 13554,
  currency: "USD",
  status: "posted",
  created_at: "2026-10-01T00:34:00Z",
  updated_at: allocationAt,
  total_amount: "159.00",
  allocated_amount: "159.00",
  credit_amount: "0.00",
  balance_amount: "0.00",
  adjustment_limits: { credit_available_amount: "0.00", void_eligible: false },
  online_payment: {
    collection_intent_id: null,
    state: "unavailable",
    eligible: false,
    can_cancel: false,
    amount: "0.00",
    currency: "USD",
    reason: "invoice_settled",
  },
  lines: [
    {
      id: 1,
      description: "Synthetic recorded care",
      quantity: "1.0",
      unit_amount: "159.00",
      posted_amount: "159.00",
      billing_service_id: null,
    },
  ],
  allocations: [
    {
      id: 10168,
      payment_event_id: 10168,
      amount: "159.00",
      created_at: allocationAt,
    },
  ],
  credits: [],
};
const ledger = {
  schema_version: "clinic-patient-ledger-v1",
  patient,
  currencies: [],
  invoices: [invoice],
  payments: [
    {
      id: 10168,
      currency: "USD",
      amount: "159.00",
      allocated_amount: "159.00",
      unapplied_amount: "0.00",
      created_at: paymentAt,
      cash_payment: false,
      cash_refund_available: false,
      cash_refund_unavailable_reason: "not_cash_payment",
      receipt_available: false,
      allocations: [
        {
          id: 10168,
          invoice_id: 13554,
          amount: "159.00",
          created_at: allocationAt,
        },
      ],
      refunds: [],
    },
  ],
};
const payments = {
  practice: {
    id: 701,
    name: "Constructed synthetic practice",
    timezone: "UTC",
  },
  payment_activity: [
    {
      id: 10168,
      patient_id: 706,
      currency: "USD",
      amount: "159.00",
      refunded: "0.00",
      net_amount: "159.00",
      created_at: paymentAt,
      method: "Recorded payment",
      allocations: [{ invoice_id: 13554, amount: "159.00" }],
      receipts: [],
    },
  ],
};
const root =
  process.env.QA_BILLING_TEST_ROOT ||
  fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = process.env.QA_BILLING_SOURCE_ROOT;
const modules: Record<string, string> = {
  "./Workspace": `export const useClinic = () => ({
    practice: {id:701, name:"Constructed synthetic practice", timezone:"UTC"},
    user_id:702, membership_id:703, sites:[{id:704}],
    capabilities:{billing_read:true,patient_identity_read:true}
  });`,
  "./CashDrawerOperations": `export const CashDrawerOperations = () => null;
    export const hasPendingCashAttempt = () => false;
    export const pendingCashAttemptInvoiceId = () => null;`,
  "./CashPayEstimates": "export const CashPayEstimates = () => null;",
  "./GuidedCheckout": "export const GuidedCheckout = () => null;",
  "./InvoiceCheckoutControls":
    "export const InvoiceCheckoutControls = () => null;",
  "./useWorkingDraft": `export const useWorkingDraft = () => ({
    ready:true,restored:null,save:async()=>true,clear:async()=>true});`,
};
let server: ViteDevServer;
let browser: Browser;
let base: string;
beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root,
    cacheDir:
      process.env.QA_BILLING_CACHE_DIR ||
      mkdtempSync(join(tmpdir(), "billing-regression-")),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "synthetic-billing-timezone-lookup",
        enforce: "pre",
        resolveId(id, importer) {
          if (id === "/qa-entry.tsx") return "\0qa-entry.tsx";
          if (importer?.includes("/src/features/clinic/") && id in modules)
            return `\0qa-mock:${id}`;
        },
        load(id) {
          if (id.startsWith("\0qa-mock:")) return modules[id.slice(9)];
          if (
            sourceRoot &&
            ["Billing.tsx", "BillingInsights.tsx"].some(
              (name) =>
                id.split("?")[0] ===
                join(root, "src/features/clinic", name).replaceAll("\\", "/"),
            )
          ) {
            return readFileSync(
              join(
                sourceRoot,
                "src/features/clinic",
                id.split("?")[0].split("/").at(-1)!,
              ),
              "utf8",
            );
          }
          if (id === "\0qa-entry.tsx")
            return `import React from 'react';
          import {createRoot} from 'react-dom/client'; import '/src/shared/forms.css';
          import {Billing} from '/src/features/clinic/Billing';
          import {BillingPayments} from '/src/features/clinic/BillingInsights';
          import {useResource} from '/src/shared/ui';
          import {ClinicAppearanceScope} from '/src/features/clinic/Appearance';
          function Payments(){const {data}=useResource('/api/clinic/billing');return data?React.createElement(BillingPayments,{data,canOpenPatient:false}):null;}
          createRoot(document.getElementById('root')).render(React.createElement(ClinicAppearanceScope,
            {preferences:{palette:'cobalt',mode:'light',version:1},systemDark:false},
            React.createElement(new URLSearchParams(location.search).has('payments')?Payments:Billing)));`;
        },
        configureServer(vite) {
          vite.middlewares.use("/qa", async (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await vite.transformIndexHtml(
                "/qa",
                '<link rel="stylesheet" href="/shared.css"><link rel="stylesheet" href="/launch.css"><link rel="stylesheet" href="/clinic.css"><div id="root"></div><script type="module" src="/qa-entry.tsx"></script>',
              ),
            );
          });
        },
      },
    ],
  });
  await server.listen();
  base = server.resolvedUrls!.local[0];
  browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : process.platform === "win32"
        ? { channel: "msedge" }
        : {},
  );
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});
async function open(path: string) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    serviceWorkers: "block",
  });
  const requests: { path: string; method: string }[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error("synthetic page error:", error.message);
  });
  await page.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin !== new URL(base).origin || request.method() !== "GET")
      return route.abort("blockedbyclient");
    if (!url.pathname.startsWith("/api/")) return route.continue();
    requests.push({
      path: url.pathname + url.search,
      method: request.method(),
    });
    let body: unknown,
      status = 200;
    if (url.pathname === "/api/csrf")
      body = { csrf_token: "synthetic-read-only-fixture" };
    else if (url.pathname === "/api/clinic/patients/706/billing_ledger")
      body = ledger;
    else if (url.pathname === "/api/clinic/billing") body = payments;
    else if (url.pathname === "/api/clinic/patients/lookup") {
      const q = url.searchParams.get("q");
      if (q === "Rowan") body = { patients: [patient] };
      else if (q === "NoMatch") body = { patients: [] };
      else {
        status = 400;
        body = { error: "Enter at least one patient matching field." };
      }
    } else throw new Error(`Unexpected synthetic GET: ${url.pathname}`);
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.goto(`${base}qa?${path}`);
  return { page, requests, errors };
}
function normalized(value: string) {
  return value.replace(/\s+/g, " ");
}
async function settled(page: Page) {
  try {
    await page
      .getByRole("heading", { name: "Rowan Brooks", exact: true })
      .waitFor();
    await page.locator("#billing-payment-10168").waitFor();
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : error}\nSynthetic body: ${await page.locator("body").innerText()}`,
    );
  }
}
it("projects the same payment 10168 in practice UTC across Payments and the patient ledger, retaining its distinct allocation instant", async () => {
  const first = await open("patient_id=706&invoice_id=13554&payment_id=10168");
  const second = await open("payments");
  try {
    await settled(first.page);
    const history = normalized(
      await first.page.locator("#billing-payment-10168").innerText(),
    );
    expect(history).toContain("Recorded Oct 1, 2026, 10:34 PM (UTC)");
    const details = first.page.getByRole("button", {
      name: /^Invoice #13554 details/,
    });
    if ((await details.getAttribute("aria-expanded")) === "false")
      await details.click();
    const allocation = first.page
      .getByText("Payment allocation #10168 · Payment event #10168", {
        exact: true,
      })
      .locator("..");
    expect(normalized(await allocation.innerText())).toContain(
      "USD 159.00 · Recorded Oct 1, 2026, 10:37 PM (UTC)",
    );
    const invoices = first.page.getByRole("table", {
      name: "Patient invoice ledger",
      exact: true,
    });
    expect(normalized(await invoices.innerText())).toContain("Oct 1, 2026");
    await second.page
      .getByRole("button", { name: "Payment #10168", exact: true })
      .waitFor();
    const row = second.page.getByRole("row").filter({
      has: second.page.getByRole("button", {
        name: "Payment #10168",
        exact: true,
      }),
    });
    expect(normalized(await row.innerText())).toContain(
      "Oct 1, 2026, 10:34 PM (UTC)",
    );
    expect(normalized(await row.innerText())).toContain("USD 159.00");
    expect(paymentAt).not.toBe(allocationAt);
    expect(
      first.requests.filter((request) =>
        request.path.startsWith("/api/clinic/patients/lookup"),
      ),
    ).toEqual([]);
    expect(
      [...first.requests, ...second.requests].every(
        (request) => request.method === "GET",
      ),
    ).toBe(true);
    expect([...first.errors, ...second.errors]).toEqual([]);
  } finally {
    await first.page.close();
    await second.page.close();
  }
}, 60_000);
it("keeps the pristine patient deeplink quiet while executing matching searches and preserving actual lookup validation errors", async () => {
  const { page, requests, errors } = await open(
    "patient_id=706&invoice_id=13554&payment_id=10168",
  );
  try {
    await settled(page);
    await page
      .getByText(
        "Enter a clinic reference or recorded name to find a patient.",
        { exact: true },
      )
      .waitFor();
    expect(
      await page
        .getByRole("alert")
        .filter({ hasText: "Enter at least one patient matching field." })
        .count(),
    ).toBe(0);
    expect(
      requests.filter((request) =>
        request.path.startsWith("/api/clinic/patients/lookup"),
      ),
    ).toEqual([]);
    const search = page.getByRole("textbox", {
      name: "Search patients",
      exact: true,
    });
    await search.fill("   ");
    await page
      .getByText(
        "Enter a clinic reference or recorded name to find a patient.",
        { exact: true },
      )
      .waitFor();
    expect(
      requests.filter((request) =>
        request.path.startsWith("/api/clinic/patients/lookup"),
      ),
    ).toEqual([]);
    await search.fill("Rowan");
    const match = page.getByRole("list", {
      name: "Matching patients",
      exact: true,
    });
    await match.getByText("Rowan Brooks", { exact: true }).waitFor();
    expect(
      requests.some(
        (request) => request.path === "/api/clinic/patients/lookup?q=Rowan",
      ),
    ).toBe(true);
    await match.getByRole("button").click();
    await settled(page);
    await search.fill("NoMatch");
    await page
      .getByText("No matching patients were returned.", { exact: true })
      .waitFor();
    await search.fill("InvalidSynthetic");
    await page
      .getByRole("alert")
      .filter({ hasText: "Enter at least one patient matching field." })
      .waitFor();
    expect(
      requests.some(
        (request) =>
          request.path === "/api/clinic/patients/lookup?q=InvalidSynthetic",
      ),
    ).toBe(true);
    await search.fill("");
    await page
      .getByText(
        "Enter a clinic reference or recorded name to find a patient.",
        { exact: true },
      )
      .waitFor();
    expect(
      await page
        .getByRole("alert")
        .filter({ hasText: "Enter at least one patient matching field." })
        .count(),
    ).toBe(0);
    expect(
      await page
        .getByRole("heading", { name: "Rowan Brooks", exact: true })
        .count(),
    ).toBe(1);
    expect(requests.every((request) => request.method === "GET")).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}, 60_000);
