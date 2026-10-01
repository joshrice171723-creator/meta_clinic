import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { DevelopmentDatePicker } from '/src/features/identity/DevelopmentAccountSwitcher.tsx';
import { Facilities } from '/src/features/clinic/Facilities.tsx';
import { InvoiceLineEditor } from '/src/features/clinic/InvoiceLineEditor.tsx';
import { ClinicSchedule } from '/src/features/clinic/ClinicSchedule.tsx';
import { TrackingBoardView } from '/src/features/clinic/TrackingBoardPage.tsx';
import { trackingBoardVisitToBoardVisit } from '/src/features/clinic/trackingBoardApi.ts';
const mode = new URLSearchParams(location.search).get('mode');
const service = { id: 1, name: 'Synthetic service', description: 'Synthetic description', unit_amount: '50.0', currency: 'USD', active: true, lock_version: 0 };
const providerVisit = trackingBoardVisitToBoardVisit({
 id:81,row_type:'encounter',operational_state:'waiting_room',patient_id:71,encounter_id:81,
 chart_status:'unopened',provider_assignment_available:true,provider:null,
 patient:{id:71,display_name:'Synthetic Provider Patient',reference:'SYN-PROVIDER-71'},
 encounter:{id:81,status:'open',started_at:'2026-10-01T11:55:00Z',ended_at:null,
 site_id:'101',site_code:'ASSIGN',room_id:null,room_code:null},appointment:null
});
const providerClinicians = [{id:'api-provider-301',firstName:'',lastName:'',credentials:'',
 displayName:'Configured synthetic clinician',locationIds:['api-site-101']}];
createRoot(document.getElementById('root')).render(mode === 'date'
 ? React.createElement(DevelopmentDatePicker, { businessDate: '2026-10-01' })
 : mode === 'board-provider' ? React.createElement(TrackingBoardView, { visits:[providerVisit], clinicians:providerClinicians, now:'2026-10-01T12:00:00Z', timezone:'UTC' })
 : mode === 'board' ? React.createElement(TrackingBoardView, { visits: [], now: '2026-10-01T12:00:00Z', timezone: 'UTC' })
 : mode === 'schedule' ? React.createElement(ClinicSchedule, { canBook: false, renderBooking: () => null })
 : mode === 'invoice' ? React.createElement(InvoiceLineEditor, { currency: 'USD', onChange() {}, lines: [{ kind: 'catalog', billing_service_id: 1, service_lock_version: 0, service_snapshot: service, quantity: '1' }] })
 : React.createElement(Facilities));
`;
let server: ViteDevServer;
let browser: Browser;
let base: string;
beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root,
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "synthetic-muse-fields",
        enforce: "pre",
        resolveId(source, importer) {
          if (source === "/qa-fields.tsx") return "\0qa-fields";
          if (importer?.endsWith("/ClinicSchedule.tsx")) {
            if (source === "./Workspace") return "\0qa-context";
            if (source === "../../shared/ui") return "\0qa-calendar-resource";
          }
          if (importer?.endsWith("/Facilities.tsx")) {
            if (source === "./Workspace") return "\0qa-context";
            if (source === "../../shared/ui") return "\0qa-resource";
            if (
              [
                "./LabUnitMappingSettings",
                "./VisitTypeSettings",
                "./ServiceOfferingSettings",
                "./PracticeFeatureSettings",
                "./ClinicianSetup",
                "./SiteSchedulingPolicy",
                "./OperationalPolicySettings",
              ].includes(source)
            )
              return "\0qa-panel:" + source;
          }
        },
        load(id) {
          if (id === "\0qa-fields") return entry;
          if (id === "\0qa-calendar-resource")
            return `const calendar = {
              site_id: 4, month: '2026-10', timezone: 'UTC', slot_minutes: 30,
              capacity_configured: true, clinicians: [{id: 9, name: 'Synthetic clinician'}],
              rooms: [], days: [{date: '2026-10-01', scheduled: 1, confirmed: 0,
                available: 0, conflicts: 0, slots: [], holds: [], appointments: [{
                  id: 901, patient_id: 801, site_id: 4, booked_clinician_id: 9,
                  room_id: null, starts_at: '2026-10-01T14:00:00Z',
                  ends_at: '2026-10-01T14:30:00Z', status: 'scheduled',
                  calendar_status: 'scheduled', conflict: false,
                  patient: {id: 801, display_name: 'Synthetic patient', reference: 'SYN-801'},
                  clinician_name: 'Synthetic clinician', room_name: null, visit_type_name: null
                }]}]
            };
            export const useResource = (path) => ({
              data: new URLSearchParams(location.search).has('count') && path.includes('schedule_calendar') ? calendar : undefined,
              refresh() {}
            });`;
          if (id === "\0qa-context")
            return "export const useClinic = () => ({ capabilities: { facilities_write: true }, practice: { timezone: 'UTC' }, sites: [], refreshWorkspace() {} });";
          if (id === "\0qa-resource")
            return "const data = { sites: [] }; export const useResource = () => ({ data, refresh() {} }); export const LoadState = () => null;";
          if (id.startsWith("\0qa-panel:")) {
            const name = id.split("/").at(-1);
            return (
              "export const " +
              (name === "SiteSchedulingPolicy"
                ? "SiteSchedulingPolicySettings"
                : name) +
              " = () => null;"
            );
          }
        },
        configureServer(vite) {
          vite.middlewares.use((request, response, next) => {
            if (request.url?.startsWith("/qa-fields?")) {
              response.setHeader("Content-Type", "text/html");
              response.end(
                '<div id="root"></div><script type="module" src="/qa-fields.tsx"></script>',
              );
            } else next();
          });
        },
      },
    ],
  });
  await server.listen();
  base = server.resolvedUrls!.local[0];
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});
async function open(mode: string): Promise<Page> {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ csrf_token: "synthetic", services: [] }),
      }),
  );
  await page.goto(base + "qa-fields?mode=" + mode);
  return page;
}
async function nativeSegmentNames(type: "date" | "time") {
  const page = await browser.newPage();
  await page.setContent(
    `<label>Native baseline<input type="${type}" value="${type === "date" ? "2026-10-01" : "08:00"}"></label>`,
  );
  const session = await page.context().newCDPSession(page);
  const tree = await session.send("Accessibility.getFullAXTree");
  const names = [
    ...new Set(
      tree.nodes
        .filter((node) => node.role?.value === "spinbutton")
        .map((node) => node.name?.value),
    ),
  ];
  await page.close();
  return names;
}
it("Muse248 date segments match native Chromium and preserve the chosen date", async () => {
  const page = await open("date");
  const input = page.locator("input[type=date]");
  await input.waitFor();
  const snapshot = await page
    .locator(".development-date-picker")
    .ariaSnapshot();
  expect(snapshot).not.toMatch(
    /Month Month|Day Day|Year Year|Show date picker Show date picker/,
  );
  const session = await page.context().newCDPSession(page);
  const tree = await session.send("Accessibility.getFullAXTree");
  const names = [
    ...new Set(
      tree.nodes
        .filter((node) => node.role?.value === "spinbutton")
        .map((node) => node.name?.value),
    ),
  ];
  expect(names.length).toBe(3);
  expect(names).toEqual(await nativeSegmentNames("date"));
  await input.fill("2026-11-02");
  expect(await input.inputValue()).toBe("2026-11-02");
  expect(
    await page.getByRole("button", { name: "Apply date" }).isEnabled(),
  ).toBe(true);
  await page.close();
});
it("Muse259 time segments match native Chromium and preserve the chosen time", async () => {
  const page = await open("facility");
  await page.getByRole("button", { name: "Add site", exact: true }).click();
  const row = page
    .locator(".facility-operating-hours-row")
    .filter({ hasText: "Monday" });
  const snapshot = await row.ariaSnapshot();
  expect(snapshot).not.toMatch(
    /Hours Hours|Minutes Minutes|AM\/PM AM\/PM|Show time picker Show time picker/,
  );
  const session = await page.context().newCDPSession(page);
  const tree = await session.send("Accessibility.getFullAXTree");
  const names = [
    ...new Set(
      tree.nodes
        .filter((node) => node.role?.value === "spinbutton")
        .map((node) => node.name?.value),
    ),
  ];
  expect(names.length).toBe(3);
  expect(names).toEqual(await nativeSegmentNames("time"));
  const input = row.locator("input[type=time]").first();
  await input.fill("09:15");
  expect(await input.inputValue()).toBe("09:15");
  await page.close();
});
it("Muse260 groups state and ZIP without a comma in the delivery preview", async () => {
  const page = await open("facility");
  await page.getByRole("button", { name: "Add site", exact: true }).click();
  for (const [name, value] of [
    ["Address line 1", "1 Synthetic QA Way"],
    ["City", "Testville"],
    ["State", "OK"],
    ["Postal code", "73401"],
  ]) {
    await page.getByRole("textbox", { name, exact: true }).fill(value);
  }
  const preview = page.getByText(/^Delivery address preview:/);
  expect(await preview.innerText()).toBe(
    "Delivery address preview: 1 Synthetic QA Way, Testville, OK 73401",
  );
  expect(
    await page
      .getByRole("textbox", { name: "State", exact: true })
      .inputValue(),
  ).toBe("OK");
  expect(
    await page
      .getByRole("textbox", { name: "Postal code", exact: true })
      .inputValue(),
  ).toBe("73401");
  await page.close();
});
it("Muse24 billing service amount and catalog version retain their spaces", async () => {
  const page = await open("invoice");
  const alert = page.getByRole("alert").filter({ hasText: "Catalog version" });
  await alert.waitFor();
  expect(await alert.innerText()).toContain(
    "USD 50.0 each · Catalog version 0.",
  );
  expect(await alert.ariaSnapshot()).toContain(
    "USD 50.0 each · Catalog version 0.",
  );
  await page.close();
});

it("Muse24 schedule export retains spaces around its dynamic view label", async () => {
  const page = await open("schedule&view=day");
  const button = page.getByRole("button", {
    name: "Export day schedule as a read-only calendar file",
  });
  await button.waitFor();
  expect(await button.textContent()).toBe("Export day · read-only");
  await page.close();
});

it("Muse24 tracking board separates the timezone from its introductory copy", async () => {
  const page = await open("board");
  const label = page.getByText("All times shown in UTC", { exact: true });
  await label.waitFor();
  expect(await label.textContent()).toBe("All times shown in UTC");
  expect(await label.ariaSnapshot()).toContain("All times shown in UTC");
  await page.close();
});

it("Muse24 schedule separates the appointment count from its label", async () => {
  const page = await open(
    "schedule&count=1&view=day&group=clinician&site_id=4&month=2026-10&day=2026-10-01",
  );
  try {
    const summary = page.getByText(
      "1 appointments · Select an open time to book. Capacity counts clinician time, not additional room capacity.",
      { exact: true },
    );
    await summary.waitFor();
    expect(await summary.textContent()).toBe(
      "1 appointments · Select an open time to book. Capacity counts clinician time, not additional room capacity.",
    );
    expect(await summary.ariaSnapshot()).toContain("1 appointments ·");
  } finally {
    await page.close();
  }
});

it("Muse85 configured clinician appears in the actual board assignment dialog", async () => {
  const page = await open("board-provider");
  try {
    await page.getByRole("button", { name: "Assign", exact: true }).dblclick();
    const dialog = page.getByRole("dialog", {
      name: "Assign provider",
      exact: true,
    });
    await dialog.waitFor();
    const select = dialog.getByRole("combobox", {
      name: "Provider",
      exact: true,
    });
    expect(await select.locator("option").allTextContents()).toEqual([
      "Unassigned",
      "Configured synthetic clinician",
    ]);
    await select.selectOption("api-provider-301");
    expect(await select.inputValue()).toBe("api-provider-301");
  } finally {
    await page.close();
  }
});
