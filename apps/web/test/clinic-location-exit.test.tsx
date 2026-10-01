import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright-core";
import { fileURLToPath } from "node:url";
let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
beforeAll(async () => {
  const id = "\0clinic-location-exit.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "clinic-location-exit-fixture",
        resolveId: (value) => (value === id ? id : undefined),
        load(value) {
          if (value === id)
            return 'import React from "react";import {createRoot} from "react-dom/client";import {App} from "/src/App";createRoot(document.getElementById("root")).render(React.createElement(App));';
        },
        configureServer(s) {
          s.middlewares.use("/clinic/waitlist", async (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await s.transformIndexHtml(
                "/clinic/waitlist",
                '<div id="root"></div><script type="module" src="/@id/__x00__clinic-location-exit.tsx"></script>',
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

it("#256 explains the staff location gate and exits without selecting or loading waitlist patient data", async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const requests: { path: string; method: string }[] = [];
  try {
    await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      requests.push({ path, method: request.method() });
      const now = Date.now();
      const policy = {
        server_time: new Date(now).toISOString(),
        idle_expires_at: new Date(now + 600000).toISOString(),
        absolute_expires_at: new Date(now + 3600000).toISOString(),
        idle_timeout_seconds: 600,
      };
      const context = {
        user_id: 71,
        schema_version: "clinic-context-v1",
        policy_version: "clinic-authorization-v1",
        membership_id: 91,
        credentials: [],
        practice: { id: 81, name: "Synthetic clinic", timezone: "UTC" },
        sites: [
          { id: 101, name: "Synthetic first", code: "FIRST", finalized: true },
          {
            id: 102,
            name: "Synthetic second",
            code: "SECOND",
            finalized: true,
          },
        ],
        current_site: null,
        capabilities: { appointments_read: true },
        features: {
          configured: true,
          finalized: true,
          site_specialty_configured: true,
        },
      };
      await route.fulfill({
        json:
          path === "/api/csrf"
            ? {
                csrf_token: "synthetic-token",
                clinic_available: true,
                development_accounts: [],
              }
            : path === "/api/session"
              ? {
                  user: {
                    id: 71,
                    email_address: "synthetic@example.invalid",
                    admin: false,
                  },
                  clinic_access: { active: true, authorization_generation: 1 },
                  session_policy: policy,
                }
              : path === "/api/clinic/context"
                ? context
                : {},
      });
    });
    await page.goto(`${baseUrl}/clinic/waitlist`);
    const dialog = page.getByRole("dialog", { name: "Choose your location" });
    await dialog.waitFor();
    expect(await dialog.textContent()).toContain("This is a staff workspace.");
    expect(requests.some((request) => request.path.includes("waitlist"))).toBe(
      false,
    );
    expect(requests.some((request) => request.method !== "GET")).toBe(false);
    const exit = dialog.getByRole("link", {
      name: "Return to My launch",
      exact: true,
    });
    expect(await exit.getAttribute("href")).toBe("/portal");
    await exit.click();
    await page.waitForURL((url) => url.pathname === "/portal");
    expect(
      requests.some(
        (request) =>
          request.path === "/api/clinic/context" && request.method === "PATCH",
      ),
    ).toBe(false);
  } finally {
    await page.close();
  }
}, 15000);
