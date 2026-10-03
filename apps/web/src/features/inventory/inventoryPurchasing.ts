import type {
  Decimal,
  InventoryData,
  InventoryFacility,
  InventoryPurchaseCart,
  InventoryPurchaseOrder,
  InventorySupplierProduct,
  NadacBenchmark,
} from "./inventoryContracts";
import {
  decimalAdd,
  decimalCompare,
  decimalMoney,
  decimalMultiply,
  decimalSubtract,
  decimalSum,
} from "./inventoryContracts";

export function nonNegative(value: Decimal): Decimal {
  return decimalCompare(value, "0") < 0 ? "0" : value;
}
export function validDecimal(value: string, allowZero = false) {
  if (!/^-?\d+(?:\.\d+)?$/.test(value.trim())) return false;
  return decimalCompare(value, "0") >= (allowZero ? 0 : 1);
}
export function money(value: Decimal, currency?: string) {
  if (currency === "UNK")
    return `${decimalMoney(value)} (currency unconfirmed)`;
  return `${currency ? `${currency} ` : ""}${decimalMoney(value)}`;
}
export function onOrderUnits(data: InventoryData, productId: string): Decimal {
  return decimalSum(
    data.purchase_orders
      .filter((order) => !["cancelled", "complete"].includes(order.status))
      .flatMap((order) => order.lines)
      .filter((line) => line.product_id === productId)
      .map((line) =>
        nonNegative(decimalSubtract(line.ordered_units, line.received_units)),
      ),
  );
}
export function replenishmentCandidates(data: InventoryData) {
  return data.products.filter(
    (item) =>
      decimalCompare(
        decimalAdd(item.available_units, onOrderUnits(data, item.id)),
        item.reorder_point_units,
      ) < 0,
  );
}
export function recordedPackagePrice(
  data: InventoryData,
  productId: string,
): Decimal | undefined {
  return recordedPackageTerms(data, productId)?.packagePrice;
}
export function recordedPackageTerms(
  data: InventoryData,
  productId: string,
): { packagePrice: Decimal; currency: string } | undefined {
  const line = data.purchase_orders
    .flatMap((order) => order.lines)
    .find((line) => line.product_id === productId);
  return line
    ? { packagePrice: line.package_price, currency: line.currency }
    : undefined;
}
export function benchmarkPackagePrice(
  item: Pick<
    InventoryData["products"][number],
    "base_unit" | "units_per_package"
  >,
  benchmark?: NadacBenchmark,
): Decimal | undefined {
  if (
    !benchmark?.nadac_per_unit ||
    !benchmark.pricing_unit ||
    !validDecimal(benchmark.nadac_per_unit, true) ||
    !validDecimal(item.units_per_package)
  )
    return undefined;
  const unitKey = (value: string) => {
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z]/g, "");
    if (
      [
        "ea",
        "each",
        "tablet",
        "tablets",
        "capsule",
        "capsules",
        "vial",
        "vials",
        "package",
        "packages",
      ].includes(normalized)
    )
      return "count";
    if (["ml", "milliliter", "milliliters"].includes(normalized)) return "ml";
    if (["g", "gm", "gram", "grams"].includes(normalized)) return "g";
    return normalized;
  };
  if (unitKey(item.base_unit) !== unitKey(benchmark.pricing_unit))
    return undefined;
  return decimalMultiply(benchmark.nadac_per_unit, item.units_per_package);
}
export function supplierProductFor(
  data: InventoryData,
  productId: string,
  supplierId: string,
): InventorySupplierProduct | undefined {
  return supplierOffersFor(data, productId).find(
    (row) => row.supplier_id === supplierId,
  );
}
export function supplierOffersFor(data: InventoryData, productId: string) {
  const item = data.products.find((item) => item.id === productId);
  return (data.supplier_products ?? []).filter(
    (row) =>
      (row.product_id === productId ||
        (row.product_id == null &&
          Boolean(item?.ndc) &&
          row.ndc === item?.ndc)) &&
      row.available !== false,
  );
}
export function facilityCanReceivePurchaseOrder(record: InventoryFacility) {
  return (
    record.status === "active" &&
    Boolean(
      record.address_line1?.trim() &&
      record.city?.trim() &&
      record.state?.trim() &&
      record.postal_code?.trim() &&
      record.country?.trim(),
    )
  );
}
export function purchaseOrderFacilities(data: Pick<InventoryData, "sites">) {
  return (data.sites ?? []).filter((record) => record.status === "active");
}
export function facilityAddress(record?: InventoryFacility) {
  if (!record) return "";
  return [
    record.address_line1,
    record.address_line2,
    [record.city, record.state].filter(Boolean).join(", "),
    record.postal_code,
    record.country,
  ]
    .filter(Boolean)
    .join(", ");
}
export function purchaseOrderDestination(
  data: InventoryData,
  _productId: string,
) {
  return purchaseOrderFacilities(data).find(facilityCanReceivePurchaseOrder);
}

export type PurchaseCartDraft = {
  reason: string;
  destinationId: string;
  lineQuantities: Record<string, string>;
};

export function mergePurchaseCartDraft(
  previousCart: InventoryPurchaseCart | null | undefined,
  cart: InventoryPurchaseCart | null | undefined,
  draft: PurchaseCartDraft,
): PurchaseCartDraft {
  const sameCart = Boolean(previousCart?.id && previousCart.id === cart?.id);
  return {
    reason:
      sameCart && draft.reason !== (previousCart?.reason ?? "")
        ? draft.reason
        : (cart?.reason ?? ""),
    destinationId:
      sameCart &&
      draft.destinationId !== (previousCart?.destination_site_id ?? "")
        ? draft.destinationId
        : (cart?.destination_site_id ?? ""),
    lineQuantities: Object.fromEntries(
      (cart?.items ?? []).map((item) => {
        const previousItem = previousCart?.items.find(
          (candidate) => candidate.id === item.id,
        );
        const draftQuantity = draft.lineQuantities[item.id];
        return [
          item.id,
          sameCart &&
          draftQuantity !== undefined &&
          draftQuantity !== previousItem?.requested_packages
            ? draftQuantity
            : item.requested_packages,
        ];
      }),
    ),
  };
}

export type InventoryPurchaseOrderGroup = {
  id: string;
  checkoutGroupId: string | null;
  orders: InventoryPurchaseOrder[];
};

export function purchaseOrderGroups(
  orders: InventoryPurchaseOrder[],
): InventoryPurchaseOrderGroup[] {
  const groups = new Map<string, InventoryPurchaseOrderGroup>();
  orders.forEach((order) => {
    const checkoutGroupId = order.checkout_group_id ?? null;
    const id = checkoutGroupId ?? `order:${order.id}`;
    const group = groups.get(id) ?? { id, checkoutGroupId, orders: [] };
    group.orders.push(order);
    groups.set(id, group);
  });
  return Array.from(groups.values()).sort((left, right) =>
    (right.orders[0]?.created_at ?? "").localeCompare(
      left.orders[0]?.created_at ?? "",
    ),
  );
}

export function purchaseOrderStatusTone(
  status: string,
): "neutral" | "success" | "warning" | "danger" | "blue" {
  if (status === "complete") return "success";
  if (["cancelled", "rejected"].includes(status)) return "danger";
  if (status === "draft") return "warning";
  return "blue";
}

export function purchaseOrderGroupStatus(orders: InventoryPurchaseOrder[]): {
  label: string;
  tone: "neutral" | "success" | "warning" | "danger" | "blue";
} {
  const statuses = orders.map((order) => order.status);
  if (statuses.every((status) => status === "complete"))
    return { label: "Complete", tone: "success" };
  if (statuses.every((status) => status === "cancelled"))
    return { label: "Cancelled", tone: "danger" };
  if (statuses.every((status) => status === "draft"))
    return { label: "Needs review", tone: "warning" };
  return { label: "In progress", tone: "blue" };
}

export function purchaseOrderGroupTotal(
  group: InventoryPurchaseOrderGroup,
): string {
  const currencies = Array.from(
    new Set(
      group.orders.flatMap((order) => order.lines.map((line) => line.currency)),
    ),
  );
  return currencies.length === 1
    ? money(decimalSum(group.orders.map((order) => order.total)), currencies[0])
    : "Multiple currencies";
}
