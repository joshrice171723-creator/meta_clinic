#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(webRoot, "../..");
const allowedPortals = new Set(["clinic", "launch", "owner", "patient"]);

function fail(message) {
  process.stderr.write(`browser-smoke: ${message}\n`);
  process.exitCode = 2;
  throw new Error(message);
}

function help() {
  process.stdout.write(
    `Usage: pnpm run browser:smoke [options]\n\nOptions:\n  --route <path>       Route to inspect (default: /clinic)\n  --profile <value>    Account id or clinic-administrator (default)\n  --portal <name>      clinic, launch, owner, or patient (default: clinic)\n  --viewport <name>    desktop, tablet, or phone (default: desktop)\n  --screenshot <path>  Output PNG (default: outputs/browser-smoke/<timestamp>.png)\n  --matrix             Inspect the core clinic routes in one retained session\n  --ui-login           Exercise the visible development selector before opening the route\n  --base-url <url>     Loopback web URL (default: http://127.0.0.1:3000)\n  --headed             Show the browser window\n  --no-start           Require an already-running managed stack\n  --help               Show this help\n`,
  );
}

function options(argv) {
  const result = {
    route: "/clinic",
    profile: "clinic-administrator",
    portal: "clinic",
    viewport: "desktop",
    baseUrl: "http://127.0.0.1:3000",
    headed: false,
    matrix: false,
    uiLogin: false,
    start: true,
    screenshot: null,
  };
  const valued = new Map([
    ["--route", "route"],
    ["--profile", "profile"],
    ["--portal", "portal"],
    ["--viewport", "viewport"],
    ["--base-url", "baseUrl"],
    ["--screenshot", "screenshot"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--help") return { help: true };
    if (argument === "--headed") result.headed = true;
    else if (argument === "--matrix") result.matrix = true;
    else if (argument === "--ui-login") result.uiLogin = true;
    else if (argument === "--no-start") result.start = false;
    else if (valued.has(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--"))
        fail(`${argument} requires a value`);
      result[valued.get(argument)] = value;
      index += 1;
    } else fail(`unknown option ${argument}`);
  }
  return result;
}

const selected = options(process.argv.slice(2));
if (selected.help) {
  help();
  process.exit(0);
}
if (!selected.route.startsWith("/") || selected.route.startsWith("//"))
  fail("--route must be a same-origin absolute path");
if (!allowedPortals.has(selected.portal))
  fail("--portal must be clinic, launch, owner, or patient");
if (!new Set(["desktop", "tablet", "phone"]).has(selected.viewport))
  fail("--viewport must be desktop, tablet, or phone");
const base = new URL(selected.baseUrl);
if (
  !["127.0.0.1", "localhost"].includes(base.hostname) ||
  base.protocol !== "http:"
)
  fail("--base-url must be loopback HTTP");

if (selected.start) {
  const started = spawnSync("ruby", ["bin/dev", "start", "--no-browser"], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      APPLY_API_READINESS_TIMEOUT:
        process.env.APPLY_API_READINESS_TIMEOUT || "120",
      APPLY_WEB_READINESS_TIMEOUT:
        process.env.APPLY_WEB_READINESS_TIMEOUT || "120",
    },
  });
  if (started.status !== 0)
    fail("the managed development stack did not become ready");
}

const stamp = new Date()
  .toISOString()
  .replaceAll(":", "-")
  .replaceAll(".", "-");
const screenshot = resolve(
  root,
  selected.screenshot ||
    `outputs/browser-smoke/${stamp}-${selected.viewport}.png`,
);
mkdirSync(dirname(screenshot), { recursive: true });

const channel =
  process.env.PLAYWRIGHT_CHANNEL ||
  (process.platform === "win32" ? "msedge" : "chrome");
const browser = await chromium.launch({ channel, headless: !selected.headed });
try {
  const viewport =
    selected.viewport === "phone"
      ? { width: 390, height: 844 }
      : selected.viewport === "tablet"
        ? { width: 1024, height: 768 }
        : { width: 1440, height: 1000 };
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(message.text());
  });
  await page.goto(
    new URL(`/login?next=${encodeURIComponent(selected.route)}`, base).href,
    { waitUntil: "domcontentloaded" },
  );
  const visibleLogin = async () => {
    const account = await page.evaluate(
      ({ profile }) =>
        fetch("/api/csrf", { credentials: "same-origin" })
          .then((response) => response.json())
          .then((payload) => {
            const accounts = payload.development_accounts || [];
            return (
              accounts.find((candidate) => candidate.id === profile) ||
              accounts.find(
                (candidate) =>
                  candidate.account_type === "employee" &&
                  candidate.label === "Clinic Administrator",
              ) ||
              null
            );
          }),
      { profile: selected.profile },
    );
    if (!account)
      return {
        status: 422,
        body: {
          error: `No available development account matches ${selected.profile}`,
        },
        profile: null,
      };
    const waitForEnabled = async (locator) => {
      for (let attempt = 0; attempt < 150; attempt += 1) {
        if (await locator.isEnabled()) return;
        await page.waitForTimeout(100);
      }
      fail("a development selector did not become enabled");
    };
    const chooseOption = async (label) => {
      const options = page
        .getByRole("option")
        .filter({ hasNotText: /^Select / });
      const target = label
        ? options.filter({ hasText: label }).first()
        : options.first();
      await target.waitFor({ state: "visible", timeout: 15000 });
      await target.click();
    };
    const organization = page.getByRole("combobox", {
      name: "Organization",
      exact: true,
    });
    if (await organization.count()) {
      await waitForEnabled(organization);
      await organization.click();
      await chooseOption(account.organization?.name);
      const clinic = page.getByRole("combobox", {
        name: "Clinic",
        exact: true,
      });
      await waitForEnabled(clinic);
      await clinic.click();
      await chooseOption(account.clinic?.name);
      const location = page.getByRole("combobox", {
        name: "Location",
        exact: true,
      });
      await waitForEnabled(location);
      await location.click();
      await chooseOption(account.locations?.[0]?.name);
    }
    const accountSelector = page.getByRole("combobox", {
      name: /Select .* account/,
    });
    await waitForEnabled(accountSelector);
    await accountSelector.click();
    await page
      .getByRole("option", { name: account.label, exact: true })
      .click();
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await page.waitForURL((url) => url.pathname !== "/login", {
      timeout: 15000,
    });
    return { status: 201, body: {}, profile: account.id };
  };
  const login = selected.uiLogin
    ? await visibleLogin()
    : await page.evaluate(
        async ({ profile, portal }) => {
          const csrfResponse = await fetch("/api/csrf", {
            credentials: "same-origin",
          });
          const csrf = await csrfResponse.json();
          const accounts = csrf.development_accounts || [];
          const account =
            accounts.find((candidate) => candidate.id === profile) ||
            (profile === "clinic-administrator"
              ? accounts.find(
                  (candidate) =>
                    candidate.account_type === "employee" &&
                    candidate.label === "Clinic Administrator",
                )
              : null);
          if (!account) {
            return {
              status: 422,
              body: {
                error: `No available development account matches ${profile}`,
              },
              profile: null,
            };
          }
          const locations = account.locations || [];
          const scope =
            account.account_type !== "omni" &&
            account.clinic &&
            locations.length === 1
              ? { practice_id: account.clinic.id, site_id: locations[0].id }
              : {};
          const response = await fetch("/api/development_session", {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": csrf.csrf_token,
            },
            body: JSON.stringify({ profile: account.id, portal, ...scope }),
          });
          return {
            status: response.status,
            body: await response.json(),
            profile: account.id,
          };
        },
        { profile: selected.profile, portal: selected.portal },
      );
  if (login.status !== 201)
    fail(
      `development login returned HTTP ${login.status}: ${login.body?.error || "unknown response"}`,
    );
  failures.length = 0;
  const routes = selected.matrix
    ? [
        "/clinic",
        "/clinic/schedule",
        "/clinic/work",
        "/clinic/billing",
        "/clinic/inventory",
        "/clinic/workforce",
        "/clinic/telehealth",
      ]
    : [selected.route];
  const observations = [];
  for (const [index, route] of routes.entries()) {
    failures.length = 0;
    const response = await page.goto(new URL(route, base).href, {
      // Clinic pages poll while visible, so network-idle is not a stable
      // readiness signal. The route response plus visible main content is the
      // bounded smoke contract; individual data states are rendered by the
      // page itself.
      waitUntil: "domcontentloaded",
    });
    if (!response?.ok())
      fail(`${route} returned HTTP ${response?.status() || "unknown"}`);
    if (new URL(page.url()).pathname === "/login")
      fail(`${route} redirected back to login`);
    await page
      .locator("main")
      .first()
      .waitFor({ state: "visible", timeout: 15000 });
    await page
      .locator("main h1:visible, main [role=heading]:visible")
      .first()
      .waitFor({ state: "visible", timeout: 15000 });
    const routeScreenshot = selected.matrix
      ? screenshot.replace(
          /\.png$/,
          `-${String(index + 1).padStart(2, "0")}.png`,
        )
      : screenshot;
    await page.screenshot({ path: routeScreenshot, fullPage: true });
    if (failures.length)
      fail(`${route} reported errors: ${[...new Set(failures)].join(" | ")}`);
    observations.push({ route, screenshot: routeScreenshot });
  }
  process.stdout.write(
    `${JSON.stringify({ routes: observations, profile: login.profile, portal: selected.portal, viewport: selected.viewport })}\n`,
  );
  await context.close();
} finally {
  await browser.close();
}
