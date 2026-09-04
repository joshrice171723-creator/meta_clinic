import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  EncounterDetail,
  EncounterNote,
  NoteTemplate,
  Patient,
} from "../src/api/contracts";
import {
  ChartQuickJump,
  closeFailureState,
  closeRequestKey,
  closeRequestBody,
  encounterCloseMatches,
  encounterHasSignedSoapNote,
  encounterNoteRefreshMatches,
  noteReceiptMatches,
  noteReconciliationMatches,
  noteSaveAllowsMutation,
  noteSaveFailureState,
  noteSaveRequestBody,
  noteSaveRequestKey,
  operationReceiptPath,
  ProviderEncounterWorkflow,
  receiptResolution,
  SoapNoteForm,
  voidChartValidation,
} from "../src/features/clinic/CareFlow";
import {
  chartSelectionProps,
  recentEncounterPath,
} from "../src/features/clinic/ChartSelectionPage";
import { encounterDetailPath } from "../src/features/clinic/CareFlow";
import {
  openSoapHref,
  previousChartHref,
} from "../src/features/clinic/chartNavigation";
import {
  formatRecordedDecimal,
  trackingBoardVisitToBoardVisit,
} from "../src/features/clinic/trackingBoardApi";
import { cliniciansForLocation } from "../src/features/clinic/trackingBoardData";
import { EXAMPLE_CARE_SUMMARIES } from "./trackingBoardCareFixtures";
import { EXAMPLE_VISITS } from "./trackingBoardFixtures";

const patient: Patient = {
  id: 7,
  display_name: "Synthetic Patient",
  reference: "SYN-007",
};

const encounter: EncounterDetail = {
  id: 9,
  patient_id: 7,
  appointment_id: null,
  site_id: "1",
  room_id: null,
  started_at: "2026-09-01T14:00:00Z",
  ended_at: null,
  status: "open",
  participants: [],
  note_ids: [],
  notes: [],
  observation_count: 0,
  document_count: 0,
};

const template: NoteTemplate = {
  id: "synthetic-soap",
  version: 1,
  label: "Synthetic SOAP template",
  note_kind: "soap",
  source_label: "Synthetic source",
  source_url: "https://example.invalid/template",
  caution: "Review every statement before saving.",
  sections: {
    subjective: "",
    objective: "",
    assessment: "",
    plan: "",
  },
};

const note: EncounterNote = {
  id: 11,
  patient_id: 7,
  encounter_id: 9,
  note_kind: "soap",
  version: 1,
  latest_revision: 1,
  signed: false,
  current_revision: {
    id: 12,
    revision_no: 1,
    author_membership_id: 4,
    payload_version: 1,
    created_at: "2026-09-02T15:00:00Z",
    signed: false,
    body: {
      schema: "soap-note-v1",
      note_kind: "soap",
      template_id: template.id,
      template_version: template.version,
      sections: {
        subjective: "Synthetic subjective",
        objective: "Synthetic objective",
        assessment: "Synthetic assessment",
        plan: "Synthetic plan",
      },
    },
  },
  revisions: [],
};

describe("provider encounter workflow", () => {
  it("routes current charts directly and unresolved board rows to selection", () => {
    expect(openSoapHref(EXAMPLE_VISITS[0])).toBe(
      "/clinic/chart-selection?mode=current&board_visit_id=EX-001",
    );
    expect(
      openSoapHref({ ...EXAMPLE_VISITS[0], patientId: 7, encounterId: 9 }),
    ).toBe("/clinic/patients/7/encounters/9");
    expect(previousChartHref(EXAMPLE_VISITS[0])).toBe(
      "/clinic/chart-selection?mode=previous&board_visit_id=EX-001",
    );
    expect(
      chartSelectionProps(
        "?mode=previous&patient_id=7&encounter_id=9&board_visit_id=EX-001",
      ),
    ).toEqual({
      mode: "previous",
      patientId: "7",
      encounterId: "9",
      boardVisitId: "EX-001",
    });
    expect(chartSelectionProps("?patient_id=oops&encounter_id=0")).toEqual({
      mode: "current",
      patientId: undefined,
      encounterId: undefined,
      boardVisitId: undefined,
    });
    expect(recentEncounterPath(7)).toBe(
      "/api/clinic/patients/7/encounters?page=1&per_page=10",
    );
    expect(encounterDetailPath(7, 9)).toBe(
      "/api/clinic/encounters/9?patient_id=7",
    );
    expect(operationReceiptPath("synthetic/close key")).toBe(
      "/api/clinic/operation_receipts/synthetic%2Fclose%20key",
    );
  });

  it("retains one synthetic close request key and sends it in the close scope", () => {
    let generated = 0;
    const first = closeRequestKey(null, () => {
      generated += 1;
      return "synthetic-close-key";
    });
    const sameAttempt = closeRequestKey(first, () => {
      generated += 1;
      return "synthetic-second-key";
    });

    expect(sameAttempt).toBe(first);
    expect(generated).toBe(1);
    expect(closeRequestBody(7, sameAttempt)).toEqual({
      close: { patient_id: 7, request_key: "synthetic-close-key" },
    });
  });

  it("keeps uncertain close outcomes explicit and never selects automatic replay", () => {
    expect(closeFailureState()).toBe("outcome_unconfirmed");
    expect(closeFailureState(503)).toBe("outcome_unconfirmed");
    expect(closeFailureState(422)).toBe("rejected");
    expect(closeFailureState(409, "Conflict.", "outcome_unconfirmed")).toBe(
      "outcome_unconfirmed",
    );
    expect(
      closeFailureState(409, "The operation outcome is unconfirmed."),
    ).toBe("outcome_unconfirmed");
    expect(closeFailureState(409, "This record changed.", "stale_record")).toBe(
      "rejected",
    );
    expect(receiptResolution(200, "outcome_unconfirmed")).toBe(
      "outcome_unconfirmed",
    );
  });

  it("retains one note save key and blocks mutation during unknown recovery", () => {
    const key = noteSaveRequestKey(null, () => "synthetic-note-save");
    expect(
      noteSaveRequestKey(key, () => "synthetic-unexpected-second-key"),
    ).toBe("synthetic-note-save");
    expect(noteSaveAllowsMutation("outcome_unconfirmed")).toBe(false);
    expect(noteSaveAllowsMutation("not_found")).toBe(false);
    expect(noteSaveFailureState()).toBe("outcome_unconfirmed");
    expect(noteSaveFailureState(503)).toBe("outcome_unconfirmed");
    expect(
      noteSaveFailureState(409, "The note operation outcome is unconfirmed."),
    ).toBe("outcome_unconfirmed");
    expect(noteSaveFailureState(409, "This record changed.")).toBe("rejected");
    expect(
      noteSaveRequestBody(
        "notes.create",
        { template_id: "synthetic-soap", template_version: 1 },
        "synthetic-note-save",
      ),
    ).toEqual({
      encounter_note: {
        note_kind: "soap",
        template_id: "synthetic-soap",
        template_version: 1,
        request_key: "synthetic-note-save",
      },
    });
    expect(
      noteSaveRequestBody(
        "notes.revise",
        { template_id: "synthetic-soap", template_version: 1 },
        "synthetic-note-save",
        2,
      ),
    ).toEqual({
      revision: {
        template_id: "synthetic-soap",
        template_version: 1,
        expected_revision: 2,
        request_key: "synthetic-note-save",
      },
    });
  });

  it("distinguishes committed receipt reconciliation from missing recovery", () => {
    expect(receiptResolution(200, "committed")).toBe("committed");
    expect(receiptResolution(404)).toBe("not_found");
    expect(receiptResolution(200, "unexpected")).toBe("outcome_unconfirmed");
  });

  it("requires an exact patient, encounter, and completed status for reconciliation", () => {
    expect(encounterCloseMatches(encounter, patient.id, encounter.id)).toBe(
      false,
    );
    expect(
      encounterCloseMatches(
        { ...encounter, status: "completed", ended_at: "2026-09-02T15:00:00Z" },
        patient.id,
        encounter.id,
      ),
    ).toBe(true);
    expect(
      encounterCloseMatches(
        { ...encounter, patient_id: 8, status: "completed" },
        patient.id,
        encounter.id,
      ),
    ).toBe(false);
    expect(
      encounterCloseMatches(
        { ...encounter, id: 10, status: "completed" },
        patient.id,
        encounter.id,
      ),
    ).toBe(false);
  });

  it("reconciles only the expected unsigned SOAP note revision and encounter", () => {
    expect(noteReconciliationMatches(note, 7, 9, 11, 1)).toBe(true);
    expect(noteReconciliationMatches(note, 8, 9, 11, 1)).toBe(false);
    expect(noteReconciliationMatches(note, 7, 10, 11, 1)).toBe(false);
    expect(noteReconciliationMatches(note, 7, 9, 12, 1)).toBe(false);
    expect(noteReconciliationMatches(note, 7, 9, 11, 2)).toBe(false);
    expect(
      encounterNoteRefreshMatches(
        {
          ...encounter,
          note_ids: [11],
          notes: [
            {
              id: 11,
              patient_id: 7,
              encounter_id: 9,
              note_kind: "soap",
              version: 1,
              latest_revision: 1,
              signed: false,
            },
          ],
        },
        7,
        9,
        11,
      ),
    ).toBe(true);
    expect(
      noteReceiptMatches(
        {
          operation_code: "notes.revise",
          outcome: "committed",
          resource_id: 11,
        },
        "notes.revise",
        11,
      ),
    ).toBe(true);
  });

  it("exposes the unsigned draft boundary and polite status semantics", () => {
    const html = renderToStaticMarkup(
      <SoapNoteForm
        encounterId={encounter.id}
        note={note}
        templates={[template]}
        canWrite
      />,
    );
    expect(html).toContain("Draft revision 1");
    expect(html).toContain("unsigned draft");
    expect(html).toContain("not an exam occurrence");
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });

  it("maps live board identity, membership, recorded vitals, and provider without deriving clinical status", () => {
    const visit = trackingBoardVisitToBoardVisit({
      id: 14,
      row_type: "encounter",
      operational_state: "unrecorded",
      patient_id: 7,
      encounter_id: 14,
      chart_status: "unopened",
      provider_assignment_available: true,
      patient: {
        id: 7,
        display_name: "Synthetic Patient",
        reference: "SYN-007",
        demographics: { age: 42, sex: "female" },
        membership: "member",
      },
      vitals: {
        blood_pressure: {
          systolic: "118.0",
          diastolic: "76.0",
          unit: "mmHg",
        },
        heart_rate: { value: "72.0", unit: "/min" },
        weight: { value: "160.50", unit: "lb" },
      },
      provider: {
        clinician_profile_id: "9007199254740993",
        display_name: "Alex Rowan, NP",
        token: "41",
      },
      encounter: {
        id: 14,
        status: "open",
        started_at: "2026-09-01T14:00:00Z",
        ended_at: null,
        site_id: "9007199254740993",
        site_code: null,
        room_id: null,
        room_code: null,
      },
      appointment: null,
      care_summary: {
        ...EXAMPLE_CARE_SUMMARIES["EX-001"],
        patient_id: 7,
        encounter_id: 14,
      },
    });
    expect(visit).toMatchObject({
      id: "encounter-14",
      patientId: 7,
      encounterId: 14,
      patientDisplayName: "Synthetic Patient",
      patientReference: "SYN-007",
      age: 42,
      gender: "F",
      stage: "unrecorded",
      membership: "member",
      arrivedAt: "2026-09-01T14:00:00Z",
      triage: {
        vitalsSummary: "Vitals recorded",
        readings: {
          bp: { value: "118/76", unit: "mmHg" },
          hr: { value: "72", unit: "/min" },
          weight: { value: "160.5", unit: "lb" },
        },
        vitalStatuses: null,
      },
      assignedClinicianId: "api-provider-9007199254740993",
      assignedProviderName: "Alex Rowan, NP",
      providerAssignmentToken: "41",
      locationId: "api-site-9007199254740993",
    });
    expect(openSoapHref(visit)).toBe("/clinic/patients/7/encounters/14");
    expect(
      cliniciansForLocation(visit.locationId, [
        {
          id: "api-provider-9007199254740993",
          firstName: "",
          lastName: "",
          credentials: "",
          displayName: "Alex Rowan, NP",
          locationIds: ["api-site-9007199254740993"],
        },
      ]),
    ).toHaveLength(1);
  });

  it("formats recorded decimals without passing through lossy JavaScript numbers", () => {
    expect(formatRecordedDecimal("9007199254740993.1234000000")).toBe(
      "9007199254740993.1234",
    );
    expect(formatRecordedDecimal("00072.0000000000")).toBe("72");
    expect(formatRecordedDecimal("not-recorded")).toBeNull();
  });

  it("maps an explicit synthetic seed scenario without treating it as inferred workflow", () => {
    const visit = trackingBoardVisitToBoardVisit({
      id: 15,
      row_type: "encounter",
      operational_state: "waiting_room",
      patient_id: 8,
      encounter_id: 15,
      chart_status: "draft",
      provider_assignment_available: true,
      patient: {
        id: 8,
        display_name: "SYN_Scenario, Casey",
        reference: "SYN-TEST-001",
      },
      encounter: {
        id: 15,
        status: "open",
        started_at: "2030-02-04T14:00:00Z",
        ended_at: null,
        site_id: "2",
        site_code: "MAIN",
        room_id: 3,
        room_code: "WAITING",
      },
      appointment: {
        id: 20,
        status: "confirmed",
        starts_at: "2030-02-04T14:00:00Z",
        ends_at: "2030-02-04T14:30:00Z",
        visit_type_code: "SYN-BOARD-ANNUAL",
        site_id: "2",
        site_code: "MAIN",
        room_id: 3,
        room_code: "WAITING",
      },
      care_summary: {
        ...EXAMPLE_CARE_SUMMARIES["EX-001"],
        patient_id: 8,
        encounter_id: 15,
      },
      synthetic_scenario: {
        stage: "waiting",
        reason: "Annual wellness",
      },
    });

    expect(visit).toMatchObject({
      stage: "waiting",
      reason: "Annual wellness",
      chiefComplaint: "Annual wellness",
      room: "WAITING",
      operationalState: "waiting_room",
    });
  });

  it("maps a scheduled appointment as expected work without inventing arrival", () => {
    const visit = trackingBoardVisitToBoardVisit({
      id: 22,
      row_type: "appointment",
      operational_state: "late",
      patient_id: 9,
      encounter_id: null,
      chart_status: "unopened",
      provider_assignment_available: false,
      patient: {
        id: 9,
        display_name: "Synthetic Scheduled Patient",
        reference: "SYN-009",
      },
      encounter: null,
      appointment: {
        id: 22,
        status: "confirmed",
        starts_at: "2026-09-02T14:00:00Z",
        ends_at: "2026-09-02T14:30:00Z",
        visit_type_code: "FOLLOW-UP",
        site_id: "4",
        site_code: "ED",
        room_id: null,
        room_code: null,
      },
      care_summary: null,
    });

    expect(visit).toMatchObject({
      id: "appointment-22",
      patientId: 9,
      encounterId: null,
      stage: "scheduled",
      room: null,
      operationalState: "late",
      arrivedAt: null,
    });
  });

  it("does not fabricate provider assignment and keeps chart content behind confirmation", () => {
    const html = renderToStaticMarkup(
      <ProviderEncounterWorkflow
        patient={patient}
        encounter={encounter}
        observations={[]}
        timezone="America/Chicago"
        noteWorkspace={<div>SOAP editor</div>}
      />,
    );
    expect(html).toContain("does not accept a handoff or assign a provider");
    expect(html).not.toContain("assigned to you");
    expect(html).toContain("Synthetic Patient");
    expect(html).toContain("Confirm and begin charting");
    expect(html).not.toContain("SOAP editor");
  });

  it("offers chart quick links to patient, HPI, and ROS anchors", () => {
    const html = renderToStaticMarkup(<ChartQuickJump />);

    expect(html).toContain('aria-label="Chart quick navigation"');
    expect(html).toContain('href="#chart-patient"');
    expect(html).toContain('href="#chart-hpi"');
    expect(html).toContain('href="#chart-ros"');
    expect(html).toContain("Quick jump");
  });

  it("keeps SOAP save reconciliation inside the confirmed chart workspace", () => {
    const source = readFileSync(
      new URL("../src/features/clinic/CareFlow.tsx", import.meta.url),
      "utf8",
    );
    const completion = source.slice(
      source.indexOf("const completeNoteSave"),
      source.indexOf("const checkSaveStatus"),
    );
    expect(completion).not.toContain("onEncounterRefresh");
  });

  it("uses view-only confirmation and copy for signed SOAP charts", () => {
    const signedEncounter: EncounterDetail = {
      ...encounter,
      status: "completed",
      ended_at: "2026-09-02T15:00:00Z",
      notes: [{ ...note, signed: true }],
    };
    expect(encounterHasSignedSoapNote(signedEncounter)).toBe(true);
    const gateHtml = renderToStaticMarkup(
      <ProviderEncounterWorkflow
        patient={patient}
        encounter={signedEncounter}
        observations={[]}
        timezone="America/Chicago"
        noteWorkspace={<div>Signed SOAP editor</div>}
      />,
    );
    expect(gateHtml).toContain("Confirm and view signed chart");
    expect(gateHtml).toContain(
      "Confirm this patient reference and encounter before viewing the signed chart.",
    );
    expect(gateHtml).not.toContain("Confirm and begin charting");

    const editorHtml = renderToStaticMarkup(
      <SoapNoteForm
        encounterId={signedEncounter.id}
        patientId={patient.id}
        note={{ ...note, signed: true }}
        templates={[template]}
        canWrite
      />,
    );
    expect(editorHtml).toContain("This exact revision is signed and read-only");
    expect(editorHtml).not.toContain("Save new revision");
    expect(editorHtml).not.toContain(
      "Template text is editable and remains unverified",
    );
    expect(editorHtml).not.toContain("This is an unsigned draft only");
  });

  it("requires both a reason and patient/visit acknowledgement to void a chart", () => {
    expect(voidChartValidation("", false)).toContain("Enter a reason");
    expect(voidChartValidation("Duplicate chart", false)).toContain(
      "acknowledge",
    );
    expect(voidChartValidation("Duplicate chart", true)).toBe("");
  });

  it("keeps the bounded draft editor free of unreviewed shortcuts", () => {
    const html = renderToStaticMarkup(
      <SoapNoteForm
        encounterId={encounter.id}
        templates={[template]}
        canWrite
      />,
    );
    expect(html).not.toContain("Quick exam entry");
    expect(html).not.toContain("Personal macros");
    expect(html).not.toContain("Apply starter text");
    expect(html).toContain("Save draft");
    expect(html).not.toContain("autosav");
  });
});
