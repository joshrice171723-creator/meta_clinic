import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
const entry = "\0waitlist-original-61-78-entry.tsx";
const patient = {
  id: 801,
  display_name: "Synthetic Waitlist Patient",
  reference: "SYN-WAIT-801",
};
const site = {
  id: 4,
  code: "SYN-WAIT",
  name: "Synthetic eligible site",
  timezone_override: "UTC",
};
const clinician = { id: 9, name: "Synthetic eligible clinician" };
const visitType = { id: 7, name: "Synthetic active visit" };
const context = {
  user_id: 1,
  schema_version: "clinic-context-v1",
  policy_version: "clinic-authorization-v1",
  practice: { id: 81, name: "Synthetic waitlist practice", timezone: "UTC" },
  membership_id: 31,
  current_site: site,
  sites: [site],
  credentials: [],
  features: {
    site_specialty_configured: true,
    configured: true,
    finalized: true,
  },
  capabilities: {
    appointments_book: true,
    appointments_read: true,
    patient_identity_read: true,
  },
};
type Entry = {
  id: number;
  patient_id: number;
  patient_name: string;
  site_id: number;
  site_name: string;
  clinician_id: number;
  clinician_name: string;
  visit_type_id: number;
  visit_type_name: string;
  earliest_at: string;
  latest_at: string;
  duration_minutes: number;
  reason: string;
  state: string;
  recorded_state: string;
  version: number;
  created_at: string;
  offer_starts_at: string | null;
  offer_ends_at: string | null;
  offer_expires_at: string | null;
  appointment_id: number | null;
};
type Fixture = {
  entries: Entry[];
  cancellations: {
    id: number;
    status: string;
    site_id: number;
    clinician_id: number;
    starts_at: string;
    ends_at: string;
  }[];
  configured: boolean;
  posts: { path: string; body: any }[];
  unexpected: string[];
};
function fixture(): Fixture {
  return {
    entries: [],
    cancellations: [],
    configured: true,
    posts: [],
    unexpected: [],
  };
}

beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    cacheDir: fileURLToPath(
      new URL("../../../tmp/waitlist-original-61-78-cache", import.meta.url),
    ),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "waitlist-original-61-78-entry",
        resolveId: (id) => (id === entry ? entry : undefined),
        load(id) {
          if (id !== entry) return;
          // Real public Workspace/provider, WaitlistWorkspace, transport and MUI.
          // No Workspace alias, source transform, module stub or held dependency replacement.
          return [
            'import React from "react"; import {createRoot} from "react-dom/client";',
            'import {Workspace} from "/src/features/clinic/Workspace";',
            'import {WaitlistWorkspace} from "/src/features/clinic/WaitlistWorkspace";',
            'import {PatientWaitlistOffers} from "/src/features/patientPortal/PatientWaitlistOffers";',
            'createRoot(document.getElementById("root")).render(new URLSearchParams(location.search).has("portal")?React.createElement(PatientWaitlistOffers):React.createElement(Workspace,{user:{id:1,email_address:"synthetic-waitlist@example.invalid"},path:"/clinic/waitlist",search:"",environment:"test"},React.createElement(WaitlistWorkspace)));',
          ].join("\n");
        },
        configureServer(vite) {
          vite.middlewares.use((req, res, next) => {
            if (!req.url?.startsWith("/__waitlist_original_proof"))
              return next();
            res.setHeader("Content-Type", "text/html");
            res.end(
              '<!doctype html><html><body><div id="root"></div><script type="module" src="/@id/__x00__waitlist-original-61-78-entry.tsx"></script></body></html>',
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
  baseUrl = "http://127.0.0.1:" + address.port;
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || "/usr/bin/chromium",
    headless: true,
  });
}, 30000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

function entryFromBody(body: any): Entry {
  return {
    id: 1201,
    patient_id: Number(body.patient_id),
    patient_name: patient.display_name,
    site_id: Number(body.site_id),
    site_name: site.name,
    clinician_id: Number(body.clinician_id),
    clinician_name: clinician.name,
    visit_type_id: Number(body.visit_type_id),
    visit_type_name: visitType.name,
    earliest_at: body.earliest_at,
    latest_at: body.latest_at,
    duration_minutes: Number(body.duration_minutes),
    reason: body.reason,
    state: "waiting",
    recorded_state: "waiting",
    version: 0,
    created_at: new Date().toISOString(),
    offer_starts_at: null,
    offer_ends_at: null,
    offer_expires_at: null,
    appointment_id: null,
  };
}
async function routeApi(page: Page, state: Fixture) {
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      let body: unknown;
      let status = 200;
      if (request.method() === "GET") {
        body =
          path === "/api/csrf"
            ? { csrf_token: "synthetic-waitlist-proof" }
            : path === "/api/settings"
              ? {
                  user_id: 1,
                  appearance: { palette: "cobalt", mode: "light", version: 1 },
                }
              : path === "/api/clinic/context"
                ? context
                : path === "/api/clinic/waitlist"
                  ? {
                      entries: state.entries,
                      total: state.entries.length,
                      ranking:
                        "First requested, then entry ID; no inferred clinical priority.",
                      sites: [site],
                      clinicians: state.configured ? [clinician] : [],
                      visit_types: [visitType],
                      cancellations: state.cancellations,
                    }
                  : path === "/api/clinic/capacity"
                    ? {
                        rules: [],
                        timezone: "UTC",
                        site_availability: [],
                        can_block: false,
                      }
                    : path === "/api/patient_portal/waitlist"
                      ? {
                          entries: state.entries.map(
                            ({ patient_id, patient_name, reason, ...row }) =>
                              row,
                          ),
                          can_accept: true,
                          booking_requirement:
                            "Online scheduling requires an active membership. Request a call from the clinic.",
                        }
                      : path === "/api/clinic/patients/lookup"
                        ? { patients: [patient] }
                        : undefined;
      } else if (
        request.method() === "POST" &&
        path === "/api/clinic/waitlist"
      ) {
        const input = request.postDataJSON();
        state.posts.push({ path, body: input });
        state.entries = [entryFromBody(input.waitlist)];
        body = { entry: state.entries[0] };
        status = 201;
      } else if (
        request.method() === "POST" &&
        /^\/api\/clinic\/waitlist\/\d+\/transition$/.test(path)
      ) {
        const input = request.postDataJSON();
        state.posts.push({ path, body: input });
        const selected = state.entries.find((item) =>
          path.includes("/" + item.id + "/"),
        );
        if (selected && input.waitlist.action === "offer") {
          selected.state = selected.recorded_state = "offered";
          selected.version += 1;
          selected.offer_starts_at = input.waitlist.starts_at;
          selected.offer_ends_at = new Date(
            Date.parse(input.waitlist.starts_at) +
              selected.duration_minutes * 60000,
          ).toISOString();
          selected.offer_expires_at = input.waitlist.expires_at;
          body = { entry: selected };
        }
      }
      if (body === undefined) {
        state.unexpected.push(request.method() + " " + path);
        status = 500;
        body = { error: "Unexpected request in synthetic waitlist proof" };
      }
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    },
  );
}
async function choose(page: Page, label: string, name: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name, exact: true }).click();
}
function localInput(value: Date) {
  return value.toISOString().slice(0, 16);
}

it("#61 configured clinician enables an exact waitlist create and queue reload", async () => {
  const page = await browser.newPage({
    timezoneId: "UTC",
    viewport: { width: 1280, height: 1000 },
  });
  const state = fixture();
  state.configured = false;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await routeApi(page, state);
    await page.goto(baseUrl + "/__waitlist_original_proof");
    await page
      .getByRole("button", {
        name: "Add a patient to the waitlist",
        exact: true,
      })
      .click();
    await page
      .getByRole("heading", {
        name: "Add a patient to the waitlist",
        exact: true,
      })
      .waitFor();
    expect(
      await page
        .getByRole("button", { name: "Add to waitlist", exact: true })
        .isDisabled(),
    ).toBe(true);
    state.configured = true;
    await page.reload();
    await page
      .getByRole("button", {
        name: "Add a patient to the waitlist",
        exact: true,
      })
      .click();
    await page
      .getByRole("heading", {
        name: "Add a patient to the waitlist",
        exact: true,
      })
      .waitFor();
    await choose(page, "Site", site.name);
    await choose(page, "Clinician", clinician.name);
    await choose(page, "Visit type", visitType.name);
    await page
      .getByRole("combobox", { name: "Find patient", exact: true })
      .fill("Synthetic Waitlist");
    await page
      .getByRole("option", { name: /Synthetic Waitlist Patient/ })
      .click();
    const earliest = new Date(Date.now() + 2 * 86400000);
    earliest.setUTCHours(9, 0, 0, 0);
    const latest = new Date(earliest.getTime() + 2 * 3600000);
    await page
      .getByLabel("Earliest time", { exact: true })
      .fill(localInput(earliest));
    await page
      .getByLabel("Latest end", { exact: true })
      .fill(localInput(latest));
    await page
      .getByLabel("Scheduling reason or preferences", { exact: true })
      .fill("Synthetic eligible opening");
    expect(
      await page
        .getByRole("button", { name: "Add to waitlist", exact: true })
        .isDisabled(),
    ).toBe(false);
    await page
      .getByRole("button", { name: "Add to waitlist", exact: true })
      .click();
    await page
      .getByText("1. Synthetic Waitlist Patient", { exact: true })
      .waitFor();
    expect(state.posts).toHaveLength(1);
    const posted = state.posts[0].body.waitlist;
    expect(Number(posted.patient_id)).toBe(801);
    expect(Number(posted.site_id)).toBe(4);
    expect(Number(posted.clinician_id)).toBe(9);
    expect(Number(posted.visit_type_id)).toBe(7);
    expect(posted.earliest_at).toBe(earliest.toISOString());
    expect(posted.latest_at).toBe(latest.toISOString());
    expect(posted.request_key).toMatch(/^[0-9a-f-]{36}$/i);
    await page.reload();
    await page
      .getByText("1. Synthetic Waitlist Patient", { exact: true })
      .waitFor();
    expect(await page.getByText("waiting", { exact: true }).count()).toBe(1);
    expect(state.entries[0].id).toBe(1201);
    expect(state.posts).toHaveLength(1);
    expect(state.unexpected).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}, 30000);

it("#78 matching cancelled opening publishes an exact offer visible to staff and patient after reload", async () => {
  const page = await browser.newPage({
    timezoneId: "UTC",
    viewport: { width: 1280, height: 1000 },
  });
  const state = fixture();
  const starts = new Date(Date.now() + 2 * 86400000);
  starts.setUTCHours(10, 0, 0, 0);
  const ends = new Date(starts.getTime() + 30 * 60000);
  state.entries = [
    entryFromBody({
      patient_id: 801,
      site_id: 4,
      clinician_id: 9,
      visit_type_id: 7,
      earliest_at: new Date(starts.getTime() - 3600000).toISOString(),
      latest_at: new Date(ends.getTime() + 3600000).toISOString(),
      duration_minutes: 30,
      reason: "Synthetic cancellation recovery",
    }),
  ];
  state.cancellations = [
    {
      id: 901,
      status: "cancelled",
      site_id: 4,
      clinician_id: 9,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
    },
  ];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await routeApi(page, state);
    await page.goto(baseUrl + "/__waitlist_original_proof");
    await page
      .getByText("1. Synthetic Waitlist Patient", { exact: true })
      .waitFor();
    const opening = page.getByRole("button", {
      name: /^Use cancelled opening:/,
    });
    expect(await opening.count()).toBe(1);
    await opening.click();
    expect(
      await page.getByLabel("Offer date", { exact: true }).inputValue(),
    ).toBe(localInput(starts).slice(0, 10));
    expect(
      await page.getByLabel("Offer time", { exact: true }).inputValue(),
    ).toBe(localInput(starts).slice(11));
    const expiration = new Date(Date.now() + 3600000);
    expiration.setUTCSeconds(0, 0);
    await page
      .getByLabel("Accept-before date", { exact: true })
      .fill(localInput(expiration).slice(0, 10));
    await page
      .getByLabel("Accept-before time", { exact: true })
      .fill(localInput(expiration).slice(11));
    await page
      .getByRole("button", { name: "Hold time and publish offer", exact: true })
      .click();
    await page.getByText("offered", { exact: true }).waitFor();
    expect(state.posts).toHaveLength(1);
    expect(state.posts[0].path).toBe("/api/clinic/waitlist/1201/transition");
    const sent = state.posts[0].body.waitlist;
    expect(sent.action).toBe("offer");
    expect(sent.expected_version).toBe(0);
    expect(sent.starts_at).toBe(starts.toISOString());
    expect(sent.expires_at).toBe(expiration.toISOString());
    expect(sent.request_key).toMatch(/^[0-9a-f-]{36}$/i);
    await page.reload();
    await page.getByText("offered", { exact: true }).waitFor();
    expect(
      await page
        .getByRole("button", { name: /^Use cancelled opening:/ })
        .count(),
    ).toBe(0);
    expect(
      await page
        .getByRole("button", {
          name: "Record patient acceptance and book",
          exact: true,
        })
        .count(),
    ).toBe(1);

    await page.goto(baseUrl + "/__waitlist_original_proof?portal=1");
    await page
      .getByRole("heading", {
        name: "Waitlist and earlier openings",
        exact: true,
      })
      .waitFor();
    await page.getByText("offered", { exact: true }).waitFor();
    expect(await page.locator("body").textContent()).toContain(
      "Respond before",
    );
    expect(await page.locator("body").textContent()).toContain(clinician.name);
    expect(
      await page
        .getByRole("button", { name: "Accept and book", exact: true })
        .isDisabled(),
    ).toBe(false);
    expect(
      await page
        .getByRole("button", { name: "Decline this time", exact: true })
        .count(),
    ).toBe(1);
    await page.reload();
    await page.getByText("offered", { exact: true }).waitFor();
    expect(state.posts).toHaveLength(1);
    expect(state.unexpected).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}, 30000);
