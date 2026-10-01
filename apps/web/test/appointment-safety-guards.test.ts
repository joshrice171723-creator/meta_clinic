import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { appointmentActions } from "../src/features/clinic/frontDeskModel";

function featureSource(path: string) {
  return readFileSync(
    new URL(`../src/features/${path}`, import.meta.url),
    "utf8",
  );
}

describe("appointment safety guards", () => {
  it("caps patient booking and reschedule windows at four hours", () => {
    const source = featureSource(
      "patientPortal/PatientAppointmentRequests.tsx",
    );

    expect(
      source.match(/intervalDuration <= 4 \* 60 \* 60 \* 1_000/g),
    ).toHaveLength(2);
    expect(source).toContain(
      "Choose an end time after the start and within four hours.",
    );
  });

  it("blocks staff approval and reschedule mutations with an invalid interval", () => {
    const source = featureSource("clinic/AppointmentRequestQueue.tsx");

    expect(source).toContain(
      "new Date(endsAt).valueOf() > new Date(startsAt).valueOf()",
    );
    expect(source).toContain("!startsAt || !endsAt || !intervalValid");
  });

  it("uses a non-identifying reminder result fallback", () => {
    const source = featureSource("clinic/AppointmentReminderBatch.tsx");

    expect(source).toContain('"Appointment details unavailable"');
    expect(source).not.toContain("Appointment #${result.appointment_id}");
  });

  it("does not offer no-show until the appointment has started", () => {
    const appointment = {
      id: 1,
      patient_id: 2,
      starts_at: new Date(Date.now() + 60_000).toISOString(),
      ends_at: new Date(Date.now() + 1_860_000).toISOString(),
      status: "scheduled",
      encounter_id: null,
    } as Parameters<typeof appointmentActions>[0];
    expect(appointmentActions(appointment).canMarkNoShow).toBe(false);
  });
});

it("Muse 101 no-show eligibility follows time status and encounter readback", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  try {
    const row = {
      id: 901,
      patient_id: 801,
      starts_at: "2026-10-01T12:00:00Z",
      ends_at: "2026-10-01T12:30:00Z",
      status: "scheduled",
      encounter_id: null,
    } as Parameters<typeof appointmentActions>[0];
    for (const status of ["scheduled", "confirmed"])
      expect(appointmentActions({ ...row, status }).canMarkNoShow).toBe(true);
    expect(
      appointmentActions({ ...row, starts_at: "2026-10-01T12:00:00.001Z" })
        .canMarkNoShow,
    ).toBe(false);
    expect(
      appointmentActions({ ...row, starts_at: "invalid" }).canMarkNoShow,
    ).toBe(false);
    expect(
      appointmentActions({ ...row, encounter_id: 902 }).canMarkNoShow,
    ).toBe(false);
    for (const status of ["no_show", "cancelled", "completed"])
      expect(appointmentActions({ ...row, status }).canMarkNoShow).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});
