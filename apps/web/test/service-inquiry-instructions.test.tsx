import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
beforeAll(async () => {
  const virtualId = "\0service-instructions-entry.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "service-instructions-test",
        resolveId: (id) => (id === virtualId ? virtualId : undefined),
        load(id) {
          if (id !== virtualId) return;
          return `import React from "react";
          import {createRoot} from "react-dom/client";
          import {ServiceOfferingSettings} from "/src/features/clinic/ServiceOfferingSettings";
          import {PublicClinicServices} from "/src/features/membershipGrowth/PublicClinicServices";
          createRoot(document.getElementById("root")).render(
            window.location.search.includes("public")
              ? React.createElement(PublicClinicServices, {slug: "synthetic-instructions"})
              : React.createElement(ServiceOfferingSettings, {canWrite: !window.location.search.includes("denied")})
          );`;
        },
        configureServer(s) {
          s.middlewares.use(
            "/instructions-test",
            async (_request, response) => {
              response.setHeader("Content-Type", "text/html");
              response.end(
                await s.transformIndexHtml(
                  "/instructions-test",
                  '<div id="root"></div><script type="module" src="/@id/__x00__service-instructions-entry.tsx"></script>',
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
    throw new Error("Missing test port");
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

function offering() {
  return {
    id: 7,
    name: "Synthetic service",
    code: null,
    description: "Inquiry service",
    contact_instructions: "Saved contact",
    referral_instructions: "Saved referral",
    visit_type_id: 3,
    billing_service_id: null,
    duration_minutes: 30,
    modality: "in_person",
    booking_required: true,
    requires_room: false,
    public_visible: true,
    status: "draft",
    eligible_site_ids: [5],
    eligible_clinician_ids: [],
    lock_version: 2,
  };
}
async function fixture(
  page: Page,
  options: { canWrite?: boolean; failure?: number; empty?: boolean } = {},
) {
  const saved = offering();
  if (options.empty) {
    saved.contact_instructions = "";
    saved.referral_instructions = "";
  }
  const mutations: Array<{
    path: string;
    body: { service_offering: Record<string, unknown> };
  }> = [];
  await page.route(/^http:\/\/127\.0\.0\.1:\d+\/api\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    let body: unknown;
    if (request.method() !== "GET") {
      const payload = request.postDataJSON();
      mutations.push({ path, body: payload });
      if (options.failure) {
        const status = options.failure;
        options.failure = 0;
        await route.fulfill({
          status,
          json: { error: "Controlled save failure" },
        });
        return;
      }
      if (path.endsWith("/publish")) saved.status = "published";
      else Object.assign(saved, payload.service_offering);
      saved.lock_version += 1;
      body = { service_offering: saved, replayed: false };
    } else if (path === "/api/csrf") body = { csrf_token: "controlled-token" };
    else if (path === "/api/clinic/service_offerings")
      body = {
        service_offerings: [saved],
        can_write: options.canWrite ?? true,
        eligible_clinicians: [],
      };
    else if (path === "/api/clinic/facilities")
      body = {
        sites: [{ id: 5, name: "Synthetic site", status: "active" }],
        visit_types: [{ id: 3, code: "Synthetic visit", retired_at: null }],
      };
    else if (path === "/api/clinic/billing_services") body = { services: [] };
    else if (path.startsWith("/api/public/clinic_services/"))
      body = {
        practice: {
          name: "Synthetic instruction clinic",
          slug: "synthetic-instructions",
          headline: null,
          intro: null,
          accent: null,
          logo_path: null,
        },
        membership_path: null,
        services: saved.status === "published" ? [saved] : [],
      };
    else throw new Error(`Unexpected controlled request ${path}`);
    await route.fulfill({ json: body });
  });
  return { saved, mutations };
}
async function edit(page: Page) {
  await page.goto(`${baseUrl}/instructions-test`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
}

describe("service inquiry instructions with controlled API responses", () => {
  it("saves, reloads and publishes the saved guidance to public service cards", async () => {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    try {
      const { saved, mutations } = await fixture(page);
      await edit(page);
      await page
        .getByLabel("Contact instructions", { exact: true })
        .fill("  Ask the synthetic front desk.\nUse this form.  ");
      await page
        .getByLabel("Referral instructions", { exact: true })
        .fill("  Ask how to provide a referral reference.  ");
      await page
        .getByRole("button", { name: "Save draft", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page
        .getByText("Service offering updated.", { exact: true })
        .waitFor();
      expect(mutations[0].body.service_offering.contact_instructions).toBe(
        "Ask the synthetic front desk.\nUse this form.",
      );
      expect(mutations[0].body.service_offering.referral_instructions).toBe(
        "Ask how to provide a referral reference.",
      );
      expect(mutations[0].body.service_offering.lock_version).toBe(2);
      await page.reload();
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      expect(
        await page
          .getByLabel("Contact instructions", { exact: true })
          .inputValue(),
      ).toBe(saved.contact_instructions);
      expect(
        await page
          .getByLabel("Referral instructions", { exact: true })
          .inputValue(),
      ).toBe(saved.referral_instructions);
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await page.getByRole("button", { name: "Publish", exact: true }).click();
      await page
        .getByText(
          "Synthetic service is now available for configuration and scheduling work.",
        )
        .waitFor();
      await page.goto(`${baseUrl}/instructions-test?public`);
      await page
        .getByText(saved.referral_instructions, { exact: true })
        .waitFor();
      expect(
        await page
          .getByText(saved.contact_instructions, { exact: true })
          .count(),
      ).toBe(1);
      expect(
        await page
          .getByRole("heading", { name: "Ask about a service" })
          .count(),
      ).toBe(1);
      expect(mutations).toHaveLength(2);
    } finally {
      await page.close();
    }
  }, 15000);

  it("preserves both instructions and exact request identity through an unknown save", async () => {
    const page = await browser.newPage();
    try {
      const { mutations } = await fixture(page, { failure: 503 });
      await edit(page);
      await page
        .getByLabel("Contact instructions", { exact: true })
        .fill("Unconfirmed contact");
      await page
        .getByLabel("Referral instructions", { exact: true })
        .fill("Unconfirmed referral");
      await page
        .getByRole("button", { name: "Save draft", exact: true })
        .click();
      await page
        .getByText(
          "The save outcome is unknown. Retry this exact change before making another one.",
        )
        .waitFor();
      expect(
        await page
          .getByLabel("Contact instructions", { exact: true })
          .isDisabled(),
      ).toBe(true);
      expect(
        await page
          .getByLabel("Referral instructions", { exact: true })
          .inputValue(),
      ).toBe("Unconfirmed referral");
      await page
        .getByRole("button", { name: "Retry exact change", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page
        .getByText("Service offering updated.", { exact: true })
        .waitFor();
      expect(mutations).toHaveLength(2);
      expect(mutations[1]).toEqual(mutations[0]);
    } finally {
      await page.close();
    }
  }, 15000);

  it("keeps rejected inputs editable and sends blank instructions as null", async () => {
    const page = await browser.newPage();
    try {
      const { mutations } = await fixture(page, { failure: 422 });
      await edit(page);
      await page
        .getByLabel("Contact instructions", { exact: true })
        .fill("Rejected contact");
      await page
        .getByRole("button", { name: "Save draft", exact: true })
        .click();
      await page
        .getByText("Controlled save failure", { exact: true })
        .waitFor();
      expect(
        await page
          .getByLabel("Contact instructions", { exact: true })
          .inputValue(),
      ).toBe("Rejected contact");
      expect(
        await page
          .getByLabel("Contact instructions", { exact: true })
          .isEnabled(),
      ).toBe(true);
      await page
        .getByLabel("Contact instructions", { exact: true })
        .fill("   ");
      await page
        .getByRole("button", { name: "Save draft", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page
        .getByText("Service offering updated.", { exact: true })
        .waitFor();
      expect(
        mutations[1].body.service_offering.contact_instructions,
      ).toBeNull();
      expect(mutations[1].body.service_offering.referral_instructions).toBe(
        "Saved referral",
      );
      expect(mutations[1].body.service_offering.request_key).not.toBe(
        mutations[0].body.service_offering.request_key,
      );
    } finally {
      await page.close();
    }
  }, 15000);

  it("requires both parent and server-projected write permission", async () => {
    for (const [query, canWrite] of [
      ["", false],
      ["?denied", true],
    ] as const) {
      const page = await browser.newPage();
      try {
        const { mutations } = await fixture(page, { canWrite });
        await page.goto(`${baseUrl}/instructions-test${query}`);
        await page.getByText("Synthetic service", { exact: true }).waitFor();
        expect(
          await page.getByRole("button", { name: "Edit", exact: true }).count(),
        ).toBe(0);
        expect(
          await page
            .getByRole("button", { name: "Add service offering", exact: true })
            .count(),
        ).toBe(0);
        expect(mutations).toHaveLength(0);
      } finally {
        await page.close();
      }
    }
  }, 15000);

  it("renders literal guidance safely and omits absent guidance without implying referral clearance", async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    try {
      const { saved } = await fixture(page);
      saved.status = "published";
      saved.contact_instructions =
        '<img src=x onerror="window.instructionInjected=true">';
      saved.referral_instructions = "";
      await page.goto(`${baseUrl}/instructions-test?public`);
      await page
        .getByText(saved.contact_instructions, { exact: true })
        .waitFor();
      expect(await page.locator("img").count()).toBe(0);
      expect(
        await page.getByText("Referral instructions", { exact: true }).count(),
      ).toBe(0);
      expect(
        await page
          .getByRole("heading", { name: "Ask about a service" })
          .count(),
      ).toBe(1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    } finally {
      await page.close();
    }
  }, 15000);
});
