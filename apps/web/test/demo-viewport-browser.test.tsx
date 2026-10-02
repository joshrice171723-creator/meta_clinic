import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
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
        name: "synthetic-demo-viewport",
        enforce: "pre",
        resolveId(source) {
          if (source === "/viewport-entry.tsx") return "\0viewport-entry.tsx";
          if (source === "/workspace-entry.tsx") return "\0workspace-entry.tsx";
        },
        load(id) {
          if (id === "\0viewport-entry.tsx")
            return `
              import React from "react";
              import { createRoot } from "react-dom/client";
              import { DemoJourney } from "/src/features/demo/DemoJourney.tsx";
              createRoot(document.getElementById("root")).render(React.createElement(DemoJourney));
            `;
          if (id === "\0workspace-entry.tsx")
            return `
              import React from "react";
              import { createRoot } from "react-dom/client";
              import { ClinicFrame } from "/src/features/clinic/ClinicFrame.tsx";
              import "/src/features/clinic/clinicFrame.css";
              import "/src/features/clinic/appearance.css";
              const palette = {"--clinic-background":"#f6f2e8","--clinic-sidebar-ground":"#24362d","--clinic-sidebar-on":"#fffdf8","--clinic-sidebar-muted":"#ded8ca","--clinic-sidebar-selected":"#344b3e","--clinic-sidebar-selected-on":"#fffdf8","--clinic-accent":"#41634f","--clinic-control":"#758279","--clinic-surface":"#fffdf8","--clinic-text":"#1e2923","--clinic-border":"#d5d0c5","--clinic-soft":"#eef0e8"};
              const links = React.createElement("nav", null, ["Dashboard","Patients","Schedule","Billing","Inventory"].map(label => React.createElement("a", {href:"#", key:label}, label)));
              const content = React.createElement(React.Fragment, null,
                React.createElement("header", {className:"clinic-topbar"}, React.createElement("strong", null, "Synthetic sandbox toolbar")),
                React.createElement("main", {className:"clinic-content"}, React.createElement("h1", null, "Synthetic clinic workspace"), React.createElement("p", null, "Synthetic session remains mounted as the viewport changes."), React.createElement("div", {style:{height:"1800px"}}, "Scrollable synthetic workspace content")));
              createRoot(document.getElementById("root")).render(React.createElement("div", {className:"clinic-theme", style:palette}, React.createElement(ClinicFrame, {practiceName:"Synthetic viewport clinic", timezone:"America/Chicago", navigation:links}, content)));
            `;
        },
        configureServer(vite) {
          vite.middlewares.use((req, res, next) => {
            const path = new URL(req.url || "/", "http://synthetic.invalid")
              .pathname;
            if (path === "/demo" || path === "/qa-workspace") {
              res.setHeader("Content-Type", "text/html");
              const entry =
                path === "/demo"
                  ? "/@id/__x00__viewport-entry.tsx"
                  : "/@id/__x00__workspace-entry.tsx";
              res.end(
                '<style>html,body,#root{height:100%;margin:0}</style><div id="root"></div><script type="module" src="' +
                  entry +
                  '"></script>',
              );
              return;
            }
            if (path.startsWith("/api/")) {
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify(
                  path.endsWith("/csrf")
                    ? { csrf_token: "synthetic-viewport-csrf" }
                    : {
                        active: true,
                        run: {
                          id: "synthetic-viewport-run",
                          template_key: "primary_care",
                          mode: "clinic",
                          view: "clinic",
                          clinic: {
                            id: 42,
                            name: "Synthetic viewport clinic",
                            slug: "viewport",
                          },
                          patient: null,
                          lesson_key: "sandbox",
                          sandbox: true,
                          account: {
                            key: "admin",
                            label: "Admin",
                            user_id: 42,
                            portal: "clinic",
                          },
                          accounts: [
                            { key: "admin", label: "Admin", available: true },
                          ],
                          lessons: [],
                          steps: [
                            {
                              id: "sandbox",
                              title: "Sandbox",
                              description: "Synthetic clinic workspace",
                              status: "available",
                              href: "/qa-workspace",
                              requires: [],
                            },
                          ],
                        },
                      },
                ),
              );
              return;
            }
            next();
          });
        },
      },
    ],
  });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === "string")
    throw new Error("Missing synthetic viewport port.");
  base = "http://127.0.0.1:" + address.port;
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || "/usr/bin/chromium",
    headless: true,
  });
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

async function open(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto(base + "/demo");
  await page.getByTitle("Sandbox workspace").waitFor({ timeout: 20_000 });
  await page
    .frameLocator('iframe[name="clinic-demo-workspace"]')
    .getByRole("heading", { name: "Synthetic clinic workspace" })
    .waitFor();
}

it("fills the live sandbox viewport and keeps the clinic toggle in its header", async () => {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await open(page, 1440, 900);
    const iframe = page.locator('iframe[name="clinic-demo-workspace"]');
    const initialSrc = await iframe.getAttribute("src");

    async function measure(width: number, height: number) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => new Promise(requestAnimationFrame));
      const layout = await page.evaluate(() => {
        const rect = (selector: string) => {
          const value = document
            .querySelector<HTMLElement>(selector)!
            .getBoundingClientRect();
          return { top: value.top, bottom: value.bottom, height: value.height };
        };
        return {
          viewport: window.innerHeight,
          document: document.documentElement.scrollHeight,
          frame: rect(".demo-journey--sandbox"),
          bar: rect(".demo-journey__sandbox-toolbar"),
          workspace: rect(".demo-journey__sandbox-workspace"),
          iframe: rect('iframe[name="clinic-demo-workspace"]'),
          clinicDocument: document.querySelector<HTMLIFrameElement>(
            'iframe[name="clinic-demo-workspace"]',
          )!.contentDocument!.documentElement.scrollHeight,
          clinicViewport: document.querySelector<HTMLIFrameElement>(
            'iframe[name="clinic-demo-workspace"]',
          )!.contentWindow!.innerHeight,
        };
      });
      expect(layout.document).toBeLessThanOrEqual(layout.viewport + 1);
      expect(layout.frame.height).toBeLessThanOrEqual(layout.viewport + 1);
      expect(layout.workspace.top).toBeGreaterThanOrEqual(layout.bar.bottom);
      expect(layout.iframe.bottom).toBeCloseTo(layout.workspace.bottom, 0);
      expect(layout.workspace.height).toBeGreaterThan(80);
      expect(layout.clinicDocument).toBeGreaterThan(layout.clinicViewport);
      return { width, height, ...layout };
    }

    async function expectToggleInsideHeader(name: string) {
      const bounds = await page
        .frameLocator('iframe[name="clinic-demo-workspace"]')
        .getByRole("button", { name, exact: true })
        .evaluate((button) => {
          const header = button.closest(".clinic-sidebar-header")!;
          const sidebar = button.closest("#clinic-sidebar")!;
          const rect = (element: Element) => {
            const value = element.getBoundingClientRect();
            return { left: value.left, right: value.right, top: value.top };
          };
          return {
            button: rect(button),
            header: rect(header),
            sidebar: rect(sidebar),
          };
        });
      expect(bounds.button.left).toBeGreaterThanOrEqual(bounds.header.left - 1);
      expect(bounds.button.right).toBeLessThanOrEqual(bounds.header.right + 1);
      expect(bounds.button.left).toBeGreaterThanOrEqual(
        bounds.sidebar.left - 1,
      );
      expect(bounds.button.right).toBeLessThanOrEqual(bounds.sidebar.right + 1);
      return bounds;
    }

    const measurements = [await measure(1440, 900)];
    const clinic = page.frameLocator('iframe[name="clinic-demo-workspace"]');
    const collapse = clinic.getByRole("button", {
      name: "Collapse sidebar",
      exact: true,
    });
    await expectToggleInsideHeader("Collapse sidebar");
    await collapse.focus();
    await page.keyboard.press("Enter");
    await expectToggleInsideHeader("Expand sidebar");
    expect(await clinic.locator("#clinic-sidebar-content").isVisible()).toBe(
      true,
    );
    await clinic
      .getByRole("button", { name: "Expand sidebar", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expectToggleInsideHeader("Collapse sidebar");

    await page.getByRole("button", { name: "Give feedback" }).click();
    const feedback = page.getByRole("dialog");
    expect(await feedback.isVisible()).toBe(true);
    expect(
      await feedback.evaluate((dialog) =>
        dialog.closest(".demo-journey--sandbox"),
      ),
    ).toBeNull();
    await page.getByRole("button", { name: "Cancel" }).click();

    for (const [width, height] of [
      [1280, 800],
      [1152, 800],
      [1024, 768],
      [960, 720],
    ] as const) {
      measurements.push(await measure(width, height));
      await page.screenshot({
        path: "tmp/demo-viewport-" + width + "x" + height + ".png",
      });
      expect(await iframe.getAttribute("src")).toBe(initialSrc);
      expect(
        await clinic
          .getByRole("heading", { name: "Synthetic clinic workspace" })
          .isVisible(),
      ).toBe(true);
      await expectToggleInsideHeader("Collapse sidebar");
    }
    expect(errors).toEqual([]);
    console.log(JSON.stringify(measurements));
  } finally {
    await page.close();
  }
}, 120_000);
