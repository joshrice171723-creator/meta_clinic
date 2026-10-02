import { ApiError } from "../../api/client";
import type {
  ClinicRefillRequest,
  Encounter,
  PatientCareSummary,
} from "../../api/contracts";

export type RefillReviewOutcome = {
  patientMessage: string;
  reconciliationAcknowledged: boolean;
  reconciliationNote: string;
};
export type RefillReviewAttempt = Readonly<{
  request: ClinicRefillRequest;
  clinicianProfileId: string;
  body: Readonly<{
    refill_request: Readonly<{
      request_key: string;
      status: "resolved";
      decision: "approved";
      patient_message: string;
      reconciliation_acknowledged: true;
      reconciliation_note?: string;
      encounter_id: number;
    }>;
  }>;
}>;
export type RefillReviewResult = {
  attempt: RefillReviewAttempt;
  state: "saved" | "failed" | "unknown";
  message: string;
};

export function refillApprovalReady(
  request: ClinicRefillRequest,
  outcome: RefillReviewOutcome | undefined,
  summary: PatientCareSummary | undefined,
  encounters: Encounter[] | undefined,
  encounterId: number | "" | undefined,
) {
  return (
    (request.status === "pending" || request.status === "in_review") &&
    !!request.medication_name &&
    !!request.pharmacy_destination &&
    summary?.patient_id === request.patient.id &&
    !!encounters?.some(
      (encounter) =>
        encounter.id === encounterId &&
        encounter.patient_id === request.patient.id &&
        encounter.status === "open" &&
        encounter.site_id != null,
    ) &&
    !!outcome?.patientMessage.trim() &&
    outcome.patientMessage.trim().length <= 600 &&
    outcome.reconciliationNote.trim().length <= 200 &&
    outcome.reconciliationAcknowledged === true
  );
}

export function refillApprovalAttempt(
  request: ClinicRefillRequest,
  outcome: RefillReviewOutcome,
  encounterId: number,
  clinicianProfileId: string,
): RefillReviewAttempt {
  return Object.freeze({
    request: Object.freeze({
      ...request,
      patient: Object.freeze({ ...request.patient }),
    }),
    clinicianProfileId,
    body: Object.freeze({
      refill_request: Object.freeze({
        request_key: crypto.randomUUID(),
        status: "resolved" as const,
        decision: "approved" as const,
        patient_message: outcome.patientMessage.trim(),
        reconciliation_acknowledged: true as const,
        reconciliation_note: outcome.reconciliationNote.trim() || undefined,
        encounter_id: encounterId,
      }),
    }),
  });
}

// Each call is independently authorized and idempotent on the server. Never replay
// saved entries or alter an uncertain attempt when the clinician explicitly retries.
export async function submitRefillApproval(
  attempt: RefillReviewAttempt,
  send: (
    path: string,
    options: { method: "POST"; body: RefillReviewAttempt["body"] },
  ) => Promise<{ refill_request: ClinicRefillRequest }>,
  wasUnknown = false,
): Promise<RefillReviewResult> {
  try {
    const { refill_request: saved } = await send(
      `/api/clinic/refill_requests/${attempt.request.id}/transition`,
      { method: "POST", body: attempt.body },
    );
    const input = attempt.body.refill_request;
    if (
      saved?.id !== attempt.request.id ||
      saved.patient?.id !== attempt.request.patient.id ||
      saved.status !== input.status ||
      saved.decision !== input.decision ||
      saved.patient_message !== input.patient_message ||
      saved.reconciliation_acknowledged !== true ||
      (saved.reconciliation_note ?? "") !== (input.reconciliation_note ?? "") ||
      saved.source_encounter_id !== input.encounter_id ||
      !saved.medication_request_revision_id ||
      !saved.reviewed_by?.display_name ||
      saved.medication_name !== attempt.request.medication_name ||
      saved.pharmacy_destination !== attempt.request.pharmacy_destination
    ) {
      throw new ApiError(
        502,
        "The decision response could not be matched to this request.",
        "outcome_unconfirmed",
      );
    }
    return {
      attempt,
      state: "saved",
      message:
        saved.response_delivery_state === "delivered"
          ? `Approved; portal response delivered. Reviewed by ${saved.reviewed_by.display_name}. Order revision #${saved.medication_request_revision_id}.`
          : `Approved; portal delivery needs follow-up. Reviewed by ${saved.reviewed_by.display_name}. Order revision #${saved.medication_request_revision_id}.`,
    };
  } catch (reason) {
    const unknown =
      wasUnknown ||
      !(reason instanceof ApiError) ||
      reason.status === 408 ||
      reason.status >= 500 ||
      reason.code === "outcome_unconfirmed";
    return {
      attempt,
      state: unknown ? "unknown" : "failed",
      message: unknown
        ? "Outcome unconfirmed. Retry this exact decision before changing details."
        : reason instanceof Error
          ? reason.message
          : "Approval failed.",
    };
  }
}
