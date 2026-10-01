import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import type { ClinicCapabilities } from "../src/api/contracts";
import { OperationsReportsCatalog } from "../src/features/clinic/OperationsReportsCatalog";

const state = vi.hoisted(() => ({ report: {} as Record<string, unknown> }));
vi.mock("../src/shared/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/shared/ui")>()),
  useResource: (path: string) => ({
    data: path.startsWith("/api/clinic/reports/daily_cash_drawers?")
      ? { report: state.report }
      : undefined,
    refresh: () => {},
  }),
}));
afterEach(() => vi.unstubAllGlobals());

it("#117 describes variance as overlapping reconciliation without inventing a fifth drawer", () => {
  vi.stubGlobal("window", { location: { search: "?date=2026-09-28" } });
  const records = ["open", "closed", "closed", "closed"].map(
    (status, index) => ({
      id: 701 + index,
      site_name: "Synthetic report site",
      status,
      reconciliation_status: "pending",
      currency: "USD",
      payment_currencies: [],
      opening_float: "100",
      cash_received: "0",
      cash_refunded: "0",
      expected_cash: "100",
      counted_cash: status === "open" ? null : index === 3 ? "0" : "100",
      discrepancy: status === "open" ? null : index === 3 ? "-100" : "0",
      expected_at_close: status === "open" ? null : "100",
      opened_at: "2026-09-28T12:00:00Z",
      closed_at: status === "open" ? null : "2026-09-28T18:00:00Z",
    }),
  );
  state.report = {
    definition: {
      source: "Synthetic drawer ledger",
      date_basis: "opened date",
      exclusions: "Synthetic fixture only",
    },
    date: "2026-09-28",
    timezone: "UTC",
    as_of: "2026-09-28T19:00:00Z",
    open_count: 1,
    awaiting_reconciliation_count: 3,
    variance_count: 1,
    carried_count: 0,
    pagination: { page: 1, per_page: 25, total: 4, total_pages: 1 },
    carried_pagination: { page: 1, per_page: 25, total: 0, total_pages: 0 },
    records,
    carried_records: [],
  };
  const html = renderToStaticMarkup(
    <OperationsReportsCatalog
      capabilities={{ billing_payment_record: true } as ClinicCapabilities}
      timezone="UTC"
    />,
  );
  expect(html).toContain(
    "1 still open; 3 closed awaiting reconciliation; 1 closed with a variance",
  );
  expect(html).toContain("this count can overlap with reconciliation");
  expect(html.match(/Review drawer \d+ in billing/g)).toHaveLength(4);
  expect(html).toContain("At close: expected 100; counted 0; variance -100.");
});
