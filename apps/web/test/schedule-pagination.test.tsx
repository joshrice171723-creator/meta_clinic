import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Appointment,
  ClinicWorkspaceContext,
  Pagination,
} from "../src/api/contracts";
import { Schedule, ScheduleView } from "../src/features/clinic/CareFlow";

const hooks = vi.hoisted(() => ({
  refresh: vi.fn(),
  setPage: vi.fn(),
  useClinic: vi.fn(),
  useResource: vi.fn(),
  useState: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useState: hooks.useState };
});

vi.mock("../src/shared/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/shared/ui")>();
  return { ...actual, useResource: hooks.useResource };
});

vi.mock("../src/features/clinic/Workspace", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/features/clinic/Workspace")>();
  return { ...actual, useClinic: hooks.useClinic };
});

const clinicContext = {
  schema_version: "clinic-context-v1",
  user_id: 1,
  practice: {
    id: 1,
    name: "Test clinic",
    timezone: "America/Chicago",
  },
  membership_id: 1,
  current_clinician_profile_id: "profile-1",
  credentials: ["NP"],
  policy_version: "clinic-authorization-v1",
  capabilities: {
    appointments: true,
    appointments_read: true,
    appointments_book: true,
    patients: true,
  },
  current_site: null,
  sites: [{ id: 1, code: "MAIN", timezone_override: null }],
} as ClinicWorkspaceContext;

const serverAppointment: Appointment = {
  id: 202,
  patient_id: 22,
  site_id: 1,
  room_id: null,
  booked_clinician_id: 4,
  visit_type_id: 3,
  starts_at: "2026-09-10T16:00:00Z",
  ends_at: "2026-09-10T16:30:00Z",
  status: "scheduled",
  encounter_id: null,
  patient: { id: 22, display_name: "Jordan Lee", reference: "PAT-022" },
};

const createdAppointment: Appointment = {
  ...serverAppointment,
  id: 301,
  patient_id: 31,
  patient: { id: 31, display_name: "Casey Morgan", reference: "PAT-031" },
};

const serverPagination: Pagination = {
  page: 2,
  per_page: 1,
  total: 3,
  total_pages: 3,
};

describe("schedule pagination after appointment creation", () => {
  beforeEach(() => {
    hooks.refresh.mockReset();
    hooks.setPage.mockReset();
    hooks.useClinic.mockReset().mockReturnValue(clinicContext);
    hooks.useState
      .mockReset()
      .mockImplementation((initialValue: unknown) =>
        initialValue === undefined
          ? [createdAppointment, vi.fn()]
          : [2, hooks.setPage],
      );
    hooks.useResource.mockReset().mockReturnValue({
      data: {
        appointments: [serverAppointment],
        pagination: serverPagination,
      },
      refresh: hooks.refresh,
    });
  });

  it("keeps the requested server page authoritative and refreshes it after create", () => {
    const view = Schedule({ search: "" });
    const props = view.props as ComponentProps<typeof ScheduleView>;

    expect(view.type).toBe(ScheduleView);
    expect(hooks.useResource).toHaveBeenCalledWith(
      "/api/clinic/appointments?page=2",
      { retainDataOnRefresh: true },
    );
    expect(props.appointments).toEqual([serverAppointment]);
    expect(props.pagination).toEqual(serverPagination);

    props.onAppointmentCreated?.(createdAppointment);

    expect(hooks.refresh).toHaveBeenCalledTimes(1);
    expect(props.appointments).toEqual([serverAppointment]);
    expect(props.pagination.total).toBe(3);
  });
});
