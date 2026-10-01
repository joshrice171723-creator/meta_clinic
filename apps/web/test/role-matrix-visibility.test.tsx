import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright-core";
import { fileURLToPath } from "node:url";

// Actual Operations capability mount and matrix readback, synthetic HTTP only.
let server: ViteDevServer, browser: Browser, baseUrl: string;
beforeAll(async () => {
  const entry = "\0role-matrix-fixture";
  const unrelated = [
    "LabReviewWorklist",
    "LabFollowUpWorklist",
    "OperationFollowUps",
    "OperationsProviderReadiness",
    "OperationsIntegrationInventory",
    "OperationsReportsCatalog",
    "OperationsWorkflowGuide",
    "OwnerMorningView",
  ];
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "role-matrix-visibility",
        enforce: "pre",
        resolveId(id, importer) {
          if (id === entry) return entry;
          if (importer?.endsWith("/Operations.tsx")) {
            if (id === "./Workspace") return "\0role-matrix-context";
            const name = id.replace(/^\.\//, "");
            if (unrelated.includes(name))
              return `\0role-matrix-unrelated-${name}`;
          }
        },
        load(id) {
          if (id === "\0role-matrix-context")
            return `export const useClinic=()=>({capabilities:{roles:window.allowedRoles},current_site:{id:17},practice:{timezone:"UTC"}});
        export const useClinicOverview=()=>({capabilities:{patients_access:false,inventory_access:false,staff_access:false}});`;
          if (id.startsWith("\0role-matrix-unrelated-")) {
            const name = id.slice("\0role-matrix-unrelated-".length);
            return `export const ${name}=()=>null;`;
          }
          if (id === entry)
            return `import React from "react";import {createRoot} from "react-dom/client";import {Operations} from "/src/features/clinic/Operations";createRoot(document.getElementById("root")).render(React.createElement(Operations));`;
        },
        configureServer(s) {
          s.middlewares.use("/role-matrix-test", async (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await s.transformIndexHtml(
                "/role-matrix-test",
                '<div id="root"></div><script type="module" src="/@id/__x00__role-matrix-fixture"></script>',
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
    throw new Error("No fixture port");
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
it.each([
  { name: "permitted", allowed: true, status: 200 },
  { name: "no projected role capability", allowed: false, status: 200 },
  {
    name: "server denial despite projected capability",
    allowed: true,
    status: 403,
  },
])(
  "66 existing role matrix: $name",
  async (scenario) => {
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    let csrfReads = 0;
    const requests: { method: string; path: string; search: string }[] = [];
    await page.addInitScript(
      (value) => Object.assign(window, { allowedRoles: value }),
      scenario.allowed,
    );
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname === "/api/csrf") {
        csrfReads++;
        return route.fulfill({
          json: { csrf_token: "synthetic-fixture-not-a-credential" },
        });
      }
      requests.push({
        method: route.request().method(),
        path: url.pathname,
        search: url.search,
      });
      if (url.pathname !== "/api/clinic/role_versions") return route.abort();
      await route.fulfill({
        status: scenario.status,
        json:
          scenario.status === 403
            ? { error: "Synthetic role read denied" }
            : {
                role_versions: [
                  {
                    id: 701,
                    role_code: "synthetic-intake-reviewer",
                    version: 3,
                    permissions: ["patients.read", "intake.write"],
                  },
                  {
                    id: 702,
                    role_code: "synthetic-appointment-reader",
                    version: 2,
                    permissions: ["appointments.read"],
                  },
                ],
                pagination: { total: 2 },
              },
      });
    });
    try {
      await page.goto(`${baseUrl}/role-matrix-test`);
      await page
        .getByRole("heading", { name: "Morning view", exact: true })
        .waitFor();
      const heading = page.getByRole("heading", {
        name: "Role and permission matrix",
        exact: true,
      });
      const table = page.getByRole("table", {
        name: "Role versions and permission codes",
        exact: true,
      });
      if (!scenario.allowed) {
        expect(await heading.count()).toBe(0);
        expect(await table.count()).toBe(0);
        expect(requests).toHaveLength(0);
      } else if (scenario.status === 403) {
        const error = page.getByRole("alert");
        await error.waitFor();
        expect(await error.innerText()).toContain("Synthetic role read denied");
        expect(await table.count()).toBe(0);
        const retryResponse = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === "/api/clinic/role_versions" &&
            response.status() === 403,
        );
        await error.getByRole("button", { name: "Retry", exact: true }).click();
        await retryResponse;
        expect(requests).toHaveLength(2);
      } else {
        await table.waitFor();
        expect(await table.innerText()).toContain("synthetic-intake-reviewer");
        expect(await table.innerText()).toContain("patients.read");
        expect(await table.innerText()).toContain("intake.write");
        expect(await table.innerText()).toContain("appointments.read");
        expect(
          await table
            .getByRole("rowheader", {
              name: "synthetic-intake-reviewer",
              exact: true,
            })
            .count(),
        ).toBe(1);
        expect(
          await page.getByText(/not a person's active grants/).count(),
        ).toBe(1);
        expect(requests).toHaveLength(1);
      }
      expect(csrfReads).toBe(scenario.allowed ? 1 : 0);
      for (const request of requests) {
        expect(request).toEqual({
          method: "GET",
          path: "/api/clinic/role_versions",
          search: "?page=1&per_page=25",
        });
      }
    } finally {
      await page.close();
    }
  },
  15000,
);
