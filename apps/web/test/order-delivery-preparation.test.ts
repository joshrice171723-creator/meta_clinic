import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page, type Route } from "playwright-core";
import { fileURLToPath } from "node:url";
import type { DeliveryPreparation } from "../src/features/inventory/OrderDeliveryPreparation";

// Production component/API client mounted in Chromium. Synthetic HTTP only.
const entry = `
import React, {useState} from "react";
import {createRoot} from "react-dom/client";
import {OrderDeliveryPreparation} from "/src/features/inventory/OrderDeliveryPreparation";
function App() {
  const [blocked, setBlocked] = useState(false);
  return React.createElement("div", null,
    React.createElement("button", {disabled: blocked, id: "other-action"}, "Other order action"),
    React.createElement(OrderDeliveryPreparation, {orderId: "1", canSubmit: window.canSubmit, externalBusy: false, onBlockedChange: setBlocked}));
}
createRoot(document.getElementById("root")).render(React.createElement(App));`;
function source(attempts: DeliveryPreparation[] = []) {
  return {
    order_version: 3,
    source_digest: "a".repeat(64),
    can_prepare: true,
    snapshot: {
      number: "SYN-PO",
      supplier: "Synthetic supplier",
      destination: "Synthetic pharmacy",
      destination_address: "100 Synthetic Street",
      lines: [
        {
          id: "1",
          product_name: "Synthetic item",
          quantity: "2.0",
          package_price: "10.0",
          currency: "USD",
          quote_reference: "SYN-QUOTE",
          quoted_fee_amount: "1.230001",
          quoted_fee_currency: "USD",
          quoted_fee_basis: "Entire quoted shipment",
        },
      ],
    },
    attempts,
    truncated: false,
    recovered_attempt: null as DeliveryPreparation | null,
  };
}
function saved(body: any): DeliveryPreparation {
  return {
    id: "1",
    attempt_id: "00000000-0000-0000-0000-000000000001",
    correlation_id: "00000000-0000-0000-0000-000000000002",
    request_key: body.request_key,
    order_version: body.order_version,
    source_digest: body.source_digest,
    status: "prepared",
    connection_status: "disconnected",
    delivery_outcome: "unknown",
    source: "local_preparation",
    actor_id: "1",
    prepared_at: "2026-09-30T21:00:00Z",
    reason: body.reason,
    snapshot: source().snapshot,
  };
}
let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
beforeAll(async () => {
  const virtualId = "\0supplier-requests-test-entry.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "supplier-request-test-entry",
        resolveId(id, importer) {
          if (
            id === "../clinic/Workspace" &&
            importer?.endsWith("OrderDeliveryPreparation.tsx")
          )
            return "\0delivery-context";
          if (id === virtualId) return virtualId;
        },
        load(id) {
          if (id === "\0delivery-context")
            return 'export const useClinic=()=>({practice:{id:1,timezone:"UTC"}});';
          if (id === virtualId) return entry;
        },
        configureServer(s) {
          s.middlewares.use("/supplier-test", async (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await s.transformIndexHtml(
                "/supplier-test",
                '<div id="root"></div><script type="module" src="/@id/__x00__supplier-requests-test-entry.tsx"></script>',
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
    throw new Error("Missing test server port");
  baseUrl = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    ...(process.env.BROWSER_EXECUTABLE_PATH
      ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH }
      : { channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" }),
    headless: true,
  });
}, 15000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

async function withPanel(
  respond: (route: Route) => Promise<void>,
  exercise: (page: Page) => Promise<void>,
  canSubmit = true,
) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
  });
  page.setDefaultTimeout(5000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    (value) => Object.assign(window, { canSubmit: value }),
    canSubmit,
  );
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      if (new URL(route.request().url()).pathname === "/api/csrf") {
        await route.fulfill({ json: { csrf_token: "synthetic-only" } });
        return;
      }
      expect(new URL(route.request().url()).pathname).toBe(
        "/api/clinic/inventory/purchase-orders/1/delivery-preparations",
      );
      await respond(route);
    },
  );
  try {
    await page.goto(baseUrl + "/supplier-test");
    await page
      .getByRole("heading", {
        name: "Supplier delivery preparation",
        exact: true,
      })
      .waitFor();
    await exercise(page);
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}
const fillReason = async (page: Page) => {
  await page
    .getByLabel(/^Preparation reason/)
    .fill("Synthetic reviewed preparation");
};
const saveButton = (page: Page) =>
  page.getByRole("button", { name: "Save local preparation", exact: true });
const retryButton = (page: Page) =>
  page.getByRole("button", {
    name: "Retry exact local preparation",
    exact: true,
  });

describe("local supplier delivery preparation", () => {
  it("persists reviewed evidence, labels unknown delivery, and recovers history after reload without another POST", async () => {
    let record: DeliveryPreparation | null = null;
    let posts = 0;
    await withPanel(
      async (route) => {
        if (route.request().method() === "POST") {
          posts++;
          record = saved(route.request().postDataJSON().preparation);
          await route.fulfill({
            status: 201,
            json: { acknowledged: true, data: record },
          });
        } else
          await route.fulfill({
            json: { data: source(record ? [record] : []) },
          });
      },
      async (page) => {
        await fillReason(page);
        await saveButton(page).click();
        await page.getByRole("article").waitFor();
        expect(await page.getByRole("article").textContent()).toContain(
          "External delivery outcome: unknown",
        );
        expect(await page.getByRole("article").textContent()).toContain(
          "USD 1.230001",
        );
        expect(await saveButton(page).count()).toBe(0);
        await page.reload();
        await page.getByRole("article").waitFor();
        expect(posts).toBe(1);
        expect(await saveButton(page).count()).toBe(0);
        expect(
          await page.getByRole("button", { name: /send|acknowledge/i }).count(),
        ).toBe(0);
      },
    );
  }, 15000);

  it("reconciles a lost response after a possible commit by retained key and releases action/navigation locks", async () => {
    let record: DeliveryPreparation | null = null;
    let posts = 0;
    await withPanel(
      async (route) => {
        if (route.request().method() === "POST") {
          posts++;
          record = saved(route.request().postDataJSON().preparation);
          await route.abort("failed");
        } else {
          const value = source(record ? [record] : []);
          if (
            record &&
            new URL(route.request().url()).searchParams.get("request_key") ===
              record.request_key
          )
            value.recovered_attempt = record;
          await route.fulfill({ json: { data: value } });
        }
      },
      async (page) => {
        await fillReason(page);
        await saveButton(page).click();
        await retryButton(page).waitFor();
        expect(await page.locator("#other-action").isDisabled()).toBe(true);
        expect(
          await page.evaluate(
            () =>
              !window.dispatchEvent(
                new Event("beforeunload", { cancelable: true }),
              ),
          ),
        ).toBe(true);
        await page
          .getByRole("button", {
            name: "Reconcile saved preparation",
            exact: true,
          })
          .click();
        await page.getByRole("article").waitFor();
        expect(await retryButton(page).count()).toBe(0);
        expect(await page.locator("#other-action").isDisabled()).toBe(false);
        expect(posts).toBe(1);
        expect(
          await page.evaluate(
            () =>
              !window.dispatchEvent(
                new Event("beforeunload", { cancelable: true }),
              ),
          ),
        ).toBe(false);
      },
    );
  }, 15000);

  it("preserves exact body/key and locks across loss then denied retry then explicit successful retry", async () => {
    const attempts: any[] = [];
    let record: DeliveryPreparation | null = null;
    await withPanel(
      async (route) => {
        if (route.request().method() === "POST") {
          const body = route.request().postDataJSON().preparation;
          attempts.push(body);
          if (attempts.length === 1) await route.abort("failed");
          else if (attempts.length === 2)
            await route.fulfill({
              status: 403,
              json: { error: "Synthetic permission denied" },
            });
          else {
            record = saved(body);
            await route.fulfill({
              status: 201,
              json: { acknowledged: true, data: record },
            });
          }
        } else
          await route.fulfill({
            json: { data: source(record ? [record] : []) },
          });
      },
      async (page) => {
        await fillReason(page);
        await saveButton(page).click();
        await retryButton(page).waitFor();
        await retryButton(page).click();
        await page
          .getByText("Synthetic permission denied", { exact: true })
          .waitFor();
        expect(await page.locator("#other-action").isDisabled()).toBe(true);
        expect(await page.getByLabel(/^Preparation reason/).count()).toBe(0);
        expect(attempts).toHaveLength(2);
        await retryButton(page).click();
        await page.getByRole("article").waitFor();
        expect(attempts).toHaveLength(3);
        expect(attempts[1]).toEqual(attempts[0]);
        expect(attempts[2]).toEqual(attempts[0]);
        expect(await page.locator("#other-action").isDisabled()).toBe(false);
      },
    );
  }, 15000);

  it("keeps history read-only without submit permission and blocks preparation when history cannot be read", async () => {
    let posts = 0;
    await withPanel(
      async (route) => {
        if (route.request().method() !== "GET") posts++;
        await route.fulfill({ json: { data: source() } });
      },
      async (page) => {
        await page.getByText(/View only/).waitFor();
        await page.getByLabel(/^Preparation reason/).waitFor();
        expect(await page.getByLabel(/^Preparation reason/).isDisabled()).toBe(
          true,
        );
        expect(await saveButton(page).isDisabled()).toBe(true);
        expect(posts).toBe(0);
      },
      false,
    );
    await withPanel(
      async (route) => {
        if (route.request().method() !== "GET") posts++;
        await route.fulfill({
          status: 403,
          json: { error: "Synthetic history denied" },
        });
      },
      async (page) => {
        await page
          .getByText("Synthetic history denied", { exact: true })
          .waitFor();
        expect(await saveButton(page).count()).toBe(0);
        expect(posts).toBe(0);
      },
    );
  }, 15000);

  it("requires a confirmed history read before releasing a stale request for explicit current-source review", async () => {
    const bodies: any[] = [];
    let record: DeliveryPreparation | null = null;
    await withPanel(
      async (route) => {
        if (route.request().method() === "POST") {
          const body = route.request().postDataJSON().preparation;
          bodies.push(body);
          if (bodies.length === 1)
            await route.fulfill({
              status: 422,
              json: { error: "Synthetic source changed" },
            });
          else {
            record = saved(body);
            await route.fulfill({
              status: 201,
              json: { acknowledged: true, data: record },
            });
          }
        } else {
          const value = source(record ? [record] : []);
          if (bodies.length) {
            value.order_version = 4;
            value.source_digest = "b".repeat(64);
          }
          await route.fulfill({ json: { data: value } });
        }
      },
      async (page) => {
        await fillReason(page);
        await saveButton(page).click();
        await page
          .getByText("Synthetic source changed", { exact: true })
          .waitFor();
        expect(
          await page
            .getByRole("button", { name: "Review current source", exact: true })
            .count(),
        ).toBe(0);
        expect(await page.locator("#other-action").isDisabled()).toBe(true);
        await page
          .getByRole("button", {
            name: "Reconcile saved preparation",
            exact: true,
          })
          .click();
        await page
          .getByRole("button", { name: "Review current source", exact: true })
          .click();
        expect(await page.locator("#other-action").isDisabled()).toBe(false);
        await fillReason(page);
        await saveButton(page).click();
        await page.getByRole("article").waitFor();
        expect(bodies).toHaveLength(2);
        expect(bodies[1].request_key).not.toBe(bodies[0].request_key);
        expect(bodies[1].order_version).toBe(4);
        expect(bodies[1].source_digest).toBe("b".repeat(64));
      },
    );
  }, 15000);

  it("marks an older frozen snapshot historical and never overwrites its fee with current source", async () => {
    const record = saved({
      request_key: crypto.randomUUID(),
      order_version: 2,
      source_digest: "b".repeat(64),
      reason: "Historical synthetic attempt",
    });
    const value = source([record]);
    value.can_prepare = false;
    value.snapshot.lines[0].quoted_fee_amount = "9.0";
    await withPanel(
      async (route) => {
        expect(route.request().method()).toBe("GET");
        await route.fulfill({ json: { data: value } });
      },
      async (page) => {
        await page.getByRole("article").waitFor();
        expect(await page.getByRole("article").textContent()).toContain(
          "Historical source",
        );
        expect(await page.getByRole("article").textContent()).toContain(
          "USD 1.230001",
        );
        expect(await page.getByRole("article").textContent()).not.toContain(
          "USD 9.0",
        );
      },
    );
  }, 15000);
});
