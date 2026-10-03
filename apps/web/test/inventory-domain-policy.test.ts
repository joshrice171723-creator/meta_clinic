import { describe, expect, it, vi } from "vitest";
import { beforeAll, afterAll } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";
import { ApiError } from "../src/api/client";
import {
  links,
  screenForPath,
  screenTitle,
  type Screen,
} from "../src/features/inventory/inventoryNavigation";
import {
  inventoryMutationAttempt,
  inventoryOutcomeUnconfirmed,
  inventoryMutationResponseOwned,
  inventoryUsesAcknowledgement,
} from "../src/features/inventory/inventoryMutationRecovery";
import {
  money,
  purchaseOrderGroups,
  purchaseOrderGroupTotal,
  supplierOffersFor,
  supplierProductFor,
} from "../src/features/inventory/inventoryPurchasing";
import type {
  InventoryData,
  InventoryPurchaseOrder,
  InventorySupplierProduct,
} from "../src/features/inventory/inventoryContracts";

describe("inventory navigation and response policy", () => {
  const routes: [string, Screen, boolean][] = [
    ["/clinic/inventory", "catalog", true],
    ["/clinic/inventory/catalog/new", "catalog_new", true],
    ["/clinic/inventory/configure", "configure", true],
    ["/clinic/inventory/locations", "locations", true],
    ["/clinic/inventory/suppliers", "supplier_pricing", true],
    ["/clinic/inventory/replenishment", "replenishment", true],
    ["/clinic/inventory/purchasing", "purchasing", true],
    ["/clinic/inventory/purchasing/new", "purchase_order_new", true],
    ["/clinic/inventory/shipments/new", "shipment_new", true],
    ["/clinic/inventory/receiving", "receiving", true],
    ["/clinic/inventory/lots", "lots", true],
    ["/clinic/inventory/activity", "activity", true],
    ["/clinic/inventory/exceptions", "exceptions", true],
    ["/clinic/inventory/recalls", "recalls", true],
    ["/clinic/inventory/counts", "counts", true],
    ["/clinic/inventory/controlled", "controlled", true],
  ];

  it.each(routes)(
    "preserves %s and its mutation response mode",
    (path, screen, ack) => {
      expect(screenForPath(path)).toBe(screen);
      expect(screenForPath(`${path}/`)).toBe(screen);
      expect(inventoryUsesAcknowledgement(screen)).toBe(ack);
      expect(screenTitle(screen)).not.toBe("");
    },
  );

  it("keeps every navigation destination reachable and retains the fallback", () => {
    for (const link of links)
      expect(screenForPath(link.href)).toBe(link.screen);
    expect(screenForPath("/clinic/inventory/unknown")).toBe("catalog");
  });
});

describe("inventory exact retry recovery", () => {
  const endpoint = "/api/clinic/inventory/lots/1/adjust";
  const body = { adjustment: { delta_units: "0.125", reason: "Count" } };

  it("retains a timeout attempt for an exact retry and blocks changed intent", () => {
    const attempt = inventoryMutationAttempt(
      null,
      endpoint,
      body,
      () => "key-1",
    );
    expect(
      inventoryOutcomeUnconfirmed(new ApiError(408, "Request timed out")),
    ).toBe(true);
    expect(
      inventoryMutationAttempt(attempt, endpoint, body, () => "key-2"),
    ).toEqual(attempt);
    expect(
      inventoryMutationAttempt(attempt, `${endpoint}/other`, body),
    ).toBeNull();
    expect(
      inventoryMutationAttempt(attempt, endpoint, {
        adjustment: { ...body.adjustment, delta_units: "0.25" },
      }),
    ).toBeNull();
  });

  it.each([400, 401, 403, 404, 409, 422])(
    "keeps a definite HTTP %s rejection distinct",
    (status) => {
      expect(
        inventoryOutcomeUnconfirmed(new ApiError(status, "Rejected")),
      ).toBe(false);
    },
  );

  it("keeps network, server, and explicitly unconfirmed outcomes uncertain", () => {
    for (const reason of [
      new TypeError("Network unavailable"),
      new ApiError(503, "Unavailable"),
      new ApiError(409, "The outcome is unconfirmed"),
      new ApiError(422, "Unknown result", "outcome_unconfirmed"),
    ])
      expect(inventoryOutcomeUnconfirmed(reason)).toBe(true);
  });

  it.each(["navigate", "unmount"])(
    "does not run a late create continuation after %s",
    async (change) => {
      const owner = { mounted: true, scope: "/clinic/inventory/catalog/new" };
      const requestScope = owner.scope;
      const continueToOrder = vi.fn();
      let resolveResponse!: (value: { id: string }) => void;
      const response = new Promise<{ id: string }>((resolve) => {
        resolveResponse = resolve;
      });
      const pending = response.then((payload) => {
        if (inventoryMutationResponseOwned(owner, requestScope))
          continueToOrder(payload.id);
      });
      if (change === "navigate")
        owner.scope = "/clinic/inventory/lots?product_id=other";
      else owner.mounted = false;
      resolveResponse({ id: "created-product" });
      await pending;
      expect(continueToOrder).not.toHaveBeenCalled();
    },
  );

  it("continues an acknowledged create on its still-owned route", async () => {
    const owner = {
      mounted: true,
      scope: "/clinic/inventory/catalog/new?category=medication",
    };
    const requestScope = owner.scope;
    const continueToOrder = vi.fn();
    const payload = await Promise.resolve({ id: "created-product" });
    if (inventoryMutationResponseOwned(owner, requestScope))
      continueToOrder(payload.id);
    expect(continueToOrder).toHaveBeenCalledExactlyOnceWith("created-product");
  });
});

function order(
  id: string,
  total: string,
  currency: string,
  checkout_group_id?: string,
): InventoryPurchaseOrder {
  return {
    id,
    number: `PO-${id}`,
    status: "draft",
    supplier: "Synthetic supplier",
    destination: "Synthetic site",
    created_at: `2026-09-${id.padStart(2, "0")}T12:00:00Z`,
    checkout_group_id,
    lines: [
      {
        id: `line-${id}`,
        product_id: "product-1",
        package_id: "package-1",
        ordered_packages: "1",
        units_per_package: "1",
        ordered_units: "1",
        package_price: total,
        currency,
        received_units: "0",
        received_packages: "0",
      },
    ],
    subtotal: total,
    tax: "0",
    shipping: "0",
    total,
  };
}

describe("inventory purchasing calculations", () => {
  it("preserves checkout identity, order sorting, and exact financial totals", () => {
    const grouped = purchaseOrderGroups([
      order("1", "9007199254740993.01", "USD", "checkout-1"),
      order("2", "0.02", "USD", "checkout-1"),
      order("3", "5", "USD"),
    ]);
    expect(grouped.map((group) => group.id)).toEqual(["order:3", "checkout-1"]);
    expect(grouped[1].orders.map((entry) => entry.id)).toEqual(["1", "2"]);
    expect(purchaseOrderGroupTotal(grouped[1])).toBe(
      "USD 9,007,199,254,740,993.03",
    );
    expect(money("0.125", "UNK")).toBe("0.125 (currency unconfirmed)");
    expect(
      purchaseOrderGroupTotal({
        id: "mixed",
        checkoutGroupId: "mixed",
        orders: [order("1", "1", "USD"), order("2", "1", "CAD")],
      }),
    ).toBe("Multiple currencies");
  });

  it("shares the exact product/NDC offer matching and preserves supplier order", () => {
    const offer = (
      id: string,
      supplier_id: string,
      product_id: string | null,
      available: boolean,
    ): InventorySupplierProduct => ({
      id,
      supplier_id,
      product_id,
      available,
      ndc: "synthetic-ndc",
      supplier_name: "Synthetic supplier",
      supplier_sku: id,
      description: "Synthetic product",
      package_quantity: "1",
      wholesale_unit_cost: "1",
      currency: "USD",
      ordering_unit: "package",
      contract_status: "unconfirmed",
      imported_at: "2026-09-01T12:00:00Z",
      updated_at: "2026-09-01T12:00:00Z",
      price_source: "manual_quote",
      quote_reference: null,
      quoted_on: null,
    });
    const offers = [
      offer("unavailable", "supplier-1", "product-1", false),
      offer("ndc", "supplier-2", null, true),
      offer("other-product", "supplier-1", "product-2", true),
      offer("first", "supplier-1", "product-1", true),
      offer("second", "supplier-1", "product-1", true),
    ];
    const data = {
      products: [{ id: "product-1", ndc: "synthetic-ndc" }],
      supplier_products: offers,
    } as InventoryData;
    expect(
      supplierOffersFor(data, "product-1").map((entry) => entry.id),
    ).toEqual(["ndc", "first", "second"]);
    expect(supplierProductFor(data, "product-1", "supplier-1")).toBe(offers[3]);
    expect(supplierProductFor(data, "product-1", "missing")).toBeUndefined();
  });
});

describe("mounted inventory mutation response ownership", () => {
  let server: ViteDevServer;
  let browser: Browser;
  let base: string;

  beforeAll(async () => {
    server = await createServer({
      root: fileURLToPath(new URL("..", import.meta.url)),
      configFile: false,
      optimizeDeps: {
        entries: [],
        noDiscovery: true,
        include: [
          "react",
          "react/jsx-runtime",
          "react/jsx-dev-runtime",
          "react-dom/client",
          "@emotion/react",
          "@emotion/styled",
          "@mui/material",
          "@mui/icons-material/RefreshRounded",
          "@mui/icons-material/ClearRounded",
          "@mui/icons-material/ExpandMoreRounded",
          "@mui/icons-material/MoveToInboxOutlined",
        ],
      },
      server: { host: "127.0.0.1", port: 0 },
      plugins: [
        {
          name: "inventory-mounted-owner-test",
          enforce: "pre",
          resolveId(id) {
            if (id === "/inventory-owner-entry.tsx")
              return "\0inventory-owner-entry";
          },
          load(id) {
            if (id !== "\0inventory-owner-entry") return;
            return `import React,{useState} from "react";
            import {createRoot} from "react-dom/client";
            import {InventoryApp} from "/src/features/inventory/InventoryApp";
            function MountedInventory() {
              const [generation,setGeneration]=useState(0);
              window.rerouteInventory=()=>{
                history.replaceState(null,"","/inventory-owner-test?scope=B");
                setGeneration(value=>value+1);
              };
              return React.createElement("div",{"data-generation":generation},
                React.createElement(InventoryApp,{path:"/clinic/inventory/configure"}));
            }
            createRoot(document.getElementById("root")).render(React.createElement(MountedInventory));`;
          },
          configureServer(vite) {
            vite.middlewares.use(
              "/inventory-owner-test",
              async (_request, response) => {
                response.setHeader("Content-Type", "text/html");
                response.end(
                  await vite.transformIndexHtml(
                    "/inventory-owner-test",
                    '<div id="root"></div><script type="module" src="/inventory-owner-entry.tsx"></script>',
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
    base = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({
      executablePath:
        process.env.BROWSER_EXECUTABLE_PATH || "/usr/bin/chromium",
      headless: true,
    });
  }, 20000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  const inventory = (scope: string) => ({
    schema_version: "inventory-wire-v1",
    setup_page: true,
    dataset_version: "bulk_v3",
    data_version: 1,
    as_of: scope === "A" ? "2026-09-01T12:00:00Z" : "2026-09-01T13:00:00Z",
    timezone: "UTC",
    practice: { id: 701, name: "Synthetic inventory", timezone: "UTC" },
    current_user_id: "702",
    users: [],
    configuration: { status: "configured", version: 1 },
    capabilities: { "inventory.configure": true },
    products: [],
    packages: [],
    suppliers: [],
    supplier_products: [],
    locations: [],
    lots: [],
    balances: [],
    movements: [],
    purchase_orders: [],
    shipments: [],
    receipts: [],
    recalls: [],
    controlled_reconciliations: [],
    audit_events: [],
  });

  const selectReason = async (page: Page) => {
    await page.getByLabel("Configuration reason").selectOption("initial_setup");
  };
  const submitConfiguration = async (page: Page) => {
    await page.getByRole("button", { name: /^Configure inventory/ }).click();
    await page
      .getByRole("button", { name: "Confirm action", exact: true })
      .click();
  };

  it.each(["success", "error", "newer-request"])(
    "releases the abandoned run without stale attribution after %s",
    async (outcome) => {
      const page = await browser.newPage();
      page.setDefaultTimeout(5000);
      let bootstrapReads = 0;
      const attempts: Array<Record<string, unknown>> = [];
      let releaseFirst!: () => void;
      let releaseSecond!: () => void;
      const firstGate = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      const secondGate = new Promise<void>((resolve) => {
        releaseSecond = resolve;
      });
      await page.route(`${base}/api/**`, async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === "/api/csrf") {
          await route.fulfill({ json: { csrf_token: "synthetic-token" } });
        } else if (path === "/api/clinic/inventory/bootstrap") {
          bootstrapReads += 1;
          await route.fulfill({
            json: { data: inventory(bootstrapReads === 1 ? "A" : "B") },
          });
        } else if (path === "/api/clinic/inventory_configuration") {
          attempts.push(route.request().postDataJSON());
          const index = attempts.length;
          await (index === 1 ? firstGate : secondGate);
          if (index === 1 && outcome !== "error") {
            await route.fulfill({ json: { acknowledged: true } });
          } else {
            await route.fulfill({
              status: 422,
              json: {
                error:
                  index === 1
                    ? "Abandoned request rejected"
                    : "Current request rejected",
              },
            });
          }
        } else
          throw new Error(`Unexpected synthetic inventory request: ${path}`);
      });
      try {
        await page.goto(`${base}/inventory-owner-test?scope=A`);
        await selectReason(page);
        await submitConfiguration(page);
        await expect.poll(() => attempts.length).toBe(1);
        await page.evaluate(() =>
          (
            window as unknown as { rerouteInventory: () => void }
          ).rerouteInventory(),
        );
        await expect.poll(() => bootstrapReads).toBe(2);
        await selectReason(page);
        const configure = page.getByRole("button", {
          name: /^Configure inventory/,
        });
        expect(await configure.isDisabled()).toBe(true);
        if (outcome === "newer-request") {
          // Exercise a second invocation on the mounted route through its real form handler.
          await page.locator("form").evaluate((form) => {
            form.dispatchEvent(
              new Event("submit", { bubbles: true, cancelable: true }),
            );
          });
          await expect.poll(() => attempts.length).toBe(2);
        }
        const firstResponse = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname ===
            "/api/clinic/inventory_configuration",
        );
        releaseFirst();
        await (await firstResponse).finished();
        await page.evaluate(
          () =>
            new Promise<void>((resolve) => {
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve()),
              );
            }),
        );
        if (outcome === "newer-request") {
          expect(await configure.isDisabled()).toBe(true);
          releaseSecond();
          await page
            .getByText("Current request rejected", { exact: true })
            .waitFor();
        }
        await expect.poll(() => configure.isEnabled()).toBe(true);
        expect(page.url()).toBe(`${base}/inventory-owner-test?scope=B`);
        expect(
          await page.getByText("Inventory configured", { exact: true }).count(),
        ).toBe(0);
        expect(
          await page
            .getByText("Abandoned request rejected", { exact: true })
            .count(),
        ).toBe(0);
        expect(await page.getByText(/Updated Sep 1, 1:00 PM/).count()).toBe(1);
        expect(attempts[0].request_key).toBeTruthy();
      } finally {
        releaseFirst();
        releaseSecond();
        await page.close();
      }
    },
    20000,
  );

  it("runs the successful continuation on the still-mounted reviewed route", async () => {
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    await page.route(`${base}/api/**`, async (route) => {
      const path = new URL(route.request().url()).pathname;
      await route.fulfill({
        json:
          path === "/api/csrf"
            ? { csrf_token: "synthetic-token" }
            : path === "/api/clinic/inventory_configuration"
              ? { acknowledged: true }
              : { data: inventory("A") },
      });
    });
    await page.route(`${base}/clinic/inventory`, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "Synthetic continuation destination",
      }),
    );
    try {
      await page.goto(`${base}/inventory-owner-test?scope=A`);
      await selectReason(page);
      await submitConfiguration(page);
      await page.waitForURL(`${base}/clinic/inventory`);
    } finally {
      await page.close();
    }
  }, 20000);
});
