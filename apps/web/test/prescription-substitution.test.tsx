import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { MedicationRequestRevision } from "../src/api/contracts";
import { PrescriptionFulfillmentPanel } from "../src/features/clinic/PrescriptionFulfillmentPanel";

it.each([
  [null, "Unresolved — choose before review or submission"],
  ["allowed", "Allowed"],
  ["not_allowed", "Not allowed"],
] as const)(
  "shows the saved substitution instruction %s without inferring a choice",
  (choice, label) => {
    const order = {
      id: 100001,
      medication_name: "Synthetic substitution medication",
      fulfillment_route: "outside_pharmacy",
      substitution_instruction: choice,
    } as MedicationRequestRevision;
    const html = renderToStaticMarkup(
      <PrescriptionFulfillmentPanel
        patientId={100001}
        encounterId={100002}
        orders={[order]}
        canWrite={false}
      />,
    );
    expect(html).toContain(`Substitution: ${label}`);
  },
);
