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
  "#22 #77 #161 actual same-session supplier setup, normalized quote, purchase, receipt and count persist across reload",
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
      // Seeded catalog provenance: manufactured model fixture, not a signed directory import.
      const seeded = fixture.inventory_scenarios as {
        catalog_provenance: string;
        product_id: number;
        product_name: string;
        product_sku: string;
        product_ndc: string;
      };
      expect(seeded.catalog_provenance).toBe("independently_manufactured_synthetic_model_fixture");
      const created = { id: seeded.product_id };
      const catalogProduct = (await api(page, "/api/clinic/inventory/bootstrap")).data.products.find(
        (product: { id: string }) => product.id === String(created.id),
      );
      expect(catalogProduct).toMatchObject({
        id: String(created.id), name: seeded.product_name, ndc: seeded.product_ndc,
        base_unit: "tablet", units_per_package: "90.0",
      });
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
      // Continue through the existing native purchasing, shipment, receiving and count screens.
      await page.goto(realUrl("/clinic/inventory/purchasing/new"));
      await page.locator(".purchase-catalog-list .inventory-list-row").filter({ hasText: "Synthetic Aspirin" }).getByRole("button", { name: "Add", exact: true }).click();
      await choose(page, "Destination facility", fixture.site_name);
      await page.getByRole("textbox", { name: /^Purchase reason/ }).fill("Synthetic first-run procurement");
      await page.getByRole("button", { name: "Check out", exact: true }).click();
      await expect.poll(async () => (await api(page, "/api/clinic/inventory/bootstrap")).data.purchase_orders.length).toBe(1);
      const ordered = (await api(page, "/api/clinic/inventory/bootstrap")).data.purchase_orders[0];
      await page.goto(realUrl(`/clinic/inventory/purchasing?purchase_order_id=${ordered.id}`));
      for (const action of ["Submit purchase order", "Approve purchase order", "Mark order sent"]) {
        await page.getByRole("button", { name: action, exact: true }).click();
        const confirmation = page.getByRole("dialog", { name: `${action}?`, exact: true });
        await confirmation.getByRole("textbox", { name: /^Action reason/ }).fill("Synthetic authorized first-run action");
        await confirmation.getByRole("button", { name: action, exact: true }).click();
        await expect.poll(() => confirmation.count()).toBe(0);
      }
      await page.getByRole("link", { name: "Record delivery", exact: true }).click();
      await page.getByRole("spinbutton", { name: /^Packages in shipment/ }).fill("1");
      await page.getByRole("textbox", { name: /^Internal shipment reference/ }).fill("SYN-JOURNEY-SHIPMENT");
      await page.getByRole("textbox", { name: /^Supplier delivery reference/ }).fill("SYN-JOURNEY-DELIVERY");
      await page.getByRole("button", { name: "Register shipment", exact: true }).click();
      await page.getByRole("dialog", { name: "Confirm inventory action", exact: true }).getByRole("button", { name: "Confirm action", exact: true }).click();
      await page.waitForURL(url => url.pathname === "/clinic/inventory/purchasing");
      const shipment = page.getByRole("region", { name: "Shipment SYN-JOURNEY-DELIVERY", exact: true });
      await choose(page, "Next status for shipment SYN-JOURNEY-DELIVERY", "delivered");
      await shipment.getByRole("textbox", { name: /^Status update note/ }).fill("Synthetic delivery physically checked");
      await shipment.getByRole("button", { name: "Record status update", exact: true }).click();
      await shipment.getByRole("link", { name: "Open receiving record", exact: true }).click();
      await page.getByRole("textbox", { name: "Lot number", exact: true }).fill("SYN-JOURNEY-LOT");
      const expiry = new Date(`${fixture.day}T12:00:00Z`); expiry.setUTCFullYear(expiry.getUTCFullYear() + 1);
      await page.getByLabel("Expiration", { exact: true }).fill(expiry.toISOString().slice(0, 10));
      await page.getByRole("textbox", { name: /^Accepted/ }).fill("1");
      const leaf = (await api(page, "/api/clinic/inventory/locations")).data.location_options.find((location: any) => location.name === "Synthetic journey leaf");
      await page.getByRole("combobox", { name: "Destination", exact: true }).selectOption(String(leaf.id));
      await page.getByRole("textbox", { name: "Reason", exact: true }).fill("Synthetic first-run receipt");
      await page.getByRole("button", { name: "Confirm receipt", exact: true }).click();
      await page.getByRole("dialog", { name: "Confirm this receipt?", exact: true }).getByRole("button", { name: "Confirm action", exact: true }).click();
      await expect.poll(async () => (await api(page, "/api/clinic/inventory/catalog?view=table")).data.first_run.received).toBe(true);
      await page.goto(realUrl("/clinic/inventory")); await page.reload();
      const completed = (await api(page, "/api/clinic/inventory/catalog?view=table")).data;
      expect(completed.first_run).toMatchObject({ supplier: true, product: true, offer: true, purchase_order: true, received: true, binned: true });
      expect(completed.configuration.status).toBe("configured");
      expect(completed.first_run.product_id).toBe(String(created.id));
      expect(completed.first_run.purchase_order_id).toBe(String(ordered.id));
      for (const siteId of [fixture.second_site_id, fixture.site_id]) {
        const switched = await realMutation(page, "/api/clinic/context", { site_id: siteId }, "PATCH");
        expect(switched.status()).toBe(200);
        await page.goto(realUrl("/clinic/inventory")); await page.reload();
        const restored = (await api(page, "/api/clinic/inventory/catalog?view=table")).data;
        expect(restored.configuration.status).toBe("configured");
        expect(restored.first_run).toEqual(completed.first_run);
      }
      await page.goto(realUrl("/clinic/inventory/counts"));
      const countData = (await api(page, "/api/clinic/inventory/count-sessions")).data;
      const assignee = countData.assignees.find((person: any) => person.id === String(fixture.actor_user_id));
      await choose(page, /^Leaf bin/, leaf.path);
      await choose(page, /^Assigned counter/, assignee.name);
      await page.getByLabel(/^Due date/).fill(fixture.day);
      await choose(page, "Counting mode", "Show expected quantity");
      await page.getByRole("textbox", { name: /^Session reason/ }).fill("Synthetic first-run count");
      await page.getByRole("button", { name: "Create count session", exact: true }).click();
      await page.getByRole("button", { name: "Open session", exact: true }).click();
      await page.getByRole("spinbutton", { name: /^Counted quantity/ }).fill("90");
      await page.getByRole("textbox", { name: /^Observation reason \/ note/ }).fill("Synthetic exact physical count");
      await page.getByRole("button", { name: "Record observation", exact: true }).click();
      await page.getByRole("textbox", { name: /^Management reason/ }).fill("Synthetic count reconciled");
      await page.getByRole("button", { name: "Complete session", exact: true }).click();
      await expect.poll(async () => (await api(page, "/api/clinic/inventory/count-sessions?status=completed")).data.sessions.length).toBe(1);
      const counted = (await api(page, "/api/clinic/inventory/count-sessions?status=completed")).data.sessions[0];
      expect(counted.status).toBe("completed");
      expect(counted.line_count).toBe(1);
      await page.reload();
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  },
  240_000,
);


it.runIf(realStackEnabled)(
  "#199 actual inherited location recommended scope saves and exact replay does not duplicate",
  async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(10_000);
    try {
      await loginReal(page, fixture);
      const before = await realGet<any>(page, `/api/clinic/practice_features?site_id=${fixture.site_id}`);
      const defaults = await realMutation(page, "/api/clinic/practice_features", { features: {
        clinic_type: "primary_care", service_scope: ["telehealth"], assessment_scope: [],
        insurance_workflows_enabled: false, expected_revision: 0,
        request_key: `native-inherited-default-${fixture.head}`,
      } }, "PUT");
      expect(defaults.status()).toBe(200);
      const site = await api(page, "/api/clinic/facilities", { site: {
        code: "INHERITED-NATIVE", name: "Synthetic inherited profile location", status: "active",
        address_line1: "100 Synthetic QA Way", city: "Oklahoma City", state: "OK", postal_code: "73102", country: "US",
      } });
      const inherited = await realGet<any>(page, `/api/clinic/practice_features?site_id=${site.id}`);
      expect(inherited.features).toMatchObject({ profile_scope: "clinic_default", configured: false, revision: 0, service_scope: ["telehealth"] });
      await page.goto(realUrl("/clinic/setup"));
      await page.getByText("This location currently inherits its clinic profile. Choose and save a location specialty before assigning patients here.", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Use recommended starting scope", exact: true }).click();
      const submitted = page.waitForRequest(request => new URL(request.url()).pathname === "/api/clinic/practice_features" && request.method() === "PUT");
      const response = page.waitForResponse(response => new URL(response.url()).pathname === "/api/clinic/practice_features" && response.request().method() === "PUT");
      await page.getByRole("button", { name: "Save clinic profile", exact: true }).click();
      const request = await submitted;
      expect((await response).status()).toBe(200);
      const saved = await realGet<any>(page, `/api/clinic/practice_features?site_id=${site.id}`);
      expect(saved.features).toMatchObject({ profile_scope: "site", configured: true, revision: 1 });
      expect(saved.features.service_scope).toEqual(inherited.features.recommended_service_scope);
      const replay = await realMutation(page, "/api/clinic/practice_features", request.postDataJSON(), "PUT");
      expect(replay.status()).toBe(200);
      expect((await replay.json()).features.revision).toBe(1);
      await page.reload();
      await page.getByRole("button", { name: "Save clinic profile", exact: true }).waitFor();
      const reloaded = await realGet<any>(page, `/api/clinic/practice_features?site_id=${site.id}`);
      expect(reloaded.features.revision).toBe(1);
      const primary = await realGet<any>(page, `/api/clinic/practice_features?site_id=${fixture.site_id}`);
      expect(primary.features).toEqual(before.features);
    } finally { await page.close(); }
  },
  90_000,
);
