import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";

let server: ViteDevServer;
let browser: Browser;
let base: string;
const entry = `
import React, {useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {EmploymentAdminPage} from '/src/features/workforce/EmploymentAdminPage';
import {ClinicNavigationProvider, confirmClinicNavigation} from '/src/features/clinic/clinicNavigation';
import {DemoFrameBoundary} from '/src/features/demo/DemoFrameBoundary';
import {confirmSandboxNavigation} from '/src/features/demo/accountSwitch';
import {api, clearCsrf} from '/src/api/client';
window.addEventListener('clear-fixture-csrf', clearCsrf);
const blockers = new Set();
const navigation = {navigate: () => false,
  registerBlocker: read => { blockers.add(read); return () => blockers.delete(read); },
  confirmNavigation: options => confirmClinicNavigation([...blockers].map(read => read()), options?.includeBeforeUnload)};
function Parent() {
  const frame=useRef(null); const [actor,setActor]=useState(10); const [result,setResult]=useState('ready');
  async function switchAccount() {
    if (!await confirmSandboxNavigation(frame.current.contentWindow, '1', 10, 0)) {setResult('cancelled'); return;}
    await api('/api/demo/run/view', {method:'POST',body:{account:'front_desk',expected_run_id:1,expected_user_id:10}});
    setActor(20); setResult('switched');
  }
  return React.createElement(React.Fragment, null,
    React.createElement('p', null, 'Actor '+actor), React.createElement('p', null, result),
    React.createElement('button', {onClick:switchAccount}, 'Front Desk'),
    actor===10 && React.createElement('iframe', {ref:frame,name:'clinic-demo-workspace',src:'/clinic'}));
}
createRoot(document.getElementById('root')).render(location.pathname==='/clinic'
  ? React.createElement(ClinicNavigationProvider, {value:navigation}, React.createElement(DemoFrameBoundary, null, React.createElement(EmploymentAdminPage)))
  : React.createElement(Parent));
`;
beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "employee-draft-navigation",
        resolveId(id) {
          if (id === "/employee-entry.tsx") return "\0employee-entry.tsx";
        },
        load(id) {
          if (id === "\0employee-entry.tsx") return entry;
        },
        configureServer(vite) {
          vite.middlewares.use((request, response, next) => {
            if (request.url !== "/qa" && request.url !== "/clinic")
              return next();
            response.setHeader("Content-Type", "text/html");
            response.end(
              '<div id="root"></div><script type="module" src="/employee-entry.tsx"></script>',
            );
          });
        },
      },
    ],
  });
  await server.listen();
  base = server.resolvedUrls!.local[0];
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || "/usr/bin/chromium",
    headless: true,
  });
}, 20000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

async function fixture(
  page: Page,
  pending?: Promise<void>,
  scenario: {
    unknown?: boolean;
    saved?: boolean;
    readError?: boolean;
    existing?: boolean;
    csrfFailure?: boolean;
  } = {},
) {
  page.setDefaultTimeout(5000);
  page.on("pageerror", (error) => console.error(error));
  const switches: unknown[] = [];
  const submissions: string[] = [];
  await page.route(`${base}api/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      "/api/demo-workspace/",
      "/api/",
    );
    let body: unknown;
    if (path === "/api/csrf" && scenario.csrfFailure) {
      await route.fulfill({
        status: 503,
        json: { error: "Synthetic CSRF preflight failed" },
      });
      return;
    }
    if (
      path === "/api/clinic/workforce/employments" &&
      route.request().method() === "POST"
    ) {
      submissions.push(path);
      await route.fulfill({ json: { employment: { id: 99 } } });
      return;
    }
    if (
      path === "/api/clinic/workforce/employments" &&
      scenario.readError &&
      submissions.length
    ) {
      await route.fulfill({
        status: 503,
        json: { error: "Synthetic readback unavailable" },
      });
      return;
    }
    if (path === "/api/csrf") body = { csrf_token: "synthetic-token" };
    else if (path === "/api/demo/run")
      body = {
        active: true,
        run: {
          id: "1",
          sandbox: true,
          lesson_key: "sandbox",
          mode: "clinic",
          account: { user_id: 10 },
          steps: [],
        },
      };
    else if (path === "/api/clinic/workforce/employments")
      body = {
        employments: [],
        staff_members: [],
        membership_options: scenario.existing
          ? [{ id: 7, email_address: "eligible@example.test" }]
          : [],
        invitations: scenario.saved
          ? [
              {
                id: 99,
                email_address: "uncertain@example.test",
                display_name: "Synthetic uncertain employee",
                role_code: "workforce-employee",
              },
            ]
          : [],
        sites: [{ id: 2, name: "Synthetic site" }],
        role_options: [
          { id: 104, role_code: "workforce-employee", permissions: [] },
        ],
      };
    else if (path === "/api/demo/run/view") {
      switches.push(route.request().postDataJSON());
      body = {};
    } else if (
      path === "/api/clinic/workforce/onboarding" &&
      (pending || scenario.unknown)
    ) {
      submissions.push(path);
      if (scenario.unknown) {
        await route.fulfill({
          status: 504,
          json: {
            error: "Synthetic outcome is unconfirmed",
            code: "outcome_unconfirmed",
          },
        });
        return;
      }
      await pending;
      body = {
        invitation: {
          activation_token_once: "synthetic-only",
          activation_path: "/synthetic",
          expires_at: "2099-01-01T00:00:00Z",
        },
      };
    } else throw new Error(`Unexpected synthetic request ${path}`);
    await route.fulfill({ json: body });
  });
  await page.goto(`${base}qa`);
  const frame = page.frameLocator('iframe[name="clinic-demo-workspace"]');
  try {
    await frame.getByRole("button", { name: /^Add employee/ }).click();
    await frame.getByRole("textbox", { name: /^Employee name/ }).waitFor();
  } catch (error) {
    console.error(await page.locator("body").innerText());
    console.error(await page.frames()[1]?.locator("body").innerText());
    throw error;
  }
  return { frame, switches, submissions };
}

it("actual employee draft cancels switching without actor/draft loss, then explicit discard permits it", async () => {
  const page = await browser.newPage();
  try {
    const { frame, switches, submissions } = await fixture(page);
    await frame
      .getByRole("textbox", { name: /^Employee name/ })
      .fill("Synthetic unsaved role-switch probe");
    let discard = false;
    const prompts: string[] = [];
    page.on("dialog", async (dialog) => {
      prompts.push(dialog.message());
      await (discard ? dialog.accept() : dialog.dismiss());
    });
    await page.getByRole("button", { name: "Front Desk", exact: true }).click();
    await expect
      .poll(() => page.getByText("cancelled", { exact: true }).count())
      .toBe(1);
    expect(prompts).toEqual(["Discard your unsaved employee setup?"]);
    expect(switches).toEqual([]);
    expect(submissions).toEqual([]);
    expect(await page.getByText("Actor 10", { exact: true }).count()).toBe(1);
    expect(
      await frame.getByRole("textbox", { name: /^Employee name/ }).inputValue(),
    ).toBe("Synthetic unsaved role-switch probe");
    discard = true;
    await page.getByRole("button", { name: "Front Desk", exact: true }).click();
    await expect
      .poll(() => page.getByText("Actor 20", { exact: true }).count())
      .toBe(1);
    expect(prompts).toHaveLength(2);
    expect(switches).toEqual([
      { account: "front_desk", expected_run_id: 1, expected_user_id: 10 },
    ]);
    expect(submissions).toEqual([]);
  } finally {
    await page.close();
  }
}, 20000);

it("proven CSRF preflight failure retains an editable draft and ordinary cancellation, with no POST", async () => {
  const page = await browser.newPage();
  try {
    const scenario = { csrfFailure: false };
    const { frame, switches, submissions } = await fixture(
      page,
      undefined,
      scenario,
    );
    scenario.csrfFailure = true;
    await page
      .frames()[1]
      .evaluate(() => window.dispatchEvent(new Event("clear-fixture-csrf")));
    const name = frame.getByRole("textbox", { name: /^Employee name/ });
    await name.fill("Synthetic CSRF draft");
    await frame
      .locator("form")
      .evaluate((form) =>
        form.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
      );
    await expect
      .poll(() =>
        frame
          .getByText("Unable to connect. Please try again.", { exact: true })
          .count(),
      )
      .toBe(1);
    expect(submissions).toEqual([]);
    expect(await frame.locator("form").getAttribute("inert")).toBeNull();
    expect(
      await frame
        .getByRole("button", {
          name: "Check saved employee setup",
          exact: true,
        })
        .count(),
    ).toBe(0);
    await name.fill("Synthetic CSRF editable draft");
    const prompts: string[] = [];
    page.on("dialog", async (dialog) => {
      prompts.push(dialog.message());
      await dialog.dismiss();
    });
    await page.getByRole("button", { name: "Front Desk", exact: true }).click();
    await expect
      .poll(() => page.getByText("cancelled", { exact: true }).count())
      .toBe(1);
    expect(prompts).toEqual(["Discard your unsaved employee setup?"]);
    expect(switches).toEqual([]);
    expect(await name.inputValue()).toBe("Synthetic CSRF editable draft");
  } finally {
    await page.close();
  }
}, 20000);

it("unknown setup keeps its veto through failed and empty readback, then authoritative saved record releases it", async () => {
  const page = await browser.newPage();
  const scenario = { unknown: true, saved: false, readError: false };
  try {
    const { frame, switches, submissions } = await fixture(
      page,
      undefined,
      scenario,
    );
    await frame
      .getByRole("textbox", { name: /^Employee name/ })
      .fill("Synthetic uncertain employee");
    await frame
      .getByRole("textbox", { name: /^Employee email/ })
      .fill("uncertain@example.test");
    await frame
      .locator("form")
      .evaluate((form) =>
        form.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
      );
    const check = frame.getByRole("button", {
      name: "Check saved employee setup",
      exact: true,
    });
    await check.waitFor();
    const prompts: string[] = [];
    page.on("dialog", async (dialog) => {
      prompts.push(dialog.message());
      await dialog.accept();
    });
    await page.getByRole("button", { name: "Front Desk", exact: true }).click();
    await expect
      .poll(() => page.getByText("cancelled", { exact: true }).count())
      .toBe(1);
    expect(switches).toEqual([]);
    expect(prompts).toEqual([]);
    expect(await frame.locator("form").getAttribute("inert")).not.toBeNull();
    await frame
      .locator("form")
      .evaluate((form) =>
        form.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
      );
    expect(submissions).toHaveLength(1);
    scenario.readError = true;
    await check.click();
    await expect
      .poll(() =>
        frame
          .getByText("Synthetic readback unavailable", { exact: true })
          .count(),
      )
      .toBe(1);
    scenario.readError = false;
    await check.click();
    await expect
      .poll(() =>
        frame.getByText(/The saved setup is not yet confirmed/).count(),
      )
      .toBe(1);
    await page.getByRole("button", { name: "Front Desk", exact: true }).click();
    expect(switches).toEqual([]);
    expect(prompts).toEqual([]);
    scenario.saved = true;
    await check.click();
    await check.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Front Desk", exact: true }).click();
    await expect
      .poll(() => page.getByText("Actor 20", { exact: true }).count())
      .toBe(1);
    expect(prompts).toEqual([]);
    expect(submissions).toHaveLength(1);
  } finally {
    await page.close();
  }
}, 20000);

it("confirmed existing-login setup resets account mode and leaves a clean form without false discard", async () => {
  const page = await browser.newPage();
  try {
    const { frame, switches, submissions } = await fixture(page, undefined, {
      existing: true,
    });
    await frame
      .getByRole("textbox", { name: /^Employee name/ })
      .fill("Synthetic linked employee");
    await frame
      .getByRole("radio", {
        name: "Link an existing clinic login",
        exact: true,
      })
      .check();
    await frame.getByRole("combobox", { name: /^Clinic account/ }).click();
    await frame
      .getByRole("option", { name: "eligible@example.test", exact: true })
      .click();
    await frame
      .locator("form")
      .evaluate((form) =>
        form.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
      );
    await expect.poll(() => submissions.length).toBe(1);
    await expect
      .poll(() =>
        frame
          .getByRole("radio", {
            name: "Create a new employee login",
            exact: true,
          })
          .isChecked(),
      )
      .toBe(true);
    expect(
      await frame.getByRole("textbox", { name: /^Employee name/ }).inputValue(),
    ).toBe("");
    const prompts: string[] = [];
    page.on("dialog", async (dialog) => {
      prompts.push(dialog.message());
      await dialog.dismiss();
    });
    await page.getByRole("button", { name: "Front Desk", exact: true }).click();
    await expect
      .poll(() => page.getByText("Actor 20", { exact: true }).count())
      .toBe(1);
    expect(prompts).toEqual([]);
    expect(switches).toHaveLength(1);
  } finally {
    await page.close();
  }
}, 20000);

it("pending employee submission vetoes switching even when discard would be accepted", async () => {
  const page = await browser.newPage();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    const { frame, switches, submissions } = await fixture(page, pending);
    await frame
      .getByRole("textbox", { name: /^Employee name/ })
      .fill("Synthetic pending employee");
    await frame
      .locator("form")
      .evaluate((form) =>
        form.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
      );
    await expect.poll(() => submissions.length).toBe(1);
    const prompts: string[] = [];
    page.on("dialog", async (dialog) => {
      prompts.push(dialog.message());
      await dialog.accept();
    });
    await page.getByRole("button", { name: "Front Desk", exact: true }).click();
    await expect
      .poll(() => page.getByText("cancelled", { exact: true }).count())
      .toBe(1);
    expect(prompts).toEqual([]);
    expect(switches).toEqual([]);
    expect(
      await frame.getByRole("textbox", { name: /^Employee name/ }).inputValue(),
    ).toBe("Synthetic pending employee");
    release();
    await expect
      .poll(() =>
        frame.getByRole("textbox", { name: /^Employee name/ }).inputValue(),
      )
      .toBe("");
    await page.getByRole("button", { name: "Front Desk", exact: true }).click();
    await expect
      .poll(() => page.getByText("Actor 20", { exact: true }).count())
      .toBe(1);
    expect(prompts).toEqual([]);
  } finally {
    release();
    await page.close();
  }
}, 20000);
