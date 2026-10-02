import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, transformWithOxc, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page, type Route } from "playwright-core";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// Actual TrackingBoardPage, API client, request helpers, and MUI dialog.
// Only clinic context/realtime are stubbed; all HTTP mutations are intercepted.
const root = fileURLToPath(new URL("../", import.meta.url));
let server: ViteDevServer;
let browser: Browser;
let origin: string;
const entry = "\0provider-intake-fixture.tsx";

beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root,
    cacheDir: resolve(
      root,
      "../../tmp/provider-intake-dialog-runtime/vite-cache",
    ),
    server: { host: "127.0.0.1", port: 0, hmr: false },
    oxc: { jsx: { runtime: "automatic" } },
    plugins: [
      {
        name: "controlled-provider-intake-dialog",
        enforce: "pre",
        resolveId(id, importer) {
          if (id === entry) return entry;
          if (!importer?.endsWith("/TrackingBoardPage.tsx")) return;
          if (id === "./Workspace") return "\0provider-fixture-clinic";
          if (id === "./ClinicRealtime") return "\0provider-fixture-realtime";
        },
        async load(id) {
          if (id === "\0provider-fixture-clinic")
            return "export const useClinic=()=>({practice:{id:1,timezone:'UTC'},current_clinician_profile_id:null,capabilities:{patients:true,encounters_assign_provider:true}});";
          if (id === "\0provider-fixture-realtime")
            return "export const useClinicRealtimeTopic=()=>{};";
          if (id !== entry) return;
          return (
            await transformWithOxc(
              'import React from "react";import {createRoot} from "react-dom/client";import {TrackingBoardPage} from "/src/features/clinic/TrackingBoardPage";import "/src/features/clinic/trackingBoard.css";createRoot(document.getElementById("root")).render(<div className="clinic-theme"><TrackingBoardPage /></div>);',
              "provider-intake-fixture.tsx",
              { lang: "tsx", jsx: { runtime: "automatic" } },
            )
          ).code;
        },
        configureServer(vite) {
          vite.middlewares.use(
            "/provider-intake-fixture",
            async (_req, res) => {
              res.setHeader("Content-Type", "text/html");
              res.end(
                await vite.transformIndexHtml(
                  "/provider-intake-fixture",
                  '<title>Synthetic provider/intake recovery fixture</title><div id="root"></div><script type="module" src="/@id/__x00__provider-intake-fixture.tsx"></script>',
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
  origin = "http://127.0.0.1:" + address.port;
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.BROWSER_EXECUTABLE_PATH ||
      (process.platform === "win32"
        ? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
        : "/usr/bin/chromium"),
  });
}, 30000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
}, 30000);

function board(mode: "claim" | "release") {
  return {
    as_of: "2030-02-04T10:35:00Z",
    truncated: false,
    eligible_providers: [21, 22].map((id) => ({
      clinician_profile_id: String(id),
      display_name: "Synthetic provider " + id,
      site_ids: ["15"],
    })),
    visits: [
      {
        id: 991,
        row_type: "encounter",
        operational_state: "unrecorded",
        patient_id: 992,
        encounter_id: 991,
        chart_status: "unopened",
        provider_assignment_available: true,
        patient: {
          id: 992,
          display_name: "Synthetic Dialog Patient",
          reference: "SYN-992",
        },
        encounter: {
          id: 991,
          status: "open",
          started_at: "2030-02-04T10:00:00Z",
          ended_at: null,
          site_id: "15",
          site_code: "SYN",
          room_id: null,
          room_code: "SYN-R1",
        },
        appointment: null,
        care_summary: null,
        provider: {
          clinician_profile_id: "21",
          display_name: "Synthetic provider 21",
          token: "provider-20",
        },
        intake_ownership: {
          participant_id: "11",
          token: "lease-11",
          owner: { membership_id: "7", display_name: "Synthetic nurse" },
          lease_expires_at: "2030-02-04T10:10:00Z",
          state: mode === "claim" ? "stale" : "claimed",
          claim_available: mode === "claim",
          release_available: mode === "release",
        },
      },
    ],
  };
}
type Mutation = { path: string; body: Record<string, any> };
async function open(
  mode: "claim" | "release",
  respond: (route: Route, request: Mutation) => Promise<void>,
) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
  });
  page.setDefaultTimeout(8000);
  const errors: string[] = [],
    unexpected: string[] = [],
    mutations: Mutation[] = [];
  const data = board(mode);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (url.origin !== origin) {
      unexpected.push(req.method() + " " + url.origin + url.pathname);
      return route.abort();
    }
    if (!url.pathname.startsWith("/api/")) {
      if (req.method() === "GET") return route.continue();
    } else if (req.method() === "GET" && url.pathname === "/api/csrf") {
      return route.fulfill({
        json: { csrf_token: "synthetic-fixture-not-a-credential" },
      });
    } else if (
      req.method() === "GET" &&
      url.pathname === "/api/clinic/tracking_board"
    ) {
      return route.fulfill({ json: data });
    } else if (
      req.method() === "POST" &&
      [
        "/api/clinic/encounters/991/provider_assignment",
        "/api/clinic/encounters/991/intake_ownership/claim",
        "/api/clinic/encounters/991/intake_ownership/release",
      ].includes(url.pathname)
    ) {
      const request = { path: url.pathname, body: req.postDataJSON() };
      mutations.push(request);
      return respond(route, request);
    }
    unexpected.push(req.method() + " " + url.pathname);
    return route.abort();
  });
  await page.goto(origin + "/provider-intake-fixture");
  await page
    .getByRole("button", {
      name: /Manage assignment for Synthetic Dialog Patient/,
    })
    .click();
  await page.getByRole("dialog", { name: "Manage assignment" }).waitFor();
  return { page, data, mutations, errors, unexpected };
}
function gate() {
  let finish!: () => void;
  const promise = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return { promise, finish };
}
async function flush(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}
async function dismissalBlocked(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Manage assignment" });
  expect(
    await dialog
      .getByRole("button", { name: "Cancel", exact: true })
      .isDisabled(),
  ).toBe(true);
  // Native click attempts the disabled Cancel without bypassing browser semantics.
  await dialog
    .getByRole("button", { name: "Cancel", exact: true })
    .evaluate((button) => (button as HTMLButtonElement).click());
  await page.keyboard.press("Escape");
  await page.mouse.click(4, 4); // Outside the centered MUI paper: real backdrop dismissal.
  await flush(page);
  expect(await dialog.isVisible()).toBe(true);
}

it.each(["claim", "release"] as const)(
  "pending %s retains the dialog/error and excludes provider save",
  async (mode) => {
    const pending = gate();
    const h = await open(mode, async (route) => {
      await pending.promise;
      await route.fulfill({
        status: 409,
        json: { error: "Synthetic intake conflict", code: "stale" },
      });
    });
    try {
      const dialog = h.page.getByRole("dialog", { name: "Manage assignment" });
      await dialog
        .getByLabel("Provider", { exact: true })
        .selectOption("api-provider-22");
      await dialog
        .getByRole("button", {
          name: mode === "claim" ? "Claim intake" : "Release intake",
          exact: true,
        })
        .click();
      await expect.poll(() => h.mutations.length).toBe(1);
      expect(h.mutations[0].path).toBe(
        "/api/clinic/encounters/991/intake_ownership/" + mode,
      );
      expect(h.mutations[0].body.ownership.expected_token).toBe("lease-11");
      expect(h.mutations[0].body.ownership.request_key).toEqual(
        expect.any(String),
      );
      await dismissalBlocked(h.page);
      expect(
        await dialog.getByLabel("Provider", { exact: true }).isDisabled(),
      ).toBe(true);
      const save = dialog.getByRole("button", {
        name: "Assign provider",
        exact: true,
      });
      expect(await save.isDisabled()).toBe(true);
      await save.evaluate((button) => (button as HTMLButtonElement).click());
      expect(h.mutations).toHaveLength(1);
      pending.finish();
      await dialog
        .getByRole("alert")
        .filter({ hasText: "Synthetic intake conflict" })
        .waitFor();
      expect(await dialog.isVisible()).toBe(true);
      expect(
        await dialog.getByLabel("Provider", { exact: true }).inputValue(),
      ).toBe("api-provider-22");
      expect(await save.isEnabled()).toBe(true);
      expect(h.errors).toEqual([]);
      expect(h.unexpected).toEqual([]);
    } finally {
      pending.finish();
      await h.page.close();
    }
  },
  15000,
);

it.each(["claim", "release"] as const)(
  "pending provider assignment excludes %s and dismissal",
  async (mode) => {
    const pending = gate();
    const h = await open(mode, async (route) => {
      await pending.promise;
      await route.fulfill({
        status: 409,
        json: { error: "Synthetic provider conflict" },
      });
    });
    try {
      const dialog = h.page.getByRole("dialog", { name: "Manage assignment" });
      await dialog
        .getByLabel("Provider", { exact: true })
        .selectOption("api-provider-22");
      await dialog
        .getByRole("button", { name: "Assign provider", exact: true })
        .click();
      await expect.poll(() => h.mutations.length).toBe(1);
      await dismissalBlocked(h.page);
      const intake = dialog.getByRole("button", {
        name: mode === "claim" ? "Claim intake" : "Release intake",
        exact: true,
      });
      expect(await intake.isDisabled()).toBe(true);
      await intake.evaluate((button) => (button as HTMLButtonElement).click());
      expect(h.mutations).toHaveLength(1);
      pending.finish();
      await dialog
        .getByRole("alert")
        .filter({ hasText: "Assignment changed" })
        .waitFor();
      expect(h.errors).toEqual([]);
      expect(h.unexpected).toEqual([]);
    } finally {
      pending.finish();
      await h.page.close();
    }
  },
  15000,
);

it("unknown provider outcome retains exact identity, token and key for explicit retry", async () => {
  let attempts = 0;
  const h = await open("claim", async (route, request) => {
    expect(request.path).toBe("/api/clinic/encounters/991/provider_assignment");
    if (++attempts === 1)
      return route.fulfill({
        status: 503,
        json: {
          error: "Synthetic outcome unknown",
          code: "outcome_unconfirmed",
        },
      });
    return route.fulfill({
      json: { assignment: { participant_id: "23", token: "provider-23" } },
    });
  });
  try {
    const dialog = h.page.getByRole("dialog", { name: "Manage assignment" });
    await dialog
      .getByLabel("Provider", { exact: true })
      .selectOption("api-provider-22");
    await dialog
      .getByRole("button", { name: "Assign provider", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Retry assignment", exact: true })
      .waitFor();
    await dismissalBlocked(h.page);
    expect(
      await dialog.getByLabel("Provider", { exact: true }).isDisabled(),
    ).toBe(true);
    expect(
      await dialog
        .getByRole("button", { name: "Claim intake", exact: true })
        .isDisabled(),
    ).toBe(true);
    expect(h.mutations).toHaveLength(1); // No automatic replay.
    expect(h.mutations[0].body.assignment).toMatchObject({
      patient_id: 992,
      clinician_profile_id: "22",
      expected_token: "provider-20",
      unassign: false,
    });
    expect(h.mutations[0].body.assignment.request_key).toEqual(
      expect.any(String),
    );
    expect(h.mutations[0].body.assignment.request_key.length).toBeGreaterThan(
      0,
    );
    await dialog
      .getByRole("button", { name: "Retry assignment", exact: true })
      .click();
    await expect.poll(() => h.mutations.length).toBe(2);
    expect(h.mutations[1]).toEqual(h.mutations[0]);
    await dialog.waitFor({ state: "hidden" });
    expect(h.errors).toEqual([]);
    expect(h.unexpected).toEqual([]);
  } finally {
    await h.page.close();
  }
}, 15000);
