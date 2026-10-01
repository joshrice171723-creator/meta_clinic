import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright-core";
import { fileURLToPath } from "node:url";

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;

beforeAll(async () => {
  const virtualId = "\0soap-working-revert.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "soap-working-revert-fixture",
        resolveId: (id) => (id === virtualId ? virtualId : undefined),
        load(id) {
          if (id !== virtualId) return;
          return `import React from "react";
          import {createRoot} from "react-dom/client";
          import {SoapNoteForm} from "/src/features/clinic/CareFlow";
          function App() {
            return React.createElement(SoapNoteForm,{encounterId:30,patientId:12,templates:[],canWrite:true});
          }
          createRoot(document.getElementById("root")).render(React.createElement(App));`;
        },
        configureServer(s) {
          s.middlewares.use("/soap-revert", async (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await s.transformIndexHtml(
                "/soap-revert",
                '<div id="root"></div><script type="module" src="/@id/__x00__soap-working-revert.tsx"></script>',
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

it("preserves HPI real typing, insertion, deletion, paste and IME through blur and recovery", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  page.setDefaultTimeout(5000);
  let version = 0;
  let payload: any = null;
  await page.route("**/api/csrf", (route) =>
    route.fulfill({ json: { csrf_token: "synthetic-csrf" } }),
  );
  await page.route("**/api/clinic/working_drafts/soap?*", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      expect(body.expected_version).toBe(version);
      payload = body.payload;
      version += 1;
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
  await page.goto(`${baseUrl}/soap-revert`);
  const duration = page.getByRole("textbox", { name: "Duration", exact: true });
  await duration.pressSequentially("Not applicable");
  expect(await duration.inputValue()).toBe("Not applicable");
  const onset = page.getByRole("textbox", { name: "Onset Cause", exact: true });
  await onset.pressSequentially("None reported");
  expect(await onset.inputValue()).toBe("None reported");
  await duration.focus();
  await duration.evaluate((el) =>
    (el as HTMLInputElement).setSelectionRange(3, 3),
  );
  await duration.press("Space");
  expect(await duration.inputValue()).toBe("Not  applicable");
  await duration.press("Backspace");
  expect(await duration.inputValue()).toBe("Not applicable");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => navigator.clipboard.writeText("  None reported  "));
  const improved = page.getByRole("textbox", {
    name: "Improved by",
    exact: true,
  });
  await improved.focus();
  await improved.press("Control+V");
  expect(await improved.inputValue()).toBe("  None reported  ");
  const character = page.getByRole("textbox", {
    name: "Character",
    exact: true,
  });
  await character.focus();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.imeSetComposition", {
    text: "予定 ",
    selectionStart: 3,
    selectionEnd: 3,
  });
  expect(await character.inputValue()).toBe("予定 ");
  await cdp.send("Input.insertText", { text: "予定 あり " });
  expect(await character.inputValue()).toBe("予定 あり ");
  const exacerbated = page.getByRole("textbox", {
    name: "Exacerbated by",
    exact: true,
  });
  await exacerbated.pressSequentially(" ");
  expect(await exacerbated.inputValue()).toBe(" ");
  await exacerbated.press("Tab");
  expect(await improved.inputValue()).toBe("  None reported  ");
  await expect
    .poll(() => payload?.sections.subjective)
    .toContain("- Exacerbated by:  ");
  expect(payload.sections.subjective).toContain("- Duration: Not applicable");
  expect(payload.sections.subjective).toContain("- Onset Cause: None reported");
  expect(payload.sections.subjective).toContain(
    "- Improved by:   None reported  ",
  );
  expect(payload.sections.subjective).toContain("- Character: 予定 あり ");
  await page.reload();
  await expect.poll(() => duration.inputValue()).toBe("Not applicable");
  expect(await duration.isEnabled()).toBe(true);
  expect(await onset.inputValue()).toBe("None reported");
  expect(await improved.inputValue()).toBe("  None reported  ");
  expect(await character.inputValue()).toBe("予定 あり ");
  expect(await exacerbated.inputValue()).toBe(" ");
  await page.close();
}, 15000);
