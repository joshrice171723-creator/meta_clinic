import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
beforeAll(async () => {
  const entry = "\0cash-recovery-entry.tsx";
  const workspace = "\0cash-recovery-workspace.ts";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "cash-recovery-test",
        enforce: "pre",
        resolveId(id, importer) {
          if (id === entry) return entry;
          if (
            id === "./Workspace" &&
            importer?.endsWith("CashDrawerOperations.tsx")
          )
            return workspace;
        },
        load(id) {
          if (id === workspace)
            return `const clinic = {
          practice: {id: 701}, user_id: 702, membership_id: 703,
          capabilities: {billing_payment_record: true}, sites: [{id: 704, name: "Synthetic site"}]
        }; export const useClinic = () => clinic;`;
          if (id !== entry) return;
          return `import React from "react";
          import {createRoot} from "react-dom/client";
          import {CashDrawerOperations} from "/src/features/clinic/CashDrawerOperations";
          const invoice = {id: 705, status: "posted", currency: "USD", balance: "25"};
          createRoot(document.getElementById("root")).render(React.createElement(CashDrawerOperations, {
            invoice, patientId: 706, onRecorded: () => {},
          }));`;
        },
        configureServer(s) {
          s.middlewares.use("/cash-test", async (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await s.transformIndexHtml(
                "/cash-test",
                '<div id="root"></div><script type="module" src="/@id/__x00__cash-recovery-entry.tsx"></script>',
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

const receipt = () => ({
  payment_allocation: { id: 708, payment_event_id: 709, amount: "25.00" },
  cash_tender: {
    id: 710,
    cash_drawer_session_id: 707,
    tendered_amount: "30.00",
    change_amount: "5.00",
  },
});
type Reply = { status: number; body: unknown };
async function fixture(page: Page, replies: Reply[]) {
  page.on("pageerror", (error) => console.error(error));
  page.setDefaultTimeout(5000);
  const attempts: unknown[] = [];
  const draft = {
    kind: "checkout",
    patient_id: 706,
    encounter_id: null,
    record_id: 705,
    scope: "cash_payment",
    version: 0,
    payload: null as unknown,
    updated_at: null,
  };
  await page.route(`${baseUrl}/api/**`, async (route) => {
    const url = new URL(route.request().url());
    let body: unknown;
    let status = 200;
    if (url.pathname === "/api/csrf") body = { csrf_token: "synthetic-token" };
    else if (url.pathname === "/api/clinic/cash_drawers")
      body = {
        drawers: [
          {
            id: 707,
            site_id: 704,
            site_name: "Synthetic site",
            status: "open",
            currency: "USD",
            opening_float: "0",
            expected_cash: "0",
            cash_received: "0",
            change_given: "0",
            cash_refunded: "0",
          },
        ],
      };
    else if (url.pathname === "/api/clinic/working_drafts/checkout") {
      if (route.request().method() === "PUT") {
        const submitted = route.request().postDataJSON();
        expect(submitted.expected_version).toBe(draft.version);
        draft.version += 1;
        draft.payload = submitted.payload;
      }
      body = draft;
    } else if (url.pathname === "/api/clinic/invoices/705/cash_payments") {
      attempts.push(route.request().postDataJSON());
      const reply = replies.shift();
      if (!reply) throw new Error("Unexpected cash submission");
      status = reply.status;
      body = reply.body;
    } else throw new Error(`Unexpected request: ${url.pathname}`);
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.goto(`${baseUrl}/cash-test`);
  await page.getByLabel("Tendered cash").fill("30");
  return { attempts, draft };
}

async function submit(page: Page, retry = false) {
  await page
    .getByRole("button", {
      name: retry ? "Retry same payment" : "Record cash payment",
      exact: true,
    })
    .click();
}
async function locked(page: Page) {
  await expect
    .poll(() =>
      page
        .getByRole("button", { name: "Retry same payment", exact: true })
        .isVisible(),
    )
    .toBe(true);
  expect(await page.getByLabel("Tendered cash").isDisabled()).toBe(true);
  expect(
    await page
      .getByRole("button", { name: "I verified it is recorded" })
      .count(),
  ).toBe(0);
}

it.each([400, 404, 422])(
  "retains the original uncertain payment after a %s retry rejection and reload",
  async (status) => {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    try {
      const state = await fixture(page, [
        { status: 500, body: { error: "Synthetic Internal Server Error" } },
        { status, body: { error: "Synthetic retry rejection" } },
        { status: 201, body: receipt() },
      ]);
      await submit(page);
      await page.getByText(/Synthetic Internal Server Error/).waitFor();
      await locked(page);
      await page.reload();
      await locked(page);
      await submit(page, true);
      await page.getByText(/Synthetic retry rejection/).waitFor();
      await locked(page);
      expect(state.draft.payload).not.toBeNull();
      await submit(page, true);
      await page
        .getByText("Cash payment recorded. Change due: USD 5.00.")
        .waitFor();
      expect(state.draft.payload).toBeNull();
      expect(state.attempts).toHaveLength(3);
      expect(state.attempts[1]).toEqual(state.attempts[0]);
      expect(state.attempts[2]).toEqual(state.attempts[0]);
    } finally {
      await page.close();
    }
  },
  20000,
);

it("allows correction after a definite first-attempt rejection", async () => {
  const page = await browser.newPage();
  try {
    const state = await fixture(page, [
      { status: 422, body: { error: "Synthetic initial rejection" } },
    ]);
    await submit(page);
    await page
      .getByText("Synthetic initial rejection", { exact: true })
      .waitFor();
    expect(await page.getByLabel("Tendered cash").isEnabled()).toBe(true);
    expect(state.draft.payload).toBeNull();
  } finally {
    await page.close();
  }
});

it.each(["allocation", "tender", "change", "receipt"])(
  "keeps the lock when the server acknowledgment has a mismatched %s",
  async (field) => {
    const page = await browser.newPage();
    try {
      const wrong = receipt();
      if (field === "allocation") wrong.payment_allocation.amount = "24";
      if (field === "tender") wrong.cash_tender.tendered_amount = "40";
      if (field === "change") wrong.cash_tender.change_amount = "4";
      if (field === "receipt") wrong.payment_allocation.payment_event_id = 0;
      const state = await fixture(page, [{ status: 201, body: wrong }]);
      await submit(page);
      await page.getByText(/did not match/).waitFor();
      await locked(page);
      expect(state.draft.payload).not.toBeNull();
    } finally {
      await page.close();
    }
  },
);

it("#145 renders one pending-cash warning without duplicated punctuation", async () => {
  const page = await browser.newPage();
  try {
    await fixture(page, [
      { status: 500, body: { error: "Synthetic uncertain cash response" } },
    ]);
    await submit(page);
    const warning = page.getByText(
      /Cash payment outcome is pending confirmation for invoice/,
    );
    await warning.waitFor();
    expect(await warning.count()).toBe(1);
    const text = (await warning.textContent())!.replace(/\s+/g, " ");
    expect(text).toBe(
      "Cash payment outcome is pending confirmation for invoice #705. Its drawer and amounts are locked. Review activity, then retry this same payment if it is missing. Retrying uses the same request key, so it cannot create a duplicate payment.",
    );
  } finally {
    await page.close();
  }
});
