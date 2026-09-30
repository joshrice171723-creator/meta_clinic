import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  OperationsIntegrationInventory,
  ScribeActivitySummary,
  type ScribeActivityReport,
} from "../src/features/clinic/OperationsIntegrationInventory";
import { useResource } from "../src/shared/ui";

const resource = vi.hoisted(() => ({
  data: undefined as { report: ScribeActivityReport } | undefined,
  error: undefined as string | undefined,
  refresh: vi.fn(),
}));

vi.mock("../src/shared/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/shared/ui")>()),
  useResource: vi.fn(() => resource),
}));

function report(page = 1): ScribeActivityReport {
  return {
    as_of: "2026-09-30T12:00:00Z",
    provider_configured: true,
    current_draft_counts: { draft: 4 },
    source_counts: { incomplete: 26 },
    recording_counts: { interrupted: 1 },
    documents_without_draft: 0,
    latest_recording_update_at: "2026-09-30T11:00:00Z",
    recovery_items: [
      {
        record_type: "source",
        id: page === 1 ? 26 : 1,
        encounter_id: page === 1 ? 126 : 101,
        status: "incomplete",
        updated_at: "2026-09-30T10:00:00Z",
      },
    ],
    recovery_pagination: { page, per_page: 25, total: 27, total_pages: 2 },
  };
}

describe("unfinished Scribe record paging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resource.data = undefined;
    resource.error = undefined;
  });

  it("offers the next page with owning workspace links and aggregate counts", () => {
    resource.data = { report: report() };
    const html = renderToStaticMarkup(<ScribeActivitySummary />);
    expect(html).toContain("Unfinished records (27)");
    expect(html).toContain('aria-label="Unfinished Scribe records pages"');
    expect(html).toContain('aria-label="Go to page 2"');
    expect(html).toContain('href="/clinic/scribe?encounter_id=126"');
    expect(html).not.toContain('href="/clinic/scribe?encounter_id=101"');
    expect(html).toContain("configuration present");
    expect(html).toContain("Provider connectivity has not been checked");
    expect(vi.mocked(useResource).mock.calls[0][0]).toBe(
      "/api/clinic/reports/scribe_activity?page=1",
    );
  });

  it("renders the actual returned page and older source identity", () => {
    resource.data = { report: report(2) };
    const html = renderToStaticMarkup(<ScribeActivitySummary />);
    expect(html).toContain('href="/clinic/scribe?encounter_id=101"');
    expect(html).not.toContain('href="/clinic/scribe?encounter_id=126"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Page 2 of 2");
  });

  it("distinguishes a confirmed empty list from unavailable data", () => {
    const empty = report();
    empty.recovery_items = [];
    empty.recovery_pagination = {
      page: 1,
      per_page: 25,
      total: 0,
      total_pages: 0,
    };
    resource.data = { report: empty };
    expect(renderToStaticMarkup(<ScribeActivitySummary />)).toContain(
      "No unfinished recordings or sources.",
    );
    resource.data = undefined;
    resource.error = "Recovery list unavailable";
    const failed = renderToStaticMarkup(<ScribeActivitySummary />);
    expect(failed).toContain("Recovery list unavailable");
    expect(failed).not.toContain("No unfinished recordings or sources.");
    expect(failed).not.toContain("encounter_id=");
  });

  it("keeps the older API response usable during independent integration", () => {
    const legacy = report();
    delete legacy.recovery_pagination;
    resource.data = { report: legacy };
    const html = renderToStaticMarkup(<ScribeActivitySummary />);
    expect(html).toContain("Unfinished records (latest 25)");
    expect(html).toContain('href="/clinic/scribe?encounter_id=126"');
    expect(html).not.toContain('aria-label="Unfinished Scribe records pages"');
  });

  it("does not request or display Scribe activity without projected access", () => {
    const html = renderToStaticMarkup(
      <OperationsIntegrationInventory
        canReadScribe={false}
        canReadBilling={false}
        canReadClinical={false}
        canReadReminders={false}
      />,
    );
    expect(html).not.toContain("Unfinished records");
    expect(
      vi
        .mocked(useResource)
        .mock.calls.some(([path]) => path.includes("scribe_activity")),
    ).toBe(false);
  });
});
