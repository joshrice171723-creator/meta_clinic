import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LoadState, ResourceState } from "../src/shared/ui";

describe("shared resource state contract", () => {
  it("announces loading without presenting an error", () => {
    const html = renderToStaticMarkup(
      <ResourceState state="loading" message="Loading clinic schedule…" />,
    );

    expect(html).toContain('data-resource-state="loading"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading clinic schedule…");
    expect(html).not.toContain('role="alert"');
  });

  it("renders explicit empty, success, and blocked states politely", () => {
    for (const state of ["empty", "success", "blocked"] as const) {
      const html = renderToStaticMarkup(<ResourceState state={state} />);

      expect(html).toContain(`data-resource-state="${state}"`);
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
    }
  });

  it("keeps last-loaded content visible and offers retry when stale", () => {
    const html = renderToStaticMarkup(
      <ResourceState
        state="stale"
        message="Showing the last successful snapshot."
        onRetry={vi.fn()}
      >
        <p>Last loaded provider: Example Video</p>
      </ResourceState>,
    );

    expect(html).toContain('data-resource-state="stale"');
    expect(html).toContain("Showing the last successful snapshot.");
    expect(html).toContain("Last loaded provider: Example Video");
    expect(html).toContain(">Retry</button>");
  });

  it("announces errors assertively and keeps retry explicit", () => {
    const html = renderToStaticMarkup(
      <ResourceState
        state="error"
        message="Provider readiness could not be loaded."
        onRetry={vi.fn()}
      />,
    );

    expect(html).toContain('data-resource-state="error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain("Provider readiness could not be loaded.");
    expect(html).toContain(">Retry</button>");
  });

  it("keeps the existing LoadState loading and error API", () => {
    const loading = renderToStaticMarkup(<LoadState />);
    const error = renderToStaticMarkup(
      <LoadState error="The patient record could not be loaded." />,
    );

    expect(loading).toContain('data-resource-state="loading"');
    expect(loading).toContain("Loading…");
    expect(error).toContain('data-resource-state="error"');
    expect(error).toContain("The patient record could not be loaded.");
  });

  it("forwards a retry action when a caller supplies one", () => {
    const html = renderToStaticMarkup(
      <LoadState
        error="The patient record could not be loaded."
        onRetry={vi.fn()}
      />,
    );

    expect(html).toContain(">Retry</button>");
  });
});
