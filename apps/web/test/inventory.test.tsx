import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import {
  InventoryApp,
  benchmarkPackagePrice,
  inferInventoryUnits,
  inventoryDate,
  inventoryDateTime,
  inventoryMovementViewState,
  inventoryMutationAttempt,
  inventoryOutcomeUnconfirmed,
  recallSelectableBalances,
  recallViewState,
} from "../src/features/inventory/InventoryApp";
import {
  decimalAdd,
  decimalCeilDivide,
  decimalCompare,
  decimalDisplay,
  decimalMoney,
  decimalMultiply,
  decimalSubtract,
} from "../src/features/inventory/inventoryContracts";

describe("inventory integration", () => {
  it("infers the stock unit and package quantity from FDA package text", () => {
    expect(
      inferInventoryUnits({
        dosage_form: "TABLET, FILM COATED",
        package_description:
          "40 TABLET, FILM COATED IN 1 BOTTLE, PLASTIC (51655-474-51)",
      }),
    ).toEqual({
      stockUnit: "tablet",
      packageSize: "40",
      quantityScale: "0",
      source: "package-description",
    });
    expect(
      inferInventoryUnits({
        dosage_form: "SOLUTION",
        package_description: "7 mL in 1 VIAL",
      }),
    ).toEqual({
      stockUnit: "mL",
      packageSize: "7",
      quantityScale: "0",
      source: "package-description",
    });
    expect(
      inferInventoryUnits({
        dosage_form: "TABLET",
        package_description: "1 BOTTLE",
      }).stockUnit,
    ).toBe("package");
  });

  it("converts a compatible public unit benchmark into a package price", () => {
    expect(
      benchmarkPackagePrice(
        { base_unit: "tablet", units_per_package: "100" },
        {
          ndc: "00063087621",
          nadac_per_unit: "0.12345",
          pricing_unit: "EA",
          source_url: "https://example.test/nadac",
        },
      ),
    ).toBe("12.345");
    expect(
      benchmarkPackagePrice(
        { base_unit: "tablet", units_per_package: "100" },
        {
          ndc: "00063087621",
          nadac_per_unit: "0.12345",
          pricing_unit: "ML",
          source_url: "https://example.test/nadac",
        },
      ),
    ).toBeUndefined();
  });

  it("preserves exact fractional and large decimal values", () => {
    expect(decimalAdd("9007199254740992.125", "0.875")).toBe(
      "9007199254740993",
    );
    expect(
      decimalCompare("100000000000000000.01", "100000000000000000.1"),
    ).toBe(-1);
    expect(decimalSubtract("10.25", "0.125")).toBe("10.125");
    expect(decimalMultiply("9007199254740992.125", "2")).toBe(
      "18014398509481984.25",
    );
    expect(decimalCeilDivide("10.1", "2.5")).toBe("5");
    expect(decimalDisplay("12345.3400")).toBe("12,345.34");
    expect(decimalMoney("12345.2")).toBe("12,345.20");
  });

  it("retains a mutation key only for an explicit same-intent retry", () => {
    const first = inventoryMutationAttempt(
      null,
      "/api/clinic/inventory/lots/1/transfer",
      { transfer: { quantity: "0.125" } },
      () => "retained-key",
    );
    expect(first?.key).toBe("retained-key");
    expect(
      inventoryMutationAttempt(first, "/api/clinic/inventory/lots/1/transfer", {
        transfer: { quantity: "0.125" },
      })?.key,
    ).toBe("retained-key");
    expect(
      inventoryMutationAttempt(first, "/api/clinic/inventory/lots/1/transfer", {
        transfer: { quantity: "0.5" },
      }),
    ).toBeNull();
    expect(inventoryOutcomeUnconfirmed(new TypeError("network"))).toBe(true);
    expect(inventoryOutcomeUnconfirmed(new ApiError(503, "down"))).toBe(true);
    expect(inventoryOutcomeUnconfirmed(new ApiError(422, "invalid"))).toBe(
      false,
    );
  });

  it("preserves calendar dates and formats timestamps in the practice timezone", () => {
    expect(inventoryDate("2027-07-31", "America/Chicago")).toBe("Jul 31, 2027");
    expect(
      inventoryDateTime("2027-07-31T02:30:00Z", "America/Chicago"),
    ).toContain("Jul 30");
  });

  it("distinguishes an empty movement ledger from a filter with no matches", () => {
    expect(inventoryMovementViewState(0, 0, "")).toBe("empty");
    expect(inventoryMovementViewState(4, 0, "transfer")).toBe("filtered_empty");
    expect(inventoryMovementViewState(4, 4, "")).toBe("results");

    const source = readFileSync(
      "src/features/inventory/InventoryApp.tsx",
      "utf8",
    );
    expect(source).toContain("No movements recorded");
    expect(source).toContain(
      "Clear the filter to review the full movement ledger.",
    );
    expect(source).toContain("Inventory movement ledger");
  });
  it("renders a loading state before the Rails wire is available", () => {
    const html = renderToStaticMarkup(
      <InventoryApp path="/clinic/inventory" />,
    );

    expect(html).toContain("Loading…");
    expect(html).toContain('role="status"');
  });

  it("keeps every canonical inventory screen on the same APPly-backed surface", () => {
    const source = readFileSync(
      "src/features/inventory/InventoryApp.tsx",
      "utf8",
    );
    const supplierSource = readFileSync(
      "src/features/inventory/SupplierPricing.tsx",
      "utf8",
    );

    for (const path of [
      "/clinic/inventory",
      "/clinic/inventory/catalog/new",
      "/clinic/inventory/replenishment",
      "/clinic/inventory/purchasing",
      "/clinic/inventory/suppliers",
      "/clinic/inventory/purchasing/new",
      "/clinic/inventory/shipments/new",
      "/clinic/inventory/receiving",
      "/clinic/inventory/lots",
      "/clinic/inventory/activity",
      "/clinic/inventory/recalls",
      "/clinic/inventory/controlled",
    ]) {
      expect(source).toContain(path);
    }
    expect(source).toContain('"/api/clinic/inventory/bootstrap"');
    expect(source).toContain('"/api/clinic/pharmacy"');
    expect(source).toContain('"/api/clinic/pharmacy/lookup"');
    expect(source).toContain('"/api/clinic/pharmacy/device_lookup"');
    expect(source).toContain('"/api/clinic/inventory/shipments"');
    expect(supplierSource).toContain(
      '"/api/clinic/inventory/suppliers/preview"',
    );
    expect(supplierSource).toContain("wholesale_cost");
    expect(supplierSource).toContain("Preferred supplier by catalog item");
    expect(source).toContain("Create item and continue");
    expect(source).toContain("Item category");
    expect(source).toContain("Use FDA device data (optional)");
    expect(source).toContain("UDI-DI / GTIN");
    expect(source).toContain("NDC / UDI-DI");
    expect(source).toContain("device_identifier");
    expect(source).toContain("Choose exact FDA package");
    expect(source).toContain("Select a package");
    expect(source).toContain('"/api/clinic/pharmacy/nadac"');
    expect(source).toContain("Public cost benchmark");
    expect(source).toContain("Inventory definition");
    expect(source).not.toContain("What happens next");
    expect(source).toContain("Search begins automatically after 3 characters.");
    expect(source).not.toContain("Search directory");
    expect(source).toContain("No catalog items yet");
    expect(source).toContain("Mark delivered → Receiving");
    expect(source).toContain('"/api/clinic/inventory_configuration"');
    expect(source).toContain("Initial clinic inventory setup");
    expect(source).toContain("Enable purchasing and receiving");
    expect(source).toContain("requiresReasonDetails");
    expect(source).not.toContain("package_unit");
    expect(source).not.toContain('currency: "USD"');
    expect(source).not.toContain('reason: "Authorized certification"');
    expect(source).not.toContain('"/api/clinic/inventory/demo"');
    expect(source).not.toContain("history.pushState");
    expect(source).not.toContain('"popstate"');
  });

  it("represents operational states and does not use browser persistence", () => {
    const source = readFileSync(
      "src/features/inventory/InventoryApp.tsx",
      "utf8",
    );

    for (const text of [
      "No inventory records",
      "Unable to load inventory",
      "page retried once",
      "permission",
      "Draft created",
    ]) {
      expect(source.toLowerCase()).toContain(text.toLowerCase());
    }
    expect(source).not.toContain("Development-only synthetic data");
    expect(source).not.toContain("Canonical scenario loaded");
    expect(source).not.toContain("Rails API");
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });

  it("keeps a recall with no exact held balance selectable and non-actionable", () => {
    const source = readFileSync(
      "src/features/inventory/InventoryApp.tsx",
      "utf8",
    );

    expect(source).toContain("recallSelectableBalances(");
    expect(source).toContain("No exact active hold for this recall");
    expect(source).toContain("Choose another recall to review its exact");
    expect(source).toContain("no disposition can be recorded here.");
    expect(source).not.toContain("!recall || !item || !recalledLot || !batch");
  });

  it("selects only the exact recall hold when recalls share a lot", () => {
    const balances = [
      {
        id: "bal-1",
        product_id: "product-1",
        lot_id: "lot-1",
        location_id: "location-1",
        recall_ids: ["recall-a"],
        on_hand_units: "10",
        held_units: "10",
        blocked_units: "0",
        quarantined_units: "10",
        available_units: "0",
      },
    ];

    expect(
      recallSelectableBalances(balances, "recall-a", ["lot-1"]),
    ).toHaveLength(1);
    expect(
      recallSelectableBalances(balances, "recall-b", ["lot-1"]),
    ).toHaveLength(0);
  });

  it("keeps empty, unheld, and held recall states truthful", () => {
    expect(recallViewState(undefined, false)).toMatchObject({
      empty: true,
      actionable: false,
      showComplete: false,
    });
    expect(
      recallViewState({ status: "disposition_complete" }, false),
    ).toMatchObject({
      actionable: false,
      availability: "Not held for this recall",
      showComplete: false,
      workflowStage: 4,
    });
    expect(
      recallViewState({ status: "disposition_pending" }, true),
    ).toMatchObject({
      actionable: true,
      showComplete: false,
      workflowStage: 4,
    });
  });
});
