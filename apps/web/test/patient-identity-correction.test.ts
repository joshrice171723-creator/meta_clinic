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
 date_of_birth: '1990-02-03', sex: 'unknown' }, contacts: [], emergency_contacts: [], social_histories: [] };
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
   return Promise.resolve({patient});
  }
  if (path === '/api/clinic/patients/100001') return Promise.resolve({patient: {...patient,
    display_name: 'Latest saved name', updated_at: '2026-09-30T11:00:00Z'}});
  throw new Error('Unexpected synthetic path: ' + path);
 }
};
window.mc03.draft = {ready: true, restored: null, status: 'idle',
 save: async value => {window.mc03.drafts.push(structuredClone(value)); return true;},
 clear: async () => true};
createRoot(document.getElementById('root')).render(React.createElement(PatientRegistrationForm,
 {patient, onSuccess: () => window.mc03.completed++}));
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
it("reviews before/after identity, excludes self, deduplicates matches and updates only the current patient", async () => {
  const page = await open();
  try {
    await review(page);
    const table = page.getByRole("table", {
      name: "Identity correction comparison",
    });
    expect(await table.textContent()).toContain("Avery Example");
    expect(await table.textContent()).toContain("Avery Corrected");
    expect(await page.getByRole("link", { name: /Open patient/ }).count()).toBe(
      1,
    );
    expect(await changes(page)).toHaveLength(0);
    await confirm(page);
    await page.waitForFunction(() => (window as any).mc03.completed === 1);
    const saved = await changes(page);
    expect(saved).toHaveLength(1);
    expect(saved[0].path).toBe("/api/clinic/patients/100001");
    expect(saved[0].body.clinic_patient.display_name).toBe("Avery Corrected");
    expect(saved[0].body.clinic_patient.expected_updated_at).toBe(
      "2026-09-30T10:00:00Z",
    );
  } finally {
    await page.close();
  }
}, 60_000);
it.each(["lookup-error", "partial"])(
  "blocks %s matching and retains edits for a fresh review",
  async (mode) => {
    const page = await open(mode);
    try {
      await review(page);
      await page
        .getByRole("button", { name: "Edit registration details", exact: true })
        .waitFor();
      expect(
        await page
          .getByRole("button", {
            name: "Save identity correction",
            exact: true,
          })
          .isDisabled(),
      ).toBe(true);
      expect(await changes(page)).toHaveLength(0);
      await page
        .getByRole("button", { name: "Edit registration details", exact: true })
        .click();
      expect(
        await page
          .getByLabel("Name shown in chart", { exact: false })
          .inputValue(),
      ).toBe("Avery Corrected");
      await page.evaluate(() => ((window as any).mc03.mode = "ok"));
      await review(page, "Avery Revised");
      await confirm(page);
      expect((await changes(page))[0].body.clinic_patient.display_name).toBe(
        "Avery Revised",
      );
    } finally {
      await page.close();
    }
  },
  60_000,
);
it("retries an unknown outcome with the same patient, payload and key without rechecking identity", async () => {
  const page = await open("unknown");
  try {
    await review(page);
    await confirm(page);
    await page
      .getByRole("button", { name: "Retry same request", exact: true })
      .waitFor();
    const before = await page.evaluate(
      () => (window as any).mc03.requests.length,
    );
    await page
      .getByRole("button", { name: "Retry same request", exact: true })
      .dblclick();
    await page.waitForFunction(() => (window as any).mc03.completed === 1);
    const saved = await changes(page);
    expect(saved).toHaveLength(2);
    expect(saved[1]).toEqual(saved[0]);
    expect(
      await page.evaluate(() => (window as any).mc03.requests.length),
    ).toBe(before + 1);
  } finally {
    await page.close();
  }
}, 60_000);
it("requires review against the newly loaded saved identity after a stale-version rejection", async () => {
  const page = await open("stale");
  try {
    await review(page);
    await confirm(page);
    await page.getByText("Latest saved name", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Save registration details", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Review identity correction" })
      .waitFor();
    expect(
      await page
        .getByRole("table", { name: "Identity correction comparison" })
        .textContent(),
    ).toContain("Latest saved name");
    expect(await changes(page)).toHaveLength(1);
    await page
      .getByRole("button", { name: "Save identity correction", exact: true })
      .click();
    await page.waitForFunction(() => (window as any).mc03.completed === 1);
    expect(
      (await changes(page))[1].body.clinic_patient.expected_updated_at,
    ).toBe("2026-09-30T11:00:00Z");
  } finally {
    await page.close();
  }
}, 60_000);
it("saves an unchanged identity without a new lookup", async () => {
  const page = await open();
  try {
    await page
      .getByRole("button", { name: "Save registration details", exact: true })
      .click();
    await page.waitForFunction(() => (window as any).mc03.completed === 1);
    expect(
      await page.evaluate(() => (window as any).mc03.requests.length),
    ).toBe(1);
    expect(await changes(page)).toHaveLength(1);
  } finally {
    await page.close();
  }
}, 60_000);
