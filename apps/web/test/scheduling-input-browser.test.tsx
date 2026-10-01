import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

let server: ViteDevServer, browser: Browser, baseUrl: string;
const patient = {
  id: 801,
  display_name: "Synthetic Browser Patient",
  reference: "BROWSER-801",
};
const appointment = {
  id: 901,
  patient_id: 801,
  site_id: 4,
  room_id: 6,
  booked_clinician_id: 9,
  starts_at: "2026-10-06T14:00:00Z",
  ends_at: "2026-10-06T14:30:00Z",
  status: "scheduled",
  calendar_status: "scheduled",
  conflict: false,
  patient,
  clinician_name: "Synthetic clinician",
  room_name: "Synthetic room",
  visit_type_name: "Synthetic visit",
};

beforeAll(async () => {
  const entry = "\0scheduling-browser-fixture.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    cacheDir: fileURLToPath(
      new URL("../../../tmp/scheduling-browser-cache", import.meta.url),
    ),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "scheduling-browser-fixture",
        resolveId: (id) => (id === entry ? entry : undefined),
        load(id) {
          if (id === entry)
            return `
          import React from "react"; import {createRoot} from "react-dom/client";
          import {Schedule} from "/src/features/clinic/CareFlow";
          import {WaitlistWorkspace} from "/src/features/clinic/WaitlistWorkspace";
          import {SchedulingTestApplication} from "/src/App";
          import {SchedulingTestAppointmentRow} from "/src/features/clinic/FrontDesk";
          function NoShowRow() {
            const [row,setRow]=React.useState(null);
            const reload=()=>fetch("/api/clinic/appointments").then(r=>r.json()).then(r=>setRow(r.appointments[0]));
            React.useEffect(()=>{reload()},[]);
            return row ? React.createElement(SchedulingTestAppointmentRow,{
              appointment:row,sites:[{id:4,code:"SYN"}],timezone:"UTC",canPatients:true,canBilling:false,
              canTransition:!new URLSearchParams(location.search).has("denied"),canStartVisit:false,
              canReschedule:false,canScheduleReplacement:false,busyAction:"",
              onStartVisit:async()=>{},onReschedule:()=>{},onTransition:async(appointment,to)=>{
                await fetch("/api/clinic/appointments/901/transition",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({transition:{to,expected_status:appointment.status}})});await reload();
              }
            }):null;
          }
          function Booking() {
            const calendar = Schedule({search:""});
            const past = new URLSearchParams(location.search).has("past");
            const missing = new URLSearchParams(location.search).has("missing");
            const [closed,setClosed] = React.useState(false);
            if(closed) return React.createElement("h1",null,"Booking closed");
            return calendar.props.renderBooking({site_id:4, clinician_id:missing?undefined:9, room_id:6,
              starts_at:past?"2026-09-01T14:00:00Z":"2026-10-06T14:00:00Z",
              ends_at:past?"2026-09-01T14:30:00Z":"2026-10-06T14:30:00Z"},()=>{},()=>{},()=>{},()=>setClosed(true));
          }
          createRoot(document.getElementById("root")).render(
            location.pathname === "/fixture/capacity" ? React.createElement(WaitlistWorkspace) :
            location.pathname === "/fixture/no-show" ? React.createElement(NoShowRow) :
            location.pathname.startsWith("/fixture") ? React.createElement(Booking) :
            React.createElement(SchedulingTestApplication,{user:{id:1},developmentAccounts:[],environment:"test",businessDate:"2026-10-01",ownerPinRequired:false})
          );`;
          if (id.endsWith("/features/clinic/Workspace.tsx"))
            return `
          import React from "react";
          import {useClinicNavigation} from "./clinicNavigation";
          export function useClinic(){return {practice:{id:1,timezone:"America/Chicago"},current_site:{id:4},
            sites:[{id:4,code:"SYN",timezone_override:"America/Chicago"}],
            capabilities:{appointments:true,appointments_book:true,appointments_read:true,patients:true,front_desk:true,appointments_status_transition:true,facilities_write:location.pathname==="/fixture/capacity",clinic_setup_write:new URLSearchParams(location.search).has("setup")}};}
          export function useClinicOverview(){return {};}
          export function Workspace({children}){const {navigate}=useClinicNavigation();return React.createElement("main",{onClick:(event)=>{
            const link=event.target.closest("a[href]"); if(link && link.getAttribute("href").startsWith("/clinic")){event.preventDefault();navigate(link.getAttribute("href"));}
          }},children);}
          export function ClinicNavigation(){return null;} export function LocationSetupNotice(){return null;}
          export function clinicLandingDestination(){return null;} export function showsClinicScopeSelector(){return false;}`;
          if (id.endsWith("/features/clinic/FrontDesk.tsx"))
            return (
              readFileSync(id, "utf8").replace(
                "export function FrontDesk()",
                "function OriginalFrontDesk()",
              ) +
              `
              export {AppointmentRow as SchedulingTestAppointmentRow};
              export function FrontDesk(){return <h1>Synthetic Front Desk destination</h1>;}`
            );
        },
        transform(code, id) {
          if (id.endsWith("/src/App.tsx"))
            return (
              code +
              "\nexport {ClinicApplication as SchedulingTestApplication};"
            );
        },
        configureServer(s) {
          s.middlewares.use(async (request, response, next) => {
            if (
              !request.url?.startsWith("/fixture") &&
              !request.url?.startsWith("/clinic/")
            )
              return next();
            response.setHeader("Content-Type", "text/html");
            response.end(
              await s.transformIndexHtml(
                request.url,
                '<div id="root"></div><script type="module" src="/@id/__x00__scheduling-browser-fixture.tsx"></script>',
              ),
            );
          });
        },
      },
    ],
  });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === "string")
    throw new Error("No browser fixture port");
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

async function fixture(
  page: Page,
  path = "/fixture/booking",
  scenario: {
    rejection?: string;
    conflict?: boolean;
    seriesConflict?: boolean;
    setup?: boolean;
    activity?: boolean;
    noShow?: boolean;
  } = {},
) {
  page.setDefaultTimeout(7000);
  await page.clock.setFixedTime(new Date("2026-10-01T12:00:00Z"));
  let draftVersion = 0;
  let payload: any = null;
  let noShowStatus = "scheduled";
  const posts: any[] = [];
  const calendarDates: string[] = [];
  const mutations: { path: string; body: any }[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(`${baseUrl}/api/**`, async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    let body: any;
    if (request.method() !== "GET")
      mutations.push({ path: url.pathname, body: request.postDataJSON() });
    if (
      scenario.conflict &&
      url.pathname.includes("working_drafts") &&
      request.method() !== "GET"
    ) {
      await route.fulfill({
        status: 409,
        json: {
          error:
            "This working draft changed in another window. Reload and review before saving.",
          code: "draft_conflict",
        },
      });
      return;
    }
    if (url.pathname === "/api/csrf")
      body = {
        csrf_token: "synthetic",
        business_date: "2026-10-01",
        environment: "test",
      };
    else if (url.pathname.includes("working_drafts")) {
      if (request.method() !== "GET") {
        payload = request.postDataJSON().payload;
        draftVersion++;
      }
      body = {
        kind: "appointment",
        patient_id: null,
        encounter_id: null,
        record_id: null,
        scope: "main",
        version: draftVersion,
        payload,
        updated_at: null,
      };
    } else if (url.pathname.endsWith("telehealth/booking_options"))
      body = {
        data: {
          enabled: false,
          allowed_modalities: ["in_person"],
          visit_type_settings: [],
        },
      };
    else if (url.pathname === "/api/clinic/patients/lookup")
      body = { patients: [patient] };
    else if (
      url.pathname === "/api/clinic/facilities" &&
      url.searchParams.get("type") === "sites"
    )
      body = {
        sites: [{ id: 4, code: "SYN", timezone_override: "America/Chicago" }],
      };
    else if (
      url.pathname === "/api/clinic/facilities" &&
      url.searchParams.get("type") === "rooms"
    )
      body = {
        rooms: [
          { id: 6, site_id: 4, code: "Synthetic room", kind: "physical" },
        ],
      };
    else if (
      url.pathname === "/api/clinic/facilities" &&
      url.searchParams.get("type") === "visit_types"
    )
      body = { visit_types: [{ id: 2, code: "Synthetic visit" }] };
    else if (url.pathname === "/api/clinic/clinicians")
      body = {
        clinicians: path.includes("missing")
          ? []
          : [{ id: 9, display_name: "Synthetic clinician" }],
      };
    else if (url.pathname === "/api/clinic/service_offerings")
      body = { service_offerings: [] };
    else if (url.pathname.endsWith("scheduling_policy"))
      body = {
        policy: {
          revision: 0,
          recurrence_enabled: true,
          overbook_enabled: false,
          eligible_visit_type_ids: [],
        },
      };
    else if (scenario.noShow && url.pathname.endsWith("/901/transition")) {
      noShowStatus = request.postDataJSON().transition.to;
      body = { appointment: { ...appointment, status: noShowStatus } };
    } else if (
      url.pathname === "/api/clinic/appointments" &&
      request.method() === "POST"
    ) {
      const input = request.postDataJSON();
      posts.push(input);
      if (scenario.rejection) {
        await route.fulfill({
          status: 422,
          json: { error: scenario.rejection },
        });
        return;
      }
      body = {
        appointment: {
          ...appointment,
          ...input.appointment,
          patient_id: Number(input.appointment.patient_id),
          site_id: Number(input.appointment.site_id),
        },
      };
    } else if (url.pathname === "/api/clinic/appointments")
      body = {
        appointments: scenario.noShow
          ? [
              {
                ...appointment,
                starts_at: "2026-10-01T11:00:00Z",
                ends_at: "2026-10-01T11:30:00Z",
                status: noShowStatus,
                encounter_id: null,
              },
            ]
          : scenario.activity
            ? [appointment]
            : [],
        pagination: { page: 1, total: 0 },
      };
    else if (url.pathname === "/api/clinic/schedule_calendar") {
      calendarDates.push(url.searchParams.get("date") || "");
      body = {
        site_id: 4,
        month: "2026-10",
        timezone: "America/Chicago",
        capacity_configured: true,
        slot_minutes: 30,
        clinicians: [{ id: 9, name: "Synthetic clinician" }],
        rooms: [{ id: 6, name: "Synthetic room", kind: "physical" }],
        days: [
          {
            date: "2026-10-06",
            available: 1,
            scheduled: 1,
            confirmed: 0,
            conflicts: 0,
            holds: [],
            appointments: [appointment],
            slots: [
              {
                starts_at: "2026-10-06T15:00:00Z",
                ends_at: "2026-10-06T15:30:00Z",
                clinician_id: 9,
                room_ids: [6],
              },
            ],
          },
        ],
      };
    } else if (url.pathname.endsWith("appointment_series/preview"))
      body = {
        occurrences: [
          {
            sequence: 1,
            original_date: "2026-10-06",
            state: "booked",
            starts_at: "2026-10-06T14:00:00Z",
            ends_at: "2026-10-06T14:30:00Z",
            conflict: scenario.seriesConflict
              ? "The clinician is not assigned to this site for the selected time."
              : null,
          },
        ],
      };
    else body = {};
    await route.fulfill({ json: body });
  });
  await page.goto(baseUrl + path);
  return { posts, errors, calendarDates, mutations };
}

it.each(["UTC", "America/Chicago"])(
  "#11/#38/#2/#132/#134 real typed booking input in %s",
  async (timezoneId) => {
    const context = await browser.newContext({
      timezoneId,
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    try {
      const { posts, errors } = await fixture(page);
      const starts = page.getByRole("textbox", { name: /^Starts/ }),
        ends = page.getByRole("textbox", { name: /^Ends/ });
      await starts.waitFor();
      expect(await starts.getAttribute("type")).toBe("text");
      await starts.fill("2026-10-06T14:00");
      await ends.fill("2026-10-06T14:30");
      expect(await starts.inputValue()).toBe("2026-10-06T14:00");
      expect(await ends.inputValue()).toBe("2026-10-06T14:30");
      expect(await ends.getAttribute("aria-invalid")).toBe("false");
      expect(
        await page.getByText("End time must follow the start time.").count(),
      ).toBe(0);
      await ends.fill("2026-10-06T13:30");
      await page.getByText("End time must be after the start time.").waitFor();
      expect(await ends.getAttribute("aria-invalid")).toBe("true");
      await ends.fill("2026-10-06T14:30");
      await page
        .getByRole("combobox", { name: "Find patient" })
        .fill("Synthetic");
      await page
        .getByRole("option", { name: /Synthetic Browser Patient/ })
        .click();
      await page.getByRole("combobox", { name: /^Visit type/ }).click();
      await page
        .getByRole("option", { name: "Synthetic visit", exact: true })
        .click();
      const hint = page.getByText(/your time → .*clinic time/);
      const text = await hint.innerText();
      expect(text).toContain(
        timezoneId === "UTC"
          ? "2:00 PM your time → 9:00 AM clinic time — look right?"
          : "2:00 PM your time → 2:00 PM clinic time — look right?",
      );
      await page
        .getByRole("button", { name: "Schedule appointment", exact: true })
        .click();
      await page.getByText(/Appointment #901 scheduled for/).waitFor();
      expect(posts).toHaveLength(1);
      expect(posts[0].appointment.starts_at).toBe(
        timezoneId === "UTC"
          ? "2026-10-06T14:00:00.000Z"
          : "2026-10-06T19:00:00.000Z",
      );
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  },
  20000,
);

it("#3 replaces an explicitly past slot with a future device-clock default", async () => {
  const page = await browser.newPage({ timezoneId: "UTC" });
  try {
    await fixture(page, "/fixture/booking?past=1");
    await page.getByRole("textbox", { name: /^Starts/ }).waitFor();
    expect(
      await page.getByRole("textbox", { name: /^Starts/ }).inputValue(),
    ).toBe("2026-10-01T12:15");
  } finally {
    await page.close();
  }
}, 20000);

it("#130 hides the schedule's appointment portal after real clinic-router navigation", async () => {
  const page = await browser.newPage({
    timezoneId: "America/Chicago",
    viewport: { width: 1440, height: 1000 },
  });
  try {
    const { errors } = await fixture(
      page,
      "/clinic/schedule?month=2026-10&day=2026-10-06&view=day",
    );
    await page
      .getByText("Synthetic Browser Patient", { exact: false })
      .first()
      .click();
    await page.getByRole("dialog").waitFor();
    await page
      .getByRole("link", { name: "Open front desk", exact: true })
      .click();
    await page
      .getByRole("heading", {
        name: "Synthetic Front Desk destination",
        includeHidden: true,
      })
      .waitFor();
    expect(new URL(page.url()).pathname).toBe("/clinic/front-desk");
    await expect.poll(() => page.getByRole("dialog").count()).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}, 20000);

// Native segmented controls have different automation semantics than the app's text fields.
it("#11/#38 compares native datetime entry with whole-control filling", async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(
      '<label for="native">Native date and time</label><input id="native" type="datetime-local">',
    );
    const control = page.locator("#native");
    await control.fill("2026-10-06T14:30");
    expect(await control.inputValue()).toBe("2026-10-06T14:30");
    expect(await control.getAttribute("type")).toBe("datetime-local");
    const snapshot = await control.ariaSnapshot();
    expect(snapshot).toContain("2026-10-06T14:30");
  } finally {
    await page.close();
  }
});

it.each([390, 1440])(
  "#9 booking recurrence labels fit at viewport width %s",
  async (width) => {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    try {
      await fixture(page);
      await page.getByRole("combobox", { name: "Repeat", exact: true }).click();
      await page.getByRole("option", { name: "Weekly", exact: true }).click();
      for (const label of ["Every (weeks)", "Number of visits"]) {
        const element = page.locator("label").filter({ hasText: label });
        await element.waitFor();
        expect(await element.innerText()).toBe(label);
        const size = await element.evaluate((el) => ({
          scroll: el.scrollWidth,
          client: el.clientWidth,
        }));
        expect(size.scroll).toBeLessThanOrEqual(size.client + 1);
      }
    } finally {
      await page.close();
    }
  },
  20000,
);

it("#3 initializes an unscoped calendar to the current clinic month", async () => {
  const page = await browser.newPage({ timezoneId: "America/Chicago" });
  try {
    const { calendarDates } = await fixture(page, "/clinic/schedule");
    await expect.poll(() => calendarDates.length).toBeGreaterThan(0);
    expect(calendarDates.every((date) => date === "2026-10-01")).toBe(true);
  } finally {
    await page.close();
  }
}, 20000);

async function selectBookingPatientAndType(page: Page) {
  await page.getByRole("combobox", { name: "Find patient" }).fill("Synthetic");
  await page.getByRole("option", { name: /Synthetic Browser Patient/ }).click();
  await page.getByRole("combobox", { name: /^Visit type/ }).click();
  await page
    .getByRole("option", { name: "Synthetic visit", exact: true })
    .click();
}
it("#99 submits Blocked time and renders the saved rule after API refresh", async () => {
  const page = await browser.newPage({ timezoneId: "UTC" });
  const posts: Record<string, unknown>[] = [];
  const rules: Record<string, unknown>[] = [];
  let capacityReads = 0;
  try {
    page.setDefaultTimeout(7000);
    await page.route(`${baseUrl}/api/**`, async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/api/csrf")
        return route.fulfill({
          json: {
            csrf_token: "synthetic",
            business_date: "2026-10-01",
            environment: "test",
          },
        });
      if (path === "/api/clinic/waitlist")
        return route.fulfill({
          json: {
            entries: [],
            total: 0,
            ranking: "earliest",
            cancellations: [],
            sites: [{ id: 4, name: "Synthetic block site" }],
            clinicians: [{ id: 9, name: "Synthetic block clinician" }],
            visit_types: [],
          },
        });
      if (path === "/api/clinic/facilities/4/operational_policy")
        return route.fulfill({
          json: {
            policy: {
              site_id: 4,
              revision: 0,
              configured: false,
              block_categories: [],
              waiting_thresholds: [],
              effective_from: null,
              written_by_membership_id: null,
              waiting_time_source: "encounter.started_at",
              waiting_action: "display_only",
            },
            can_write: true,
          },
        });
      if (path === "/api/clinic/capacity" && request.method() === "POST") {
        const input = request.postDataJSON().capacity;
        posts.push(input);
        const saved = {
          ...input,
          id: 701,
          site_id: Number(input.site_id),
          clinician_id: Number(input.clinician_id),
          version: 0,
          weekday: null,
          start_minute: null,
          end_minute: null,
          reason_category: {
            state: "not_recorded",
            key: null,
            label: null,
            policy_revision: null,
          },
        };
        rules.push(saved);
        return route.fulfill({
          status: 201,
          json: { rule: saved, affected_appointments: [] },
        });
      }
      if (path === "/api/clinic/capacity") {
        capacityReads++;
        return route.fulfill({
          json: {
            rules,
            timezone: "UTC",
            site_availability: [],
            can_block: true,
          },
        });
      }
      return route.fulfill({
        status: 404,
        json: { error: "Unexpected synthetic capacity route" },
      });
    });
    await page.goto(`${baseUrl}/fixture/capacity`);
    await page.getByRole("combobox", { name: "Site", exact: true }).click();
    await page
      .getByRole("option", { name: "Synthetic block site", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Clinician", exact: true })
      .click();
    await page
      .getByRole("option", { name: "Synthetic block clinician", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Rule type", exact: true })
      .click();
    await page
      .getByRole("option", { name: "Blocked time", exact: true })
      .click();
    await page
      .getByLabel("Block starts", { exact: true })
      .fill("2026-10-06T14:00");
    await page
      .getByLabel("Block ends", { exact: true })
      .fill("2026-10-06T14:30");
    await page
      .getByRole("textbox", { name: "Capacity reason", exact: true })
      .fill("Synthetic staff meeting");
    await page
      .getByRole("button", { name: "Save capacity rule", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Saved. The queue is refreshing" })
      .waitFor();
    await page
      .getByText(/Synthetic block clinician.*Synthetic staff meeting/)
      .waitFor();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      site_id: "4",
      clinician_id: "9",
      kind: "block",
      starts_at: "2026-10-06T14:00:00.000Z",
      ends_at: "2026-10-06T14:30:00.000Z",
      reason: "Synthetic staff meeting",
      reason_category_key: null,
      operational_policy_revision: 0,
    });
    expect(posts[0].request_key).toEqual(expect.any(String));
    expect(capacityReads).toBeGreaterThanOrEqual(2);
    await page.reload();
    await page
      .getByText(/Synthetic block clinician.*Synthetic staff meeting/)
      .waitFor();
    expect(posts).toHaveLength(1);
  } finally {
    await page.close();
  }
}, 20000);
it("#72 blocks First available series preview before sending an invalid clinician ID", async () => {
  const page = await browser.newPage();
  try {
    const { mutations } = await fixture(page, "/fixture/booking?missing=1");
    await selectBookingPatientAndType(page);
    await page.getByRole("combobox", { name: "Repeat", exact: true }).click();
    await page.getByRole("option", { name: "Weekly", exact: true }).click();
    await page
      .getByRole("button", { name: "Preview visits", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "First available can schedule one appointment only" })
      .waitFor();
    expect(
      mutations.filter((row) => row.path.includes("appointment_series")),
    ).toEqual([]);
    expect(
      await page
        .getByRole("button", { name: "Schedule series", exact: true })
        .isDisabled(),
    ).toBe(true);
  } finally {
    await page.close();
  }
}, 20000);
it.each(["Close", "Escape"])(
  "#133 %s exposes safe discard after a draft conflict",
  async (method) => {
    const page = await browser.newPage();
    try {
      const { mutations } = await fixture(page, "/fixture/booking", {
        conflict: true,
      });
      await page
        .getByRole("textbox", { name: /^Starts/ })
        .fill("2026-10-06T15:00");
      if (method === "Escape")
        await page.getByRole("textbox", { name: /^Starts/ }).press("Escape");
      else
        await page.getByRole("button", { name: "Close", exact: true }).click();
      await page
        .getByRole("button", { name: "Discard and close", exact: true })
        .click();
      await page.getByRole("heading", { name: "Booking closed" }).waitFor();
      expect(mutations.some((row) => row.body?.payload === null)).toBe(false);
      expect(mutations.some((row) => row.path.endsWith("appointments"))).toBe(
        false,
      );
    } finally {
      await page.close();
    }
  },
  20000,
);
it.each([
  [15, "The clinician is not assigned to this site for the selected time."],
  [32, "This time is outside the clinician's capacity template for this site."],
])(
  "#%s exposes an accessible server rejection and retains the draft",
  async (_id, message) => {
    const page = await browser.newPage();
    try {
      const { posts, mutations } = await fixture(page, "/fixture/booking", {
        rejection: String(message),
      });
      await selectBookingPatientAndType(page);
      const start = await page
        .getByRole("textbox", { name: /^Starts/ })
        .inputValue();
      await page
        .getByRole("button", { name: "Schedule appointment", exact: true })
        .click();
      await page
        .getByRole("alert")
        .filter({ hasText: String(message) })
        .waitFor();
      expect(
        await page.getByRole("textbox", { name: /^Starts/ }).inputValue(),
      ).toBe(start);
      expect(
        await page
          .getByRole("button", { name: "Schedule appointment", exact: true })
          .isDisabled(),
      ).toBe(true);
      expect(posts).toHaveLength(1);
      expect(mutations.some((row) => row.body?.payload === null)).toBe(false);
    } finally {
      await page.close();
    }
  },
  20000,
);
it.each([false, true])(
  "#92 exposes existing assignment workflow only with setup permission (%s)",
  async (setup) => {
    const page = await browser.newPage();
    try {
      const { mutations } = await fixture(
        page,
        `/fixture/booking${setup ? "?setup=1" : ""}`,
        { seriesConflict: true },
      );
      await selectBookingPatientAndType(page);
      await page.getByRole("combobox", { name: "Repeat", exact: true }).click();
      await page.getByRole("option", { name: "Weekly", exact: true }).click();
      await page
        .getByRole("button", { name: "Preview visits", exact: true })
        .click();
      await page
        .getByRole("alert")
        .filter({ hasText: "The clinician is not assigned" })
        .first()
        .waitFor();
      const assign = page.getByRole("button", {
        name: /Assign Synthetic clinician to SYN for this series period/,
      });
      expect(await assign.count()).toBe(setup ? 1 : 0);
      expect(
        await page
          .getByRole("button", { name: "Schedule series", exact: true })
          .isDisabled(),
      ).toBe(true);
      if (setup) {
        await assign.click();
        await page
          .getByRole("status")
          .filter({ hasText: "Capacity templates and site hours still apply" })
          .waitFor();
        expect(
          mutations.find((row) => row.path.endsWith("assign_site"))?.body,
        ).toEqual({
          assignment: {
            site_id: "4",
            starts_at: "2026-10-06T14:00:00Z",
            ends_at: "2026-10-06T14:30:00Z",
          },
        });
        expect(
          await page
            .getByRole("button", { name: "Schedule series", exact: true })
            .isDisabled(),
        ).toBe(true);
      }
    } finally {
      await page.close();
    }
  },
  20000,
);

it("#135 same-day activity remains informational and nonoverlap can submit", async () => {
  const page = await browser.newPage({ timezoneId: "UTC" });
  try {
    const { posts } = await fixture(page, "/fixture/booking", {
      activity: true,
    });
    await selectBookingPatientAndType(page);
    await page
      .getByRole("textbox", { name: /^Starts/ })
      .fill("2026-10-06T15:00");
    await page
      .getByText("Scheduling checks whether the appointment times overlap.")
      .waitFor();
    expect(
      await page
        .getByText(/Choose another time or resource before scheduling/)
        .count(),
    ).toBe(0);
    await page
      .getByRole("button", { name: "Schedule appointment", exact: true })
      .click();
    await page.getByText(/Appointment #901 scheduled for/).waitFor();
    expect(posts).toHaveLength(1);
    expect(posts[0].appointment.starts_at).toBe("2026-10-06T15:00:00.000Z");
  } finally {
    await page.close();
  }
}, 20000);

it.each([false, true])(
  "#101 renders no-show eligibility and a persisted readback (%s permission denied)",
  async (denied) => {
    const page = await browser.newPage({ timezoneId: "UTC" });
    try {
      const { mutations } = await fixture(
        page,
        `/fixture/no-show${denied ? "?denied=1" : ""}`,
        { noShow: true },
      );
      await page
        .getByText("Synthetic Browser Patient", { exact: true })
        .waitFor();
      const action = page.getByRole("button", { name: "No show", exact: true });
      expect(await action.count()).toBe(denied ? 0 : 1);
      if (!denied) {
        await action.click();
        await expect.poll(() => action.count()).toBe(0);
        await page.reload();
        await page
          .getByText("Synthetic Browser Patient", { exact: true })
          .waitFor();
        await page.getByText("No show", { exact: true }).waitFor();
        expect(await action.count()).toBe(0);
        expect(
          mutations.filter((row) => row.path.endsWith("/transition")),
        ).toEqual([
          {
            path: "/api/clinic/appointments/901/transition",
            body: {
              transition: { to: "no_show", expected_status: "scheduled" },
            },
          },
        ]);
      }
    } finally {
      await page.close();
    }
  },
  20000,
);
