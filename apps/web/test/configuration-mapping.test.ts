import { describe, expect, it } from "vitest";
import {
  configurationMappingPlan,
  readMappingSource,
  type ConfigurationManifest,
} from "../src/features/clinic/configurationMapping";

const fixture = (id: number): ConfigurationManifest => ({
  format: 1,
  purpose: "Synthetic mapping fixture",
  generated_at: "2026-09-30T20:00:00Z",
  source_digest: String(id).repeat(64),
  configuration: {
    practice: { id, name: `Synthetic clinic ${id}`, features: { revision: 1 } },
    sites: [{ id: id * 10, name: "Same location name" }],
    service_offerings: [
      {
        id: id * 100,
        name: "Same offering name",
        site_ids: [id * 10],
        visit_type_id: id * 1000,
      },
    ],
  },
});

describe("configuration mapping review", () => {
  it("requires explicit destinations even when names match and never mutates either snapshot", () => {
    const source = fixture(1),
      target = fixture(2);
    const before = JSON.stringify([source, target]);
    const plan = configurationMappingPlan(readMappingSource(source), target, {
      sites: {},
      service_offerings: {},
    });
    expect(plan.mappings.every((row) => row.target_id === null)).toBe(true);
    expect(plan.blockers.join(" ")).toContain("choose an existing destination");
    expect(JSON.stringify([source, target])).toBe(before);
    expect(plan.status).toBe("review_only");
  });

  it("retains protected review and incomplete catalog blockers after valid explicit mapping", () => {
    const plan = configurationMappingPlan(fixture(1), fixture(2), {
      sites: { 10: 20 },
      service_offerings: { 100: 200 },
    });
    expect(plan.mappings.map((row) => row.target_id)).toEqual([20, 200]);
    expect(plan.blockers).toHaveLength(1);
    expect(plan.blockers[0]).toContain("separate catalog mapping");
    expect(plan.required_review.join(" ")).toContain("Meta Clinic review");
    expect(plan.target.digest).toBe("2".repeat(64));
  });

  it("reports missing source references and allows recovery with a complete fresh snapshot", () => {
    const source = fixture(1);
    source.configuration.service_offerings[0].site_ids = [99];
    const mappings = { sites: { 10: 20 }, service_offerings: { 100: 200 } };
    expect(
      configurationMappingPlan(source, fixture(2), mappings).blockers.join(" "),
    ).toContain("source location #99 is missing");
    source.configuration.sites.push({
      id: 99,
      name: "Recovered synthetic source location",
    });
    expect(
      configurationMappingPlan(source, fixture(2), mappings).blockers.join(" "),
    ).toContain("source location #99 needs a destination mapping");
  });

  it("rejects duplicate consolidation, nonexistent destinations, and incompatible location eligibility", () => {
    const source = fixture(1),
      target = fixture(2);
    source.configuration.sites.push({
      id: 11,
      name: "Other synthetic location",
    });
    const plan = configurationMappingPlan(source, target, {
      sites: { 10: 20, 11: 20 },
      service_offerings: { 100: 999 },
    });
    expect(plan.blockers.join(" ")).toContain("already mapped");
    expect(plan.mappings[2].target_id).toBeNull();
    target.configuration.service_offerings[0].site_ids = [];
    expect(
      configurationMappingPlan(fixture(1), target, {
        sites: { 10: 20 },
        service_offerings: { 100: 200 },
      }).blockers.join(" "),
    ).toContain("does not serve location #20");
  });

  it("fails closed for invalid files and same-clinic plans", () => {
    for (const invalid of [
      null,
      {},
      { ...fixture(1), format: 2 },
      { ...fixture(1), source_digest: "invalid" },
    ])
      expect(() => readMappingSource(invalid)).toThrow("format 1");
    const duplicate = fixture(1);
    duplicate.configuration.sites.push(duplicate.configuration.sites[0]);
    expect(() => readMappingSource(duplicate)).toThrow();
    const malformed = fixture(1);
    malformed.configuration.service_offerings[0].site_ids = ["10"];
    expect(() => readMappingSource(malformed)).toThrow();
    expect(
      configurationMappingPlan(fixture(1), fixture(1), {
        sites: {},
        service_offerings: {},
      }).blockers[0],
    ).toContain("different source clinic");
  });
});
