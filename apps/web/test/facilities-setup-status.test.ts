import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../src/features/clinic/Facilities.tsx", import.meta.url),
  "utf8",
);

describe("facility setup status", () => {
  it("makes the post-create finalization requirement and recovery link explicit", () => {
    expect(source).toContain(
      "Location created. Complete clinic setup (Finalize location setup)",
    );
    expect(source).toContain('href="/clinic/setup#clinic-setup-finalize"');
  });

  it("marks sites whose setup is not finalized", () => {
    expect(source).toContain("site.finalized === false");
    expect(source).toContain('label="Setup incomplete"');
  });
});
