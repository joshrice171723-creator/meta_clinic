import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const inventoryApp = readFileSync(
  new URL("../src/features/inventory/InventoryApp.tsx", import.meta.url),
  "utf8",
);

describe("replenishment supplier-pricing recovery", () => {
  it("offers a supplier-pricing route when an item has no eligible offer", () => {
    expect(inventoryApp).toContain(
      "href={`/clinic/inventory/suppliers?q=${encodeURIComponent(product.name)}`}",
    );
    expect(inventoryApp).toContain("Review pricing");
  });
});
