import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  bookingAvailability,
  bookingDraftHasChanges,
} from "../src/features/clinic/CareFlow";
import { clinicLandingDestination } from "../src/features/clinic/Workspace";

const source = (name: string) =>
  readFileSync(
    new URL(`../src/features/clinic/${name}`, import.meta.url),
    "utf8",
  );

describe("administrative clinic foundation", () => {
  it("only blocks navigation after the appointment draft changes", () => {
    const baseline = {
      patientId: "",
      startsAt: "2026-09-07T09:00",
      endsAt: "2026-09-07T09:30",
      siteId: "",
      roomId: "",
      clinicianId: "",
      visitTypeId: "",
    };

    expect(bookingDraftHasChanges({ ...baseline }, baseline)).toBe(false);
    expect(
      bookingDraftHasChanges({ ...baseline, patientId: "110" }, baseline),
    ).toBe(true);
    expect(
      bookingDraftHasChanges(
        { ...baseline, startsAt: "2026-09-07T10:00" },
        baseline,
      ),
    ).toBe(true);
  });

  it("maps legacy, atomic-book, and read-only scheduling capabilities", () => {
    expect(bookingAvailability({ appointments: true })).toEqual({
      visible: true,
      identityLookup: false,
    });
    expect(
      bookingAvailability({
        appointments: false,
        appointments_book: true,
        appointments_read: true,
      }),
    ).toEqual({ visible: true, identityLookup: true });
    expect(
      bookingAvailability({
        appointments: false,
        appointments_book: true,
        appointments_read: false,
      }),
    ).toEqual({ visible: false, identityLookup: false });
    expect(
      bookingAvailability({
        appointments: false,
        appointments_book: false,
        appointments_read: true,
      }),
    ).toEqual({ visible: false, identityLookup: false });
  });

  it("routes restricted clinic landings to a permitted administrative surface", () => {
    const restricted = {
      patients: false,
      patients_write: false,
      staff: false,
      inventory: false,
      appointments: false,
      appointments_read: true,
      encounters: false,
      notes_read: false,
      notes_write: false,
      documents: false,
      messages: false,
      billing: false,
      roles: false,
    };
    expect(clinicLandingDestination(restricted, "/clinic", "tracking")).toBe(
      "/clinic/front-desk",
    );
    expect(
      clinicLandingDestination(
        { ...restricted, appointments_read: false },
        "/clinic",
        "tracking",
      ),
    ).toBe("/clinic/operations");
    expect(
      clinicLandingDestination(
        { ...restricted, patients: true },
        "/clinic",
        "tracking",
      ),
    ).toBeNull();
  });
  it("uses explicit atomic capabilities and keeps check-in unavailable", () => {
    const frontDesk = source("FrontDesk.tsx");
    expect(frontDesk).toContain("bookingAvailability");
    expect(frontDesk).toContain(
      "The appointment queue is unavailable for this account.",
    );
    expect(frontDesk).not.toContain("triage");
    expect(frontDesk).not.toContain("provider assignment");
  });

  it("uses the identity-only lookup and gates invoice posting separately", () => {
    const billing = source("Billing.tsx");
    expect(billing).toContain("/api/clinic/patients/lookup");
    expect(billing).toContain("capabilities.billing_read !== true");
    expect(billing).toContain("capabilities.billing_invoice_post === true");
    expect(billing).not.toContain("payment_allocations");
    expect(billing).not.toContain("/clinic/patients/${patient.id}");
  });

  it("keeps workflow targets usable at clinic desktop and tablet widths", () => {
    const css = source("staffWorkflow.css");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("var(--clinic-border)");
  });

  it("marks every field that blocks clinician setup as required", () => {
    const setup = source("ClinicianSetup.tsx");
    for (const label of [
      "Clinician account",
      "Clinician display name",
      "Clinician location",
      "Clinical department",
    ]) {
      const labelIndex = setup.indexOf(`label="${label}"`);
      const field = setup.slice(labelIndex, labelIndex + 240);
      expect(field).toContain("required");
    }
    expect(setup).toContain("capacity limits are optional");
    expect(setup).toContain('href="/clinic/waitlist"');
  });
});
