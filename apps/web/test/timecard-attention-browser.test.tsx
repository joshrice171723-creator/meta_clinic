import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
let server: ViteDevServer, browser: Browser, base: string;
const makeCard = (
  id: number,
  status = "draft",
  version_number = 1,
  employment_id = id,
  unresolved_exceptions: string[] = [],
) => ({
  id,
  employment_id,
  employee_name: `Synthetic ${id}`,
  period_start: "2026-09-21",
  period_end: "2026-09-28",
  version_number,
  status,
  unresolved_exceptions,
  source_digest: "a".repeat(64),
  lock_version: 7,
  settings_provenance: {},
  submitted_at: null,
  approved_at: null,
  snapshot: {
    period: { start: "2026-09-21", end: "2026-09-28" },
    segments: [],
    totals: {
      raw_minutes: 0,
      rounded_minutes: 0,
      paid_minutes: 0,
      regular_minutes: null,
      overtime_minutes: null,
    },
  },
});
const cards = [
  makeCard(1, "submitted"),
  makeCard(2, "approved", 2, 1),
  makeCard(3, "submitted"),
  makeCard(4, "draft", 1, 4, ["missing_punch"]),
];
const correction = {
  id: 11,
  employment_id: 1,
  timecard_version_id: 1,
  status: "submitted",
  correction_type: "add_segment",
  proposed_changes: {},
  reason: "Synthetic pending correction",
  requested_at: "2026-09-30T12:00:00Z",
  reviewed_at: null,
  decision_reason: null,
  resulting_timecard_version_id: null,
  lock_version: 0,
};
beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root,
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "synthetic-timecard-attention",
        enforce: "pre",
        transform(_source, id) {
          if (id.endsWith("/features/clinic/Workspace.tsx"))
            return `export function useClinic(){return {capabilities:window.syntheticCapabilities,current_site:{id:1},sites:[{id:1,name:'Synthetic Main'},{id:2,name:'Synthetic Other'}]}}`;
          if (id.endsWith("/features/clinic/clinicNavigation.tsx"))
            return `export function useClinicNavigation(){return {navigate:()=>{}}}`;
        },
        resolveId(source) {
          if (source === "/attention-entry.js") return "\0attention-entry";
          if (source === "../clinic/Workspace") return "\0clinic-fixture";
          if (source === "../clinic/clinicNavigation") return "\0nav-fixture";
        },
        load(id) {
          if (id === "\0clinic-fixture")
            return `export function useClinic(){return {capabilities:window.syntheticCapabilities,current_site:{id:1},sites:[{id:1,name:'Synthetic Main'},{id:2,name:'Synthetic Other'}]}}`;
          if (id === "\0nav-fixture")
            return `export function useClinicNavigation(){return {navigate:()=>{}}}`;
          if (id === "\0attention-entry")
            return `import React from 'react';import {createRoot} from 'react-dom/client';import {TimecardReviewPage} from '/src/features/workforce/TimecardReviewPage.tsx';createRoot(document.getElementById('root')).render(React.createElement(TimecardReviewPage));`;
        },
        configureServer(vite) {
          vite.middlewares.use((req, res, next) => {
            if (req.url === "/attention") {
              res.setHeader("Content-Type", "text/html");
              res.end(
                '<div id="root"></div><script type="module" src="/attention-entry.js"></script>',
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
    executablePath: ["/usr/bin/chromium", chromium.executablePath()].find(
      existsSync,
    ),
    args: ["--no-sandbox"],
  });
}, 60000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});
async function open(
  capabilities = {
    workforce_timecards_read: true,
    workforce_timecards_review: true,
    workforce_timecards_approve: true,
  },
) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  page.setDefaultTimeout(8000);
  await page.addInitScript((value) => {
    Object.assign(window, { syntheticCapabilities: value });
  }, capabilities);
  const writes: { path: string; body: unknown }[] = [];
  await page.route(/^http:\/\/127\.0\.0\.1:\d+\/api\//, async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET") {
      writes.push({ path: url.pathname, body: route.request().postDataJSON() });
      return route.fulfill({ json: {} });
    }
    if (url.pathname === "/api/csrf")
      return route.fulfill({ json: { csrf_token: "synthetic-only" } });
    if (url.pathname.endsWith("/adjustments"))
      return route.fulfill({ json: { adjustments: [correction] } });
    if (url.pathname.endsWith("/timecards"))
      return route.fulfill({
        json: {
          timecards: cards,
          employees: [],
          default_period_start: "2026-09-21",
        },
      });
    return route.abort();
  });
  await page.goto(`${base}attention`);
  return { page, writes };
}
async function select(page: Page, name: string) {
  await page.getByRole("combobox", { name: "Timecard view" }).click();
  await page.getByRole("option", { name, exact: true }).click();
}
it("filters actual latest cards and retains old-version correction actions without sending on selection", async () => {
  const { page, writes } = await open();
  try {
    await page
      .getByRole("heading", { name: "Synthetic 2", exact: true })
      .waitFor();
    expect(
      await page
        .getByRole("heading", { name: "Synthetic 1", exact: true })
        .count(),
    ).toBe(0);
    await select(page, "Submitted for approval (1)");
    await page
      .getByRole("heading", { name: "Synthetic 3", exact: true })
      .waitFor();
    expect(
      await page
        .getByRole("heading", { name: "Synthetic 2", exact: true })
        .count(),
    ).toBe(0);
    await select(page, "Recorded exceptions (1)");
    await page
      .getByRole("heading", { name: "Synthetic 4", exact: true })
      .waitFor();
    expect(
      await page
        .getByRole("button", { name: "Approve timecard", exact: true })
        .isEnabled(),
    ).toBe(false);
    await select(page, "Pending corrections (1)");
    await page
      .getByRole("heading", { name: "Synthetic 2", exact: true })
      .waitFor();
    await page
      .getByRole("heading", { name: "Correction request #11", exact: true })
      .waitFor();
    expect(writes).toEqual([]);
  } finally {
    await page.close();
  }
}, 60000);
it("uses the existing version-bound approval then refreshes the selected attention view", async () => {
  const { page, writes } = await open();
  try {
    await page
      .getByRole("heading", { name: "Synthetic 3", exact: true })
      .waitFor();
    await select(page, "Submitted for approval (1)");
    await page.route(/\/api\/clinic\/workforce\/timecards\?/, (route) =>
      route.fulfill({
        json: {
          timecards: [makeCard(3, "approved")],
          employees: [],
          default_period_start: "2026-09-21",
        },
      }),
    );
    await page
      .getByRole("button", { name: "Approve timecard", exact: true })
      .click();
    await page
      .getByText("No latest timecards match this attention view.", {
        exact: true,
      })
      .waitFor();
    expect(writes).toEqual([
      {
        path: "/api/clinic/workforce/timecards/3/approve",
        body: { lock_version: 7 },
      },
    ]);
  } finally {
    await page.close();
  }
}, 60000);
it("clears stale attention on failed refresh and recovers explicitly", async () => {
  const { page, writes } = await open();
  try {
    await page
      .getByRole("heading", { name: "Synthetic 3", exact: true })
      .waitFor();
    let failed = true;
    await page.route(/\/api\/clinic\/workforce\/timecards\?/, (route) =>
      route.fulfill(
        failed
          ? { status: 503, json: { error: "Synthetic read unavailable" } }
          : {
              json: {
                timecards: cards,
                employees: [],
                default_period_start: "2026-09-21",
              },
            },
      ),
    );
    await page
      .getByRole("button", { name: "Refresh timecard attention" })
      .click();
    await page
      .getByText("Synthetic read unavailable", { exact: true })
      .waitFor();
    expect(
      await page
        .getByRole("heading", { name: "Synthetic 3", exact: true })
        .count(),
    ).toBe(0);
    expect(
      await page
        .getByRole("button", { name: "Approve timecard", exact: true })
        .count(),
    ).toBe(0);
    failed = false;
    await page
      .getByRole("button", { name: "Refresh timecard attention" })
      .click();
    await page
      .getByRole("heading", { name: "Synthetic 3", exact: true })
      .waitFor();
    expect(writes).toEqual([]);
  } finally {
    await page.close();
  }
}, 60000);
it("shows unknown correction coverage on a failed read and withholds its filter", async () => {
  const { page } = await open();
  try {
    await page
      .getByRole("heading", { name: "Synthetic 3", exact: true })
      .waitFor();
    await select(page, "Pending corrections (1)");
    await page.route(/\/api\/clinic\/workforce\/adjustments\?/, (route) =>
      route.fulfill({
        status: 503,
        json: { error: "Synthetic corrections unavailable" },
      }),
    );
    await page
      .getByRole("button", { name: "Refresh timecard attention" })
      .click();
    await page
      .getByText("Pending correction count is unknown.", { exact: true })
      .waitFor();
    expect(
      await page
        .getByText("No latest timecards match this attention view.", {
          exact: true,
        })
        .count(),
    ).toBe(0);
    expect(
      await page
        .getByRole("heading", { name: "Synthetic 2", exact: true })
        .count(),
    ).toBe(0);
    await page.getByRole("combobox", { name: "Timecard view" }).click();
    expect(
      await page
        .getByRole("option", {
          name: "Pending corrections (unknown)",
          exact: true,
        })
        .getAttribute("aria-disabled"),
    ).toBe("true");
  } finally {
    await page.close();
  }
}, 60000);
it("does not read or offer controls without server-projected read access", async () => {
  const { page, writes } = await open({
    workforce_timecards_read: false,
    workforce_timecards_review: false,
    workforce_timecards_approve: false,
  });
  try {
    await page
      .getByText("Timecard read access is unavailable.", { exact: true })
      .waitFor();
    expect(await page.getByRole("combobox").count()).toBe(0);
    expect(writes).toEqual([]);
  } finally {
    await page.close();
  }
}, 60000);
it("ignores a delayed earlier-location read after changing location", async () => {
  const { page, writes } = await open();
  try {
    await page
      .getByRole("heading", { name: "Synthetic 3", exact: true })
      .waitFor();
    let release: (() => Promise<void>) | undefined;
    await page.route(/\/api\/clinic\/workforce\/timecards\?/, async (route) => {
      if (new URL(route.request().url()).searchParams.get("site_id") === "1") {
        release = async () => {
          await route
            .fulfill({
              json: {
                timecards: cards,
                employees: [],
                default_period_start: "2026-09-21",
              },
            })
            .catch(() => {});
        };
        return;
      }
      await route.fulfill({
        json: {
          timecards: [makeCard(8, "submitted")],
          employees: [],
          default_period_start: "2026-09-21",
        },
      });
    });
    await page
      .getByRole("button", { name: "Refresh timecard attention" })
      .click();
    await page
      .getByText("Loading timecard attention…", { exact: true })
      .waitFor();
    await page.getByRole("combobox", { name: "Location", exact: true }).click();
    await page
      .getByRole("option", { name: "Synthetic Other", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Synthetic 8", exact: true })
      .waitFor();
    expect(release).toBeDefined();
    await release!();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    expect(
      await page
        .getByRole("heading", { name: "Synthetic 3", exact: true })
        .count(),
    ).toBe(0);
    expect(
      await page
        .getByRole("heading", { name: "Synthetic 8", exact: true })
        .count(),
    ).toBe(1);
    expect(writes).toEqual([]);
  } finally {
    await page.close();
  }
}, 60000);
it("keeps attention read-only when correction and approval capabilities are absent", async () => {
  const { page, writes } = await open({
    workforce_timecards_read: true,
    workforce_timecards_review: false,
    workforce_timecards_approve: false,
  });
  try {
    await page
      .getByRole("heading", { name: "Synthetic 3", exact: true })
      .waitFor();
    await select(page, "Submitted for approval (1)");
    expect(
      await page
        .getByRole("button", { name: "Approve timecard", exact: true })
        .count(),
    ).toBe(0);
    expect(
      await page
        .getByRole("button", { name: "Add manager correction", exact: true })
        .count(),
    ).toBe(0);
    expect(
      await page
        .getByRole("heading", { name: "Correction request #11", exact: true })
        .count(),
    ).toBe(0);
    expect(writes).toEqual([]);
  } finally {
    await page.close();
  }
}, 60000);
