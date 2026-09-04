import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PatientCareSummary } from "../src/api/contracts";
import {
  CareIndicators,
  CareSummaryTrigger,
  careIndicatorGroups,
  careSummaryPath,
  recordedDateLabel,
} from "../src/features/clinic/CareIndicators";
import { EXAMPLE_CARE_SUMMARIES } from "./trackingBoardCareFixtures";

const summary: PatientCareSummary = {
  schema_version: "patient-care-summary-v1",
  patient_id: 7,
  encounter_id: 9,
  as_of: "2026-09-02T14:00:00Z",
  allergies: {
    state: "known",
    active_count: 1,
    items: [
      {
        id: 1,
        allergen: "Synthetic allergen",
        reaction: "Synthetic rash",
        category: "medication",
        criticality: "low",
        severity: "mild",
        clinical_status: "active",
        verification_status: "confirmed",
        onset_at: null,
        recorded_at: "2026-09-01T14:05:00Z",
        last_reviewed_at: null,
        lock_version: 0,
      },
    ],
  },
  medications: {
    state: "known",
    active_count: 1,
    items: [
      {
        id: 2,
        medication: "Synthetic medication",
        dose: "10 synthetic units",
        route: "By mouth",
        frequency: "Daily",
        purpose: null,
        status: "active",
        information_source: "patient",
        effective_from: null,
        effective_until: null,
        asserted_at: "2026-09-01T14:05:00Z",
        recorded_at: "2026-09-01T14:05:00Z",
        last_reconciled_at: null,
        lock_version: 0,
      },
    ],
  },
  communication: {
    state: "known",
    primary_language: "Spanish",
    interpreter_required: true,
    needs: [],
  },
  care_needs: {
    state: "known",
    active_count: 1,
    items: [
      {
        id: 3,
        category: "mobility",
        code: "wheelchair",
        description: "Wheelchair access requested",
        instructions: "Use accessible entrance",
        status: "active",
        effective_from: null,
        effective_until: null,
        recorded_at: "2026-09-01T14:05:00Z",
        last_reviewed_at: null,
        lock_version: 0,
      },
    ],
  },
  current_care_conditions: {
    state: "known",
    active_count: 1,
    items: [
      {
        id: 4,
        condition: "Synthetic current-care condition",
        clinical_status: "active",
        verification_status: "confirmed",
        instruction: "Synthetic care instruction",
        onset_at: null,
        recorded_at: "2026-09-01T14:05:00Z",
        last_reviewed_at: null,
        lock_version: 0,
      },
    ],
  },
  precautions: {
    state: "known",
    active_count: 1,
    items: [
      {
        id: 5,
        type: "droplet",
        evidence_status: "suspected",
        status: "active",
        instructions: "Synthetic PPE instruction",
        recorded_at: "2026-09-01T14:05:00Z",
        last_reassessed_at: null,
        lock_version: 0,
      },
    ],
  },
  reviews: {
    allergies: {
      state: "current_list_confirmed",
      information_source: "patient",
      reviewed_at: "2026-09-01T14:05:00Z",
    },
    medications: {
      state: "follow_up_needed",
      information_source: "patient",
      reviewed_at: "2026-09-01T14:05:00Z",
    },
    care_needs: {
      state: "current_list_confirmed",
      information_source: "patient",
      reviewed_at: "2026-09-01T14:05:00Z",
    },
  },
  review_needed: true,
  review_needed_topics: ["medications"],
};

describe("tracking-board care indicators", () => {
  it("builds the approved categories from recorded server facts", () => {
    const groups = careIndicatorGroups({ status: "ready", summary });
    expect(groups.map((group) => group.key)).toEqual([
      "allergies",
      "medications",
      "communication",
      "access",
      "precautions",
      "conditions",
      "review",
    ]);
    expect(groups[0].details[0]).toEqual({
      primary: "Synthetic allergen",
      secondary: "Synthetic rash · Recorded Sep 1, 2026",
    });
    expect(groups.at(-1)?.details.map((item) => item.secondary)).toContain(
      "Follow-up needed · Sep 1, 2026",
    );
  });

  it("renders labeled controls without relying on icon color", () => {
    const html = renderToStaticMarkup(
      <CareIndicators
        state={{ status: "ready", summary }}
        patientLabel="S. Pat"
      />,
    );
    for (const [label, count] of [
      ["Allergies", 1],
      ["Medications", 1],
      ["Communication needs", 1],
      ["Access and care needs", 1],
      ["Encounter precautions", 1],
      ["Current-care conditions", 1],
      ["Review needed", 1],
    ]) {
      expect(html).toContain(
        `aria-label="${label}: ${count}. Show details for S. Pat"`,
      );
    }
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
  });

  it("keeps chart navigation separate from care-detail disclosure", () => {
    const html = renderToStaticMarkup(
      <CareSummaryTrigger
        state={{ status: "ready", summary }}
        patientLabel="S. Pat"
        href="/clinic/patients/7/encounters/9"
        actionLabel="Open SOAP note for S. Pat"
      >
        <span>Chart</span>
      </CareSummaryTrigger>,
    );
    expect(html).toContain('href="/clinic/patients/7/encounters/9"');
    expect(html).toContain('aria-label="Open SOAP note for S. Pat"');
    expect(html).not.toContain('aria-haspopup="dialog"');
    expect(html).not.toContain("aria-expanded");
  });

  it("communicates when an example visit is unlinked without implying no concerns", () => {
    const unlinked = careIndicatorGroups({ status: "unlinked" });
    expect(unlinked[0].label).toBe("Care summary unavailable");
    expect(unlinked[0].details[0].secondary).toBe(
      "No linked care summary is available.",
    );
    const html = renderToStaticMarkup(
      <CareIndicators state={{ status: "unlinked" }} patientLabel="S. Pat" />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain(
      'aria-label="Care summary unavailable for S. Pat. Show details"',
    );
    expect(html).toContain("tracking-care-status");

    const error = renderToStaticMarkup(
      <CareIndicators state={{ status: "error" }} patientLabel="S. Pat" />,
    );
    expect(error).toContain(
      'aria-label="Care summary could not be loaded for S. Pat. Show details"',
    );

    expect(
      renderToStaticMarkup(
        <CareIndicators
          state={{ status: "ready", summary }}
          patientLabel="S. Pat"
        />,
      ),
    ).not.toContain("Care summary unavailable");

    const incomplete = structuredClone(summary);
    incomplete.allergies = {
      state: "not_recorded",
      active_count: 0,
      items: [],
    };
    incomplete.medications = {
      state: "none_reported",
      active_count: 0,
      items: [],
    };
    incomplete.care_needs = {
      state: "none_reported",
      active_count: 0,
      items: [],
    };
    incomplete.communication = {
      state: "not_recorded",
      primary_language: null,
      interpreter_required: null,
      needs: [],
    };
    incomplete.precautions = {
      state: "not_recorded",
      active_count: 0,
      items: [],
    };
    incomplete.current_care_conditions = {
      state: "not_recorded",
      active_count: 0,
      items: [],
    };
    incomplete.review_needed = null;
    expect(
      careIndicatorGroups({ status: "ready", summary: incomplete }).map(
        (group) => group.key,
      ),
    ).toEqual(["review"]);
  });

  it("seeds varied concerns while leaving some Care cells empty", () => {
    expect(
      careIndicatorGroups({
        status: "ready",
        summary: EXAMPLE_CARE_SUMMARIES["EX-001"],
      }),
    ).toHaveLength(0);
    expect(
      careIndicatorGroups({
        status: "ready",
        summary: EXAMPLE_CARE_SUMMARIES["EX-002"],
      }).map((group) => group.key),
    ).toEqual(["review"]);
    expect(
      careIndicatorGroups({
        status: "ready",
        summary: EXAMPLE_CARE_SUMMARIES["EX-003"],
      }).map((group) => group.key),
    ).toEqual(["allergies", "medications", "communication"]);
  });

  it("builds only same-origin patient-bound summary paths", () => {
    expect(careSummaryPath({ id: "EX-1" })).toBeNull();
    expect(careSummaryPath({ id: "EX-1", patientId: 7 })).toBe(
      "/api/clinic/patients/7/care_summary",
    );
    expect(careSummaryPath({ id: "EX-1", patientId: 7, encounterId: 9 })).toBe(
      "/api/clinic/patients/7/care_summary?encounter_id=9",
    );
    expect(recordedDateLabel("bad date")).toBe("Date not recorded");
    expect(recordedDateLabel("2026-09-01T14:05:00Z", "Bad/Timezone")).toBe(
      "Date not recorded",
    );
  });
});
