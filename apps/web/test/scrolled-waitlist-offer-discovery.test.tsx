import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const evidence =
  process.env.WAITLIST_DISCOVERY_EVIDENCE ||
  resolve(root, "../../tmp/waitlist-discovery-evidence");
let server: ViteDevServer;
let browser: Browser;
let url: string;
const entries = Array.from({ length: 24 }, (_, index) => ({
  id: 1201 + index,
  patient_id: 801 + index,
  patient_name: `Synthetic Waiting Patient ${index + 1}`,
  site_id: 4,
  site_name: "Synthetic site",
  clinician_id: 9,
  clinician_name: "Synthetic clinician",
  visit_type_id: 7,
  visit_type_name: "Synthetic visit",
  earliest_at: "2030-01-02T09:00:00Z",
  latest_at: "2030-01-05T18:00:00Z",
  duration_minutes: 30,
  state: "waiting",
  version: 11 + index,
  offer_starts_at: null,
  offer_ends_at: null,
  offer_expires_at: null,
  appointment_id: null,
}));

beforeAll(async () => {
  mkdirSync(evidence, { recursive: true });
  const entry = "\0waitlist-discovery-fixture.tsx";
  server = await createServer({
    configFile: false,
    root,
    cacheDir: resolve(evidence, "vite-cache"),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "controlled-waitlist-discovery",
        enforce: "pre",
        resolveId(id, importer) {
          if (id === entry) return entry;
          if (
            id === "./Workspace" &&
            /\/WaitlistWorkspace\.tsx$/.test(importer ?? "")
          )
            return "\0waitlist-discovery-clinic";
        },
        load(id) {
          if (id === "\0waitlist-discovery-clinic")
            return "export const useClinic=()=>({capabilities:{appointments_book:true,facilities_write:false}});";
          if (id === entry)
            return `import React from "react";import {createRoot} from "react-dom/client";
          import {WaitlistWorkspace} from "/src/features/clinic/WaitlistWorkspace";
          createRoot(document.getElementById("root")).render(React.createElement(WaitlistWorkspace));`;
        },
        configureServer(vite) {
          vite.middlewares.use(
            "/waitlist-discovery-fixture",
            async (_request, response) => {
              response.setHeader("Content-Type", "text/html");
              response.end(
                await vite.transformIndexHtml(
                  "/waitlist-discovery-fixture",
                  '<title>Synthetic waitlist discovery fixture</title><style>body{margin:0;font-family:Arial}#root{padding:20px;max-width:1160px;margin:auto}</style><div id="root"></div><script type="module" src="/@id/__x00__waitlist-discovery-fixture.tsx"></script>',
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
    throw new Error("No fixture port");
  url = `http://127.0.0.1:${address.port}/waitlist-discovery-fixture`;
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || "/usr/bin/chromium",
    headless: true,
  });
}, 30000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
}, 30000);

it("reveals the offer draft from a scrolled list by pointer and keyboard without any mutation", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  page.setDefaultTimeout(8000);
  const mutations: Array<{ path: string; method: string }> = [];
  const errors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) =>
    failedRequests.push(`${request.url()}: ${request.failure()?.errorText}`),
  );
  try {
    await page.route(
      (url) => url.pathname.startsWith("/api/"),
      async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (request.method() !== "GET") {
          mutations.push({ path, method: request.method() });
          return route.fulfill({
            status: 405,
            json: { error: "Synthetic proof forbids all mutations" },
          });
        }
        if (path === "/api/csrf")
          return route.fulfill({
            json: { csrf_token: "synthetic-waitlist-discovery" },
          });
        if (path === "/api/clinic/waitlist")
          return route.fulfill({
            json: {
              entries,
              total: entries.length,
              ranking: "Synthetic first-requested order",
              sites: [{ id: 4, name: "Synthetic site" }],
              clinicians: [{ id: 9, name: "Synthetic clinician" }],
              visit_types: [{ id: 7, name: "Synthetic visit" }],
              cancellations: [],
            },
          });
        if (path === "/api/clinic/capacity")
          return route.fulfill({
            json: {
              rules: [],
              timezone: "UTC",
              site_availability: [],
              can_block: false,
            },
          });
        return route.fulfill({
          status: 404,
          json: { error: "Unexpected synthetic read" },
        });
      },
    );
    await page.goto(url);
    await page
      .getByRole("heading", { name: "Capacity and waitlist", exact: true })
      .waitFor({ timeout: 15000 });
    const buttons = page.getByRole("button", {
      name: "Offer a time",
      exact: true,
    });
    await buttons.nth(3).waitFor();
    await buttons
      .nth(3)
      .evaluate((node) => node.scrollIntoView({ block: "center" }));
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
    await buttons.nth(3).click();
    const heading = page.getByRole("heading", {
      name: "Offer to Synthetic Waiting Patient 4",
      exact: true,
    });
    await heading.waitFor();
    const pointer = await heading.evaluate((node) => ({
      top: node.getBoundingClientRect().top,
      bottom: node.getBoundingClientRect().bottom,
      viewport: innerHeight,
      focused: document.activeElement === node,
      activeText: document.activeElement?.textContent,
    }));
    writeFileSync(
      resolve(evidence, "pointer-observation.json"),
      JSON.stringify({ pointer, mutations, errors }, null, 2),
    );
    await page.screenshot({ path: resolve(evidence, "pointer-open.png") });
    expect(mutations).toEqual([]);
    expect(pointer.focused).toBe(true);
    expect(pointer.top).toBeGreaterThanOrEqual(0);
    expect(pointer.bottom).toBeLessThanOrEqual(pointer.viewport);
    const date = page.getByLabel("Offer date", { exact: true });
    const dateBounds = await date.boundingBox();
    expect(dateBounds!.y + dateBounds!.height).toBeLessThanOrEqual(900);
    await date.fill("2030-01-03");
    expect(await date.inputValue()).toBe("2030-01-03");
    expect(await date.evaluate((node) => document.activeElement === node)).toBe(
      true,
    );
    expect(
      await page
        .getByRole("button", {
          name: "Hold time and publish offer",
          exact: true,
        })
        .isDisabled(),
    ).toBe(true);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await buttons.nth(6).scrollIntoViewIfNeeded();
    await buttons.nth(6).focus();
    expect(
      await buttons.nth(6).evaluate((node) => document.activeElement === node),
    ).toBe(true);
    await page.keyboard.press("Enter");
    const keyboardHeading = page.getByRole("heading", {
      name: "Offer to Synthetic Waiting Patient 7",
      exact: true,
    });
    await keyboardHeading.waitFor();
    const keyboard = await keyboardHeading.evaluate((node) => ({
      top: node.getBoundingClientRect().top,
      bottom: node.getBoundingClientRect().bottom,
      viewport: innerHeight,
      focused: document.activeElement === node,
    }));
    expect(keyboard.focused).toBe(true);
    expect(keyboard.top).toBeGreaterThanOrEqual(0);
    expect(keyboard.bottom).toBeLessThanOrEqual(keyboard.viewport);
    await page.keyboard.press("Tab");
    expect(
      await page
        .getByLabel("Offer date", { exact: true })
        .evaluate((node) => document.activeElement === node),
    ).toBe(true);
    expect(await page.getByText("waiting", { exact: true }).count()).toBe(24);
    expect(mutations).toEqual([]);
    expect(errors).toEqual([]);
    expect(entries[3].version).toBe(14);
    expect(entries[6].version).toBe(17);
    await page.screenshot({ path: resolve(evidence, "keyboard-open.png") });
    writeFileSync(
      resolve(evidence, "passed.json"),
      JSON.stringify(
        {
          layer:
            "controlled real WaitlistWorkspace; synthetic useClinic projection; intercepted API; no database",
          pointer,
          keyboard,
          mutations,
          errors,
          waiting: 24,
          draftRetained: true,
        },
        null,
        2,
      ),
    );
  } finally {
    writeFileSync(
      resolve(evidence, "runtime-observation.json"),
      JSON.stringify(
        {
          mutations,
          errors,
          consoleErrors,
          failedRequests,
          text: await page.locator("body").innerText(),
        },
        null,
        2,
      ),
    );
    await page.close();
  }
}, 45000);
