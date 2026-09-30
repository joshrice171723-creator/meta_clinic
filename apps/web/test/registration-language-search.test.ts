import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const root = fileURLToPath(new URL("..", import.meta.url));
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ApiError } from '/src/api/client.ts';
import { PatientRegistrationForm } from '/src/features/clinic/Patients.tsx';
const patient = { id: 100001, display_name: 'Avery Example', reference: 'LOCAL-MC03-001',
 updated_at: '2026-09-30T10:00:00Z', demographics: { legal_name: 'Avery Example',
 date_of_birth: '1990-02-03', sex: 'unknown', primary_language: 'eNgLiSh / original wording' }, contacts: [], emergency_contacts: [], social_histories: [] };
window.mc03 = {
 patient, requests: [], drafts: [], completed: 0, mode: 'ok',
 request(path, options = {}) {
  this.requests.push({path, method: options.method || 'GET', body: options.body});
  if (path.includes('/lookup?')) {
   if (this.mode === 'lookup-error') return Promise.reject(new Error('Synthetic lookup unavailable'));
   const patients = [patient, {...patient, id: 100002, display_name: 'Other synthetic person'}];
   return Promise.resolve({patients, pagination: {total: this.mode === 'partial' ? 101 : 2}});
  }
  if (options.method === 'PATCH') {
   if (this.mode === 'unknown') {this.mode = 'ok'; return Promise.reject(new Error('Synthetic response lost'));}
   if (this.mode === 'stale') {this.mode = 'ok'; return Promise.reject(new ApiError(409, 'Changed', 'stale_record'));}
   patient.demographics.primary_language = options.body.clinic_patient.primary_language; return Promise.resolve({patient});
  }
  if (path === '/api/clinic/patients/100001') return Promise.resolve({patient: {...patient,
    display_name: 'Latest saved name', updated_at: '2026-09-30T11:00:00Z'}});
  throw new Error('Unexpected synthetic path: ' + path);
 }
};
window.mc03.draft = {ready: true, restored: null, status: 'idle',
 save: async value => {window.mc03.drafts.push(structuredClone(value)); return true;},
 clear: async () => true};
let host = createRoot(document.getElementById('root')); const mount = () => host.render(React.createElement(PatientRegistrationForm,{patient,onSuccess:()=>window.mc03.completed++})); mount(); window.mc03.remount = () => {host.unmount();host=createRoot(document.getElementById('root'));mount();};
`;
let server: ViteDevServer;
let browser: Browser;
let base: string;
beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root,
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "synthetic-identity-correction",
        enforce: "pre",
        resolveId(source, importer) {
          if (source === "/mc03-entry.tsx") return "\0mc03-entry";
          if (
            importer?.endsWith("/Patients.tsx") &&
            source === "../../api/client"
          )
            return "\0mc03-client";
          if (
            importer?.endsWith("/Patients.tsx") &&
            source === "./useWorkingDraft"
          )
            return "\0mc03-draft";
        },
        load(id) {
          if (id === "\0mc03-entry") return entry;
          if (id === "\0mc03-client")
            return `export * from '/src/api/client.ts'; export const api = (...args) => window.mc03.request(...args);`;
          if (id === "\0mc03-draft")
            return `export const useWorkingDraft = () => window.mc03.draft;`;
        },
        configureServer(vite) {
          vite.middlewares.use((req, res, next) => {
            if (req.url === "/mc03") {
              res.setHeader("Content-Type", "text/html");
              res.end(
                '<div id="root"></div><script type="module" src="/mc03-entry.tsx"></script>',
              );
            } else next();
          });
        },
      },
    ],
  });
  await server.listen();
  base = server.resolvedUrls!.local[0];
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
      ["/usr/bin/chromium", chromium.executablePath()].find(existsSync),
    args: ["--no-sandbox"],
  });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});
async function open(mode = "ok") {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === new URL(base).origin &&
    !new URL(route.request().url()).pathname.startsWith("/api/")
      ? route.continue()
      : route.abort(),
  );
  await page.goto(`${base}mc03`);
  await page
    .getByRole("button", { name: "Save registration details", exact: true })
    .waitFor();
  await page.evaluate((mode) => ((window as any).mc03.mode = mode), mode);
  return page;
}
const changes = (page: Page) =>
  page.evaluate(() =>
    (window as any).mc03.requests.filter((r: any) => r.method === "PATCH"),
  );
async function review(page: Page, name = "Avery Corrected") {
  await page.getByLabel("Name shown in chart", { exact: false }).fill(name);
  await page
    .getByRole("button", { name: "Save registration details", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Review identity correction" })
    .waitFor();
}
async function confirm(page: Page) {
  await page
    .getByRole("button", { name: "Save identity correction", exact: true })
    .click();
  await page.waitForFunction(() =>
    (window as any).mc03.requests.some((r: any) => r.method === "PATCH"),
  );
}

it("searches standard name suggestions by keyboard and checkpoints selection before submit", async () => {
  const page = await open();
  try {
    const input = page.getByRole("combobox", {
      name: "Preferred language",
      exact: true,
    });
    await input.fill("sPaN");
    await page.getByRole("option", { name: "Spanish", exact: true }).waitFor();
    await input.press("ArrowDown");
    await input.press("Enter");
    expect(await input.inputValue()).toBe("Spanish");
    expect(await changes(page)).toHaveLength(0);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as any).mc03.drafts.at(-1)?.body.clinic_patient
              .primary_language,
        ),
      )
      .toBe("Spanish");
    await page
      .getByRole("button", { name: "Save registration details", exact: true })
      .click();
    await page.waitForFunction(() => (window as any).mc03.completed === 1);
    expect((await changes(page))[0].body.clinic_patient.primary_language).toBe(
      "Spanish",
    );
    expect(
      await page.evaluate(() =>
        (window as any).mc03.requests.some((r: any) =>
          r.path.includes("/lookup?"),
        ),
      ),
    ).toBe(false);
  } finally {
    await page.close();
  }
}, 60000);

it.each(["eNgLiSh", "Unlisted language / patient's wording", ""])(
  "retains manual language %s through blur and response-backed remount",
  async (value) => {
    const page = await open();
    try {
      const input = page.getByRole("combobox", {
        name: "Preferred language",
        exact: true,
      });
      await input.fill(value);
      await input.press("Tab");
      expect(await input.inputValue()).toBe(value);
      await page
        .getByRole("button", { name: "Save registration details", exact: true })
        .click();
      await page.waitForFunction(() => (window as any).mc03.completed === 1);
      expect(
        (await changes(page))[0].body.clinic_patient.primary_language,
      ).toBe(value);
      await page.evaluate(() => (window as any).mc03.remount());
      await expect
        .poll(() =>
          page
            .getByRole("combobox", { name: "Preferred language", exact: true })
            .inputValue(),
        )
        .toBe(value);
    } finally {
      await page.close();
    }
  },
  60000,
);

it("round-trips an existing nonstandard, mixed-case language unchanged when saving other registration fields", async () => {
  const page = await open();
  try {
    const input = page.getByRole("combobox", {
      name: "Preferred language",
      exact: true,
    });
    expect(await input.inputValue()).toBe("eNgLiSh / original wording");
    await page
      .getByRole("button", { name: "Save registration details", exact: true })
      .click();
    await page.waitForFunction(() => (window as any).mc03.completed === 1);
    expect((await changes(page))[0].body.clinic_patient.primary_language).toBe(
      "eNgLiSh / original wording",
    );
    await page.evaluate(() => (window as any).mc03.remount());
    await expect
      .poll(() =>
        page
          .getByRole("combobox", { name: "Preferred language", exact: true })
          .inputValue(),
      )
      .toBe("eNgLiSh / original wording");
  } finally {
    await page.close();
  }
}, 60000);
