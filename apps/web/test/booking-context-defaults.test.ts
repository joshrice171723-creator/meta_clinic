import { describe, expect, it } from "vitest";
import { bookingContextDefaults } from "../src/features/clinic/CareFlow";
import { genericCalendarBooking } from "../src/features/clinic/ClinicSchedule";
import type { CalendarResponse } from "../src/api/contracts";

const active = { id: 2, code: "Synthetic visit", retired_at: null };
const slot = {
  starts_at: "2099-10-06T13:30:00Z",
  ends_at: "2099-10-06T14:00:00Z",
  clinician_id: 9,
  room_ids: [6],
  provenance: {
    generated_at: "2099-10-06T13:00:00Z",
    source_rules: [{ id: 11, version: 3 }],
  },
};
function calendar(): CalendarResponse {
  return {
    month: "2099-10",
    site_id: 4,
    timezone: "America/Chicago",
    slot_minutes: 30,
    capacity_configured: true,
    clinicians: [{ id: 9, name: "Synthetic clinician" }],
    rooms: [{ id: 6, name: "Synthetic room", kind: "physical" }],
    days: [
      {
        date: "2099-10-06",
        scheduled: 0,
        confirmed: 0,
        available: 1,
        conflicts: 0,
        appointments: [],
        holds: [],
        slots: [slot],
      },
    ],
  };
}
const now = new Date("2099-10-06T13:00:00Z");

describe("booking configured context defaults", () => {
  it("uses the accessible selected scope and sole active visit type", () => {
    expect(
      bookingContextDefaults(
        [{ id: 4 }, { id: 5 }],
        [active, { ...active, id: 3, retired_at: "2099-01-01" }],
        5,
      ),
    ).toEqual({ siteId: "5", visitTypeId: "2" });
  });
  it("leaves ambiguous sites and visit types for explicit selection", () => {
    expect(
      bookingContextDefaults(
        [{ id: 4 }, { id: 5 }],
        [active, { ...active, id: 3 }],
      ),
    ).toEqual({ siteId: "", visitTypeId: "" });
  });
  it("does not replace a stale selected scope with a different sole site", () => {
    expect(bookingContextDefaults([{ id: 4 }], [active], 5).siteId).toBe("");
    expect(bookingContextDefaults([{ id: 4 }], []).visitTypeId).toBe("");
  });
});

describe("generic calendar booking defaults", () => {
  it("uses a uniquely valid projected clinician slot and keeps provenance", () => {
    const data = calendar();
    expect(genericCalendarBooking(data, 4, "2099-10-06", now)).toMatchObject({
      site_id: 4,
      clinician_id: 9,
      room_id: 6,
      starts_at: slot.starts_at,
      ends_at: slot.ends_at,
      provenance: { source_rules: slot.provenance.source_rules },
    });
  });
  it("keeps clinician and room blank when multiple clinicians have valid slots", () => {
    const data = calendar();
    data.clinicians.push({ id: 10, name: "Second synthetic clinician" });
    data.days[0].slots.push({ ...slot, clinician_id: 10 });
    expect(genericCalendarBooking(data, 4, "2099-10-06", now)).toEqual({
      site_id: 4,
      starts_at: slot.starts_at,
      ends_at: slot.ends_at,
    });
  });
  it("rejects expired, unconfigured and mismatched scope projections as prefills", () => {
    expect(genericCalendarBooking(calendar(), 5, "2099-10-06", now)).toEqual({
      site_id: 5,
    });
    const data = calendar();
    data.capacity_configured = false;
    expect(genericCalendarBooking(data, 4, "2099-10-06", now)).toEqual({
      site_id: 4,
    });
    expect(
      genericCalendarBooking(
        calendar(),
        4,
        "2099-10-06",
        new Date(slot.ends_at),
      ),
    ).toEqual({ site_id: 4 });
  });
});
