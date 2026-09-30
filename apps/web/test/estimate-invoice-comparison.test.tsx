import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";
import type { CashPayEstimate } from "../src/features/clinic/CashPayEstimates";
import type { EstimateInvoiceComparison } from "../src/api/contracts";

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
beforeAll(async () => {
  const virtualId = "\0estimate-comparison-entry.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "estimate-comparison-test",
        resolveId: (id) => (id === virtualId ? virtualId : undefined),
        load(id) {
          if (id !== virtualId) return;
          return `import React from "react";
          import {createRoot} from "react-dom/client";
          import {CashPayEstimates} from "/src/features/clinic/CashPayEstimates";
          const invoices = [
            {id: 801, status: "posted", currency: "USD"},
            {id: 802, status: "posted", currency: "USD"},
            {id: 803, status: "draft", currency: "USD"},
            {id: 804, status: "void", currency: "USD"},
            {id: 805, status: "posted", currency: "EUR"},
          ];
          function Fixture() {
            const [patientId, setPatientId] = React.useState(701);
            return React.createElement(React.Fragment, null,
              React.createElement("button", {onClick: () => setPatientId(702)}, "Switch synthetic patient"),
              React.createElement(CashPayEstimates, {
                key: patientId, patientId, patientName: "Synthetic comparison patient",
                canDraft: new URLSearchParams(location.search).has("writer"), invoices: patientId === 701 ? invoices : [invoices[1]],
              })
            );
          }
          createRoot(document.getElementById("root")).render(React.createElement(Fixture));`;
        },
        configureServer(s) {
          s.middlewares.use("/comparison-test", async (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await s.transformIndexHtml(
                "/comparison-test",
                '<div id="root"></div><script type="module" src="/@id/__x00__estimate-comparison-entry.tsx"></script>',
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
  baseUrl = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || "/usr/bin/chromium",
    headless: true,
  });
}, 15000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

function estimate(patientId = 701, draft = false): CashPayEstimate {
  return {
    id: draft ? 902 : patientId === 701 ? 900 : 901,
    patient_id: patientId,
    practice_name: "Synthetic comparison clinic",
    clinic_contact_snapshot: {},
    total_amount: "75.3",
    classification: draft ? "gfe_candidate" : "issued_gfe",
    status: draft ? "draft" : "issued",
    currency: "USD",
    policy_version: draft ? null : "synthetic-policy-v1",
    delivery_method: null,
    issued_at: draft ? null : "2026-09-29T12:00:00Z",
    delivered_at: null,
    supersedes_id: null,
    correction_reason: null,
    revision: 1,
    payment_context: "unknown",
    request_context: null,
    scheduled_context: null,
    lines: [
      {
        id: 711,
        billing_service_id: 77,
        date_basis: null,
        source_price_revision: draft ? null : 4,
        service_offering_id: null,
        quantity: "1.0",
        unit_amount: "75.3",
        expected_amount: "75.3",
        description: "Synthetic estimated service",
        inclusions: null,
        exclusions: "No laboratory charges",
      },
    ],
  };
}

function comparison(
  patientId: number,
  estimateId: number,
  invoiceId: number,
): EstimateInvoiceComparison {
  const original = estimate(patientId);
  const posted = invoiceId === 801 ? "95.3" : "75.2";
  return {
    schema_version: "estimate-invoice-comparison-v1",
    comparison_basis: "posted_charges_before_payments_and_credits",
    patient_id: patientId,
    currency: "USD",
    generated_at: "2026-09-30T12:00:00Z",
    difference_amount: invoiceId === 801 ? "20.0" : "-0.1",
    estimate: {
      id: estimateId,
      revision: 1,
      status: "issued",
      issued_at: original.issued_at!,
      total_amount: original.total_amount,
      lines: original.lines,
    },
    invoice: {
      id: invoiceId,
      status: "posted",
      created_at: "2026-09-30T11:00:00Z",
      updated_at: "2026-09-30T11:30:00Z",
      total_amount: posted,
      lines: [
        {
          id: 811,
          description: "Synthetic posted service",
          quantity: "1.0",
          unit_amount: posted,
          posted_amount: posted,
        },
      ],
    },
  };
}

type FixtureOptions = {
  failure?: number;
  wrongScope?: boolean;
  firstGate?: Promise<void>;
  writer?: boolean;
  onWrite?: (body: Record<string, unknown>) => void;
};
async function fixture(page: Page, options: FixtureOptions = {}) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const requests: { method: string; path: string; query: string }[] = [];
  let saved: CashPayEstimate | null = null;
  let issueAttempts = 0;
  await page.route(/^http:\/\/127\.0\.0\.1:\d+\/api\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    requests.push({
      method: request.method(),
      path: url.pathname,
      query: url.search,
    });
    if (
      options.writer &&
      request.method() === "POST" &&
      (url.pathname === "/api/clinic/cash_pay_estimates" ||
        url.pathname === "/api/clinic/cash_pay_estimates/903/issue")
    ) {
      const body = request.postDataJSON() as {
        estimate: Record<string, unknown>;
      };
      options.onWrite?.(body.estimate);
      if (url.pathname.endsWith("/issue")) {
        if (++issueAttempts === 1) {
          await route.fulfill({
            status: 503,
            json: { error: "Synthetic outcome unknown" },
          });
          return;
        }
        saved = {
          ...saved!,
          status: "issued",
          classification: "issued_gfe",
          issued_at: "2026-09-30T20:00:00Z",
        };
      } else {
        saved = {
          ...estimate(701, true),
          id: 903,
          payment_context: body.estimate
            .payment_context as CashPayEstimate["payment_context"],
          request_context: body.estimate.request_context as string,
          scheduled_context: body.estimate.scheduled_context as string,
          lines: [
            {
              ...estimate(701, true).lines[0],
              source_price_revision: 4,
              date_basis: (body.estimate.lines as { date_basis: string }[])[0]
                .date_basis,
            },
          ],
        };
      }
      await route.fulfill({ json: { estimate: saved } });
      return;
    }
    if (request.method() !== "GET") {
      await route.fulfill({
        status: 405,
        json: { error: "Fixture forbids financial writes" },
      });
      return;
    }
    if (url.pathname === "/api/csrf") {
      await route.fulfill({
        json: { csrf_token: "synthetic-fixture-not-a-credential" },
      });
      return;
    }
    if (url.pathname === "/api/clinic/billing_services") {
      await route.fulfill({
        json: {
          services: [
            {
              id: 77,
              name: "Synthetic visit",
              unit_amount: "75.3",
              currency: "USD",
              active: true,
            },
          ],
        },
      });
      return;
    }
    if (url.pathname === "/api/clinic/service_offerings") {
      await route.fulfill({ json: { service_offerings: [] } });
      return;
    }
    if (url.pathname === "/api/clinic/cash_pay_estimates") {
      const patientId = Number(url.searchParams.get("patient_id"));
      await route.fulfill({
        json: {
          estimates: [
            estimate(patientId),
            ...(saved ? [saved] : []),
            estimate(patientId, true),
          ],
          truncated: false,
        },
      });
      return;
    }
    if (url.pathname.endsWith("/invoice_comparison")) {
      if (options.failure) {
        const status = options.failure;
        options.failure = 0;
        await route.fulfill({
          status,
          json: { error: "Controlled comparison failure" },
        });
        return;
      }
      const patientId = Number(url.searchParams.get("patient_id"));
      const invoiceId = Number(url.searchParams.get("invoice_id"));
      const estimateId = Number(url.pathname.split("/").at(-2));
      if (invoiceId === 801 && options.firstGate) await options.firstGate;
      const payload = comparison(patientId, estimateId, invoiceId);
      if (options.wrongScope) {
        payload.patient_id = 999;
        payload.invoice.lines[0].description = "Foreign comparison content";
      }
      await route.fulfill({ json: { comparison: payload } });
      return;
    }
    await route.fulfill({
      status: 404,
      json: { error: "Unexpected fixture read" },
    });
  });
  await page.goto(
    `${baseUrl}/comparison-test${options.writer ? "?writer=1" : ""}`,
  );
  try {
    await expect
      .poll(
        () =>
          page.getByRole("combobox", { name: "Estimate to review" }).count(),
        { timeout: 5000 },
      )
      .toBe(1);
  } catch (error) {
    throw new Error(
      JSON.stringify({
        errors,
        body: await page.locator("body").innerText(),
        requests,
      }),
      { cause: error },
    );
  }
  return requests;
}

async function chooseInvoice(page: Page, id: number) {
  await page
    .getByRole("combobox", { name: "Posted invoice to compare" })
    .click();
  await page
    .getByRole("option", { name: `Invoice #${id} · USD`, exact: true })
    .click();
}
function panel(page: Page) {
  return page.getByRole("region", { name: "Estimate and invoice comparison" });
}
async function withPage(run: (page: Page) => Promise<void>) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  try {
    await run(page);
  } finally {
    await page.close();
  }
}

describe(
  "controlled estimate to posted-invoice comparison",
  { timeout: 15000 },
  () => {
    it("records draft facts, blocks unknown-context issue and retries the exact context after an uncertain outcome", () =>
      withPage(async (page) => {
        const writes: Record<string, unknown>[] = [];
        await fixture(page, {
          writer: true,
          onWrite: (body) => writes.push(body),
        });
        await page
          .getByRole("combobox", { name: "Estimate to review" })
          .click();
        await page
          .getByRole("option", {
            name: "#902 · revision 1 · gfe candidate · draft",
            exact: true,
          })
          .click();
        await page
          .getByLabel("Policy version", { exact: true })
          .fill("synthetic-reviewed-policy");
        expect(
          await page
            .getByRole("button", { name: "Issue selected GFE", exact: true })
            .isDisabled(),
        ).toBe(true);
        await page
          .getByRole("combobox", { name: "Service 1", exact: true })
          .click();
        await page
          .getByRole("option", {
            name: "Synthetic visit · USD 75.3",
            exact: true,
          })
          .click();
        await page
          .getByLabel("Charge date basis 1", { exact: true })
          .fill("Expected visit 2026-10-02; not booked");
        await page
          .getByRole("combobox", {
            name: "Recorded payment context",
            exact: true,
          })
          .click();
        await page
          .getByRole("option", { name: "Self-pay", exact: true })
          .click();
        await page
          .getByLabel("Request context", { exact: true })
          .fill("Requested 2026-09-30");
        await page
          .getByLabel("Scheduled context", { exact: true })
          .fill("No service scheduled");
        await page
          .getByRole("button", { name: "Save GFE candidate", exact: true })
          .click();
        await expect.poll(() => writes.length).toBe(1);
        expect(
          (writes[0].lines as { date_basis: string }[])[0].date_basis,
        ).toBe("Expected visit 2026-10-02; not booked");
        await expect
          .poll(() => page.locator("body").innerText())
          .toContain(
            "Charge date basis: Expected visit 2026-10-02; not booked",
          );
        await page
          .getByLabel("Policy version", { exact: true })
          .fill("synthetic-reviewed-policy");
        await page
          .getByRole("button", { name: "Issue selected GFE", exact: true })
          .click();
        await expect
          .poll(() =>
            page
              .getByRole("button", { name: "Retry exact request", exact: true })
              .count(),
          )
          .toBe(1);
        expect(
          await page
            .getByLabel("Request context", { exact: true })
            .isDisabled(),
        ).toBe(true);
        await page
          .getByRole("button", { name: "Retry exact request", exact: true })
          .click();
        await expect.poll(() => writes.length).toBe(3);
        expect(writes[2]).toEqual(writes[1]);
        expect(writes[2]).toMatchObject({
          payment_context: "self_pay",
          request_context: "Requested 2026-09-30",
          scheduled_context: "No service scheduled",
        });
        await page.reload();
        await page
          .getByRole("combobox", { name: "Estimate to review" })
          .click();
        await page
          .getByRole("option", {
            name: "#903 · revision 1 · issued gfe · issued",
            exact: true,
          })
          .click();
        expect(await page.locator("body").innerText()).toContain(
          "Scheduled context: No service scheduled",
        );
      }));
    it("read-only staff select an eligible invoice, inspect source lines and exact server totals, then reload", () =>
      withPage(async (page) => {
        const requests = await fixture(page);
        expect(await page.locator("body").innerText()).toContain(
          "Catalog price source: billing service #77 · revision 4",
        );
        const headings = await page.getByRole("heading").allTextContents();
        expect(headings.indexOf("Cash-pay estimates")).toBeLessThan(
          headings.indexOf("Compare with posted invoice"),
        );
        expect(headings.indexOf("Selected estimate")).toBeLessThan(
          headings.indexOf("Compare with posted invoice"),
        );
        await page
          .getByRole("combobox", { name: "Posted invoice to compare" })
          .click();
        expect(await page.getByRole("option").allTextContents()).toEqual([
          "Choose an invoice",
          "Invoice #801 · USD",
          "Invoice #802 · USD",
        ]);
        await page
          .getByRole("option", { name: "Invoice #801 · USD", exact: true })
          .click();
        await expect
          .poll(() => panel(page).textContent())
          .toContain("Difference (posted charges − estimate): USD 20.0");
        expect(await panel(page).textContent()).toContain(
          "Expected total: USD 75.3",
        );
        expect(await panel(page).textContent()).toContain(
          "Posted charges: USD 95.3",
        );
        expect(await panel(page).textContent()).toContain(
          "No laboratory charges",
        );
        expect(await panel(page).textContent()).toContain(
          "Synthetic posted service",
        );
        expect(
          await page
            .getByRole("button", { name: "Save GFE candidate", exact: true })
            .count(),
        ).toBe(0);
        await page.reload();
        await chooseInvoice(page, 801);
        expect(await page.locator("body").innerText()).toContain(
          "Catalog price source: billing service #77 · revision 4",
        );
        await expect
          .poll(() => panel(page).textContent())
          .toContain("Difference (posted charges − estimate): USD 20.0");
        expect(requests.every((request) => request.method === "GET")).toBe(
          true,
        );
      }));

    it("a failed read retains the selection and explicit refresh recovers without any financial write", () =>
      withPage(async (page) => {
        const requests = await fixture(page, { failure: 503 });
        await chooseInvoice(page, 801);
        await expect
          .poll(() => panel(page).textContent())
          .toContain("Controlled comparison failure");
        expect(
          await panel(page)
            .getByRole("heading", { name: /Invoice #801/ })
            .count(),
        ).toBe(0);
        await panel(page)
          .getByRole("button", { name: "Refresh comparison", exact: true })
          .click();
        await expect
          .poll(() => panel(page).textContent())
          .toContain("Posted charges: USD 95.3");
        const reads = requests.filter((request) =>
          request.path.endsWith("/invoice_comparison"),
        );
        expect(reads).toHaveLength(2);
        expect(reads[0]).toEqual(reads[1]);
        expect(requests.every((request) => request.method === "GET")).toBe(
          true,
        );
      }));

    it("switching invoices while a previous read is delayed cannot replace the selected comparison", () =>
      withPage(async (page) => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        const requests = await fixture(page, { firstGate: gate });
        try {
          await chooseInvoice(page, 801);
          await expect
            .poll(
              () =>
                requests.filter((request) =>
                  request.path.endsWith("/invoice_comparison"),
                ).length,
            )
            .toBe(1);
          await chooseInvoice(page, 802);
          await expect
            .poll(() => panel(page).textContent())
            .toContain("Difference (posted charges − estimate): USD -0.1");
          release();
          await page.waitForTimeout(75);
          expect(await panel(page).textContent()).not.toContain(
            "Posted charges: USD 95.3",
          );
          expect(
            await panel(page)
              .getByRole("heading", {
                name: "Invoice #802 · posted",
                exact: true,
              })
              .count(),
          ).toBe(1);
        } finally {
          release();
        }
      }));

    it("a patient switch clears comparison state and the next request uses only the new patient's estimate", () =>
      withPage(async (page) => {
        const requests = await fixture(page);
        await chooseInvoice(page, 801);
        await expect
          .poll(() => panel(page).textContent())
          .toContain("Posted charges: USD 95.3");
        await page
          .getByRole("button", {
            name: "Switch synthetic patient",
            exact: true,
          })
          .click();
        await expect
          .poll(() =>
            panel(page)
              .getByRole("combobox", { name: "Posted invoice to compare" })
              .count(),
          )
          .toBe(1);
        expect(await panel(page).textContent()).not.toContain(
          "Posted charges: USD 95.3",
        );
        await chooseInvoice(page, 802);
        await expect
          .poll(() =>
            panel(page)
              .getByRole("heading", {
                name: "Estimate #901 · revision 1 · issued",
                exact: true,
              })
              .count(),
          )
          .toBe(1);
        const last = requests
          .filter((request) => request.path.endsWith("/invoice_comparison"))
          .at(-1)!;
        expect(last.path).toContain("/901/");
        expect(last.query).toBe("?patient_id=702&invoice_id=802");
      }));

    it("denied reads and mismatched successful responses expose errors without rendering comparison data", async () => {
      for (const options of [{ failure: 403 }, { wrongScope: true }]) {
        await withPage(async (page) => {
          await fixture(page, options);
          await chooseInvoice(page, 801);
          await expect
            .poll(() => panel(page).getByRole("alert").count())
            .toBe(1);
          expect(await panel(page).textContent()).not.toContain(
            "Foreign comparison content",
          );
          expect(await panel(page).textContent()).not.toContain(
            "Posted charges: USD 95.3",
          );
          if (options.wrongScope)
            expect(await panel(page).textContent()).toContain(
              "does not match the selected records",
            );
        });
      }
    });

    it("selecting a draft keeps its snapshot readable and offers no issued-snapshot comparison", () =>
      withPage(async (page) => {
        const requests = await fixture(page);
        await page
          .getByRole("combobox", { name: "Estimate to review" })
          .click();
        await page
          .getByRole("option", {
            name: "#902 · revision 1 · gfe candidate · draft",
            exact: true,
          })
          .click();
        await expect.poll(() => panel(page).count()).toBe(0);
        expect(await page.locator("body").innerText()).toContain(
          "Catalog price revision not recorded",
        );
        expect(await page.locator("body").innerText()).toContain(
          "Charge date basis: Not recorded",
        );
        expect(await page.locator("body").innerText()).toContain(
          "Request context: Not recorded",
        );
        expect(
          await page
            .getByRole("heading", { name: "Selected estimate", exact: true })
            .count(),
        ).toBe(1);
        expect(
          requests.filter((request) =>
            request.path.endsWith("/invoice_comparison"),
          ),
        ).toHaveLength(0);
      }));
  },
);
