import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, transformWithOxc, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
const root = fileURLToPath(new URL("../", import.meta.url));

const recall = {
  id: 81,
  patient: {
    id: 501,
    display_name: "Synthetic Recall Patient",
    reference: "SYN-501",
  },
  encounter: {
    id: 91,
    site_id: 7,
    started_at: "2026-09-01T12:00:00Z",
    href: "/clinic/encounters/91",
  },
  source_kind: "in_person",
  status: "due",
  clinical_state: "needed",
  plan: "Synthetic follow-up plan",
  source_due_at: "2026-09-01T12:00:00Z",
  effective_due_at: "2026-09-01T12:00:00Z",
  snoozed_until: null,
  outreach_count: 0,
  latest_event_at: null,
  assigned_to_membership_id: null,
  assignee_label: null,
  version: 2,
  updated_at: "2026-09-01T12:00:00Z",
};

function detail(overrides: Record<string, unknown> = {}) {
  return { recall: { ...recall, ...overrides }, history: [] };
}

async function openOutreach(page: Page) {
  await page.goto(`${baseUrl}/recall-outreach`);
  await page.evaluate(() => {
    window.__navigateAttempts = 0;
    window.__navigationApproved = false;
  });
  await page.getByRole("button", { name: "Log outreach attempt" }).click();
  await expect(
    page.getByRole("region", { name: "Log outreach attempt" }),
  ).toBeVisible();
  const channel = page.getByRole("combobox", { name: "Outreach channel" });
  await channel.click();
  await page.getByRole("option", { name: "Phone" }).click();
}

async function installCommonRoutes(page: Page) {
  // Every API request is synthetic; unmatched calls fail closed at the route.
  await page.route("**/api/**", (route) =>
    new URL(route.request().url()).pathname.startsWith("/api/")
      ? route.fulfill({
          status: 503,
          body: "Synthetic API request was not intercepted",
        })
      : route.continue(),
  );
  await page.route("**/api/csrf", (route) =>
    route.fulfill({ json: { csrf_token: "synthetic-csrf" } }),
  );
  await page.route("**/api/clinic/recalls/81", (route) =>
    route.fulfill({ json: detail() }),
  );
}

beforeAll(async () => {
  const virtualId = "\0qa-recall-outreach.tsx";
  server = await createServer({
    configFile: false,
    root,
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "recall-outreach-recovery-fixture",
        enforce: "pre",
        resolveId(id, importer) {
          if (id === "/qa-recall-outreach.tsx") return virtualId;
          if (importer?.endsWith("/RecallWorklist.tsx") && id === "./Workspace")
            return "\0recall-workspace";
          if (
            importer?.endsWith("/RecallWorklist.tsx") &&
            id === "../../shared/ui"
          )
            return "\0recall-resource";
        },
        async load(id) {
          if (id === "\0recall-workspace")
            return "export const useClinic=()=>({capabilities:{patients:true,encounters:true},current_site:null});";
          if (id === "\0recall-resource")
            return `const recall=${JSON.stringify(recall)};
              export const useResource=(url)=>({
                data:url.startsWith('/api/clinic/recalls?')
                  ? {summary:{due:1,upcoming:0,snoozed:0,excluded:0,completed:0},recalls:[recall],truncated:false,capabilities:{write:true},generated_at:'2026-09-02T00:00:00Z'}
                  : url==='/api/clinic/recalls/81'
                    ? {recall,history:[]}
                    : url==='/api/clinic/patients/501'
                      ? {patient:{id:501,communication_preference:{preferred_contact_method:'phone',general_communications_consent:true,appointment_reminders_consent:true}}}
                      : undefined,
                error:null,
                refresh:()=>{},
              });`;
          if (id !== virtualId) return;
          const entry = `import React from "react";
            import {createRoot} from "react-dom/client";
            import {RecallWorklist} from "/src/features/clinic/RecallWorklist";
            import {ClinicNavigationProvider,useClinicNavigation} from "/src/features/clinic/clinicNavigation";
            const blockers=new Set();
            const value={
              registerBlocker(blocker){if(blocker)blockers.add(blocker);window.__recallWarning=()=>{const messages=[...blockers].map(item=>item()).filter(Boolean);return messages.join("\\n\\n")||null};return ()=>{blockers.delete(blocker);window.__recallWarning=()=>{const messages=[...blockers].map(item=>item()).filter(Boolean);return messages.join("\\n\\n")||null}}},
              navigate(){window.__navigateAttempts++;const message=window.__recallWarning?.();if(message&&!window.confirm(message))return false;window.__navigationApproved=true;return true},
            };
            function NavigationProbe(){const {navigate}=useClinicNavigation();return React.createElement("button",{id:"attempt-leave",onClick:()=>navigate("/clinic/other")},"Attempt navigation")}
            function App(){return React.createElement(ClinicNavigationProvider,{value},React.createElement(React.Fragment,null,React.createElement(RecallWorklist),React.createElement(NavigationProbe)))}
            createRoot(document.getElementById("root")).render(React.createElement(App));`;
          return (await transformWithOxc(entry, "qa-recall-outreach.tsx")).code;
        },
        configureServer(s) {
          s.middlewares.use(async (request, response, next) => {
            const pathname = new URL(
              request.url || "/",
              "http://synthetic.invalid",
            ).pathname;
            if (pathname === "/recall-outreach") {
              response.setHeader("Content-Type", "text/html");
              response.end(
                await s.transformIndexHtml(
                  "/recall-outreach",
                  '<div id="root"></div><script type="module" src="/qa-recall-outreach.tsx"></script>',
                ),
              );
              return;
            }
            if (pathname.startsWith("/api/")) {
              response.statusCode = 503;
              response.end("Synthetic API request was not intercepted");
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
    throw new Error("Missing fixture port");
  baseUrl = `http://127.0.0.1:${address.port}`;
  const executablePath = [
    process.env.BROWSER_EXECUTABLE_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/chromium",
    chromium.executablePath(),
  ].find((candidate) => candidate && existsSync(candidate));
  if (!executablePath)
    throw new Error("No configured browser executable available");
  browser = await chromium.launch({ executablePath, headless: true });
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});
it.each(["wrong-recall", "malformed"])(
  "keeps an unconfirmed %s response frozen and retries the identical action",
  async (firstResult) => {
    const page = await browser.newPage();
    const bodies: unknown[] = [];
    await installCommonRoutes(page);
    await page.route("**/api/clinic/recalls/81/events", async (route) => {
      bodies.push(route.request().postDataJSON());
      if (bodies.length === 1) {
        await route.fulfill({
          json:
            firstResult === "wrong-recall"
              ? detail({ id: 82, version: 3 })
              : { recall: { id: 81 } },
        });
      } else {
        await route.fulfill({ json: detail({ version: 3 }) });
      }
    });

    await openOutreach(page);
    await page
      .getByRole("button", { name: "Record outreach attempt", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "outcome is not confirmed",
    );
    await expect(
      page.getByRole("button", { name: "Retry same action" }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Outreach channel" }),
    ).toBeDisabled();
    const cancel = page.getByRole("button", { name: "Cancel" });
    await expect(cancel).toBeDisabled();

    await page.evaluate(() => {
      window.confirm = () => false;
      window.__navigationApproved = false;
    });
    await page.getByRole("button", { name: "Attempt navigation" }).click();
    await expect
      .poll(() => page.evaluate(() => window.__navigateAttempts))
      .toBe(1);
    expect(await page.evaluate(() => window.__navigationApproved)).toBe(false);
    expect(await page.evaluate(() => window.__recallWarning?.())).toContain(
      "unresolved",
    );

    await page.getByRole("button", { name: "Retry same action" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "outcome is not confirmed" }),
    ).toHaveCount(0);
    await expect(
      page.getByText("The outreach attempt was recorded. No message was sent."),
    ).toBeVisible();
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toEqual(bodies[0]);
    const firstEvent = (bodies[0] as { recall_event: Record<string, unknown> })
      .recall_event;
    expect(firstEvent.action).toBe("record_outreach");
    expect(firstEvent.expected_version).toBe(2);
    expect(firstEvent.channel).toBe("phone");
    expect(firstEvent.request_key).toBeTruthy();
    await page.close();
  },
);

it("unlocks a deterministic rejection and leaves a dirty action only after confirmation", async () => {
  const page = await browser.newPage();
  let postCount = 0;
  await installCommonRoutes(page);
  await page.route("**/api/clinic/recalls/81/events", async (route) => {
    postCount++;
    await route.fulfill({
      status: 422,
      json: { error: "Synthetic validation rejection" },
    });
  });

  await openOutreach(page);
  await page.evaluate(() => {
    window.confirm = () => false;
  });
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByRole("region", { name: "Log outreach attempt" }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.confirm = () => true;
  });
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByRole("region", { name: "Log outreach attempt" }),
  ).toHaveCount(0);
  expect(postCount).toBe(0);

  await openOutreach(page);
  await page
    .getByRole("button", { name: "Record outreach attempt", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Synthetic validation rejection",
  );
  await expect(
    page.getByRole("combobox", { name: "Outreach channel" }),
  ).toBeEnabled();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeEnabled();
  expect(postCount).toBe(1);
  await page.close();
});
it("does not dismiss a pending write or allow navigation before its result arrives", async () => {
  const page = await browser.newPage();
  let postStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    postStarted = resolve;
  });
  let releasePost!: () => void;
  const held = new Promise<void>((resolve) => {
    releasePost = resolve;
  });
  await installCommonRoutes(page);
  await page.route("**/api/clinic/recalls/81/events", async (route) => {
    postStarted();
    await held;
    await route.fulfill({ json: detail({ version: 3 }) });
  });

  try {
    await openOutreach(page);
    await page
      .getByRole("button", { name: "Record outreach attempt", exact: true })
      .click();
    await started;
    await expect(page.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Saving." })).toBeDisabled();
    await page.evaluate(() => {
      window.confirm = () => false;
      window.__navigationApproved = false;
    });
    await page.getByRole("button", { name: "Attempt navigation" }).click();
    expect(await page.evaluate(() => window.__navigationApproved)).toBe(false);
    expect(await page.evaluate(() => window.__recallWarning?.())).toContain(
      "unresolved",
    );
    expect(
      await page.getByRole("region", { name: "Log outreach attempt" }).count(),
    ).toBe(1);
  } finally {
    releasePost();
    await page.close();
  }
});

declare global {
  interface Window {
    __navigateAttempts: number;
    __navigationApproved: boolean;
    __recallWarning?: () => string | null;
    confirm: (message?: string) => boolean;
  }
}
