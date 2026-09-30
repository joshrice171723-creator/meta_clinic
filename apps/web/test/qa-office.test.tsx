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
const officeFixture = {
  ...fixture,
  contract_version: 1,
  actor_binding: "not_configured",
  actors: ["josh", "muse", "dot"].map((id) => ({
    id,
    name: id === "josh" ? "Josh" : id === "muse" ? "Muse" : "dot",
    connection: "not_connected",
    control: "uncontrolled",
    position: null,
  })),
  receipts: null,
  cadence: null,
};
const officeQaFixture = {
  build,
  pin: { revision },
  diff_url: null,
  ledger: {
    source: null,
    imported_at: null,
    counts: null,
    defects: [],
    pending_requests: [],
  },
  coverage: {
    source: null,
    imported_at: null,
    workflows: [],
    pointer: null,
    expected_total: 116,
  },
  batches: [],
  active_batch: null,
  capabilities: {
    file_defect: false,
    request_retest: false,
    poll_batch: false,
    import_ledger: false,
  },
};
let server: ViteDevServer;
let browser: Browser;
let base: string;
beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root,
    resolve: { dedupe: ["react", "react-dom"] },
    optimizeDeps: {
      include: [
        "react",
        "react-dom/client",
        "@mui/material",
        ...[
          "LaptopMacRounded",
          "AssignmentRounded",
          "CollectionsRounded",
          "ForumRounded",
          "LocalFloristRounded",
          "ExpandMoreRounded",
        ].map((icon) => `@mui/icons-material/${icon}`),
      ],
    },
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "isolated-qa-office",
        resolveId(source) {
          if (source === "/qa-office-entry.js") return "\0qa-office-entry.js";
        },
        load(id) {
          if (id === "\0qa-office-entry.js")
            return `import React from 'react'; import {createRoot} from 'react-dom/client'; import {QaWorkspace} from '/src/features/qa/QaWorkspace.tsx'; import {QaOffice} from '/src/features/qa/QaOffice.tsx'; import {QaAgentRoom} from '/src/features/qa/QaAgentRoom.tsx'; window.qaRoot=createRoot(document.getElementById('root')); window.renderBoundOfficeRoom=()=>window.qaRoot.render(React.createElement(QaAgentRoom,{boundOffice:true})); window.renderOffice=(museCheckIn)=>window.qaRoot.render(React.createElement(QaOffice,{tasks:[],evidence:[],events:[],onNavigate:()=>{},museCheckIn})); window.qaRoot.render(React.createElement(QaWorkspace));`;
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
async function open(
  mode: "ready" | "loading" | "error" | "empty" = "ready",
  clockTime?: number,
) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  page.setDefaultTimeout(8_000);
  if (clockTime !== undefined) {
    await page.clock.install({ time: clockTime });
    await page.clock.pauseAt(clockTime);
  }
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
    if (url.pathname === "/api/qa/office/work")
      return route.fulfill({
        json: { tasks: [], can_post: false, controlled_actor: null },
      });
    if (url.pathname === "/api/qa/office/qa")
      return route.fulfill({ json: officeQaFixture });
    if (url.pathname === "/api/qa/office") {
      if (mode === "loading") return;
      if (mode === "error")
        return route.fulfill({
          status: 503,
          json: { error: "Synthetic source unavailable" },
        });
      return route.fulfill({
        json:
          mode === "empty"
            ? { ...officeFixture, tasks: [], evidence: [], events: [] }
            : officeFixture,
      });
    }
    if (url.pathname === "/api/qa")
      return route.fulfill({
        json: {
          ...fixture,
          tasks: [{ ...fixture.tasks[0], title: "Separate workspace record" }],
          evidence: [],
          events: [],
        },
      });
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
    for (const leader of ["Josh", "dot", "Muse", "Codex"])
      await page
        .getByRole("button", { name: new RegExp(`${leader}.*desk`, "i") })
        .first()
        .waitFor();
    expect(
      await page
        .getByRole("group", { name: "Office floor" })
        .getByRole("button", { name: /desk$/ })
        .count(),
    ).toBe(4);
    expect(
      await page
        .getByText(/Receipt timing shows the last authenticated contact/i)
        .count(),
    ).toBeGreaterThan(0);
    const floor = page.getByRole("group", { name: "Office floor" });
    for (const actor of ["Josh", "Muse", "dot", "Codex"]) {
      const avatar = floor.getByRole("group", {
        name: `${actor} avatar: Not connected, Uncontrolled`,
        exact: true,
      });
      expect(await avatar.locator("strong").textContent()).toBe(actor);
    }
    expect(await floor.locator(".qa-office-avatar").count()).toBe(4);
    expect(await floor.locator(".qa-office-player").textContent()).toBe(
      "Preview",
    );
    await page
      .getByRole("progressbar", {
        name: "Muse expected check-in: Not connected",
      })
      .waitFor();
    expect(await page.getByRole("combobox").count()).toBe(0);
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
              : /No shared work here yet/i,
        )
        .first()
        .waitFor();
      expect(writes).toEqual([]);
    } finally {
      await page.close();
    }
  }
}, 60_000);

it("uses the shared Office snapshot without falling back to workspace records", async () => {
  const { page, writes } = await open();
  try {
    await page
      .getByRole("navigation", { name: "Office destinations" })
      .getByRole("button", { name: "Task board", exact: true })
      .click();
    await page.getByRole("button", { name: /QA task archive/ }).click();
    await page.getByText(/#1.*Synthetic queued task/).waitFor();
    expect(await page.getByText("Separate workspace record").count()).toBe(0);
    await page.route("**/api/qa/office", (route) =>
      route.fulfill({ status: 503, json: { error: "Office offline" } }),
    );
    await page.getByRole("button", { name: "Refresh sources" }).click();
    await page
      .getByText(/Office records could not refresh: Office offline/)
      .waitFor();
    expect(await page.getByText(/#1.*Synthetic queued task/).count()).toBe(0);
    expect(await page.getByText("Separate workspace record").count()).toBe(0);
    expect(writes).toEqual([]);
  } finally {
    await page.close();
  }
}, 60_000);

it("navigates directly to the existing room without issuing writes", async () => {
  const { page, writes } = await open();
  try {
    await page
      .getByRole("button", { name: /meeting room/i })
      .first()
      .click();
    await page.getByRole("button", { name: "Full message history" }).click();
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

it("moves focus out of Office to the destination heading for room and inbox", async () => {
  for (const destination of ["room", "inbox"]) {
    const { page, writes } = await open();
    try {
      if (destination === "room") {
        await page
          .getByRole("button", { name: "Full message history", exact: true })
          .focus();
        await page.keyboard.press("Enter");
      } else {
        await page
          .getByRole("navigation", { name: "Office destinations" })
          .getByRole("button", { name: "Task board", exact: true })
          .click();
        await page.getByRole("button", { name: /QA task archive/ }).click();
        await page
          .getByRole("button", { name: "Open full task inbox" })
          .focus();
        await page.keyboard.press("Enter");
      }
      await page.waitForFunction(
        () => document.activeElement?.tagName === "H1",
      );
      const heading = page.getByRole("heading", { level: 1 });
      expect(await heading.getAttribute("aria-live")).toBe("polite");
      expect(await heading.getAttribute("aria-atomic")).toBe("true");
      expect(
        await heading.evaluate((node) => node === document.activeElement),
      ).toBe(true);
      expect(
        await page
          .getByRole("navigation", { name: "QA workspace" })
          .locator('[aria-current="page"]')
          .count(),
      ).toBe(1);
      expect(
        await page.getByRole("group", { name: "Office floor" }).count(),
      ).toBe(0);
      expect(writes).toEqual([]);
    } finally {
      await page.close();
    }
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
    expect(await position.textContent()).toContain("column 6, row 4");
    for (let i = 0; i < 15; i++) await page.keyboard.press("ArrowLeft");
    for (let i = 0; i < 15; i++) await page.keyboard.press("s");
    expect(await position.textContent()).toContain("column 1, row 7");
    await page.keyboard.press("Enter");
    await page
      .getByRole("heading", { name: "Task board", exact: true })
      .waitFor();
    await page.getByRole("button", { name: /QA task archive/ }).click();
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

it("advances Muse timing on the local clock and refills only for a new authenticated receipt", async () => {
  const now = Date.parse("2026-09-30T12:00:00Z");
  const { page, writes } = await open("ready", now);
  try {
    const receipt = {
      id: "synthetic-receipt-1",
      authenticatedActorId: "synthetic-muse",
      receivedAtMs: now,
    };
    const render = (input: unknown) =>
      page.evaluate(
        (projection) => (window as any).renderOffice(projection),
        input,
      );
    await render({
      musePrincipalId: "synthetic-muse",
      receipt,
      cadenceMs: 60_000,
    });
    const ring = page.getByRole("progressbar");
    await page.waitForFunction(
      () =>
        document
          .querySelector('[role="progressbar"]')
          ?.getAttribute("aria-valuenow") === "100",
    );
    await page.clock.runFor(30_000);
    expect(await ring.getAttribute("aria-valuenow")).toBe("50");
    await render({
      musePrincipalId: "synthetic-muse",
      receipt: { ...receipt, receivedAtMs: now + 30_000 },
      cadenceMs: 60_000,
    });
    expect(await ring.getAttribute("aria-valuenow")).toBe("50");
    await page.clock.runFor(30_000);
    expect(await ring.getAttribute("aria-label")).toBe(
      "Muse expected check-in: Due now",
    );
    await page.clock.runFor(1000);
    expect(await ring.getAttribute("aria-label")).toBe(
      "Muse expected check-in: Overdue",
    );
    await render({
      musePrincipalId: "synthetic-muse",
      receipt: {
        ...receipt,
        id: "synthetic-receipt-2",
        receivedAtMs: now + 61_000,
      },
      cadenceMs: 60_000,
    });
    await page.waitForFunction(
      () =>
        document
          .querySelector('[role="progressbar"]')
          ?.getAttribute("aria-valuenow") === "100",
    );
    await render({
      musePrincipalId: "synthetic-muse",
      receipt: {
        ...receipt,
        id: "synthetic-receipt-2",
        receivedAtMs: now + 61_000,
      },
    });
    await page
      .getByRole("progressbar", { name: "Muse expected check-in: No schedule" })
      .waitFor();
    await render({ musePrincipalId: "synthetic-muse" });
    await page
      .getByRole("progressbar", {
        name: "Muse expected check-in: Not connected",
      })
      .waitFor();
    expect(writes).toEqual([]);
  } finally {
    await page.close();
  }
}, 60_000);

it("queues shared work with the task envelope, retains the retry key, and renders only allowed result confirmation", async () => {
  const { page } = await open();
  try {
    let created: Record<string, any> | undefined;
    const commands: Record<string, any>[] = [];
    const work = {
      tasks: [] as Record<string, any>[],
      can_post: true,
      controlled_actor: "josh",
    };
    await page.route("**/api/qa/office/work", (route) =>
      route.fulfill({ json: work }),
    );
    await page.route("**/api/qa/tasks", async (route) => {
      const command = route.request().postDataJSON();
      commands.push(command);
      if (commands.length === 1)
        return route.fulfill({
          status: 503,
          json: { error: "Synthetic uncertain response" },
        });
      const receipt: Record<string, any> = {
        ...command.task,
        id: 41,
        status: "completed",
        office_status: "completed",
        created_at: observed,
        allowed_transitions: ["result_confirmed"],
        result: { summary: "Synthetic result ready for requester review" },
      };
      created = receipt;
      work.tasks = [receipt];
      return route.fulfill({ status: 201, json: receipt });
    });
    const details = page.getByRole("region", { name: "Office details" });
    await details.getByRole("button", { name: "Refresh", exact: true }).click();
    await details.getByRole("button", { name: "New shared work" }).click();
    await details
      .getByRole("textbox", { name: "What needs doing?" })
      .fill("Synthetic Office handoff");
    await details
      .getByRole("textbox", { name: "Instructions and expected result" })
      .fill("Return a bounded synthetic summary.");
    await details
      .getByRole("button", { name: "Queue work", exact: true })
      .click();
    await details.getByText(/Synthetic uncertain response/).waitFor();
    await details
      .getByRole("button", { name: "Queue work", exact: true })
      .click();
    await details
      .getByRole("button", { name: /#41.*Synthetic Office handoff/ })
      .click();
    expect(commands).toHaveLength(2);
    expect(commands[0]).toEqual(commands[1]);
    expect(commands[0].task).toMatchObject({
      kind: "coordination",
      title: "Synthetic Office handoff",
      recipient: "muse",
      revision,
      payload: { description: "Return a bounded synthetic summary." },
    });
    expect(commands[0].task.request_key).toMatch(/^[A-Za-z0-9_-]{8,100}$/);
    expect(
      await details.getByRole("button", { name: "Acknowledge pickup" }).count(),
    ).toBe(0);
    expect(
      await details.getByRole("button", { name: "Submit result" }).count(),
    ).toBe(0);
    await details
      .getByText("Synthetic result ready for requester review")
      .waitFor();
    let confirmation: Record<string, unknown> | undefined;
    await page.route("**/api/qa/office/work/41/transition", async (route) => {
      confirmation = route.request().postDataJSON();
      work.tasks = [
        {
          ...created,
          office_status: "result_confirmed",
          allowed_transitions: [],
        },
      ];
      return route.fulfill({ json: work.tasks[0] });
    });
    await details
      .getByRole("button", { name: "Confirm result received" })
      .click();
    await details.getByText("result confirmed", { exact: true }).waitFor();
    expect(confirmation).toMatchObject({ status: "result_confirmed" });
    expect(
      await details
        .getByRole("button", { name: "Confirm result received" })
        .count(),
    ).toBe(0);
  } finally {
    await page.close();
  }
}, 60_000);

it("shows only current-revision workflow passes and preserves unavailable historical defect counts", async () => {
  const { page, writes } = await open();
  try {
    await page.route("**/api/qa/office/qa", (route) =>
      route.fulfill({
        json: {
          ...officeQaFixture,
          ledger: {
            ...officeQaFixture.ledger,
            source: "Historical import",
            defects: [
              {
                id: "historical-id",
                title: "Historical defect",
                status: "open",
                notes: "Reported old notes",
                evidence_refs: [],
              },
            ],
          },
          coverage: {
            ...officeQaFixture.coverage,
            source: "Historical import",
            workflows: [
              {
                id: "WF-001",
                result: "passed",
                revision,
                last_attempted_at: observed,
              },
              {
                id: "WF-002",
                result: "passed",
                revision: "b".repeat(40),
                last_attempted_at: observed,
              },
              {
                id: "WF-003",
                status: "in_progress",
                revision,
                last_attempted_at: observed,
              },
            ],
          },
        },
      }),
    );
    await page.getByRole("button", { name: "Refresh QA desk" }).click();
    await page
      .getByText("1/116 passed on this revision", { exact: true })
      .waitFor();
    expect(
      await page
        .getByRole("button", { name: "WF-002: passed, stale revision" })
        .count(),
    ).toBe(1);
    expect(
      await page.getByRole("button", { name: "WF-003: in progress" }).count(),
    ).toBe(1);
    expect(
      await page.getByText("open: Unavailable", { exact: true }).count(),
    ).toBe(1);
    await page
      .getByRole("button", { name: "Historical defect", exact: true })
      .click();
    await page.getByText("Reported old notes", { exact: true }).waitFor();
    expect(
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Request retest" })
        .isDisabled(),
    ).toBe(true);
    expect(writes).toEqual([]);
  } finally {
    await page.close();
  }
}, 60_000);

it("files a structured defect as a submitted request without incrementing ledger counts", async () => {
  const { page } = await open();
  try {
    const ledger = {
      ...officeQaFixture,
      capabilities: { ...officeQaFixture.capabilities, file_defect: true },
    };
    await page.route("**/api/qa/office/qa", (route) =>
      route.fulfill({ json: ledger }),
    );
    let report: Record<string, any> | undefined;
    await page.route("**/api/qa/office/qa/defects", (route) => {
      report = route.request().postDataJSON();
      return route.fulfill({
        json: {
          task: { id: 88 },
          receipt_id: "synthetic-defect-receipt",
          delivery: "submitted",
          ledger_recorded: false,
        },
      });
    });
    await page.getByRole("button", { name: "Refresh QA desk" }).click();
    await page.getByRole("button", { name: "File a defect" }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("textbox", { name: "Defect title" })
      .fill("Synthetic structured issue");
    await dialog
      .getByRole("textbox", { name: "Reproduction steps" })
      .fill("Open the synthetic screen.");
    await dialog
      .getByRole("textbox", { name: "Expected behavior" })
      .fill("Show the expected synthetic label.");
    await dialog
      .getByRole("textbox", { name: "Actual behavior" })
      .fill("Observed a different synthetic label.");
    await dialog.getByRole("button", { name: "Submit defect report" }).click();
    await page
      .getByText(/Defect report submitted to Muse.*Request #88/)
      .waitFor();
    expect(report?.report).toMatchObject({
      title: "Synthetic structured issue",
      severity: "medium",
      workflow: null,
      repro_steps: "Open the synthetic screen.",
      expected: "Show the expected synthetic label.",
      actual: "Observed a different synthetic label.",
    });
    expect(report?.report.request_key).toMatch(/^[A-Za-z0-9_-]{8,100}$/);
    expect(
      await page.getByText("open: Unavailable", { exact: true }).count(),
    ).toBe(1);
  } finally {
    await page.close();
  }
}, 60_000);

it("posts owner Office messages without self-reported identity and puts the full build above the floor", async () => {
  const { page } = await open();
  try {
    await page.route("**/api/qa/office/work", (route) =>
      route.fulfill({
        json: { tasks: [], can_post: true, controlled_actor: "josh" },
      }),
    );
    await page.route("**/api/qa/room", (route) =>
      route.fulfill({
        json: {
          messages: [],
          next_cursor: 0,
          has_more: false,
          can_post: true,
          notice: "Owner fixture",
        },
      }),
    );
    let posted: Record<string, any> | undefined;
    await page.route("**/api/qa/room/messages", (route) => {
      posted = route.request().postDataJSON();
      return route.fulfill({ json: { id: 99 } });
    });
    const details = page.getByRole("region", { name: "Office details" });
    await details.getByRole("button", { name: "Refresh", exact: true }).click();
    await details
      .getByRole("textbox", { name: "Message to the Office" })
      .fill("Owner coordination message");
    await details
      .getByRole("button", { name: "Send to Office", exact: true })
      .click();
    await details.getByText(/Message persisted in the shared Office/).waitFor();
    expect(posted?.message).toMatchObject({
      recipient: "Office",
      body: "Owner coordination message",
    });
    expect(posted?.message).not.toHaveProperty("agent");
    expect(posted?.message).not.toHaveProperty("authenticated_actor");
    expect(posted?.message.message_key).toMatch(/^[A-Za-z0-9_-]{8,100}$/);
    const banner = await page
      .getByText("Current build verified", { exact: true })
      .boundingBox();
    const header = await page
      .getByRole("heading", { level: 2, name: "Office", exact: true })
      .boundingBox();
    expect(banner).toBeTruthy();
    expect(header).toBeTruthy();
    expect(banner!.y).toBeLessThan(header!.y);
  } finally {
    await page.close();
  }
}, 60_000);

it("locks the original bound Office message after uncertain delivery and retries its identical key without an identity field", async () => {
  const { page } = await open();
  try {
    await page.route(/\/api\/qa\/room(?:\?after_id=\d+)?$/, (route) =>
      route.fulfill({
        json: {
          messages: [],
          next_cursor: 0,
          has_more: false,
          can_post: true,
          notice: "Bound Office fixture",
        },
      }),
    );
    const commands: Record<string, any>[] = [];
    await page.route("**/api/qa/room/messages", (route) => {
      commands.push(route.request().postDataJSON());
      return commands.length === 1
        ? route.fulfill({ status: 503, json: { error: "Delivery uncertain" } })
        : route.fulfill({ json: { id: 23, created_at: observed } });
    });
    await page.evaluate(() => (window as any).renderBoundOfficeRoom());
    const body = page.getByRole("textbox", { name: "Message", exact: true });
    await body.fill("Original Office message");
    expect(
      await page.getByRole("textbox", { name: /Display name/ }).count(),
    ).toBe(0);
    await page
      .getByRole("button", { name: "Post message", exact: true })
      .click();
    await page
      .getByText(/The original message and request key are retained/)
      .waitFor();
    expect(await body.isDisabled()).toBe(true);
    await page
      .getByRole("button", { name: "Post message", exact: true })
      .click();
    await page.getByText(/Message #23 persisted/).waitFor();
    expect(commands).toHaveLength(2);
    expect(commands[0]).toEqual(commands[1]);
    expect(commands[0].message).toMatchObject({
      body: "Original Office message",
      recipient: "Muse",
    });
    expect(commands[0].message).not.toHaveProperty("agent");
    expect(await body.isDisabled()).toBe(false);
    expect(await body.inputValue()).toBe("");
  } finally {
    await page.close();
  }
}, 60_000);
