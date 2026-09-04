import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  composeReviewOfSystemsSubjective,
  nextReviewOfSystemsFindingState,
  REVIEW_OF_SYSTEMS,
  REVIEW_OF_SYSTEMS_HEADING,
  ReviewOfSystems,
  splitReviewOfSystemsSubjective,
} from "../src/features/clinic/ReviewOfSystems";

describe("Review of Systems composer", () => {
  it("uses the supplied full checklist and starts every finding not reviewed", () => {
    expect(REVIEW_OF_SYSTEMS.map((system) => system.label)).toEqual([
      "General",
      "HEENT",
      "Respiratory",
      "Cardiovascular",
      "Gastrointestinal",
      "Genitourinary",
      "Musculoskeletal",
      "Neurological",
      "Psychiatric",
      "Endocrine",
      "Hema/Lymph",
      "Integumentary",
      "Sleep",
    ]);

    const html = renderToStaticMarkup(
      <ReviewOfSystems value="" onChange={vi.fn()} />,
    );
    expect(html).toContain(
      "Click a finding to cycle: positive, negative, then not reviewed.",
    );
    expect(html).toContain("0/13 systems with selections · 0 findings");
    expect(html).toContain("Plain — not reviewed");
    expect(html.match(/data-state="unselected"/g)).toHaveLength(
      REVIEW_OF_SYSTEMS.reduce(
        (total, system) => total + system.findings.length,
        0,
      ),
    );
    expect(html).toContain(
      'aria-label="Fever: not reviewed. Activate to mark positive."',
    );
    for (const system of REVIEW_OF_SYSTEMS)
      expect(html).toContain(system.label);
    for (const finding of REVIEW_OF_SYSTEMS.flatMap(
      (system) => system.findings,
    ))
      expect(html).toContain(finding.label);
  });

  it("cycles not reviewed to positive to negative and back to not reviewed", () => {
    const positive = nextReviewOfSystemsFindingState();
    const negative = nextReviewOfSystemsFindingState(positive);
    const cleared = nextReviewOfSystemsFindingState(negative);

    expect(positive).toBe("present");
    expect(negative).toBe("absent");
    expect(cleared).toBeUndefined();
  });

  it("writes positive and negative findings without changing the free-text narrative", () => {
    const narrative =
      "Synthetic history with exact spacing.\nFollow-up detail.";
    const subjective = composeReviewOfSystemsSubjective(narrative, {
      "general.fever": "present",
      "general.fatigue": "absent",
      "respiratory.cough": "present",
    });

    expect(subjective).toBe(
      `${REVIEW_OF_SYSTEMS_HEADING}\n` +
        "- General: Present — fever; Absent — fatigue.\n" +
        "- Respiratory: Present — cough.\n\n" +
        narrative,
    );
    expect(splitReviewOfSystemsSubjective(subjective)).toEqual({
      narrative,
      selections: {
        "general.fever": "present",
        "general.fatigue": "absent",
        "respiratory.cough": "present",
      },
    });
    expect(subjective).not.toContain("weight change");
    expect(composeReviewOfSystemsSubjective(narrative, {})).toBe(narrative);
  });

  it("does not create an ROS block for blank findings", () => {
    const narrative = "Synthetic narrative\n\nwith a deliberate blank line.";
    expect(composeReviewOfSystemsSubjective(narrative, {})).toBe(narrative);
    expect(splitReviewOfSystemsSubjective(narrative)).toEqual({
      narrative,
      selections: {},
    });
  });

  it("rehydrates saved selections and disables signed or view-only controls", () => {
    const value = composeReviewOfSystemsSubjective("Synthetic narrative", {
      "heent.vision-problem": "present",
      "heent.ear-pain": "absent",
    });
    const html = renderToStaticMarkup(
      <ReviewOfSystems value={value} onChange={vi.fn()} disabled />,
    );

    expect(html).toContain("1/13 systems with selections · 2 findings");
    expect(html).toContain(
      'aria-label="Vision Problem: positive. Activate to mark negative."',
    );
    expect(html).toContain(
      'aria-label="Ear Pain: negative. Activate to mark not reviewed."',
    );
    expect(html).toContain('data-state="present"');
    expect(html).toContain('data-state="absent"');
    expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("uses circled and crossed non-color cues for selected findings", () => {
    const css = readFileSync("src/features/clinic/careFlow.css", "utf8");
    expect(css).toContain('.ros-finding-button[data-state="present"]');
    expect(css).toContain('.ros-finding-button[data-state="absent"]');
    expect(css).toContain(".ros-finding-mark::before");
    expect(css).toContain(".ros-finding-mark::after");
    expect(css).toContain("border-radius: 50%");
    expect(css).toContain("--ros-positive: #1d4ed8");
    expect(css).toContain("color: var(--clinic-error)");
  });
});
