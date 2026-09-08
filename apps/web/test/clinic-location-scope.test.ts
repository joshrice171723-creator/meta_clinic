import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const frame = readFileSync(
  new URL("../src/features/clinic/ClinicFrame.tsx", import.meta.url),
  "utf8",
);

describe("clinic location scope label", () => {
  it("identifies the all-location scope instead of presenting a blank selector", () => {
    expect(frame).toContain(
      'const locationScopeLabel = visibleLocationName || "All locations"',
    );
    expect(frame).toContain("{locationScopeLabel}");
  });
});
