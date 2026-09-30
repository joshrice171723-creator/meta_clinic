import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";
import type { PrescriptionReconciliationWorklistContract as Contract } from "../src/api/contracts";

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
beforeAll(async () => {
  const virtualId = "\0rx-worklist-entry.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "rx-worklist-fixture",
        resolveId: (id) => (id === virtualId ? virtualId : undefined),
        load(id) {
          if (id !== virtualId) return;
          return `import React from "react";
          import {createRoot} from "react-dom/client";
          import {PrescriptionReconciliationWorklist} from "/src/features/clinic/PrescriptionReconciliationWorklist";
          function Fixture() {
            const [siteId, setSiteId] = React.useState(11);
            const [enabled, setEnabled] = React.useState(!location.search.includes("denied"));
            return React.createElement(React.Fragment, null,
              React.createElement("button", {onClick: () => setSiteId(12)}, "Switch synthetic site"),
              React.createElement("button", {onClick: () => setEnabled(false)}, "Revoke synthetic read"),
              React.createElement("button", {onClick: () => setEnabled(true)}, "Restore synthetic read"),
              React.createElement(PrescriptionReconciliationWorklist, {practiceId: 21, actorId: 31, siteId, enabled}));
          }
          createRoot(document.getElementById("root")).render(React.createElement(Fixture));`;
        },
        configureServer(s) {
          s.middlewares.use("/rx-worklist-test", async (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await s.transformIndexHtml(
                "/rx-worklist-test",
                '<div id="root"></div><script type="module" src="/@id/__x00__rx-worklist-entry.tsx"></script>',
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
    throw new Error("Missing fixture port");
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

function payload(siteId = 11): Contract {
  const id = siteId === 11 ? 81 : 82;
  return {
    schema_version: "prescription-reconciliation-worklist-v1",
    practice_id: 21,
    actor_id: 31,
    site_id: siteId,
    as_of: "2026-09-30T12:00:00Z",
    source: "clinic_prescription_transmission_attempts",
    limit: 50,
    unresolved_count: 1,
    returned_count: 1,
    truncated: false,
    items: [
      {
        id,
        event_id: 91,
        patient: {
          id: 41,
          display_name:
            siteId === 11
              ? "Synthetic original patient"
              : "Synthetic second-site patient",
          reference: "RX-SYN",
        },
        site_id: siteId,
        encounter_id: 51,
        medication_request_revision_id: 61,
        series_id: "synthetic-series",
        version_number: 1,
        medication_name: "Synthetic medication",
        outcome: "outcome_unknown",
        source: "simulation",
        adapter: "simulated_pharmacy_network",
        submitted_at: "2026-09-29T12:00:00Z",
        owner: "Prescriber/support queue",
        next_action:
          "Review original attempt history and reconcile its outcome before another submission.",
        href: `/clinic/patients/41/encounters/51?focus=clinical-plan-workspace&medication_request_revision_id=61&prescription_attempt_id=${id}`,
      },
    ],
  };
}
type Reply = { status?: number; data?: Contract };
async function fixture(
  page: Page,
  reply: (siteId: number, number: number) => Promise<Reply> = async (
    siteId,
  ) => ({ data: payload(siteId) }),
  denied = false,
) {
  const requests: { method: string; path: string; query: string }[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let reads = 0;
  await page.route(/^http:\/\/127\.0\.0\.1:\d+\/api\//, async (route) => {
    const url = new URL(route.request().url());
    requests.push({
      method: route.request().method(),
      path: url.pathname,
      query: url.search,
    });
    if (route.request().method() !== "GET")
      return route.fulfill({
        status: 405,
        json: { error: "Fixture forbids writes" },
      });
    if (url.pathname === "/api/csrf")
      return route.fulfill({
        json: { csrf_token: "synthetic-fixture-not-a-credential" },
      });
    if (url.pathname === "/api/clinic/prescription_reconciliation_worklist") {
      const result = await reply(
        Number(url.searchParams.get("site_id")),
        ++reads,
      );
      return route.fulfill({
        status: result.status ?? 200,
        json: result.data ?? { error: "Controlled worklist failure" },
      });
    }
    return route.fulfill({
      status: 404,
      json: { error: "Unexpected fixture read" },
    });
  });
  await page.goto(`${baseUrl}/rx-worklist-test${denied ? "?denied" : ""}`);
  try {
    await expect
      .poll(
        () =>
          page.getByRole("button", { name: "Switch synthetic site" }).count(),
        { timeout: 5000 },
      )
      .toBe(1);
  } catch (error) {
    throw new Error(
      JSON.stringify({
        errors,
        requests,
        body: await page.locator("body").innerText(),
      }),
      { cause: error },
    );
  }
  return requests;
}
async function visible(page: Page, id = 81) {
  await expect
    .poll(() =>
      page.getByRole("link", { name: `Review attempt ${id} history` }).count(),
    )
    .toBe(1);
}
describe(
  "read-only prescription reconciliation worklist",
  { timeout: 15000 },
  () => {
    it("shows provenance owner capped counts and original version history at desktop and tablet widths", async () => {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      });
      try {
        const requests = await fixture(page, async (siteId) => ({
          data: { ...payload(siteId), unresolved_count: 51, truncated: true },
        }));
        await visible(page);
        const body = await page.locator("body").innerText();
        for (const text of [
          "51 unresolved · 1 shown",
          "More work remains outside this view",
          "Prescriber/support queue",
          "Encounter #51 · request #61 · revision 1 · attempt #81",
          "Simulation",
          "outcome unknown",
          "does not establish dispensing or delivery",
        ])
          expect(body).toContain(text);
        expect(
          await page
            .getByRole("link", { name: "Review attempt 81 history" })
            .getAttribute("href"),
        ).toBe(payload().items[0].href);
        await page.setViewportSize({ width: 768, height: 1024 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        expect(requests.every((request) => request.method === "GET")).toBe(
          true,
        );
        expect(
          requests
            .filter((request) => request.path.includes("worklist"))
            .map((request) => request.query),
        ).toEqual(["?site_id=11"]);
      } finally {
        await page.close();
      }
    });
    it("failed refresh clears unconfirmed data and retry recovers the same scoped GET", async () => {
      const page = await browser.newPage();
      try {
        const requests = await fixture(page, async (siteId, number) =>
          number === 2
            ? { status: 503 }
            : number === 3
              ? {
                  data: {
                    ...payload(siteId),
                    unresolved_count: 0,
                    returned_count: 0,
                    items: [],
                  },
                }
              : { data: payload(siteId) },
        );
        await visible(page);
        await page
          .getByRole("button", { name: "Refresh prescriptions" })
          .click();
        await expect
          .poll(() =>
            page.getByRole("button", { name: "Retry prescriptions" }).count(),
          )
          .toBe(1);
        expect(await page.locator("body").innerText()).toContain(
          "queue has not been confirmed clear",
        );
        expect(
          await page
            .getByRole("link", { name: "Review attempt 81 history" })
            .count(),
        ).toBe(0);
        await page.getByRole("button", { name: "Retry prescriptions" }).click();
        await expect
          .poll(async () =>
            (await page.locator("body").innerText()).includes(
              "No unresolved prescription attempts in this scope.",
            ),
          )
          .toBe(true);
        expect(
          requests
            .filter((request) => request.path.includes("worklist"))
            .map((request) => `${request.method}${request.query}`),
        ).toEqual(Array(3).fill("GET?site_id=11"));
      } finally {
        await page.close();
      }
    });
    it("delayed previous-site responses cannot replace the current queue", async () => {
      const page = await browser.newPage();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      try {
        const requests = await fixture(page, async (siteId) => {
          if (siteId === 11) await gate;
          return { data: payload(siteId) };
        });
        await expect
          .poll(
            () =>
              requests.filter((request) => request.query === "?site_id=11")
                .length,
          )
          .toBe(1);
        await page
          .getByRole("button", { name: "Switch synthetic site" })
          .click();
        await visible(page, 82);
        release();
        await page
          .getByRole("button", { name: "Refresh prescriptions" })
          .click();
        await visible(page, 82);
        expect(await page.locator("body").innerText()).not.toContain(
          "Synthetic original patient",
        );
        expect(
          await page
            .getByRole("link", { name: "Review attempt 81 history" })
            .count(),
        ).toBe(0);
      } finally {
        release();
        await page.close();
      }
    });
    it("denied and mismatched-context reads never render source history", async () => {
      for (const response of [
        { status: 403 },
        { data: { ...payload(), practice_id: 999 } },
        { data: { ...payload(), actor_id: 999 } },
        { data: payload(12) },
      ]) {
        const page = await browser.newPage();
        try {
          await fixture(page, async () => response);
          await expect
            .poll(() =>
              page.getByRole("button", { name: "Retry prescriptions" }).count(),
            )
            .toBe(1);
          expect(await page.getByRole("table").count()).toBe(0);
          expect(await page.locator("body").innerText()).not.toContain(
            "Synthetic original patient",
          );
        } finally {
          await page.close();
        }
      }
    });
    it("missing capability prevents reads and revocation suppresses delayed data", async () => {
      const page = await browser.newPage();
      try {
        const requests = await fixture(page, undefined, true);
        await page
          .getByRole("button", { name: "Switch synthetic site" })
          .click();
        expect(
          await page
            .getByRole("heading", { name: "Prescription reconciliation" })
            .count(),
        ).toBe(0);
        expect(
          requests.filter((request) => request.path.includes("worklist")),
        ).toEqual([]);
      } finally {
        await page.close();
      }
      const activePage = await browser.newPage();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      try {
        const requests = await fixture(activePage, async (siteId) => {
          await gate;
          return { data: payload(siteId) };
        });
        await expect
          .poll(
            () =>
              requests.filter((request) => request.path.includes("worklist"))
                .length,
          )
          .toBe(1);
        await activePage
          .getByRole("button", { name: "Revoke synthetic read" })
          .click();
        release();
        expect(
          await activePage
            .getByRole("heading", { name: "Prescription reconciliation" })
            .count(),
        ).toBe(0);
        expect(await activePage.getByRole("table").count()).toBe(0);
      } finally {
        release();
        await activePage.close();
      }
    });
    it("restoring a read capability waits for fresh data instead of reviving previously visible records", async () => {
      const page = await browser.newPage();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      try {
        const requests = await fixture(page, async (siteId, number) => {
          if (number > 1) {
            await gate;
            return {
              data: {
                ...payload(siteId),
                unresolved_count: 0,
                returned_count: 0,
                items: [],
              },
            };
          }
          return { data: payload(siteId) };
        });
        await visible(page);
        await page
          .getByRole("button", { name: "Revoke synthetic read" })
          .click();
        await expect.poll(() => page.getByRole("table").count()).toBe(0);
        await page
          .getByRole("button", { name: "Restore synthetic read" })
          .click();
        await expect
          .poll(
            () =>
              requests.filter((request) => request.path.includes("worklist"))
                .length,
          )
          .toBe(2);
        expect(await page.getByRole("table").count()).toBe(0);
        expect(await page.locator("body").innerText()).not.toContain(
          "Synthetic original patient",
        );
        release();
        await expect
          .poll(async () =>
            (await page.locator("body").innerText()).includes(
              "No unresolved prescription attempts in this scope.",
            ),
          )
          .toBe(true);
      } finally {
        release();
        await page.close();
      }
    });
  },
);
