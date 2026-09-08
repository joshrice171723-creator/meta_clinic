import { describe, expect, it } from "vitest";
import { mergePurchaseCartDraft } from "../src/features/inventory/InventoryApp";
import type {
  InventoryPurchaseCart,
  InventoryPurchaseCartItem,
} from "../src/features/inventory/inventoryContracts";

function item(
  id: string,
  requested_packages: string,
): InventoryPurchaseCartItem {
  return {
    id,
    product_id: `product-${id}`,
    product_name: `Product ${id}`,
    requested_packages,
    input_unit: "package",
    conversion_factor: "1",
    supplier_id: "supplier-1",
    supplier: "Supplier",
    supplier_product_id: `offer-${id}`,
    package_quantity: "1",
    supplier_packages: requested_packages,
    unit_price: "10",
    currency: "USD",
    extended_cost: "10",
    source: "manual",
  };
}

function cart(
  id: string,
  version: number,
  items: InventoryPurchaseCartItem[],
  reason = "Routine replenishment",
  destination_site_id = "site-1",
): InventoryPurchaseCart {
  return {
    id,
    status: "draft",
    version,
    items,
    reason,
    destination_site_id,
  };
}

describe("purchase cart drafts", () => {
  it("retains edits made while another line is saving through its acknowledged refresh", () => {
    const previous = cart("cart-1", 1, [item("a", "1"), item("b", "1")]);
    const refreshed = cart("cart-1", 2, [item("a", "2"), item("b", "1")]);

    expect(
      mergePurchaseCartDraft(previous, refreshed, {
        reason: "Urgent restock",
        destinationId: "site-2",
        lineQuantities: { a: "2", b: "3" },
      }),
    ).toEqual({
      reason: "Urgent restock",
      destinationId: "site-2",
      lineQuantities: { a: "2", b: "3" },
    });
  });

  it("uses refreshed values for clean fields and prunes removed lines", () => {
    const previous = cart("cart-1", 1, [item("a", "1"), item("b", "1")]);
    const refreshed = cart(
      "cart-1",
      2,
      [item("a", "2")],
      "Updated reason",
      "site-2",
    );

    expect(
      mergePurchaseCartDraft(previous, refreshed, {
        reason: previous.reason!,
        destinationId: previous.destination_site_id!,
        lineQuantities: { a: "1", b: "3" },
      }),
    ).toEqual({
      reason: "Updated reason",
      destinationId: "site-2",
      lineQuantities: { a: "2" },
    });
  });

  it("resets drafts for a different cart or no active cart", () => {
    const previous = cart("cart-1", 1, [item("a", "1")]);
    const next = cart("cart-2", 1, [item("c", "5")], "New cart", "site-3");
    const draft = {
      reason: "Unsaved prior reason",
      destinationId: "site-2",
      lineQuantities: { a: "4" },
    };

    expect(mergePurchaseCartDraft(previous, next, draft)).toEqual({
      reason: "New cart",
      destinationId: "site-3",
      lineQuantities: { c: "5" },
    });
    expect(mergePurchaseCartDraft(previous, null, draft)).toEqual({
      reason: "",
      destinationId: "",
      lineQuantities: {},
    });
  });
});
