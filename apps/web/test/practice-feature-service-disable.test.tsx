import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;

beforeAll(async () => {
  const virtualId = "\0profile-disable-entry.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "profile-disable-fixture",
        resolveId: (id) => (id === virtualId ? virtualId : undefined),
        load(id) {
          if (id !== virtualId) return;
          return `import React from "react"; import {createRoot} from "react-dom/client";
          import {PracticeFeatureSettings} from "/src/features/clinic/PracticeFeatureSettings";
          const root = createRoot(document.getElementById("root"));
          window.renderProfile = (siteId = 1) => root.render(React.createElement(PracticeFeatureSettings,
            {canWrite: !location.search.includes("denied"), siteId})); window.renderProfile();`;
        },
        configureServer(s) {
          s.middlewares.use(
            "/profile-disable-fixture",
            async (_request, response) => {
              response.setHeader("Content-Type", "text/html");
              response.end(
                await s.transformIndexHtml(
                  "/profile-disable-fixture",
                  '<div id="root"></div><script type="module" src="/@id/__x00__profile-disable-entry.tsx"></script>',
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
}, 20000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

function profile(site = 1) {
  return {
    site_id: site,
    site_specialty_configured: true,
    site_revision: 1,
    profile_scope: "site",
    revision: 1,
    configured: true,
    finalized: true,
    finalized_at: "2026-09-30T20:00:00Z",
    clinic_type: "weight_loss",
    core: {},
    optional: {},
    service_scope: ["telehealth", "external_lab_coordination"],
    selected_services: ["telehealth", "external_lab_coordination"],
    assessment_scope: [],
    assessment_configured: true,
    insurance_workflows_enabled: false,
    recommended_clinic_type: "primary_care",
    recommended_service_scope: [],
    recommended_assessment_scope: [],
    starter_profile: { id: "weight-management", version: 1, visits: {} },
  };
}

async function fixture(
  page: Page,
  options: {
    unknown?: boolean;
    unconfirmed?: boolean;
    stale?: boolean;
    previewFailure?: boolean;
    restricted?: boolean;
    delay?: boolean;
  } = {},
) {
  const writes: Record<string, unknown>[] = [];
  let reads = 0;
  let state = profile();
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/csrf")
      return route.fulfill({ json: { csrf_token: "synthetic-token" } });
    if (url.pathname !== "/api/clinic/practice_features")
      return route.fulfill({
        status: 404,
        json: { error: "Closed-world fixture: unexpected API" },
      });
    if (request.method() === "PUT") {
      const body = request.postDataJSON().features as Record<string, unknown>;
      writes.push(body);
      if (options.stale && writes.length === 1)
        return route.fulfill({
          status: 409,
          json: {
            error: "Service consequences changed. Review again.",
            code: "service_impact_changed",
          },
        });
      state = {
        ...state,
        revision: 2,
        service_scope: body.service_scope as string[],
      };
      if (options.unknown && writes.length === 1) return route.abort("failed");
      if (options.unconfirmed && writes.length === 1)
        return route.fulfill({
          status: 409,
          json: {
            error: "Outcome unconfirmed. Retry the original request.",
            code: "outcome_unconfirmed",
          },
        });
      return route.fulfill({ json: { features: state } });
    }
    const site = Number(url.searchParams.get("site_id") || 1);
    if (url.searchParams.get("preview_service_change") === "1") {
      reads += 1;
      const sequence = reads;
      if (options.previewFailure)
        return route.fulfill({
          status: 503,
          json: { error: "Unable to read consequences. Try again." },
        });
      if (options.delay && site === 1)
        await new Promise((resolve) => setTimeout(resolve, 250));
      const selected = url.searchParams.getAll("service_scope[]");
      return route.fulfill({
        json: {
          preview: {
            site_id: site,
            revision: state.revision,
            generated_at: "2026-09-30T20:00:00Z",
            impact_digest: `synthetic-impact-${site}-${sequence}`,
            preservation:
              "Existing appointments, history and task owners remain unchanged. Unrelated services remain available.",
            services: state.service_scope
              .filter((service) => !selected.includes(service))
              .map((service) => ({
                service,
                status: options.restricted ? "restricted" : "available",
                open_records: options.restricted ? null : 2,
                open_tasks: options.restricted ? null : 1,
                unassigned_tasks: options.restricted ? null : 1,
                effect:
                  "New work will be unavailable. Existing records are not cancelled.",
                resolution: options.restricted
                  ? "Ask an authorized domain reader to review existing work."
                  : "Review existing work in its owning workspace.",
                resolution_path: options.restricted ? null : "/clinic/schedule",
              })),
          },
        },
      });
    }
    return route.fulfill({ json: { features: { ...state, site_id: site } } });
  });
  await page.goto(`${baseUrl}/profile-disable-fixture`);
  await expect
    .poll(() =>
      page
        .getByRole("checkbox", { name: "Telehealth", exact: false })
        .isChecked(),
    )
    .toBe(true);
  return {
    writes,
    get reads() {
      return reads;
    },
  };
}

const telehealth = (page: Page) =>
  page.getByRole("checkbox", { name: /^Telehealth/ });
const save = (page: Page) =>
  page.getByRole("button", { name: "Save location profile", exact: true });
const review = (page: Page) =>
  page.getByRole("button", {
    name: "Review service consequences",
    exact: true,
  });
const panel = (page: Page) =>
  page.getByLabel("Service-disable consequences", { exact: true });

describe("supported service-disable consequences and exact replay", () => {
  it("reviews before save, invalidates changed choices, then allows re-enable without another disable preview", async () => {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const transport = await fixture(page);
    await telehealth(page).uncheck();
    expect(await save(page).isDisabled()).toBe(true);
    await review(page).click();
    await expect
      .poll(() => panel(page).innerText())
      .toContain("Open source records: 2");
    expect(await panel(page).innerText()).toContain("Unassigned tasks: 1");
    await page.getByRole("checkbox", { name: /^Depression/ }).check();
    expect(await panel(page).count()).toBe(0);
    expect(await save(page).isDisabled()).toBe(true);
    await review(page).click();
    await expect.poll(() => save(page).isDisabled()).toBe(false);
    await save(page).click();
    await expect.poll(() => transport.writes.length).toBe(1);
    expect(transport.writes[0].expected_impact_digest).toBe(
      "synthetic-impact-1-2",
    );
    await expect.poll(() => telehealth(page).isChecked()).toBe(false);
    await telehealth(page).check();
    await expect.poll(() => save(page).isDisabled()).toBe(false);
    await save(page).click();
    await expect.poll(() => transport.writes.length).toBe(2);
    expect(transport.writes[1].expected_impact_digest).toBeUndefined();
    await page.close();
  });

  it.each([{ unknown: true }, { unconfirmed: true }])(
    "locks edits after an uncertain save (%j) and retries the original body without a new preview",
    async (failure) => {
      const page = await browser.newPage();
      const transport = await fixture(page, failure);
      await telehealth(page).uncheck();
      await review(page).click();
      await expect.poll(() => save(page).isDisabled()).toBe(false);
      await save(page).click();
      const retry = page.getByRole("button", {
        name: "Retry original profile save",
      });
      await expect.poll(() => retry.count()).toBe(1);
      expect(await telehealth(page).isDisabled()).toBe(true);
      expect(
        await page.getByRole("checkbox", { name: /^Depression/ }).isDisabled(),
      ).toBe(true);
      expect(await review(page).isDisabled()).toBe(true);
      await retry.click();
      await expect.poll(() => transport.writes.length).toBe(2);
      expect(transport.writes[1]).toEqual(transport.writes[0]);
      expect(transport.reads).toBe(1);
      await expect.poll(() => retry.count()).toBe(0);
      await page.close();
    },
  );

  it("retains choices after a stale consequence rejection and requires renewed review", async () => {
    const page = await browser.newPage();
    const transport = await fixture(page, { stale: true });
    await telehealth(page).uncheck();
    await review(page).click();
    await expect.poll(() => save(page).isDisabled()).toBe(false);
    await save(page).click();
    await expect
      .poll(() =>
        page.getByText("Service consequences changed. Review again.").count(),
      )
      .toBe(1);
    expect(await telehealth(page).isChecked()).toBe(false);
    expect(await panel(page).count()).toBe(0);
    expect(await save(page).isDisabled()).toBe(true);
    await review(page).click();
    await expect.poll(() => save(page).isDisabled()).toBe(false);
    await save(page).click();
    await expect.poll(() => transport.writes.length).toBe(2);
    expect(transport.writes[1].request_key).not.toBe(
      transport.writes[0].request_key,
    );
    expect(transport.writes[1].expected_impact_digest).toBe(
      "synthetic-impact-1-2",
    );
    await page.close();
  });

  it("failed preview does not report zero work or prevent an independent setting save", async () => {
    const page = await browser.newPage();
    const transport = await fixture(page, { previewFailure: true });
    await telehealth(page).uncheck();
    await review(page).click();
    await expect
      .poll(() =>
        page.getByText("Unable to read consequences. Try again.").count(),
      )
      .toBe(1);
    expect(await save(page).isDisabled()).toBe(true);
    expect(await panel(page).count()).toBe(0);
    await telehealth(page).check();
    await page.getByRole("checkbox", { name: /^Depression/ }).check();
    await save(page).click();
    await expect.poll(() => transport.writes.length).toBe(1);
    expect(transport.writes[0].expected_impact_digest).toBeUndefined();
    await page.close();
  });

  it("does not accept a delayed preview after the selected location changes", async () => {
    const page = await browser.newPage();
    const transport = await fixture(page, { delay: true });
    await telehealth(page).uncheck();
    await review(page).click();
    await expect.poll(() => transport.reads).toBe(1);
    await page.evaluate(() =>
      (
        window as unknown as { renderProfile: (id: number) => void }
      ).renderProfile(2),
    );
    await expect.poll(() => telehealth(page).isChecked()).toBe(true);
    await telehealth(page).uncheck();
    await review(page).click();
    await expect.poll(() => save(page).isDisabled()).toBe(false);
    await save(page).click();
    await expect.poll(() => transport.writes.length).toBe(1);
    expect(transport.writes[0].site_id).toBe(2);
    expect(transport.writes[0].expected_impact_digest).toBe(
      "synthetic-impact-2-2",
    );
    await page.close();
  });

  it("presents permission-restricted work as unknown without a domain link or fabricated zero", async () => {
    const page = await browser.newPage();
    await fixture(page, { restricted: true });
    await telehealth(page).uncheck();
    await review(page).click();
    await expect
      .poll(() => panel(page).innerText())
      .toContain("Existing work: unknown (requires domain access)");
    expect(await panel(page).getByRole("link").count()).toBe(0);
    expect(await panel(page).innerText()).not.toContain(
      "Open source records: 0",
    );
    await page.close();
  });
});
