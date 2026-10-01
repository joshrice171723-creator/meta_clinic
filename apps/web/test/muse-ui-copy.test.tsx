import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const pageMeta = { page: 1, per_page: 20, total: 1, total_pages: 1 };
const fixture = {
  delivery_methods: { email: true, sms: false },
  demo_usage: [],
  demo_feedback: [],
  counts: { organizations: 1, clinics: 1, active_members: 1 },
  organizations: [
    {
      id: 1,
      name: "Synthetic organization",
      clinics: [
        {
          id: 1,
          name: "Synthetic clinic",
          timezone: "UTC",
          created_at: "2026-10-01T00:00:00Z",
          member_count: 1,
          owner_accounts: [],
          owner_invitations: [],
          state: "needs_owner",
        },
      ],
    },
  ],
  unassigned_clinics: [],
  organization_options: [{ id: 1, name: "Synthetic organization" }],
  organization_pagination: pageMeta,
  demo_usage_pagination: pageMeta,
  demo_feedback_pagination: pageMeta,
  unassigned_clinic_pagination: pageMeta,
};
const kinds = [
  "medication_requests",
  "service_requests",
  "diagnoses",
  "procedures",
  "care_plans",
  "care_goals",
  "immunizations",
  "assessments",
];
const clinicalFixture = {
  records: Object.fromEntries(kinds.map((kind) => [kind, []])),
  capabilities: Object.fromEntries(kinds.map((kind) => [kind, true])),
  truncated: {},
  new_work: {},
  medication_products: [],
  medication_order_options: { dose_units: [], routes: [] },
  assessment_scope: [],
  prior_orders: [],
  prior_care: [],
};
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { LaunchLayout } from '/src/App.tsx';
import { Login } from '/src/features/identity/Login.tsx';
import { DevelopmentToolbar } from '/src/features/identity/DevelopmentAccountSwitcher.tsx';
import { OwnerCommandCenter } from '/src/features/owner/OwnerCommandCenter.tsx';
import { ClinicalPlanWorkspace } from '/src/features/clinic/ClinicalPlanWorkspace.tsx';
const mode = new URLSearchParams(location.search).get('mode');
const child = mode === 'goals' ? React.createElement(ClinicalPlanWorkspace, {
 patient: { id: 1, display_name: 'Synthetic patient' },
 encounter: { id: 1, status: 'completed', ended_at: '2026-10-01T00:00:00Z', site_id: 1 }
}) : mode === 'home' ? React.createElement(Login, { environment: 'test', developmentLogin: true, developmentAccounts: [] })
: React.createElement(React.Fragment, null,
 React.createElement(DevelopmentToolbar, { environment: 'test', accounts: [], businessDate: '2026-10-01' }),
 React.createElement(OwnerCommandCenter));
createRoot(document.getElementById('root')).render(React.createElement(LaunchLayout, { user: null, environment: 'test' }, child));
`;
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
        name: "synthetic-muse-copy",
        enforce: "pre",
        resolveId(source, importer) {
          if (source === "/qa-copy.tsx") return "\0qa-copy";
          if (importer?.endsWith("/OwnerCommandCenter.tsx")) {
            if (source === "../../shared/ui") return "\0qa-owner-resource";
            if (source === "./WebsiteTraffic") return "\0qa-traffic";
          }
          if (importer?.endsWith("/ClinicalPlanWorkspace.tsx")) {
            if (source === "../../shared/ui") return "\0qa-clinic-resource";
            if (source === "./Workspace") return "\0qa-clinic";
            if (source === "./clinicNavigation") return "\0qa-navigation";
            if (source === "./ClinicalPlanClosurePanel") return "\0qa-closure";
            if (source === "./PrescriptionFulfillmentPanel")
              return "\0qa-fulfillment";
          }
        },
        load(id) {
          if (id === "\0qa-copy") return entry;
          if (id === "\0qa-owner-resource")
            return `export const useResource = () => ({ data: ${JSON.stringify(fixture)}, refresh() {} }); export const LoadState = () => null;`;
          if (id === "\0qa-traffic")
            return "export const WebsiteTraffic = () => null;";
          if (id === "\0qa-clinic-resource")
            return `export const useResource = (path) => ({ data: path.endsWith('/events') ? { attempts: [] } : ${JSON.stringify(clinicalFixture)}, refresh() {} }); export const LoadState = () => null;`;
          if (id === "\0qa-clinic")
            return "export const useClinic = () => ({ practice: { timezone: 'UTC' } });";
          if (id === "\0qa-navigation")
            return "export const useClinicNavigation = () => ({ registerBlocker: () => () => {} });";
          if (id === "\0qa-closure")
            return "export const ClinicalPlanClosurePanel = () => null;";
          if (id === "\0qa-fulfillment")
            return "export const PrescriptionFulfillmentPanel = () => null;";
        },
        transform(code, id) {
          // Expose only the existing layout to this isolated fixture, not production exports.
          if (id.endsWith("/src/App.tsx"))
            return code + "\nexport { LaunchLayout };";
        },
        configureServer(vite) {
          vite.middlewares.use((request, response, next) => {
            if (request.url?.startsWith("/qa-copy?")) {
              response.setHeader("Content-Type", "text/html");
              response.end(
                '<div id="root"></div><script type="module" src="/qa-copy.tsx"></script>',
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
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});
async function open(mode: string): Promise<Page> {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          csrf_token: "synthetic",
          events: [],
          attempts: [],
        }),
      }),
  );
  await page.goto(base + "qa-copy?mode=" + mode);
  await page
    .locator(".footer-bottom")
    .waitFor({ timeout: 3000 })
    .catch(() => {
      throw new Error(errors.join("\n"));
    });
  return page;
}
it("Muse232 explains the care-plan prerequisite on the GOALS tab", async () => {
  const page = await open("goals");
  await page.getByRole("tab", { name: /^Goals/ }).click();
  expect(
    await page.getByRole("button", { name: "Add care goal" }).isDisabled(),
  ).toBe(true);
  expect(
    await page.getByRole("button", { name: "Add care plan" }).isDisabled(),
  ).toBe(true);
  expect(
    await page
      .getByRole("alert")
      .filter({ has: page.getByRole("button", { name: "Add care plan" }) })
      .innerText(),
  ).toContain(
    "Reopen the encounter before creating a care plan or adding a care goal.",
  );
  await page.close();
});
it("Muse246 keeps test status out of the Workspace tools heading", async () => {
  const page = await open("owner");
  const tools = page.getByRole("button", { name: /Workspace tools/ });
  expect(await tools.innerText()).toBe("Workspace tools");
  await tools.click();
  expect(
    await page
      .getByText("This workspace is for testing.", { exact: true })
      .isVisible(),
  ).toBe(true);
  await page.close();
});
it("Muse247 preserves spaces in the rendered footer", async () => {
  const page = await open("owner");
  const footer = page.locator(".footer-bottom span");
  await footer.waitFor();
  expect(await footer.textContent()).toBe(
    `© ${new Date().getFullYear()} Meta Clinic`,
  );
  expect(await footer.ariaSnapshot()).toContain(
    `© ${new Date().getFullYear()} Meta Clinic`,
  );
  await page.close();
});
it("Muse249 explains unavailable text delivery without provider configuration jargon", async () => {
  const page = await open("owner");
  await page
    .getByRole("button", { name: "Create clinic", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  expect(
    await dialog.getByRole("radio", { name: "Text message" }).isDisabled(),
  ).toBe(true);
  expect(await dialog.innerText()).toContain(
    "Text messages are not available yet. Send the activation link by email.",
  );
  expect(await dialog.innerText()).not.toContain("Twilio");
  await page.close();
});
it("Muse250 separates the clinic count in accessible text", async () => {
  const page = await open("owner");
  const count = page.getByText("1 clinic", { exact: true });
  await count.waitFor();
  expect(await count.textContent()).toBe("1 clinic");
  expect(await count.ariaSnapshot()).toContain("1 clinic");
  await page.close();
});
it("Muse251 replaces the public TEST badge with a plain testing notice", async () => {
  const page = await open("home");
  await page
    .getByRole("heading", { name: /Streamline your practice/ })
    .waitFor();
  expect(await page.locator(".environment-test").count()).toBe(0);
  expect(
    await page
      .getByText("This workspace is for testing.", { exact: true })
      .isVisible(),
  ).toBe(true);
  await page.close();
});
