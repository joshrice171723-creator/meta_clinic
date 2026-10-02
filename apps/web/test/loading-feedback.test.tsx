import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LoadingFeedback } from "../src/shared/LoadingFeedback";
import { LoadState } from "../src/shared/ui";
import { RoutePending } from "../src/App";

describe("shared pending feedback", () => {
  it("announces pending work without inventing measured progress", () => {
    const html = renderToStaticMarkup(
      <LoadingFeedback label="Sending your request…" />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-label="Sending your request…"');
    expect(html).not.toContain("aria-valuenow");
    expect(html).toContain("prefers-reduced-motion: reduce");
  });
  it("reserves an inactive slot without announcing pending work", () => {
    const html = renderToStaticMarkup(
      <LoadingFeedback active={false} label="Sending your request…" />,
    );
    expect(html).toContain("min-height:44px");
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain('role="progressbar"');
  });
  it("removes progress on a failed resource and retains the error and retry", () => {
    const html = renderToStaticMarkup(
      <LoadState error="Local controlled failure" onRetry={() => {}} />,
    );
    expect(html).not.toContain('role="progressbar"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Local controlled failure");
    expect(html).toContain(">Retry</button>");
  });
  it("keeps route recovery and the root main landmark", () => {
    const html = renderToStaticMarkup(<RoutePending root />);
    expect(html).toContain('<main id="main"');
    expect(html).toContain("Loading this page…");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain(">Reload page</button>");
  });
});
