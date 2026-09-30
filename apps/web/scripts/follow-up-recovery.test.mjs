// Focused synthetic component acceptance using the existing Vite/Playwright tools.
// Run: node --test scripts/follow-up-recovery.test.mjs
// Set BROWSER_EXECUTABLE_PATH when Chromium is not at /usr/bin/chromium.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright-core";

const componentPath = "apps/web/src/features/clinic/EncounterFollowUp.tsx";
const repository = fileURLToPath(new URL("../../../", import.meta.url));
const baseline = process.env.FOLLOW_UP_TEST_REVISION;
if (baseline && !/^[a-f0-9]{40}$/.test(baseline))
  throw new Error("FOLLOW_UP_TEST_REVISION must be an exact commit SHA");
const componentSource = baseline
  ? execFileSync("git", ["show", `${baseline}:${componentPath}`], {
      cwd: repository,
      encoding: "utf8",
    })
  : readFileSync(
      new URL("../src/features/clinic/EncounterFollowUp.tsx", import.meta.url),
      "utf8",
    );
console.log(
  JSON.stringify({
    component_revision: baseline || "working-tree",
    component_sha256: createHash("sha256")
      .update(componentSource)
      .digest("hex"),
    test_sha256: createHash("sha256")
      .update(readFileSync(fileURLToPath(import.meta.url)))
      .digest("hex"),
  }),
);

const completed = {
  id: 14,
  patient_id: 7,
  encounter_id: 9,
  source_kind: "in_person",
  status: "completed",
  recorded_status: "completed",
  plan: "Arrange review of synthetic goals",
  outcome: "Synthetic previous contact completed",
  due_at: "2026-10-14T15:00:00Z",
  follow_up_appointment: null,
  assigned_to_membership_id: 7,
  completed_at: "2026-09-29T15:00:00Z",
  version: 4,
  updated_at: "2026-09-29T15:00:00Z",
};
const reopened = {
  ...completed,
  status: "needed",
  recorded_status: "needed",
  outcome: "",
  completed_at: null,
  version: 5,
};
const second = {
  ...reopened,
  id: 15,
  patient_id: 8,
  encounter_id: 10,
  plan: "Second synthetic patient's plan",
  due_at: "2026-11-03T12:30:00Z",
  assigned_to_membership_id: 8,
  version: 12,
};
const appointment = {
  id: 22,
  status: "scheduled",
  starts_at: "2026-10-20T15:00:00Z",
  ends_at: "2026-10-20T15:30:00Z",
  visit_modality: "in_person",
};
const options = {
  follow_up_appointments: [appointment],
  eligible_assignees: [
    { membership_id: 7, label: "Synthetic clinician" },
    { membership_id: 8, label: "Synthetic covering staff" },
  ],
};
const harness = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {EncounterFollowUpPanel} from '/src/features/clinic/EncounterFollowUp.tsx';
const root=createRoot(document.getElementById('root'));
window.changed=[];
window.switchChart=(patient=7, encounter=9)=>root.render(React.createElement(
  EncounterFollowUpPanel, {patient:{id:patient,display_name:'Synthetic Patient '+patient},
  encounter:{id:encounter,patient_id:patient,status:'completed'},timezone:'UTC',
  onChanged:()=>window.changed.push(encounter)}));
window.switchChart();`;
const server = await createServer({
  root: fileURLToPath(new URL("../", import.meta.url)),
  configFile: false,
  server: { host: "127.0.0.1", port: 0, strictPort: true },
  plugins: [
    {
      name: "follow-up-synthetic-component-test",
      enforce: "pre",
      resolveId(id) {
        if (id === "virtual:follow-up-test") return "\0" + id;
      },
      load(id) {
        if (id === "\0virtual:follow-up-test") return harness;
      },
      transform(_source, id) {
        if (id.endsWith("/features/clinic/EncounterFollowUp.tsx"))
          return componentSource;
        if (id.endsWith("/features/clinic/Workspace.tsx"))
          return "export const useClinic=()=>({capabilities:{encounters:true}});";
      },
      configureServer(vite) {
        vite.middlewares.use(async (request, response, next) => {
          if (request.url !== "/") return next();
          response.setHeader("Content-Type", "text/html");
          response.end(
            await vite.transformIndexHtml(
              "/",
              '<html><body><div id="root"></div><script type="module" src="/@id/__x00__virtual:follow-up-test"></script></body></html>',
            ),
          );
        });
      },
    },
  ],
});
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
after(async () => {
  await browser.close();
  await server.close();
});

async function fixture(t, { initial = completed, unknown = false } = {}) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    timezoneId: "UTC",
  });
  page.setDefaultTimeout(4000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(async () => {
    if (t.error) {
      console.error(await page.locator("body").innerText());
      console.error(
        JSON.stringify({ official: state.official, writes: state.writes }),
      );
    }
    await page.close();
    assert.deepEqual(errors, [], "No browser exceptions");
  });
  const state = {
    records: new Map([
      [9, initial],
      [10, second],
    ]),
    drafts: new Map(),
    writes: [],
    official: [],
    unknown,
    held: null,
  };
  // Real resource/recovery hooks and API client; only HTTP outcomes are fixtures.
  await page.route(`${origin}/api/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    let response;
    let status = 200;
    if (url.pathname === "/api/csrf") {
      response = { csrf_token: "synthetic-csrf" };
    } else if (url.pathname.includes("/working_drafts/")) {
      const id = Number(url.searchParams.get("encounter_id"));
      const previous = state.drafts.get(id) ?? { version: 0, payload: null };
      let draft = previous;
      if (method === "PUT") {
        const body = request.postDataJSON();
        state.writes.push({ id, body });
        draft = { version: previous.version + 1, payload: body.payload };
        state.drafts.set(id, draft);
      }
      response = {
        ...draft,
        kind: "follow_up",
        patient_id: id === 9 ? 7 : 8,
        encounter_id: id,
        record_id: null,
        scope: "main",
        updated_at: null,
      };
    } else {
      const id = url.pathname.includes("/operations/")
        ? 9
        : Number(url.pathname.split("/")[4]);
      const previous = state.records.get(id);
      if (method !== "GET") {
        const body = request.postDataJSON().follow_up;
        state.official.push({ id, method, body });
        const next =
          method === "PATCH"
            ? reopened
            : {
                ...previous,
                status: body.status,
                recorded_status: body.status,
                plan: body.plan,
                due_at: body.follow_up_appointment_id
                  ? appointment.starts_at
                  : (body.due_at ?? null),
                follow_up_appointment: body.follow_up_appointment_id
                  ? appointment
                  : null,
                assigned_to_membership_id: body.assigned_to_membership_id,
                version: previous.version + 1,
              };
        state.records.set(id, next);
        response = { follow_up: next };
        if (state.unknown) {
          status = 503;
          response = {
            error: "Synthetic response lost after commit",
            code: "outcome_unconfirmed",
          };
        }
      } else response = { follow_up: previous, options };
      if (state.held?.method === method) {
        const hold = state.held;
        state.held = null;
        hold.started.resolve();
        await hold.release.promise;
      }
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
  await page.goto(origin);
  await page.getByText("Encounter follow-up", { exact: true }).waitFor();
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll("button")].find((item) =>
      /^(Reopen follow-up|Save follow-up)$/.test(item.textContent),
    );
    return button && !button.disabled;
  });
  return { page, state };
}

async function expectFields(page, record) {
  assert.equal(
    await page.getByRole("combobox", { name: "Follow-up status" }).innerText(),
    record.status === "arranged" ? "Appointment arranged" : "Follow-up needed",
  );
  assert.equal(
    await page.getByRole("textbox", { name: "Follow-up plan" }).inputValue(),
    record.plan,
  );
  assert.equal(
    await page.getByRole("combobox", { name: "Responsible staff" }).innerText(),
    record.assigned_to_membership_id === 7
      ? "Synthetic clinician"
      : "Synthetic covering staff",
  );
  if (record.status === "needed")
    assert.equal(
      await page.getByLabel("Due by", { exact: true }).inputValue(),
      record.due_at.slice(0, 16),
    );
  else
    assert.match(
      await page
        .getByRole("combobox", { name: "Arranged appointment" })
        .innerText(),
      /in person/,
    );
}

async function reconcile(page) {
  await page
    .getByText("The follow-up outcome is unknown.", { exact: false })
    .waitFor();
  await page
    .getByRole("button", { name: "Check current status", exact: true })
    .click();
  await page
    .getByText("The saved follow-up was confirmed.", { exact: true })
    .waitFor();
}

for (const unknown of [false, true]) {
  test(`${unknown ? "unknown/reconciled" : "normal"} reopen adopts every confirmed field and version`, async (t) => {
    const { page, state } = await fixture(t, { unknown });
    await page
      .getByRole("button", { name: "Reopen follow-up", exact: true })
      .click();
    if (unknown) await reconcile(page);
    else await page.getByText("Follow-up reopened.", { exact: true }).waitFor();
    await expectFields(page, reopened);
    assert.equal(state.drafts.get(9).payload, null, "Pending recovery cleared");
    state.unknown = false;
    await page
      .getByRole("button", { name: "Save follow-up", exact: true })
      .click();
    await page.getByText("Follow-up plan saved.", { exact: true }).waitFor();
    const body = state.official.at(-1).body;
    assert.equal(body.status, "needed");
    assert.equal(body.plan, reopened.plan);
    assert.equal(body.due_at, "2026-10-14T15:00:00.000Z");
    assert.equal(body.assigned_to_membership_id, 7);
    assert.equal(body.expected_version, 5);
    assert.notEqual(body.request_key, state.official[0].body.request_key);
    assert.equal(body.follow_up_appointment_id, undefined);
  });
}

test("unknown arranged save reconciles appointment, plan, owner and version", async (t) => {
  const { page, state } = await fixture(t, {
    initial: reopened,
    unknown: true,
  });
  await page
    .getByRole("textbox", { name: "Follow-up plan" })
    .fill(`  ${reopened.plan}  `);
  await page.getByRole("combobox", { name: "Follow-up status" }).click();
  await page
    .getByRole("option", { name: "Appointment arranged", exact: true })
    .click();
  await page.getByRole("combobox", { name: "Arranged appointment" }).click();
  await page.getByRole("option", { name: /in person/ }).click();
  await page.getByRole("combobox", { name: "Responsible staff" }).click();
  await page
    .getByRole("option", { name: "Synthetic covering staff", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save follow-up", exact: true })
    .click();
  await reconcile(page);
  await expectFields(page, state.records.get(9));
  state.unknown = false;
  await page
    .getByRole("button", { name: "Save follow-up", exact: true })
    .click();
  await page.getByText("Follow-up plan saved.", { exact: true }).waitFor();
  assert.equal(state.official.at(-1).body.follow_up_appointment_id, 22);
  assert.equal(state.official.at(-1).body.expected_version, 6);
  assert.equal(state.official.at(-1).body.assigned_to_membership_id, 8);
});

test("unconfirmed unchanged record retains the exact request across reload and retry", async (t) => {
  const { page, state } = await fixture(t, { unknown: true });
  await page
    .getByRole("button", { name: "Reopen follow-up", exact: true })
    .click();
  await page
    .getByText("The follow-up outcome is unknown.", { exact: false })
    .waitFor();
  const original = state.official[0].body;
  state.records.set(9, completed);
  await page.reload();
  await page
    .getByText("A saved follow-up attempt was restored.", { exact: false })
    .waitFor();
  await page
    .getByRole("button", { name: "Check current status", exact: true })
    .click();
  await page.getByText("Retry the exact request.", { exact: false }).waitFor();
  assert.deepEqual(
    state.drafts.get(9).payload.pendingRequest.body.follow_up,
    original,
  );
  state.unknown = false;
  await page
    .getByRole("button", { name: "Retry same request", exact: true })
    .click();
  await page.getByText("Follow-up reopened.", { exact: true }).waitFor();
  assert.deepEqual(state.official.at(-1).body, original);
  await expectFields(page, reopened);
});

test("unmatched newer record keeps local edits and recovery for review", async (t) => {
  const { page, state } = await fixture(t, {
    initial: reopened,
    unknown: true,
  });
  const localPlan = "Synthetic locally edited plan";
  await page.getByRole("textbox", { name: "Follow-up plan" }).fill(localPlan);
  await page
    .getByRole("button", { name: "Save follow-up", exact: true })
    .click();
  await page
    .getByText("The follow-up outcome is unknown.", { exact: false })
    .waitFor();
  state.records.set(9, {
    ...reopened,
    plan: "Another synthetic clinician's change",
    version: 7,
  });
  await page
    .getByRole("button", { name: "Check current status", exact: true })
    .click();
  await page
    .getByText("Your local edits were kept", { exact: false })
    .waitFor();
  await expectFields(page, { ...reopened, plan: localPlan });
  assert.equal(state.drafts.get(9).payload.plan, localPlan);
  assert.equal(state.drafts.get(9).payload.expectedVersion, 7);
  assert.equal(state.drafts.get(9).payload.pendingRequest, null);
});

test("chart switch loads its own fields and version", async (t) => {
  const { page, state } = await fixture(t, { initial: reopened });
  await page
    .getByRole("textbox", { name: "Follow-up plan" })
    .fill("Unsaved first chart edits");
  await page.evaluate(() => window.switchChart(8, 10));
  await page
    .getByText("Record the next action for Synthetic Patient 8.", {
      exact: false,
    })
    .waitFor();
  await expectFields(page, second);
  await page
    .getByRole("button", { name: "Save follow-up", exact: true })
    .click();
  await page.getByText("Follow-up plan saved.", { exact: true }).waitFor();
  assert.equal(state.official.at(-1).id, 10);
  assert.equal(state.official.at(-1).body.expected_version, 12);
  assert.equal(state.official.at(-1).body.plan, second.plan);
});

for (const method of ["GET", "PATCH"]) {
  test(`late ${method === "GET" ? "reconciliation" : "mutation"} cannot clear old recovery or change the next chart`, async (t) => {
    const { page, state } = await fixture(t, { unknown: method === "GET" });
    const started = Promise.withResolvers();
    const release = Promise.withResolvers();
    if (method === "PATCH") state.held = { method, started, release };
    await page
      .getByRole("button", { name: "Reopen follow-up", exact: true })
      .click();
    if (method === "GET") {
      await page
        .getByText("The follow-up outcome is unknown.", { exact: false })
        .waitFor();
      state.held = { method, started, release };
      await page
        .getByRole("button", { name: "Check current status", exact: true })
        .click();
    }
    await started.promise;
    await page.evaluate(() => window.switchChart(8, 10));
    await page
      .getByText("Record the next action for Synthetic Patient 8.", {
        exact: false,
      })
      .waitFor();
    release.resolve();
    await expectFields(page, second);
    state.unknown = false;
    await page
      .getByRole("button", { name: "Save follow-up", exact: true })
      .click();
    await page.getByText("Follow-up plan saved.", { exact: true }).waitFor();
    assert.equal(state.official.at(-1).body.expected_version, 12);
    assert.equal(
      state.writes.filter(({ id, body }) => id === 9 && body.payload === null)
        .length,
      0,
    );
    assert.deepEqual(await page.evaluate(() => window.changed), [10]);
    assert.equal(state.drafts.get(9).payload.pendingRequest.kind, "reopen");
  });
}

test("duplicate reopen clicks dispatch one official request", async (t) => {
  const { page, state } = await fixture(t);
  const started = Promise.withResolvers();
  const release = Promise.withResolvers();
  state.held = { method: "PATCH", started, release };
  await page
    .getByRole("button", { name: "Reopen follow-up", exact: true })
    .evaluate((button) => {
      button.click();
      button.click();
    });
  await started.promise;
  assert.equal(state.official.length, 1);
  release.resolve();
  await page.getByText("Follow-up reopened.", { exact: true }).waitFor();
  assert.equal(state.official.length, 1);
});

test("duplicate save clicks dispatch one official request", async (t) => {
  const { page, state } = await fixture(t, { initial: reopened });
  const started = Promise.withResolvers();
  const release = Promise.withResolvers();
  state.held = { method: "PUT", started, release };
  await page
    .getByRole("button", { name: "Save follow-up", exact: true })
    .evaluate((button) => {
      button.click();
      button.click();
    });
  await started.promise;
  assert.equal(state.official.length, 1);
  release.resolve();
  await page.getByText("Follow-up plan saved.", { exact: true }).waitFor();
  assert.equal(state.official.length, 1);
});
