import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const repo = resolve(root, "../..");
const evidence = resolve(repo, "tmp/compact-shell-evidence");
const owned = new Set(
  [
    "ClinicFrame.tsx",
    "Workspace.tsx",
    "ClinicScopeSelector.tsx",
    "clinicFrame.css",
  ].map((name) =>
    resolve(root, "src/features/clinic", name).replaceAll("\\", "/"),
  ),
);
let browser: Browser;
const servers: ViteDevServer[] = [];
const urls: string[] = [];
const results: unknown[] = [];

beforeAll(async () => {
  mkdirSync(evidence, { recursive: true });
  for (const baseline of [true, false]) {
    const entry = "\0compact-shell-fixture.tsx";
    const server = await createServer({
      configFile: false,
      root,
      cacheDir: resolve(
        evidence,
        baseline ? "baseline-cache" : "candidate-cache",
      ),
      server: { host: "127.0.0.1", port: 0 },
      plugins: [
        {
          name: "compact-shell-fixture",
          enforce: "pre",
          resolveId(id, importer) {
            if (id === "/compact-shell-fixture.tsx") return entry;
            if (!baseline) return;
            const path = (
              id.startsWith("/src/")
                ? resolve(root, id.slice(1))
                : id.startsWith(".") && importer
                  ? resolve(dirname(importer.split("?")[0]), id)
                  : id
            ).replaceAll("\\", "/");
            if (owned.has(path) && !id.includes("?shell-baseline"))
              return path + "?shell-baseline";
          },
          load(id) {
            if (id.endsWith("?shell-baseline")) {
              const path = id
                .split("?")[0]
                .slice(repo.replaceAll("\\", "/").length + 1);
              return execFileSync("git", ["show", "5da1a9f5:" + path], {
                cwd: repo,
                encoding: "utf8",
              });
            }
            if (id !== entry) return;
            return `
            import React from "react";
            import { createRoot } from "react-dom/client";
            import { ClinicFrame } from "/src/features/clinic/ClinicFrame.tsx";
            import { ClinicNavigation } from "/src/features/clinic/Workspace.tsx";
            import { ClinicScopeSelector } from "/src/features/clinic/ClinicScopeSelector.tsx";
            import { ClinicAppearanceScope } from "/src/features/clinic/Appearance.tsx";
            import { DEFAULT_APPEARANCE } from "/src/features/clinic/appearancePreferences.ts";
            import { MembershipGrowth } from "/src/features/membershipGrowth/MembershipGrowth.tsx";
            const context = {
              practice: { id: 1, name: "Synthetic Northside Clinic", timezone: "America/Chicago" },
              practices: [
                { id: 1, name: "Synthetic Northside Clinic", organization: { id: 1, name: "Synthetic Clinic Organization" } },
                { id: 2, name: "Synthetic Lakeside Clinic", organization: { id: 1, name: "Synthetic Clinic Organization" } },
                { id: 3, name: "Synthetic Orchard Clinic", organization: { id: 2, name: "Synthetic Alternate Organization" } }
              ],
              current_site: { id: 1, name: "Main synthetic location", code: "MAIN" },
              sites: [{ id: 1, name: "Main synthetic location", code: "MAIN" }, { id: 2, name: "East synthetic location", code: "EAST" }]
            };
            const capabilities = {
              patients: true, appointments_read: true, encounters: true, clinical_records_read: true,
              telehealth_read: true, scribe_read: true, staff_messaging_read: true, inventory: true,
              workforce_self: true, billing_read: true, subscription_catalog_read: true,
              subscriptions_review: true, facilities_read: true, roles: true
            };
            const recordScope = (kind, id) => document.querySelector("#scope-change").textContent = kind + ":" + id;
            document.addEventListener("click", event => {
              if (event.target.closest("a")) event.preventDefault();
            });
            createRoot(document.querySelector("#root")).render(
              React.createElement(ClinicAppearanceScope, { preferences: DEFAULT_APPEARANCE, systemDark: false },
                React.createElement(ClinicFrame, {
                  practiceName: context.practice.name, timezone: context.practice.timezone,
                  locationName: context.current_site.name, locations: context.sites,
                  selectedLocationId: 1,
                  navigation: React.createElement(ClinicNavigation, { capabilities, path: "/clinic/growth" }),
                  scopeSelector: React.createElement(ClinicScopeSelector, { context,
                    onPracticeChange: id => recordScope("clinic", id),
                    onLocationChange: id => recordScope("location", id) })
                },
                  React.createElement("header", { className: "clinic-topbar" },
                    React.createElement("span", null, "Synthetic clinic workspace"),
                    React.createElement("span", null, "Main synthetic location")),
                  React.createElement("main", { className: "clinic-content" },
                    React.createElement(MembershipGrowth),
                    React.createElement("output", { id: "scope-change", "aria-label": "Synthetic scope selection" })))));
          `;
          },
          configureServer(server) {
            server.middlewares.use(
              "/compact-shell-fixture",
              async (_request, response) => {
                response.setHeader("Content-Type", "text/html");
                response.end(
                  await server.transformIndexHtml(
                    "/compact-shell-fixture",
                    '<link rel="stylesheet" href="/shared.css"><link rel="stylesheet" href="/clinic.css"><div id="root"></div><script type="module" src="/@id/__x00__compact-shell-fixture.tsx"></script>',
                  ),
                );
              },
            );
          },
        },
      ],
    });
    await server.listen();
    servers.push(server);
    const address = server.httpServer!.address();
    if (!address || typeof address === "string")
      throw new Error("Missing fixture port");
    urls.push("http://127.0.0.1:" + address.port);
  }
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || "/usr/bin/chromium",
    headless: true,
  });
}, 60000);
afterAll(async () => {
  writeFileSync(
    resolve(evidence, "layout-results.json"),
    JSON.stringify(results, null, 2),
  );
  await browser?.close();
  for (const server of servers) await server.close();
});

async function open(page: Page, candidate = true) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", async (response) => {
    if (response.status() >= 400)
      errors.push(
        response.status() +
          " " +
          new URL(response.url()).pathname +
          " " +
          (await response.text()).slice(0, 500),
      );
  });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("**/api/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (!pathname.startsWith("/api/")) return route.continue();
    expect(route.request().method()).toBe("GET");
    if (pathname === "/api/csrf")
      return route.fulfill({ json: { csrf_token: "synthetic" } });
    if (pathname === "/api/clinic/membership_prospects")
      return route.fulfill({
        json: {
          prospects: Array.from({ length: 6 }, (_, index) => ({
            id: index + 1,
            display_name: "SYNTHETIC Prospect " + (index + 1),
            email_address: null,
            status: "new",
            intent_type: "outreach",
            relationship_stage: "prospective_patient",
            enrollment_stage: "contact_requested",
            created_at: "2026-10-02T10:00:00Z",
            selected_terms: {
              package_name: "Synthetic monthly membership",
              price: "120.00",
              currency: "USD",
            },
            follow_up_state: "open",
            follow_up_attempt_count: 0,
            possible_duplicate: false,
            patient_id: null,
            portal_identity_id: null,
            lock_version: 0,
          })),
          capabilities: { review: false, configure: true },
          storefront: {
            slug: "synthetic-clinic",
            enabled: true,
            headline: "Synthetic clinic membership",
            intro: "Independent synthetic examples for shell layout checks.",
            accent: null,
            logo_path: null,
            public_path: "/memberships/synthetic-clinic",
            service_page_path: null,
          },
        },
      });
    return route.fulfill({
      status: 403,
      json: { error: "Fixture has no other API authority" },
    });
  });
  await page.goto(urls[candidate ? 1 : 0] + "/compact-shell-fixture");
  try {
    await page
      .getByRole("table", { name: "Membership pipeline" })
      .waitFor({ timeout: 10000 });
  } catch (error) {
    await page.screenshot({
      path: resolve(
        evidence,
        candidate ? "candidate-error.png" : "baseline-error.png",
      ),
    });
    results.push({
      candidate,
      errors,
      body: (await page.locator("body").innerText()).slice(0, 2000),
    });
    throw new Error(
      JSON.stringify({ candidate, errors, cause: String(error) }),
    );
  }
}

async function measure(page: Page, name: string) {
  const geometry = await page.evaluate(() => {
    const box = (selector: string) => {
      const element = document.querySelector(selector)!;
      const { x, y, width, height, right, bottom } =
        element.getBoundingClientRect();
      return { x, y, width, height, right, bottom };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      pageWidth: document.documentElement.scrollWidth,
      sidebar: box(".clinic-sidebar-frame"),
      main: box(".clinic-main"),
      content: box(".clinic-content"),
      scope: box(".practice-label"),
      navigation: box(".clinic-work-navigation"),
      links: [...document.querySelectorAll("nav a")].map((a) => ({
        href: a.getAttribute("href"),
        label: a.getAttribute("aria-label") || a.textContent,
        current: a.getAttribute("aria-current"),
        width: a.getBoundingClientRect().width,
        height: a.getBoundingClientRect().height,
      })),
    };
  });
  results.push({ name, ...geometry });
  await page.screenshot({ path: resolve(evidence, name + ".png") });
  return geometry;
}

describe("compact clinic shell browser behavior", () => {
  it("measures the actual baseline and candidate shells with populated Growth content", async () => {
    for (const width of [2560, 1440, 1280, 1024, 834, 768, 390]) {
      const height = width === 390 ? 844 : 900;
      const baseline = await browser.newPage({ viewport: { width, height } });
      const page = await browser.newPage({ viewport: { width, height } });
      try {
        await open(baseline, false);
        const before = await measure(baseline, "before-" + width);
        await open(page);
        const after = await measure(page, "after-" + width);
        expect(after.pageWidth).toBe(width);
        expect(after.main.right).toBe(width);
        expect(after.links.map((link) => link.href)).toEqual(
          before.links.map((link) => link.href),
        );
        expect(
          after.links.find((link) => link.href === "/clinic/growth")?.current,
        ).toBe("page");
        if (width > 900) {
          expect(after.sidebar.width).toBe(200);
          expect(after.content.width).toBe(width - 200);
          expect(after.scope.height).toBeLessThan(before.scope.height);
          expect(after.navigation.height).toBeLessThan(
            before.navigation.height,
          );
        } else {
          expect(after.main.x).toBe(0);
          expect(after.content.width).toBe(width);
          const toggle = page.getByRole("button", {
            name: "Open clinic menu",
            exact: true,
          });
          await toggle.focus();
          await page.keyboard.press("Enter");
          const dialog = page.getByRole("dialog", { name: "Clinic menu" });
          await dialog.waitFor();
          expect(
            await page.locator(".clinic-main").getAttribute("inert"),
          ).not.toBeNull();
          await measure(page, "drawer-" + width);
          await page
            .getByRole("button", { name: "Sign out", exact: true })
            .focus();
          await page.keyboard.press("Tab");
          expect(
            await page
              .getByRole("button", { name: "Close clinic menu" })
              .evaluate((el) => el === document.activeElement),
          ).toBe(true);
          await page.keyboard.press("Escape");
          expect(
            await toggle.evaluate((el) => el === document.activeElement),
          ).toBe(true);
          expect(
            await page.locator(".clinic-main").getAttribute("inert"),
          ).toBeNull();
        }
      } finally {
        await baseline.close();
        await page.close();
      }
    }
  }, 120000);

  it("keeps routes, tooltips, scope selection and reversible keyboard rail controls", async () => {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    try {
      await open(page);
      const collapse = page.getByRole("button", {
        name: "Collapse sidebar",
        exact: true,
      });
      await collapse.focus();
      await page.keyboard.press("Enter");
      expect(
        await page.locator(".clinic-shell").getAttribute("data-rail"),
      ).toBe("true");
      const rail = await measure(page, "rail-1440");
      expect(rail.sidebar.width).toBe(56);
      expect(rail.content.width).toBe(1384);
      const growth = page.getByRole("link", { name: "Growth", exact: true });
      await growth.focus();
      await page
        .getByRole("tooltip", { name: "Growth", exact: true })
        .waitFor();
      expect(await growth.getAttribute("aria-current")).toBe("page");
      expect(await growth.evaluate((el) => el.matches(":focus-visible"))).toBe(
        true,
      );
      await measure(page, "rail-keyboard-focus");
      await page.setViewportSize({ width: 834, height: 900 });
      await page.waitForFunction(
        () =>
          document.querySelector(".clinic-shell")?.getAttribute("data-rail") ===
          "false",
      );
      expect(
        await page.locator(".clinic-shell").getAttribute("data-rail"),
      ).toBe("false");
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForFunction(
        () =>
          document.querySelector(".clinic-shell")?.getAttribute("data-rail") ===
          "true",
      );
      const scope = page.getByRole("button", {
        name: /Expand clinic context:/,
      });
      await scope.focus();
      const scopeBox = await scope.boundingBox();
      expect(scopeBox!.y).toBeGreaterThanOrEqual(56);
      await measure(page, "rail-scope-focus");
      await page.keyboard.press("Enter");
      const organization = page.getByRole("combobox", { name: /Organization/ });
      expect(
        await organization.evaluate((el) => el === document.activeElement),
      ).toBe(true);
      await page.keyboard.press("Enter");
      await page
        .getByRole("option", {
          name: "Synthetic Alternate Organization",
          exact: true,
        })
        .click();
      expect(await page.locator("#scope-change").textContent()).toBe(
        "clinic:3",
      );
      const location = page.getByRole("combobox", { name: /Location/ });
      await location.focus();
      await page.keyboard.press("Enter");
      await page
        .getByRole("option", { name: "East synthetic location", exact: true })
        .click();
      expect(await page.locator("#scope-change").textContent()).toBe(
        "location:2",
      );
      await page
        .getByRole("button", { name: "Collapse sidebar", exact: true })
        .focus();
      await page.keyboard.press("Space");
      const expand = page.getByRole("button", {
        name: "Expand sidebar",
        exact: true,
      });
      await expand.focus();
      await page.keyboard.press("Space");
      expect(
        await page.locator(".clinic-shell").getAttribute("data-rail"),
      ).toBe("false");
      await page.setViewportSize({ width: 768, height: 900 });
      await page.getByRole("button", { name: "Open clinic menu" }).click();
      await page
        .getByRole("link", { name: "Growth", exact: true })
        .click({ noWaitAfter: true });
      await page.waitForFunction(
        () =>
          document
            .querySelector(".clinic-shell")
            ?.getAttribute("data-collapsed") === "true",
      );
    } finally {
      await page.close();
    }
  }, 30000);
});
