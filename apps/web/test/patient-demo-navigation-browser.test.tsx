import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, transformWithOxc, type ViteDevServer } from "vite";
import {
  chromium,
  type Browser,
  type Dialog,
  type Page,
} from "playwright-core";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Actual three components; invented draft/outcome controls exercise their public
// blocker bridge. This is not an actual intake/payment or full App acceptance.
const root = fileURLToPath(new URL("../", import.meta.url));
const entry = `
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {DemoJourney} from '/src/features/demo/DemoJourney.tsx';
import {DemoFrameBoundary} from '/src/features/demo/DemoFrameBoundary.tsx';
import {PatientPortal} from '/src/features/patientPortal/PatientPortal.tsx';
import {useDemoNavigationBlocker} from '/src/features/demo/navigationBlockers.ts';
const readers = [];
const add = window.addEventListener.bind(window);
window.addEventListener = (type, reader, options) => {
  if(type === 'message') readers.push(reader);
  return add(type, reader, options);
};
window.qaSuspend = () => readers.forEach(reader => window.removeEventListener('message', reader));
window.qaRestore = () => readers.forEach(reader => add('message', reader));
function Workspace() {
  const [draft,setDraft] = useState('');
  const [outcome,setOutcome] = useState('');
  useDemoNavigationBlocker(() => ({blocked: Boolean(outcome), message: outcome || (draft ? 'Discard synthetic intake draft?' : null)}));
  return <DemoFrameBoundary>
    <section aria-label="Synthetic blocker controls">
      <label>Synthetic intake draft<input value={draft} onChange={e=>setDraft(e.target.value)}/></label>
      <button onClick={()=>setOutcome('Synthetic pending write')}>Pending outcome</button>
      <button onClick={()=>setOutcome('Synthetic unknown payment outcome')}>Unknown outcome</button>
      <button onClick={()=>setOutcome('')}>Resolve synthetic outcome</button>
    </section>
    <PatientPortal/>
  </DemoFrameBoundary>;
}
createRoot(document.getElementById('root')).render(
  location.pathname === '/demo' ? <DemoJourney/> :
  location.pathname === '/patient-portal' ? <Workspace/> : <h1>Synthetic Admin workspace</h1>
);
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
        name: "synthetic-patient-handshake",
        enforce: "pre",
        resolveId(id) {
          if (id === "/qa-patient-handshake.tsx")
            return "\0qa-patient-handshake.tsx";
        },
        async load(id) {
          if (id === "\0qa-patient-handshake.tsx") {
            return (await transformWithOxc(entry, "qa-patient-handshake.tsx"))
              .code;
          }
        },
        configureServer(vite) {
          vite.middlewares.use((req, res, next) => {
            const pathname = new URL(req.url || "/", "http://synthetic.invalid")
              .pathname;
            if (["/demo", "/patient-portal", "/clinic"].includes(pathname)) {
              res.setHeader("Content-Type", "text/html");
              res.end(
                '<div id="root"></div><script type="module" src="/qa-patient-handshake.tsx"></script>',
              );
              return;
            }
            // Never forward an un-intercepted fixture API request anywhere.
            if (pathname.startsWith("/api/")) {
              res.statusCode = 503;
              res.end("Synthetic API request was not intercepted");
              return;
            }
            next();
          });
        },
      },
    ],
  });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === "string")
    throw new Error("Missing fixture port");
  base = `http://127.0.0.1:${address.port}`;
  const executablePath = [
    process.env.BROWSER_EXECUTABLE_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/chromium",
    chromium.executablePath(),
  ].find((candidate) => candidate && existsSync(candidate));
  if (!executablePath)
    throw new Error("No configured browser executable available");
  browser = await chromium.launch({ executablePath, headless: true });
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

async function fixture() {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let actor = "patient";
  let lesson: string | null = "sandbox";
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  const run = () => ({
    active: true,
    run: {
      id: "synthetic-handshake-run",
      template_key: "primary_care",
      mode: actor === "patient" ? "patient" : "clinic",
      view: actor === "patient" ? "patient" : "clinic",
      clinic: {
        id: 700,
        name: "Synthetic handshake clinic",
        slug: "qa-handshake",
      },
      patient: { id: 701, name: "Synthetic Patient" },
      lesson_key: lesson,
      sandbox: true,
      account: {
        key: actor,
        label: actor === "patient" ? "Patient" : "Admin",
        user_id: actor === "patient" ? 701 : 702,
        portal: actor === "patient" ? "patient" : "clinic",
      },
      accounts: [
        { key: "patient", label: "Patient", available: true },
        { key: "admin", label: "Admin", available: true },
      ],
      lessons: [],
      steps: [
        {
          id: "sandbox",
          href: "/clinic",
          title: "Sandbox",
          description: "Synthetic workspace",
          status: "available",
          requires: [],
        },
      ],
    },
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const reply = (value: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(value),
      });
    if (request.method() === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      posts.push({ path, body });
      if (path === "/api/demo/run/view") {
        actor = String(body.account);
        return reply(run());
      }
      if (path === "/api/demo/lesson" && body.lesson_key === null) {
        lesson = null;
        return reply(run());
      }
      return reply({ error: "Unexpected synthetic mutation" }, 422);
    }
    if (path.endsWith("/csrf"))
      return reply({ csrf_token: "synthetic-handshake-csrf" });
    if (path === "/api/demo/run") return reply(run());
    if (path === "/api/patient_portal/context")
      return reply({
        schema_version: "patient-portal-context-v1",
        development_only: true,
        practice: {
          id: 700,
          name: "Synthetic handshake clinic",
          timezone: "America/Chicago",
        },
        patient: {
          id: 701,
          display_name: "Synthetic Patient",
          reference: "QA-HANDSHAKE",
        },
        balances: [],
        billing: {
          invoices: [],
          payments: [],
          pagination: {
            invoices: { next_cursor: null },
            payments: { next_cursor: null },
          },
        },
        capabilities: {
          billing_read: true,
          payment_collection: false,
          password_change: false,
        },
        notices: [],
      });
    if (path === "/api/patient_portal/visit_instructions")
      return reply({
        items: [],
        pagination: { page: 1, total: 0, per_page: 25 },
      });
    if (path === "/api/patient_portal/appointment_requests")
      return reply({
        upcoming_appointments: [],
        appointment_requests: [],
        options: {
          sites: [],
          visit_types: [],
          can_request_new_booking: false,
          booking_requirement: "Outside focused fixture",
          video_connection_ready: false,
        },
      });
    // Unselected patient workflows are intentionally unavailable, not fabricated.
    return reply({ error: "Outside focused synthetic handshake fixture" }, 503);
  });
  await page.goto(base + "/demo");
  const frame = page.frameLocator('iframe[name="clinic-demo-workspace"]');
  await frame.getByLabel("Synthetic intake draft").waitFor({ timeout: 30_000 });
  await frame
    .getByText("Welcome, Synthetic Patient", { exact: true })
    .waitFor();
  return { page, frame, posts, errors };
}

async function chooseAdmin(page: Page) {
  await page.getByRole("combobox", { name: "Account", exact: true }).click();
  await page.getByRole("option", { name: "Admin", exact: true }).click();
}

async function consent(
  page: Page,
  trigger: () => Promise<unknown>,
  accept: boolean,
  delay = 0,
) {
  const dialogPromise = page.waitForEvent("dialog");
  const action = trigger();
  const dialog: Dialog = await dialogPromise;
  expect(dialog.type()).toBe("confirm");
  expect(dialog.message()).toMatch(/discard|synthetic intake/i);
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  if (accept) await dialog.accept();
  else await dialog.dismiss();
  await action;
}

it("resumes Patient, preserves a declined draft, then explicitly approves Admin after five seconds", async () => {
  const { page, frame, posts, errors } = await fixture();
  try {
    await frame
      .getByLabel("Synthetic intake draft")
      .fill("Keep synthetic draft");
    await consent(page, () => chooseAdmin(page), false);
    await page.getByText(/Navigation was not approved/).waitFor();
    expect(posts).toEqual([]);
    expect(await frame.getByLabel("Synthetic intake draft").inputValue()).toBe(
      "Keep synthetic draft",
    );
    await consent(page, () => chooseAdmin(page), true, 6_000);
    await frame
      .getByRole("heading", { name: "Synthetic Admin workspace" })
      .waitFor();
    expect(posts).toEqual([
      {
        path: "/api/demo/run/view",
        body: {
          account: "admin",
          expected_run_id: "synthetic-handshake-run",
          expected_user_id: 701,
        },
      },
    ]);
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}, 60_000);

it("requires explicit consent for Back, and pending or unknown outcomes veto both paths", async () => {
  const { page, frame, posts, errors } = await fixture();
  const back = () =>
    page
      .getByRole("button", { name: "Back to clinic entry", exact: true })
      .click();
  let prompts = 0;
  const unexpected = async (dialog: Dialog) => {
    prompts++;
    await dialog.dismiss();
  };
  try {
    for (const state of ["Pending outcome", "Unknown outcome"]) {
      await frame.getByRole("button", { name: state, exact: true }).click();
      page.on("dialog", unexpected);
      await chooseAdmin(page);
      await page.getByText(/Navigation was not approved/).waitFor();
      await back();
      await expect
        .poll(() =>
          page
            .getByRole("button", { name: "Back to clinic entry" })
            .isEnabled(),
        )
        .toBe(true);
      page.off("dialog", unexpected);
      expect(prompts).toBe(0);
      expect(posts).toEqual([]);
    }
    await frame
      .getByRole("button", { name: "Resolve synthetic outcome" })
      .click();
    await consent(page, back, false);
    expect(posts).toEqual([]);
    await consent(page, back, true);
    await page.waitForFunction(
      () => !document.querySelector('iframe[name="clinic-demo-workspace"]'),
    );
    expect(posts).toEqual([
      { path: "/api/demo/lesson", body: { lesson_key: null, restart: false } },
    ]);
    expect(errors).toEqual([]);
  } finally {
    page.off("dialog", unexpected);
    await page.close();
  }
}, 60_000);

it("reports missing frame confirmation and retries only a fresh handshake", async () => {
  const { page, frame, posts, errors } = await fixture();
  try {
    await frame
      .getByLabel("Synthetic intake draft")
      .fill("Unchanged on timeout");
    const workspace = page
      .frames()
      .find((candidate) => candidate.name() === "clinic-demo-workspace")!;
    await workspace.evaluate("window.qaSuspend()");
    await chooseAdmin(page);
    await page
      .getByRole("button", { name: "Retry confirmation" })
      .waitFor({ timeout: 8_000 });
    expect(posts).toEqual([]);
    expect(await frame.getByLabel("Synthetic intake draft").inputValue()).toBe(
      "Unchanged on timeout",
    );
    await workspace.evaluate("window.qaRestore()");
    await consent(
      page,
      () => page.getByRole("button", { name: "Retry confirmation" }).click(),
      true,
    );
    await frame
      .getByRole("heading", { name: "Synthetic Admin workspace" })
      .waitFor();
    expect(posts).toHaveLength(1);
    expect(posts[0].path).toBe("/api/demo/run/view");
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}, 60_000);
