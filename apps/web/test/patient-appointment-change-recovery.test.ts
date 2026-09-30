import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/api/client";
import {
  AppointmentChangeSubmission,
  type AppointmentChangeAcknowledgement,
} from "../src/features/patientPortal/appointmentChangeSubmission";

type Attempt = Parameters<
  ConstructorParameters<typeof AppointmentChangeSubmission>[2]
>[0];
const source = {
  id: 51,
  starts_at: "2026-10-03T10:00:00.000000Z",
  ends_at: "2026-10-03T11:00:00.000000Z",
  updated_at: "2026-09-30T20:00:00.123456Z",
  status: "scheduled",
  site: { id: 12 },
  visit_modality: "in_person",
};
const window = {
  starts_at: "2026-10-03T12:00:00.000Z",
  ends_at: "2026-10-03T13:00:00.000Z",
};
function saved(attempt: Attempt): AppointmentChangeAcknowledgement {
  return {
    id: 71,
    request_key: attempt.request_key,
    request_kind: attempt.request_kind,
    starts_at: attempt.starts_at ?? null,
    ends_at: attempt.ends_at ?? null,
    requested_modality: attempt.request_kind === "cancel" ? null : "in_person",
    source_appointment: { ...source, site: { ...source.site } },
    site: null,
    visit_type: null,
    status: "pending",
  };
}

describe("appointment change exact recovery", () => {
  it.each(["cancel", "reschedule"] as const)(
    "recovers one committed %s request without applying the appointment change",
    async (kind) => {
      const records = new Map<string, AppointmentChangeAcknowledgement>();
      let lose = true;
      const deliver = vi.fn(async (attempt: Attempt) => {
        const record = records.get(attempt.request_key) ?? saved(attempt);
        records.set(attempt.request_key, record);
        if (lose) {
          lose = false;
          throw new Error("Synthetic lost acknowledgement");
        }
        return record;
      });
      const owner = new AppointmentChangeSubmission(source, kind, deliver);
      await expect(owner.submit(window)).rejects.toThrow();
      expect(owner.outcomeUnconfirmed).toBe(true);
      expect(deliver).toHaveBeenCalledTimes(1);
      expect(await owner.submit({ starts_at: "", ends_at: "" })).toBe(true);
      expect(deliver.mock.calls[1][0]).toEqual(deliver.mock.calls[0][0]);
      expect(Object.isFrozen(deliver.mock.calls[0][0])).toBe(true);
      expect(records.size).toBe(1);
      if (kind === "cancel")
        expect(deliver.mock.calls[0][0]).not.toHaveProperty("starts_at");
      expect(source.status).toBe("scheduled");
      expect(owner.outcomeUnconfirmed).toBe(false);
    },
  );

  it.each([
    new TypeError("Synthetic network"),
    new ApiError(408, "Synthetic timeout"),
    new ApiError(503, "Synthetic unavailable"),
    new ApiError(409, "Synthetic unknown", "outcome_unconfirmed"),
  ])("retains exact reschedule across %s then later denial", async (reason) => {
    const deliver = vi
      .fn<(attempt: Attempt) => Promise<AppointmentChangeAcknowledgement>>()
      .mockRejectedValueOnce(reason)
      .mockRejectedValueOnce(new ApiError(403, "Synthetic revoked access"))
      .mockImplementation(async (attempt) => saved(attempt));
    const owner = new AppointmentChangeSubmission(
      source,
      "reschedule",
      deliver,
    );
    await expect(owner.submit(window)).rejects.toThrow();
    await expect(
      owner.submit({ ...window, ends_at: "2026-10-03T14:00:00Z" }),
    ).rejects.toThrow();
    expect(owner.outcomeUnconfirmed).toBe(true);
    await owner.submit();
    expect(deliver.mock.calls.map(([attempt]) => attempt)).toEqual(
      Array(3).fill(deliver.mock.calls[0][0]),
    );
  });

  it("allows a corrected window after initial definitive rejection", async () => {
    const deliver = vi
      .fn<(attempt: Attempt) => Promise<AppointmentChangeAcknowledgement>>()
      .mockRejectedValueOnce(new ApiError(409, "Synthetic stale source"))
      .mockImplementation(async (attempt) => saved(attempt));
    const owner = new AppointmentChangeSubmission(
      source,
      "reschedule",
      deliver,
    );
    await expect(owner.submit(window)).rejects.toThrow();
    expect(owner.outcomeUnconfirmed).toBe(false);
    await owner.submit({ ...window, ends_at: "2026-10-03T14:00:00Z" });
    expect(deliver.mock.calls[1][0].request_key).not.toBe(
      deliver.mock.calls[0][0].request_key,
    );
  });

  it.each([
    ["id", 0],
    ["request_key", "foreign-key"],
    ["request_kind", "cancel"],
    ["starts_at", "2026-10-03T12:00:00.000001Z"],
    ["ends_at", "2026-10-03T14:00:00Z"],
    ["site", { id: 1 }],
    ["visit_type", { id: 1 }],
    ["requested_modality", "video"],
    ["status", "scheduled"],
    ["source_appointment", null],
  ])("rejects mismatched %s=%s", async (field, value) => {
    const owner = new AppointmentChangeSubmission(
      source,
      "reschedule",
      async (attempt) =>
        ({
          ...saved(attempt),
          [field]: value,
        }) as AppointmentChangeAcknowledgement,
    );
    await expect(owner.submit(window)).rejects.toThrow(
      "could not be confirmed",
    );
    expect(owner.outcomeUnconfirmed).toBe(true);
  });

  it.each([
    ["id", 52],
    ["updated_at", "2026-09-30T20:00:00.123457Z"],
    ["starts_at", "2026-10-03T09:00:00Z"],
    ["ends_at", "2026-10-03T12:00:00Z"],
    ["site", { id: 14 }],
    ["status", "confirmed"],
  ])("rejects mismatched original source %s", async (field, value) => {
    const owner = new AppointmentChangeSubmission(
      source,
      "cancel",
      async (attempt) =>
        ({
          ...saved(attempt),
          source_appointment: { ...source, [field]: value },
        }) as AppointmentChangeAcknowledgement,
    );
    await expect(owner.submit()).rejects.toThrow("could not be confirmed");
  });

  it("rejects a cancellation acknowledgement carrying a reschedule window", async () => {
    const owner = new AppointmentChangeSubmission(
      source,
      "cancel",
      async (attempt) => ({ ...saved(attempt), starts_at: window.starts_at }),
    );
    await expect(owner.submit()).rejects.toThrow();
  });

  it.each(["pending", "approved", "declined", "cancelled", "expired"])(
    "accepts exact saved %s without interpreting it as a new pending request",
    async (status) => {
      const owner = new AppointmentChangeSubmission(
        source,
        "reschedule",
        async (attempt) => ({
          ...saved(attempt),
          status,
          starts_at: "2026-10-03T12:00:00.000000Z",
          source_appointment: {
            ...source,
            updated_at: "2026-09-30T20:00:00.1234560Z",
          },
        }),
      );
      expect(await owner.submit(window)).toBe(true);
    },
  );

  it("captures original source without following later live prop mutations", async () => {
    const original = { ...source, site: { ...source.site } };
    const deliver = vi.fn(async (attempt: Attempt) => saved(attempt));
    const owner = new AppointmentChangeSubmission(original, "cancel", deliver);
    original.id = 100;
    original.updated_at = "2026-10-01T00:00:00Z";
    original.site.id = 100;
    expect(await owner.submit()).toBe(true);
    expect(deliver.mock.calls[0][0].source_appointment_id).toBe(51);
  });

  it("serializes repeated handlers and rejects invalid fresh intervals", async () => {
    let acknowledge!: (saved: AppointmentChangeAcknowledgement) => void;
    const deliver = vi.fn(
      (_attempt: Attempt) =>
        new Promise<AppointmentChangeAcknowledgement>((resolve) => {
          acknowledge = resolve;
        }),
    );
    const owner = new AppointmentChangeSubmission(
      source,
      "reschedule",
      deliver,
    );
    expect(await owner.submit()).toBe(false);
    expect(
      await owner.submit({ starts_at: "invalid", ends_at: "invalid" }),
    ).toBe(false);
    expect(await owner.submit({ ...window, ends_at: window.starts_at })).toBe(
      false,
    );
    expect(
      await owner.submit({ ...window, ends_at: "2026-10-03T17:00:00Z" }),
    ).toBe(false);
    const first = owner.submit(window);
    expect(await owner.submit(window)).toBe(false);
    expect(deliver).toHaveBeenCalledTimes(1);
    acknowledge(saved(deliver.mock.calls[0][0]));
    expect(await first).toBe(true);
    expect(owner.busy).toBe(false);
  });
});
