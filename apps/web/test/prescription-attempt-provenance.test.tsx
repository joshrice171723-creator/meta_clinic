import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PrescriptionAttemptEvidence } from "../src/features/clinic/PrescriptionFulfillmentPanel";

const attempt: ComponentProps<typeof PrescriptionAttemptEvidence>["attempt"] = {
  id: 51,
  medication_request_revision_id: 20,
  pharmacy_destination_id: 30,
  prescription_event_id: 40,
  adapter: "simulated_pharmacy_network",
  mode: "standard",
  outcome: "outcome_unknown",
  request_key: "synthetic-attempt-provenance",
  source: "simulation",
  transaction_type: "NewRx",
  schema_version: "local-simulation-v1",
  payload_digest: "a".repeat(64),
  correlation_id: "70000000-0000-4000-8000-000000000001",
  review_event_id: 19,
  prior_attempt_id: 50,
  preparation_id: null, // Existing attempt recorded before durable preparation; no reference is inferred.
  destination_snapshot: {
    id: 30,
    name: "Synthetic saved destination",
    city: "Austin",
    state_code: "TX",
    postal_code: "78701",
  },
  signer_snapshot: {},
  reviewer_snapshot: {},
  submitted_at: "2026-09-30T20:00:00Z",
};

it("keeps unknown outcomes tied to the saved revision, review and correlation", () => {
  const html = renderToStaticMarkup(
    <PrescriptionAttemptEvidence attempt={attempt} />,
  );
  for (const text of [
    "Simulated pharmacy network",
    "outcome unknown",
    "NewRx",
    "version record 20",
    "review #19",
    attempt.correlation_id!,
    "follows attempt #50",
    "Synthetic saved destination",
  ]) {
    expect(html).toContain(text);
  }
  expect(html).not.toContain("prepared");
  expect(html).not.toContain("Historical attempt provenance unavailable");
});

it("does not invent review or correlation for unresolved historical attempts", () => {
  const html = renderToStaticMarkup(
    <PrescriptionAttemptEvidence
      attempt={{
        ...attempt,
        source: null,
        transaction_type: null,
        schema_version: null,
        payload_digest: null,
        correlation_id: null,
        review_event_id: null,
        prior_attempt_id: null,
      }}
    />,
  );
  expect(html).toContain("outcome unknown");
  expect(html).toContain("Historical attempt provenance unavailable");
  expect(html).not.toContain("review #");
  expect(html).not.toContain("correlation ");
  expect(html).not.toContain("prepared");
});

it("preserves controlled simulator identity evidence beside attempt provenance", () => {
  const html = renderToStaticMarkup(
    <PrescriptionAttemptEvidence
      attempt={{
        ...attempt,
        mode: "controlled_test",
        signer_snapshot: { state: "revoked" },
        reviewer_snapshot: { state: "active" },
      }}
    />,
  );
  expect(html).toContain("signer revoked");
  expect(html).toContain("reviewer active");
  expect(html).toContain(attempt.correlation_id!);
});
