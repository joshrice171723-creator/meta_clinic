import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
const encounterPath = "/clinic/patients/71/encounters/72";

beforeAll(async () => {
  const virtualId = "\0encounter-section-navigation.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "encounter-section-navigation-fixture",
        resolveId: (id) => (id === virtualId ? virtualId : undefined),
        load(id) {
          if (id !== virtualId) return;
          return `import React from "react";
          import {createRoot} from "react-dom/client";
          import {Workspace} from "/src/features/clinic/Workspace";
          import {EncounterSectionRail} from "/src/features/clinic/CareFlow";
          import {ClinicNavigationProvider} from "/src/features/clinic/clinicNavigation";
          window.routeCalls = [];
          function Fixture() {
            const [confirmed,setConfirmed] = React.useState(false);
            return React.createElement(React.Fragment,null,
              React.createElement("button",{onClick:()=>setConfirmed(true)},"Confirm chart"),
              React.createElement(EncounterSectionRail,{chartConfirmed:confirmed}),
              confirmed && React.createElement(React.Fragment,null,
                React.createElement("section",{id:"chart-documentation",style:{marginTop:900}},
                  React.createElement("h2",null,"Documentation"),
                  React.createElement("textarea",{"aria-label":"Synthetic working note",defaultValue:"Preserved synthetic text"})),
                React.createElement("section",{id:"chart-completion",style:{marginTop:900,minHeight:900}},
                  React.createElement("h2",null,"Completion review"),
                  React.createElement("button",{disabled:true},"Complete encounter"))));
          }
          const navigation = {navigate:(href)=>{window.routeCalls.push(href);return true;},registerBlocker:()=>()=>{}};
          createRoot(document.getElementById("root")).render(
            React.createElement(ClinicNavigationProvider,{value:navigation},
              React.createElement(Workspace,{user:{id:71},path:${JSON.stringify(encounterPath)}},React.createElement(Fixture))));`;
        },
        configureServer(s) {
          s.middlewares.use(encounterPath, async (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await s.transformIndexHtml(
                encounterPath,
                '<div id="root"></div><script type="module" src="/@id/__x00__encounter-section-navigation.tsx"></script>',
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

async function fixture(page: Page) {
  page.setDefaultTimeout(4000);
  const writes: string[] = [];
  const context = {
    user_id: 71,
    schema_version: "clinic-context-v1",
    policy_version: "clinic-authorization-v1",
    membership_id: 91,
    credentials: [],
    practice: { id: 81, name: "Synthetic clinic", timezone: "UTC" },
    sites: [
      { id: 101, code: "FIRST", name: "Synthetic site", finalized: true },
    ],
    current_site: { id: 101, code: "FIRST", name: "Synthetic site" },
    capabilities: {
      patients: true,
      notes_read: true,
      notes_write: false,
      notes_sign: false,
    },
    features: {
      configured: true,
      finalized: true,
      site_specialty_configured: true,
    },
  };
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const request = route.request();
    if (request.method() !== "GET") writes.push(request.url());
    const path = new URL(request.url()).pathname;
    await route.fulfill({
      json:
        path === "/api/csrf"
          ? { csrf_token: "synthetic-token" }
          : path === "/api/clinic/context"
            ? context
            : { patients: [] },
    });
  });
  await page.goto(`${baseUrl}${encounterPath}#chart-signing`);
  await page
    .getByRole("button", { name: "Confirm chart", exact: true })
    .waitFor();
  await page.evaluate(() =>
    history.replaceState({ chartToken: "synthetic-state" }, "", location.href),
  );
  return writes;
}

it("keeps documentation and completion targets inside the confirmed chart composition", () => {
  const source = readFileSync(
    new URL("../src/features/clinic/CareFlow.tsx", import.meta.url),
    "utf8",
  );
  expect(source).toMatch(
    /<Box id="chart-documentation"[^>]*>\s*\{noteWorkspace\}/,
  );
  expect(source).toContain('id="chart-completion"');
});

it("jumps both sections without routing, writes or losing chart/history state", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  try {
    const writes = await fixture(page);
    const rail = page.getByRole("navigation", { name: "Encounter sections" });
    expect(
      await rail
        .getByRole("link", { name: "Documentation", exact: true })
        .count(),
    ).toBe(0);
    expect(
      await rail.getByRole("link", { name: "Completion", exact: true }).count(),
    ).toBe(0);
    await page
      .getByRole("button", { name: "Confirm chart", exact: true })
      .click();
    const note = page.getByRole("textbox", { name: "Synthetic working note" });
    await note.fill("Keep this exact synthetic draft");
    await rail
      .getByRole("link", { name: "Documentation", exact: true })
      .click();
    expect(new URL(page.url()).hash).toBe("#chart-documentation");
    await page.waitForFunction(
      () =>
        Math.abs(
          document
            .getElementById("chart-documentation")!
            .getBoundingClientRect().top,
        ) < 40,
    );
    const completion = rail.getByRole("link", {
      name: "Completion",
      exact: true,
    });
    await completion.focus();
    await page.keyboard.press("Enter");
    expect(new URL(page.url()).hash).toBe("#chart-completion");
    await page.waitForFunction(
      () =>
        Math.abs(
          document.getElementById("chart-completion")!.getBoundingClientRect()
            .top,
        ) < 40,
    );
    expect(await note.inputValue()).toBe("Keep this exact synthetic draft");
    expect(
      await page
        .getByRole("button", { name: "Complete encounter", exact: true })
        .isDisabled(),
    ).toBe(true);
    expect(await page.evaluate(() => history.state)).toEqual({
      chartToken: "synthetic-state",
    });
    expect(
      await page.evaluate(
        () => (window as unknown as { routeCalls: string[] }).routeCalls,
      ),
    ).toEqual([]);
    expect(writes).toEqual([]);
  } finally {
    await page.close();
  }
}, 15000);
