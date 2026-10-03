import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const frontDesk = readFileSync(
  new URL("../src/features/clinic/FrontDesk.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(
  new URL("../src/features/clinic/frontDesk.css", import.meta.url),
  "utf8",
);

describe("front desk action layout", () => {
  it("keeps wrapped quick actions separated in both directions", () => {
    expect(frontDesk).toContain('aria-label="More front desk actions"');
    expect(frontDesk).toContain("useFlexGap");
    expect(frontDesk).toContain("spacing={1.5}");
    expect(styles).toMatch(
      /\.front-desk-quick-actions\s*\{\s*justify-content: flex-end;/,
    );
  });

  it("keeps appointment actions clear of one another when they wrap", () => {
    expect(styles).toMatch(
      /\.front-desk-actions[\s\S]*?gap: 10px 12px !important;/,
    );
  });
});
