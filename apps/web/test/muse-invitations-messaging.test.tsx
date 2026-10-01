import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";
let server: ViteDevServer, browser: Browser, base: string;
const entry = `import React from 'react'; import {createRoot} from 'react-dom/client';
import {EmploymentAdminPage} from '/src/features/workforce/EmploymentAdminPage.tsx';

import {LiveStaffMessagingWorkspace} from '/src/features/staff-messaging/LiveStaffMessagingWorkspace.tsx';
const mode = new URLSearchParams(location.search).get('mode'); const EmployeeActivationPage = mode === 'activation' ? (await import('/src/features/workforce/EmployeeActivationPage.tsx')).EmployeeActivationPage : null;
createRoot(document.getElementById('root')).render(React.createElement(mode === 'messages' ? LiveStaffMessagingWorkspace : mode === 'activation' ? EmployeeActivationPage : EmploymentAdminPage));`;
beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "synthetic-invitations-messaging",
        enforce: "pre",
        resolveId(source, importer) {
          if (source === "/qa-invites.tsx") return "\0qa-invites";
          if (
            importer?.includes("/staff-messaging/") &&
            source === "../clinic/clinicNavigation"
          )
            return "\0qa-nav";
          if (
            importer?.includes("/staff-messaging/") &&
            source === "../clinic/Workspace"
          )
            return "\0qa-context";
          if (
            importer?.includes("/staff-messaging/") &&
            source === "../clinic/ClinicRealtime"
          )
            return "\0qa-realtime";
        },
        load(id) {
          if (id === "\0qa-invites") return entry;
          if (id === "\0qa-nav")
            return "export const useClinicNavigation = () => ({registerBlocker: () => () => {}});";
          if (id === "\0qa-context")
            return "const capabilities = {staff_messaging_read:true,staff_messaging_create_conversation:true}; export const useClinic = () => ({capabilities, membership_id:1,current_site:{id:1}});";
          if (id === "\0qa-realtime")
            return "export const useClinicRealtimeTopic = () => {};";
        },
        configureServer(vite) {
          vite.middlewares.use((req, res, next) => {
            if (req.url?.startsWith("/qa-invites?")) {
              res.setHeader("Content-Type", "text/html");
              res.end(
                '<div id="root"></div><script type="module" src="/qa-invites.tsx"></script>',
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
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
}, 60000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});
async function open(mode: string, outcome = "success") {
  const page = await browser.newPage();
  const mutations: string[] = [];
  let pendingInvitation = true;
  let invitationCount = 0;
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    (route) => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      let status = 200;
      let body: unknown = {};
      if (path.endsWith("/csrf")) body = { csrf_token: "synthetic-only" };
      else if (method === "PATCH" && path === "/api/clinic/workforce/onboarding/1") {
        mutations.push(path);
        pendingInvitation = false;
        body = { invitation: { id: 1, status: "revoked" } };
      }
      else if (method === "POST") {
        mutations.push(path);
        if (outcome === "conflict") {
          status = 409;
          body = {
            code: "clinic_changed",
            error: "Your clinic changed in another window.",
          };
        } else if (outcome === "denied") {
          status = 403;
          body = {
            error:
              "Your account does not have permission for this clinic action",
          };
        } else if (path.endsWith("/onboarding")) {
          pendingInvitation = true;
          invitationCount++;
          const token = invitationCount === 1 ? "synthetic-nonfunctional" : "synthetic-replacement";
          body = {
            invitation: {
              activation_token_once: token,
              activation_path: `/workforce/activate#token=${token}`,
              expires_at: "2026-10-04T00:00:00Z",
            },
          };
        }
        else {
          status = 422;
          body = { error: "Synthetic activation refusal" };
        }
      } else if (path.endsWith("/employments"))
        body = {
          employments: [],
          staff_members: [],
          membership_options: [],
          role_options: [
            {
              id: 1,
              role_code: "workforce-employee",
              version: 1,
              permissions: [],
            },
          ],
          sites: [{ id: 1, name: "Synthetic Site", code: "SYN" }],
          invitations: pendingInvitation ? [
            {
              id: 1,
              display_name: "Pending Synthetic",
              email_address: "pending@example.test",
              role_code: "workforce-employee",
              expires_at: "2026-10-04T00:00:00Z",
            },
          ] : [],
        };
      else if (path.endsWith("/participants"))
        body = {
          participants:
            outcome === "empty"
              ? []
              : [
                  { id: 1, email: "self@example.test", active: true },
                  { id: 2, email: "eligible@example.test", active: true },
                  { id: 3, email: "inactive@example.test", active: false },
                ],
        };
      else if (path.endsWith("/conversations"))
        body = {
          conversations: [],
          pagination: { page: 1, per_page: 50, total: 0, total_pages: 1 },
        };
      else {
        status = 404;
        body = { error: "Unexpected synthetic request" };
      }
      return route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    },
  );
  await page.goto(base + "qa-invites?mode=" + mode);
  return { page, mutations };
}
async function fillInvite(page: Page) {
  await page
    .getByLabel("Employee name", { exact: false })
    .fill("Synthetic Person");
  await page.getByLabel("Job title", { exact: false }).fill("Synthetic role");
  await page
    .getByLabel("Employee email", { exact: false })
    .fill("synthetic@example.test");
  await page.getByRole("checkbox", { name: "Synthetic Site" }).check();
}
it("Muse214 creation shows one-time values; pending rows and reload do not recover them", async () => {
  const { page, mutations } = await open("employees");
  await fillInvite(page);
  await page
    .getByRole("button", { name: "Create employee invitation" })
    .click();
  await page
    .getByLabel("One-time activation token", { exact: false })
    .waitFor();
  expect(
    await page
      .getByLabel("One-time activation token", { exact: false })
      .inputValue(),
  ).toBe("synthetic-nonfunctional");
  expect(
    await page
      .getByRole("link", { name: "Open employee activation" })
      .getAttribute("href"),
  ).toContain("#token=synthetic-nonfunctional");
  await page.reload();
  await page.getByText("Pending Synthetic", { exact: false }).waitFor();
  expect(
    await page
      .getByLabel("One-time activation token", { exact: false })
      .count(),
  ).toBe(0);
  expect(mutations).toHaveLength(1);
  await page.getByText(/If you no longer have them, revoke the invitation below/).waitFor();
  await page.getByRole("button", { name: "Revoke invitation", exact: true }).click();
  await page.getByText("The employee invitation was revoked.", { exact: true }).waitFor();
  await fillInvite(page);
  await page.getByRole("button", { name: "Create employee invitation", exact: true }).click();
  await expect.poll(() => page.getByLabel("One-time activation token", { exact: false }).inputValue()).toBe("synthetic-replacement");
  expect(await page.getByRole("link", { name: "Open employee activation" }).getAttribute("href")).toContain("#token=synthetic-replacement");
  expect(mutations).toEqual(["/api/clinic/workforce/onboarding", "/api/clinic/workforce/onboarding/1", "/api/clinic/workforce/onboarding"]);
  await page.close();
});
it("Muse58 clinic conflict is visible, preserves invitation fields, and does not replay", async () => {
  const { page, mutations } = await open("employees", "conflict");
  await fillInvite(page);
  await page
    .getByRole("button", { name: "Create employee invitation" })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Your clinic changed" })
    .waitFor();
  expect(
    await page.getByLabel("Employee name", { exact: false }).inputValue(),
  ).toBe("Synthetic Person");
  expect(
    await page.getByLabel("Employee email", { exact: false }).inputValue(),
  ).toBe("synthetic@example.test");
  expect(
    await page.getByRole("checkbox", { name: "Synthetic Site" }).isChecked(),
  ).toBe(true);
  expect(
    await page
      .getByLabel("One-time activation token", { exact: false })
      .count(),
  ).toBe(0);
  expect(mutations).toHaveLength(1);
  await page.close();
});
it("Muse36 activation describes code and password setup without identity verification", async () => {
  const { page, mutations } = await open("activation");
  await page.getByLabel("Invitation code", { exact: false }).waitFor();
  expect(await page.locator("body").innerText()).toContain(
    "Enter your invitation code, then choose a password",
  );
  expect(await page.locator("body").innerText()).not.toMatch(
    /identity verification|date of birth/i,
  );
  expect(
    await page.getByRole("button", { name: "Create account" }).isDisabled(),
  ).toBe(true);
  expect(mutations).toHaveLength(0);
  await page.close();
});
async function composer(page: Page) {
  await page.getByRole("button", { name: "New conversation" }).click();
  await page.getByRole("dialog").waitFor();
}
it("Muse21/44 only active non-self staff are offered", async () => {
  const { page } = await open("messages");
  await composer(page);
  await page.getByRole("combobox", { name: "Conversation type" }).click();
  await page.getByRole("option", { name: "Direct", exact: true }).click();
  await page.getByRole("combobox", { name: "Staff participant" }).click();
  expect(await page.getByRole("option").allTextContents()).toEqual([
    "eligible@example.test",
  ]);
  await page
    .getByRole("option", { name: "eligible@example.test", exact: true })
    .click();
  expect(
    await page
      .getByRole("button", { name: "Create conversation", exact: true })
      .isEnabled(),
  ).toBe(true);
  await page.close();
});
it.each(["denied", "conflict"])(
  "Muse112 creation %s is accessible in the modal and preserves unsent title",
  async (outcome) => {
    const { page, mutations } = await open("messages", outcome);
    await composer(page);
    await page
      .getByLabel("Conversation title", { exact: false })
      .fill("Synthetic unsent title");
    await page
      .getByRole("button", { name: "Create conversation", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("alert")
      .filter({
        hasText: outcome === "denied" ? "permission" : "clinic changed",
      })
      .waitFor({ timeout: 3000 });
    expect(
      await page
        .getByLabel("Conversation title", { exact: false })
        .inputValue(),
    ).toBe("Synthetic unsent title");
    expect(mutations).toHaveLength(1);
    await page.close();
  },
);
it("Muse44 empty recipients explains the block inside the dialog without posting", async () => {
  const { page, mutations } = await open("messages", "empty");
  await composer(page);
  await page
    .getByLabel("Conversation title", { exact: false })
    .fill("Synthetic unsent title");
  await page
    .getByRole("button", { name: "Create conversation", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("alert")
    .filter({ hasText: "No active staff members" })
    .waitFor({ timeout: 3000 });
  expect(mutations).toHaveLength(0);
  await page.close();
});
