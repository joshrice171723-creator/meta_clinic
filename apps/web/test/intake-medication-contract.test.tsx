import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright-core";
import { fileURLToPath } from "node:url";

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;

beforeAll(async () => {
  const virtualId = "\0intake-medication-contract.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "intake-medication-contract-fixture",
        resolveId: (id) => (id === virtualId ? virtualId : undefined),
        load(id) {
          if (id !== virtualId) return;
          return `import React from "react";
          import {createRoot} from "react-dom/client";
          import {IntakeQuestions} from "/src/features/patientPortal/IntakeQuestions";
          function App() {
            const extended = new URLSearchParams(location.search).has("extended");
            const [answers,setAnswers] = React.useState({medications:new URLSearchParams(location.search).has("unknown")?{state:new URLSearchParams(location.search).get("state")||"unknown",value:""}:{state:"answered",value:"",entries:[{kind:"supplement",name:"",actual_use:"taking"}]}});
            return React.createElement(React.Fragment,null,
              React.createElement(IntakeQuestions,{fields:[{id:"medications",label:"Current medicines and supplements",history_kind:"medication",record_fields:extended?[{id:"product_id",label:"Catalog identifier"}]:[]}],answers,disabled:false,
                medicationReferences:[{id:"41",name:"Synthetic catalog vitamin"}],
                medicationOptions:[],onChange:setAnswers}),
              React.createElement("pre",{id:"answers"},JSON.stringify(answers)));
          }
          createRoot(document.getElementById("root")).render(React.createElement(App));`;
        },
        configureServer(s) {
          s.middlewares.use(
            "/medication-contract",
            async (_request, response) => {
              response.setHeader("Content-Type", "text/html");
              response.end(
                await s.transformIndexHtml(
                  "/medication-contract",
                  '<div id="root"></div><script type="module" src="/@id/__x00__intake-medication-contract.tsx"></script>',
                ),
              );
            },
          );
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
  "keeps manual medication details and sends catalog ids only for a declared field (extended=%s)",
  async (extended) => {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    page.setDefaultTimeout(5000);
    await page.goto(
      `${baseUrl}/medication-contract${extended ? "?extended" : ""}`,
    );
    const picker = page.getByRole("combobox", {
      name: "Medicine or supplement",
      exact: true,
    });
    await picker.click();
    await page.getByRole("option", { name: "Other — enter manually" }).click();
    await page
      .getByRole("textbox", {
        name: "Other medicine or supplement",
        exact: true,
      })
      .fill("QA Test Vitamin D3 1000 IU daily");
    const readEntry = async () =>
      JSON.parse(await page.locator("#answers").innerText()).medications
        .entries[0];
    let entry = await readEntry();
    expect(entry).toMatchObject({
      name: "QA Test Vitamin D3 1000 IU daily",
      actual_use: "taking",
    });
    if (extended) expect(entry.product_id).toBe("");
    else expect(entry).not.toHaveProperty("product_id");
    await picker.click();
    await page
      .getByRole("option", { name: "Synthetic catalog vitamin", exact: true })
      .click();
    entry = await readEntry();
    expect(entry).toMatchObject({
      name: "Synthetic catalog vitamin",
      actual_use: "taking",
    });
    if (extended) expect(entry.product_id).toBe("41");
    else expect(entry).not.toHaveProperty("product_id");
    await page.close();
  },
);

it("opening and cancelling an exception answer editor leaves the saved answer untouched", async () => {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/medication-contract?unknown`);
  const before = await page.locator("#answers").innerText();
  await page
    .getByRole("button", { name: "Enter an answer", exact: true })
    .click();
  expect(await page.locator("#answers").innerText()).toBe(before);
  await page
    .getByRole("button", { name: "Keep recorded answer", exact: true })
    .click();
  expect(await page.locator("#answers").innerText()).toBe(before);
  await page
    .getByRole("button", { name: "Enter an answer", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add medicine or supplement", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Other medicine or supplement", exact: true })
    .fill("Synthetic replacement medicine");
  const answer = JSON.parse(
    await page.locator("#answers").innerText(),
  ).medications;
  expect(answer.state).toBe("answered");
  expect(answer.entries[0].name).toBe("Synthetic replacement medicine");
  await page.close();
});

it("exposes the explicit Not asked answer in the browser accessibility tree", async () => {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/medication-contract?unknown&state=not_asked`);
  const status = page.getByRole("status");
  await expect.poll(() => status.innerText()).toBe("Recorded as Not asked");
  const cdp = await page.context().newCDPSession(page);
  expect(
    JSON.stringify(await cdp.send("Accessibility.getFullAXTree")),
  ).toContain("Recorded as Not asked");
  expect(await page.locator("#answers").innerText()).toContain(
    '"state":"not_asked"',
  );
  await page
    .getByRole("button", { name: "Enter an answer", exact: true })
    .click();
  expect(await page.locator("#answers").innerText()).toContain(
    '"state":"not_asked"',
  );
  await page.close();
});
