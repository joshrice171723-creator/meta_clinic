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
  const context = {
    actor_id: 7,
    actor_membership_id: 8,
    practice_id: 2,
    site_id: 20,
    authorization_generation: 1,
  };
  const batches = new Map<string, any>();
  const receipts = new Set<string>();
  await page.route(`${baseUrl}/api/**`, async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    let response: unknown,
      status = 200;
    if (path.startsWith("/api/clinic/offering_text_batches")) {
      if (!canWrite) status = 403;
      else if (
        path === "/api/clinic/offering_text_batches" &&
        request.method() === "GET"
      )
        response = {
          context,
          capped: false,
          batches: [...batches.values()].map(
            ({ request_key, created_at, source }) => ({
              request_key,
              created_at,
              source,
            }),
          ),
        };
      else if (path === "/api/clinic/offering_text_batches") {
        const input = request.postDataJSON().batch;
        expect(input.context).toEqual(context);
        response = {
          request_key: input.request_key,
          created_at: "2026-09-30T21:30:00Z",
          context,
          source: input.source,
          retention_policy: "unselected",
          items: input.items.map((item: any) => ({
            ...item,
            status: "ready",
            message: "Saved; not attempted",
            retryPermitted: false,
          })),
        };
        batches.set(input.request_key, response);
      } else {
        const parts = path.split("/"),
          batch = batches.get(parts[4]);
        if (!batch) status = 404;
        else if (request.method() === "GET") response = batch;
        else {
          expect(request.postDataJSON().context).toEqual(context);
          const index = Number(parts[6]),
            operation = parts[7],
            item = batch.items[index];
          const key = item.attempt.body.service_offering.request_key;
          if (operation === "prepare")
            Object.assign(item, {
              status: "unknown",
              message: "Prepared",
              retryPermitted: true,
            });
          if (operation === "reconcile")
            Object.assign(
              item,
              receipts.has(key)
                ? {
                    status: "applied",
                    message: "Original committed receipt",
                    retryPermitted: false,
                  }
                : {
                    status: "unknown",
                    message: "No receipt; explicit repeat available",
                    retryPermitted: true,
                  },
            );
          if (operation === "apply") {
            calls.push({
              path: item.attempt.path,
              body: structuredClone(item.attempt.body),
            });
            status = statuses[Math.min(calls.length - 1, statuses.length - 1)];
            if (status === 200) {
              const row = rows.find((row) => row.id === item.plan.targetId)!;
              Object.assign(row, item.attempt.body.service_offering, {
                lock_version: row.lock_version + 1,
              });
              receipts.add(key);
              Object.assign(item, {
                status: "applied",
                message: "Committed",
                retryPermitted: false,
              });
            }
          }
          response =
            status === 200
              ? malformed && operation === "apply"
                ? {}
                : batch
              : { error: "Synthetic denial or unknown response" };
        }
      }
    } else {
      expect(request.method()).toBe("GET");
      response =
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
              : {
                  services: [{ id: 23, name: "Synthetic price", active: true }],
                };
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(response ?? { error: "Synthetic denied lookup" }),
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
      name: "Import selected fields into drafts",
      exact: true,
    })
    .click();
  await page
    .getByText("Saved offering-import reviews for this actor and site", {
      exact: true,
    })
    .waitFor();
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
  const table = page.getByRole("table", {
    name: "Text changes for destination #202",
  });
  await table.waitFor();
  expect(await table.innerText()).toContain("Draft 202");
  expect(await table.innerText()).toContain("Source 101");
}

it("saves an explicit plan, reloads partial outcomes and reconciles before an exact repeat", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  try {
    const calls = await fixture(page, [200, 503, 200, 200]);
    await review(page);
    expect(calls).toHaveLength(0);
    expect(
      await page
        .getByRole("button", { name: "Apply reviewed draft changes", exact: true })
        .count(),
    ).toBe(0);
    await page
      .getByRole("button", { name: "Save reviewed offering-import batch" })
      .click();
    await page
      .getByRole("button", { name: "Apply reviewed draft changes", exact: true })
      .evaluate((button) => {
        (button as HTMLButtonElement).click();
        (button as HTMLButtonElement).click();
      });
    await page
      .getByRole("button", { name: "Reconcile original receipt for #203" })
      .waitFor();
    expect(calls).toHaveLength(2);
    expect(
      await page
        .getByRole("button", { name: "Apply unattempted reviewed items" })
        .isDisabled(),
    ).toBe(true);
    const key = await page
      .getByRole("textbox", { name: "Saved batch identity" })
      .inputValue();
    await page.reload();
    await page
      .getByRole("button", {
        name: "Import selected fields into drafts",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: new RegExp(`Resume ${key}`) })
      .click();
    await page
      .getByRole("button", { name: "Reconcile original receipt for #203" })
      .waitFor();
    expect(calls).toHaveLength(2);
    expect(
      await page
        .getByRole("button", { name: "Retry exact change for #203" })
        .count(),
    ).toBe(0);
    await page
      .getByRole("button", { name: "Reconcile original receipt for #203" })
      .click();
    await page
      .getByRole("button", { name: "Retry exact change for #203" })
      .click();
    await expect
      .poll(() =>
        page
          .getByRole("button", { name: "Reconcile original receipt for #203" })
          .count(),
      )
      .toBe(0);
    expect(calls[2]).toEqual(calls[1]);
    await page
      .getByRole("button", { name: "Apply unattempted reviewed items" })
      .click();
    await page
      .getByText("All reviewed items are confirmed applied.", { exact: false })
      .waitFor();
    expect(calls.map((call) => call.path)).toEqual(
      [202, 203, 203, 204].map((id) => `/api/clinic/service_offerings/${id}`),
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

it("keeps unresolved identities and stops destination requests after permission loss", async () => {
  const page = await browser.newPage();
  try {
    const calls = await fixture(page, [200, 503, 403]);
    await review(page);
    await page
      .getByRole("button", { name: "Save reviewed offering-import batch" })
      .click();
    await page
      .getByRole("button", { name: "Apply reviewed draft changes", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Reconcile original receipt for #203" })
      .click();
    await page
      .getByRole("button", { name: "Retry exact change for #203" })
      .click();
    await expect
      .poll(() =>
        page
          .getByRole("button", { name: "Reconcile original receipt for #203" })
          .isDisabled(),
      )
      .toBe(true);
    expect(calls).toHaveLength(3);
    expect(calls[2]).toEqual(calls[1]);
    expect(
      await page
        .getByRole("button", { name: "Apply unattempted reviewed items" })
        .isDisabled(),
    ).toBe(true);
    expect(
      await page
        .getByText("All reviewed items are confirmed applied.", {
          exact: false,
        })
        .count(),
    ).toBe(0);
  } finally {
    await page.close();
  }
}, 20000);

it("denies readers and recovers a malformed apply acknowledgment without reapplying a committed item", async () => {
  const page = await browser.newPage();
  try {
    const calls = await fixture(page, [200], false);
    expect(
      await page
        .getByRole("button", {
          name: "Import selected fields into drafts",
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
      .getByRole("button", { name: "Save reviewed offering-import batch" })
      .click();
    await writer
      .getByRole("button", { name: "Apply reviewed draft changes", exact: true })
      .click();
    await writer
      .getByRole("button", { name: "Reconcile original receipt for #202" })
      .click();
    await writer
      .getByText("All reviewed items are confirmed applied.", { exact: false })
      .waitFor();
    expect(calls).toHaveLength(1);
  } finally {
    await writer.close();
  }
}, 20000);
