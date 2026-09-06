import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import {
  InventoryApp,
  ActivityScreen,
  CatalogScreen,
  ReceivingScreen,
  benchmarkPackagePrice,
  inferInventoryUnits,
  inventoryDate,
  inventoryDateTime,
  inventoryMovementViewState,
  inventoryMutationAttempt,
  inventoryOutcomeUnconfirmed,
  purchaseOrderGroups,
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
import type {
  InventoryData,
  InventoryActivityData,
  InventoryCatalogData,
  InventoryPurchaseOrder,
} from "../src/features/inventory/inventoryContracts";

describe("inventory integration", () => {
  it("renders catalog counts, exact stock, attention totals and failed reads", () => {
    const data: InventoryCatalogData = {
      schema_version: "inventory-wire-v1",
      dataset_version: "bulk_v3",
      data_version: 1,
      as_of: "2026-09-05T12:00:00Z",
      timezone: "America/Chicago",
      practice: { id: 1, name: "Catalog fixture", timezone: "America/Chicago" },
      users: [],
      current_user_id: "1",
      capabilities: {},
      configuration: { status: "configured", version: 1, reason: "Fixture" },
      catalog_page: {
        query: "",
        status: "all",
        sort: "name",
        page: 2,
        page_count: 3,
        page_size: 20,
        total_count: 45,
        filtered_count: 45,
      },
      products: [
        {
          id: "21",
          name: "Catalog fixture liquid",
        schedule: null,
        preferred_supplier: null,
          category: "medication",
          ndc: "",
          device_identifier: "",
          active: true,
          package_id: "pkg_21",
          base_unit: "mL",
          units_per_package: "1.25",
          reorder_point_units: "1",
          available_units: "2.5",
          on_hand_units: "2.5",
          low_stock: false,
        },
      ],
      packages: [],
      can_create_purchase_order: true,
      attention_count: 25,
      attention: [
        {
          id: "1",
          product_id: "21",
          product_name: "Catalog fixture liquid",
          lot_number: "HELD-FIXTURE",
          expiration_date: "2099-01-01",
          status: "quarantined",
        },
      ],
    };
    const render = (extra = {}) =>
      renderToStaticMarkup(
        <CatalogScreen data={data} onRead={async () => {}} {...extra} />,
      );
    const html = render();
    expect(html).toContain("45 total");
    expect(html).toContain("2.5");
    expect(html).not.toContain("mLs");
    expect(html).toContain("HELD-FIXTURE");
    expect(html).toContain("25");
    expect(html).toContain("Catalog pagination");
    expect(html).toContain("product_id=21");
    expect(render({ error: "Read failed" })).toContain(
      "The previous catalog page remains visible.",
    );
    expect(render({ loading: true })).toContain("Loading catalog");
    data.products = [];
    data.catalog_page = {
      ...data.catalog_page,
      query: "no match",
      filtered_count: 0,
      page: 1,
      page_count: 1,
    };
    expect(render()).toContain("No products match this view");
    expect(render()).toContain("Reset view");
    data.catalog_page.total_count = 0;
    expect(render()).toContain("No catalog items yet");
  });

  it("renders server ledger totals, exact units, paging and read failures", () => {
    const data: InventoryActivityData = {
      schema_version: "inventory-wire-v1",
      dataset_version: "fixture",
      data_version: 1,
      as_of: "2026-09-05T12:00:00Z",
      timezone: "UTC",
      practice: { id: 1, name: "Ledger fixture", timezone: "UTC" },
      users: [],
      current_user_id: "1",
      capabilities: { "inventory.read": true },
      activity_page: {
        query: "older receipt",
        total_count: 240,
        filtered_count: 65,
        before_cursor: "150",
        next_cursor: "100",
        page_size: 50,
      },
      movements: [
        {
          id: "120",
          type: "receipt",
          lot_id: "1",
          location_id: "1",
          quantity_units: "0.125",
          direction: "in",
          source_id: "receipt_1",
          occurred_at: "2026-09-05T12:00:00Z",
          reason: "Older receipt fixture",
          lot_number: "OLD-LOT",
          location_name: "Fixture shelf",
          stock_unit: "mL",
        },
      ],
    };
    const render = (loading = false, error = "") =>
      renderToStaticMarkup(
        <ActivityScreen
          data={data}
          loading={loading}
          error={error}
          onRead={async () => {}}
        />,
      );
    const html = render();
    expect(html).toContain("1 shown · 65 matching of 240 recorded movements.");
    expect(html).toContain("0.125 mL");
    expect(html).toContain("OLD-LOT");
    expect(html).toContain("Newest movements");
    expect(html).toContain("Older movements");
    expect(html).toContain("Clear filter");
    expect(render(true)).toContain("Loading movements");
    expect(render(false, "Request failed")).toContain(
      "Request failed The previous ledger page remains visible.",
    );
    data.movements = [];
    expect(render()).toContain("No older movements");
    data.activity_page = {
      ...data.activity_page,
      before_cursor: null,
      next_cursor: null,
      filtered_count: 0,
    };
    expect(render()).toContain("No movements match");
    data.activity_page = { ...data.activity_page, query: "", total_count: 0 };
    expect(render()).toContain("No movements recorded");
  });
  it("renders supplier-package receiving totals from the PO snapshot", () => {
    const data: InventoryData = {
      schema_version: "1",
      dataset_version: "fixture",
      data_version: 1,
      as_of: "2026-09-05T12:00:00Z",
      timezone: "UTC",
      practice: { id: 1, name: "Fixture clinic", timezone: "UTC" },
      users: [],
      current_user_id: "1",
      capabilities: { "inventory.receive": true },
      products: [
        {
          id: "1",
          name: "Fixture liquid",
          category: "medication",
          active: true,
          ndc: "",
          device_identifier: "",
          schedule: null,
          package_id: "pkg",
          base_unit: "mL",
          units_per_package: "10.5",
          reorder_point_units: "0",
          preferred_supplier: null,
          available_units: "0",
          on_hand_units: "0",
          low_stock: false,
        },
      ],
      packages: [
        {
          id: "pkg",
          product_id: "1",
          description: "Catalog 10.5 mL",
          input_unit: "package",
          units_per_package: "10.5",
        },
      ],
      locations: [{ id: "1", name: "Shelf", kind: "storage", areas: [], site_id: null,
        parent_location_id: null, status: "active", path: "Shelf", child_count: 0, stock_destination: true }],
      lots: [],
      balances: [],
      movements: [],
      receipts: [],
      recalls: [],
      controlled_reconciliations: [],
      audit_events: [],
      purchase_orders: [
        {
          id: "po",
          number: "Fixture PO",
          status: "sent",
          supplier: null,
          destination: "Shelf",
          created_at: "2026-09-05T12:00:00Z",
          subtotal: "3",
          tax: "0",
          shipping: "0",
          total: "3",
          lines: [
            {
              id: "line",
              product_id: "1",
              package_id: "pkg",
              ordered_packages: "3",
              units_per_package: "7.25",
              ordered_units: "21.75",
              package_price: "1",
              currency: "USD",
              received_units: "0",
              received_packages: "0",
            },
          ],
        },
      ],
      shipments: [
        {
          id: "shipment",
          po_id: "po",
          supplier_reference: "Fixture delivery",
          status: "delivered",
          package_count: 2,
          delivered_at: "2026-09-05T12:00:00Z",
          expected_units: "14.5",
          allocations: [
            { purchase_order_line_id: "line", expected_packages: "2" },
          ],
        },
      ],
    };
    const html = renderToStaticMarkup(
      <ReceivingScreen data={data} busy={false} run={async () => {}} />,
    );
    expect(html).toContain("7.25 mL per ordered package");
    expect(html).toContain("2 package · 14.5 mL");
    expect(html).not.toContain("21 mL");
    expect(html).not.toContain("Catalog 10.5 mL");
    expect(html).toContain("Missing packages");
    expect(html).toContain("Excess packages refused");
    data.shipments[0].reconciliation = {
      id: "reconciliation",
      accepted_packages: "0",
      missing_packages: "2",
      rejected_packages: "0",
      excess_packages: "0",
      exception: "short_delivery",
      reason: "Fixture delivery missing both packages",
      observations: [
        {
          product_id: "1",
          lot_number: "OBSERVED-FIXTURE-LOT",
          expires_on: "2099-01-02",
          temperature_c: "8.1",
        },
      ],
      actor_id: "1",
      recorded_at: data.as_of,
    };
    const reconciled = renderToStaticMarkup(
      <ReceivingScreen data={data} busy={false} run={async () => {}} />,
    );
    expect(reconciled).toContain("Delivery reconciled");
    expect(reconciled).toContain("Fixture delivery missing both packages");
    expect(reconciled).toContain("Reconciled with discrepancy");
    expect(reconciled).toContain("0 package · 0 mL");
    expect(reconciled).toContain('value="OBSERVED-FIXTURE-LOT"');
    expect(reconciled).toContain('value="2099-01-02"');
    expect(reconciled).toContain('value="8.1"');
  });

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

  it("groups checkout-created purchase orders without merging standalone orders", () => {
    const order = (id: string, checkout_group_id: string | null, created_at: string) =>
      ({ id, checkout_group_id, created_at } as InventoryPurchaseOrder);

    const groups = purchaseOrderGroups([
      order("po-2", "checkout-1", "2027-07-31T12:00:00Z"),
      order("po-3", "checkout-1", "2027-07-31T12:00:01Z"),
      order("po-1", null, "2027-07-30T12:00:00Z"),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].orders.map((record) => record.id)).toEqual(["po-2", "po-3"]);
    expect(groups[1].orders.map((record) => record.id)).toEqual(["po-1"]);
    expect(groups[1].checkoutGroupId).toBeNull();
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
    const facilitiesSource = readFileSync(
      "src/features/clinic/Facilities.tsx",
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
    expect(source).toContain('window.location.replace("/clinic/facilities")');
    expect(source).not.toContain("Set up a clinic facility first.");
    expect(facilitiesSource).not.toContain("selected_only=true");
    expect(source).toContain('"/api/clinic/pharmacy"');
    expect(source).toContain('"/api/clinic/pharmacy/lookup"');
    expect(source).toContain('"/api/clinic/pharmacy/device_lookup"');
    expect(source).toContain('"/api/clinic/inventory/shipments"');
    expect(supplierSource).toContain(
      '"/api/clinic/inventory/suppliers/preview"',
    );
    expect(supplierSource).toContain("wholesale_unit_cost");
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
    expect(source).toContain("No public CMS NADAC benchmark was found for this exact NDC");
    expect(source).toContain("The last recorded package price is shown");
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
        transferable: false,
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
