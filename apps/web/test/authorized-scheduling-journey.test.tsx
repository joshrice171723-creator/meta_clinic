import { it, expect } from "vitest";
import {
  launchRealBrowser,
  loginReal,
  readRealFixture,
  realGet,
  realMutation,
  realStackEnabled,
  realUrl,
  selectReal,
  type RealFixture,
} from "./support/authorizedRealStack";

type SchedulingFixture = RealFixture & {
  scheduling_scenarios: {
    candidate_membership_id: number;
    candidate_name: string;
    department_code: string;
  };
};

it.skipIf(!realStackEnabled)(
  "#31/#96 actual activated clinician booking calendar and Front Desk cancellation persist through reload",
  async () => {
    const fixture = readRealFixture<SchedulingFixture>();
    const browser = await launchRealBrowser();
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      timezoneId: "UTC",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const schedule = `/clinic/schedule?day=${fixture.day}&month=${fixture.day.slice(0, 7)}&view=day&site_id=${fixture.site_id}&patient_id=${fixture.patient_id}`;
    try {
      await loginReal(page, fixture, schedule);
      await page
        .getByRole("button", { name: "Book appointment", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Schedule an appointment", exact: true })
        .waitFor();
      await page
        .getByRole("combobox", { name: "Booked clinician", exact: true })
        .click();
      expect(
        await page
          .getByRole("option", {
            name: fixture.scheduling_scenarios.candidate_name,
            exact: true,
          })
          .count(),
      ).toBe(0);
      await page.keyboard.press("Escape");
      await page
        .getByRole("link", { name: "Set up clinicians", exact: true })
        .click();
      await page
        .getByRole("heading", {
          name: "Clinicians for scheduling",
          exact: true,
        })
        .waitFor();
      const setup = await realGet<{
        candidates: { membership_id: number; label: string }[];
      }>(page, "/api/clinic/clinicians?setup=true");
      const candidate = setup.candidates.find(
        (row) =>
          row.membership_id ===
          fixture.scheduling_scenarios.candidate_membership_id,
      );
      expect(candidate).toBeDefined();
      await selectReal(page, "Clinician account", candidate!.label);
      await page
        .getByRole("textbox", { name: /^Clinician display name/ })
        .fill(fixture.scheduling_scenarios.candidate_name);
      await selectReal(page, "Clinician location", fixture.site_name);
      await selectReal(
        page,
        "Clinical department",
        fixture.scheduling_scenarios.department_code,
      );
      const created = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/clinic/clinicians" &&
          response.request().method() === "POST",
      );
      await page
        .getByRole("button", {
          name: "Add clinician to scheduling",
          exact: true,
        })
        .click();
      const createdResponse = await created;
      expect(createdResponse.status()).toBe(201);
      const clinicianId = (await createdResponse.json()).clinician.id as number;
      const capacity = await realMutation(page, "/api/clinic/capacity", {
        capacity: {
          request_key: `synthetic-native-31-capacity-${clinicianId}`,
          site_id: fixture.site_id,
          clinician_id: clinicianId,
          kind: "weekly",
          weekday: new Date(`${fixture.day}T12:00:00Z`).getUTCDay(),
          start_minute: 480,
          end_minute: 1020,
        },
      });
      expect(capacity.status()).toBe(201);
      await page.goto(realUrl(schedule));
      await page
        .getByRole("button", { name: "Book appointment", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Change patient", exact: true })
        .waitFor();
      await selectReal(
        page,
        "Booked clinician",
        fixture.scheduling_scenarios.candidate_name,
      );
      await selectReal(page, "Visit type", fixture.visit_type_code);
      await page
        .getByRole("textbox", { name: /^Starts(?:\s*\*)?$/ })
        .fill(fixture.starts_at.slice(0, 16));
      await page
        .getByRole("textbox", { name: /^Ends(?:\s*\*)?$/ })
        .fill(fixture.ends_at.slice(0, 16));
      const booked = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/clinic/appointments" &&
          response.request().method() === "POST",
      );
      await page
        .getByRole("button", { name: "Schedule appointment", exact: true })
        .click();
      const bookedResponse = await booked;
      expect(bookedResponse.status()).toBe(201);
      const appointmentId = (await bookedResponse.json()).appointment
        .id as number;
      const readback = await realGet<{
        appointment: {
          booked_clinician_id: number;
          starts_at: string;
          ends_at: string;
          status: string;
        };
      }>(page, `/api/clinic/appointments/${appointmentId}`);
      expect(readback.appointment.booked_clinician_id).toBe(clinicianId);
      expect(Date.parse(readback.appointment.starts_at)).toBe(
        Date.parse(fixture.starts_at),
      );
      expect(Date.parse(readback.appointment.ends_at)).toBe(
        Date.parse(fixture.ends_at),
      );
      await page.reload();
      const row = page
        .getByRole("button")
        .filter({ hasText: fixture.patient_name });
      await row.waitFor();
      expect(await row.innerText()).toContain(
        fixture.scheduling_scenarios.candidate_name,
      );
      await page.goto(
        realUrl(
          `/clinic/front-desk?date=${fixture.day}&site_id=${fixture.site_id}`,
        ),
      );
      const queueRow = page
        .locator(".front-desk-row")
        .filter({ hasText: fixture.patient_name });
      await queueRow.waitFor();
      await queueRow
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      expect(
        await dialog
          .getByRole("button", { name: "Cancel appointment", exact: true })
          .isDisabled(),
      ).toBe(true);
      await dialog
        .getByRole("checkbox", {
          name: "I understand that no cancellation message will be sent automatically.",
          exact: true,
        })
        .check();
      const cancellation = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
            `/api/clinic/appointments/${appointmentId}/transition` &&
          response.request().method() === "POST",
      );
      await dialog
        .getByRole("button", { name: "Cancel appointment", exact: true })
        .click();
      const cancelledResponse = await cancellation;
      expect(cancelledResponse.status()).toBe(200);
      expect(cancelledResponse.request().postDataJSON()).toEqual({
        transition: {
          to: "cancelled",
          expected_status: "scheduled",
          cancellation_message_acknowledged: true,
        },
      });
      await expect
        .poll(
          async () =>
            (
              await realGet<{ appointment: { status: string } }>(
                page,
                `/api/clinic/appointments/${appointmentId}`,
              )
            ).appointment.status,
        )
        .toBe("cancelled");
      await page.reload();
      await page
        .getByRole("heading", { name: "Day queue", exact: true })
        .waitFor();
      expect(
        (
          await realGet<{ appointment: { status: string } }>(
            page,
            `/api/clinic/appointments/${appointmentId}`,
          )
        ).appointment.status,
      ).toBe("cancelled");
      expect(
        await page
          .getByText("The schedule confirms that the action was not applied.", {
            exact: true,
          })
          .count(),
      ).toBe(0);
      await page.goto(realUrl(schedule));
      await expect
        .poll(() =>
          page
            .getByRole("button")
            .filter({ hasText: fixture.patient_name })
            .innerText(),
        )
        .toMatch(/cancelled/i);
    } finally {
      await browser.close();
    }
  },
  120000,
);

it.skipIf(!realStackEnabled)(
  "#212 actual checked-in appointment resolves through recorded encounter completion and reload",
  async () => {
    const fixture = readRealFixture<SchedulingFixture & { scheduling_scenarios: { resolution_patient_id: number; resolution_patient_name: string } }>();
    const patientId = fixture.scheduling_scenarios.resolution_patient_id;
    const patientName = fixture.scheduling_scenarios.resolution_patient_name;
    expect(patientId).toBeGreaterThan(0);
    const browser = await launchRealBrowser();
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "UTC" });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const schedule = `/clinic/schedule?day=${fixture.day}&month=${fixture.day.slice(0, 7)}&view=day&site_id=${fixture.site_id}`;
    try {
      await loginReal(page, fixture, schedule);
      const setup = await realMutation(page, "/api/clinic/appointments", { appointment: {
        request_key: `synthetic-212-${patientId}`, patient_id: patientId, site_id: fixture.site_id,
        booked_clinician_id: fixture.clinician_id, room_id: fixture.room_id,
        visit_type_id: fixture.visit_type_id, visit_modality: "in_person",
        starts_at: fixture.starts_at, ends_at: fixture.ends_at,
      } });
      expect(setup.status()).toBe(201);
      const appointmentId = (await setup.json()).appointment.id as number;
      await page.goto(realUrl(`/clinic/front-desk?date=${fixture.day}&site_id=${fixture.site_id}`));
      const queueRow = page.locator(".front-desk-row").filter({ hasText: patientName });
      await queueRow.getByRole("button", { name: "Check in", exact: true }).click();
      const checkin = page.waitForResponse(response => new URL(response.url()).pathname === `/api/clinic/patients/${patientId}/encounters` && response.request().method() === "POST");
      await page.getByRole("dialog", { name: "Check in patient", exact: true }).getByRole("button", { name: "Check in", exact: true }).click();
      const checkinResponse = await checkin;
      expect(checkinResponse.status()).toBe(201);
      const encounterId = (await checkinResponse.json()).encounter.id as number;
      const checked = await realGet<{ appointment: { status: string; encounter_id: number; encounter_status: string } }>(page, `/api/clinic/appointments/${appointmentId}`);
      expect(checked.appointment.status).toBe("scheduled");
      expect(checked.appointment.encounter_status).toBe("open");
      expect(checked.appointment.encounter_id).toBe(encounterId);
      await page.goto(realUrl(schedule));
      await page.getByRole("button").filter({ hasText: patientName }).click();
      const appointmentDialog = page.getByRole("dialog");
      expect(await appointmentDialog.getByRole("button", { name: "Cancel appointment", exact: true }).isDisabled()).toBe(true);
      await appointmentDialog.getByText("This visit has already started. Appointment cancellation is unavailable. Review the encounter to record the visit outcome.", { exact: true }).waitFor();
      await appointmentDialog.getByRole("link", { name: "Open encounter", exact: true }).click();
      await selectReal(page, "Follow-up status", "No follow-up required");
      const followup = page.waitForResponse(response => new URL(response.url()).pathname.includes(`/encounters/${encounterId}/follow_up`) && response.request().method() === "PUT");
      await page.getByRole("button", { name: "Save follow-up", exact: true }).click();
      expect((await followup).ok()).toBe(true);
      await selectReal(page, "Recorded visit outcome", "Patient left before completion");
      await selectReal(page, "Written instructions", "Unable to provide written instructions");
      await selectReal(page, "Education and teach-back", "Unable to complete education");
      await page.getByLabel("Completion exception note", { exact: true }).fill("Synthetic patient left before the planned visit could be completed; unfinished work reviewed.");
      await page.getByRole("checkbox", { name: "I reviewed the current owner or pool for every unfinished item. These tasks remain open after encounter completion.", exact: true }).check();
      await page.getByRole("button", { name: "Complete encounter", exact: true }).click();
      const close = page.waitForResponse(response => new URL(response.url()).pathname === `/api/clinic/encounters/${encounterId}/close` && response.request().method() === "POST");
      await page.getByRole("dialog", { name: "Complete encounter?", exact: true }).getByRole("button", { name: "Confirm completion", exact: true }).click();
      expect((await close).ok()).toBe(true);
      const readCompleted = async () => {
        const encounter = await realGet<{ encounter: { status: string } }>(page, `/api/clinic/encounters/${encounterId}`);
        const appointment = await realGet<{ appointment: { status: string; encounter_id: number } }>(page, `/api/clinic/appointments/${appointmentId}`);
        expect(encounter.encounter.status).toBe("completed");
        expect(appointment.appointment.encounter_id).toBe(encounterId);
        expect(appointment.appointment.status).toBe("completed");
      };
      await readCompleted();
      await page.reload();
      await readCompleted();
      await page.goto(realUrl(schedule));
      await expect.poll(() => page.getByRole("button").filter({ hasText: patientName }).innerText()).toMatch(/completed/i);
      await page.reload();
      await expect.poll(() => page.getByRole("button").filter({ hasText: patientName }).innerText()).toMatch(/completed/i);
    } finally {
      await browser.close();
    }
  },
  120000,
);


type AvailabilityFixture = SchedulingFixture & { availability_scenarios: {
  site_id: number; site_name: string; clinician_id: number; clinician_name: string;
  room_id: number; room_name: string; patient_id: number; patient_name: string;
  day: string; no_slot_day: string; draft_patient_id: number; draft_patient_name: string;
} };

it.skipIf(!realStackEnabled)(
  "#179/#184 actual empty resource activity does not bypass capacity and rejected booking creates no phantom",
  async () => {
    const fixture = readRealFixture<AvailabilityFixture>();
    const a = fixture.availability_scenarios;
    const scoped = { ...fixture, site_id: a.site_id, site_name: a.site_name };
    const browser = await launchRealBrowser();
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "UTC" });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const schedule = `/clinic/schedule?day=${a.day}&month=${a.day.slice(0,7)}&view=day&site_id=${a.site_id}&patient_id=${a.patient_id}`;
    const readAppointments = () => realGet<{ appointments: { id: number; starts_at: string; ends_at: string; booked_clinician_id: number; site_id: number }[] }>(page, `/api/clinic/appointments?patient_id=${a.patient_id}`);
    try {
      await loginReal(page, scoped, schedule);
      expect((await readAppointments()).appointments).toEqual([]);
      await page.getByRole("button", { name: "Book appointment", exact: true }).click();
      await page.getByRole("button", { name: "Change patient", exact: true }).waitFor();
      await selectReal(page, "Booked clinician", a.clinician_name);
      await selectReal(page, "Visit type", fixture.visit_type_code);
      await page.getByRole("textbox", { name: /^Starts(?:\s*\*)?$/ }).fill(`${a.day}T10:00`);
      await page.getByRole("textbox", { name: /^Ends(?:\s*\*)?$/ }).fill(`${a.day}T10:30`);
      await page.getByText(`No scheduled appointments use the selected resource on ${a.day}. Clinician assignment, capacity templates, and site hours are checked when you schedule.`, { exact: true }).waitFor();
      const rejected = page.waitForResponse(response => new URL(response.url()).pathname === "/api/clinic/appointments" && response.request().method() === "POST");
      await page.getByRole("button", { name: "Schedule appointment", exact: true }).click();
      const response = await rejected;
      expect(response.status()).toBe(422);
      const attempted = response.request().postDataJSON().appointment;
      expect(Date.parse(attempted.starts_at)).toBe(Date.parse(`${a.day}T10:00:00Z`));
      expect(Date.parse(attempted.ends_at)).toBe(Date.parse(`${a.day}T10:30:00Z`));
      expect(Number(attempted.patient_id)).toBe(a.patient_id);
      expect(Number(attempted.booked_clinician_id)).toBe(a.clinician_id);
      await page.getByText("This time is outside the clinician's capacity template for this site.", { exact: true }).waitFor();
      expect(await page.getByRole("button", { name: "Schedule appointment", exact: true }).isDisabled()).toBe(true);
      expect((await readAppointments()).appointments).toEqual([]);
      await page.getByRole("textbox", { name: /^Starts(?:\s*\*)?$/ }).fill(`${a.day}T08:00`);
      await page.getByRole("textbox", { name: /^Ends(?:\s*\*)?$/ }).fill(`${a.day}T08:30`);
      const accepted = page.waitForResponse(response => new URL(response.url()).pathname === "/api/clinic/appointments" && response.request().method() === "POST");
      await page.getByRole("button", { name: "Schedule appointment", exact: true }).click();
      expect((await accepted).status()).toBe(201);
      const readback = (await readAppointments()).appointments;
      expect(readback).toHaveLength(1);
      expect(Date.parse(readback[0].starts_at)).toBe(Date.parse(`${a.day}T08:00:00Z`));
      expect(Date.parse(readback[0].ends_at)).toBe(Date.parse(`${a.day}T08:30:00Z`));
      expect(readback[0].booked_clinician_id).toBe(a.clinician_id);
      expect(readback[0].site_id).toBe(a.site_id);
      await page.reload();
      expect((await readAppointments()).appointments).toEqual(readback);
      await page.getByRole("button").filter({ hasText: a.patient_name }).waitFor();
    } finally { await browser.close(); }
  },
  120000,
);
