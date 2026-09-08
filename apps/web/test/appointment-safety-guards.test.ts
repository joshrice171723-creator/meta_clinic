import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function featureSource(path: string) {
  return readFileSync(new URL(`../src/features/${path}`, import.meta.url), "utf8");
}

describe("appointment safety guards", () => {
  it("caps patient booking and reschedule windows at four hours", () => {
    const source = featureSource(
      "patientPortal/PatientAppointmentRequests.tsx",
    );

    expect(source.match(/intervalDuration <= 4 \* 60 \* 60 \* 1_000/g)).toHaveLength(
      2,
    );
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
});
