import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Real QaWorkspace, React and MUI, with read transport isolated from all servers.
// Keep records pending: navigation semantics must work while data is loading too.
const root = fileURLToPath(new URL("..", import.meta.url));
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
        name: "isolated-qa-navigation",
        enforce: "pre",
        resolveId(source, importer) {
          if (source === "/qa-entry.js") return "\0qa-entry.js";
          if (
            source === "../../api/client" &&
            importer?.includes("/features/qa/")
          )
            return "\0qa-read-transport";
        },
        load(id) {
          if (id === "\0qa-read-transport")
            return "export const api = () => new Promise(() => {});";
          if (id === "\0qa-entry.js")
            return `
          import React from 'react'; import {createRoot} from 'react-dom/client';
          import {QaWorkspace} from '/src/features/qa/QaWorkspace.tsx';
          window.qaRoot = createRoot(document.getElementById('root'));
          window.qaRoot.render(React.createElement(QaWorkspace));`;
        },
        configureServer(vite) {
          vite.middlewares.use((request, response, next) => {
            if (request.url?.startsWith("/qa?")) {
              response.setHeader("Content-Type", "text/html");
              response.end(
                '<title>Previous application title</title><div id="root"></div><script type="module" src="/qa-entry.js"></script>',
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
      [
        "/usr/bin/chromium",
        "/usr/bin/google-chrome",
        chromium.executablePath(),
      ].find(existsSync),
    args: ["--no-sandbox"],
  });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});
async function open(view: string) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(base).origin || url.pathname.startsWith("/api/"))
      return route.abort();
    if (url.pathname === "/build.json")
      return route.fulfill({
        json: { revision: "a".repeat(40), version: "synthetic", dirty: false },
      });
    return route.continue();
  });
  await page.goto(`${base}qa?view=${view}`);
  await page.getByRole("navigation", { name: "QA workspace" }).waitFor();
  return page;
}
it("identifies exactly the initial current view, including an invalid-view fallback", async () => {
  for (const [view, label] of [
    ["atlas", "Implementation Atlas"],
    ["invalid", "Mission control"],
  ]) {
    const page = await open(view);
    try {
      const nav = page.getByRole("navigation", { name: "QA workspace" });
      expect(await nav.locator('[aria-current="page"]').count()).toBe(1);
      expect(
        await nav
          .getByRole("button", { name: new RegExp(label) })
          .getAttribute("aria-current"),
      ).toBe("page");
      await page.waitForFunction(
        (label) =>
          document.title === `${label} · QA Operations Desk · Meta Clinic`,
        label,
      );
    } finally {
      await page.close();
    }
  }
}, 60_000);
it("updates current-view semantics and the polite heading on Enter while retaining normal focus", async () => {
  const page = await open("overview");
  try {
    const nav = page.getByRole("navigation", { name: "QA workspace" });
    const heading = page.getByRole("heading", { level: 1 });
    expect(await heading.getAttribute("aria-live")).toBe("polite");
    expect(await heading.getAttribute("aria-atomic")).toBe("true");
    for (const label of ["Defect register", "Agent inbox"]) {
      const target = nav.getByRole("button", { name: new RegExp(label) });
      await target.focus();
      await page.keyboard.press("Enter");
      await page.waitForFunction(
        (label) => document.querySelector("h1")?.textContent === label,
        label,
      );
      expect(await nav.locator('[aria-current="page"]').count()).toBe(1);
      expect(await target.getAttribute("aria-current")).toBe("page");
      expect(
        await target.evaluate((node) => node === document.activeElement),
      ).toBe(true);
      expect(await heading.getAttribute("aria-live")).toBe("polite");
      await page.waitForFunction(
        (label) =>
          document.title === `${label} · QA Operations Desk · Meta Clinic`,
        label,
      );
    }
  } finally {
    await page.close();
  }
}, 60_000);
it("restores the previous document title when leaving the QA workspace", async () => {
  const page = await open("coverage");
  try {
    await page.waitForFunction(
      () =>
        document.title ===
        "Workflow coverage · QA Operations Desk · Meta Clinic",
    );
    await page.evaluate(() => (window as any).qaRoot.unmount());
    expect(await page.title()).toBe("Previous application title");
  } finally {
    await page.close();
  }
}, 60_000);
