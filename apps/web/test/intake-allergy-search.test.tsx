import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright-core";
import { fileURLToPath } from "node:url";

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;

beforeAll(async () => {
  const virtualId = "\0intake-allergy-search.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "intake-allergy-search-fixture",
        resolveId: (id) => (id === virtualId ? virtualId : undefined),
        load(id) {
          if (id !== virtualId) return;
          return `import React from "react";
          import {createRoot} from "react-dom/client";
          import {IntakeQuestions} from "/src/features/patientPortal/IntakeQuestions";
          const original = {state:"answered", value:"", entries:[
            {kind:"intolerance",name:"Historic synthetic substance",date_precision:"unknown",date_value:"",certainty:"reported",severity:"mild",details:"Original detail"},
            {kind:"adverse_effect",name:"Second synthetic substance",date_precision:"unknown",date_value:"",certainty:"uncertain",severity:"unknown",details:"Keep separate"}
          ]};
          function App() {
            const [answers,setAnswers] = React.useState({allergies:original});
            const [disabled,setDisabled] = React.useState(false);
            const [catalog,setCatalog] = React.useState(true);
            return React.createElement(React.Fragment,null,
              React.createElement(IntakeQuestions,{fields:[{id:"allergies",label:"Allergies and reactions",history_kind:"allergy"}],answers,disabled,
                medicationReferences:catalog?[{id:"41",name:"Synthetic catalog tablet"},{id:"42",name:"Synthetic catalog tablet"}]:[],
                medicationOptions:catalog?["Synthetic catalog tablet","Synthetic alternate tablet"]:[],onChange:setAnswers}),
              React.createElement("button",{onClick:()=>setDisabled(!disabled)},"Toggle editing"),
              React.createElement("button",{onClick:()=>setCatalog(false)},"Remove catalog"),
              React.createElement("pre",{id:"answers",style:{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}},JSON.stringify(answers)));
          }
          createRoot(document.getElementById("root")).render(React.createElement(App));`;
        },
        configureServer(s) {
          s.middlewares.use("/allergy-search", async (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await s.transformIndexHtml(
                "/allergy-search",
                '<div id="root"></div><script type="module" src="/@id/__x00__intake-allergy-search.tsx"></script>',
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

it("selects a deduplicated catalog name by keyboard without altering reaction details or another record", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  page.setDefaultTimeout(5000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${baseUrl}/allergy-search`);
  const input = page
    .getByRole("combobox", { name: "Substance or product" })
    .first();
  await input.fill("catalog");
  await page
    .getByRole("option", { name: "Synthetic catalog tablet", exact: true })
    .waitFor();
  expect(
    await page
      .getByRole("option", { name: "Synthetic catalog tablet", exact: true })
      .count(),
  ).toBe(1);
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect
    .poll(
      async () =>
        JSON.parse(await page.locator("#answers").innerText()).allergies
          .entries[0].name,
    )
    .toBe("Synthetic catalog tablet");
  const entries = JSON.parse(await page.locator("#answers").innerText())
    .allergies.entries;
  expect(entries[0]).toMatchObject({
    kind: "intolerance",
    severity: "mild",
    details: "Original detail",
  });
  expect(entries[0]).not.toHaveProperty("product_id");
  expect(entries[1]).toMatchObject({
    name: "Second synthetic substance",
    kind: "adverse_effect",
    details: "Keep separate",
  });
  expect(errors).toEqual([]);
  await page.close();
});

it("keeps uncatalogued text before blur, survives catalog removal, and clears explicitly", async () => {
  const page = await browser.newPage({
    viewport: { width: 834, height: 1112 },
  });
  page.setDefaultTimeout(5000);
  await page.goto(`${baseUrl}/allergy-search`);
  const input = page
    .getByRole("combobox", { name: "Substance or product" })
    .first();
  await input.fill("Synthetic environmental substance");
  await expect
    .poll(
      async () =>
        JSON.parse(await page.locator("#answers").innerText()).allergies
          .entries[0].name,
    )
    .toBe("Synthetic environmental substance");
  await page.getByRole("button", { name: "Remove catalog" }).click();
  expect(await input.inputValue()).toBe("Synthetic environmental substance");
  await input.fill("");
  await expect
    .poll(
      async () =>
        JSON.parse(await page.locator("#answers").innerText()).allergies
          .entries[0].name,
    )
    .toBe("");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.close();
});

it("preserves historical free text when editing is disabled", async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  await page.goto(`${baseUrl}/allergy-search`);
  const before = await page.locator("#answers").innerText();
  await page.getByRole("button", { name: "Toggle editing" }).click();
  const input = page
    .getByRole("combobox", { name: "Substance or product" })
    .first();
  expect(await input.isDisabled()).toBe(true);
  expect(await input.inputValue()).toBe("Historic synthetic substance");
  expect(await page.locator("#answers").innerText()).toBe(before);
  await page.close();
});
