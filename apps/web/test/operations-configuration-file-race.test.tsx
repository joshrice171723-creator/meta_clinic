import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
const manifest = {
  format: 1,
  purpose: "Synthetic read-only review",
  source_digest: "synthetic-digest",
  generated_at: "2026-09-30T12:00:00Z",
  configuration: {
    practice: {
      id: 7,
      name: "Synthetic file-race clinic",
      features: { revision: 1 },
    },
    sites: [],
    service_offerings: [],
  },
};
beforeAll(async () => {
  const virtualId = "\0configuration-file-race-entry.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "configuration-file-race-fixture",
        resolveId: (id) => (id === virtualId ? virtualId : undefined),
        load(id) {
          if (id !== virtualId) return;
          return `import React from "react";
          import {createRoot} from "react-dom/client";
          import {OperationsReportsCatalog} from "/src/features/clinic/OperationsReportsCatalog";
          createRoot(document.getElementById("root")).render(React.createElement(OperationsReportsCatalog, {capabilities: {configuration_manifest_read: true}}));`;
        },
        configureServer(s) {
          s.middlewares.use(
            "/configuration-race-test",
            async (_request, response) => {
              response.setHeader("Content-Type", "text/html");
              response.end(
                await s.transformIndexHtml(
                  "/configuration-race-test",
                  '<div id="root"></div><script type="module" src="/@id/__x00__configuration-file-race-entry.tsx"></script>',
                ),
              );
            },
          );
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

type ControlledFileWindow = Window & {
  __fileReads: Map<string, (failure: boolean) => Promise<void>>;
};
async function fixture(page: Page) {
  const requests: { method: string; path: string }[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript({
    content: `
    window.__fileReads = new Map();
    const originalText = File.prototype.text;
    File.prototype.text = function () {
      if (!this.name.startsWith("delayed-")) return originalText.call(this);
      const file = this;
      return new Promise((resolve, reject) => {
        window.__fileReads.set(file.name, async (failure) => {
          if (failure) reject(new Error("Delayed synthetic file read failed"));
          else resolve(await originalText.call(file));
        });
      });
    };`,
  });
  await page.route(/^http:\/\/127\.0\.0\.1:\d+\/api\//, async (route) => {
    const url = new URL(route.request().url());
    requests.push({ method: route.request().method(), path: url.pathname });
    if (route.request().method() !== "GET")
      return route.fulfill({
        status: 405,
        json: { error: "Fixture forbids writes" },
      });
    if (url.pathname === "/api/csrf")
      return route.fulfill({
        json: { csrf_token: "synthetic-fixture-not-a-credential" },
      });
    if (url.pathname === "/api/clinic/operations/configuration_manifest")
      return route.fulfill({ json: { manifest } });
    return route.fulfill({
      status: 404,
      json: { error: "Unexpected fixture read" },
    });
  });
  await page.goto(`${baseUrl}/configuration-race-test`);
  try {
    await expect
      .poll(
        () => page.getByRole("button", { name: "Refresh snapshot" }).count(),
        { timeout: 5000 },
      )
      .toBe(1);
  } catch (error) {
    throw new Error(
      JSON.stringify({
        requests,
        errors,
        body: await page.locator("body").innerText(),
      }),
      { cause: error },
    );
  }
  return requests;
}
async function selectFile(
  page: Page,
  name: string,
  content = JSON.stringify(manifest),
) {
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(content),
  });
  if (name.startsWith("delayed-"))
    await expect
      .poll(() =>
        page.evaluate(
          (key) =>
            (window as unknown as ControlledFileWindow).__fileReads.has(key),
          name,
        ),
      )
      .toBe(true);
}
async function finishRead(page: Page, name: string, failure = false) {
  await page.evaluate(
    async ({ key, rejected }) => {
      const finish = (
        window as unknown as ControlledFileWindow
      ).__fileReads.get(key);
      if (!finish) throw new Error("Expected a pending synthetic file read");
      await finish(rejected);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    },
    { key: name, rejected: failure },
  );
}
const comparison = (page: Page) =>
  page.getByRole("alert").filter({ hasText: "Comparison is for review only" });
const errors = (page: Page) =>
  page.getByRole("alert").filter({
    hasText:
      /JSON|Delayed synthetic file read failed|Choose a configuration snapshot/,
  });

describe(
  "configuration snapshot file response ownership",
  { timeout: 15000 },
  () => {
    it("late success cannot add an old comparison beside the latest malformed-file error", async () => {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      });
      try {
        const requests = await fixture(page);
        await selectFile(page, "delayed-valid.json");
        await selectFile(page, "latest-malformed.json", "{invalid JSON");
        await expect.poll(() => errors(page).count()).toBe(1);
        const latestError = await errors(page).innerText();
        await finishRead(page, "delayed-valid.json");
        expect(await comparison(page).count()).toBe(0);
        expect(await errors(page).allTextContents()).toEqual([latestError]);
        expect(requests.every((request) => request.method === "GET")).toBe(
          true,
        );
      } finally {
        await page.close();
      }
    });
    it("late failure cannot add an old error beside the latest valid-file comparison", async () => {
      const page = await browser.newPage();
      try {
        await fixture(page);
        await selectFile(page, "delayed-rejection.json");
        await selectFile(page, "latest-valid.json");
        await expect.poll(() => comparison(page).count()).toBe(1);
        const latestComparison = await comparison(page).innerText();
        await finishRead(page, "delayed-rejection.json", true);
        expect(await errors(page).count()).toBe(0);
        expect(await comparison(page).allTextContents()).toEqual([
          latestComparison,
        ]);
      } finally {
        await page.close();
      }
    });
    it("refresh invalidates a pending successful read even when manifest provenance remains identical", async () => {
      const page = await browser.newPage();
      try {
        const requests = await fixture(page);
        await selectFile(page, "delayed-before-refresh.json");
        await page.getByRole("button", { name: "Refresh snapshot" }).click();
        await expect
          .poll(
            () =>
              requests.filter((request) =>
                request.path.endsWith("configuration_manifest"),
              ).length,
          )
          .toBe(2);
        await expect
          .poll(() =>
            page.getByRole("button", { name: "Refresh snapshot" }).count(),
          )
          .toBe(1);
        await finishRead(page, "delayed-before-refresh.json");
        expect(await comparison(page).count()).toBe(0);
        expect(await errors(page).count()).toBe(0);
        await selectFile(page, "current-after-refresh.json");
        await expect.poll(() => comparison(page).count()).toBe(1);
        expect(await comparison(page).innerText()).toContain(
          "matches the currently loaded clinic configuration",
        );
      } finally {
        await page.close();
      }
    });
    it("refresh invalidates a pending rejected read while the current snapshot stays usable", async () => {
      const page = await browser.newPage();
      try {
        const requests = await fixture(page);
        await selectFile(page, "delayed-rejection-before-refresh.json");
        await page.getByRole("button", { name: "Refresh snapshot" }).click();
        await expect
          .poll(
            () =>
              requests.filter((request) =>
                request.path.endsWith("configuration_manifest"),
              ).length,
          )
          .toBe(2);
        await expect
          .poll(() =>
            page.getByRole("button", { name: "Refresh snapshot" }).count(),
          )
          .toBe(1);
        await finishRead(page, "delayed-rejection-before-refresh.json", true);
        expect(await errors(page).count()).toBe(0);
        expect(await comparison(page).count()).toBe(0);
        expect(
          await page
            .getByRole("button", { name: "Download configuration JSON" })
            .count(),
        ).toBe(1);
      } finally {
        await page.close();
      }
    });
  },
);
