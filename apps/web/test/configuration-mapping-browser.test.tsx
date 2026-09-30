import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright-core";
import { fileURLToPath } from "node:url";

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
const source = {
  format: 1,
  purpose: "Synthetic mapping fixture",
  generated_at: "2026-09-30T20:00:00Z",
  source_digest: "a".repeat(64),
  configuration: {
    practice: { id: 1, name: "Synthetic source", features: { revision: 1 } },
    sites: [{ id: 10, name: "Source location" }],
    service_offerings: [
      { id: 100, name: "Source offering", site_ids: [10], visit_type_id: 1000 },
    ],
  },
};
const target = {
  ...source,
  source_digest: "b".repeat(64),
  configuration: {
    practice: { id: 2, name: "Synthetic target", features: { revision: 2 } },
    sites: [{ id: 20, name: "Target location" }],
    service_offerings: [
      { id: 200, name: "Target offering", site_ids: [20], visit_type_id: 2000 },
    ],
  },
};

beforeAll(async () => {
  const virtualId = "\0mapping-fixture.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    cacheDir: fileURLToPath(
      new URL("../../../tmp/mc15-mapping-vite-cache", import.meta.url),
    ),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "mapping-fixture",
        resolveId: (id) => (id === virtualId ? virtualId : undefined),
        load(id) {
          if (id !== virtualId) return;
          return `import React from "react"; import {createRoot} from "react-dom/client"; import {ConfigurationMappingPreview} from "/src/features/clinic/ConfigurationMappingPreview";
          window.mappingRoot = createRoot(document.getElementById("root"));
          window.renderMapping = () => window.mappingRoot.render(React.createElement(ConfigurationMappingPreview, {target: ${JSON.stringify(target)}})); window.renderMapping();`;
        },
        configureServer(s) {
          s.middlewares.use("/mapping-fixture", async (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await s.transformIndexHtml(
                "/mapping-fixture",
                '<div id="root"></div><script type="module" src="/@id/__x00__mapping-fixture.tsx"></script>',
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
}, 20000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

it("walks explicit mapping, missing-source recovery, download and clear without mutation requests", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") writes.push(request.url());
  });
  await page.goto(`${baseUrl}/mapping-fixture`);
  const choose = (data: unknown) =>
    page.locator('input[type="file"]').setInputFiles({
      name: "synthetic-source.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(data)),
    });
  await choose(target);
  await expect
    .poll(() => page.getByRole("alert").innerText())
    .toContain("different source clinic");
  await choose({
    ...source,
    configuration: {
      ...source.configuration,
      service_offerings: [
        { ...source.configuration.service_offerings[0], site_ids: [99] },
      ],
    },
  });
  await expect
    .poll(() => page.getByRole("alert").innerText())
    .toContain("source location #99 is missing");
  await choose(source);
  await page
    .getByRole("combobox", { name: "Location: Source location (#10)" })
    .click();
  await page.getByRole("option", { name: "Target location (#20)" }).click();
  await page
    .getByRole("combobox", { name: "Service offering: Source offering (#100)" })
    .click();
  await page.getByRole("option", { name: "Target offering (#200)" }).click();
  await expect
    .poll(() => page.getByRole("alert").innerText())
    .toContain("1 unresolved");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download mapping review" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(
    "clinic-1-to-2-mapping-review.json",
  );
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const plan = JSON.parse(Buffer.concat(chunks).toString());
  expect(
    plan.mappings.map((row: { target_id: number }) => row.target_id),
  ).toEqual([20, 200]);
  expect(plan.status).toBe("review_only");
  await page.getByRole("button", { name: "Clear source and mappings" }).click();
  expect(await page.getByRole("combobox").count()).toBe(0);
  expect(writes).toEqual([]);
  await page.close();
}, 20000);

it("recovers a valid draft snapshot with a missing visit type and clears old mappings on source replacement", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") writes.push(request.url());
  });
  await page.goto(`${baseUrl}/mapping-fixture`);
  const choose = (value: unknown) =>
    page.locator('input[type="file"]').setInputFiles({
      name: "synthetic-draft.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(value)),
    });
  await choose({
    ...source,
    configuration: {
      ...source.configuration,
      service_offerings: [
        {
          ...source.configuration.service_offerings[0],
          status: "draft",
          visit_type_id: null,
        },
      ],
    },
  });
  await expect
    .poll(() => page.getByRole("alert").innerText())
    .toContain("source visit type is not configured");
  await page
    .getByRole("combobox", { name: "Location: Source location (#10)" })
    .click();
  await page.getByRole("option", { name: "Target location (#20)" }).click();
  await page
    .getByRole("combobox", { name: "Service offering: Source offering (#100)" })
    .click();
  await page.getByRole("option", { name: "Target offering (#200)" }).click();
  await expect
    .poll(() => page.getByRole("alert").innerText())
    .toContain("1 unresolved");
  await choose(source);
  await expect
    .poll(() => page.getByRole("alert").innerText())
    .toContain("visit type #1000 needs separate catalog mapping");
  expect(await page.getByRole("alert").innerText()).not.toContain(
    "source visit type is not configured",
  );
  await expect
    .poll(() =>
      page
        .getByRole("combobox", { name: "Location: Source location (#10)" })
        .locator("..")
        .locator("input")
        .inputValue(),
    )
    .toBe("");
  await expect
    .poll(() =>
      page
        .getByRole("combobox", {
          name: "Service offering: Source offering (#100)",
        })
        .locator("..")
        .locator("input")
        .inputValue(),
    )
    .toBe("");
  expect(await page.getByRole("alert").innerText()).toContain(
    "source location #10 needs a destination mapping",
  );
  expect(writes).toEqual([]);
  await page.close();
}, 20000);

it("discards a late file read after target component replacement", async () => {
  const page = await browser.newPage();
  await page.addInitScript(
    `window.resolveFile = null; File.prototype.text = function () { return new Promise(resolve => { window.resolveFile = resolve; }); };`,
  );
  await page.goto(`${baseUrl}/mapping-fixture`);
  await page.locator('input[type="file"]').setInputFiles({
    name: "delayed.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(source)),
  });
  await page.evaluate(() => {
    (
      window as unknown as { mappingRoot: { render: (value: null) => void } }
    ).mappingRoot.render(null);
  });
  await expect
    .poll(() =>
      page.getByRole("button", { name: "Choose source clinic JSON" }).count(),
    )
    .toBe(0);
  await page.evaluate((text) => {
    (
      window as unknown as {
        resolveFile: (text: string) => void;
        renderMapping: () => void;
      }
    ).resolveFile(text);
    (window as unknown as { renderMapping: () => void }).renderMapping();
  }, JSON.stringify(source));
  await page
    .getByRole("button", { name: "Choose source clinic JSON" })
    .waitFor();
  expect(await page.getByRole("combobox").count()).toBe(0);
  await page.close();
}, 20000);
