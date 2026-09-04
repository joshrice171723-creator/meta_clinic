import { readFileSync } from "node:fs";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import postcss from "postcss";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ClinicOverview,
  ClinicWorkspaceContext,
  EncounterNote,
  NoteTemplate,
} from "../src/api/contracts";
import { ApiError, loginDestination } from "../src/api/client";
import {
  ClinicFrame,
  compactNavigation,
} from "../src/features/clinic/ClinicFrame";
import { ClinicNavigation } from "../src/features/clinic/Workspace";
import { OperationsView } from "../src/features/clinic/Operations";
import {
  appointmentDefaults,
  appointmentIntervalError,
  EncounterView,
  hasSoapContent,
  ScheduleView,
  SoapNoteForm,
  templateWouldOverwrite,
} from "../src/features/clinic/CareFlow";
import {
  formatBoardDate,
  formatClockTime,
  chartActionPresentation,
  OverviewView,
  filterVisitsForClinician,
  providerAssignmentAttempt,
  providerAssignmentFailure,
  TrackingBoardView,
} from "../src/features/clinic/TrackingBoardPage";
import {
  CLINIC_THEMES,
  CLINIC_STATUS_COLORS,
} from "../src/features/clinic/appearancePreferences";
import {
  VISIT_STAGES,
  clinicianInitials,
  clinicianLabel,
  cliniciansForLocation,
  durationLabel,
  elapsedMinutes,
  filterVisits,
  patientLabel,
  waitingMinutes,
} from "../src/features/clinic/trackingBoardData";
import { EXAMPLE_CARE_SUMMARIES } from "./trackingBoardCareFixtures";
import {
  EXAMPLE_CLOCK,
  EXAMPLE_CLINICIANS,
  EXAMPLE_VISITS,
} from "./trackingBoardFixtures";

afterEach(() => vi.unstubAllGlobals());

const readSource = (path: string) =>
  readFileSync(path, "utf8").replaceAll("\r\n", "\n");

const EXAMPLE_CARE_SUMMARY_STATES = Object.fromEntries(
  Object.entries(EXAMPLE_CARE_SUMMARIES).map(([visitId, summary]) => [
    visitId,
    { status: "ready" as const, summary },
  ]),
);

function TestTrackingBoard(
  props: Partial<ComponentProps<typeof TrackingBoardView>> = {},
) {
  return (
    <TrackingBoardView
      visits={EXAMPLE_VISITS}
      now={EXAMPLE_CLOCK}
      timezone="America/Chicago"
      clinicians={EXAMPLE_CLINICIANS}
      careSummaryStates={EXAMPLE_CARE_SUMMARY_STATES}
      {...props}
    />
  );
}

const clinic: ClinicOverview = {
  practice: { id: 1, name: "Example clinic", timezone: "America/Chicago" },
  capabilities: {
    patients_access: true,
    inventory_access: true,
    staff_access: true,
  },
  inventory_actions: {
    catalog: true,
    receive: true,
    adjust: true,
    hold: true,
    release: true,
    count: true,
    configure: true,
  },
  development_demo: true,
  patient_count: 24,
  active_staff_count: 3,
  low_stock: [
    {
      id: 9,
      name: "Example office item",
      sku: "EX-ITEM",
      quantity: 2,
      reorder_level: 4,
    },
  ],
};
const contextCapabilities = {
  patients: true,
  patients_write: true,
  staff: true,
  inventory: true,
  appointments: true,
  encounters: true,
  notes_read: true,
  notes_write: true,
  documents: true,
  messages: true,
  billing_read: true,
  billing: true,
  roles: true,
};
const context: ClinicWorkspaceContext = {
  schema_version: "clinic-context-v1",
  user_id: 1,
  practice: clinic.practice,
  membership_id: 1,
  current_clinician_profile_id: "profile-1",
  credentials: ["SYNTHETIC-NP"],
  policy_version: "clinic-authorization-v1",
  capabilities: contextCapabilities,
  current_site: null,
  sites: [{ id: 1, code: "MAIN", timezone_override: null }],
};
describe("tracking-board identities and waiting times", () => {
  it.each([
    ["Mara", "Rivera", "M. Riv"],
    ["Avery", "Chen", "A. Che"],
    ["Bo", "Li", "B. Li"],
    [" Élodie ", " Andre\u0301 ", "É. And"],
    ["", "", "— —"],
  ])("abbreviates %s %s without padding short names", (first, last, label) => {
    expect(patientLabel(first, last)).toBe(label);
  });
  it("retains distinct references when abbreviations collide", () => {
    const visits = [
      EXAMPLE_VISITS[0],
      { ...EXAMPLE_VISITS[0], id: "EX-099", firstName: "Milo" },
    ];
    const html = renderToStaticMarkup(<TestTrackingBoard visits={visits} />);
    expect(html).toContain("board_visit_id=EX-001");
    expect(html).toContain("board_visit_id=EX-099");
    expect(html).not.toContain("Mara");
    expect(html).toContain("Rivera, M.");
  });
  it("distinguishes current-stage wait, total elapsed time and time in care", () => {
    const ready = EXAMPLE_VISITS[2];
    expect(waitingMinutes(ready, EXAMPLE_CLOCK)).toBe(17);
    expect(elapsedMinutes(ready.arrivedAt, EXAMPLE_CLOCK)).toBe(40);
    expect(waitingMinutes(EXAMPLE_VISITS[3], EXAMPLE_CLOCK)).toBeNull();
    expect(waitingMinutes(EXAMPLE_VISITS[1], EXAMPLE_CLOCK)).toBeNull();
    expect(durationLabel(65)).toBe("1h 5m");
    expect(durationLabel(0)).toBe("0 min");
  });
  it("formats clinic clock values in the practice timezone", () => {
    expect(
      formatClockTime("2026-09-02T15:00:00Z", "America/Los_Angeles"),
    ).toContain("8:00");
    expect(formatClockTime("invalid", "America/Chicago")).toBe("Scheduled");
    expect(
      formatBoardDate("2026-08-31T10:20:00-05:00", "America/Chicago"),
    ).toBe("Monday, August 31");
    expect(formatBoardDate("invalid", "America/Chicago")).toBeNull();
  });
  it("retains one provider request key while reconciling an uncertain attempt", () => {
    let generated = 0;
    const first = providerAssignmentAttempt(null, "provider-1", "41", () => {
      generated += 1;
      return "assignment-key-1";
    });
    const retry = providerAssignmentAttempt(first, "provider-1", "41", () => {
      generated += 1;
      return "assignment-key-2";
    });
    const changed = providerAssignmentAttempt(retry, "provider-2", "41", () => {
      generated += 1;
      return "assignment-key-2";
    });

    expect(retry).toBe(first);
    expect(changed.requestKey).toBe("assignment-key-2");
    expect(generated).toBe(2);
  });
  it("retains the assignment attempt only when a mutation outcome is unknown", () => {
    expect(
      providerAssignmentFailure(
        new ApiError(409, "Receipt pending", "outcome_unconfirmed"),
      ),
    ).toMatchObject({ outcomeUnknown: true, reloadRequired: false });
    expect(
      providerAssignmentFailure(new ApiError(503, "Connection lost")),
    ).toMatchObject({ outcomeUnknown: true, reloadRequired: false });
    expect(
      providerAssignmentFailure(new ApiError(409, "Stale token")),
    ).toMatchObject({ outcomeUnknown: false, reloadRequired: true });
    expect(
      providerAssignmentFailure(new ApiError(403, "Not permitted")),
    ).toMatchObject({ outcomeUnknown: false, reloadRequired: false });
  });
  it.each([null, "invalid", "2026-08-31T12:00:00-05:00"])(
    "keeps missing/bad/future timestamps unknown: %s",
    (since) => {
      expect(elapsedMinutes(since, EXAMPLE_CLOCK)).toBeNull();
      expect(
        waitingMinutes(
          { ...EXAMPLE_VISITS[0], stageStartedAt: since },
          EXAMPLE_CLOCK,
        ),
      ).toBeNull();
      expect(durationLabel(null)).toBe("Not recorded");
    },
  );
  it("rejects a stage timestamp before arrival", () => {
    expect(
      waitingMinutes(
        { ...EXAMPLE_VISITS[0], stageStartedAt: "2026-08-31T09:00:00-05:00" },
        EXAMPLE_CLOCK,
      ),
    ).toBeNull();
  });
  it("filters by stage and visible identifiers without mutating source order", () => {
    const before = EXAMPLE_VISITS.map((v) => v.id);
    expect(
      filterVisits(EXAMPLE_VISITS, "ready", "", "arrival", EXAMPLE_CLOCK),
    ).toHaveLength(2);
    expect(
      filterVisits(EXAMPLE_VISITS, "all", "m. riv", "arrival", EXAMPLE_CLOCK)[0]
        .id,
    ).toBe("EX-001");
    expect(
      filterVisits(EXAMPLE_VISITS, "all", "room 2", "arrival", EXAMPLE_CLOCK)[0]
        .id,
    ).toBe("EX-002");
    expect(
      filterVisits(EXAMPLE_VISITS, "all", "EX-003", "arrival", EXAMPLE_CLOCK)[0]
        .id,
    ).toBe("EX-003");
    expect(
      filterVisits(EXAMPLE_VISITS, "ready", "EX-001", "arrival", EXAMPLE_CLOCK),
    ).toHaveLength(0);
    expect(EXAMPLE_VISITS.map((v) => v.id)).toEqual(before);
  });
  it("keeps every stage filter available with a zero count", () => {
    const html = renderToStaticMarkup(
      <TestTrackingBoard visits={[EXAMPLE_VISITS[0]]} />,
    );
    expect(html).toContain("<h1>Patient Flow</h1>");
    expect(html).toContain(
      '<p class="tracking-board-date">Monday, August 31</p>',
    );
    for (const { label } of VISIT_STAGES) expect(html).toContain(label);
    expect(html).toContain("<span>Intake</span><strong>0</strong>");
    expect(
      filterVisits([EXAMPLE_VISITS[0]], "intake", "", "patient", EXAMPLE_CLOCK),
    ).toEqual([]);
  });
  it("sorts by waiting time, not membership or clinical acuity", () => {
    const ids = (visits: typeof EXAMPLE_VISITS) =>
      filterVisits(visits, "all", "", "wait", EXAMPLE_CLOCK).map((v) => v.id);
    expect(ids(EXAMPLE_VISITS)).toEqual([
      "EX-001",
      "EX-003",
      "EX-005",
      "EX-006",
      "EX-002",
      "EX-004",
    ]);
    expect(
      ids(EXAMPLE_VISITS.map((v) => ({ ...v, membership: "nonmember" }))),
    ).toEqual(ids(EXAMPLE_VISITS));
  });
  it("limits the synthetic clinician roster to the visit location", () => {
    const available = cliniciansForLocation("example-main", EXAMPLE_CLINICIANS);
    expect(available.map((clinician) => clinician.id)).toEqual([
      "example-clinician-am",
      "example-clinician-jl",
    ]);
    expect(available).not.toContain(EXAMPLE_CLINICIANS[2]);
    expect(clinicianInitials(available[0])).toBe("AM");
    expect(clinicianLabel(available[0])).toBe("Alex Morgan, NP");
  });
  it("includes varied explicit vital statuses without deriving thresholds", () => {
    const recorded = EXAMPLE_VISITS.filter(
      (visit) => visit.triage?.vitalsSummary,
    );
    const statuses = new Set(
      recorded.flatMap((visit) =>
        Object.values(visit.triage?.vitalStatuses ?? {}),
      ),
    );
    expect(statuses).toEqual(
      new Set(["above", "within", "below", "unassessed"]),
    );
    expect(
      new Set(recorded.map((visit) => visit.triage?.vitalsSummary)).size,
    ).toBe(recorded.length);
    const source = readFileSync(
      "src/features/clinic/TrackingBoardPage.tsx",
      "utf8",
    );
    expect(source).not.toContain("systolic <");
    expect(source).not.toContain("heartRate >=");
  });
});
describe("board and Operations presentation boundaries", () => {
  it("matches chart actions to chart state", () => {
    expect(chartActionPresentation("unopened", "open")).toEqual({
      label: "Start new Chart",
      tone: "unopened",
    });
    expect(chartActionPresentation("draft", "open")).toEqual({
      label: "Open Draft",
      tone: "draft",
    });
    expect(chartActionPresentation("signed", "open")).toEqual({
      label: "Open Chart",
      tone: "signed",
    });
    expect(chartActionPresentation("unavailable", "open")).toEqual({
      label: "Open chart",
      tone: "unavailable",
    });
  });
  it("renders a compact patient table without redundant workflow text", () => {
    const html = renderToStaticMarkup(<TestTrackingBoard />);
    for (const text of ["Non-member", "Timing", "Action"])
      expect(html).toContain(text);
    expect(html).toContain("Not verified");
    expect(html).toContain("Start new Chart");
    expect(html).toContain("Open Draft");
    expect(html).toContain("Open Chart");
    expect(html).toContain("tracking-chart-action-icon-draft");
    expect(html).toContain("tracking-chart-action-icon-signed");
    for (const { label } of VISIT_STAGES) expect(html).toContain(label);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain(">My patients<");
    expect(html).toContain(">2<");
    expect(html).toContain('for="board-stage"');
    expect(html).toContain('for="board-patient-filter"');
    expect(html).toContain("Clinic patient tracking board");
    expect(html).not.toContain("tracking-chart-action-label");
    const source = readSource("src/features/clinic/TrackingBoardPage.tsx");
    expect(source).toContain('<Tooltip title={primaryAction} placement="top">');
    expect(html).toContain("Above normal limits");
    expect(html).not.toContain("Synthetic display classifications");
    expect(html).toContain(">Provider<");
    expect(html).toContain(">Care<");
    expect(html).toContain("Amoxicillin: Localized rash");
    expect(html).toContain(
      "Allergies: Not reviewed · Medications: Not reviewed · Care needs: Not reviewed",
    );
    expect(html).not.toContain("Care summary unavailable");
    expect(html).toContain("Assigned provider: Alex Morgan, NP");
    expect(html).toContain(">Assign</button>");
    expect(html).not.toContain("Example only — not saved");
    for (const flowStage of ["Intake", "Triage", "Provider", "Checkout"])
      expect(html).toContain(`>${flowStage}</span>`);
    expect(html).toContain('class="tracking-reason"');
    expect(html).not.toContain("SOAP note workspace");
    expect(html).not.toContain("Waiting for");
    expect(html).not.toContain("total");
    expect(html).not.toContain("Find on board");
    expect(html).not.toContain(">Membership<");
    expect(html).not.toContain("OVERVIEW · PATIENT FLOW");
    expect(html).not.toContain("Patient directory");
    expect(html).not.toContain("Example shift");
    expect(html).not.toContain("board-sort");
    expect(html).not.toContain("Items at reorder");
    expect(html).not.toContain("Active directory");
  });
  it("distinguishes expected, late, and checked-in operational states", () => {
    const scheduled = {
      ...EXAMPLE_VISITS[0],
      id: "appointment-41",
      patientId: 41,
      encounterId: null,
      patientDisplayName: "Example Scheduled",
      stage: "scheduled" as const,
      operationalState: "late" as const,
      appointmentStartsAt: "2026-08-31T09:50:00-05:00",
      appointmentEndsAt: "2026-08-31T10:10:00-05:00",
      arrivedAt: null,
      stageStartedAt: null,
    };
    const checkedIn = {
      ...EXAMPLE_VISITS[1],
      id: "encounter-42",
      patientId: 42,
      encounterId: 42,
      patientDisplayName: "Example Waiting",
      stage: "waiting" as const,
      operationalState: "waiting_room" as const,
      appointmentStartsAt: "2026-08-31T10:00:00-05:00",
      appointmentEndsAt: "2026-08-31T10:30:00-05:00",
      arrivedAt: null,
      stageStartedAt: null,
    };
    const html = renderToStaticMarkup(
      <TestTrackingBoard visits={[scheduled, checkedIn]} now={EXAMPLE_CLOCK} />,
    );

    expect(html).not.toContain("tracking-status-copy");
    expect(html).toContain("Checked in");
    expect(html).toContain("Waiting room");
    expect(html).not.toContain("tracking-chart-action-label");
    const scheduledOnly = renderToStaticMarkup(
      <TestTrackingBoard visits={[scheduled]} now={EXAMPLE_CLOCK} />,
    );
    expect(scheduledOnly).not.toContain("Care summary unavailable");
  });
  it("exposes resizable columns and alternating visit rows", () => {
    const html = renderToStaticMarkup(
      <TestTrackingBoard visits={EXAMPLE_VISITS} />,
    );
    expect(html.match(/role="separator"/g)).toHaveLength(8);
    expect(html).toContain('aria-label="Resize Patient column"');
    expect(html).not.toContain('aria-valuemin="180"');
    expect(html).toContain('aria-label="Resize Room column"');
    expect(html).toContain('aria-label="Resize Timing column"');
    expect(html).toContain('aria-label="Resize Action column"');
    expect(html).not.toContain('aria-label="Resize Status column"');
    expect(html).not.toContain('aria-valuemin="180"');
    expect(html).toContain('aria-label="Resize Vitals column"');
    expect(html.indexOf('data-label="Reason"')).toBeLessThan(
      html.indexOf('data-label="Vitals"'),
    );
    expect(html.indexOf('data-label="Vitals"')).toBeLessThan(
      html.indexOf('data-label="Care"'),
    );
    expect(html).not.toContain('aria-label="Move Status column"');
    expect(html).toContain("tracking-visit-alt");
    expect(html).toContain("<colgroup>");
    expect(html).toContain(
      'style="width:100%;min-width:1180px;table-layout:auto"',
    );
    expect(html).toContain("tracking-table");
    expect(html).toContain('data-label="Patient"');
    const styles = readSource("src/features/clinic/trackingBoard.css");
    expect(styles).toContain("min-height: 58px");
    expect(styles).toContain("width: 28px");
    expect(styles).toContain("min-width: 28px");
    expect(styles).toContain("flex-wrap: nowrap");
    expect(styles).toContain("overflow-wrap: anywhere");
    expect(styles).toContain(".tracking-visit {\n  background");
    expect(styles).toContain("height: auto;\n  min-height: 58px");
    expect(styles).toContain(
      ".tracking-patient strong {\n  display: block;\n  overflow: visible;\n  overflow-wrap: anywhere;\n  white-space: normal;",
    );
    expect(styles).toContain("font-size: clamp(1.5rem, 2.4vw, 2rem)");
    expect(styles).toContain("padding-bottom: 10px");
    expect(styles).toContain("margin-bottom: 14px");
    const frameStyles = readSource("src/features/clinic/clinicFrame.css");
    expect(frameStyles).toContain("padding: 20px 12px 24px");
  });
  it("replaces the visit count with a recoverable column selector", () => {
    const html = renderToStaticMarkup(
      <TestTrackingBoard visits={EXAMPLE_VISITS} />,
    );
    expect(html).toContain("<summary>Columns</summary>");
    expect(html).toContain('aria-label="Choose tracking board columns"');
    expect(html.match(/type="checkbox"/g)).toHaveLength(9);
    expect(html).not.toContain("6 of 6 example visits");
  });
  it("keeps provider editing in a modal instead of the table cell", () => {
    const source = readFileSync(
      "src/features/clinic/TrackingBoardPage.tsx",
      "utf8",
    );
    expect(source).toContain('className="tracking-provider-dialog"');
    expect(source).not.toContain('className="tracking-provider-editor"');
  });
  it("renders the live assigned provider and exposes editing only with the atomic capability", () => {
    const clinician = {
      id: "api-provider-8",
      firstName: "",
      lastName: "",
      credentials: "",
      displayName: "Alex Rowan, NP",
      locationIds: ["api-site-1"],
    };
    const liveVisit = {
      ...EXAMPLE_VISITS[2],
      locationId: "api-site-1",
      assignedClinicianId: clinician.id,
      assignedProviderName: clinician.displayName,
      providerAssignmentToken: "41",
      providerAssignmentAvailable: true,
    };
    const editable = renderToStaticMarkup(
      <TestTrackingBoard visits={[liveVisit]} clinicians={[clinician]} />,
    );
    expect(editable).toContain('class="tracking-provider-value"');
    expect(editable).toContain(
      "Assigned provider: Alex Rowan, NP. Change assignment.",
    );
    expect(editable).not.toContain('aria-label="Provider not recorded"');

    const readOnly = renderToStaticMarkup(
      <TestTrackingBoard
        visits={[{ ...liveVisit, providerAssignmentAvailable: false }]}
        clinicians={[clinician]}
      />,
    );
    expect(readOnly).toContain("tracking-provider-readonly");
    expect(readOnly).not.toContain("Change assignment");
  });
  it("does not present an empty preview as an empty actual clinic", () => {
    const html = renderToStaticMarkup(<TestTrackingBoard visits={[]} />);
    expect(html).toContain("No visits");
    expect(html).toContain("No visits are currently shown.");
    expect(html).not.toContain("An empty example is not evidence");
  });
  it("labels backend rows as partial and exposes a capped result", () => {
    const html = renderToStaticMarkup(
      <TestTrackingBoard
        visits={[{ ...EXAMPLE_VISITS[0], patientId: 7, encounterId: 9 }]}
        truncated
      />,
    );
    expect(html).not.toContain("Partial synthetic schedule");
    expect(html).toContain(
      "Incomplete result: this projection is capped at 200 rows. Additional appointments or encounters are not shown.",
    );
    expect(html).toContain('role="alert"');
  });
  it("uses board-projected care summaries without per-visit care requests", () => {
    const source = readFileSync(
      "src/features/clinic/TrackingBoardPage.tsx",
      "utf8",
    );
    expect(source).toContain("summary: visit.care_summary");
    expect(source).not.toContain("EXAMPLE_CARE_SUMMARIES");
    expect(source).not.toContain("usePatientCareSummaries");
  });
  it("withholds the board from users without patient-workspace capability", () => {
    const html = renderToStaticMarkup(<OverviewView />);
    expect(html).toContain("assigned patient-workspace users");
    expect(html).not.toContain("EX-001");
    expect(html).not.toContain("tracking-table-container");
  });
  it("filters the synthetic board to visits assigned to the current clinician", () => {
    expect(
      filterVisitsForClinician(EXAMPLE_VISITS, "example-clinician-am").map(
        (visit) => visit.id,
      ),
    ).toEqual(["EX-003", "EX-006"]);
    expect(filterVisitsForClinician(EXAMPLE_VISITS, null)).toEqual([]);
    expect(
      renderToStaticMarkup(
        <TestTrackingBoard myClinicianId="example-clinician-am" />,
      ),
    ).toContain(">My patients<");
  });
  it("escapes example content without repeating unavailable demographics", () => {
    const html = renderToStaticMarkup(
      <TestTrackingBoard
        visits={[
          {
            ...EXAMPLE_VISITS[0],
            age: null,
            gender: null,
            reason: "Same-day concern",
            chiefComplaint: "<script>example</script>",
          },
        ]}
      />,
    );
    expect(html).not.toContain("Age not recorded");
    expect(html.match(/Demographics not recorded/g)).toHaveLength(1);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
  it("places age and gender beneath the patient name instead of the record reference", () => {
    const html = renderToStaticMarkup(
      <TestTrackingBoard
        visits={[
          {
            ...EXAMPLE_VISITS[0],
            age: 37,
            gender: "F",
            patientReference: "SYN-HIDDEN-REFERENCE",
          },
        ]}
      />,
    );
    expect(html).toContain("37 yr · Female");
    expect(html).not.toContain("SYN-HIDDEN-REFERENCE");
  });
  it("moves administrative counts to Operations without relabeling directory counts as visits", () => {
    const html = renderToStaticMarkup(<OperationsView clinic={clinic} />);
    expect(html).toContain("Office items to reorder");
    expect(html).toContain("Active directory entries");
    expect(html).toContain("Not today’s visit count");
    expect(html).toContain("Example office item");
    expect(html).not.toContain('href="/clinic/pharmacy"');
    expect(html).not.toContain("EX-001");
  });
  it("preserves Operations capability filtering even if a payload contains restricted fields", () => {
    const html = renderToStaticMarkup(
      <OperationsView
        clinic={{
          ...clinic,
          capabilities: {
            patients_access: false,
            inventory_access: false,
            staff_access: false,
          },
        }}
      />,
    );
    expect(html).not.toContain("Example office item");
    expect(html).not.toContain("Active directory entries");
    expect(html).not.toContain('href="/clinic/pharmacy"');
    expect(html).toContain("restricted");
  });
  it("adds clean navigation labels and an exact Operations login return", () => {
    const html = renderToStaticMarkup(
      <ClinicNavigation
        capabilities={contextCapabilities}
        path="/clinic/operations"
      />,
    );
    expect(html).toContain('href="/clinic/operations" aria-current="page"');
    expect(html).toContain('type="button"');
    expect(html).toContain("Tracking Board");
    expect(html).toContain("Schedule");
    expect(html).not.toContain("EHR");
    expect(loginDestination("/clinic/operations")).toBe("/clinic/operations");
    expect(loginDestination("/clinic/operations?next=//bad.invalid")).toBe(
      "/portal",
    );
    expect(loginDestination("/clinic/schedule")).toBe("/clinic/schedule");
    expect(loginDestination("/clinic/patients/7/encounters/9")).toBe(
      "/clinic/patients/7/encounters/9",
    );

    const schedule = renderToStaticMarkup(
      <ClinicNavigation
        capabilities={contextCapabilities}
        path="/clinic"
        homeView="schedule"
      />,
    );
    expect(schedule).toContain('type="button" aria-current="page"');
    expect(schedule).toContain("Schedule");
    expect(schedule).not.toContain(
      'aria-current="page">Tracking Board</button>',
    );
  });
  it("adds Billing navigation and preserves the billing destination", () => {
    const html = renderToStaticMarkup(
      <ClinicNavigation
        capabilities={contextCapabilities}
        path="/clinic/billing"
      />,
    );
    expect(html).toContain('href="/clinic/billing" aria-current="page"');
    expect(loginDestination("/clinic/billing")).toBe("/clinic/billing");
    expect(loginDestination("/clinic/billing/patients")).toBe(
      "/clinic/billing/patients",
    );
  });
});
describe("mapped read-only care flow", () => {
  it("defaults to the next quarter-hour and a 30-minute visit", () => {
    const defaults = appointmentDefaults(new Date(2026, 7, 31, 10, 7, 31));
    const start = new Date(defaults.startsAt);
    const end = new Date(defaults.endsAt);
    expect(start.getHours()).toBe(10);
    expect(start.getMinutes()).toBe(15);
    expect(end.getTime() - start.getTime()).toBe(30 * 60_000);
  });
  it("rejects invalid, reversed, and overlong appointment intervals", () => {
    expect(appointmentIntervalError("", "")).toContain("valid");
    expect(
      appointmentIntervalError("2026-08-31T10:30", "2026-08-31T10:00"),
    ).toContain("after");
    expect(
      appointmentIntervalError("2026-08-31T10:00", "2026-09-01T10:01"),
    ).toContain("24 hours");
    expect(
      appointmentIntervalError("2026-08-31T10:00", "2026-08-31T10:30"),
    ).toBe("");
  });
  it("presents scheduled records without calling them arrivals or board rows", () => {
    const html = renderToStaticMarkup(
      <ScheduleView
        context={context}
        appointments={[
          {
            id: 4,
            patient_id: 7,
            site_id: 1,
            room_id: null,
            booked_clinician_id: null,
            visit_type_id: null,
            starts_at: "2026-08-31T15:00:00Z",
            ends_at: "2026-08-31T15:30:00Z",
            status: "confirmed",
            encounter_id: 9,
          },
        ]}
        pagination={{ page: 1, per_page: 25, total: 1, total_pages: 1 }}
      />,
    );
    expect(html).toContain("Read-only scheduled visits");
    expect(html).toContain('href="/clinic/patients/7"');
    expect(html).toContain('href="/clinic/patients/7/encounters/9"');
    expect(html).not.toContain("Start intake");
  });
  it("shows recorded encounter context while requiring the protected note workspace", () => {
    const html = renderToStaticMarkup(
      <EncounterView
        patient={{ id: 7, display_name: "Synthetic Person", reference: "P-7" }}
        timezone="America/Chicago"
        encounter={{
          id: 9,
          patient_id: 7,
          appointment_id: 4,
          site_id: "1",
          room_id: null,
          started_at: "2026-08-31T15:00:00Z",
          ended_at: null,
          status: "open",
          participants: [],
          note_ids: [11],
          notes: [],
          observation_count: 1,
          document_count: 0,
        }}
        observations={[
          {
            id: 12,
            patient_id: 7,
            encounter_id: 9,
            parent_observation_id: null,
            author_membership_id: 2,
            code: "synthetic-heart-rate",
            code_system: "example",
            code_version: "1",
            value_kind: "numeric",
            numeric_value: "72",
            text_value: null,
            coded_value: null,
            unit_code: "beats/min",
            missing_reason: null,
            observed_at: "2026-08-31T15:05:00Z",
            recorded_at: "2026-08-31T15:06:00Z",
          },
        ]}
      />,
    );
    expect(html).not.toContain("open/completed API status");
    expect(html).toContain("72 beats/min");
    expect(html).toContain("Editor unavailable");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("<button");
  });
  it("treats template application as an explicit potentially destructive action", () => {
    const template: NoteTemplate = {
      id: "adult-physical-exam-detailed",
      version: 1,
      label: "Adult physical exam",
      note_kind: "soap",
      source_label: "Synthetic source",
      source_url: "https://example.invalid/template",
      caution: "Review every statement.",
      sections: {
        subjective: "",
        objective: "Starter objective",
        assessment: "",
        plan: "",
      },
    };
    expect(hasSoapContent(template.sections)).toBe(true);
    expect(
      templateWouldOverwrite(
        { ...template.sections, subjective: "Existing history" },
        template,
      ),
    ).toBe(false);
    expect(
      templateWouldOverwrite(
        { ...template.sections, objective: "Existing exam" },
        template,
      ),
    ).toBe(true);
    expect(templateWouldOverwrite(template.sections, template)).toBe(false);
  });
  it("renders a draft-only SOAP editor without auto-applying normal findings", () => {
    const template: NoteTemplate = {
      id: "adult-physical-exam-detailed",
      version: 1,
      label: "Adult physical exam (12+), detailed",
      note_kind: "soap",
      source_label: "Synthetic source",
      source_url: "https://example.invalid/template",
      caution: "Review every statement before saving.",
      sections: {
        subjective: "",
        objective: "Starter normal finding must not appear before application",
        assessment: "",
        plan: "",
      },
    };
    const html = renderToStaticMarkup(
      <SoapNoteForm encounterId={9} templates={[template]} canWrite />,
    );
    for (const name of ["subjective", "objective", "assessment", "plan"])
      expect(html).toContain(`name="${name}"`);
    expect(html).not.toContain("Apply starter text");
    expect(html).toContain("Save draft");
    expect(html).toContain("Review of Systems");
    expect(html).toContain("0/13 systems with selections");
    expect(html).toContain(
      "Click a finding to cycle: positive, negative, then not reviewed.",
    );
    expect(html).toContain('id="chart-hpi"');
    expect(html).toContain('id="chart-ros"');
    expect(html).toContain("Capture the patient-reported history");
    expect(html).not.toContain(
      "Starter normal finding must not appear before application",
    );
    expect(html).not.toContain("Sign note");
    expect(html).not.toContain("Prescription");
  });
  it("renders an acknowledged SOAP revision without a template overwrite control", () => {
    const note: EncounterNote = {
      id: 11,
      patient_id: 7,
      encounter_id: 9,
      note_kind: "soap",
      version: 0,
      latest_revision: 2,
      signed: false,
      current_revision: {
        id: 22,
        revision_no: 2,
        author_membership_id: 3,
        payload_version: 1,
        created_at: "2026-09-01T12:00:00Z",
        signed: false,
        body: {
          schema: "soap-note-v1",
          note_kind: "soap",
          template_id: "adult-physical-exam-detailed",
          template_version: 1,
          sections: {
            subjective: "Synthetic saved history",
            objective: "Synthetic saved exam",
            assessment: "Synthetic assessment",
            plan: "Synthetic plan",
          },
        },
      },
      revisions: [],
    };
    const html = renderToStaticMarkup(
      <SoapNoteForm encounterId={9} note={note} templates={[]} canWrite />,
    );
    expect(html).toContain("Draft revision 2");
    expect(html).toContain("Synthetic saved history");
    expect(html).toContain("Save new revision");
    expect(html).not.toContain("Apply starter text");
  });
});
describe("viewport-height clinic menu navigation", () => {
  it.each([false, true])(
    "starts with compact=%s and always leaves an accessible toggle",
    (compact) => {
      vi.stubGlobal("window", {
        matchMedia: vi.fn(() => ({ matches: compact })),
      });
      expect(compactNavigation()).toBe(compact);
      const html = renderToStaticMarkup(
        <ClinicFrame
          practiceName="Example clinic"
          navigation={<a href="/clinic">Overview</a>}
        >
          <h1>Example workload</h1>
        </ClinicFrame>,
      );
      expect(html).toContain(`data-collapsed="${compact}"`);
      expect(html).toContain(`aria-expanded="${!compact}"`);
      expect(html).toContain('aria-controls="clinic-sidebar"');
      expect(html.includes('hidden=""')).toBe(compact);
      expect(html).toContain("Sign out");
      expect(html).not.toContain("CLINIC WORKSPACE");
    },
  );
  it("uses only declared clinic tokens and clinic-scoped responsive rules", () => {
    const tokens = new Set(
      [
        ...Object.keys(CLINIC_THEMES.juniper.light),
        ...Object.keys(CLINIC_STATUS_COLORS.light),
      ].map((key) => `--clinic-${key}`),
    );
    for (const file of ["clinicFrame.css", "trackingBoard.css"]) {
      const css = readFileSync(`src/features/clinic/${file}`, "utf8");
      for (const match of css.matchAll(/var\((--clinic-[\w-]+)\)/g))
        expect(tokens.has(match[1]), match[1]).toBe(true);
      postcss.parse(css).walkRules((rule) => {
        for (const selector of rule.selectors)
          expect(selector.startsWith(".clinic-theme ")).toBe(true);
      });
    }
    const css = readFileSync("src/features/clinic/clinicFrame.css", "utf8");
    expect(css).toContain("height: 100dvh");
    expect(css).toContain("overflow-y: auto");
    expect(css).toContain(".clinic-sidebar[hidden]");
    expect(css).toContain("width: 40px");
    expect(css).toContain(
      '.clinic-shell[data-collapsed="false"] .clinic-menu-toggle',
    );
    expect(css).toContain("right: 12px");
    expect(css).toContain("margin-left: 56px");
    const boardCss = readFileSync(
      "src/features/clinic/trackingBoard.css",
      "utf8",
    );
    expect(boardCss).toContain(".MuiTableSortLabel-icon");
    expect(boardCss).toContain("width: 18px");
    expect(boardCss).toContain("height: 18px");
    expect(boardCss).toContain("font-size: 30px");
    expect(boardCss).toContain("tracking-chart-action-icon-draft");
    expect(boardCss).toContain("tracking-chart-action-icon-signed");
    expect(boardCss).toContain("var(--clinic-warning)");
    expect(boardCss).toContain("var(--clinic-success)");
    expect(boardCss).toContain("min-width: max-content");
    expect(boardCss).toContain("@media (max-width: 760px)");
    const source = readFileSync("src/features/clinic/Appearance.tsx", "utf8");
    expect(source.indexOf('import "./appearance.css"')).toBeLessThan(
      source.indexOf('import "./clinicFrame.css"'),
    );
  });

  it("keeps example datasets outside the production tracking-board graph", () => {
    const pageSource = readSource("src/features/clinic/TrackingBoardPage.tsx");
    const dataSource = readSource("src/features/clinic/trackingBoardData.ts");
    for (const source of [pageSource, dataSource]) {
      expect(source).not.toContain("EXAMPLE_VISITS");
      expect(source).not.toContain("EXAMPLE_CLINICIANS");
      expect(source).not.toContain("EXAMPLE_CLOCK");
      expect(source).not.toContain("EXAMPLE_CARE_SUMMARIES");
    }
    expect(pageSource).toContain(
      "careSummaryStates ?? EMPTY_CARE_SUMMARY_STATES",
    );
  });
});
