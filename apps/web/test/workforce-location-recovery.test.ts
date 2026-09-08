import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function workforceSource(path: string) {
  return readFileSync(
    new URL(`../src/features/workforce/${path}`, import.meta.url),
    "utf8",
  );
}

describe("workforce location recovery", () => {
  it("clears prior-site shift swap state and errors before selecting another location", () => {
    const source = workforceSource("EmployeeRequestsPage.tsx");

    expect(source).toContain("const changeSite = (nextSiteId: string) => {");
    expect(source).toContain('setPublicationId("");');
    expect(source).toContain('setShiftId("");');
    expect(source).toContain('setTargetEmploymentId("");');
    expect(source).toContain("setError(undefined);");
    expect(source).toContain("onChange={(e) => changeSite(e.target.value)}");
  });

  it("rejects stale schedule and draft responses before they can power an action", () => {
    const source = workforceSource("ScheduleBuilderPage.tsx");

    expect(source).toContain("const currentSiteIdRef = useRef(currentSiteId);");
    expect(source).toContain("const loadRevision = useRef(0);");
    expect(source).toContain("const draftLoadRevision = useRef(0);");
    expect(source).toContain("revision !== loadRevision.current");
    expect(source).toContain("revision !== draftLoadRevision.current");
    expect(source).toContain("currentSiteIdRef.current !== expectedSiteId");
    expect(source).toContain("next.site.id !== expectedSiteId");
    expect(source).toContain("next.site_id !== expectedSiteId");
  });

  it("clears location-bound form state and blocks mismatched schedule mutations", () => {
    const source = workforceSource("ScheduleBuilderPage.tsx");

    expect(source).toContain("setData(undefined);");
    expect(source).toContain("setDraft(undefined);");
    expect(source).toContain("setPublishOpen(false);");
    expect(source).toContain('setTemplateId("");');
    expect(source).toContain('setEmployeeId("");');
    expect(source).toContain("data.site.id !== currentSiteId");
    expect(source).toContain("draft.site_id !== currentSiteId");
    expect(source).toContain("disabled={busy || loading}");
  });
});
