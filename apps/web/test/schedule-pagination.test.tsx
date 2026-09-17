import { describe, expect, it, vi } from "vitest";
import {
  calendarDate,
  calendarInstant,
  appointmentTracks,
  shiftCalendarMonth,
  slotBookingAriaLabel,
  buildCalendarIcs,
  isValidCalendarMonth,
  isValidCalendarDay,
  ClinicSchedule,
} from "../src/features/clinic/ClinicSchedule";
import { Schedule } from "../src/features/clinic/CareFlow";
import type { CalendarAppointment } from "../src/api/contracts";

vi.mock("../src/features/clinic/Workspace", () => ({
  useClinic: () => ({
    practice: { timezone: "America/Chicago" },
    capabilities: { appointments_book: true, patients: true },
  }),
}));

describe("clinic calendar navigation and authoritative booking handoff", () => {
  it("keeps overlapping appointments visible in separate tracks", () => {
    const appointments = [
      {
        id: 1,
        starts_at: "2026-09-16T09:00:00Z",
        ends_at: "2026-09-16T10:00:00Z",
      },
      {
        id: 2,
        starts_at: "2026-09-16T09:30:00Z",
        ends_at: "2026-09-16T10:00:00Z",
      },
      {
        id: 3,
        starts_at: "2026-09-16T10:00:00Z",
        ends_at: "2026-09-16T10:30:00Z",
      },
    ] as CalendarAppointment[];
    const tracks = appointmentTracks(appointments);
    expect(tracks.get(1)).toEqual({ track: 0, tracks: 2 });
    expect(tracks.get(2)).toEqual({ track: 1, tracks: 2 });
    expect(tracks.get(3)).toEqual({ track: 0, tracks: 1 });
  });
  it("uses the clinic date instead of UTC or the workstation date", () => {
    expect(
      calendarDate(new Date("2026-09-16T02:00:00Z"), "America/Chicago"),
    ).toBe("2026-09-15");
  });
  it("moves across year and leap-month boundaries", () => {
    expect(shiftCalendarMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftCalendarMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftCalendarMonth("2024-01", 1)).toBe("2024-02");
  });
  it("rejects semantically invalid calendar query values", () => {
    expect(isValidCalendarMonth("2026-13")).toBe(false);
    expect(isValidCalendarMonth("2026-02")).toBe(true);
    expect(isValidCalendarDay("2026-02-29")).toBe(false);
    expect(isValidCalendarDay("2028-02-29")).toBe(true);
  });
  it("prefills the selected calendar day using clinic time across DST", () => {
    expect(calendarInstant("2026-09-16", 9, "America/Chicago")).toBe(
      "2026-09-16T14:00:00.000Z",
    );
    expect(calendarInstant("2026-12-16", 9, "America/Chicago")).toBe(
      "2026-12-16T15:00:00.000Z",
    );
  });
  it("gives each bookable slot a clinic-local date, time, and resource name", () => {
    expect(
      slotBookingAriaLabel({
        startsAt: "2026-09-16T14:00:00Z",
        date: "2026-09-16",
        timezone: "America/Chicago",
        clinicianName: "Alex Rowan, NP",
        roomName: "Infusion room 2",
      }),
    ).toBe(
      "Book 9:00 AM on Wednesday, September 16 with Alex Rowan, NP in Infusion room 2",
    );
  });
  it("exports a reconciliable read-only calendar and omits cancelled visits", () => {
    const ics = buildCalendarIcs(
      [
        {
          id: 7,
          patient_id: 122,
          starts_at: "2026-09-16T14:00:00Z",
          ends_at: "2026-09-16T14:30:00Z",
          status: "confirmed",
          calendar_status: "confirmed",
          patient: {
            id: 122,
            display_name: "Robin Garrison",
            reference: "MEM-7",
          },
          visit_type_name: "GLP-1 follow-up",
          room_name: "Room 2",
        },
        {
          id: 8,
          patient_id: 123,
          starts_at: "2026-09-16T15:00:00Z",
          ends_at: "2026-09-16T15:30:00Z",
          status: "cancelled",
          calendar_status: "cancelled",
        },
      ] as CalendarAppointment[],
      {
        calendarName: "Meta Clinic Downtown",
        generatedAt: "2026-09-16T13:00:00Z",
      },
    );
    expect(ics).toContain("METHOD:PUBLISH");
    expect(ics).toContain("X-META-CLINIC-SOURCE:server-calendar-read-only");
    expect(ics).toContain("DTSTAMP:20260916T130000Z");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics).toContain("LOCATION:Room 2");
    expect(ics).toContain(
      "DESCRIPTION:Patient: Robin Garrison\\nStatus: confirmed",
    );
    expect(ics).toContain("Robin Garrison");
    expect(ics).not.toContain("UID:meta-clinic-8@local");
  });
  it("carries the Patient Flow patient into calendar and booking", () => {
    const view = Schedule({ search: "?patient_id=122" });
    expect(view.type).toBe(ClinicSchedule);
    expect(view.props.initialPatientId).toBe(122);
    const booking = view.props.renderBooking(
      { site_id: 4, clinician_id: 9 },
      vi.fn(),
    );
    expect(booking.props.initialPatientId).toBe(122);
    expect(booking.props.initialSlot).toEqual({ site_id: 4, clinician_id: 9 });
  });
});
