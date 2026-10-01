import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright-core";
import { fileURLToPath } from "node:url";

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;

beforeAll(async () => {
  const virtualId = "\0vitals-observed-time.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "vitals-observed-time-fixture",
        enforce: "pre",
        resolveId(id, importer) {
          if (id === virtualId) return virtualId;
          if (importer?.endsWith("/VitalSignsEntry.tsx")) {
            if (id === "./Workspace") return "\0vital-context";
            if (id === "./clinicNavigation") return "\0vital-navigation";
            if (id === "./useWorkingDraft") return "\0vital-draft";
          }
        },
        load(id) {
          if (id === "\0vital-context")
            return 'export const useClinic=()=>({practice:{timezone:new URLSearchParams(location.search).get("zone")}});';
          if (id === "\0vital-navigation")
            return "const registerBlocker=()=>()=>{}; export const useClinicNavigation=()=>({registerBlocker});";
          if (id === "\0vital-draft")
            return 'const save=async()=>true; export const useWorkingDraft=()=>({ready:true,restored:null,status:"idle",save,clear:save});';
          if (id !== virtualId) return;
          return `import React from "react";
          import {createRoot} from "react-dom/client";
          import {VitalSignsEntry} from "/src/features/clinic/VitalSignsEntry";
          import {StaffIntakeSections} from "/src/features/clinic/StaffIntakeSections";
          function App() {
            const [recorded,setRecorded]=React.useState(false);
            const [answers,setAnswers]=React.useState({date:{state:"answered",value:""},datetime:{state:"answered",value:""}});
            if(new URLSearchParams(location.search).has("intake")) return React.createElement(React.Fragment,null,
              React.createElement(StaffIntakeSections,{sectionId:"synthetic_dates",fields:[{id:"date",label:"Intake date",input_type:"date"},{id:"datetime",label:"Intake time",input_type:"datetime-local"}],answers,disabled:false,onChange:setAnswers}),
              React.createElement("output",{id:"answers"},JSON.stringify(answers)));
            return React.createElement(React.Fragment,null,
              React.createElement(VitalSignsEntry,{patientId:12,patientName:"Synthetic Patient",encounterId:30,onRecorded:()=>setRecorded(true)}),
              React.createElement("p",{id:"recorded"},String(recorded)));
          }
          createRoot(document.getElementById("root")).render(React.createElement(App));`;
        },
        configureServer(s) {
          s.middlewares.use("/vitals-time", async (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await s.transformIndexHtml(
                "/vitals-time",
                '<div id="root"></div><script type="module" src="/@id/__x00__vitals-observed-time.tsx"></script>',
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

it.each(["UTC", "America/Chicago", "Asia/Kolkata"])(
  "validates missing time accessibly and roundtrips device input to configured %s",
  async (zone) => {
    const page = await browser.newPage({ timezoneId: "America/New_York" });
    let submitted: any;
    await page.route("**/api/csrf", (route) =>
      route.fulfill({ json: { csrf_token: "synthetic" } }),
    );
    await page.route(
      "**/api/clinic/patients/12/encounters/30/vital_signs",
      async (route) => {
        if (route.request().method() === "GET") {
          await route.fulfill({
            json: {
              encounter_id: 30,
              dictionary_version: "synthetic-v1",
              code_system: "urn:apply:vital-signs",
              can_write: true,
              fields: [
                {
                  code: "pulse",
                  label: "Pulse",
                  group: null,
                  units: [{ code: "/min", label: "per minute" }],
                },
              ],
            },
          });
        } else {
          submitted = route.request().postDataJSON().vital_signs;
          const shared = {
            patient_id: 12,
            encounter_id: 30,
            code_system: "urn:apply:vital-signs",
            code_version: "synthetic-v1",
            observed_at: submitted.observed_at,
          };
          await route.fulfill({
            json: {
              observations: [
                { ...shared, id: 1, code: "vital-signs", value_kind: "group" },
                {
                  ...shared,
                  id: 2,
                  code: "pulse",
                  value_kind: "numeric",
                  numeric_value: "72",
                  unit_code: "/min",
                },
              ],
            },
          });
        }
      },
    );
    await page.goto(`${baseUrl}/vitals-time?zone=${encodeURIComponent(zone)}`);
    await page
      .getByRole("button", { name: "Record vital signs", exact: true })
      .click();
    await page.getByRole("textbox", { name: "Pulse", exact: true }).fill("72");
    const observed = page.getByLabel("Observed time (device local)", {
      exact: true,
    });
    await observed.fill("");
    await page
      .getByRole("button", { name: "Review measurements", exact: true })
      .click();
    expect(await observed.getAttribute("aria-invalid")).toBe("true");
    expect(await observed.evaluate((el) => document.activeElement === el)).toBe(
      true,
    );
    expect(await page.getByRole("alert").innerText()).toBe(
      "Record when these measurements were observed.",
    );
    const description = await observed.getAttribute("aria-describedby");
    expect(await page.locator(`[id="${description}"]`).innerText()).toBe(
      "Record when these measurements were observed.",
    );
    const cdp = await page.context().newCDPSession(page);
    expect(
      JSON.stringify(await cdp.send("Accessibility.getFullAXTree")),
    ).toContain("Record when these measurements were observed.");
    expect(submitted).toBeUndefined();
    await observed.fill("2026-07-15T10:30");
    await page
      .getByRole("button", { name: "Review measurements", exact: true })
      .click();
    expect(
      await page
        .getByText(`Observed (clinic time · ${zone}):`, { exact: true })
        .count(),
    ).toBe(1);
    const formatted = new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: zone,
    }).format(new Date("2026-07-15T14:30:00.000Z"));
    expect(
      (await page.getByRole("dialog").innerText()).replaceAll("\u202f", " "),
    ).toContain(formatted.replaceAll("\u202f", " "));
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Record vital signs", exact: true })
      .click();
    await expect.poll(() => page.locator("#recorded").innerText()).toBe("true");
    expect(submitted.observed_at).toBe("2026-07-15T14:30:00.000Z");
    expect(submitted.readings).toEqual([
      { code: "pulse", value: "72", unit_code: "/min" },
    ]);
    await page.close();
  },
  15000,
);

it("#11 intake date and datetime accept direct entry without calendar arrows or Enter", async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  try {
    await page.goto(`${baseUrl}/vitals-time?intake=1`);
    const date = page.getByLabel("Intake date", { exact: true });
    const datetime = page.getByLabel("Intake time", { exact: true });
    await date.waitFor();
    expect(await date.getAttribute("type")).toBe("date");
    expect(await datetime.getAttribute("type")).toBe("datetime-local");
    await date.fill("2030-10-29");
    await datetime.fill("2030-10-29T14:35");
    await datetime.press("Tab");
    expect(await date.inputValue()).toBe("2030-10-29");
    expect(await datetime.inputValue()).toBe("2030-10-29T14:35");
    await expect
      .poll(async () => JSON.parse(await page.locator("#answers").innerText()))
      .toEqual({
        date: { state: "answered", value: "2030-10-29" },
        datetime: { state: "answered", value: "2030-10-29T14:35" },
      });
    await date.fill("2030-11-02");
    expect(await date.inputValue()).toBe("2030-11-02");
    await expect
      .poll(
        async () =>
          JSON.parse(await page.locator("#answers").innerText()).date.value,
      )
      .toBe("2030-11-02");
  } finally {
    await page.close();
  }
}, 20000);
