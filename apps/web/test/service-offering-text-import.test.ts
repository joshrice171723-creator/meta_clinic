import { expect, it } from "vitest";
import {
  offeringTextImportAttempt,
  offeringTextImportPlan,
  type OfferingImportField,
  type OfferingTextTarget,
} from "../src/features/clinic/offeringTextImportModel";
import type { ConfigurationManifest } from "../src/features/clinic/configurationMapping";

export const source: ConfigurationManifest = {
  format: 1,
  purpose: "Synthetic configuration fixture",
  generated_at: "2026-09-30T20:00:00Z",
  source_digest: "a".repeat(64),
  configuration: {
    practice: { id: 1, name: "Synthetic source", features: { revision: 7 } },
    sites: [],
    service_offerings: [
      {
        id: 101,
        name: "Source draft name",
        code: "SOURCE-CODE",
        contact_instructions: "Contact the source desk.",
        referral_instructions: "Source referral guidance.",
        visit_type_id: null,
        site_ids: [],
        status: "draft",
        modality: "video",
        public_visible: true,
      },
    ],
  },
};
export const target: OfferingTextTarget = {
  id: 202,
  practice_id: 2,
  status: "draft",
  lock_version: 4,
  name: "Destination draft",
  code: "DEST-CODE",
  contact_instructions: "Existing destination desk.",
  referral_instructions: null,
};

it("imports only explicitly selected changed text through the existing destination PATCH", () => {
  const before = JSON.stringify([source, target]);
  const plan = offeringTextImportPlan(
    source,
    101,
    target,
    ["name", "contact_instructions"],
    [],
  );
  expect(plan.changes).toEqual([
    { field: "name", before: "Destination draft", after: "Source draft name" },
    {
      field: "contact_instructions",
      before: "Existing destination desk.",
      after: "Contact the source desk.",
    },
  ]);
  const attempt = offeringTextImportAttempt(plan, "synthetic-exact-key");
  expect(attempt).toMatchObject({
    method: "PATCH",
    path: "/api/clinic/service_offerings/202",
    body: {
      service_offering: {
        request_key: "synthetic-exact-key",
        lock_version: 4,
        name: "Source draft name",
        contact_instructions: "Contact the source desk.",
      },
    },
  });
  expect(Object.keys(attempt.body.service_offering).sort()).toEqual([
    "contact_instructions",
    "lock_version",
    "name",
    "request_key",
  ]);
  expect(JSON.stringify([source, target])).toBe(before);
  expect(offeringTextImportAttempt(plan, "synthetic-exact-key")).toEqual(
    attempt,
  );
});

it("rejects unselected sources, same-clinic inputs, unsupported fields, duplicates and nondraft targets", () => {
  expect(() =>
    offeringTextImportPlan(source, 999, target, ["name"], []),
  ).toThrow("explicitly");
  expect(() =>
    offeringTextImportPlan(
      source,
      101,
      { ...target, practice_id: 1 },
      ["name"],
      [],
    ),
  ).toThrow("different");
  for (const status of ["published", "retired"])
    expect(() =>
      offeringTextImportPlan(source, 101, { ...target, status }, ["name"], []),
    ).toThrow("draft");
  for (const fields of [[], ["name", "name"], ["visit_type_id"], ["__proto__"]])
    expect(() =>
      offeringTextImportPlan(
        source,
        101,
        target,
        fields as OfferingImportField[],
        [],
      ),
    ).toThrow("supported");
  expect(() =>
    offeringTextImportPlan(
      source,
      101,
      { ...target, lock_version: -1 },
      ["name"],
      [],
    ),
  ).toThrow("Reload");
});

it("rejects missing/oversized text and reserved codes instead of clearing or guessing destination values", () => {
  for (const value of [
    null,
    undefined,
    "",
    "   ",
    false,
    {},
    "x".repeat(501),
  ]) {
    const saved = structuredClone(source);
    saved.configuration.service_offerings[0].contact_instructions = value;
    expect(() =>
      offeringTextImportPlan(saved, 101, target, ["contact_instructions"], []),
    ).toThrow("nonempty");
  }
  expect(() =>
    offeringTextImportPlan(source, 101, target, ["code"], ["SOURCE-CODE"]),
  ).toThrow("already used");
  expect(() =>
    offeringTextImportPlan(
      source,
      101,
      { ...target, name: "Source draft name" },
      ["name"],
      [],
    ),
  ).toThrow("No selected text differs");
});

it("previews precisely the normalized text that will be submitted", () => {
  const saved = structuredClone(source);
  saved.configuration.service_offerings[0].code = "  NEW-CODE  ";
  const plan = offeringTextImportPlan(saved, 101, target, ["code"], []);
  expect(plan.changes[0].after).toBe("NEW-CODE");
  expect(
    offeringTextImportAttempt(plan, "key").body.service_offering.code,
  ).toBe("NEW-CODE");
});
