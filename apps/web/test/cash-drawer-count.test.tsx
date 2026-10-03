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
        "@mui/icons-material/AccountBalanceWalletOutlined",
        "@mui/icons-material/PrintOutlined",
      ],
    },
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
          capabilities: {billing_payment_record: true, billing_cash_reconcile: true}, sites: [{id: 704, name: "Synthetic site"}]
        }; export const useClinic = () => clinic;`;
          if (id !== entry) return;
          return `import React from "react";
          import {createRoot} from "react-dom/client";
          import {CashDrawerOperations} from "/src/features/clinic/CashDrawerOperations";
          function Fixture() {
            const [refreshVersion, setRefreshVersion] = React.useState(0);
            window.refreshDrawerFixture = () => setRefreshVersion(value => value + 1);
            return React.createElement(CashDrawerOperations, {
              invoice: null, onRecorded: () => {}, refreshVersion,
            });
          }
          createRoot(document.getElementById("root")).render(React.createElement(Fixture));`;
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
}, 60000);

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
it("#115 explains nonnumeric cash count without submitting or dropping the input", async () => {
  const page = await browser.newPage();
  try {
    const closes = await countFixture(page);
    await page.getByLabel("Counted cash", { exact: true }).fill("abc");
    await page
      .getByRole("button", { name: "Close drawer", exact: true })
      .click();
    await page
      .getByText("Enter the counted cash amount with up to six decimal places.")
      .waitFor();
    expect(
      await page.getByLabel("Counted cash", { exact: true }).inputValue(),
    ).toBe("abc");
    expect(closes).toEqual([]);
  } finally {
    await page.close();
  }
});

it("#116 restores the exact closed drawer summary on a full reload", async () => {
  const page = await browser.newPage();
  try {
    const closes = await countFixture(page);
    await page.getByLabel("Counted cash", { exact: true }).fill("0");
    await page
      .getByRole("button", { name: "Close drawer", exact: true })
      .click();
    await page
      .getByText(/Drawer closed with a USD -100.00 discrepancy/)
      .waitFor();
    expect(new URL(page.url()).searchParams.get("cash_drawer_id")).toBe("707");
    await page.reload();
    const summary = page.getByText(/Closed drawer · Counted USD 0.00/);
    await summary.waitFor();
    expect(await summary.textContent()).toContain("Discrepancy USD -100.00");
    expect(await summary.textContent()).toContain(
      "Awaiting manager reconciliation",
    );
    expect(
      await page
        .getByRole("button", { name: "Open another drawer", exact: true })
        .count(),
    ).toBe(1);
    expect(
      await page
        .getByRole("button", { name: "Open drawer", exact: true })
        .count(),
    ).toBe(0);
    expect(closes).toHaveLength(1);
  } finally {
    await page.close();
  }
}, 15000);

it.each(["unknown", "unknown_refreshed", "rejected"])(
  "preserves reconciliation intent after an %s outcome",
  async (outcome) => {
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    const attempts: Array<{
      drawer: { reconciliation_note: string; request_key: string };
    }> = [];
    const drawer = {
      id: 707,
      site_id: 704,
      status: "closed",
      currency: "USD",
      opening_float: "100",
      expected_cash: "100",
      cash_received: "0",
      cash_refunded: "0",
      counted_cash: "100",
      discrepancy: "0",
      reconciliation_status: "pending",
    };
    await page.route(`${baseUrl}/api/**`, async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/clinic/cash_drawers/707/reconcile") {
        attempts.push(route.request().postDataJSON());
        if (attempts.length === 1) {
          if (outcome.startsWith("unknown")) {
            if (outcome === "unknown_refreshed")
              drawer.reconciliation_status = "reconciled";
            await route.abort("failed");
          } else
            await route.fulfill({
              status: 422,
              json: { error: "Synthetic rejected note" },
            });
          return;
        }
        if (outcome.startsWith("unknown"))
          expect(attempts[1]).toEqual(attempts[0]);
        drawer.reconciliation_status = "reconciled";
        await route.fulfill({ json: { drawer } });
        return;
      }
      await route.fulfill({
        json:
          path === "/api/csrf"
            ? { csrf_token: "synthetic-token" }
            : { drawers: [drawer] },
      });
    });
    try {
      await page.goto(`${baseUrl}/cash-test?cash_drawer_id=707`);
      const note = page.getByLabel("Manager reconciliation note");
      await note.fill("Synthetic verified count");
      await page
        .getByRole("button", { name: "Reconcile discrepancy", exact: true })
        .click();
      if (outcome.startsWith("unknown")) {
        const retry = page.getByRole("button", {
          name: "Retry same reconciliation",
          exact: true,
        });
        await expect.poll(() => retry.isEnabled()).toBe(true);
        expect(await note.isDisabled()).toBe(true);
        expect(attempts).toHaveLength(1);
        if (outcome === "unknown_refreshed") {
          // Refresh through the parent contract; "Refresh activity" belongs
          // to an uncertain cash payment, not drawer reconciliation.
          await page.evaluate(() =>
            (
              window as unknown as { refreshDrawerFixture: () => void }
            ).refreshDrawerFixture(),
          );
          await expect.poll(() => note.count()).toBe(0);
          const retained = page.getByRole("button", {
            name: "Retry drawer #707 reconciliation",
            exact: true,
          });
          await expect.poll(() => retained.isEnabled()).toBe(true);
          await retained.click();
        } else await retry.click();
      } else {
        await page
          .getByText("Synthetic rejected note", { exact: true })
          .waitFor();
        await note.fill("Synthetic corrected note");
        await page
          .getByRole("button", { name: "Reconcile discrepancy", exact: true })
          .click();
      }
      await page
        .getByText(
          "Drawer discrepancy reconciled and preserved for review history.",
          { exact: true },
        )
        .waitFor();
      expect(attempts).toHaveLength(2);
      expect(attempts[0].drawer.request_key).toBeTruthy();
      if (outcome === "rejected") {
        expect(attempts[1].drawer.request_key).not.toBe(
          attempts[0].drawer.request_key,
        );
        expect(attempts[1].drawer.reconciliation_note).toBe(
          "Synthetic corrected note",
        );
      }
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
