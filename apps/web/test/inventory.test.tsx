import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InventoryApp } from "../src/features/inventory/InventoryApp";

describe("inventory integration", () => {
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

    for (const path of [
      "/clinic/inventory",
      "/clinic/inventory/replenishment",
      "/clinic/inventory/purchasing",
      "/clinic/inventory/receiving",
      "/clinic/inventory/lots",
      "/clinic/inventory/activity",
      "/clinic/inventory/recalls",
      "/clinic/inventory/controlled",
    ]) {
      expect(source).toContain(path);
    }
    expect(source).toContain('"/api/clinic/inventory/bootstrap"');
    expect(source).toContain('"/api/clinic/inventory/demo"');
  });

  it("represents operational states and does not use browser persistence", () => {
    const source = readFileSync(
      "src/features/inventory/InventoryApp.tsx",
      "utf8",
    );

    for (const text of [
      "No inventory records yet",
      "Unable to load inventory",
      "permission",
      "Blocking recall match",
      "Draft created",
    ]) {
      expect(source.toLowerCase()).toContain(text.toLowerCase());
    }
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });
});
