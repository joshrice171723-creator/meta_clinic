import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright-core";
import { fileURLToPath } from "node:url";

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;

beforeAll(async () => {
  const virtualId = "\0working-draft-latest.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "working-draft-latest-fixture",
        resolveId: (id) => (id === virtualId ? virtualId : undefined),
        load(id) {
          if (id !== virtualId) return;
          return `import React from "react";
          import {createRoot} from "react-dom/client";
          import {useWorkingDraft} from "/src/features/clinic/useWorkingDraft";
          function App() {
            const draft=useWorkingDraft({kind:"soap",patientId:12,encounterId:30});
            return React.createElement(React.Fragment,null,
              React.createElement("button",{disabled:!draft.ready,onClick:()=>draft.save({text:"Synthetic earlier edit"})},"Save earlier"),
              React.createElement("button",{disabled:!draft.ready,onClick:()=>draft.save({text:"Synthetic replacement edit"})},"Save replacement"),
              React.createElement("button",{disabled:!draft.ready,onClick:()=>draft.clear()},"Clear copy"),
              React.createElement("p",{id:"status"},draft.status));
          }
          createRoot(document.getElementById("root")).render(React.createElement(App));`;
        },
        configureServer(s) {
          s.middlewares.use("/draft-latest", async (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await s.transformIndexHtml(
                "/draft-latest",
                '<div id="root"></div><script type="module" src="/@id/__x00__working-draft-latest.tsx"></script>',
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

it.each([false, true])(
  "persists the requested replacement after reconciling a prior committed save with a lost response (clear=%s)",
  async (clear) => {
    const page = await browser.newPage();
    let version = 0;
    let payload: any = null;
    let puts = 0;
    await page.route("**/api/csrf", (route) =>
      route.fulfill({ json: { csrf_token: "synthetic-csrf" } }),
    );
    await page.route("**/api/clinic/working_drafts/soap?*", async (route) => {
      if (route.request().method() === "PUT") {
        puts++;
        const body = route.request().postDataJSON();
        expect(body.expected_version).toBe(version);
        payload = body.payload;
        version++;
        if (puts === 1) {
          await route.abort("failed");
          return;
        }
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
    await page.goto(`${baseUrl}/draft-latest`);
    await page
      .getByRole("button", { name: "Save earlier", exact: true })
      .click();
    await expect.poll(() => page.locator("#status").innerText()).toBe("error");
    await page
      .getByRole("button", {
        name: clear ? "Clear copy" : "Save replacement",
        exact: true,
      })
      .click();
    await expect.poll(() => page.locator("#status").innerText()).toBe("saved");
    expect(payload).toEqual(
      clear ? null : { text: "Synthetic replacement edit" },
    );
    expect(puts).toBe(2);
    await page.close();
  },
);
