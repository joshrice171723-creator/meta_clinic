import { describe, expect, it } from "vitest";
import type { ClinicTrackingBoardVisit } from "../src/api/contracts";
import { waitingMinutes } from "../src/features/clinic/trackingBoardData";
import { trackingBoardVisitToBoardVisit } from "../src/features/clinic/trackingBoardApi";

// Independently invented names; exercise the real mapper without API calls.
describe("142 tracking board name preservation", () => {
  it.each([
    ["Synclair, Morgan", "Morgan", "Synclair"],
    ["Synton, Avery", "Avery", "Synton"],
    ["Morgan Synclair", "Morgan", "Synclair"],
    ["SYN_Mercer, Alex", "Alex", "Mercer"],
    ["SYN-Mercer, Alex", "Alex", "Mercer"],
    ["SYN Mercer, Alex", "Alex", "Mercer"],
    ["", "", ""],
  ])("preserves identity for %j", (displayName, firstName, lastName) => {
    const source: ClinicTrackingBoardVisit = {
      id: 901,
      row_type: "encounter",
      operational_state: "unrecorded",
      patient_id: 902,
      encounter_id: 901,
      chart_status: "unopened",
      provider_assignment_available: false,
      patient: {
        id: 902,
        display_name: displayName,
        reference: "SYN-902",
        membership: "not_verified",
      },
      encounter: null,
      appointment: null,
      care_summary: null,
    };
    expect(trackingBoardVisitToBoardVisit(source)).toMatchObject({
      id: "encounter-901",
      patientId: 902,
      encounterId: 901,
      patientDisplayName: displayName,
      patientReference: "SYN-902",
      firstName,
      lastName,
      membership: "unknown",
    });
    expect(source.patient.display_name).toBe(displayName);
  });
});

describe("210 actual arrival provenance", () => {
  const source: ClinicTrackingBoardVisit = {
    id: 971,
    row_type: "encounter",
    operational_state: "waiting_room",
    patient_id: 972,
    encounter_id: 971,
    chart_status: "unopened",
    provider_assignment_available: false,
    nurse_workflow: {
      stage: "waiting",
      intake_status: "not_recorded",
      handoff_state: "not_recorded",
      open_task_count: 0,
    },
    patient: {
      id: 972,
      display_name: "Synthetic arrival patient",
      reference: "SYN-972",
    },
    encounter: {
      id: 971,
      status: "open",
      started_at: "2030-02-04T03:01:00Z",
      ended_at: null,
      site_id: "15",
      site_code: "SYN",
      room_id: null,
      room_code: null,
    },
    appointment: {
      id: 973,
      status: "confirmed",
      starts_at: "2030-02-04T14:00:00Z",
      ends_at: "2030-02-04T14:30:00Z",
      visit_type_code: null,
      site_id: "15",
      site_code: "SYN",
      room_id: null,
      room_code: null,
    },
    care_summary: null,
  };
  it("uses actual encounter start for arrival and waiting rather than the scheduled slot", () => {
    const visit = trackingBoardVisitToBoardVisit(source);
    expect(visit.arrivedAt).toBe("2030-02-04T03:01:00Z");
    expect(visit.appointmentStartsAt).toBe("2030-02-04T14:00:00Z");
    expect(waitingMinutes(visit, "2030-02-04T03:03:00Z")).toBe(2);
  });
  it("does not fabricate an arrival or waiting duration for a scheduled-only record", () => {
    const visit = trackingBoardVisitToBoardVisit({
      ...source,
      row_type: "appointment",
      encounter_id: null,
      encounter: null,
      nurse_workflow: null,
    });
    expect(visit.arrivedAt).toBeNull();
    expect(waitingMinutes(visit, "2030-02-04T03:03:00Z")).toBeNull();
  });
});
