import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RoutePending } from "../src/App";

describe("route loading recovery", () => {
  it("explains the loading state and offers an immediate recovery action", () => {
    const html = renderToStaticMarkup(<RoutePending root />);

    expect(html).toContain('role="status"');
    expect(html).toContain("Loading this page…");
    expect(html).toContain("reload the page to reconnect");
    expect(html).toContain("Reload page");
  });
});
