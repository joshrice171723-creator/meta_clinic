import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  QaChangeImpact,
  QaImpactDetail,
} from "../src/features/qa/QaChangeImpact";
import {
  bundledImpact,
  impactRow,
  impactLabel,
  impactSummary,
  readImpactArtifact,
  scopeKey,
} from "../src/features/qa/changeImpact";

// Independently synthetic IDs/evidence only; no canonical titles or release mapping.
const row = (workflowId = "WF-001", status = "affected") => ({
  workflowId,
  status,
  reason: "Synthetic changed-path analysis",
  sourcePaths: ["synthetic/fixture.ts"],
  evidenceRefs: ["synthetic-evidence-1"],
  claimedFixIds: [] as number[],
});
const fixture = () => ({
  schemaVersion: 1,
  scopes: [
    {
      baselineSHA: "a".repeat(40),
      targetSHA: "b".repeat(40),
      evidenceRefs: ["synthetic-scope-review"],
      workflows: [
        row(),
        row("WF-002", "untouched"),
        { ...row("WF-003", "unknown"), claimedFixIds: [999001] },
      ],
    },
  ],
});

describe("read-only change impact", () => {
  it("ships no invented release mapping", () => {
    expect(bundledImpact).toEqual({ scopes: [], error: "" });
    expect(impactSummary()).toMatchObject({
      affected: 0,
      untouched: 0,
      unknown: 116,
      reQa: [],
    });
  });
  it("joins exact IDs without mutating the artifact or historical evidence", () => {
    const data = fixture();
    const before = JSON.stringify(data);
    const scope = readImpactArtifact(data).scopes[0];
    const historical = Object.freeze({
      id: "WF-002",
      result: "passed",
      revision: "c".repeat(40),
      evidence_ref: "synthetic-old-proof",
    });
    expect(scopeKey(scope)).toBe(`${"a".repeat(40)}..${"b".repeat(40)}`);
    expect(impactLabel(impactRow(scope, historical.id))).toBe(
      "stale untouched · historical verdict retained",
    );
    expect(impactSummary(scope)).toEqual({
      affected: 1,
      untouched: 1,
      unknown: 114,
      reQa: ["WF-001", "WF-003"],
    });
    expect(impactRow(scope, "WF-116").status).toBe("unknown");
    expect(impactRow(scope, "wf-001").status).toBe("unknown");
    expect(historical.result).toBe("passed");
    expect(historical.revision).toBe("c".repeat(40));
    expect(JSON.stringify(data)).toBe(before);
  });
  it.each([
    (d: ReturnType<typeof fixture>) => {
      d.scopes[0].targetSHA = "b".repeat(12);
    },
    (d: ReturnType<typeof fixture>) => {
      d.scopes[0].targetSHA = d.scopes[0].baselineSHA;
    },
    (d: ReturnType<typeof fixture>) => {
      d.scopes.push(d.scopes[0]);
    },
    (d: ReturnType<typeof fixture>) => {
      d.scopes[0].workflows.push(row());
    },
    (d: ReturnType<typeof fixture>) => {
      d.scopes[0].workflows[0].workflowId = "WF-117";
    },
    (d: ReturnType<typeof fixture>) => {
      d.scopes[0].workflows[0].status = "passed";
    },
    (d: ReturnType<typeof fixture>) => {
      d.scopes[0].workflows[0].reason = " ";
    },
    (d: ReturnType<typeof fixture>) => {
      d.scopes[0].workflows[0].evidenceRefs = [];
    },
    (d: ReturnType<typeof fixture>) => {
      d.scopes[0].workflows[0].claimedFixIds = [-1];
    },
    (d: ReturnType<typeof fixture>) => {
      Object.assign(d.scopes[0], { actor: "muse" });
    },
  ])("fails closed on invalid/ambiguous scope %#", (mutate) => {
    const data = fixture();
    mutate(data);
    const parsed = readImpactArtifact(data);
    expect(parsed.error).toBeTruthy();
    expect(parsed.scopes).toEqual([]);
    expect(impactSummary(parsed.scopes[0]).unknown).toBe(116);
  });
  it("renders shared details and separate-target warning without claiming fresh QA", () => {
    const scope = readImpactArtifact(fixture()).scopes[0];
    const html = renderToStaticMarkup(
      <>
        <QaChangeImpact
          selection={{ key: "", select: () => {}, scope }}
          revision={"c".repeat(40)}
        />
        <QaImpactDetail scope={scope} workflowId="WF-002" />
        <QaImpactDetail scope={scope} workflowId="WF-003" />
      </>,
    );
    expect(html).toContain("target is not the observed build");
    expect(html).toContain("114 unknown");
    expect(html).toContain("stale untouched");
    expect(html).toContain("#999001");
    expect(html).toContain("synthetic/fixture.ts");
    expect(html).toContain("synthetic-evidence-1");
    expect(html).not.toContain("href=");
  });
});
