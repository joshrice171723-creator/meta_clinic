import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const sites = [
  { id: 1, code: "SYN1", name: "Synthetic One" },
  { id: 2, code: "SYN2", name: "Synthetic Two" },
];
const employees = [
  { id: 1, employee_name: "Synthetic Alpha", active_for_work: true },
  { id: 2, employee_name: "Synthetic Beta", active_for_work: true },
];
const entry = `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {BadgeAdminPage} from '/src/features/workforce/BadgeAdminPage.tsx';
import {ScheduleBuilderPage} from '/src/features/workforce/ScheduleBuilderPage.tsx';
import {TimecardReviewPage} from '/src/features/workforce/TimecardReviewPage.tsx';
import {PayrollExportPage} from '/src/features/workforce/PayrollExportPage.tsx';
import {EmploymentAdminPage} from '/src/features/workforce/EmploymentAdminPage.tsx';
import {PracticeFeatureSettings} from '/src/features/clinic/PracticeFeatureSettings.tsx';
import {DevelopmentControls} from '/src/features/identity/DevelopmentAccountSwitcher.tsx';
const mode = new URLSearchParams(location.search).get('mode');
const component = { badges: BadgeAdminPage, schedule: ScheduleBuilderPage, timecards: TimecardReviewPage, payroll: PayrollExportPage, employees: EmploymentAdminPage, setup: PracticeFeatureSettings, activation: DevelopmentControls }[mode];
createRoot(document.getElementById('root')).render(React.createElement(component, mode === 'setup' ? {canWrite: false, siteId: 1} : mode === 'activation' ? {accounts: [], businessDate: '2026-10-01'} : {}));
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
        name: "synthetic-workforce-only",
        enforce: "pre",
        resolveId(source, importer) {
          if (source === "/qa-workforce.tsx") return "\0qa-workforce";
          if (
            importer?.includes("/src/features/workforce/") &&
            source === "../clinic/Workspace"
          )
            return "\0qa-context";
          if (
            importer?.includes("/src/features/workforce/") &&
            source === "../clinic/clinicNavigation"
          )
            return "\0qa-navigation";
        },
        load(id) {
          if (id === "\0qa-workforce") return entry;
          if (id === "\0qa-navigation")
            return "export const useClinicNavigation = () => ({ navigate: path => { window.qaDestination = path; } });";
          if (id === "\0qa-context")
            return `export const useClinic = () => ({ current_site: ${JSON.stringify(sites[0])}, sites: ${JSON.stringify(sites)}, practice: { timezone: 'UTC' }, capabilities: { workforce_admin: !location.search.includes("denied"), workforce_badges: !location.search.includes("denied"), workforce_settings: !location.search.includes('denied'), workforce_timecards_read: true, workforce_timecards_review: !location.search.includes('denied'), workforce_timecards_approve: false, workforce_payroll_configure: true, workforce_payroll_export: true } });`;
        },
        configureServer(vite) {
          vite.middlewares.use((request, response, next) => {
            if (request.url?.startsWith("/qa-workforce?")) {
              response.setHeader("Content-Type", "text/html");
              response.end(
                '<div id="root"></div><script type="module" src="/qa-workforce.tsx"></script>',
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
}, 60000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});
async function open(mode: string) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    (route) => {
      const path = new URL(route.request().url()).pathname;
      let body: unknown = {};
      let status = 200;
      if (path === "/api/csrf") body = { csrf_token: "synthetic-only" };
      else if (path.endsWith("/timecards") && mode.includes("empty"))
        body = {
          timecards: [],
          employees: [],
          default_period_start: "2026-09-28",
        };
      else if (path.endsWith("/schedules") || path.endsWith("/timecards")) {
        status = 422;
        body = {
          error:
            "Workforce settings have not been configured for this practice.",
          code: "workforce_settings_unconfigured",
        };
      } else if (path.endsWith("/adjustments")) body = { adjustments: [] };
      else if (path.endsWith("/payroll-exports"))
        body = {
          configurations: [],
          batches: [],
          fields: [],
          default_columns: [],
          employees: [],
          timecards: [],
        };
      else if (path.endsWith("/employments"))
        body = {
          employments: [],
          staff_members: [],
          membership_options: [],
          role_options: [
            {
              id: 1,
              role_code: "clinician",
              label: "Clinician",
              version: 1,
              permissions: [],
            },
          ],
          invitations: [],
          sites,
        };
      else if (path.endsWith("/kiosks")) body = { kiosks: [] };
      else if (path.endsWith("/badges")) {
        if (route.request().method() === "POST") {
          if (mode.includes("failure")) {
            status = 422;
            body = { error: "Synthetic badge refusal" };
          } else
            body = {
              badge: {
                id: 1,
                employment_id: 1,
                site_id: 1,
                active: true,
                pin_required: true,
                issued_at: "2026-10-01T00:00:00Z",
              },
              printable: {
                token: "synthetic-nonfunctional",
                barcode_svg: "",
                reprintable: false,
              },
            };
        } else body = { employees, badges: [] };
      } else if (path.endsWith("/practice_features"))
        body = {
          features: {
            site_id: 1,
            site_specialty_configured: true,
            site_revision: 1,
            profile_scope: "site",
            revision: 1,
            configured: true,
            finalized: true,
            finalized_at: "2026-10-01T00:00:00Z",
            clinic_type: "primary_care",
            core: {},
            optional: {},
            service_scope: [],
            selected_services: [],
            assessment_scope: [],
            assessment_configured: true,
            insurance_workflows_enabled: false,
            recommended_clinic_type: "primary_care",
            recommended_service_scope: [],
            recommended_assessment_scope: [],
            starter_profile: { id: "primary-care", version: 1, visits: {} },
          },
        };
      else {
        status = 404;
        body = { error: "Unexpected synthetic API request" };
      }
      return route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    },
  );
  await page.goto(base + "qa-workforce?mode=" + mode);
  return page;
}
it.each([false, true])(
  "Muse19 unconfigured schedule provides capability-aware recovery denied=%s",
  async (denied) => {
    const page = await open("schedule" + (denied ? "&denied=1" : ""));
    await page.getByRole("alert").waitFor();
    expect(await page.getByRole("alert").innerText()).toContain(
      "Workforce settings are not configured for this location.",
    );
    expect(await page.locator("body").innerText()).not.toContain(
      "Could not load",
    );
    if (denied)
      expect(
        await page
          .getByRole("link", { name: "Configure workforce settings" })
          .count(),
      ).toBe(0);
    else
      expect(
        await page
          .getByRole("link", { name: "Configure workforce settings" })
          .getAttribute("href"),
      ).toBe("/clinic/workforce/settings");
    await page.close();
  },
);
it("Muse31 explains separate scheduling setup and links Clinic Setup", async () => {
  const page = await open("employees");
  await select(page, "Access role", "Clinician");
  const link = page.getByRole("link", { name: "Open Clinic Setup" });
  await link.waitFor();
  expect(
    await page
      .getByRole("alert")
      .filter({ hasText: "Clinician access role" })
      .innerText(),
  ).toContain("set availability and add them to a service offering");
  expect(await link.getAttribute("href")).toBe("/clinic/facilities");
  await page.close();
});
it.each([false, true])(
  "Muse67 timecard configuration recovery respects capability denied=%s",
  async (denied) => {
    const page = await open("timecards" + (denied ? "&denied=1" : ""));
    await page
      .getByText(
        "Workforce settings have not been configured for this practice.",
        { exact: false },
      )
      .waitFor();
    const button = page.getByRole("button", {
      name: "Open workforce settings",
    });
    if (denied) {
      expect(await button.count()).toBe(0);
      expect(await page.locator("body").innerText()).toContain(
        "Ask a workforce settings administrator",
      );
    } else {
      await button.click();
      expect(
        await page.evaluate(
          () => (window as unknown as { qaDestination: string }).qaDestination,
        ),
      ).toBe("/clinic/workforce/settings");
    }
    await page.close();
  },
);
it("Muse68 explains approved-timecard prerequisite and offers Timecards recovery", async () => {
  const page = await open("payroll");
  const button = page.getByRole("button", { name: "Open Timecards" });
  await button.waitFor();
  expect(
    await page
      .getByRole("alert")
      .filter({ hasText: "No approved timecards" })
      .innerText(),
  ).toContain("No approved timecards are available.");
  expect(
    await page.getByRole("button", { name: "Preview export" }).isDisabled(),
  ).toBe(true);
  await button.click();
  expect(
    await page.evaluate(
      () => (window as unknown as { qaDestination: string }).qaDestination,
    ),
  ).toBe("/clinic/workforce/timecards");
  await page.close();
});
it("Muse88 activation entry explicitly asks for an invitation code", async () => {
  const page = await open("activation");
  const link = page.getByRole("link", {
    name: "Activate with invitation code",
  });
  await link.waitFor();
  expect(await link.getAttribute("href")).toBe("/workforce/activate");
  await page.close();
});
it("Muse119 completed clinic profile explicitly separates workforce settings", async () => {
  const page = await open("setup");
  const text = page.getByText(
    "Location profile setup is complete. Workforce settings are managed separately under Workforce.",
    { exact: true },
  );
  await text.waitFor();
  expect(await text.isVisible()).toBe(true);
  await page.close();
});
async function select(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
it.each(["success", "failure"])(
  "Muse122 PIN starts empty and clears after synthetic %s",
  async (outcome) => {
    const page = await open("badges&" + outcome);
    const pin = page.getByLabel("Optional PIN", { exact: true });
    await pin.waitFor();
    expect(await pin.inputValue()).toBe("");
    await select(page, "Employee", "Synthetic Alpha");
    await pin.fill("2468");
    await page.getByRole("button", { name: "Issue or replace badge" }).click();
    if (outcome === "success") await page.getByRole("dialog").waitFor();
    else
      await page
        .getByRole("alert")
        .filter({ hasText: "Synthetic badge refusal" })
        .waitFor();
    expect(await pin.inputValue()).toBe("");
    await page.close();
  },
);
it("Muse122 PIN clears when selecting another employee", async () => {
  const page = await open("badges");
  await select(page, "Employee", "Synthetic Alpha");
  const pin = page.getByLabel("Optional PIN", { exact: true });
  await pin.fill("2468");
  await select(page, "Employee", "Synthetic Beta");
  expect(await pin.inputValue()).toBe("");
  await page.close();
});
it("Muse122 PIN clears when selecting another site", async () => {
  const page = await open("badges");
  await select(page, "Employee", "Synthetic Alpha");
  const pin = page.getByLabel("Optional PIN", { exact: true });
  await pin.fill("2468");
  await select(page, "Location", "Synthetic Two");
  expect(await pin.inputValue()).toBe("");
  await page.close();
});

it("Muse67 configured employees can calculate and reload saved timecard hours", async () => {
  const page = await browser.newPage();
  const mutations: unknown[] = [];
  const card = {
    id: 67,
    employment_id: 7,
    employee_name: "Synthetic Timecard Employee",
    period_start: "2026-09-28",
    period_end: "2026-10-05",
    version_number: 1,
    status: "draft",
    unresolved_exceptions: [],
    source_digest: "a".repeat(64),
    lock_version: 0,
    settings_provenance: {},
    submitted_at: null,
    approved_at: null,
    snapshot: {
      period: { start: "2026-09-28", end: "2026-10-05" },
      segments: [],
      totals: {
        raw_minutes: 480,
        rounded_minutes: 480,
        paid_minutes: 480,
        regular_minutes: 480,
        overtime_minutes: 0,
      },
    },
  };
  let saved = false;
  try {
    await page.route(
      (url) => url.pathname.startsWith("/api/"),
      (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        let body: unknown;
        let status = 200;
        if (path === "/api/csrf") body = { csrf_token: "synthetic-only" };
        else if (path === "/api/clinic/workforce/adjustments")
          body = { adjustments: [] };
        else if (path === "/api/clinic/workforce/timecards")
          body = {
            employees: [{ id: 7, name: card.employee_name }],
            default_period_start: card.period_start,
            timecards: saved ? [card] : [],
          };
        else if (
          path === "/api/clinic/workforce/timecards/calculate" &&
          request.method() === "POST"
        ) {
          mutations.push(request.postDataJSON());
          saved = true;
          status = 201;
          body = { timecard: card };
        } else {
          status = 404;
          body = { error: "Unexpected synthetic API request" };
        }
        return route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      },
    );
    await page.goto(base + "qa-workforce?mode=timecards");
    const calculate = page.getByRole("button", {
      name: "Calculate",
      exact: true,
    });
    await expect.poll(() => calculate.isEnabled()).toBe(true);
    expect(await page.getByLabel("Week starting").inputValue()).toBe(
      card.period_start,
    );
    await calculate.click();
    await page
      .getByText(
        "The employee timecard was calculated from saved workforce records.",
        { exact: true },
      )
      .waitFor();
    await page
      .getByRole("heading", { name: card.employee_name, exact: true })
      .waitFor();
    expect(mutations).toEqual([
      { employment_id: 7, site_id: 1, period_start: card.period_start },
    ]);
    const paid = page.getByText("Paid", { exact: true }).first().locator("..");
    expect(await paid.innerText()).toContain("8h 00m");
    await page.reload();
    await page
      .getByRole("heading", { name: card.employee_name, exact: true })
      .waitFor();
    expect(
      await page
        .getByText("Paid", { exact: true })
        .first()
        .locator("..")
        .innerText(),
    ).toContain("8h 00m");
    expect(mutations).toHaveLength(1);
  } finally {
    await page.close();
  }
});

it("Muse67 no eligible employees offers management recovery and blocks calculation", async () => {
  const page = await open("timecards&empty=1");
  const button = page.getByRole("button", { name: "Manage employees" });
  await button.waitFor();
  expect(
    await page
      .getByRole("button", { name: "Calculate", exact: true })
      .isDisabled(),
  ).toBe(true);
  expect(
    await page
      .getByRole("alert")
      .filter({ hasText: "No active employees" })
      .innerText(),
  ).toContain("Activate or link an employee and assign this location.");
  await button.click();
  expect(
    await page.evaluate(
      () => (window as unknown as { qaDestination: string }).qaDestination,
    ),
  ).toBe("/clinic/workforce/employees");
  await page.close();
});

it.each([
  [
    "badges",
    "The one-time enrollment code creates a secure, clock-only session. It does not sign the device into the clinic workspace.",
  ],
  [
    "payroll",
    "Custom CSV. Column headings and employee payroll IDs are saved for this location. Enable payroll exports in Location rules before generating a file.",
  ],
])(
  "Muse18 %s renders the complete explanatory paragraph without clipping",
  async (mode, sentence) => {
    const page = await open(mode);
    try {
      const paragraph = page.getByText(sentence, { exact: true });
      await paragraph.waitFor();
      await paragraph.scrollIntoViewIfNeeded();
      expect(await paragraph.isVisible()).toBe(true);
      expect((await paragraph.innerText()).replace(/\s+/g, " ").trim()).toBe(
        sentence,
      );
      expect(
        await paragraph.evaluate((element) => {
          const style = getComputedStyle(element);
          return (
            element.scrollWidth <= element.clientWidth + 1 &&
            element.scrollHeight <= element.clientHeight + 1 &&
            style.textOverflow !== "ellipsis" &&
            ["none", "", "0"].includes(style.webkitLineClamp)
          );
        }),
      ).toBe(true);
    } finally {
      await page.close();
    }
  },
);
