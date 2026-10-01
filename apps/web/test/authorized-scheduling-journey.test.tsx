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
        .getByLabel("Starts", { exact: true })
        .fill(fixture.starts_at.slice(0, 16));
      await page
        .getByLabel("Ends", { exact: true })
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
