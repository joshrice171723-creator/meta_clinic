import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
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

  it("keeps mismatched booking responses unconfirmed with the exact attempt", () => {
    const source = featureSource("clinic/CareFlow.tsx");
    const responseStart = source.indexOf(
      "const requested = attempt.body.appointment;",
    );
    const responseCheck = source.slice(
      responseStart,
      source.indexOf("if (attempt.body.appointment.schedule_hold_id"),
    );
    const failureStart = source.indexOf("if (unknown) {", responseStart);
    const unknownHandling = source.slice(
      failureStart,
      source.indexOf("} else {", failureStart),
    );

    for (const field of ["patient_id", "site_id", "starts_at", "ends_at"])
      expect(responseCheck).toContain(`requested.${field}`);
    expect(responseCheck).toContain("Its outcome is unconfirmed");
    expect(source).toContain("body: attempt.body");
    expect(source).toContain("!(reason instanceof ApiError)");
    expect(unknownHandling).toContain("...pendingDraft");
    expect(unknownHandling).toContain("await workingDraft.save(unresolved)");
    expect(unknownHandling).not.toContain("setBookingAttempt(null)");
  });

  it("blocks a definite booking rejection until the form changes", () => {
    const source = featureSource("clinic/CareFlow.tsx");
    const formStart = source.indexOf('component="form"');
    const form = source.slice(
      formStart,
      source.indexOf("<Stack spacing={2.5}>", formStart),
    );
    const unresolvedStart = source.indexOf("const unresolved =");
    const rejectionHandling = source.slice(
      source.indexOf("} else {", unresolvedStart),
      source.indexOf("setSubmitError(", unresolvedStart),
    );

    expect(form).toContain('setSubmitError("")');
    expect(source).toContain("Boolean(submitError)");
    expect(rejectionHandling).toContain("setBookingAttempt(null)");
    expect(rejectionHandling).toContain("outcomeUnconfirmed: false");
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
