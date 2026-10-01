import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { EncounterDetail } from "../src/api/contracts";
import { MedicationAdministrations } from "../src/features/clinic/MedicationAdministrations";

const fixture = vi.hoisted(() => ({ canRecord: true }));
vi.mock("../src/features/clinic/Workspace", () => ({
  useClinic: () => ({
    practice: { id: 1 },
    user_id: 2,
    membership_id: 3,
    capabilities: { notes_read: true },
  }),
}));
vi.mock("../src/shared/ui", () => ({
  useResource: () => ({
    data: {
      can_record_outcome: fixture.canRecord,
      can_administer: false,
      inventory_posting_available: false,
      eligible_orders: [],
      eligible_batches: [],
      administrations: [],
      dose_units: [],
      routes: [],
      administration_sites: [],
      verifier_options: [],
    },
    refresh: vi.fn(),
  }),
}));

it.each([true, false])(
  "does not direct unavailable order creation (record permission=%s)",
  (canRecord) => {
    fixture.canRecord = canRecord;
    const html = renderToStaticMarkup(
      <MedicationAdministrations
        patient={{ id: 12, display_name: "Synthetic medication patient" }}
        encounter={{ id: 30, site_id: "1" } as EncounterDetail}
        timezone="UTC"
      />,
    );
    expect(html).not.toContain("Create and authorize");
    if (canRecord) {
      expect(html).toContain("Recording administration requires an authorized");
      expect(html).toContain(
        "service availability with an authorized clinician",
      );
    } else {
      expect(html).toContain(
        "This account cannot record medication outcomes for this visit.",
      );
    }
  },
);
