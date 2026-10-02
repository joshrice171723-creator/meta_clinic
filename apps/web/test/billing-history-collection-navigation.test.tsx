import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright-core";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Constructed, read-only mock data. IDs93/13552 identify the reported route;
// these amounts, history records and timestamps are not captured domain data.
const patient = {
  id: 706,
  display_name: "Synthetic collection patient",
  reference: "SYN-COLLECTION",
};
const invoice = {
  id: 13552,
  status: "posted",
  currency: "USD",
  total: "30.00",
  allocated: "25.00",
  credited: "0.00",
  balance: "5.00",
  age_days: 1,
  age_bucket: "0_30",
  created_at: "2026-10-01T12:00:00Z",
  patient,
};
const collection = {
  id: 93,
  invoice_id: 13552,
  status: "failed",
  next_action: "review_failure",
  processor: "synthetic",
  mode: "test",
  amount: "12.00",
  currency: "USD",
  requested_at: "2026-10-01T12:00:00Z",
  updated_at: "2026-10-01T12:01:00Z",
  invoice_status: "posted",
  patient,
};
const history = [
  {
    id: 1,
    event: "create",
    actor_reference: "user:702",
    changed_fields: ["patient_id", "currency", "created_at"],
    occurred_at: "2026-10-01T12:00:00Z",
  },
  {
    id: 2,
    event: "update",
    actor_reference: "   ",
    changed_fields: ["status", "updated_at"],
    occurred_at: "2026-10-01T12:01:00Z",
  },
  {
    id: 3,
    event: "destroy",
    actor_reference: null,
    changed_fields: ["void_reason"],
    occurred_at: "2026-10-01T12:02:00Z",
  },
  {
    id: 4,
    event: "custom_future_event",
    actor_reference: null,
    changed_fields: ["custom_future_field"],
    occurred_at: "2026-10-01T12:03:00Z",
  },
];
const root =
  process.env.QA_BILLING_TEST_ROOT ||
  fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = process.env.QA_BILLING_SOURCE_ROOT;
const baselineDir = process.env.QA_BILLING_BASELINE_DIR;
const evidenceDir = process.env.QA_BILLING_PREVIEW_DIR;
const acceptedCssFile = process.env.QA_BILLING_CSS_FILE;
let sourcePhase: "before" | "after" = "after";
const preview: unknown[] = [];
const modules: Record<string, string> = {
  "./Workspace": `export const useClinic=()=>({practice:{id:701,name:'Synthetic practice',timezone:'UTC'},user_id:702,membership_id:703,sites:[{id:704}],capabilities:{billing_read:true,patient_identity_read:true}});`,
  "./BillingInsights": `export * from '/src/features/clinic/BillingInsights';
    export const BillingIncomeOutlook=()=>null; export const BillingPayments=()=>null;`,
  "./subscriptions/SubscriptionBilling":
    "export const SubscriptionBilling=()=>null;",
  "./BillingSupportRequestQueue":
    "export const BillingSupportRequestQueue=()=>null;",
  "./CashDrawerOperations": `export const CashDrawerOperations=()=>null;export const hasPendingCashAttempt=()=>false;export const pendingCashAttemptInvoiceId=()=>null;`,
  "./InvoiceCheckoutControls": `import React from 'react';
    export const InvoiceCheckoutControls=({onChanged,onlinePayment})=>React.createElement('button',{onClick:onChanged,'data-projection':onlinePayment.reason},'Refresh synthetic projected records');
    export const invoicePaymentReturnMarker=()=>null;export const clearInvoicePaymentReturnMarker=()=>{};`,
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
      mkdtempSync(join(tmpdir(), "billing-history-navigation-")),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "synthetic-billing-history-navigation",
        enforce: "pre",
        resolveId(id, importer) {
          if (id === "/qa-entry.tsx") return "\0qa-entry.tsx";
          if (importer?.includes("/src/features/clinic/") && id in modules)
            return `\0qa-mock:${id}`;
        },
        load(id) {
          if (id.startsWith("\0qa-mock:")) return modules[id.slice(9)];
          if (
            acceptedCssFile &&
            id.split("?")[0] ===
              join(root, "src/features/clinic/billing.css").replaceAll(
                "\\",
                "/",
              )
          )
            return readFileSync(acceptedCssFile, "utf8");
          const name = id.split("?")[0].split("/").at(-1);
          if (
            ["BillingDashboard.tsx", "BillingInsights.tsx"].includes(name!) &&
            id.split("?")[0] ===
              join(root, "src/features/clinic", name!).replaceAll("\\", "/")
          ) {
            const file =
              sourcePhase === "before" && baselineDir
                ? join(baselineDir, name!)
                : sourceRoot
                  ? join(sourceRoot, "src/features/clinic", name!)
                  : undefined;
            if (file) return readFileSync(file, "utf8");
          }
          if (id === "\0qa-entry.tsx")
            return `import React from 'react';import {createRoot} from 'react-dom/client';
          import '/src/shared/forms.css';import {BillingDashboard} from '/src/features/clinic/BillingDashboard';
          import {ClinicAppearanceScope} from '/src/features/clinic/Appearance';
          createRoot(document.getElementById('root')).render(React.createElement(ClinicAppearanceScope,
            {preferences:{palette:'cobalt',mode:'light',version:1},systemDark:false},React.createElement(BillingDashboard)));`;
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
  if (evidenceDir)
    writeFileSync(
      join(evidenceDir, "controlled-preview.json"),
      JSON.stringify(preview, null, 2) + "\n",
    );
});
async function open(
  phase: "before" | "after",
  options = { removedOnQuery: false },
) {
  sourcePhase = phase;
  server.moduleGraph.invalidateAll();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    locale: "en-US",
    timezoneId: "UTC",
    serviceWorkers: "block",
  });
  const requests: { path: string; method: string }[] = [],
    blocked: string[] = [],
    errors: string[] = [];
  const state = {
    items: [structuredClone(collection)],
    pending: false,
    patientId: 706,
    currency: "USD",
    invoiceId: 13552,
    revision: 0,
  };
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error(error.message);
  });
  await page.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin !== new URL(base).origin || request.method() !== "GET") {
      blocked.push(request.method() + " " + url.pathname);
      return route.abort("blockedbyclient");
    }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    requests.push({
      path: url.pathname + url.search,
      method: request.method(),
    });
    let body: unknown;
    if (url.pathname === "/api/csrf")
      body = { csrf_token: "synthetic-read-only-fixture" };
    else if (url.pathname === "/api/clinic/billing")
      body = {
        schema_version: "clinic-billing-v1",
        practice: { id: 701, name: "Synthetic practice", timezone: "UTC" },
        period: { start: "2026-10-01", end: "2026-11-01" },
        metrics: { draft_count: 0, currencies: [] },
        recent_invoices: [invoice],
        invoice_pagination: { total: 1, total_pages: 1, page: 1 },
        pending_online_payments: [],
        unbilled_encounters: { available: false, total: null, items: [] },
        collection_worklist: {
          total_count:
            options.removedOnQuery && url.searchParams.get("q")
              ? 0
              : state.items.length,
          limit: 50,
          items:
            options.removedOnQuery && url.searchParams.get("q")
              ? []
              : state.items,
        },
      };
    else if (url.pathname === "/api/clinic/invoices/13552")
      body = {
        invoice: {
          id: state.invoiceId,
          patient_id: state.patientId,
          status: "posted",
          currency: state.currency,
          total_amount: "30.00",
          allocated_amount: "25.00",
          credit_amount: "0.00",
          balance_amount: "5.00",
          lines: [],
          allocations: [],
          credits: [],
          audit_timeline: history,
          online_payment: {
            state: state.pending ? "processing" : "unavailable",
            eligible: false,
            can_cancel: state.pending,
            amount: "5.00",
            currency: state.currency,
            collection_intent_id: state.pending ? 93 : null,
            reason: `synthetic_read_only_${state.patientId}_${state.currency}_${state.invoiceId}_${state.revision}`,
          },
        },
      };
    else throw new Error(`Unexpected synthetic GET: ${url.pathname}`);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.goto(`${base}qa`);
  await page
    .getByRole("button", { name: "Open invoice", exact: true })
    .waitFor();
  const dialog = page.getByRole("dialog", {
    name: "Invoice details",
    exact: true,
  });
  return { page, dialog, requests, blocked, errors, state };
}
for (const phase of ["before", "after"] as const) {
  const test = phase === "before" && !baselineDir ? it.skip : it;
  test(`controlled collection93 to invoice13552 preview: ${phase}`, async () => {
    const fixture = await open(phase);
    const { page, dialog, requests, blocked, errors } = fixture;
    let activations = 1;
    try {
      const response = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/api/clinic/billing" &&
          new URL(r.url()).searchParams.get("q") === "13552",
      );
      await page
        .getByRole("button", { name: "Open invoice", exact: true })
        .click();
      await response;
      if (phase === "before") {
        expect(await dialog.count()).toBe(0);
        await page.getByRole("button", { name: "#13552", exact: true }).click();
        activations++;
      }
      await dialog.waitFor();
      await dialog
        .getByRole("heading", { name: "Invoice #13552", exact: true })
        .waitFor();
      const ledgerQuery = requests.findLast((r) =>
        r.path.startsWith("/api/clinic/billing?"),
      )!.path;
      const query = new URL(ledgerQuery, base).searchParams;
      expect(query.get("q")).toBe("13552");
      expect(query.get("filter")).toBe("all");
      expect(query.get("sort")).toBe("recent");
      expect(query.get("page")).toBe("1");
      const text = await dialog.innerText();
      expect(text).toContain("USD 30.00");
      expect(text).toContain("USD 25.00");
      expect(text).toContain("USD 5.00");
      if (phase === "after") {
        await dialog
          .getByRole("heading", {
            name: "Selected collection #93 · Failed",
            exact: true,
          })
          .waitFor();
        expect(await dialog.innerText()).toContain(
          "Collection request amount: USD 12.00",
        );
        expect(await dialog.innerText()).toContain(
          "A failure reason is not included in this collection record.",
        );
        expect(await dialog.innerText()).toContain(
          "Review the failure before starting a new collection request.",
        );
      }
      expect(activations).toBe(phase === "before" ? 2 : 1);
      if (evidenceDir)
        await page.screenshot({
          path: join(evidenceDir, `${phase}-collection93-invoice13552.png`),
        });
      preview.push({
        phase,
        collection_id: 93,
        invoice_id: 13552,
        patient_id: 706,
        currency: "USD",
        activations,
        ledger_query: ledgerQuery,
        invoice_total: "30.00",
        allocated_amount: "25.00",
        invoice_balance: "5.00",
        collection_request_amount: "12.00",
        context_visible: phase === "after",
        requests,
        blocked,
        page_errors: errors,
      });
      expect(requests.every((r) => r.method === "GET")).toBe(true);
      expect(blocked).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);
}
it("humanizes confirmed history codes without assigning outcomes or actors, preserving accessible raw details", async () => {
  const { page, dialog, requests, blocked, errors } = await open("after");
  try {
    await page.getByRole("button", { name: "#13552", exact: true }).click();
    await dialog.waitFor();
    const entries = dialog.locator(".billing-audit-timeline > ol > li");
    await entries.nth(3).waitFor();
    expect(
      (await entries.locator(":scope > strong").allTextContents()).map((text) =>
        text.trim(),
      ),
    ).toEqual([
      "Invoice record created",
      "Invoice record updated",
      "Invoice record removed",
      "Invoice event recorded",
    ]);
    expect(await entries.nth(0).innerText()).toContain(
      "Patient ID, Currency, Creation time",
    );
    expect(await entries.nth(0).innerText()).toContain("user:702");
    for (const index of [1, 2, 3])
      expect(await entries.nth(index).innerText()).toContain(
        "Actor not recorded",
      );
    expect(await entries.nth(3).innerText()).toContain("Other recorded field");
    for (let index = 0; index < history.length; index++) {
      await entries
        .nth(index)
        .getByRole("button", { name: "Technical event details", exact: true })
        .click();
      expect(await entries.nth(index).innerText()).toContain(
        `Event code: ${history[index].event}`,
      );
      expect(
        await entries.nth(index).locator("code").nth(1).textContent(),
      ).toBe(JSON.stringify(history[index].actor_reference));
      expect(await entries.nth(index).innerText()).toContain(
        history[index].changed_fields.join(", "),
      );
      expect(await entries.nth(index).innerText()).toContain(
        history[index].occurred_at,
      );
    }
    expect(
      await dialog
        .getByText("Selected collection #93 · Failed", { exact: true })
        .count(),
    ).toBe(0);
    expect(requests.every((r) => r.method === "GET")).toBe(true);
    expect(blocked).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}, 60_000);
it("uses current collection records and clears context for unavailable identity, uncertainty, removal and ordinary opens", async () => {
  const { page, dialog, state, requests, blocked, errors } =
    await open("after");
  try {
    await page
      .getByRole("button", { name: "Open invoice", exact: true })
      .click();
    await dialog
      .getByRole("heading", {
        name: "Selected collection #93 · Failed",
        exact: true,
      })
      .waitFor();
    const refresh = dialog.getByRole("button", {
      name: "Refresh synthetic projected records",
      exact: true,
    });
    const refreshProjection = async () => {
      state.revision++;
      const reason = `synthetic_read_only_${state.patientId}_${state.currency}_${state.invoiceId}_${state.revision}`;
      const reads = Promise.all([
        page.waitForResponse(
          (r) => new URL(r.url()).pathname === "/api/clinic/billing",
        ),
        page.waitForResponse(
          (r) => new URL(r.url()).pathname === "/api/clinic/invoices/13552",
        ),
      ]);
      await refresh.click();
      await reads;
      await page.waitForFunction(
        (reason) =>
          document
            .querySelector("[data-projection]")
            ?.getAttribute("data-projection") === reason,
        reason,
      );
    };
    state.pending = true;
    await refreshProjection();
    await dialog
      .getByText(/The selected collection context is unavailable/)
      .waitFor();
    expect(
      await dialog
        .getByText(
          "Review the failure before starting a new collection request.",
          { exact: true },
        )
        .count(),
    ).toBe(0);
    state.items[0].status = "processing";
    state.items[0].next_action = "refresh_status";
    await refreshProjection();
    const processing = () =>
      dialog
        .getByRole("heading", {
          name: "Selected collection #93 · Processing",
          exact: true,
        })
        .waitFor();
    await processing();
    expect(await dialog.innerText()).toContain(
      "Refresh processor status before recording another payment.",
    );
    expect(
      await dialog
        .getByText(
          "A failure reason is not included in this collection record.",
          { exact: true },
        )
        .count(),
    ).toBe(0);
    state.pending = false;
    state.patientId = 999;
    await refreshProjection();
    await dialog
      .getByText(/The selected collection context is unavailable/)
      .waitFor();
    state.patientId = 706;
    await refreshProjection();
    await processing();
    state.currency = "EUR";
    await refreshProjection();
    await dialog
      .getByText(/The selected collection context is unavailable/)
      .waitFor();
    state.currency = "USD";
    await refreshProjection();
    await processing();
    state.invoiceId = 13553;
    await refreshProjection();
    expect(
      await dialog
        .getByRole("heading", { name: /Selected collection #93/ })
        .count(),
    ).toBe(0);
    state.invoiceId = 13552;
    await refreshProjection();
    await processing();
    state.items = [];
    await refreshProjection();
    await dialog
      .getByText(/The selected collection context is unavailable/)
      .waitFor();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "#13552", exact: true }).click();
    await dialog.waitFor();
    expect(
      await dialog
        .getByText(/The selected collection context is unavailable/)
        .count(),
    ).toBe(0);
    expect(
      await dialog
        .getByRole("heading", { name: /Selected collection #93/ })
        .count(),
    ).toBe(0);
    expect(requests.every((r) => r.method === "GET")).toBe(true);
    expect(blocked).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}, 60_000);

it("shows explicit unavailable context when collection93 disappears during the invoice query refetch", async () => {
  const { page, dialog, requests, blocked, errors } = await open("after", {
    removedOnQuery: true,
  });
  try {
    const response = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/clinic/billing" &&
        new URL(r.url()).searchParams.get("q") === "13552",
    );
    await page
      .getByRole("button", { name: "Open invoice", exact: true })
      .click();
    await response;
    await dialog
      .getByRole("heading", { name: "Invoice #13552", exact: true })
      .waitFor();
    await dialog
      .getByText(/The selected collection context is unavailable/)
      .waitFor();
    expect(
      await dialog
        .getByRole("heading", { name: /Selected collection #93/ })
        .count(),
    ).toBe(0);
    expect(requests.every((r) => r.method === "GET")).toBe(true);
    expect(blocked).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}, 60_000);
