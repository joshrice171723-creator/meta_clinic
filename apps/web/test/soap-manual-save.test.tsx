import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright-core";
import { fileURLToPath } from "node:url";

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;

beforeAll(async () => {
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
