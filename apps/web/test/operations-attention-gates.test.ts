// Independently synthetic retained projections; SSR only, no API or provider calls.
// Execute with the owning apps/web dependencies; this file is scoped to changed attention summaries.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OperationsIntegrationInventory } from "../src/features/clinic/OperationsIntegrationInventory";

const fixture = vi.hoisted(() => {
  const stamp = "2026-10-02T12:00:00Z";
  const reports: Record<string, unknown> = {
    "/api/clinic/stripe_connect": {
      source: "local_membership_payment_simulator", configured: false,
      charges_enabled: false, last_synced_at: stamp,
    },
    "/api/clinic/reports/payment_collection_activity": { report: {
      source: "constructed_collection_fixture", as_of: stamp, total: 5,
      state_counts: { reconciliation_required: 2, pending: 3 },
      requested_amounts: [], needs_reconciliation_count: 2,
      reconciliation_records: [], reconciliation_records_capped: false,
      in_flight_count: 3, in_flight_records: [], in_flight_records_capped: false,
      latest_updated_at: stamp,
    } },
    "/api/clinic/reports/reminder_delivery_activity": { report: {
      source: "constructed_reminder_fixture", as_of: stamp, total: 4,
      state_counts: { delivery_unknown: 4 }, needs_attention_count: 4,
      latest_state_change_at: stamp,
    } },
    "/api/clinic/reports/prescription_simulator_activity": { report: {
      source: "constructed_prescription_fixture", adapter: "synthetic_only",
      as_of: stamp, total: 5, unknown_outcome_count: 5,
      outcome_counts: { unknown: 5 }, latest_per_revision_outcome_counts: { unknown: 5 },
      latest_per_revision_unknown_count: 5, current_revision_unknown_count: 5,
      current_revision_unresolved_count: 5, current_revision_outcome_counts: { unknown: 5 },
      current_revision_records: [], current_revision_records_capped: false,
      current_revision_unknown_records: [], current_revision_unknown_records_capped: false,
      current_revision_unresolved_records: [], current_revision_unresolved_records_capped: false,
      latest_submitted_at: stamp,
    } },
  };
  return { reports, calls: [] as { path: string; enabled: boolean }[], refresh: vi.fn() };
});

vi.mock("../src/shared/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/shared/ui")>();
  return { ...actual, useResource: (path: string, options: { enabled: boolean }) => {
    if (!(path in fixture.reports)) throw new Error("Unexpected resource destination");
    fixture.calls.push({ path, enabled: options.enabled });
    // Deliberately retain data even when disabled, reproducing the hook's first render.
    return { data: fixture.reports[path], error: null, refresh: fixture.refresh };
  } };
});

const labels = [
  "2 collection intents need reconciliation",
  "3 collections are pending or processing",
  "4 reminders have failed or unknown delivery",
  "5 current prescription requests need outcome reconciliation",
];

beforeEach(() => {
  fixture.calls.length = 0;
  fixture.refresh.mockClear();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden in this SSR fixture"); }));
});
afterEach(() => vi.unstubAllGlobals());

function render(allowed: boolean) {
  return renderToStaticMarkup(createElement(OperationsIntegrationInventory, {
    timezone: "UTC", canReadScribe: false,
    canReadBilling: allowed, canReadClinical: allowed, canReadReminders: allowed,
  }));
}

function assertReadOnly(allowed: boolean) {
  expect(fixture.calls).toHaveLength(4);
  expect(fixture.calls.every((call) => call.enabled === allowed)).toBe(true);
  expect(fixture.refresh).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
}

describe("connector attention retained-data capability gates", () => {
  it("denies every attention label despite retained unauthorized reports", () => {
    const html = render(false);
    expect(html).not.toContain('aria-label="Activity needing review"');
    for (const label of labels) expect(html).not.toContain(label);
    expect(html).toContain("Payment connection details require billing access");
    expect(html).toContain("Attempt activity requires clinic-wide clinical record access");
    assertReadOnly(false);
  });

  it("shows each attention label when its read capabilities are authorized", () => {
    const html = render(true);
    expect(html).toContain('aria-label="Activity needing review"');
    for (const label of labels) expect(html).toContain(label);
    assertReadOnly(true);
  });
});
