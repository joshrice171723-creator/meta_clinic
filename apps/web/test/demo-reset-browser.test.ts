import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright-core";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Real DemoJourney and API client with an independently invented local API boundary.
// The expensive isolated backend reset proof is separate; no shared reset runs.
const root = fileURLToPath(new URL("..", import.meta.url));
const entry = `import React from 'react'; import {createRoot} from 'react-dom/client';
import {DemoJourney} from '/src/features/demo/DemoJourney.tsx';
createRoot(document.getElementById('root')).render(React.createElement(DemoJourney));`;
const fixture = {
  generation: 1,
  restored: false,
  resets: 0,
  advances: 0,
  confirmations: 0,
  bindings: new Map<string, number>([
    ["alpha", 1],
    ["beta", 1],
  ]),
  finish: null as null | (() => void),
};
function active() {
  return {
    active: true,
    run: {
      id: `synthetic-reset-${fixture.generation}`,
      template_key: "primary_care",
      lesson_key: "sandbox",
      sandbox: true,
      mode: "clinic",
      view: "clinic",
      clinic: {
        id: 109,
        name: "Synthetic Reset Clinic",
        slug: "synthetic-reset",
      },
      patient: null,
      lessons: [],
      steps: [
        {
          id: "sandbox",
          href: "/qa-workspace",
          title: "Sandbox",
          status: "available",
          description: "",
          requires: [],
        },
      ],
    },
  };
}
let server: ViteDevServer, browser: Browser, base: string;
beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root,
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "synthetic-demo-reset",
        enforce: "pre",
        resolveId(source) {
          if (source === "/qa-entry.tsx") return "\0qa-demo-reset-entry";
        },
        load(id) {
          if (id === "\0qa-demo-reset-entry") return entry;
        },
        configureServer(vite) {
          vite.middlewares.use((req, res, next) => {
            const path = new URL(req.url || "/", "http://synthetic.invalid")
              .pathname;
            if (path === "/qa") {
              res.setHeader("Content-Type", "text/html");
              res.end(
                '<div id="root"></div><script type="module" src="/qa-entry.tsx"></script>',
              );
              return;
            }
            if (path === "/qa-workspace") {
              res.setHeader("Content-Type", "text/html");
              res.end(
                `<p>${fixture.restored ? "Baseline restored" : "Edited workspace"}</p><script>parent.postMessage({type:'demo:loaded'},location.origin)</script>`,
              );
              return;
            }
            if (!path.startsWith("/api/")) return next();
            const visitor = String(req.headers["x-qa-visitor"] || "");
            const reply = (value: unknown, status = 200) => {
              res.statusCode = status;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(value));
            };
            if (path === "/api/csrf" && req.method === "GET")
              return reply({ csrf_token: "synthetic-reset-csrf" });
            if (
              req.method === "POST" &&
              req.headers["x-csrf-token"] !== "synthetic-reset-csrf"
            )
              return reply({ error: "Missing synthetic CSRF header" }, 403);
            if (path === "/api/demo/run" && req.method === "GET") {
              return reply(
                fixture.bindings.get(visitor) === fixture.generation
                  ? active()
                  : {
                      active: false,
                      visitor_registered: true,
                      lessons: [],
                      notice:
                        "This lesson restarted in another demo session. Choose it again to start fresh.",
                    },
              );
            }
            if (path === "/api/demo/lesson" && req.method === "POST") {
              let body = "";
              req.on("data", (chunk) => {
                body += chunk;
              });
              req.on("end", () => {
                const input = JSON.parse(body);
                if (input.lesson_key !== "sandbox")
                  return reply({ error: "Unexpected lesson" }, 422);
                if (input.restart === true) {
                  fixture.resets += 1;
                  fixture.generation += 1;
                  fixture.restored = false;
                }
                fixture.bindings.set(visitor, fixture.generation);
                reply(active(), 201);
              });
              return;
            }
            if (path === "/api/demo/sandbox/prepare" && req.method === "POST") {
              if (fixture.bindings.get(visitor) !== fixture.generation)
                return reply({ error: "Not found." }, 404);
              if (fixture.restored) {
                fixture.confirmations += 1;
                return reply({ complete: true });
              }
              fixture.advances += 1;
              if (fixture.advances === 1) return reply({ complete: false });
              fixture.finish = () => {
                fixture.restored = true;
                reply({ complete: true });
              };
              return;
            }
            reply({ error: "Unexpected synthetic request" }, 404);
          });
        },
      },
    ],
  });
  await server.listen();
  base = server.resolvedUrls!.local[0];
  await server.warmupRequest("/qa-entry.tsx");
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
      ["/usr/bin/chromium", chromium.executablePath()].find(existsSync),
    headless: true,
  });
  // Warm rendering only: no lesson or preparation POST and no reset.
  const warm = await browser.newPage({
    extraHTTPHeaders: { "X-QA-Visitor": "alpha" },
  });
  await warm.goto(`${base}qa`, { timeout: 15_000 });
  await warm.getByRole("button", { name: "Demo options", exact: true }).click();
  await warm
    .getByRole("menuitem", { name: "Reset Sandbox…", exact: true })
    .waitFor({ timeout: 15_000 });
  await warm.close();
}, 60_000);
afterAll(async () => {
  fixture.finish?.();
  await browser?.close();
  await server?.close();
});

it("#109 waits for staged reset and rebuilds the iframe before another visitor re-enters", async () => {
  const first = await browser.newContext({
    extraHTTPHeaders: { "X-QA-Visitor": "alpha" },
  });
  const second = await browser.newContext({
    extraHTTPHeaders: { "X-QA-Visitor": "beta" },
  });
  try {
    const owner = await first.newPage();
    const other = await second.newPage();
    owner.setDefaultTimeout(5_000);
    other.setDefaultTimeout(5_000);
    await owner.goto(`${base}qa`);
    await other.goto(`${base}qa`);
    await owner
      .frameLocator('iframe[title="Sandbox workspace"]')
      .getByText("Edited workspace", { exact: true })
      .waitFor();
    await other
      .frameLocator('iframe[title="Sandbox workspace"]')
      .getByText("Edited workspace", { exact: true })
      .waitFor();
    await owner
      .getByRole("button", { name: "Demo options", exact: true })
      .click();
    await owner
      .getByRole("menuitem", { name: "Reset Sandbox…", exact: true })
      .click();
    const dialog = owner.getByRole("dialog");
    await dialog
      .getByRole("heading", { name: "Reset Sandbox?", exact: true })
      .waitFor();
    await dialog
      .getByRole("button", { name: "Reset Sandbox", exact: true })
      .click();
    await expect.poll(() => fixture.advances).toBe(2);
    expect(await dialog.isVisible()).toBe(true);
    expect(
      await dialog
        .getByRole("button", { name: "Cancel", exact: true })
        .isDisabled(),
    ).toBe(true);
    expect(await owner.locator("iframe").count()).toBe(0);
    fixture.finish!();
    fixture.finish = null;
    await dialog.waitFor({ state: "hidden" });
    await owner
      .frameLocator('iframe[title="Sandbox workspace"]')
      .getByText("Baseline restored", { exact: true })
      .waitFor();
    expect(fixture.resets).toBe(1);
    await other.reload();
    await other
      .getByText(
        "This clinic was reset in another session. Open Sandbox to continue.",
        { exact: true },
      )
      .waitFor();
    await other
      .getByRole("button", { name: "Open Sandbox", exact: true })
      .click();
    await other
      .frameLocator('iframe[title="Sandbox workspace"]')
      .getByText("Baseline restored", { exact: true })
      .waitFor();
    expect(fixture.generation).toBe(2);
    expect(fixture.resets).toBe(1);
    expect(fixture.advances).toBe(2);
    expect(fixture.confirmations).toBe(1);
    expect(fixture.bindings.get("alpha")).toBe(fixture.bindings.get("beta"));
  } finally {
    await first.close();
    await second.close();
  }
}, 20_000);
