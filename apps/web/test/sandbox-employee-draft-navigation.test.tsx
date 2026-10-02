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
import {api} from '/src/api/client';
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

async function fixture(page: Page, pending?: Promise<void>) {
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
        membership_options: [],
        invitations: [],
        sites: [{ id: 2, name: "Synthetic site" }],
        role_options: [
          { id: 104, role_code: "workforce-employee", permissions: [] },
        ],
      };
    else if (path === "/api/demo/run/view") {
      switches.push(route.request().postDataJSON());
      body = {};
    } else if (path === "/api/clinic/workforce/onboarding" && pending) {
      submissions.push(path);
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
