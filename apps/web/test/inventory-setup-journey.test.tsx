import { type Browser, type Page } from "playwright-core";
import { beforeAll, afterAll, expect, it } from "vitest";
import {
  realStackEnabled,
  readRealFixture,
  launchRealBrowser,
  realUrl,
  realGet,
  realMutation,
  loginReal,
  type RealFixture,
} from "./support/authorizedRealStack";

let browser: Browser;
let fixture: RealFixture;
beforeAll(async () => {
  if (!realStackEnabled) return;
  fixture = readRealFixture();
  browser = await launchRealBrowser();
});
afterAll(async () => {
  await browser?.close();
});

async function api(page: Page, path: string, body?: unknown): Promise<any> {
  if (!body) return realGet(page, path);
  const response = await realMutation(page, path, body);
  expect(response.ok()).toBe(true);
  return response.json();
}
async function choose(page: Page, name: RegExp | string, text: string) {
  await page.getByRole("combobox", { name }).click();
  await page.getByRole("option", { name: text, exact: true }).click();
}

it.runIf(realStackEnabled)(
  "#22 #77 #161 actual same-session supplier setup, normalized quote and leaf-bin recovery persist across reload",
  async () => {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    page.setDefaultTimeout(10_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await loginReal(page, fixture, "/clinic/inventory/configure");
      const configure = page.getByRole("button", {
        name: "Configure inventory →",
        exact: true,
      });
      await configure.waitFor();
      await page
        .getByRole("combobox", { name: /^Configuration reason/ })
        .selectOption("initial_setup");
      await configure.click();
      await page
        .getByRole("dialog", { name: "Confirm inventory action", exact: true })
        .getByRole("button", { name: "Confirm action", exact: true })
        .click();
      await page.waitForURL((url) => url.pathname === "/clinic/inventory");
      const initial = (
        await api(page, "/api/clinic/inventory/catalog?view=table")
      ).data;
      expect(initial.capabilities.supplier_pricing).toBe(true);
      expect(initial.capabilities["inventory.catalog"]).toBe(true);
      expect(initial.first_run.supplier).toBe(false);
      await page
        .getByRole("link", {
          name: "Continue to Add a supplier →",
          exact: true,
        })
        .click();
      await page
        .getByRole("textbox", { name: "Add supplier", exact: true })
        .fill("Synthetic journey supplier");
      await page.locator(".supplier-create-form").getByRole("button").click();
      await page
        .getByRole("button")
        .filter({ hasText: "Synthetic journey supplier" })
        .first()
        .waitFor();
      // Independent synthetic catalog setup through the same authorized HTTP session.
      const created = await api(page, "/api/clinic/pharmacy", {
        clinic_pharmacy_product: {
          name: "Synthetic Aspirin",
          sku: "SYN-JOURNEY-ASPIRIN",
          ndc: "00904705699",
          stock_unit: "tablet",
          quantity_scale: 0,
          package_size: 90,
          unit_reference: "Bottle of 90 tablets",
          reorder_point: 0,
        },
      });
      expect(created.id).toBeTruthy();
      await page.goto(realUrl("/clinic/inventory/purchasing/new"));
      const recovery = page.getByRole("link", {
        name: "Record supplier offer",
        exact: true,
      });
      await recovery.waitFor();
      expect(await recovery.getAttribute("href")).toContain(
        "product_name=Synthetic+Aspirin",
      );
      await recovery.click();
      await page
        .getByRole("button")
        .filter({ hasText: "Synthetic journey supplier" })
        .first()
        .click();
      // The existing wizard opens the actual quote dialog.
      const dialog = page
        .getByRole("dialog")
        .filter({ hasText: "Record quote" });
      await dialog.waitFor();
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect.poll(() => dialog.count()).toBe(0);
      await page
        .getByRole("button", {
          name: "Record a quote for a catalog item",
          exact: true,
        })
        .click();
      await dialog.waitFor();
      await dialog
        .getByRole("textbox", {
          name: "Search active catalog items",
          exact: true,
        })
        .fill("0904-7056-99");
      await dialog.getByRole("button", { name: "Search", exact: true }).click();
      await choose(
        page,
        /^Matched clinic catalog item/,
        "Synthetic Aspirin · 00904705699",
      );
      await dialog
        .getByRole("textbox", { name: /^Supplier SKU/ })
        .fill("SYN-JOURNEY-OFFER");
      await dialog
        .getByRole("textbox", { name: /^Quoted package price/ })
        .fill("12.50");
      await dialog.getByRole("textbox", { name: /^Currency/ }).fill("USD");
      await dialog
        .getByRole("textbox", { name: /^Quote reference/ })
        .fill("SYN-JOURNEY-QUOTE");
      const bootstrap = (await api(page, "/api/clinic/inventory/bootstrap"))
        .data;
      await dialog.getByLabel(/^Quoted on/).fill(bootstrap.as_of.slice(0, 10));
      await choose(page, "Supplier contract status", "Active");
      await choose(page, "Availability", "Confirmed available");
      await dialog
        .getByRole("button", { name: "Save dated quote", exact: true })
        .click();
      await page
        .getByText(
          "Dated quote saved on the supplier offer. Review its eligibility before ordering.",
          { exact: true },
        )
        .waitFor();
      await page.goto(realUrl("/clinic/inventory"));
      await page.reload();
      const persisted = (
        await api(page, "/api/clinic/inventory/catalog?view=table")
      ).data;
      expect(persisted.first_run).toMatchObject({
        supplier: true,
        product: true,
        offer: true,
      });
      expect(persisted.first_run.product_id).toBe(String(created.id));
      expect(persisted.configuration.status).toBe("configured");
      await page.goto(realUrl("/clinic/inventory/counts"));
      const storage = page.getByRole("link", {
        name: "Manage storage locations",
        exact: true,
      });
      await storage.waitFor();
      await storage.click();
      await page
        .getByRole("textbox", { name: /^Location name/ })
        .fill("Synthetic journey leaf");
      await page
        .getByRole("button", { name: "Add location", exact: true })
        .click();
      await expect
        .poll(async () =>
          (
            await api(page, "/api/clinic/inventory/locations")
          ).data.location_options.some(
            (location: { name: string }) =>
              location.name === "Synthetic journey leaf",
          ),
        )
        .toBe(true);
      await page.goto(realUrl("/clinic/inventory/counts"));
      expect(
        await page
          .getByRole("link", { name: "Manage storage locations", exact: true })
          .count(),
      ).toBe(0);
      const bins = (await api(page, "/api/clinic/inventory/count-sessions"))
        .data.locations;
      expect(
        bins.some((location: { path: string }) =>
          location.path.includes("Synthetic journey leaf"),
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  },
  120_000,
);
