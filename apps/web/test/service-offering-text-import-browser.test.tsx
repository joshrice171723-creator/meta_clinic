import { beforeAll, afterAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";

let server: ViteDevServer, browser: Browser, baseUrl: string;
const destination = {
  id: 202,
  practice_id: 2,
  name: "Destination draft",
  code: "DEST-CODE",
  description: "Keep destination description",
  contact_instructions: "Existing destination desk.",
  referral_instructions: null,
  visit_type_id: 22,
  billing_service_id: 23,
  duration_minutes: 30,
  modality: "in_person",
  booking_required: true,
  requires_room: false,
  public_visible: false,
  status: "draft",
  eligible_site_ids: [20],
  eligible_clinician_ids: [24],
  lock_version: 4,
};
const source = {
  format: 1,
  purpose: "Synthetic source fixture",
  generated_at: "2026-09-30T20:00:00Z",
  source_digest: "a".repeat(64),
  configuration: {
    practice: { id: 1, name: "Synthetic source", features: { revision: 1 } },
    sites: [],
    service_offerings: [
      {
        id: 101,
        name: "Source draft name",
        code: "SOURCE-CODE",
        contact_instructions: "Contact the source desk.",
        referral_instructions: "Source referral guidance.",
        visit_type_id: null,
        site_ids: [],
        modality: "video",
        public_visible: true,
      },
    ],
  },
};

beforeAll(async () => {
  const virtualId = "\0offering-import-fixture.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    cacheDir: fileURLToPath(
      new URL("../../../tmp/offering-import-vite-cache", import.meta.url),
    ),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "offering-import-fixture",
        resolveId: (id) => (id === virtualId ? virtualId : undefined),
        load(id) {
          if (id === virtualId)
            return `import React from "react"; import {createRoot} from "react-dom/client"; import {ServiceOfferingSettings} from "/src/features/clinic/ServiceOfferingSettings"; createRoot(document.getElementById("root")).render(React.createElement(ServiceOfferingSettings, {canWrite: true}));`;
        },
        configureServer(s) {
          s.middlewares.use(
            "/offering-import-fixture",
            async (_request, response) => {
              response.setHeader("Content-Type", "text/html");
              response.end(
                await s.transformIndexHtml(
                  "/offering-import-fixture",
                  '<div id="root"></div><script type="module" src="/@id/__x00__offering-import-fixture.tsx"></script>',
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
  statuses: number[] = [200],
  canWrite = true,
  status = "draft",
  responseCodes: Array<string | undefined> = [],
) {
  page.setDefaultTimeout(5000);
  const calls: {
    path: string;
    body: { service_offering: Record<string, unknown> };
  }[] = [];
  let record = { ...destination, status };
  await page.route(`${baseUrl}/api/**`, async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    let body: unknown;
    if (request.method() === "PATCH") {
      calls.push({ path, body: request.postDataJSON() });
      const responseStatus =
        statuses[Math.min(calls.length - 1, statuses.length - 1)];
      if (responseStatus === 200) {
        record = {
          ...record,
          ...calls.at(-1)!.body.service_offering,
          lock_version: 5,
        };
        body = { service_offering: record, replayed: calls.length > 1 };
      } else
        body = {
          code: responseCodes[
            Math.min(calls.length - 1, responseCodes.length - 1)
          ],
          error:
            responseStatus === 409
              ? "Destination changed; reload before importing."
              : responseStatus === 403
                ? "Configuration permission denied."
                : "Synthetic outcome unconfirmed.",
        };
      await route.fulfill({
        status: responseStatus,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
      return;
    }
    if (path === "/api/csrf") body = { csrf_token: "synthetic-fixture-csrf" };
    else if (path === "/api/clinic/service_offerings")
      body = {
        service_offerings: [record],
        can_write: canWrite,
        eligible_clinicians: [
          { id: 24, name: "Synthetic destination clinician" },
        ],
      };
    else if (path === "/api/clinic/facilities")
      body = {
        sites: [
          { id: 20, name: "Synthetic destination site", status: "active" },
        ],
        visit_types: [{ id: 22, code: "Destination visit", retired_at: null }],
      };
    else
      body = {
        services: [
          { id: 23, name: "Synthetic destination price", active: true },
        ],
      };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.goto(`${baseUrl}/offering-import-fixture`);
  await page
    .getByRole("heading", { name: "Service offerings", exact: true })
    .waitFor();
  return calls;
}

async function selectSource(page: Page) {
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Choose offering source JSON").setInputFiles({
    name: "synthetic-source.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(source)),
  });
  await page
    .getByRole("combobox", { name: "Source offering for text import" })
    .click();
  await page.getByRole("option", { name: "Source draft name (#101)" }).click();
  await page
    .getByRole("checkbox", { name: "Offering name", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Contact instructions", exact: true })
    .check();
  await page
    .getByRole("table", { name: "Offering text import changes" })
    .waitFor();
}

it("previews replacements and applies only selected text while preserving destination references", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const calls = await fixture(page);
  await selectSource(page);
  const preview = await page
    .getByRole("table", { name: "Offering text import changes" })
    .innerText();
  expect(preview).toContain("Destination draft");
  expect(preview).toContain("Source draft name");
  expect(preview).toContain("Existing destination desk.");
  expect(preview).toContain("Contact the source desk.");
  expect(calls).toHaveLength(0);
  await page
    .getByRole("button", { name: "Apply selected text to this draft" })
    .click();
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0].path).toBe("/api/clinic/service_offerings/202");
  expect(Object.keys(calls[0].body.service_offering).sort()).toEqual([
    "contact_instructions",
    "lock_version",
    "name",
    "request_key",
  ]);
  expect(calls[0].body.service_offering).toMatchObject({
    name: "Source draft name",
    contact_instructions: "Contact the source desk.",
    lock_version: 4,
  });
  await expect.poll(() => page.getByRole("dialog").count()).toBe(0);
  expect(await page.getByRole("alert").innerText()).toContain(
    "saved to this draft",
  );
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  expect(
    await page
      .getByRole("combobox", { name: "Visit type", exact: true })
      .innerText(),
  ).toContain("Destination visit");
  expect(
    await page
      .getByRole("textbox", { name: "Description", exact: true })
      .inputValue(),
  ).toBe("Keep destination description");
  await page.close();
}, 20000);

it("keeps an unknown outcome blocked and retries the identical command and request key explicitly", async () => {
  const page = await browser.newPage();
  const calls = await fixture(page, [503, 200]);
  await selectSource(page);
  await page
    .getByRole("button", { name: "Apply selected text to this draft" })
    .click();
  await page.getByRole("button", { name: "Retry exact change" }).waitFor();
  expect(
    await page
      .getByRole("button", { name: "Apply selected text to this draft" })
      .isDisabled(),
  ).toBe(true);
  expect(
    await page
      .getByRole("button", { name: "Save draft", exact: true })
      .isDisabled(),
  ).toBe(true);
  expect(calls).toHaveLength(1);
  await page.getByRole("button", { name: "Retry exact change" }).click();
  await expect.poll(() => calls.length).toBe(2);
  expect(calls[1]).toEqual(calls[0]);
  await expect.poll(() => page.getByRole("dialog").count()).toBe(0);
  await page.close();
}, 20000);

it("does not offer import without write permission or for published offerings", async () => {
  const reader = await browser.newPage();
  const calls = await fixture(reader, [200], false);
  expect(
    await reader.getByRole("button", { name: "Edit", exact: true }).count(),
  ).toBe(0);
  expect(calls).toHaveLength(0);
  await reader.close();
  const published = await browser.newPage();
  await fixture(published, [200], true, "published");
  await published.getByRole("button", { name: "Edit", exact: true }).click();
  expect(
    await published
      .getByRole("button", { name: "Choose offering source JSON" })
      .count(),
  ).toBe(0);
  await published.close();
}, 20000);

it("shows stale/denied saves without success or automatic retry and blocks pending ordinary edits", async () => {
  for (const status of [409, 403]) {
    const page = await browser.newPage();
    const calls = await fixture(page, [status]);
    await selectSource(page);
    await page
      .getByRole("button", { name: "Apply selected text to this draft" })
      .click();
    await expect
      .poll(() => page.getByRole("alert").innerText())
      .toContain(status === 409 ? "Destination changed" : "permission denied");
    expect(
      await page.getByRole("button", { name: "Retry exact change" }).count(),
    ).toBe(0);
    expect(calls).toHaveLength(1);
    expect(await page.getByRole("dialog").count()).toBe(1);
    expect(
      await page
        .getByRole("textbox", { name: "Description", exact: true })
        .isEnabled(),
    ).toBe(true);
    await page.close();
  }
  const edited = await browser.newPage();
  await fixture(edited);
  await edited.getByRole("button", { name: "Edit", exact: true }).click();
  await edited
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Unsaved destination edit");
  expect(
    await edited
      .getByRole("button", { name: "Choose offering source JSON" })
      .isDisabled(),
  ).toBe(true);
  await edited.close();
}, 25000);

it.each([409, 408])(
  "retains exact pending import and edit lock for unconfirmed status %s",
  async (status) => {
    const page = await browser.newPage();
    try {
      const calls = await fixture(
        page,
        [status, 200],
        true,
        "draft",
        status === 409 ? ["outcome_unconfirmed"] : [],
      );
      await selectSource(page);
      await page
        .getByRole("button", { name: "Apply selected text to this draft" })
        .click();
      await page.getByRole("button", { name: "Retry exact change" }).waitFor();
      expect(calls).toHaveLength(1);
      expect(
        await page
          .getByRole("textbox", { name: "Description", exact: true })
          .isDisabled(),
      ).toBe(true);
      expect(
        await page
          .getByRole("checkbox", { name: "Offering name", exact: true })
          .isDisabled(),
      ).toBe(true);
      await page.getByRole("button", { name: "Retry exact change" }).click();
      await expect.poll(() => calls.length).toBe(2);
      expect(calls[1]).toEqual(calls[0]);
      await expect.poll(() => page.getByRole("dialog").count()).toBe(0);
    } finally {
      await page.close();
    }
  },
  20000,
);

it.each([403, 409, 422])(
  "preserves prior uncertain import after a later %s denial until exact recovery",
  async (status) => {
    const page = await browser.newPage();
    try {
      const calls = await fixture(page, [503, status, 200]);
      await selectSource(page);
      await page
        .getByRole("button", { name: "Apply selected text to this draft" })
        .click();
      await page.getByRole("button", { name: "Retry exact change" }).waitFor();
      await page.getByRole("button", { name: "Retry exact change" }).click();
      await expect.poll(() => calls.length).toBe(2);
      await expect
        .poll(() => page.getByRole("alert").innerText())
        .toContain("save outcome is unknown");
      expect(
        await page
          .getByRole("textbox", { name: "Description", exact: true })
          .isDisabled(),
      ).toBe(true);
      expect(
        await page
          .getByRole("button", { name: "Save draft", exact: true })
          .isDisabled(),
      ).toBe(true);
      expect(
        await page
          .getByRole("button", { name: "Apply selected text to this draft" })
          .isDisabled(),
      ).toBe(true);
      expect(calls[1]).toEqual(calls[0]);
      await page.getByRole("button", { name: "Retry exact change" }).click();
      await expect.poll(() => calls.length).toBe(3);
      expect(calls[2]).toEqual(calls[0]);
      await expect.poll(() => page.getByRole("dialog").count()).toBe(0);
    } finally {
      await page.close();
    }
  },
  20000,
);
