import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";

let server: ViteDevServer, browser: Browser, baseUrl: string;
const source = {
  format: 1,
  purpose: "Independent synthetic bulk fixture",
  generated_at: "2026-09-30T21:00:00Z",
  source_digest: "b".repeat(64),
  configuration: {
    practice: { id: 1, name: "Synthetic source", features: { revision: 1 } },
    sites: [],
    service_offerings: [101, 102, 103].map((id) => ({
      id,
      name: `Source ${id}`,
      code: `SRC-${id}`,
      contact_instructions: `Desk ${id}`,
      referral_instructions: null,
      visit_type_id: null,
      site_ids: [],
    })),
  },
};
const destinations = [202, 203, 204, 205].map((id) => ({
  id,
  practice_id: 2,
  name: `Draft ${id}`,
  code: `DEST-${id}`,
  description: "Preserve description",
  contact_instructions: "Keep desk",
  referral_instructions: null,
  visit_type_id: 22,
  billing_service_id: 23,
  duration_minutes: 30,
  modality: "in_person",
  booking_required: true,
  requires_room: false,
  public_visible: false,
  eligible_site_ids: [20],
  eligible_clinician_ids: [],
  status: id === 205 ? "published" : "draft",
  lock_version: id - 198,
}));

beforeAll(async () => {
  const virtualId = "\0offering-bulk-fixture.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    cacheDir: fileURLToPath(
      new URL("../../../tmp/offering-bulk-vite-cache", import.meta.url),
    ),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "offering-bulk-fixture",
        resolveId: (id) => (id === virtualId ? virtualId : undefined),
        load: (id) =>
          id === virtualId
            ? `import React from "react"; import {createRoot} from "react-dom/client"; import {ServiceOfferingSettings} from "/src/features/clinic/ServiceOfferingSettings"; createRoot(document.getElementById("root")).render(React.createElement(ServiceOfferingSettings, {canWrite: true}));`
            : undefined,
        configureServer(s) {
          s.middlewares.use(
            "/offering-bulk-fixture",
            async (_request, response) => {
              response.setHeader("Content-Type", "text/html");
              response.end(
                await s.transformIndexHtml(
                  "/offering-bulk-fixture",
                  '<div id="root"></div><script type="module" src="/@id/__x00__offering-bulk-fixture.tsx"></script>',
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
    throw new Error("No fixture port");
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

async function fixture(
  page: Page,
  statuses: number[],
  canWrite = true,
  malformed = false,
) {
  page.setDefaultTimeout(5000);
  const calls: {
    path: string;
    body: { service_offering: Record<string, unknown> };
  }[] = [];
  const rows = structuredClone(destinations);
  await page.route(`${baseUrl}/api/**`, async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (!["GET", "HEAD"].includes(request.method())) {
      expect(request.method()).toBe("PATCH");
      calls.push({ path, body: request.postDataJSON() });
      const status = statuses[Math.min(calls.length - 1, statuses.length - 1)];
      const row = rows.find((row) => path.endsWith(`/${row.id}`))!;
      if (status === 200)
        Object.assign(row, calls.at(-1)!.body.service_offering, {
          lock_version: row.lock_version + 1,
        });
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(
          status === 200
            ? malformed
              ? {}
              : { service_offering: row, replayed: calls.length > 2 }
            : {
                error:
                  status === 403
                    ? "Synthetic permission denial"
                    : "Synthetic stale or uncertain outcome",
              },
        ),
      });
      return;
    }
    const body =
      path === "/api/csrf"
        ? { csrf_token: "synthetic-fixture-csrf" }
        : path === "/api/clinic/service_offerings"
          ? {
              service_offerings: rows,
              can_write: canWrite,
              eligible_clinicians: [],
            }
          : path === "/api/clinic/facilities"
            ? {
                sites: [{ id: 20, name: "Synthetic site", status: "active" }],
                visit_types: [
                  { id: 22, code: "Synthetic visit", retired_at: null },
                ],
              }
            : { services: [{ id: 23, name: "Synthetic price", active: true }] };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.goto(`${baseUrl}/offering-bulk-fixture`);
  await page
    .getByRole("heading", { name: "Service offerings", exact: true })
    .waitFor();
  return calls;
}

async function review(page: Page, count = 3) {
  await page
    .getByRole("button", {
      name: "Import text into selected drafts",
      exact: true,
    })
    .click();
  await page.getByLabel("Choose bulk offering source JSON").setInputFiles({
    name: "synthetic-bulk-source.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(source)),
  });
  await page
    .getByRole("checkbox", { name: "Destination: Draft 202 (#202)" })
    .waitFor();
  expect(
    await page
      .getByRole("checkbox", { name: "Destination: Draft 205 (#205)" })
      .count(),
  ).toBe(0);
  for (let index = 0; index < count; index++) {
    const targetId = 202 + index,
      sourceId = 101 + index;
    await page
      .getByRole("checkbox", {
        name: `Destination: Draft ${targetId} (#${targetId})`,
        exact: true,
      })
      .check();
    await page
      .getByRole("combobox", {
        name: `Source offering for destination #${targetId}`,
        exact: true,
      })
      .click();
    await page
      .getByRole("option", {
        name: `Source ${sourceId} (#${sourceId})`,
        exact: true,
      })
      .click();
    await page
      .getByRole("checkbox", {
        name: `Offering name for #${targetId}`,
        exact: true,
      })
      .check();
  }
  await page
    .getByRole("button", { name: "Preview selected draft changes" })
    .click();
  await page
    .getByRole("table", { name: "Text changes for destination #202" })
    .waitFor();
  expect(
    await page
      .getByRole("table", { name: "Text changes for destination #202" })
      .innerText(),
  ).toContain("Draft 202");
  expect(
    await page
      .getByRole("table", { name: "Text changes for destination #202" })
      .innerText(),
  ).toContain("Source 101");
}

it("stops a partial batch, retains unknown requests after denial, and explicitly resumes only unattempted items", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  try {
    const calls = await fixture(page, [200, 503, 403, 200, 200]);
    await review(page);
    expect(calls).toHaveLength(0);
    await page
      .getByRole("button", { name: "Apply reviewed draft text", exact: true })
      .evaluate((button) => {
        (button as HTMLButtonElement).click();
        (button as HTMLButtonElement).click();
      });
    const retry = page.getByRole("button", {
      name: "Retry exact change for #203",
    });
    await retry.waitFor();
    expect(calls).toHaveLength(2);
    expect(
      await page
        .getByRole("button", { name: "Apply unattempted reviewed items" })
        .isDisabled(),
    ).toBe(true);
    expect(
      await page
        .getByRole("button", { name: "Close review and reload offerings" })
        .isDisabled(),
    ).toBe(true);
    await retry.click();
    await page.getByText(/Synthetic permission denial/).waitFor();
    expect(calls).toHaveLength(3);
    expect(calls[2]).toEqual(calls[1]);
    expect(
      await page
        .getByText("All reviewed items are confirmed applied.", {
          exact: false,
        })
        .count(),
    ).toBe(0);
    expect(
      await page
        .getByRole("button", { name: "Apply unattempted reviewed items" })
        .isDisabled(),
    ).toBe(true);
    await retry.click();
    await expect
      .poll(() =>
        page
          .getByRole("button", { name: "Retry exact change for #203" })
          .count(),
      )
      .toBe(0);
    expect(calls[3]).toEqual(calls[1]);
    expect(calls).toHaveLength(4);
    await page
      .getByRole("button", { name: "Apply unattempted reviewed items" })
      .click();
    await page
      .getByText("All reviewed items are confirmed applied.", { exact: false })
      .waitFor();
    expect(calls.map((call) => call.path)).toEqual(
      [202, 203, 203, 203, 204].map(
        (id) => `/api/clinic/service_offerings/${id}`,
      ),
    );
    expect(
      new Set(calls.map((call) => call.body.service_offering.request_key)).size,
    ).toBe(3);
    for (const call of calls)
      expect(Object.keys(call.body.service_offering).sort()).toEqual([
        "lock_version",
        "name",
        "request_key",
      ]);
    await page
      .getByRole("button", { name: "Close review and reload offerings" })
      .click();
    await expect.poll(() => page.getByRole("dialog").count()).toBe(0);
    await page
      .getByRole("row")
      .filter({ hasText: "Source 101" })
      .getByRole("button", { name: "Edit", exact: true })
      .click();
    expect(
      await page
        .getByRole("textbox", { name: "Description", exact: true })
        .inputValue(),
    ).toBe("Preserve description");
  } finally {
    await page.close();
  }
}, 30000);

it("retains rejected and unattempted items without claiming completion or replaying prior successes", async () => {
  const page = await browser.newPage();
  try {
    const calls = await fixture(page, [200, 409, 200]);
    await review(page);
    await page
      .getByRole("button", { name: "Apply reviewed draft text", exact: true })
      .click();
    await page.getByText(/Destination #203: failed/).waitFor();
    expect(calls).toHaveLength(2);
    expect(
      await page
        .getByRole("button", { name: "Close review and reload offerings" })
        .isDisabled(),
    ).toBe(false);
    await page
      .getByRole("button", { name: "Apply unattempted reviewed items" })
      .click();
    await page.getByText(/Destination #204: applied/).waitFor();
    expect(calls.map((call) => call.path)).toEqual(
      [202, 203, 204].map((id) => `/api/clinic/service_offerings/${id}`),
    );
    expect(
      await page
        .getByText("All reviewed items are confirmed applied.", {
          exact: false,
        })
        .count(),
    ).toBe(0);
    expect(await page.getByRole("alert").innerText()).toContain(
      "2 of 3 confirmed applied",
    );
  } finally {
    await page.close();
  }
}, 20000);

it("denies readers and treats malformed success receipts as unresolved", async () => {
  const page = await browser.newPage();
  try {
    const calls = await fixture(page, [200], false);
    expect(
      await page
        .getByRole("button", {
          name: "Import text into selected drafts",
          exact: true,
        })
        .count(),
    ).toBe(0);
    expect(calls).toHaveLength(0);
  } finally {
    await page.close();
  }
  const writer = await browser.newPage();
  try {
    const calls = await fixture(writer, [200], true, true);
    await review(writer, 1);
    await writer
      .getByRole("button", { name: "Apply reviewed draft text", exact: true })
      .click();
    await writer
      .getByRole("button", { name: "Retry exact change for #202" })
      .waitFor();
    expect(calls).toHaveLength(1);
    expect(
      await writer
        .getByRole("button", { name: "Close review and reload offerings" })
        .isDisabled(),
    ).toBe(true);
    expect(await writer.getByRole("alert").innerText()).toContain(
      "0 of 1 confirmed applied",
    );
  } finally {
    await writer.close();
  }
}, 20000);
