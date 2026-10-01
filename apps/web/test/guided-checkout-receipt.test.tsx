import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { BillingPatientLedger } from "../src/api/contracts";
import { GuidedCheckout } from "../src/features/clinic/GuidedCheckout";

vi.mock("../src/shared/ui", () => ({
  useResource: (path: string) => ({
    data: path.includes("/completion?")
      ? {
          patient_id: 77,
          encounter_id: 9,
          completion_review: null,
          evidence: {
            checkout: { status: "in_progress", invoice_id: 77 },
            follow_up: null,
          },
        }
      : path.includes("/follow_up")
        ? { follow_up: null }
        : path.includes("/subscriptions?")
          ? { subscriptions: [] }
          : { encounter: { id: 9, patient_id: 77, status: "in_progress" } },
    refresh: () => {},
  }),
}));

function receiptMarkup(recorded: boolean) {
  const ledger = {
    patient: { id: 77 },
    invoices: [
      {
        id: 77,
        status: "posted",
        currency: "USD",
        balance_amount: recorded ? "0" : "25",
        online_payment: { state: "unavailable" },
        allocations: recorded ? [{ amount: "25", payment_event_id: 88 }] : [],
      },
    ],
    payments: recorded
      ? [
          {
            id: 88,
            receipt_available: true,
            allocations: [{ invoice_id: 77, amount: "25" }],
          },
        ]
      : [],
  } as unknown as BillingPatientLedger;
  return renderToStaticMarkup(
    <GuidedCheckout
      patientId={77}
      encounterId={9}
      invoiceId={77}
      ledger={ledger}
    />,
  );
}

it("#129 sends an unrecorded receipt to the real payment-status anchor", () => {
  const html = receiptMarkup(false);
  expect(html).toContain(
    "A receipt becomes available only after a recorded eligible payment.",
  );
  expect(html).toMatch(
    /href="#billing-payment-history"[^>]*>[\s\S]*?Review payment and receipt status</,
  );
  expect(html).not.toContain(">Review receipt<");
  expect(html).not.toContain("/api/clinic/payment_events/");
});

it("#129 links an available receipt to its matching recorded payment", () => {
  const html = receiptMarkup(true);
  expect(html).toContain("Receipt is available for payment #88.");
  expect(html).toMatch(
    /href="\/api\/clinic\/payment_events\/88\/receipt"[^>]*>[\s\S]*?Open receipt</,
  );
});
