import { afterAll, beforeAll, expect, it } from "vitest";
import { build } from "vite";
import { createServer, type Server } from "node:http";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { cashCloseoutHref } from "../src/features/clinic/cashCloseoutRoute";
import type { CashDrawer } from "../src/api/contracts";

let server: Server;
let browser: Browser;
let baseUrl: string;
const drawer = (id: number, site_id: number, currency = "USD") =>
  ({
    id,
    site_id,
    currency,
    status: "open",
    opening_float: "90",
    cash_received: "10",
    cash_refunded: "0",
    expected_cash: "100",
    counted_cash: null,
    discrepancy: null,
    discrepancy_explanation: null,
    opened_at: "2026-10-02T08:00:00Z",
    closed_at: null,
    reconciliation_status: "pending",
    reconciled_by_id: null,
    reconciled_at: null,
    reconciliation_note: null,
  }) as CashDrawer;
const target = drawer(707, 704);
const href = cashCloseoutHref(701, target);
const baselineRef = process.env.CASH_CLOSEOUT_BASELINE_REF;

beforeAll(async () => {
  const entry = "\0closeout-entry.tsx";
  const workspace = "\0closeout-workspace.ts";
  const root = fileURLToPath(new URL("../", import.meta.url));
  const originals = Object.fromEntries(
    (baselineRef ? ["OwnerMorningView", "CashDrawerOperations"] : []).map(
      (name) => [
        name,
        execFileSync(
          "git",
          ["show", `${baselineRef}:apps/web/src/features/clinic/${name}.tsx`],
          { cwd: root, encoding: "utf8" },
        ),
      ],
    ),
  );
  const result = await build({
    configFile: false,
    logLevel: "error",
    root,
    build: { write: false, minify: false, rollupOptions: { input: entry } },
    plugins: [
      {
        name: "synthetic-closeout",
        enforce: "pre",
        resolveId(id, importer) {
          if (id.split("?")[0] === entry) return id;
          if (
            id === "./Workspace" &&
            /(?:OwnerMorningView|CashDrawerOperations)\.tsx(?:\?|$)/.test(
              importer ?? "",
            )
          )
            return workspace;
        },
        load(id) {
          if (id === workspace)
            return `export const useClinic = () => ({
        practice: {id: 701, timezone: "UTC"}, user_id: 702, membership_id: 703,
        current_site: {id: 704, code: "EAST"}, sites: [{id: 704, code: "EAST"}, {id: 708, code: "WEST"}],
        capabilities: {billing_payment_record: !new URLSearchParams(location.search).has("denied")}
      });`;
          if (id.includes("baseline=1")) {
            const name = id.split("/").pop()!.split(".")[0];
            if (originals[name]) return originals[name];
          }
          if (!id.startsWith(entry)) return;
          return `import React from "react"; import {createRoot} from "react-dom/client";
        import {OwnerMorningView as CurrentMorning} from "/src/features/clinic/OwnerMorningView";
        import {CashDrawerOperations as CurrentCash} from "/src/features/clinic/CashDrawerOperations";
        import {OwnerMorningView as BeforeMorning} from "/src/features/clinic/OwnerMorningView?baseline=1";
        import {CashDrawerOperations as BeforeCash} from "/src/features/clinic/CashDrawerOperations?baseline=1";
        const baseline = document.cookie.includes("closeout_baseline=1");
        const OwnerMorningView = baseline ? BeforeMorning : CurrentMorning;
        const CashDrawerOperations = baseline ? BeforeCash : CurrentCash;
        createRoot(document.getElementById("root")).render(location.pathname.endsWith("operations")
          ? React.createElement(OwnerMorningView) : React.createElement(CashDrawerOperations, {invoice: null, onRecorded: () => {}}));`;
        },
      },
    ],
  });
  const bundle = Array.isArray(result) ? result[0] : result;
  if (!("output" in bundle))
    throw new Error("Expected a static fixture bundle");
  const output = bundle.output;
  const entryFile = output.find(
    (file) => file.type === "chunk" && file.isEntry,
  )!.fileName;
  server = createServer((request, response) => {
    const path = new URL(request.url!, "http://fixture").pathname;
    const asset = output.find((file) => `/${file.fileName}` === path);
    if (asset) {
      response.setHeader(
        "Content-Type",
        asset.type === "chunk" ? "text/javascript" : "text/css",
      );
      response.end(asset.type === "chunk" ? asset.code : asset.source);
    } else {
      response.setHeader("Content-Type", "text/html");
      response.end(
        `<div id="root"></div><script type="module" src="/${entryFile}"></script>`,
      );
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing fixture port");
  baseUrl = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || "/usr/bin/chromium",
    headless: true,
  });
}, 60000);

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
});

async function fixture(
  drawers: CashDrawer[] = [drawer(709, 708, "CAD"), target],
  denied = false,
) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  page.setDefaultTimeout(5000);
  const mutations: string[] = [];
  await page.route(`${baseUrl}/api/**`, async (route) => {
    const request = route.request();
    if (request.method() !== "GET") mutations.push(request.url());
    const path = new URL(request.url()).pathname;
    if (path === "/api/csrf") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ csrf_token: "synthetic-closeout-csrf" }),
      });
      return;
    }
    if (path !== "/api/clinic/cash_drawers")
      throw new Error(`Unexpected fixture API: ${request.method()} ${path}`);
    await route.fulfill({
      status: denied ? 403 : 200,
      contentType: "application/json",
      body: JSON.stringify(
        denied ? { error: "Synthetic access denied" } : { drawers },
      ),
    });
  });
  return { page, mutations };
}

it("opens the exact Morning session with blank physical count and zero navigation mutations; Back/Forward retains it", async () => {
  const { page, mutations } = await fixture();
  try {
    await page.goto(`${baseUrl}/clinic/operations`);
    const link = page.getByRole("link", {
      name: "Count and close drawer",
      exact: true,
    });
    await link.waitFor();
    expect(await link.getAttribute("href")).toBe(href);
    await link.click();
    await page
      .getByText("Closeout session #707 · EAST · USD", { exact: true })
      .waitFor();
    expect(
      await page.getByLabel("Counted cash", { exact: true }).inputValue(),
    ).toBe("");
    expect(
      await page
        .getByLabel("Cash drawer location", { exact: true })
        .isDisabled(),
    ).toBe(true);
    await page.goBack();
    await page
      .getByRole("link", { name: "Count and close drawer", exact: true })
      .waitFor();
    await page.goForward();
    await page
      .getByText("Closeout session #707 · EAST · USD", { exact: true })
      .waitFor();
    expect(
      await page.getByLabel("Counted cash", { exact: true }).inputValue(),
    ).toBe("");
    expect(mutations).toEqual([]);
  } finally {
    await page.close();
  }
});

it.each([
  ["missing session", href.replace("cash_drawer_id=707", "cash_drawer_id=999")],
  ["missing identity", href.replace("&cash_currency=USD", "")],
  [
    "wrong clinic",
    href.replace("cash_practice_id=701", "cash_practice_id=799"),
  ],
  ["wrong site", href.replace("cash_site_id=704", "cash_site_id=708")],
  ["wrong currency", href.replace("cash_currency=USD", "cash_currency=CAD")],
])("stops %s without fallback or mutation", async (_name, route) => {
  const { page, mutations } = await fixture();
  try {
    await page.goto(`${baseUrl}${route}`);
    await page.getByText(/This cash closeout link no longer matches/).waitFor();
    expect(await page.getByLabel("Counted cash", { exact: true }).count()).toBe(
      0,
    );
    expect(
      await page
        .getByRole("button", { name: "Open drawer", exact: true })
        .count(),
    ).toBe(0);
    expect(mutations).toEqual([]);
  } finally {
    await page.close();
  }
});

it("stops a session that closed after Morning loaded", async () => {
  const { page, mutations } = await fixture([
    { ...target, status: "closed", counted_cash: "98", discrepancy: "-2" },
  ]);
  try {
    await page.goto(`${baseUrl}${href}`);
    await page.getByText(/This drawer session is already closed/).waitFor();
    expect(await page.getByLabel("Counted cash", { exact: true }).count()).toBe(
      0,
    );
    expect(mutations).toEqual([]);
  } finally {
    await page.close();
  }
});

it("denies unauthorized direct entry and hides the Morning shortcut", async () => {
  const { page, mutations } = await fixture(undefined, true);
  try {
    await page.goto(`${baseUrl}/clinic/operations?denied=1`);
    await page.getByText("Cash drawer access is required.").waitFor();
    expect(
      await page
        .getByRole("link", { name: /close drawer|Open cash drawer/ })
        .count(),
    ).toBe(0);
    await page.goto(`${baseUrl}${href}&denied=1`);
    await page.getByRole("alert").waitFor();
    expect(await page.getByLabel("Counted cash", { exact: true }).count()).toBe(
      0,
    );
    expect(mutations).toEqual([]);
  } finally {
    await page.close();
  }
});

it("offers each current-location session explicitly instead of guessing a currency", async () => {
  const { page, mutations } = await fixture([
    target,
    drawer(710, 704, "CAD"),
    drawer(709, 708),
  ]);
  try {
    await page.goto(`${baseUrl}/clinic/operations`);
    await page
      .getByRole("link", { name: "Count and close CAD session #710" })
      .waitFor();
    expect(
      await page
        .getByRole("link", { name: "Count and close USD session #707" })
        .getAttribute("href"),
    ).toBe(href);
    expect(await page.getByRole("link", { name: /session #709/ }).count()).toBe(
      0,
    );
    expect(mutations).toEqual([]);
  } finally {
    await page.close();
  }
});

it("does not offer a closeout shortcut for a missing current-location session", async () => {
  const { page, mutations } = await fixture([drawer(709, 708)]);
  try {
    await page.goto(`${baseUrl}/clinic/operations`);
    await page.getByText("No open drawer at this location.").waitFor();
    expect(
      await page.getByRole("link", { name: /Count and close/ }).count(),
    ).toBe(0);
    expect(mutations).toEqual([]);
  } finally {
    await page.close();
  }
});

it("clears count input when history changes the target within the mounted drawer", async () => {
  const other = drawer(710, 704, "CAD");
  const { page, mutations } = await fixture([target, other]);
  try {
    await page.goto(`${baseUrl}${href}`);
    await page.getByLabel("Counted cash", { exact: true }).fill("93.75");
    await page.evaluate(
      (route) => {
        history.pushState(null, "", route);
        window.dispatchEvent(new PopStateEvent("popstate"));
      },
      cashCloseoutHref(701, other),
    );
    await page
      .getByText("Closeout session #710 · EAST · CAD", { exact: true })
      .waitFor();
    expect(
      await page.getByLabel("Counted cash", { exact: true }).inputValue(),
    ).toBe("");
    expect(mutations).toEqual([]);
  } finally {
    await page.close();
  }
});

it.skipIf(!baselineRef)(
  "measures baseline versus candidate actions to reach the correct physical count form",
  async () => {
    const { page, mutations } = await fixture();
    try {
      await page
        .context()
        .addCookies([{ name: "closeout_baseline", value: "1", url: baseUrl }]);
      await page.goto(`${baseUrl}/clinic/operations?baseline=1`);
      await page
        .getByRole("link", { name: "Open cash drawer", exact: true })
        .click();
      await page.getByLabel("Cash drawer location", { exact: true }).waitFor();
      expect(
        await page.getByText("Drawer currency: CAD", { exact: true }).count(),
      ).toBe(1);
      await page.getByLabel("Cash drawer location", { exact: true }).click();
      await page.getByRole("option", { name: "EAST", exact: true }).click();
      await page.getByText("Drawer currency: USD", { exact: true }).waitFor();
      const before = 3; // Link, open location selector, choose correct drawer.
      await page.context().clearCookies();
      await page.goto(`${baseUrl}/clinic/operations`);
      await page
        .getByRole("link", { name: "Count and close drawer", exact: true })
        .click();
      await page
        .getByText("Closeout session #707 · EAST · USD", { exact: true })
        .waitFor();
      const after = 1; // Direct session link. Count entry + explicit Close remain.
      console.log(
        JSON.stringify({
          navigationActions: { before, after },
          includingCountAndExplicitClose: {
            before: before + 2,
            after: after + 2,
          },
          screens: { before: 2, after: 2 },
          mutations: mutations.length,
        }),
      );
      expect(mutations).toEqual([]);
    } finally {
      await page.close();
    }
  },
);
