import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;

beforeAll(async () => {
  const virtualId = "\0location-hop-navigation.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "location-hop-fixture",
        resolveId: (id) => (id === virtualId ? virtualId : undefined),
        load(id) {
          if (id !== virtualId) return;
          return `import React from "react";
        import {createRoot} from "react-dom/client";
        import {Workspace,useClinic} from "/src/features/clinic/Workspace";
        import {Patients} from "/src/features/clinic/Patients";
        function Contents() {
          const context=useClinic();
          return React.createElement(React.Fragment,null,React.createElement("div",{"data-testid":"site-context"},String(context.current_site.id)),React.createElement(Patients));
        }
        createRoot(document.getElementById("root")).render(React.createElement(Workspace,{user:{id:71,email_address:"synthetic@example.invalid"},path:"/clinic/patients"},React.createElement(Contents)));`;
        },
        configureServer(s) {
          s.middlewares.use("/clinic/patients", async (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await s.transformIndexHtml(
                "/clinic/patients",
                '<div id="root"></div><script type="module" src="/@id/__x00__location-hop-navigation.tsx"></script>',
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

async function fixture(page: Page) {
  page.setDefaultTimeout(5000);
  const sites = [
    { id: 101, code: "FIRST", name: "Synthetic first", finalized: true },
    { id: 102, code: "SECOND", name: "Synthetic second", finalized: true },
  ];
  const context = {
    user_id: 71,
    schema_version: "clinic-context-v1",
    policy_version: "clinic-authorization-v1",
    credentials: [],
    membership_id: 91,
    practice: { id: 81, name: "Synthetic clinic", timezone: "UTC" },
    sites,
    current_site: sites[0],
    capabilities: {
      patients: true,
      notes_read: true,
      inventory: true,
      workforce_self: true,
      facilities_read: true,
    },
    features: {
      configured: true,
      finalized: true,
      site_specialty_configured: true,
    },
  };
  const reads: string[] = [];
  const writes: unknown[] = [];
  const control = { interruptRead: false, interruptSwitch: false };
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/clinic/patients" && request.method() === "GET") {
      reads.push(url.search);
      if (control.interruptRead) {
        control.interruptRead = false;
        return route.abort("failed");
      }
    }
    if (
      url.pathname === "/api/clinic/context" &&
      request.method() === "PATCH"
    ) {
      writes.push(request.postDataJSON());
      if (control.interruptSwitch) {
        control.interruptSwitch = false;
        return route.fulfill({
          status: 403,
          json: { error: "Synthetic selection denied" },
        });
      }
      context.current_site = sites.find(
        (site) => site.id === request.postDataJSON().site_id,
      )!;
    }
    await route.fulfill({
      json:
        url.pathname === "/api/csrf"
          ? { csrf_token: "synthetic-token" }
          : url.pathname === "/api/clinic/context"
            ? context
            : { patients: [] },
    });
  });
  await page.goto(`${baseUrl}/clinic/patients?page=3&site_id=101`);
  await page
    .getByRole("heading", { name: "Patient directory", exact: true, level: 1 })
    .waitFor();
  return { reads, writes, control, context };
}

async function choose(page: Page, label: string, name: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name, exact: true }).click();
}

it("#127 rewrites directory filters repeatedly and recovers an interrupted load without stale query scope", async () => {
  const page = await browser.newPage();
  try {
    const { reads, writes, control } = await fixture(page);
    for (const [name, id] of [
      ["All clinic patients", null],
      ["Synthetic second", 102],
      ["Synthetic first", 101],
      ["All clinic patients", null],
    ] as const) {
      await choose(page, "Primary location", name);
      await page
        .getByRole("heading", {
          name: "Patient directory",
          exact: true,
          level: 1,
        })
        .waitFor();
      const query = new URL(page.url()).searchParams;
      expect(query.get("site_id")).toBe(id === null ? null : String(id));
      expect(query.get("page")).toBeNull();
      expect(new URLSearchParams(reads.at(-1)).get("site_id")).toBe(
        id === null ? null : String(id),
      );
      expect(await page.getByTestId("site-context").textContent()).toBe("101");
    }
    control.interruptRead = true;
    await choose(page, "Primary location", "Synthetic second");
    await page.getByRole("alert").waitFor();
    expect(new URL(page.url()).searchParams.get("site_id")).toBe("102");
    await page.reload();
    await page
      .getByRole("heading", {
        name: "Patient directory",
        exact: true,
        level: 1,
      })
      .waitFor();
    expect(new URLSearchParams(reads.at(-1)).get("site_id")).toBe("102");
    expect(writes).toEqual([]);
  } finally {
    await page.close();
  }
}, 15000);

it("#128 retains region headings and authorized context through repeated switches and a denied switch", async () => {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  try {
    const { writes, control, context } = await fixture(page);
    const headings = async () =>
      page
        .getByRole("navigation", { name: "Clinic navigation", exact: true })
        .getByRole("heading", { level: 2 })
        .allTextContents();
    const expected = ["Care", "Operations", "Inventory", "People", "Account"];
    expect(await headings()).toEqual(expected);
    for (const [name, id] of [
      ["Synthetic second", 102],
      ["Synthetic first", 101],
      ["Synthetic second", 102],
    ] as const) {
      await choose(page, "Location", name);
      await page
        .getByTestId("site-context")
        .filter({ hasText: String(id) })
        .waitFor();
      expect(await headings()).toEqual(expected);
      expect(new URL(page.url()).searchParams.get("site_id")).toBe("101");
    }
    control.interruptSwitch = true;
    await choose(page, "Location", "Synthetic first");
    await page
      .getByText("Synthetic selection denied", { exact: true })
      .waitFor();
    expect(context.current_site.id).toBe(102);
    expect(await page.getByTestId("site-context").textContent()).toBe("102");
    expect(await headings()).toEqual(expected);
    expect(writes).toEqual([
      { site_id: 102 },
      { site_id: 101 },
      { site_id: 102 },
      { site_id: 101 },
    ]);
  } finally {
    await page.close();
  }
}, 15000);
