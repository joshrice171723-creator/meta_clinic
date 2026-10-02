import { describe, expect, it } from "vitest";
import type {
  ClinicalTask,
  ClinicWorkspaceContext,
  EncounterDetail,
} from "../src/api/contracts";
import {
  launchRealBrowser,
  loginReal,
  readRealFixture,
  realGet,
  realStackEnabled,
  realUrl,
  type RealFixture,
} from "./support/authorizedRealStack";

type WorkItemFixture = RealFixture & {
  note_scenarios: { open_encounter_id: number };
  // Required seed extension; this is not assumed to exist in an older fixture.
  work_inbox_scenarios: { clinical_task_id: number };
};
type WorkItem = ClinicalTask & { encounter_href: string | null };

describe.skipIf(!realStackEnabled)("#187 actual work-item location continuity", () => {
  it.each(["/clinic/work", "/clinic/operations"])(
    "keeps the actor, organization and site from %s through encounter load and reload",
    async (route) => {
      const fixture = readRealFixture<WorkItemFixture>();
      expect(
        Number.isSafeInteger(fixture.work_inbox_scenarios?.clinical_task_id),
        "Export the reviewed synthetic work-item seed before running #187",
      ).toBe(true);
      expect(fixture.work_inbox_scenarios.clinical_task_id).toBeGreaterThan(0);
      expect(Number.isSafeInteger(fixture.note_scenarios?.open_encounter_id)).toBe(true);
      const browser = await launchRealBrowser();
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        timezoneId: "UTC",
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      try {
        await loginReal(page, fixture, route);
        const assertContext = async () => {
          const session = await realGet<{ user: { id: number } }>(page, "/api/session");
          const workspace = await realGet<ClinicWorkspaceContext>(page, "/api/clinic/context");
          expect(session.user.id).toBe(fixture.actor_user_id);
          expect(workspace.user_id).toBe(fixture.actor_user_id);
          expect(workspace.membership_id).toBe(fixture.membership_id);
          expect(workspace.practice.id).toBe(fixture.practice_id);
          expect(workspace.current_site?.id).toBe(fixture.site_id);
          expect(
            workspace.practices?.find((item) => item.id === fixture.practice_id)?.organization?.id,
          ).toBe(fixture.organization_id);
          expect(new URL(page.url()).pathname).not.toBe("/login");
          expect(await page.getByRole("heading", { name: "Session locked", exact: true }).count()).toBe(0);
          expect(await page.locator(".clinic-shell").isVisible()).toBe(true);
        };
        await assertContext();

        const work = await realGet<{ clinical_tasks: WorkItem[] }>(
          page,
          `/api/clinic/operations/follow_ups?filter=all&site_id=${fixture.site_id}`,
        );
        const task = work.clinical_tasks.find(
          (item) => item.id === fixture.work_inbox_scenarios.clinical_task_id,
        );
        expect(task, "The seeded work item must be visible in the actual same-site first page").toBeDefined();
        if (!task?.encounter_href) throw new Error("The actual task has no encounter link");
        expect(task.task_kind).toBe("record_request");
        expect(task.source_type).toBe("manual");
        expect(task.state).toBe("open");
        expect(task.site_id).toBe(fixture.site_id);
        expect(task.patient_id).toBe(fixture.patient_id);
        expect(task.encounter_id).toBe(fixture.note_scenarios.open_encounter_id);
        const target = new URL(task.encounter_href, realUrl("/"));
        expect(target.origin).toBe(new URL(realUrl("/")).origin);
        expect(target.pathname).toBe(
          `/clinic/patients/${fixture.patient_id}/encounters/${task.encounter_id}`,
        );
        expect(target.hash).toBe("#nurse-workspace");

        // Click the actual card anchor supplied by Rails; no direct encounter navigation.
        const link = page.locator(`a[href=${JSON.stringify(task.encounter_href)}]`).filter({
          hasText: /^Open work item$/,
        });
        await expect.poll(() => link.count()).toBe(1);
        await link.waitFor({ state: "visible" });
        await link.click();
        await expect.poll(() => new URL(page.url()).pathname).toBe(target.pathname);
        expect(new URL(page.url()).hash).toBe("#nurse-workspace");

        const encounterPath =
          `/api/clinic/encounters/${task.encounter_id}?patient_id=${fixture.patient_id}`;
        for (let load = 0; load < 2; load += 1) {
          const nurse = page.locator("#nurse-workspace");
          await nurse.waitFor({ state: "visible" });
          const identity = page.locator("#chart-access").getByRole("button", {
            name: /^Confirm and (open chart|begin charting|view signed chart)$/,
          });
          await identity.waitFor({ state: "visible" });
          await assertContext();
          const encounter = await realGet<{ encounter: EncounterDetail }>(page, encounterPath);
          expect(encounter.encounter.id).toBe(task.encounter_id);
          expect(encounter.encounter.patient_id).toBe(fixture.patient_id);
          expect(String(encounter.encounter.site_id)).toBe(String(fixture.site_id));
          expect(encounter.encounter.status).toBe("open");
          expect(await page.getByLabel("Current patient", { exact: true }).innerText()).toContain(
            fixture.site_name || fixture.site_code,
          );
          // Existing local identity gate only; no chart editing, signing or task transition.
          await identity.click();
          await page.locator("#chart-context").waitFor({ state: "visible" });
          await assertContext();
          if (load === 0) {
            await page.reload();
            await expect.poll(() => new URL(page.url()).pathname).toBe(target.pathname);
            expect(new URL(page.url()).hash).toBe("#nurse-workspace");
          }
        }
      } finally {
        await context.close();
        await browser.close();
      }
    },
    90000,
  );
});
