import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright-core";
import { fileURLToPath } from "node:url";

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;

beforeAll(async () => {
  const virtualId = "\0soap-conflict-recovery.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "soap-conflict-recovery-fixture",
        resolveId: (id) => (id === virtualId ? virtualId : undefined),
        load(id) {
          if (id !== virtualId) return;
          return `import React from "react";
          import {createRoot} from "react-dom/client";
          import {SoapNoteForm} from "/src/features/clinic/CareFlow";
          function App() {
            return React.createElement(SoapNoteForm,{encounterId:30,patientId:12,note:window.syntheticNote,templates:[],canWrite:true});
          }
          createRoot(document.getElementById("root")).render(React.createElement(App));`;
        },
        configureServer(s) {
          s.middlewares.use("/soap-conflict", async (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await s.transformIndexHtml(
                "/soap-conflict",
                '<div id="root"></div><script type="module" src="/@id/__x00__soap-conflict-recovery.tsx"></script>',
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

it("exposes recovery status and disabled ROS controls until recovery finishes", async () => {
  const page = await browser.newPage();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") mutations.push(request.url());
  });
  await page.route("**/api/csrf", (r) =>
    r.fulfill({ json: { csrf_token: "synthetic" } }),
  );
  await page.route("**/api/clinic/working_drafts/soap?*", async (r) => {
    await gate;
    await r.fulfill({
      json: {
        kind: "soap",
        patient_id: 12,
        encounter_id: 30,
        record_id: null,
        scope: "main",
        version: 0,
        payload: null,
        updated_at: null,
      },
    });
  });
  await page.goto(`${baseUrl}/soap-conflict`);
  const status = page
    .getByRole("status")
    .filter({ hasText: "Recovering protected working note…" });
  await status.waitFor();
  const findings = page.locator(".ros-finding-button");
  expect(await findings.count()).toBeGreaterThan(0);
  expect(
    await findings.evaluateAll((elements) =>
      elements.every((el) => (el as HTMLButtonElement).disabled),
    ),
  ).toBe(true);
  const cdp = await page.context().newCDPSession(page);
  const tree = await cdp.send("Accessibility.getFullAXTree");
  expect(JSON.stringify(tree)).toContain("Recovering protected working note…");
  const findingName = await findings.first().getAttribute("aria-label");
  const node = tree.nodes.find(
    (node) => node.role?.value === "button" && node.name?.value === findingName,
  );
  expect(
    node?.properties?.find((property) => property.name === "disabled")?.value
      .value,
  ).toBe(true);
  release();
  await expect.poll(() => findings.first().isEnabled()).toBe(true);
  expect(await status.count()).toBe(0);
  expect(await findings.first().getAttribute("data-state")).toBe("unselected");
  expect(mutations).toEqual([]);
  await page.close();
});

it.each([false, true])(
  "keeps recovered conflicts nonmodal and protects the current signed state (signed=%s)",
  async (signed) => {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    page.setDefaultTimeout(5000);
    const sections = {
      subjective: "Saved synthetic history",
      objective: "Saved synthetic examination",
      assessment: "Saved synthetic assessment",
      plan: "Saved synthetic plan",
    };
    const template = { id: "scribe-reviewed-soap", version: 1 };
    const revision = {
      id: 42,
      revision_no: 2,
      signed,
      body: {
        sections,
        template_id: template.id,
        template_version: 1,
        patient_instructions: "",
        session_duration_minutes: null,
      },
    };
    const note = {
      id: 40,
      patient_id: 12,
      encounter_id: 30,
      note_kind: "soap",
      signed,
      version: 2,
      current_revision: revision,
      revisions: [
        {
          id: 41,
          revision_no: 1,
          signed: true,
          body: {
            ...revision.body,
            sections: {
              ...sections,
              objective: "Historical signed examination",
            },
          },
        },
        revision,
      ],
    };
    await page.addInitScript((value) => {
      (window as any).syntheticNote = value;
    }, note);
    let payload: any = {
      schema_version: 1,
      patient_id: 12,
      encounter_id: 30,
      baseline: {
        noteId: 40,
        revisionId: 41,
        revisionNo: 1,
        sections,
        patientInstructions: "",
        sessionDurationMinutes: null,
        template,
      },
      sections: { ...sections, objective: "Preserved synthetic edit" },
      patient_instructions: "",
      session_duration_minutes: null,
      applied_template: template,
      correction_target: null,
      pending_attempt: null,
    };
    let version = 5;
    await page.route("**/api/csrf", (route) =>
      route.fulfill({ json: { csrf_token: "synthetic-csrf" } }),
    );
    await page.route("**/api/clinic/working_drafts/soap?*", async (route) => {
      if (route.request().method() === "PUT") {
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
    await page.route("**/previsit_note", (route) =>
      route.fulfill({
        json: {
          patient_id: 12,
          encounter_id: 30,
          appointment_id: null,
          note: null,
        },
      }),
    );
    await page.goto(`${baseUrl}/soap-conflict`);
    const compare = page.getByRole("button", {
      name: "Resolve note conflict",
      exact: true,
    });
    await compare.waitFor();
    expect(await page.getByRole("dialog").count()).toBe(0);
    expect(
      await page
        .getByRole("textbox", { name: "Objective (O)", exact: true })
        .isDisabled(),
    ).toBe(true);
    expect(
      await page
        .getByRole("textbox", { name: "Objective (O)", exact: true })
        .inputValue(),
    ).toBe("Preserved synthetic edit");
    expect(
      await page
        .getByText(
          "Saved revision 2 changed while this working note was open. Your text is preserved and official save is blocked until you review both versions.",
          { exact: true },
        )
        .count(),
    ).toBe(1);
    await page
      .getByRole("button", { name: "Revision 1 · signed", exact: true })
      .click();
    const history = page.getByRole("dialog", {
      name: "Saved revision 1",
      exact: true,
    });
    await history.waitFor();
    expect(await history.innerText()).toContain(
      "Historical signed examination",
    );
    expect(await history.getByRole("textbox").count()).toBe(0);
    expect(await history.getByRole("button").allTextContents()).toEqual([
      "Close history",
    ]);
    await history.getByRole("button", { name: "Close history" }).click();
    expect(
      await page
        .getByRole("textbox", { name: "Objective (O)", exact: true })
        .inputValue(),
    ).toBe("Preserved synthetic edit");
    await compare.click();
    const dialog = page.getByRole("dialog", {
      name: "Resolve saved-note conflict",
    });
    await dialog.waitFor();
    expect(
      await dialog
        .getByRole("button", { name: "Keep my text and rebase" })
        .isDisabled(),
    ).toBe(signed);
    await dialog
      .getByRole("button", { name: "Use saved revision", exact: true })
      .click();
    await expect.poll(() => page.getByRole("dialog").count()).toBe(0);
    expect(
      await page
        .getByRole("textbox", { name: "Objective (O)", exact: true })
        .inputValue(),
    ).toBe(sections.objective);
    expect(
      await page
        .getByRole("textbox", { name: "Objective (O)", exact: true })
        .isDisabled(),
    ).toBe(signed);
    if (signed)
      expect(
        await page
          .getByRole("button", { name: "Start correction", exact: true })
          .isEnabled(),
      ).toBe(true);
    await page.close();
  },
  15000,
);

it("replaces a failed previsit-note load with Retry and resolves a retry with no note", async () => {
  const page = await browser.newPage();
  let attempts = 0;
  await page.route("**/api/csrf", (route) =>
    route.fulfill({ json: { csrf_token: "synthetic-csrf" } }),
  );
  await page.route("**/api/clinic/working_drafts/soap?*", (route) =>
    route.fulfill({
      json: {
        kind: "soap",
        patient_id: 12,
        encounter_id: 30,
        record_id: null,
        scope: "main",
        version: 0,
        payload: null,
        updated_at: null,
      },
    }),
  );
  await page.route("**/previsit_note", (route) => {
    attempts++;
    return attempts === 1
      ? route.abort("failed")
      : route.fulfill({
          json: {
            patient_id: 12,
            encounter_id: 30,
            appointment_id: null,
            note: null,
          },
        });
  });
  await page.goto(`${baseUrl}/soap-conflict`);
  await page
    .getByText("The patient's pre-visit note could not be loaded.", {
      exact: true,
    })
    .waitFor();
  expect(
    await page
      .getByText("Checking for a pre-visit note…", { exact: true })
      .count(),
  ).toBe(0);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect.poll(() => attempts).toBe(2);
  await expect
    .poll(() =>
      page
        .getByText("The patient's pre-visit note could not be loaded.", {
          exact: true,
        })
        .count(),
    )
    .toBe(0);
  expect(
    await page
      .getByText("Checking for a pre-visit note…", { exact: true })
      .count(),
  ).toBe(0);
  await page.close();
});
