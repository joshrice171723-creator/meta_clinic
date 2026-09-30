import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Real React/MUI/QA transport; all API reads are independently synthetic fixtures.
const root = fileURLToPath(new URL("..", import.meta.url));
const revision = "a".repeat(40);
const observed = "2026-09-30T13:41:36Z";
const build = {
  revision,
  version: "synthetic",
  dirty: false,
  observed_at: observed,
};
const fixture = {
  build,
  state: {
    last_run_at: "2026-09-29T05:38:00Z",
    last_qa_revision: "b".repeat(40),
  },
  github: { status: "connected", issues: [], observed_at: observed },
  tasks: [
    {
      id: 1,
      kind: "qa_run",
      title: "Synthetic queued task",
      recipient: "muse",
      status: "queued",
      revision,
      payload: {},
      result: {},
      claimed_at: null,
      claim_run_id: null,
      created_at: observed,
    },
  ],
  evidence: [
    {
      id: 2,
      issue_number: 1,
      revision,
      caption: "Synthetic stored evidence",
      phase: "observation",
      url: "/api/qa/evidence/2",
      created_at: observed,
      context: { observed_at: observed },
      tester: "synthetic@example.test",
    },
  ],
  events: [
    {
      id: 3,
      kind: "task_queued",
      summary: "Synthetic queued task",
      revision,
      created_at: observed,
      payload: { task_id: 1 },
    },
  ],
  guardrails: [],
  capabilities: { github_questions: false, record_observation: false },
};
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
        name: "isolated-qa-office",
        resolveId(source) {
          if (source === "/qa-office-entry.js") return "\0qa-office-entry.js";
        },
        load(id) {
          if (id === "\0qa-office-entry.js")
            return `import React from 'react'; import {createRoot} from 'react-dom/client'; import {QaWorkspace} from '/src/features/qa/QaWorkspace.tsx'; window.qaRoot=createRoot(document.getElementById('root')); window.qaRoot.render(React.createElement(QaWorkspace));`;
        },
        configureServer(vite) {
          vite.middlewares.use((request, response, next) => {
            if (request.url?.startsWith("/qa?")) {
              response.setHeader("Content-Type", "text/html");
              response.end(
                '<div id="root"></div><script type="module" src="/qa-office-entry.js"></script>',
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
      ["/usr/bin/chromium", chromium.executablePath()].find(existsSync),
    args: ["--no-sandbox"],
  });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});
async function open(mode: "ready" | "loading" | "error" | "empty" = "ready") {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  page.setDefaultTimeout(8_000);
  const writes: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(base).origin) return route.abort();
    if (url.pathname === "/build.json") return route.fulfill({ json: build });
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (route.request().method() !== "GET") {
      writes.push(url.pathname);
      return route.abort();
    }
    if (url.pathname === "/api/csrf")
      return route.fulfill({ json: { csrf_token: "synthetic-test-only" } });
    if (url.pathname === "/api/qa/room")
      return route.fulfill({
        json: {
          messages: [],
          next_cursor: 0,
          has_more: false,
          can_post: false,
          access: "public_read_owner_or_existing_qa_token_write",
          notice: "Synthetic read-only room",
        },
      });
    if (url.pathname === "/api/qa") {
      if (mode === "loading") return;
      if (mode === "error")
        return route.fulfill({
          status: 503,
          json: { error: "Synthetic source unavailable" },
        });
      return route.fulfill({
        json:
          mode === "empty"
            ? { ...fixture, tasks: [], evidence: [], events: [], state: {} }
            : fixture,
      });
    }
    return route.abort();
  });
  await page.goto(`${base}qa?view=office`);
  await page.getByRole("navigation", { name: "QA workspace" }).waitFor();
  return { page, writes };
}

it("bootstraps Office with one current navigation item and no inferred live presence", async () => {
  const { page, writes } = await open();
  try {
    await page.getByRole("heading", { level: 1, name: "Office" }).waitFor();
    const nav = page.getByRole("navigation", { name: "QA workspace" });
    expect(await nav.locator('[aria-current="page"]').count()).toBe(1);
    expect(
      await nav
        .getByRole("button", { name: /Office$/ })
        .getAttribute("aria-current"),
    ).toBe("page");
    for (const leader of ["Josh", "dot", "Muse"])
      await page
        .getByRole("button", { name: new RegExp(`${leader}.*desk`, "i") })
        .first()
        .waitFor();
    expect(
      await page
        .getByRole("group", { name: "Office floor" })
        .getByRole("button", { name: /desk$/ })
        .count(),
    ).toBe(3);
    expect(
      await page.getByText(/Running \/ live presence: Unknown/i).count(),
    ).toBeGreaterThan(0);
    expect(writes).toEqual([]);
  } finally {
    await page.close();
  }
}, 60_000);

it("keeps loading, failed reads and empty records explicit", async () => {
  for (const mode of ["loading", "error", "empty"] as const) {
    const { page, writes } = await open(mode);
    try {
      if (mode === "empty")
        await page
          .getByRole("navigation", { name: "Office destinations" })
          .getByRole("button", { name: "Task board" })
          .click();
      await page
        .getByText(
          mode === "loading"
            ? /loading office|connecting.*records/i
            : mode === "error"
              ? /Synthetic source unavailable/
              : /no.*tasks|no.*records/i,
        )
        .first()
        .waitFor();
      expect(writes).toEqual([]);
    } finally {
      await page.close();
    }
  }
}, 60_000);

it("navigates directly to the existing room without issuing writes", async () => {
  const { page, writes } = await open();
  try {
    await page
      .getByRole("button", { name: /meeting room/i })
      .first()
      .click();
    await page.getByRole("button", { name: "Enter agent room" }).click();
    await page
      .getByRole("heading", { name: /agent coordination room/i })
      .waitFor();
    await page
      .getByText("No messages yet. No connected agent is inferred.")
      .waitFor();
    expect(writes).toEqual([]);
  } finally {
    await page.close();
  }
}, 60_000);

it("contains the narrow reduced-motion Office and captures a synthetic screenshot", async () => {
  const { page } = await open();
  try {
    const output = fileURLToPath(
      new URL("../../../outputs/qa-office", import.meta.url),
    );
    mkdirSync(output, { recursive: true });
    await page.getByRole("group", { name: "Office floor" }).waitFor();
    await page.screenshot({ path: `${output}/desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("heading", { level: 1, name: "Office" }).waitFor();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const navigation = page
      .getByRole("navigation", { name: "QA workspace" })
      .getByRole("button");
    const boxes = await navigation.evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      }),
    );
    for (let index = 1; index < boxes.length; index++)
      expect(boxes[index].left).toBeGreaterThanOrEqual(
        boxes[index - 1].right - 1,
      );

    expect(
      await page.evaluate(
        () => matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
    ).toBe(true);

    await page.screenshot({
      path: `${output}/narrow-reduced-motion.png`,
      fullPage: true,
    });
  } finally {
    await page.close();
  }
}, 60_000);

it("bounds keyboard walking and preserves selection and position through refresh", async () => {
  const { page, writes } = await open();
  try {
    const floor = page.getByRole("group", { name: "Office floor" });
    const position = page.locator(".qa-office-position");
    await floor.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("w");
    expect(await position.textContent()).toContain("column 6, row 3");
    for (let i = 0; i < 15; i++) await page.keyboard.press("ArrowLeft");
    for (let i = 0; i < 15; i++) await page.keyboard.press("s");
    expect(await position.textContent()).toContain("column 1, row 7");
    await page.keyboard.press("Enter");
    await page
      .getByRole("heading", { name: "Task board", exact: true })
      .waitFor();
    await page
      .getByText("#1 · Synthetic queued task", { exact: true })
      .waitFor();
    const before = await position.textContent();
    await floor.focus();
    await page.keyboard.press("ArrowRight");
    expect(await position.textContent()).toBe(before);
    // A nested text control must retain typing even inside the floor event boundary.
    await floor.evaluate((node) => {
      const input = document.createElement("input");
      input.setAttribute("aria-label", "Synthetic floor text input");
      node.append(input);
    });
    const input = page.getByRole("textbox", {
      name: "Synthetic floor text input",
    });
    await input.fill("wasd");
    await input.press("ArrowLeft");
    await input.press("w");
    expect(await input.inputValue()).toBe("waswd");
    expect(await position.textContent()).toBe(before);
    await input.evaluate((node) => node.remove());
    await page.getByRole("button", { name: "Refresh sources" }).click();
    expect(await position.textContent()).toBe(before);
    expect(
      await page
        .getByRole("heading", { name: "Task board", exact: true })
        .count(),
    ).toBe(1);
    await page.getByRole("button", { name: "Close details" }).focus();
    await page.keyboard.press("Escape");
    expect(
      await floor.evaluate((node) => node === document.activeElement),
    ).toBe(true);
    expect(writes).toEqual([]);
  } finally {
    await page.close();
  }
}, 60_000);
