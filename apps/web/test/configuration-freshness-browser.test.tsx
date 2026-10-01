import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;

beforeAll(async () => {
  const virtualId = "\0configuration-freshness-entry.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "configuration-freshness-fixture",
        enforce: "pre",
        resolveId: (id) =>
          id === virtualId
            ? virtualId
            : /(?:^|\/)Workspace$/.test(id)
              ? "\0clinic-context-fixture"
              : undefined,
        load(id) {
          if (id === "\0clinic-context-fixture")
            return `export const useClinic = () => window.fixtureContext;`;
          if (id !== virtualId) return;
          return `import React from "react"; import {createRoot} from "react-dom/client";
          import {ClinicFrame} from "/src/features/clinic/ClinicFrame";
          import {ClinicScopeSelector} from "/src/features/clinic/ClinicScopeSelector";
          import {ClinicSchedule} from "/src/features/clinic/ClinicSchedule";
          import {WaitlistWorkspace} from "/src/features/clinic/WaitlistWorkspace";
          import {OperationsReportsCatalog} from "/src/features/clinic/OperationsReportsCatalog";
          const context = window.fixtureContext = {
            practice: {id: 1, name: "Synthetic clinic", timezone: "America/Chicago"},
            current_site: {id: 1, code: "SIMT", name: "Simulation Test Location"},
            sites: [{id: 1, code: "SIMT", name: "Simulation Test Location"}, {id: 2, code: "OTHER", name: "Other synthetic location"}],
            capabilities: {appointments_read: true}
          };
          const mode = new URLSearchParams(location.search).get("mode");
          if (mode === "capacity") context.capabilities.facilities_write = true;
          const root = createRoot(document.getElementById("root"));
          root.render(mode === "capacity" ? React.createElement(WaitlistWorkspace) : mode === "schedule" ? React.createElement(ClinicSchedule, {}) : mode === "reports" ? React.createElement(OperationsReportsCatalog, {capabilities: context.capabilities, siteId: 1, timezone: context.practice.timezone}) : React.createElement(ClinicFrame,
            {practiceName: context.practice.name, timezone: context.practice.timezone, navigation: null,
             scopeSelector: React.createElement(ClinicScopeSelector, {context, onPracticeChange: () => {}, onLocationChange: () => {}})}, "Synthetic content"));`;
        },
        configureServer(s) {
          s.middlewares.use(
            "/configuration-freshness-fixture",
            async (_request, response) => {
              response.setHeader("Content-Type", "text/html");
              response.end(
                await s.transformIndexHtml(
                  "/configuration-freshness-fixture",
                  '<div id="root"></div><script type="module" src="/@id/__x00__configuration-freshness-entry.tsx"></script>',
                ),
              );
            },
          );
        },
      },
    ],
  });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === "string")
    throw new Error("Missing fixture port");
  baseUrl = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || "/usr/bin/chromium",
    headless: true,
  });
}, 20000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

async function open(page: Page, mode: string) {
  const requests: string[] = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    requests.push(url.pathname + url.search);
    if (url.pathname === "/api/csrf")
      return route.fulfill({ json: { csrf_token: "synthetic" } });
    if (url.pathname === "/api/clinic/schedule_calendar")
      return route.fulfill({
        json: {
          site_id: 1,
          month: url.searchParams.get("date")!.slice(0, 7),
          timezone: "America/Chicago",
          as_of: "2026-09-28T23:41:46Z",
          days: [],
          clinicians: [],
          rooms: [],
          capacity_configured: true,
          slot_minutes: 30,
        },
      });
    return route.fulfill({
      status: 403,
      json: { error: "Synthetic denied source" },
    });
  });
  await page.goto(`${baseUrl}/configuration-freshness-fixture?mode=${mode}`);
  return requests;
}

describe("configuration labels and freshness", () => {
  it("#136 renders an unnamed capacity profile and a named saved calendar appointment through reload", async () => {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const clinicianName = "Synthetic Named Readback Clinician";
    const patientName = "Synthetic Named Readback Patient";
    const appointment = {
      id: 901,
      patient_id: 801,
      site_id: 1,
      booked_clinician_id: 9,
      room_id: null,
      starts_at: "2026-10-01T14:00:00Z",
      ends_at: "2026-10-01T14:30:00Z",
      status: "scheduled",
      calendar_status: "scheduled",
      conflict: false,
      patient: {
        id: 801,
        display_name: patientName,
        reference: "SYN-136-PATIENT",
      },
      clinician_name: clinicianName,
      room_name: null,
      visit_type_name: "Synthetic named visit",
    };
    try {
      await page.route(
        (url) => url.pathname.startsWith("/api/"),
        (route) => {
          const path = new URL(route.request().url()).pathname;
          if (path === "/api/csrf")
            return route.fulfill({ json: { csrf_token: "synthetic" } });
          if (path === "/api/clinic/waitlist")
            return route.fulfill({
              json: {
                entries: [],
                total: 0,
                ranking: "earliest",
                cancellations: [],
                sites: [{ id: 1, name: "Synthetic named site" }],
                clinicians: [{ id: 9, name: "Clinician profile #9" }],
                visit_types: [],
              },
            });
          if (path === "/api/clinic/capacity")
            return route.fulfill({
              json: {
                rules: [],
                timezone: "America/Chicago",
                site_availability: [],
                can_block: true,
              },
            });
          if (path === "/api/clinic/schedule_calendar")
            return route.fulfill({
              json: {
                site_id: 1,
                month: "2026-10",
                timezone: "America/Chicago",
                slot_minutes: 30,
                as_of: "2026-10-01T13:00:00Z",
                capacity_configured: true,
                clinicians: [{ id: 9, name: clinicianName }],
                rooms: [],
                days: [
                  {
                    date: "2026-10-01",
                    scheduled: 1,
                    confirmed: 0,
                    available: 0,
                    conflicts: 0,
                    slots: [],
                    holds: [],
                    appointments: [appointment],
                  },
                ],
              },
            });
          return route.fulfill({
            status: 404,
            json: { error: "Unexpected synthetic identity route" },
          });
        },
      );
      await page.goto(
        `${baseUrl}/configuration-freshness-fixture?mode=capacity`,
      );
      const clinician = page.getByRole("combobox", {
        name: "Clinician",
        exact: true,
      });
      await clinician.click();
      const option = page.getByRole("option", {
        name: "Clinician profile #9",
        exact: true,
      });
      expect(await option.getAttribute("data-value")).toBe("9");
      await option.click();
      await expect
        .poll(() => clinician.innerText())
        .toBe("Clinician profile #9");
      await page
        .getByRole("combobox", { name: "Rule type", exact: true })
        .click();
      await page
        .getByRole("option", { name: "Weekly hours", exact: true })
        .click();
      expect(await clinician.innerText()).toBe("Clinician profile #9");
      await page.goto(
        `${baseUrl}/configuration-freshness-fixture?mode=schedule&month=2026-10&day=2026-10-01&view=day`,
      );
      for (let read = 0; read < 2; read++) {
        const row = page.getByRole("button").filter({ hasText: patientName });
        await row.waitFor();
        expect(await row.innerText()).toContain(clinicianName);
        expect(await row.innerText()).not.toContain("Clinician not assigned");
        await row.click();
        expect(await page.getByRole("dialog").innerText()).toContain(
          clinicianName,
        );
        expect(await page.getByRole("dialog").innerText()).not.toContain(
          "Clinician not assigned",
        );
        if (read === 0) await page.reload();
      }
    } catch (error) {
      console.error(
        "#136 actual component diagnostic",
        page.url(),
        await page.locator("body").innerText(),
      );
      throw error;
    } finally {
      await page.close();
    }
  }, 20000);

  it("shows the accessible location name and identifies the clinic timezone (#10/#140)", async () => {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    await open(page, "frame");
    await expect
      .poll(() =>
        page
          .getByRole("combobox", { name: "Location", exact: true })
          .innerText(),
      )
      .toBe("Simulation Test Location");
    await page.getByRole("combobox", { name: "Location", exact: true }).click();
    expect(
      await page
        .getByRole("option", { name: "Other synthetic location" })
        .count(),
    ).toBe(1);
    await page.keyboard.press("Escape");
    expect(
      await page
        .getByText("Clinic timezone · America/Chicago", { exact: true })
        .count(),
    ).toBe(1);
    await page.close();
  });
  it("labels schedule snapshot freshness in the selected clinic timezone, independently of browser timezone (#138)", async () => {
    const page = await browser.newPage({
      timezoneId: "Asia/Tokyo",
      locale: "en-US",
      viewport: { width: 1440, height: 1000 },
    });
    await open(page, "schedule");
    const banner = page.getByText(
      /Export omits cancelled and no-show appointments/,
    );
    await expect.poll(() => banner.innerText()).toContain("Schedule as of");
    expect(await banner.innerText()).toContain("6:41:46 PM CDT");
    expect(await banner.innerText()).toContain("America/Chicago");
    expect(await banner.innerText()).not.toContain("Updated");
    await page.close();
  });
  it("accepts a typed report date and requests that date without enabling other capabilities (#51)", async () => {
    const page = await browser.newPage();
    const requests = await open(page, "reports");
    await page.getByLabel("Clinic date", { exact: true }).fill("2026-09-12");
    const submit = page.getByRole("button", {
      name: "Show report",
      exact: true,
    });
    expect(await submit.isEnabled()).toBe(true);
    await submit.click();
    await expect
      .poll(() =>
        requests.some((path) =>
          path.includes("daily_visits_by_state?date=2026-09-12&site_id=1"),
        ),
      )
      .toBe(true);
    expect(new URL(page.url()).searchParams.get("date")).toBe("2026-09-12");
    await page.close();
  });
});
