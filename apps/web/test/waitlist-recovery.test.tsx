import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright-core";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const entry = "\0waitlist-recovery.tsx";
let server: ViteDevServer, browser: Browser, origin: string;
beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root,
    cacheDir: resolve(root, "../../tmp/waitlist-recovery/vite-cache"),
    server: { host: "127.0.0.1", port: 0, hmr: false },
    optimizeDeps: {
      entries: [],
      noDiscovery: true,
      include: [
        "react",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "react-dom/client",
        "@mui/material",
        "@emotion/react",
        "@emotion/styled",
        "@mui/icons-material/ExpandMore",
      ],
    },
    plugins: [
      {
        name: "synthetic-waitlist-recovery",
        enforce: "pre",
        resolveId(id, importer) {
          if (id === entry) return entry;
          if (
            id === "./Workspace" &&
            importer?.endsWith("/WaitlistWorkspace.tsx")
          )
            return "\0waitlist-recovery-clinic";
        },
        load(id) {
          if (id === "\0waitlist-recovery-clinic")
            return "export const useClinic=()=>({capabilities:{appointments_book:true,facilities_write:false}});";
          if (id !== entry) return;
          return `import React from 'react';import {createRoot} from 'react-dom/client';
          import {WaitlistWorkspace} from '/src/features/clinic/WaitlistWorkspace';
          import {ClinicNavigationProvider,createClinicNavigationGuard} from '/src/features/clinic/clinicNavigation';
          import {collectDemoNavigationBlockers} from '/src/features/demo/navigationBlockers';
          const guard=createClinicNavigationGuard();window.fixtureGuard=guard;
          window.fixtureDemoBlockers=collectDemoNavigationBlockers;window.confirm=()=>true;
          createRoot(document.getElementById('root')).render(React.createElement(ClinicNavigationProvider,
            {value:{...guard,navigate:()=>false}},React.createElement(WaitlistWorkspace)));`;
        },
        configureServer(vite) {
          vite.middlewares.use("/waitlist-recovery", async (_req, res) => {
            res.setHeader("Content-Type", "text/html");
            res.end(
              await vite.transformIndexHtml(
                "/waitlist-recovery",
                '<div id="root"></div><script type="module" src="/@id/__x00__waitlist-recovery.tsx"></script>',
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
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.BROWSER_EXECUTABLE_PATH ||
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  });
}, 60000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
}, 30000);

it("blocks pending and HTTP408-unknown navigation, then releases it after an exact retry", async () => {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.setDefaultTimeout(8000);
  const writes: unknown[] = [],
    errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (request.method() === "POST") {
      writes.push(request.postDataJSON());
      if (writes.length === 1) {
        await gate;
        return route.fulfill({
          status: 408,
          json: { error: "Synthetic interrupted request" },
        });
      }
      return route.fulfill({
        json: { entry: { id: 11, state: "cancelled", version: 8 } },
      });
    }
    if (path === "/api/csrf")
      return route.fulfill({
        json: { csrf_token: "synthetic-waitlist-token" },
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
      json: {
        entries: [
          {
            id: 11,
            patient_id: 12,
            patient_name: "Synthetic Waitlist Patient",
            site_id: 4,
            site_name: "Synthetic site",
            clinician_id: 9,
            clinician_name: "Synthetic clinician",
            visit_type_id: 7,
            visit_type_name: "Synthetic visit",
            earliest_at: "2031-01-02T10:00:00Z",
            latest_at: "2031-01-02T11:00:00Z",
            duration_minutes: 30,
            state: "offered",
            version: 7,
            offer_starts_at: "2031-01-02T10:00:00Z",
            offer_ends_at: "2031-01-02T10:30:00Z",
            offer_expires_at: "2031-01-02T09:00:00Z",
            appointment_id: null,
          },
        ],
        total: 1,
        ranking: "Recorded order",
        sites: [],
        clinicians: [],
        visit_types: [],
        cancellations: [],
      },
    });
  });
  try {
    await page.goto(`${origin}/waitlist-recovery`, { timeout: 15000 });
    const remove = page.getByRole("button", {
      name: "Remove from waitlist",
      exact: true,
    });
    await remove.waitFor();
    expect(
      await page.evaluate(() =>
        (window as any).fixtureGuard.confirmNavigation(),
      ),
    ).toBe(true);
    await remove.click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll("button")].some(
        (button) =>
          button.textContent === "Remove from waitlist" && button.disabled,
      ),
    );
    expect(
      await page.evaluate(() =>
        (window as any).fixtureGuard.confirmNavigation(),
      ),
    ).toBe(false);
    release();
    await page
      .getByRole("button", { name: "Retry same request", exact: true })
      .waitFor();
    expect(
      await page.evaluate(() =>
        (window as any).fixtureGuard.confirmNavigation(),
      ),
    ).toBe(false);
    expect(
      await page.evaluate(() => (window as any).fixtureDemoBlockers().blocked),
    ).toBe(true);
    expect(
      await page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }),
    ).toBe(true);
    expect(writes).toHaveLength(1);
    await page
      .getByRole("button", { name: "Retry same request", exact: true })
      .click();
    await page.waitForFunction(() =>
      (window as any).fixtureGuard.confirmNavigation(),
    );
    expect(writes).toHaveLength(2);
    expect(writes[1]).toEqual(writes[0]);
    expect(errors).toEqual([]);
  } finally {
    release();
    await page.close();
  }
});
