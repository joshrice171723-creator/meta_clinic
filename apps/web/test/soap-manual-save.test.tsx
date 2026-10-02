import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright-core";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;

beforeAll(async () => {
  if (process.env.QA_REAL_BASE_URL) {
    baseUrl = process.env.QA_REAL_BASE_URL;
    browser = await chromium.launch({
      executablePath:
        process.env.BROWSER_EXECUTABLE_PATH || "/usr/bin/chromium",
      headless: true,
    });
    return;
  }
  const virtualId = "\0soap-manual-save.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "soap-manual-save-fixture",
        resolveId: (id) => (id === virtualId ? virtualId : undefined),
        load(id) {
          if (id !== virtualId) return;
          return `import React from "react";
          import {createRoot} from "react-dom/client";
          import {SoapNoteForm} from "/src/features/clinic/CareFlow";
          function App() {
            const [note,setNote]=React.useState();
            React.useEffect(()=>{fetch("/api/clinic/notes/44").then(r=>r.json()).then(r=>setNote(r.note||undefined));},[]);
            const template={id:"primary-care-follow-up",version:1,label:"Synthetic SOAP template",note_kind:"soap",source_label:"Synthetic source",source_url:"",caution:"Review before signing.",sections:{subjective:"Synthetic prompt",objective:"Synthetic examination prompt",assessment:"Synthetic assessment prompt",plan:"Synthetic plan prompt"}};
            return React.createElement(SoapNoteForm,{encounterId:30,patientId:12,note,onCreated:setNote,templates:location.search.includes("unavailable")?[]:[template],canWrite:true});
          }
          createRoot(document.getElementById("root")).render(React.createElement(App));`;
        },
        configureServer(s) {
          s.middlewares.use("/soap-manual", async (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await s.transformIndexHtml(
                "/soap-manual",
                '<div id="root"></div><script type="module" src="/@id/__x00__soap-manual-save.tsx"></script>',
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
    throw new Error("Missing fixture port");
  baseUrl = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || "/usr/bin/chromium",
    headless: true,
  });
}, 15000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

it.runIf(Boolean(process.env.QA_REAL_BASE_URL))(
  "#231/#63/#198/#81 actual App chart save recovery refresh and completed unsigned signing survive reload",
  async () => {
    if (process.env.QA_REAL_ISOLATED !== "1" || !process.env.QA_REAL_FIXTURE)
      throw new Error("An isolated synthetic real-stack fixture is required.");
    const seed = JSON.parse(readFileSync(process.env.QA_REAL_FIXTURE, "utf8"));
    expect(seed.synthetic).toBe(true);
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    let releaseDeletion: (() => void) | undefined;
    const diagnosticResponses: { path: string; method: string; status: number }[] = [];
    let confirmedChart = false;
    page.on("response", (response) => {
      const path = new URL(response.url()).pathname;
      if (path.startsWith("/api/clinic/") && !path.includes("session")) {
        diagnosticResponses.push({ path, method: response.request().method(), status: response.status() });
      }
    });
    try {
      const csrf = await context.request.get(`${baseUrl}/api/csrf`);
      expect(csrf.status()).toBe(200);
      const session = await context.request.post(
        `${baseUrl}/api/development_session`,
        {
          headers: {
            Origin: baseUrl,
            "X-CSRF-Token": (await csrf.json()).csrf_token,
          },
          data: {
            profile: seed.profile,
            portal: "clinic",
            practice_id: String(seed.practice_id),
            site_id: String(seed.site_id),
          },
        },
      );
      expect(session.status()).toBe(201);
      const encounterId = seed.note_scenarios.open_encounter_id;
      const path = `/clinic/patients/${seed.patient_id}/encounters/${encounterId}`;
      await page.goto(`${baseUrl}${path}`);
      await page.locator(".clinic-shell").waitFor({ timeout: 30000 });
      await page
        .getByRole("button", {
          name: "Confirm and begin charting",
          exact: true,
        })
        .waitFor({ timeout: 30000 });
      await page
        .getByRole("button", {
          name: "Confirm and begin charting",
          exact: true,
        })
        .click();
      confirmedChart = true;
      const soap = page.locator("#chart-signing");
      const objective = page.getByRole("textbox", {
        name: "Objective (O)",
        exact: true,
      });
      await page
        .getByRole("textbox", { name: "Chief Complaint", exact: true })
        .fill("Independent synthetic manual concern");
      await objective.fill("Independent synthetic examination");
      await page
        .getByRole("button", {
          name: "Use template without prompts",
          exact: true,
        })
        .click();
      const created = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
            `/api/clinic/encounters/${encounterId}/notes` &&
          response.request().method() === "POST",
      );
      await soap
        .getByRole("button", { name: "Save draft", exact: true })
        .click();
      const creation = await created;
      expect(creation.status()).toBe(201);
      const noteId = (await creation.json()).note.id;
      await page.getByText("Chart In progress", { exact: true }).waitFor();
      await expect.poll(() => objective.isEnabled()).toBe(true);
      await objective.fill("Independent synthetic revised examination");
      const revised = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
            `/api/clinic/notes/${noteId}/revisions` &&
          response.request().method() === "POST",
      );
      await soap
        .getByRole("button", { name: "Save new revision", exact: true })
        .click();
      expect((await revised).status()).toBe(201);
      await expect.poll(() => objective.isEnabled()).toBe(true);
      expect(await objective.inputValue()).toBe(
        "Independent synthetic revised examination",
      );
      const persisted = await context.request.get(
        `${baseUrl}/api/clinic/notes/${noteId}`,
      );
      expect(persisted.status()).toBe(200);
      expect((await persisted.json()).note).toMatchObject({
        patient_id: seed.patient_id,
        encounter_id: encounterId,
        current_revision: {
          revision_no: 2,
          signed: false,
          body: {
            sections: {
              objective: "Independent synthetic revised examination",
            },
          },
        },
      });
      await page.reload();
      await page.getByText("Chart In progress", { exact: true }).waitFor();
      // Identity confirmation is a deliberate reload safeguard, not lost chart state.
      await page
        .getByRole("button", { name: "Confirm and open chart", exact: true })
        .click();
      await expect
        .poll(() => objective.inputValue())
        .toBe("Independent synthetic revised examination");
      await expect.poll(() => objective.isEnabled()).toBe(true);

      const duration = page.getByRole("textbox", {
        name: "Duration",
        exact: true,
      });
      await duration.fill("Independent synthetic interim duration");
      const recoveryPath = `/api/clinic/working_drafts/soap?patient_id=${seed.patient_id}&encounter_id=${encounterId}`;
      await expect
        .poll(
          async () =>
            (
              await (
                await context.request.get(`${baseUrl}${recoveryPath}`)
              ).json()
            ).payload?.sections.subjective,
        )
        .toContain("Independent synthetic interim duration");
      const deletionHold = new Promise<void>((resolve) => {
        releaseDeletion = resolve;
      });
      let deletionStarted = false;
      // Stall transport only; after release the unchanged request reaches real Rails.
      await page.route("**/api/clinic/working_drafts/soap?*", async (route) => {
        if (
          route.request().method() === "PUT" &&
          !route
            .request()
            .postDataJSON()
            .payload?.sections.subjective.includes(
              "Independent synthetic interim duration",
            )
        ) {
          deletionStarted = true;
          await deletionHold;
        }
        await route.continue();
      });
      await duration.fill("");
      await expect.poll(() => deletionStarted).toBe(true);
      await page
        .getByText(
          /The latest working-note changes are not confirmed for refresh recovery/,
        )
        .waitFor();
      let reloadWarned = false;
      page.once("dialog", async (dialog) => {
        expect(dialog.type()).toBe("beforeunload");
        reloadWarned = true;
        await dialog.dismiss();
      });
      await page.reload().catch(() => undefined);
      expect(reloadWarned).toBe(true);
      expect(await duration.inputValue()).toBe("");
      releaseDeletion?.();
      await expect
        .poll(
          async () =>
            (
              await (
                await context.request.get(`${baseUrl}${recoveryPath}`)
              ).json()
            ).payload?.sections.subjective,
        )
        .not.toContain("Independent synthetic interim duration");
      await expect
        .poll(() =>
          page
            .getByText(
              /The latest working-note changes are not confirmed for refresh recovery/,
            )
            .count(),
        )
        .toBe(0);
      await page.unroute("**/api/clinic/working_drafts/soap?*");
      for (let reload = 0; reload < 2; reload++) {
        await page.reload();
        await page
          .getByRole("button", { name: "Confirm and open chart", exact: true })
          .click();
        await expect.poll(() => duration.isEnabled()).toBe(true);
        expect(await duration.inputValue()).toBe("");
        expect(await objective.inputValue()).toBe(
          "Independent synthetic revised examination",
        );
      }

      await page.goto(
        `${baseUrl}/clinic/patients/${seed.patient_id}/encounters/${seed.note_scenarios.completed_unsigned_encounter_id}`,
      );
      await page.getByText("Visit Completed", { exact: true }).waitFor();
      await page.getByText("Chart In progress", { exact: true }).waitFor();
      await page.getByRole("link", { name: "Signing", exact: true }).click();
      expect(new URL(page.url()).hash).toBe("#chart-signing");
      await page
        .locator("#chart-signing")
        .getByRole("button", { name: "Review and sign", exact: true })
        .waitFor();
      await page.reload();
      await page
        .locator("#chart-signing")
        .getByRole("button", { name: "Review and sign", exact: true })
        .waitFor();
      expect(
        await page.getByText("Chart Not started", { exact: true }).count(),
      ).toBe(0);
    } finally {
      releaseDeletion?.();
      if (process.env.QA_REAL_DIAGNOSTIC_OUTPUT && seed.synthetic === true && process.env.QA_REAL_ISOLATED === "1") {
        try {
          const dom = await page.evaluate(() => ({
            text: (document.body.innerText || "").slice(0, 16000),
            fields: Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")).map((field) => ({
              labels: Array.from(field.labels || []).map((label) => label.textContent || ""),
              disabled: field.disabled,
              inSoap: Boolean(field.closest(".soap-workspace")),
              inChartSigning: Boolean(field.closest("#chart-signing")),
            })),
            soapCount: document.querySelectorAll(".soap-workspace").length,
            signingCount: document.querySelectorAll("#chart-signing").length,
          }));
          writeFileSync(`${process.env.QA_REAL_DIAGNOSTIC_OUTPUT}-soap.json`, JSON.stringify({ synthetic: true, head: seed.head, confirmedChart, pathname: new URL(page.url()).pathname, responses: diagnosticResponses.slice(-80), dom }, null, 2));
        } catch { /* Diagnostics must not replace the original assertion failure. */ }
      }
      await context.close();
    }
  },
  45000,
);

it.runIf(Boolean(process.env.QA_REAL_BASE_URL))(
  "#165/#200 actual App signed chart correction and interactive immutable history survive reload",
  async () => {
    if (process.env.QA_REAL_ISOLATED !== "1" || !process.env.QA_REAL_FIXTURE)
      throw new Error("An isolated synthetic real-stack fixture is required.");
    const seed = JSON.parse(readFileSync(process.env.QA_REAL_FIXTURE, "utf8"));
    expect(seed.synthetic).toBe(true);
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    try {
      const csrf = await context.request.get(`${baseUrl}/api/csrf`);
      expect(csrf.status()).toBe(200);
      const session = await context.request.post(
        `${baseUrl}/api/development_session`,
        {
          headers: {
            Origin: baseUrl,
            "X-CSRF-Token": (await csrf.json()).csrf_token,
          },
          data: {
            profile: seed.profile,
            portal: "clinic",
            practice_id: String(seed.practice_id),
            site_id: String(seed.site_id),
          },
        },
      );
      expect(session.status()).toBe(201);
      const scenario = seed.note_scenarios;
      const path = `/clinic/patients/${seed.patient_id}/encounters/${scenario.signed_encounter_id}`;
      await page.goto(`${baseUrl}${path}`);
      await page.locator(".clinic-shell").waitFor({ timeout: 30000 });
      await page
        .getByText("Chart Signed", { exact: true })
        .waitFor({ timeout: 30000 });
      await page
        .getByRole("button", {
          name: "Confirm and view signed chart",
          exact: true,
        })
        .click();
      const objective = page.getByRole("textbox", {
        name: "Objective (O)",
        exact: true,
      });
      await expect.poll(() => objective.isDisabled()).toBe(true);
      expect(
        await page
          .getByRole("button", { name: "Review and sign", exact: true })
          .count(),
      ).toBe(0);
      expect(
        await page
          .getByText(
            /Not signed \(finalize\)|A clinician signature is required to finalize/,
          )
          .count(),
      ).toBe(0);
      await page
        .getByRole("button", { name: "Start correction", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Start correction to signed SOAP note",
        exact: true,
      });
      await dialog
        .getByRole("textbox", { name: "Reason for correction", exact: true })
        .fill("Independent synthetic transcription correction");
      await dialog
        .getByRole("checkbox", {
          name: "I confirmed the displayed patient, encounter, signed revision, and copied note content.",
          exact: true,
        })
        .check();
      await dialog
        .getByRole("button", { name: "Start correction", exact: true })
        .click();
      await expect.poll(() => objective.isEnabled()).toBe(true);
      await objective.fill("Independent synthetic corrected examination");
      const correctionResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
            `/api/clinic/notes/${scenario.signed_note_id}/corrections` &&
          response.request().method() === "POST",
      );
      await page
        .getByRole("button", { name: "Save unsigned correction", exact: true })
        .click();
      expect((await correctionResponse).status()).toBe(201);
      await page.getByText("Chart In progress", { exact: true }).waitFor();
      await expect.poll(() => objective.isEnabled()).toBe(true);
      await page
        .getByRole("button", { name: "Review and sign", exact: true })
        .waitFor();
      const readback = await context.request.get(
        `${baseUrl}/api/clinic/notes/${scenario.signed_note_id}`,
      );
      expect(readback.status()).toBe(200);
      const note = (await readback.json()).note;
      expect(note).toMatchObject({
        patient_id: seed.patient_id,
        encounter_id: scenario.signed_encounter_id,
        current_revision_signed: false,
        has_signed_history: true,
        current_revision: {
          revision_no: 2,
          signed: false,
          body: {
            sections: {
              objective: "Independent synthetic corrected examination",
            },
            correction: {
              corrected_revision_id: scenario.signed_revision_id,
              corrected_revision_no: 1,
              reason: "Independent synthetic transcription correction",
            },
          },
        },
      });
      expect(note.revisions).toHaveLength(2);
      expect(note.revisions[0]).toMatchObject({
        id: scenario.signed_revision_id,
        signed: true,
        body: { sections: { objective: "Synthetic completed examination" } },
      });
      await page
        .getByRole("button", { name: "Revision 1 · signed", exact: true })
        .click();
      const history = page.getByRole("dialog", {
        name: "Saved revision 1",
        exact: true,
      });
      await history
        .getByText("Synthetic completed examination", { exact: true })
        .waitFor();
      expect(await history.getByRole("textbox").count()).toBe(0);
      await history.getByRole("button", { name: "Close history", exact: true }).click();
      expect(await objective.inputValue()).toBe(
        "Independent synthetic corrected examination",
      );
      await page.reload();
      await page.getByText("Chart In progress", { exact: true }).waitFor();
      await page
        .getByRole("button", { name: "Confirm and open chart", exact: true })
        .click();
      await expect
        .poll(() => objective.inputValue())
        .toBe("Independent synthetic corrected examination");
      await page
        .getByRole("button", { name: "Review and sign", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Revision 1 · signed", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Saved revision 1", exact: true })
        .getByText("Synthetic completed examination", { exact: true })
        .waitFor();
      expect(
        await page.getByText("Chart Signed", { exact: true }).count(),
      ).toBe(0);
    } finally {
      await context.close();
    }
  },
  45000,
);

async function fixture(unavailable = false, existing = false) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  page.setDefaultTimeout(5000);
  let version = 0;
  let payload: any = null;
  const initialRevision = {
    id: 45,
    revision_no: 1,
    signed: false,
    created_at: "2026-10-01T00:00:00Z",
    body: {
      template_id: "primary-care-follow-up",
      template_version: 1,
      sections: {
        subjective: "",
        objective: "Synthetic original",
        assessment: "",
        plan: "",
      },
      patient_instructions: "",
      session_duration_minutes: null,
    },
  };
  let note: any = existing
    ? {
        id: 44,
        patient_id: 12,
        encounter_id: 30,
        note_kind: "soap",
        signed: false,
        current_revision: initialRevision,
        revisions: [initialRevision],
      }
    : null;
  const recovery = { fail: false, hold: Promise.resolve() };
  const posts: any[] = [];
  await page.route("**/api/csrf", (route) =>
    route.fulfill({ json: { csrf_token: "synthetic-csrf" } }),
  );
  await page.route("**/api/clinic/working_drafts/soap?*", async (route) => {
    if (route.request().method() === "PUT") {
      await recovery.hold;
      if (recovery.fail) {
        await route.abort("failed");
        return;
      }
      const body = route.request().postDataJSON();
      expect(body.expected_version).toBe(version);
      payload = body.payload;
      version++;
    }
    await route.fulfill({
      json: {
        kind: "soap",
        patient_id: 12,
        encounter_id: 30,
        record_id: null,
        scope: "main",
        version,
        payload,
        updated_at: null,
      },
    });
  });
  await page.route("**/api/clinic/notes/44", (route) =>
    route.fulfill({ json: { note } }),
  );
  await page.route("**/api/clinic/encounters/30?*", (route) =>
    route.fulfill({
      json: {
        encounter: { id: 30, patient_id: 12, note_ids: note ? [44] : [] },
      },
    }),
  );
  await page.route("**/api/clinic/encounters/30/notes", async (route) => {
    const input = route.request().postDataJSON().encounter_note;
    posts.push(input);
    const revision = {
      id: 45,
      revision_no: 1,
      signed: false,
      body: {
        template_id: input.template_id,
        template_version: input.template_version,
        sections: {
          subjective: input.subjective,
          objective: input.objective,
          assessment: input.assessment,
          plan: input.plan,
        },
        patient_instructions: input.patient_instructions,
        session_duration_minutes: input.session_duration_minutes,
      },
    };
    note = {
      id: 44,
      patient_id: 12,
      encounter_id: 30,
      note_kind: "soap",
      signed: false,
      current_revision: revision,
      revisions: [revision],
    };
    await route.fulfill({ status: 201, json: { note } });
  });
  await page.route("**/api/clinic/notes/44/revisions", async (route) => {
    const input = route.request().postDataJSON().revision;
    expect(input.expected_revision).toBe(note.current_revision.revision_no);
    const revision = {
      ...note.current_revision,
      id: 46,
      revision_no: 2,
      body: {
        ...note.current_revision.body,
        sections: {
          subjective: input.subjective,
          objective: input.objective,
          assessment: input.assessment,
          plan: input.plan,
        },
      },
    };
    note = {
      ...note,
      current_revision: revision,
      revisions: [...note.revisions, revision],
    };
    await route.fulfill({ status: 201, json: { revision } });
  });
  await page.goto(`${baseUrl}/soap-manual${unavailable ? "?unavailable" : ""}`);
  await expect
    .poll(() =>
      page
        .getByRole("textbox", { name: "Chief Complaint", exact: true })
        .isEnabled(),
    )
    .toBe(true);
  return { page, posts, recovery };
}

it("saves manual text without inserting prompts and restores the acknowledged unsigned draft", async () => {
  const { page, posts } = await fixture();
  await page
    .getByRole("textbox", { name: "Chief Complaint", exact: true })
    .fill("Synthetic manual concern");
  for (const name of ["Objective", "Assessment", "Plan"])
    await page
      .getByRole("textbox", {
        name: `${name} (${name.charAt(0)})`,
        exact: true,
      })
      .fill(`Synthetic manual ${name}`);
  expect(
    await page
      .getByRole("button", { name: "Save draft", exact: true })
      .isDisabled(),
  ).toBe(true);
  expect(await page.locator("#soap-save-requirement").innerText()).toContain(
    "use it without prompts",
  );
  await page
    .getByRole("button", { name: "Use template without prompts", exact: true })
    .click();
  expect(
    await page
      .getByRole("textbox", { name: "Objective (O)", exact: true })
      .inputValue(),
  ).toBe("Synthetic manual Objective");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page
    .getByText(
      "Unsigned draft created after note and encounter verification.",
      { exact: true },
    )
    .waitFor();
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({
    template_id: "primary-care-follow-up",
    template_version: 1,
    objective: "Synthetic manual Objective",
    assessment: "Synthetic manual Assessment",
    plan: "Synthetic manual Plan",
  });
  expect(posts[0].subjective).toContain("Synthetic manual concern");
  expect(JSON.stringify(posts[0])).not.toContain(
    "Synthetic examination prompt",
  );
  await page
    .getByRole("textbox", { name: "Objective (O)", exact: true })
    .fill("Synthetic revised examination");
  await page
    .getByRole("button", { name: "Save new revision", exact: true })
    .click();
  await page
    .getByText(
      "Unsigned draft revision 2 saved after note and encounter verification.",
      { exact: true },
    )
    .waitFor();
  expect(
    await page
      .getByRole("textbox", { name: "Objective (O)", exact: true })
      .isEnabled(),
  ).toBe(true);
  await page.reload();
  await page
    .getByText(
      "Draft revision 2. Template provenance is fixed after creation.",
      { exact: true },
    )
    .waitFor();
  expect(
    await page
      .getByRole("textbox", { name: "Objective (O)", exact: true })
      .inputValue(),
  ).toBe("Synthetic revised examination");
  expect(
    await page
      .getByRole("button", { name: "Save new revision", exact: true })
      .isDisabled(),
  ).toBe(true);
  await page.close();
}, 15000);

it("explains empty content and unavailable templates without permitting an invalid save", async () => {
  const { page, posts } = await fixture();
  await page
    .getByRole("button", { name: "Use template without prompts", exact: true })
    .click();
  expect(
    await page
      .getByRole("button", { name: "Save draft", exact: true })
      .isDisabled(),
  ).toBe(true);
  expect(await page.locator("#soap-save-requirement").innerText()).toContain(
    "Enter note content",
  );
  expect(posts).toHaveLength(0);
  await page.close();
  const missing = await fixture(true);
  await missing.page
    .getByRole("textbox", { name: "Chief Complaint", exact: true })
    .fill("Synthetic manual concern");
  expect(
    await missing.page
      .getByRole("button", { name: "Save draft", exact: true })
      .isDisabled(),
  ).toBe(true);
  expect(
    await missing.page.locator("#soap-save-requirement").innerText(),
  ).toContain("No SOAP template is available");
  expect(missing.posts).toHaveLength(0);
  await missing.page.close();
});

it("distinguishes chart revision changes from pending failed and saved recovery", async () => {
  const { page, recovery } = await fixture(false, true);
  let release!: () => void;
  recovery.hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page
    .getByRole("textbox", { name: "Objective (O)", exact: true })
    .fill("Synthetic unsaved revision change");
  await page
    .getByText("Saving protected working note…", { exact: true })
    .waitFor();
  expect(
    await page
      .getByText(/Current edits are not in a saved chart revision/)
      .count(),
  ).toBe(1);
  expect(await page.getByText(/Last recovery save completed/).count()).toBe(0);
  recovery.fail = true;
  release();
  await page
    .getByRole("button", { name: "Retry saving current note", exact: true })
    .waitFor();
  expect(await page.getByText(/Last recovery save completed/).count()).toBe(0);
  expect(
    await page
      .getByRole("textbox", { name: "Objective (O)", exact: true })
      .inputValue(),
  ).toBe("Synthetic unsaved revision change");
  recovery.fail = false;
  await page
    .getByRole("button", { name: "Retry saving current note", exact: true })
    .click();
  await page.getByText(/Last recovery save completed/).waitFor();
  expect(
    await page
      .getByText(/Current edits are not in a saved chart revision/)
      .count(),
  ).toBe(1);
  expect(
    await page
      .getByText(/Recovery copies do not create chart revisions/)
      .count(),
  ).toBe(1);
  await page.close();
}, 15000);

it.runIf(Boolean(process.env.QA_REAL_BASE_URL))(
  "#71/#55 actual App practice audit and reminder settings persist and isolate switched clinics",
  async () => {
    if (process.env.QA_REAL_ISOLATED !== "1" || !process.env.QA_REAL_FIXTURE)
      throw new Error("An isolated synthetic real-stack fixture is required.");
    const seed = JSON.parse(readFileSync(process.env.QA_REAL_FIXTURE, "utf8"));
    expect(seed.synthetic).toBe(true);
    expect(seed.access_scenarios.second_practice_id).toBeTypeOf("number");
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    try {
      const csrf = await context.request.get(`${baseUrl}/api/csrf`);
      expect(csrf.status()).toBe(200);
      const session = await context.request.post(
        `${baseUrl}/api/development_session`,
        {
          headers: {
            Origin: baseUrl,
            "X-CSRF-Token": (await csrf.json()).csrf_token,
          },
          data: {
            profile: seed.profile,
            portal: "clinic",
            practice_id: String(seed.practice_id),
            site_id: String(seed.site_id),
          },
        },
      );
      expect(session.status()).toBe(201);
      const captured = await context.request.get(
        `${baseUrl}/api/clinic/audit_events?action_code=notes.create&outcome=committed`,
      );
      expect(captured.status()).toBe(200);
      const savedEvent = (await captured.json()).events.find(
        (event: any) => event.resource_references.length > 0,
      );
      expect(savedEvent).toBeTruthy();
      expect(savedEvent.actor_reference).toBe(`user:${seed.actor_user_id}`);
      const reference = savedEvent.resource_references[0];
      await page.goto(`${baseUrl}/clinic/audit`);
      await page.locator(".clinic-shell").waitFor({ timeout: 30000 });
      await page.getByRole("heading", { name: "Practice audit", exact: true }).waitFor();
      expect(
        await page
          .getByRole("link", { name: "Practice audit", exact: true })
          .count(),
      ).toBeGreaterThan(0);
      async function filterNotes() {
        await page
          .getByRole("combobox", { name: "Audit action", exact: true })
          .click();
        await page
          .getByRole("option", { name: "notes.create", exact: true })
          .click();
        await page
          .getByRole("combobox", { name: "Audit outcome", exact: true })
          .click();
        await page
          .getByRole("option", { name: "committed", exact: true })
          .click();
        await expect
          .poll(() =>
            page
              .getByRole("table", {
                name: "Practice audit events",
                exact: true,
              })
              .getByText(reference, { exact: true })
              .count(),
          )
          .toBe(1);
      }
      await filterNotes();
      await page.reload();
      await filterNotes();
      await page.goto(`${baseUrl}/clinic/settings`);
      const hours = page.getByRole("spinbutton", {
        name: "Hours before appointment",
        exact: true,
      });
      await hours.fill("48");
      const response = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/clinic/reminder_policy" &&
          response.request().method() === "PATCH",
      );
      await page
        .getByRole("button", { name: "Save reminder settings", exact: true })
        .click();
      expect((await response).status()).toBe(200);
      await expect
        .poll(() =>
          page
            .getByText("Clinic reminder settings saved.", { exact: true })
            .count(),
        )
        .toBe(1);
      const readback = await context.request.get(
        `${baseUrl}/api/clinic/reminder_policy`,
      );
      expect(readback.status()).toBe(200);
      const policy = (await readback.json()).policy;
      expect(policy.lead_hours).toBe(48);
      expect(policy.enabled).toBe(true);
      expect(policy.revision).toBeGreaterThan(0);
      await page.reload();
      await expect.poll(() => hours.inputValue()).toBe("48");
      await page.getByRole("combobox", { name: "Clinic", exact: true }).click();
      await page
        .getByRole("option", {
          name: seed.access_scenarios.second_practice_name,
          exact: true,
        })
        .click();
      await page.waitForURL(`${baseUrl}/clinic`);
      await page.goto(`${baseUrl}/clinic/settings`);
      await expect.poll(() => hours.inputValue()).toBe("24");
      const secondPolicy = await context.request.get(
        `${baseUrl}/api/clinic/reminder_policy`,
      );
      expect(secondPolicy.status()).toBe(200);
      expect((await secondPolicy.json()).policy.revision).toBe(0);
      await page.goto(`${baseUrl}/clinic/audit`);
      await expect
        .poll(() =>
          page
            .getByRole("heading", { name: "Practice audit", exact: true })
            .count(),
        )
        .toBe(1);
      expect(
        await page
          .getByRole("combobox", { name: "Audit action", exact: true })
          .textContent(),
      ).toContain("All actions");
      await page
        .getByRole("table", { name: "Practice audit events", exact: true })
        .waitFor({ state: "visible" });
      expect(
        await page
          .getByRole("table", { name: "Practice audit events", exact: true })
          .getByText(reference, { exact: true })
          .count(),
      ).toBe(0);
      const isolated = await context.request.get(
        `${baseUrl}/api/clinic/audit_events?action_code=notes.create`,
      );
      // An unavailable action must be rejected, never resolved against another practice's audit.
      expect([200, 422]).toContain(isolated.status());
      expect(await isolated.text()).not.toContain(reference);
    } finally {
      await context.close();
    }
  },
  45000,
);
