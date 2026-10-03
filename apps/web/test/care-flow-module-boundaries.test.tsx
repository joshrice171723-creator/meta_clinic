import { describe, expect, it, vi } from "vitest";
import {
  PatientSupport as RoutedPatientSupport,
  SoapNoteForm as RoutedSoapNoteForm,
  bindBookingPatient as routedBindBookingPatient,
  closeRequestKey as routedCloseRequestKey,
} from "../src/features/clinic/CareFlow";
import { SoapNoteForm } from "../src/features/clinic/CareSoapNoteWorkspace";
import { PatientSupport } from "../src/features/clinic/CarePatientHistory";
import {
  appointmentDraftRecoveryMessage,
  bindBookingPatient,
  closeFailureState,
  closeRequestKey,
  noteSaveAllowsMutation,
  noteSaveRequestBody,
  noteSaveRequestKey,
  receiptResolution,
  type AppointmentWorkingDraft,
  type BookingAttempt,
  type BookingDraft,
} from "../src/features/clinic/careFlowState";

describe("care-flow module ownership", () => {
  it("preserves the existing import surface and stable component definition", () => {
    expect(RoutedPatientSupport).toBe(PatientSupport);
    expect(RoutedSoapNoteForm).toBe(SoapNoteForm);
    expect(routedBindBookingPatient).toBe(bindBookingPatient);
    expect(routedCloseRequestKey).toBe(closeRequestKey);
    expect(noteSaveRequestKey).toBe(closeRequestKey);
  });

  it("retains an uncertain same-patient attempt but clears another patient's attempt", () => {
    const draft: BookingDraft = {
      patientId: "12",
      startsAt: "2026-10-03T10:00",
      endsAt: "2026-10-03T10:30",
      siteId: "4",
      roomId: "7",
      clinicianId: "8",
      visitTypeId: "9",
    };
    const attempt: BookingAttempt = {
      body: {
        appointment: {
          patient_id: "12",
          starts_at: draft.startsAt,
          ends_at: draft.endsAt,
          site_id: draft.siteId,
          room_id: draft.roomId,
          booked_clinician_id: draft.clinicianId,
          visit_type_id: draft.visitTypeId,
          request_key: "synthetic-booking-attempt",
        },
      },
    };
    const samePatient = bindBookingPatient(draft, attempt, true, 12);
    expect(samePatient.attempt).toBe(attempt);
    expect(samePatient.outcomeUnconfirmed).toBe(true);
    expect(appointmentDraftRecoveryMessage(samePatient)).toBeNull();

    const otherPatient = bindBookingPatient(draft, attempt, true, 13);
    expect(otherPatient).toEqual({
      draft: { ...draft, patientId: "13" },
      attempt: null,
      outcomeUnconfirmed: false,
    });
    expect(draft.patientId).toBe("12");
  });

  it("keeps recovery messaging separate from unresolved hold and series attempts", () => {
    const working: AppointmentWorkingDraft = {
      draft: {
        patientId: "12",
        startsAt: "2026-10-03T10:00",
        endsAt: "2026-10-03T10:30",
        siteId: "4",
        roomId: "7",
        clinicianId: "8",
        visitTypeId: "9",
      },
      attempt: null,
      outcomeUnconfirmed: false,
    };
    expect(appointmentDraftRecoveryMessage(working)).toContain(
      "Recovered appointment draft",
    );
    expect(
      appointmentDraftRecoveryMessage({
        ...working,
        holdOutcomeUnconfirmed: true,
      }),
    ).toBeNull();
    expect(
      appointmentDraftRecoveryMessage({
        ...working,
        seriesOutcomeUnconfirmed: true,
      }),
    ).toBeNull();
  });

  it("keeps an unknown note mutation bound to its original request and explicit reconciliation", () => {
    const create = vi.fn(() => "synthetic-note-attempt");
    const key = noteSaveRequestKey(null, create);
    const body = noteSaveRequestBody(
      "notes.revise",
      { sections: { plan: "Synthetic draft" } },
      key,
      3,
    );
    expect(noteSaveRequestKey(key, create)).toBe(key);
    expect(create).toHaveBeenCalledTimes(1);
    expect(body).toEqual({
      revision: {
        sections: { plan: "Synthetic draft" },
        expected_revision: 3,
        request_key: key,
      },
    });
    expect(closeFailureState(503)).toBe("outcome_unconfirmed");
    expect(receiptResolution(200, "outcome_unconfirmed")).toBe(
      "outcome_unconfirmed",
    );
    expect(noteSaveAllowsMutation("outcome_unconfirmed")).toBe(false);
    expect(noteSaveAllowsMutation("reconciling")).toBe(false);
    expect(receiptResolution(404)).toBe("not_found");
  });
});
