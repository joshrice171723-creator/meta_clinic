import { describe, expect, it } from "vitest";
import { visitInstructionHandoutHtml } from "../src/shared/VisitInstructionHandout";

describe("patient instruction handout", () => {
  it("prints only released handout fields and escapes markup in every displayed source", () => {
    const html = visitInstructionHandoutHtml({
      encounter_id: 17,
      visit_at: "2026-09-07T09:00:00Z",
      signed_at: "2026-09-07T10:00:00Z",
      timezone: "UTC",
      patient_name: 'A <img src=x onerror="alert(1)"> & B',
      practice_name: "Clinic </div><script>malicious()</script>",
      instructions: "First line.\n<script>alert('second line')</script>",
      ...({
        subjective: "Private clinician narrative",
        plan: "Private plan",
      } as Record<string, string>),
    });
    expect(html).toContain(
      "First line.\n&lt;script&gt;alert(&#39;second line&#39;)&lt;/script&gt;",
    );
    expect(html).toContain(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; B",
    );
    expect(html).toContain(
      "Clinic &lt;/div&gt;&lt;script&gt;malicious()&lt;/script&gt;",
    );
    expect(html).not.toMatch(
      /<script|<img|Private clinician narrative|Private plan/,
    );
    expect(html).toContain("white-space: pre-wrap");
    expect(html).toContain("(UTC)");
  });
});
