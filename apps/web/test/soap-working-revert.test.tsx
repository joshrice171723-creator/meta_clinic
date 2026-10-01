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

it("persists an HPI edit undone to baseline before refresh recovery", async () => {
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
  await duration.fill("Synthetic interim value");
  await expect
    .poll(() => payload?.sections.subjective)
    .toContain("Synthetic interim value");
  await duration.fill("");
  await expect.poll(() => payload?.sections.subjective).toBe("");
  await page.reload();
  await expect.poll(() => duration.isEnabled()).toBe(true);
  expect(await duration.inputValue()).toBe("");
  await page.close();
}, 15000);
