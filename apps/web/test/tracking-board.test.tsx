import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import postcss from "postcss";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ClinicOverview,
  ClinicWorkspaceContext,
} from "../src/api/contracts";
import { loginDestination } from "../src/api/client";
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
  ScheduleView,
} from "../src/features/clinic/CareFlow";
import {
  OverviewView,
  TrackingBoardView,
} from "../src/features/clinic/TrackingBoardPage";
import {
  CLINIC_THEMES,
  CLINIC_STATUS_COLORS,
} from "../src/features/clinic/appearancePreferences";
import {
  EXAMPLE_CLOCK,
  EXAMPLE_VISITS,
  VISIT_STAGES,
  durationLabel,
  elapsedMinutes,
  filterVisits,
  patientLabel,
  waitingMinutes,
} from "../src/features/clinic/trackingBoardData";

afterEach(() => vi.unstubAllGlobals());
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
  documents: true,
  messages: true,
  billing: true,
  roles: true,
};
const context: ClinicWorkspaceContext = {
  schema_version: "clinic-context-v1",
  user_id: 1,
  practice: clinic.practice,
  membership_id: 1,
  policy_version: "clinic-authorization-v1",
  capabilities: contextCapabilities,
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
    const html = renderToStaticMarkup(<TrackingBoardView visits={visits} />);
    expect(html).not.toContain("EX-001");
    expect(html).not.toContain("EX-099");
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
});
describe("board and Operations presentation boundaries", () => {
  it("renders the patient table with explicit unknowns and expandable rows", () => {
    const html = renderToStaticMarkup(<OverviewView patientAccess />);
    for (const text of [
      "Not verified",
      "Not recorded",
      "Non-member",
      "Wait",
      "Vitals",
      "Provider",
      "Waiting for",
    ])
      expect(html).toContain(text);
    for (const { label } of VISIT_STAGES) expect(html).toContain(label);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('for="board-stage"');
    expect(html).toContain("Clinic patient tracking board");
    expect(html).not.toContain("Example shift");
    expect(html).not.toContain("board-sort");
    expect(html).not.toContain("Items at reorder");
    expect(html).not.toContain("Active directory");
  });
  it("does not present an empty preview as an empty actual clinic", () => {
    const html = renderToStaticMarkup(<TrackingBoardView visits={[]} />);
    expect(html).toContain("No example visits");
    expect(html).toContain(
      "not evidence that the clinic has no waiting patients",
    );
  });
  it("withholds the board from users without patient-workspace capability", () => {
    const html = renderToStaticMarkup(<OverviewView patientAccess={false} />);
    expect(html).toContain("assigned patient-workspace users");
    expect(html).not.toContain("EX-001");
    expect(html).not.toContain("tracking-table-container");
  });
  it("escapes example content and keeps unknown age explicit", () => {
    const html = renderToStaticMarkup(
      <TrackingBoardView
        visits={[
          {
            ...EXAMPLE_VISITS[0],
            age: null,
            reason: "Same-day concern",
            chiefComplaint: "<script>example</script>",
          },
        ]}
      />,
    );
    expect(html).toContain("Age not recorded");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
  it("moves administrative counts to Operations without relabeling directory counts as visits", () => {
    const html = renderToStaticMarkup(<OperationsView clinic={clinic} />);
    expect(html).toContain("Office items to reorder");
    expect(html).toContain("Active directory entries");
    expect(html).toContain("Not today’s visit count");
    expect(html).toContain("Example office item");
    expect(html).toContain('href="/clinic/pharmacy"');
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
    expect(html).not.toContain("EHR");
    expect(loginDestination("/clinic/operations")).toBe("/clinic/operations");
    expect(loginDestination("/clinic/operations?next=//bad.invalid")).toBe(
      "/portal",
    );
    expect(loginDestination("/clinic/schedule")).toBe("/clinic/schedule");
    expect(loginDestination("/clinic/patients/7/encounters/9")).toBe(
      "/clinic/patients/7/encounters/9",
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
  it("shows recorded encounter context while keeping protected actions blocked", () => {
    const html = renderToStaticMarkup(
      <EncounterView
        patient={{ id: 7, display_name: "Synthetic Person", reference: "P-7" }}
        timezone="America/Chicago"
        encounter={{
          id: 9,
          patient_id: 7,
          appointment_id: 4,
          site_id: 1,
          room_id: null,
          started_at: "2026-08-31T15:00:00Z",
          ended_at: null,
          status: "open",
          participants: [],
          note_ids: [11],
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
    expect(html).toContain("open/completed API status");
    expect(html).toContain("72 beats/min");
    expect(html).toContain("Editor and signing unavailable");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("<button");
  });
});
describe("viewport-height chart-tab navigation", () => {
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
    },
  );
  it("uses only declared clinic tokens and clinic-scoped responsive rules", () => {
    const tokens = new Set(
      [
        ...Object.keys(CLINIC_THEMES.sage.light),
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
    expect(css).toContain("width: 44px");
    const source = readFileSync("src/features/clinic/Appearance.tsx", "utf8");
    expect(source.indexOf('import "./appearance.css"')).toBeLessThan(
      source.indexOf('import "./clinicFrame.css"'),
    );
  });
});
