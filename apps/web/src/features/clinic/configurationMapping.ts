export type ConfigurationRecord = {
  id: number;
  name?: string;
  [key: string]: unknown;
};

export type ConfigurationManifest = {
  format: number;
  purpose: string;
  generated_at: string;
  source_digest: string;
  configuration: {
    practice: ConfigurationRecord & {
      name: string;
      features: { revision: number };
    };
    sites: ConfigurationRecord[];
    service_offerings: ConfigurationRecord[];
  };
};

const record = (value: unknown): value is ConfigurationRecord =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Number.isSafeInteger((value as ConfigurationRecord).id) &&
  (value as ConfigurationRecord).id > 0 &&
  typeof (value as ConfigurationRecord).name === "string";

export function readMappingSource(value: unknown): ConfigurationManifest {
  const source = value as ConfigurationManifest;
  const rows = (value: unknown): value is ConfigurationRecord[] =>
    Array.isArray(value) &&
    value.length <= 500 &&
    value.every(record) &&
    new Set(value.map((row) => row.id)).size === value.length;
  if (
    !source ||
    source.format !== 1 ||
    typeof source.generated_at !== "string" ||
    !Number.isFinite(Date.parse(source.generated_at)) ||
    typeof source.source_digest !== "string" ||
    !/^[a-f0-9]{64}$/.test(source.source_digest) ||
    !record(source.configuration?.practice) ||
    !rows(source.configuration.sites) ||
    !rows(source.configuration.service_offerings) ||
    source.configuration.service_offerings.some(
      (offering) =>
        !Array.isArray(offering.site_ids) ||
        offering.site_ids.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
        new Set(offering.site_ids).size !== offering.site_ids.length ||
        !Number.isSafeInteger(offering.visit_type_id) ||
        Number(offering.visit_type_id) <= 0,
    )
  ) {
    throw new Error(
      "Choose a complete format 1 configuration snapshot (up to 500 records per group).",
    );
  }
  return source;
}

export type ConfigurationMappings = {
  sites: Record<number, number>;
  service_offerings: Record<number, number>;
};

export function configurationMappingPlan(
  source: ConfigurationManifest,
  target: ConfigurationManifest,
  mappings: ConfigurationMappings,
) {
  const blockers: string[] = [];
  if (source.configuration.practice.id === target.configuration.practice.id)
    blockers.push(
      "Choose a different source clinic; use saved JSON comparison for this clinic.",
    );
  const groups = ["sites", "service_offerings"] as const;
  const mapped = groups.flatMap((group) => {
    const used = new Set<number>();
    return source.configuration[group].map((row) => {
      const targetId = mappings[group][row.id];
      const destination = target.configuration[group].find(
        (item) => item.id === targetId,
      );
      const label = `${group === "sites" ? "Location" : "Service offering"} ${row.name} (#${row.id})`;
      if (!destination)
        blockers.push(
          `${label}: choose an existing destination or obtain a scoped creation assignment.`,
        );
      else if (used.has(destination.id))
        blockers.push(
          `${label}: destination #${destination.id} is already mapped; consolidation requires separate review.`,
        );
      if (destination) used.add(destination.id);
      return { group, source_id: row.id, target_id: destination?.id ?? null };
    });
  });
  for (const offering of source.configuration.service_offerings) {
    const destination = target.configuration.service_offerings.find(
      (item) => item.id === mappings.service_offerings[offering.id],
    );
    for (const id of offering.site_ids as number[]) {
      if (!source.configuration.sites.some((site) => site.id === id))
        blockers.push(
          `Service offering ${offering.name} (#${offering.id}): source location #${id} is missing. Obtain a fresh complete source snapshot.`,
        );
      else if (
        !target.configuration.sites.some(
          (site) => site.id === mappings.sites[id],
        )
      )
        blockers.push(
          `Service offering ${offering.name} (#${offering.id}): source location #${id} needs a destination mapping.`,
        );
      else if (
        destination &&
        (!Array.isArray(destination.site_ids) ||
          !destination.site_ids.includes(mappings.sites[id]))
      )
        blockers.push(
          `Service offering ${offering.name} (#${offering.id}): mapped destination does not serve location #${mappings.sites[id]}. Review its eligible locations separately.`,
        );
    }
    blockers.push(
      `Service offering ${offering.name} (#${offering.id}): visit type #${offering.visit_type_id} needs separate catalog mapping; this snapshot does not contain visit types or clinician/price eligibility.`,
    );
  }
  return {
    format: "meta-clinic-configuration-mapping-review-v1",
    status: "review_only",
    source: {
      practice_id: source.configuration.practice.id,
      digest: source.source_digest,
      generated_at: source.generated_at,
    },
    target: {
      practice_id: target.configuration.practice.id,
      digest: target.source_digest,
      generated_at: target.generated_at,
    },
    mappings: mapped,
    blockers,
    required_review: [
      "Clinic and location profiles, capabilities, insurance workflows and finalization require Meta Clinic review; unsupported transitions require a scoped FDE assignment.",
      "No setting is applied. Re-read both snapshots before any separately implemented change; normal ownership, permissions, revision and protected-setting checks remain required.",
      "This review plan is not an import or rollback file. Source digest is supplied provenance, not verified authenticity. Recover missing records at the source; do not guess clinical defaults or reuse source identifiers as destination identifiers.",
    ],
  };
}
