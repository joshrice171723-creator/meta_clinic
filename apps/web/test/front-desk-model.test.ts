import { afterEach, expect, it, vi } from "vitest";
import {
  appointmentActions,
  type FrontDeskAppointment,
} from "../src/features/clinic/frontDeskModel";
import { setBusinessDate } from "../src/shared/businessDate";

afterEach(() => {
  setBusinessDate("");
  vi.useRealTimers();
});

it.each(["2031-01-02", "2021-01-02"])(
  "uses the configured business date %s for no-show eligibility",
  (date) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
    setBusinessDate(date);
    const appointment = {
      status: "scheduled",
      encounter_id: null,
    } as FrontDeskAppointment;
    expect(
      appointmentActions({ ...appointment, starts_at: `${date}T11:00:00Z` })
        .canMarkNoShow,
    ).toBe(true);
    expect(
      appointmentActions({ ...appointment, starts_at: `${date}T13:00:00Z` })
        .canMarkNoShow,
    ).toBe(false);
  },
);
