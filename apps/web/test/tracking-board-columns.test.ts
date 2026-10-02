import { describe, expect, it } from "vitest";
import { trackingBoardColumnSelection } from "../src/features/clinic/TrackingBoardPage";

describe("tracking board column visibility", () => {
  it("preserves unaffected columns when Status is shown and hidden", () => {
    const original: Parameters<typeof trackingBoardColumnSelection>[0] = [
      "location",
      "patient",
      "action",
      "reason",
      "triage",
      "care",
      "provider",
      "wait",
    ];
    const withStatus = trackingBoardColumnSelection(original, "stage");
    expect(withStatus).toEqual([...original, "stage"]);
    expect(trackingBoardColumnSelection(withStatus, "stage")).toEqual(original);
    expect(original).toEqual(withStatus.slice(0, -1));
  });

  it("keeps a manually reordered layout and retains the final visible column", () => {
    const reordered: Parameters<typeof trackingBoardColumnSelection>[0] = [
      "provider",
      "action",
      "patient",
    ];
    const shown = trackingBoardColumnSelection(reordered, "care");
    expect(trackingBoardColumnSelection(shown, "care")).toEqual(reordered);
    expect(trackingBoardColumnSelection(["patient"], "patient")).toEqual([
      "patient",
    ]);
  });
});
