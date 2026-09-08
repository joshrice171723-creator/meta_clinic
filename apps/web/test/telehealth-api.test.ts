import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCsrf, loginDestination } from "../src/api/client";
import {
  addParticipant,
  endVisit,
  loadPatientVisit,
  loadTelehealthQueue,
  loadVisit,
  recordPatientScribeConsent,
  removeParticipant,
  requestPatientJoinGrant,
  requestStaffJoinGrant,
  resumeVisit,
} from "../src/features/telehealth/api";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const envelope = {
  data: { visit: { public_id: "visit-1" } },
  as_of: "2026-09-08T12:00:00Z",
  version: 7,
  allowed_actions: [],
};

beforeEach(() => clearCsrf());
afterEach(() => vi.unstubAllGlobals());

async function captureRequest<T>(action: () => Promise<T>) {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(json({ csrf_token: "csrf-for-test" }))
    .mockResolvedValueOnce(json(envelope));
  vi.stubGlobal("fetch", fetch);
  const response = await action();
  return {
    response,
    path: fetch.mock.calls[1][0] as string,
    init: fetch.mock.calls[1][1],
  };
}

describe("telehealth API routes and envelopes", () => {
  it("preserves the queue envelope and exact contextual lookup filters", async () => {
    const query = new URLSearchParams({
      patient_id: "41",
      encounter_id: "73",
      limit: "1",
    });
    const { response, path, init } = await captureRequest(() =>
      loadTelehealthQueue(query),
    );

    expect(path).toBe(
      "/api/clinic/telehealth/visits?patient_id=41&encounter_id=73&limit=1",
    );
    expect(init).toMatchObject({
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    });
    expect(response).toEqual(envelope);
  });

  it("keeps staff and patient detail routes separate and encodes visit IDs", async () => {
    const staff = await captureRequest(() => loadVisit("visit/with space"));
    clearCsrf();
    const patient = await captureRequest(() =>
      loadPatientVisit("visit/with space"),
    );

    expect(staff.path).toBe(
      "/api/clinic/telehealth/visits/visit%2Fwith%20space",
    );
    expect(patient.path).toBe(
      "/api/patient_portal/telehealth/visits/visit%2Fwith%20space",
    );
  });

  it("sends versioned staff actions with caller-owned request keys", async () => {
    const added = await captureRequest(() =>
      addParticipant("visit-1", 7, 29, "add-key"),
    );
    clearCsrf();
    const removed = await captureRequest(() =>
      removeParticipant("visit-1", "participant/2", 8, "remove-key"),
    );
    clearCsrf();
    const resumed = await captureRequest(() =>
      resumeVisit("visit-1", 9, "resume-key"),
    );
    clearCsrf();
    const ended = await captureRequest(() =>
      endVisit("visit-1", 10, "end-key"),
    );

    expect(added.path).toBe(
      "/api/clinic/telehealth/visits/visit-1/participants",
    );
    expect(JSON.parse(added.init.body)).toEqual({
      request_key: "add-key",
      expected_version: 7,
      membership_id: 29,
    });
    expect(removed.path).toBe(
      "/api/clinic/telehealth/visits/visit-1/participants/participant%2F2/remove",
    );
    expect(JSON.parse(removed.init.body)).toEqual({
      request_key: "remove-key",
      expected_version: 8,
    });
    expect(resumed.path).toBe("/api/clinic/telehealth/visits/visit-1/resume");
    expect(JSON.parse(resumed.init.body)).toEqual({
      request_key: "resume-key",
      expected_version: 9,
    });
    expect(ended.path).toBe("/api/clinic/telehealth/visits/visit-1/end");
    expect(JSON.parse(ended.init.body)).toEqual({
      request_key: "end-key",
      expected_version: 10,
    });
  });

  it("keeps provider grants role-scoped and does not put a token in a URL", async () => {
    const staff = await captureRequest(() =>
      requestStaffJoinGrant("visit-1", 7, "staff-grant-key"),
    );
    clearCsrf();
    const patient = await captureRequest(() =>
      requestPatientJoinGrant("visit-1", 8, "patient-grant-key"),
    );

    expect(staff.path).toBe("/api/clinic/telehealth/visits/visit-1/join_grant");
    expect(patient.path).toBe(
      "/api/patient_portal/telehealth/visits/visit-1/join_grant",
    );
    expect(JSON.parse(staff.init.body)).toEqual({
      request_key: "staff-grant-key",
      expected_version: 7,
    });
    expect(JSON.parse(patient.init.body)).toEqual({
      request_key: "patient-grant-key",
      expected_version: 8,
    });
    expect(staff.path).not.toContain("token");
    expect(patient.path).not.toContain("token");
  });

  it("nests patient Scribe consent authority exactly as the controller expects", async () => {
    const request = await captureRequest(() =>
      recordPatientScribeConsent("visit-1", 11, "accepted", "scribe-key"),
    );

    expect(request.path).toBe(
      "/api/patient_portal/telehealth/visits/visit-1/scribe_consent",
    );
    expect(JSON.parse(request.init.body)).toEqual({
      consent: {
        decision: "accepted",
        request_key: "scribe-key",
        expected_version: 11,
      },
    });
  });
});

describe("telehealth application routes", () => {
  it("preserves valid telehealth destinations across authentication", () => {
    const visitId = "11111111-1111-4111-8111-111111111111";
    for (const path of [
      "/clinic/telehealth",
      "/clinic/settings/telehealth",
      `/clinic/telehealth/${visitId}`,
      "/clinic/patients/41/encounters/73/telehealth",
      `/patient-portal/telehealth/${visitId}`,
    ])
      expect(loginDestination(path)).toBe(path);

    expect(loginDestination("/clinic/telehealth/not-a-visit-id")).toBe(
      "/portal",
    );
    expect(
      loginDestination(`/patient-portal/telehealth/${visitId}/extra`),
    ).toBe("/portal");
  });
});
