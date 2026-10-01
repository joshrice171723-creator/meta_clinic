import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright-core";
import { fileURLToPath } from "node:url";
let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
beforeAll(async () => {
  const id = "\0updates-session-boundary.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "updates-session-fixture",
        resolveId: (value) => (value === id ? id : undefined),
        load(value) {
          if (value === id)
            return 'import React from "react";import {createRoot} from "react-dom/client";import {App} from "/src/App";createRoot(document.getElementById("root")).render(React.createElement(App));';
        },
        configureServer(s) {
          s.middlewares.use("/clinic/updates", async (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await s.transformIndexHtml(
                "/clinic/updates",
                '<div id="root"></div><script type="module" src="/@id/__x00__updates-session-boundary.tsx"></script>',
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

it("#255 authorized staff notes load without a selected location", async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const requests: string[] = [];
  try {
    await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
      const path = new URL(route.request().url()).pathname;
      requests.push(path);
      const now = Date.now();
      const policy = {
        server_time: new Date(now).toISOString(),
        idle_expires_at: new Date(now + 600000).toISOString(),
        absolute_expires_at: new Date(now + 3600000).toISOString(),
        idle_timeout_seconds: 600,
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
                ? {
                    user_id: 71,
                    schema_version: "clinic-context-v1",
                    policy_version: "clinic-authorization-v1",
                    membership_id: 91,
                    practice: { id: 81, name: "Synthetic clinic" },
                    current_site: null,
                    sites: [{ id: 101 }, { id: 102 }],
                  }
                : {},
      });
    });
    await page.goto(`${baseUrl}/clinic/updates`);
    await page
      .getByRole("heading", { name: "Notes for QA", exact: true })
      .waitFor();
    expect(
      await page.getByRole("dialog", { name: "Choose your location" }).count(),
    ).toBe(0);
    expect(
      await page
        .getByRole("link", { name: "Return to My launch", exact: true })
        .getAttribute("href"),
    ).toBe("/portal");
    expect(requests).toContain("/api/clinic/context");
    expect(requests).toContain("/api/session");
  } finally {
    await page.close();
  }
}, 15000);

it("#255 unauthenticated notes keep the existing login redirect and reveal no release notes", async () => {
  const page = await browser.newPage();
  try {
    await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
      const path = new URL(route.request().url()).pathname;
      await route.fulfill({
        json:
          path === "/api/csrf"
            ? {
                csrf_token: "synthetic-token",
                clinic_available: true,
                development_accounts: [],
              }
            : { user: null },
      });
    });
    await page.goto(`${baseUrl}/clinic/updates`);
    await page.waitForURL(
      (url) =>
        url.pathname === "/login" && url.searchParams.get("next") === "/portal",
      { timeout: 5000 },
    );
    expect(
      await page
        .getByRole("heading", { name: "Notes for QA", exact: true })
        .count(),
    ).toBe(0);
  } finally {
    await page.close();
  }
}, 15000);

it.each([
  ["patient-only account", null, 404],
  ["authenticated user without clinic membership", null, 403],
  ["revoked membership", { active: false, authorization_generation: 2 }, 403],
  ["disabled practice", { active: true, authorization_generation: 1 }, 403],
])(
  "#255 denies %s at the existing clinic authorization boundary",
  async (_label, access, status) => {
    const page = await browser.newPage();
    page.setDefaultTimeout(4000);
    try {
      await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
        const path = new URL(route.request().url()).pathname;
        const now = Date.now();
        if (path === "/api/clinic/context")
          return route.fulfill({
            status: Number(status),
            json: { error: "Synthetic clinic access denied" },
          });
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
                    clinic_access: access,
                    session_policy: {
                      server_time: new Date(now).toISOString(),
                      idle_expires_at: new Date(now + 600000).toISOString(),
                      absolute_expires_at: new Date(
                        now + 3600000,
                      ).toISOString(),
                      idle_timeout_seconds: 600,
                    },
                  }
                : {},
        });
      });
      await page.goto(`${baseUrl}/clinic/updates`);
      await page
        .getByText(/Synthetic clinic access denied|Session locked/i)
        .first()
        .waitFor();
      expect(
        await page
          .getByRole("heading", { name: "Notes for QA", exact: true })
          .count(),
      ).toBe(0);
    } finally {
      await page.close();
    }
  },
  10000,
);
