import { describe, expect, it } from "vitest";
import { formatDemoDuration } from "../src/features/owner/OwnerCommandCenter";

describe("owner demo usage", () => {
  it("formats elapsed demo time for the visitor table", () => {
    expect(formatDemoDuration(0)).toBe("0s");
    expect(formatDemoDuration(300)).toBe("5m");
    expect(formatDemoDuration(3661)).toBe("1h 1m");
  });
});
