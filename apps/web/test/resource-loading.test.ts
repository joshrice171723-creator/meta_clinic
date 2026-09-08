import { describe, expect, it } from "vitest";
import { applyResourceResultIfActive } from "../src/shared/ui";

describe("resource request cancellation", () => {
  it("ignores an already-resolved request when cleanup aborts before its continuation", async () => {
    const controller = new AbortController();
    const applied: string[] = [];
    const completion = Promise.resolve("older page").then((data) =>
      applyResourceResultIfActive(controller.signal, data, (value) =>
        applied.push(value),
      ),
    );

    controller.abort();
    await completion;

    expect(applied).toEqual([]);
  });

  it("applies the active request result", async () => {
    const controller = new AbortController();
    const applied: string[] = [];

    await Promise.resolve("current page").then((data) =>
      applyResourceResultIfActive(controller.signal, data, (value) =>
        applied.push(value),
      ),
    );

    expect(applied).toEqual(["current page"]);
  });
});
