import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
beforeAll(async () => {
  const entry = "\0drawer-count-entry.tsx";
  const workspace = "\0drawer-count-workspace.ts";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "drawer-count-test",
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
            invoice: null, onRecorded: () => {},
          }));`;
        },
        configureServer(s) {
          s.middlewares.use("/cash-test", async (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await s.transformIndexHtml(
                "/cash-test",
                '<div id="root"></div><script type="module" src="/@id/__x00__drawer-count-entry.tsx"></script>',
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

it("#114 explains a negative count without submitting or dropping the input", async () => {
  const page = await browser.newPage();
  try {
    const closes = await countFixture(page);
    await page.getByLabel("Counted cash", { exact: true }).fill("-50");
    await page
      .getByRole("button", { name: "Close drawer", exact: true })
      .click();
    await page
      .getByText("Enter the counted cash amount with up to six decimal places.")
      .waitFor();
    expect(
      await page.getByLabel("Counted cash", { exact: true }).inputValue(),
    ).toBe("-50");
    expect(closes).toEqual([]);
  } finally {
    await page.close();
  }
});
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

async function countFixture(page: Page) {
  page.setDefaultTimeout(5000);
  const closes: Array<{
    drawer: {
      counted_cash: string;
      discrepancy_explanation: string;
      request_key: string;
    };
  }> = [];
  let drawer = {
    id: 707,
    site_id: 704,
    status: "open",
    currency: "USD",
    opening_float: "100",
    expected_cash: "100",
    cash_received: "0",
    cash_refunded: "0",
    counted_cash: null as string | null,
    discrepancy: null as string | null,
    reconciliation_status: "pending",
  };
  await page.route(`${baseUrl}/api/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown;
    if (path === "/api/csrf") body = { csrf_token: "synthetic-token" };
    else if (path === "/api/clinic/cash_drawers") body = { drawers: [drawer] };
    else if (path === "/api/clinic/cash_drawers/707/close") {
      const payload = route.request().postDataJSON();
      closes.push(payload);
      expect(payload.drawer.counted_cash).toBe("0");
      drawer = {
        ...drawer,
        status: "closed",
        counted_cash: "0",
        discrepancy: "-100",
      };
      body = { drawer };
    } else throw new Error(`Unexpected synthetic request: ${path}`);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.goto(`${baseUrl}/cash-test`);
  await page.getByLabel("Counted cash", { exact: true }).waitFor();
  return closes;
}

it("#113 warns before a valid zero count and preserves the reported discrepancy for reconciliation", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  try {
    const closes = await countFixture(page);
    await page.getByLabel("Counted cash", { exact: true }).fill("0");
    await page
      .getByText(
        "You entered USD 0.00 as the physical count. Confirm the drawer is empty before closing.",
      )
      .waitFor();
    expect(closes).toEqual([]);
    await page
      .getByLabel("Short / over explanation (optional)")
      .fill("Synthetic empty physical drawer");
    await page
      .getByRole("button", { name: "Close drawer", exact: true })
      .click();
    await page
      .getByText(/Drawer closed with a USD -100.00 discrepancy/)
      .waitFor();
    const summary = page.getByText(/Closed drawer · Counted USD 0.00/);
    await summary.waitFor();
    expect(await summary.textContent()).toContain("Discrepancy USD -100.00");
    expect(await summary.textContent()).toContain(
      "Awaiting manager reconciliation",
    );
    expect(closes).toHaveLength(1);
    expect(closes[0].drawer.discrepancy_explanation).toBe(
      "Synthetic empty physical drawer",
    );
    expect(closes[0].drawer.request_key).toBeTruthy();
  } finally {
    await page.close();
  }
}, 15000);
