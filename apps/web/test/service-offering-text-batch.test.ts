import { expect, it } from "vitest";
import type { ConfigurationManifest } from "../src/features/clinic/configurationMapping";
import type { OfferingTextTarget } from "../src/features/clinic/offeringTextImportModel";
import {
  offeringTextBatchFailure,
  offeringTextBatchItems,
  offeringTextBatchPlan,
  offeringTextBatchSummary,
  type OfferingTextMapping,
} from "../src/features/clinic/offeringTextBatchModel";

const source: ConfigurationManifest = {
  format: 1,
  purpose: "Independent synthetic batch fixture",
  generated_at: "2026-09-30T21:00:00Z",
  source_digest: "b".repeat(64),
  configuration: {
    practice: { id: 1, name: "Synthetic source", features: { revision: 1 } },
    sites: [],
    service_offerings: [101, 102].map((id) => ({
      id,
      name: `Source ${id}`,
      code: `SOURCE-${id}`,
      contact_instructions: `Source desk ${id}`,
      referral_instructions: null,
      visit_type_id: null,
      site_ids: [],
      public_visible: true,
      modality: "video",
    })),
  },
};
const targets: OfferingTextTarget[] = [202, 203].map((id) => ({
  id,
  practice_id: 2,
  name: `Destination ${id}`,
  code: `DEST-${id}`,
  contact_instructions: "Keep unless explicitly selected",
  referral_instructions: "Keep destination guidance",
  status: "draft",
  lock_version: id === 202 ? 4 : 8,
}));
const mappings: OfferingTextMapping[] = [
  { targetId: 202, sourceOfferingId: 101, fields: ["name"] },
  { targetId: 203, sourceOfferingId: 102, fields: ["contact_instructions"] },
];

it("previews only explicitly mapped destination/field replacements without mutating source or targets", () => {
  const before = JSON.stringify([source, targets, mappings]);
  const plans = offeringTextBatchPlan(source, targets, mappings);
  expect(
    plans.map((plan) => [
      plan.sourceOfferingId,
      plan.targetId,
      plan.expectedVersion,
    ]),
  ).toEqual([
    [101, 202, 4],
    [102, 203, 8],
  ]);
  expect(plans.map((plan) => plan.attributes)).toEqual([
    { name: "Source 101" },
    { contact_instructions: "Source desk 102" },
  ]);
  let key = 0;
  const items = offeringTextBatchItems(plans, () => `synthetic-key-${++key}`);
  expect(items.map((item) => item.attempt.path)).toEqual([
    "/api/clinic/service_offerings/202",
    "/api/clinic/service_offerings/203",
  ]);
  expect(
    items.map((item) => Object.keys(item.attempt.body.service_offering).sort()),
  ).toEqual([
    ["lock_version", "name", "request_key"],
    ["contact_instructions", "lock_version", "request_key"],
  ]);
  expect(JSON.stringify([source, targets, mappings])).toBe(before);
});

it("rejects empty selection, missing/non-draft/foreign destinations and duplicate mappings", () => {
  expect(() => offeringTextBatchPlan(source, targets, [])).toThrow("Select");
  for (const mapping of [
    { ...mappings[0], targetId: 999 },
    { ...mappings[0], sourceOfferingId: 999 },
    { ...mappings[0], fields: [] },
  ])
    expect(() => offeringTextBatchPlan(source, targets, [mapping])).toThrow();
  for (const status of ["published", "retired"])
    expect(() =>
      offeringTextBatchPlan(
        source,
        [{ ...targets[0], status }, targets[1]],
        mappings,
      ),
    ).toThrow("draft");
  expect(() =>
    offeringTextBatchPlan(
      source,
      [targets[0], { ...targets[1], practice_id: 3 }],
      mappings,
    ),
  ).toThrow("one destination clinic");
  expect(() =>
    offeringTextBatchPlan(source, targets, [mappings[0], mappings[0]]),
  ).toThrow("at most once");
  expect(() =>
    offeringTextBatchPlan(source, targets, [
      mappings[0],
      { ...mappings[1], sourceOfferingId: 101 },
    ]),
  ).toThrow("at most once");
});

it("retains the single-import allowlist and missing-value safeguards for every batch item", () => {
  for (const fields of [["visit_type_id"], ["name", "name"], ["__proto__"]])
    expect(() =>
      offeringTextBatchPlan(source, targets, [
        { ...mappings[0], fields: fields as OfferingTextMapping["fields"] },
      ]),
    ).toThrow("supported");
  expect(() =>
    offeringTextBatchPlan(source, targets, [
      { ...mappings[0], fields: ["description"] },
    ]),
  ).toThrow("reload the complete destination");
  expect(() =>
    offeringTextBatchPlan(source, targets, [
      { ...mappings[0], fields: ["referral_instructions"] },
    ]),
  ).toThrow("nonempty");
  expect(() =>
    offeringTextBatchPlan(
      source,
      targets.map((target) => ({ ...target, practice_id: 1 })),
      mappings,
    ),
  ).toThrow("different source clinic");
});

it("rejects existing and within-review code collisions before allocating any request", () => {
  const saved = structuredClone(source);
  const codes = mappings.map((mapping) => ({
    ...mapping,
    fields: ["code"] as OfferingTextMapping["fields"],
  }));
  saved.configuration.service_offerings[0].code = targets[1].code;
  expect(() => offeringTextBatchPlan(saved, targets, codes)).toThrow(
    "already used",
  );
  for (const row of saved.configuration.service_offerings)
    row.code = "NEW-DUPLICATE";
  expect(() => offeringTextBatchPlan(saved, targets, codes)).toThrow("collide");
  expect(() =>
    offeringTextBatchItems(
      offeringTextBatchPlan(source, targets, mappings),
      () => "same-key",
    ),
  ).toThrow("own request identity");
});

it("preserves unknown outcomes across every denied retry and leaves exact requests unchanged", () => {
  let key = 0;
  const items = offeringTextBatchItems(
    offeringTextBatchPlan(source, targets, mappings),
    () => `key-${++key}`,
  );
  const exact = JSON.stringify(items[1].attempt);
  const applied = { ...items[0], status: "applied" as const };
  let unresolved = { ...items[1], ...offeringTextBatchFailure("ready", null) };
  for (const status of [401, 403, 409, 422]) {
    unresolved = {
      ...unresolved,
      ...offeringTextBatchFailure(unresolved.status, {
        status,
        message: "Synthetic denial",
      }),
    };
    expect(unresolved.status).toBe("unknown");
    expect(JSON.stringify(unresolved.attempt)).toBe(exact);
    expect(offeringTextBatchSummary([applied, unresolved])).toMatchObject({
      applied: 1,
      unknown: 1,
      complete: false,
      canClose: false,
    });
  }
  expect(
    offeringTextBatchSummary([applied, { ...unresolved, status: "applied" }]),
  ).toMatchObject({ applied: 2, complete: true, canClose: true });
});

it("distinguishes first definitive rejection from uncertain responses without reporting partial completion", () => {
  expect(
    offeringTextBatchFailure("ready", {
      status: 409,
      message: "Stale revision",
    }).status,
  ).toBe("failed");
  for (const failure of [
    { status: 408, message: "Timeout" },
    { status: 503, message: "Unknown response" },
    { status: 409, code: "outcome_unconfirmed", message: "Unknown receipt" },
    { status: 409, code: "session_changed", message: "Changed actor" },
  ])
    expect(offeringTextBatchFailure("ready", failure).status).toBe("unknown");
  let key = 0;
  const items = offeringTextBatchItems(
    offeringTextBatchPlan(source, targets, mappings),
    () => `key-${++key}`,
  );
  expect(offeringTextBatchSummary([]).complete).toBe(false);
  expect(
    offeringTextBatchSummary([{ ...items[0], status: "applied" }, items[1]]),
  ).toMatchObject({ applied: 1, ready: 1, complete: false });
  expect(
    offeringTextBatchSummary([
      { ...items[0], status: "applied" },
      { ...items[1], status: "failed" },
    ]),
  ).toMatchObject({ applied: 1, failed: 1, complete: false });
});
