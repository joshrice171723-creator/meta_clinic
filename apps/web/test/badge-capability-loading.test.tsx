import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
let server: ViteDevServer, browser: Browser, base: string;
beforeAll(async () => {
  const id = "\0badge-fixture.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "badge-fixture.tsx",
        enforce: "pre",
        resolveId(value, importer) {
          if (value === id) return id;
          if (
            value === "../clinic/Workspace" &&
            importer?.endsWith("BadgeAdminPage.tsx")
          )
            return "\0badge-context";
        },
        load(value) {
          if (value === "\0badge-context")
            return `export function useClinic(){return window.context;}`;
          if (value === id)
            return `import React from "react";import {createRoot} from "react-dom/client";import {BadgeAdminPage} from "/src/features/workforce/BadgeAdminPage";window.context={sites:[{id:101,name:"Synthetic A"},{id:102,name:"Synthetic B"}],current_site:{id:101},capabilities:JSON.parse(new URL(location.href).searchParams.get("caps"))};const root=createRoot(document.getElementById("root"));window.changeCapabilities=(caps)=>{window.context={...window.context,capabilities:caps};root.render(React.createElement(BadgeAdminPage));};root.render(React.createElement(BadgeAdminPage));`;
        },
        transform(code, id) {
          if (
            process.env.PATCH_BASELINE &&
            id.endsWith("/workforce/BadgeAdminPage.tsx")
          )
            return execFileSync(
              "git",
              [
                "show",
                "db9ab0b4ce3e061c95c79b38a9e0e9a87f069a4f:apps/web/src/features/workforce/BadgeAdminPage.tsx",
              ],
              { encoding: "utf8" },
            );
          return code;
        },
        configureServer(s) {
          s.middlewares.use("/fixture", async (_q, r) => {
            r.setHeader("Content-Type", "text/html");
            r.end(
              await s.transformIndexHtml(
                "/fixture",
                '<div id="root"></div><script type="module" src="/@id/__x00__badge-fixture.tsx"></script>',
              ),
            );
          });
        },
      },
    ],
  });
  await server.listen();
  const addr = server.httpServer!.address();
  if (!addr || typeof addr === "string") throw Error("No port");
  base = `http://127.0.0.1:${addr.port}`;
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || "/usr/bin/chromium",
    headless: true,
  });
}, 15000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});
async function fixture(
  caps: { workforce_badges: boolean; workforce_settings: boolean },
  fail = "",
  delayed = false,
) {
  const page = await browser.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log(msg.text());
  });
  page.on("pageerror", (error) =>
    console.log("Fixture page error:", error.message),
  );
  page.setDefaultTimeout(4000);
  const reads: string[] = [];
  let release: (() => void) | undefined;
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/csrf")
      return route.fulfill({ json: { csrf_token: "synthetic" } });
    const kind = url.pathname.split("/").at(-1)!;
    reads.push(kind);
    if (delayed && kind === "badges")
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    await route
      .fulfill({
        status: kind === fail ? 403 : 200,
        json:
          kind === fail
            ? { error: `Synthetic ${kind} denied` }
            : kind === "badges"
              ? {
                  employees: [],
                  badges: [
                    {
                      id: 1,
                      employee_name: "Synthetic Badge",
                      status: "issued",
                      issued_at: "2026-10-01",
                      pin_required: false,
                    },
                  ],
                }
              : {
                  kiosks: [
                    {
                      id: 2,
                      site_name: "Synthetic Kiosk",
                      status: "active",
                      expires_at: "2026-11-01",
                    },
                  ],
                },
      })
      .catch(() => {});
  });
  await page.goto(
    `${base}/fixture?caps=${encodeURIComponent(JSON.stringify(caps))}`,
  );
  await page
    .getByRole("heading", { name: "Badges and kiosks", exact: true })
    .waitFor();
  return { page, reads, release: () => release?.() };
}
it("Muse45 reports unconfigured refusals then issues a badge and enrollment with refreshed readback", async () => {
  const page = await browser.newPage();
  const badges: Record<string, unknown>[] = [];
  const kiosks: Record<string, unknown>[] = [];
  const mutations: { path: string; body: unknown }[] = [];
  let configured = false;
  try {
    page.setDefaultTimeout(5000);
    await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/api/csrf")
        return route.fulfill({ json: { csrf_token: "synthetic" } });
      if (request.method() === "POST") {
        mutations.push({ path, body: request.postDataJSON() });
        if (!configured)
          return route.fulfill({
            status: 422,
            json: {
              error:
                "Workforce settings have not been configured for this practice.",
              code: "workforce_settings_unconfigured",
            },
          });
        if (path.endsWith("/badges")) {
          const badge = {
            id: 701,
            employment_id: 501,
            status: "issued",
            issued_at: "2026-10-01T12:00:00Z",
            pin_required: false,
            employee_name: "Configured synthetic employee",
          };
          badges.push(badge);
          return route.fulfill({
            status: 201,
            json: {
              badge,
              printable: {
                token: "synthetic-nonfunctional-badge",
                barcode_svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
                reprintable: false,
              },
            },
          });
        }
        if (path.endsWith("/kiosks")) {
          const kiosk = {
            id: 702,
            site_id: 101,
            site_name: "Configured synthetic kiosk",
            status: "issued",
            expires_at: "2026-10-02T12:00:00Z",
          };
          kiosks.push(kiosk);
          return route.fulfill({
            status: 201,
            json: {
              kiosk,
              enrollment_token: "synthetic-nonfunctional-enrollment",
            },
          });
        }
      }
      if (path.endsWith("/badges"))
        return route.fulfill({
          json: {
            employees: [
              {
                id: 501,
                employee_name: "Configured synthetic employee",
                active_for_work: true,
              },
            ],
            badges,
          },
        });
      if (path.endsWith("/kiosks")) return route.fulfill({ json: { kiosks } });
      return route.fulfill({
        status: 404,
        json: { error: "Unexpected synthetic badge route" },
      });
    });
    await page.goto(
      `${base}/fixture?caps=${encodeURIComponent(JSON.stringify({ workforce_badges: true, workforce_settings: true }))}`,
    );
    await page.getByRole("combobox", { name: "Employee", exact: true }).click();
    await page
      .getByRole("option", {
        name: "Configured synthetic employee",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Issue or replace badge", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Workforce settings have not been configured" })
      .waitFor();
    expect(await page.getByRole("dialog").count()).toBe(0);
    await page
      .getByRole("button", { name: "Create enrollment code", exact: true })
      .click();
    await expect.poll(() => mutations.length).toBe(2);
    await page
      .getByRole("alert")
      .filter({ hasText: "Workforce settings have not been configured" })
      .waitFor();
    expect(
      await page
        .getByLabel("One-time enrollment code", { exact: true })
        .count(),
    ).toBe(0);
    configured = true;
    await page
      .getByRole("button", { name: "Issue or replace badge", exact: true })
      .click();
    const printable = page.getByRole("dialog", {
      name: "Print employee clock badge",
      exact: true,
    });
    await printable.waitFor();
    expect(
      await printable
        .getByRole("img", { name: "Employee clock badge barcode", exact: true })
        .count(),
    ).toBe(1);
    await printable.getByRole("button", { name: "Close", exact: true }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Badge issued. Print it now" })
      .waitFor();
    await page.getByText("issued", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Create enrollment code", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Kiosk enrollment created" })
      .waitFor();
    expect(
      await page
        .getByLabel("One-time enrollment code", { exact: true })
        .inputValue(),
    ).toBe("synthetic-nonfunctional-enrollment");
    await page
      .getByText("Configured synthetic kiosk", { exact: true })
      .waitFor();
    expect(mutations.map((row) => row.path)).toEqual([
      "/api/clinic/workforce/badges",
      "/api/clinic/workforce/kiosks",
      "/api/clinic/workforce/badges",
      "/api/clinic/workforce/kiosks",
    ]);
    expect(mutations[2].body).toEqual({
      employment_id: "501",
      site_id: "101",
      pin: null,
    });
    expect(mutations[3].body).toEqual({ site_id: "101" });
    await page.reload();
    await page
      .getByText("Configured synthetic kiosk", { exact: true })
      .waitFor();
    await page.getByText("issued", { exact: true }).waitFor();
    expect(await page.getByRole("dialog").count()).toBe(0);
    expect(
      await page
        .getByLabel("One-time enrollment code", { exact: true })
        .count(),
    ).toBe(0);
    expect(mutations).toHaveLength(4);
  } finally {
    await page.close();
  }
}, 20000);

it.each([
  [true, false],
  [false, true],
  [true, true],
  [false, false],
])("loads only permitted sections: badges %s, settings %s", async (b, k) => {
  const { page, reads } = await fixture({
    workforce_badges: b,
    workforce_settings: k,
  });
  try {
    if (b) await page.getByText("Synthetic Badge", { exact: true }).waitFor();
    if (k) await page.getByText("Synthetic Kiosk", { exact: true }).waitFor();
    expect(
      await page
        .getByRole("heading", { name: "Employee badges", exact: true })
        .count(),
    ).toBe(b ? 1 : 0);
    expect(
      await page
        .getByRole("heading", { name: "Clock kiosk enrollment", exact: true })
        .count(),
    ).toBe(k ? 1 : 0);
    expect(reads.sort()).toEqual([
      ...(b ? ["badges"] : []),
      ...(k ? ["kiosks"] : []),
    ]);
  } finally {
    await page.close();
  }
});
it.each(["badges", "kiosks"])(
  "keeps sibling data and displays legitimate %s denial",
  async (fail) => {
    const { page } = await fixture(
      { workforce_badges: true, workforce_settings: true },
      fail,
    );
    try {
      await page
        .getByText(`Synthetic ${fail} denied`, { exact: true })
        .waitFor();
      await page
        .getByText(fail === "badges" ? "Synthetic Kiosk" : "Synthetic Badge", {
          exact: true,
        })
        .waitFor();
    } finally {
      await page.close();
    }
  },
);
it.each(["", "badges"])(
  "ignores late %s response after capability removal",
  async (fail) => {
    const f = await fixture(
      { workforce_badges: true, workforce_settings: true },
      fail,
      true,
    );
    try {
      await f.page.getByText("Synthetic Kiosk", { exact: true }).waitFor();
      await f.page.evaluate(() => {
        (window as any).changeCapabilities({
          workforce_badges: false,
          workforce_settings: true,
        });
      });
      f.release();
      await f.page
        .getByRole("heading", { name: "Employee badges", exact: true })
        .waitFor({ state: "detached" });
      expect(
        await f.page.getByText("Synthetic Badge", { exact: true }).count(),
      ).toBe(0);
      expect(
        await f.page
          .getByText("Synthetic badges denied", { exact: true })
          .count(),
      ).toBe(0);
    } finally {
      f.release();
      await f.page.close();
    }
  },
);
