import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ClinicCapabilities } from "../src/api/contracts";
import { OperationsProviderReadiness } from "../src/features/clinic/OperationsProviderReadiness";
import { OperationsReportsCatalog } from "../src/features/clinic/OperationsReportsCatalog";
import { OperationsWorkflowGuide } from "../src/features/clinic/OperationsWorkflowGuide";

const capabilities = (
  overrides: Partial<ClinicCapabilities> = {},
): ClinicCapabilities => ({
  patients: false,
  patients_write: false,
  staff: false,
  inventory: false,
  appointments: false,
  encounters: false,
  notes_read: false,
  notes_write: false,
  documents: false,
  messages: false,
  billing: false,
  roles: false,
  ...overrides,
});

describe("operations review surfaces", () => {
  it("explains record ownership and links only permission-gated destinations", () => {
    const html = renderToStaticMarkup(
      <OperationsWorkflowGuide
        capabilities={capabilities({
          subscriptions_review: true,
          appointments_read: true,
          patients: true,
          billing_read: true,
          reminders: true,
          inventory: true,
        })}
      />,
    );

    expect(html).toContain("Patient Flow → Schedule → Tracking Board");
    expect(html).toContain("Marking the initial contact complete");
    expect(html).toContain("server verifies the paid checkout event");
    expect(html).toContain("Booking is not arrival");
    expect(html).toContain("does not sign a clinical note");
    expect(html).toContain(
      "provider-accepted reminder is not confirmed delivered",
    );
    expect(html).toContain('href="/clinic/work"');
    expect(html).toContain('data-clinic-view="schedule"');
    expect(html).toContain('data-clinic-view="tracking"');
    expect(html).toContain('href="/clinic/billing"');
    expect(html).toContain('href="/clinic/reminders"');
    expect(html).toContain('href="/clinic/inventory/activity"');
  });

  it("keeps workflow guidance visible while withholding unauthorized links", () => {
    const html = renderToStaticMarkup(
      <OperationsWorkflowGuide capabilities={capabilities()} />,
    );

    expect(html).toContain("Completion stays with its record");
    expect(html).toContain("Authorized registration staff");
    expect(html).toContain("A link does not grant permission");
    expect(html).not.toContain('href="/clinic/growth"');
    expect(html).not.toContain('href="/clinic/billing"');
    expect(html).not.toContain('href="/clinic/reminders"');
    expect(html).not.toContain('href="/clinic/inventory/activity"');
  });

  it("catalogs existing reports with source, freshness, and access boundaries", () => {
    const html = renderToStaticMarkup(
      <OperationsReportsCatalog
        capabilities={capabilities({
          billing_read: true,
          inventory: true,
          workforce_payroll_export: true,
        })}
      />,
    );

    expect(html).toContain("Invoice ledger");
    expect(html).toContain("Inventory movement ledger");
    expect(html).toContain("Payroll exports");
    expect(html).toContain("Source:");
    expect(html).toContain("Freshness:");
    expect(html).toContain("Access:");
    expect(html).toContain('href="/clinic/billing"');
    expect(html).toContain('href="/clinic/inventory/activity"');
    expect(html).toContain('href="/clinic/workforce/payroll"');
    expect(html).toContain("no consolidated export is currently available");
  });

  it("marks restricted reports unavailable without exposing destinations", () => {
    const html = renderToStaticMarkup(
      <OperationsReportsCatalog capabilities={capabilities()} />,
    );

    expect(html.match(/Unavailable/g)).toHaveLength(3);
    expect(html).toContain("Requires billing read access");
    expect(html).toContain("Requires inventory access");
    expect(html).toContain(
      "Requires payroll export or payroll configuration access",
    );
    expect(html).not.toContain('href="/clinic/billing"');
    expect(html).not.toContain('href="/clinic/inventory/activity"');
    expect(html).not.toContain('href="/clinic/workforce/payroll"');
  });

  it("does not imply provider readiness before an authorized server result", () => {
    const restricted = renderToStaticMarkup(
      <OperationsProviderReadiness canConfigureTelehealth={false} />,
    );
    expect(restricted).toContain(
      "available only to people who can configure telehealth",
    );
    expect(restricted).not.toContain("Configured");
    expect(restricted).not.toContain("Live");

    const awaitingServer = renderToStaticMarkup(
      <OperationsProviderReadiness canConfigureTelehealth />,
    );
    expect(awaitingServer).toContain('role="status"');
    expect(awaitingServer).toContain("Loading provider readiness");
    expect(awaitingServer).not.toContain("Configured");
    expect(awaitingServer).not.toContain("Live");
  });
});
