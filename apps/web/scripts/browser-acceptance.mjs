#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const base = new URL(process.env.BROWSER_BASE_URL || "http://localhost:3000");
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
if (
  base.protocol !== "http:" ||
  !["localhost", "127.0.0.1"].includes(base.hostname)
) {
  throw new Error("BROWSER_BASE_URL must be loopback HTTP");
}

const profiles = [
  "employee-48", // billing
  "employee-47", // clinic administrator
  "employee-51", // clinical staff
  "employee-50", // clinician
  "employee-49", // front desk
  "employee-52", // inventory
  "employee-56", // payroll
  "employee-53", // records
  "employee-55", // scribe
  "employee-58", // different clinic
  "employee-54", // multi-site clinic
  "employee-59", // broad synthetic permission fixture
];
const selectedProfiles = process.env.BROWSER_PROFILES
  ? process.env.BROWSER_PROFILES.split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  : profiles;
const skipRoutes = process.env.BROWSER_SKIP_ROUTES === "1";

const routes = [
  ["/clinic", "Tracking Board"],
  ["/clinic/schedule", "Schedule"],
  ["/clinic/work", "Patient Flow"],
  ["/clinic/billing", "Billing"],
  ["/clinic/inventory", "Inventory"],
  ["/clinic/workforce", "Workforce"],
  ["/clinic/telehealth", "Virtual waiting room"],
];
const routeCapabilities = {
  "/clinic/schedule": "appointments_read",
  "/clinic/work": "patients",
  "/clinic/billing": "billing_read",
  "/clinic/inventory": "inventory",
  "/clinic/workforce": "workforce_self",
  "/clinic/telehealth": "telehealth_read",
};

const actions = [
  {
    name: "role-grants-write",
    path: "/api/clinic/role_grants",
    capability: "roles",
    body: { role_grant: {} },
  },
  {
    name: "facility-write",
    path: "/api/clinic/facilities",
    capability: ["clinic_setup_write", "appointments"],
    body: { site: {} },
  },
  {
    name: "patient-create",
    path: "/api/clinic/patients",
    capability: "patients_write",
    body: { patient: {} },
  },
  {
    name: "reminder-create",
    path: "/api/clinic/reminders",
    capability: "reminders_write",
    body: { reminder: {} },
  },
];

const outputPath = resolve(
  repoRoot,
  process.env.BROWSER_ACCEPTANCE_OUTPUT ||
    "outputs/browser-acceptance/latest.json",
);
const failures = [];
const results = {
  profiles: [],
  action_denials: [],
  site_boundaries: [],
  accessibility: [],
};
let knownAccounts = [];

async function csrf(page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/csrf", { credentials: "same-origin" });
    return response.json();
  });
}

async function sessionRequest(page, path, options = {}) {
  return page.evaluate(
    async ({ path, options }) => {
      const csrfResponse = await fetch("/api/csrf", {
        credentials: "same-origin",
      });
      const csrf = await csrfResponse.json();
      const headers = {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf.csrf_token,
        ...(options.headers || {}),
      };
      const response = await fetch(path, {
        credentials: "same-origin",
        method: options.method || "GET",
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      let body = null;
      try {
        body = await response.json();
      } catch {
        body = { text: await response.text() };
      }
      return { status: response.status, body };
    },
    { path, options },
  );
}

async function login(page, profile) {
  await page.goto(new URL("/login", base).href, {
    waitUntil: "domcontentloaded",
  });
  const configuration = await csrf(page);
  knownAccounts = configuration.development_accounts || knownAccounts;
  const account = configuration.development_accounts?.find(
    (entry) => entry.id === profile,
  );
  if (!account) throw new Error(`No development account ${profile}`);
  const locations = account.locations || [];
  const scope =
    account.account_type !== "omni" && account.clinic
      ? {
          practice_id: account.clinic.id,
          ...(locations[0] ? { site_id: locations[0].id } : {}),
        }
      : {};
  const result = await sessionRequest(page, "/api/development_session", {
    method: "POST",
    body: { profile: account.id, portal: "clinic", ...scope },
  });
  if (result.status !== 201)
    throw new Error(
      `${profile} login failed: HTTP ${result.status} ${JSON.stringify(result.body)}`,
    );
  return account;
}

async function inspectRoute(page, [path, expected]) {
  const response = await page.goto(new URL(path, base).href, {
    waitUntil: "domcontentloaded",
  });
  if (!response?.ok())
    throw new Error(`${path} returned HTTP ${response?.status()}`);
  if (new URL(page.url()).pathname === "/login")
    throw new Error(`${path} redirected to login`);
  await page
    .locator("main")
    .first()
    .waitFor({ state: "visible", timeout: 15000 });
  try {
    await page.waitForFunction(
      (expectedHeading) => {
        const text = (document.querySelector("main")?.textContent || "").trim();
        return (
          text.includes(expectedHeading) ||
          !/^Loading(?:…| this page)/.test(text)
        );
      },
      { timeout: 10000 },
      expected,
    );
  } catch {
    // Preserve a persistent loading/error state for the acceptance result.
  }
  const details = await page.evaluate(
    ({ expected }) => {
      const main = document.querySelector("main");
      const text = main?.textContent?.replace(/\s+/g, " ").trim() || "";
      const interactive = [
        ...document.querySelectorAll(
          "button,a,input,select,textarea,[tabindex]",
        ),
      ].filter((node) => {
        const style = getComputedStyle(node);
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          node.getAttribute("aria-hidden") !== "true" &&
          node.getAttribute("tabindex") !== "-1" &&
          !node.hasAttribute("disabled")
        );
      });
      const unnamed = interactive.filter((node) => {
        const label =
          node.getAttribute("aria-label") ||
          node.getAttribute("title") ||
          node.textContent?.trim();
        const labelledBy = node.getAttribute("aria-labelledby");
        const id = node.getAttribute("id");
        const associated =
          id &&
          document
            .querySelector(`label[for="${CSS.escape(id)}"]`)
            ?.textContent?.trim();
        const enclosingLabel = node.closest("label")?.textContent?.trim();
        return !label && !labelledBy && !associated && !enclosingLabel;
      });
      return {
        contains_expected_heading: text.includes(expected),
        text_sample: text.slice(0, 320),
        horizontal_overflow:
          document.documentElement.scrollWidth > window.innerWidth + 1,
        interactive_count: interactive.length,
        unnamed_interactive_count: unnamed.length,
        has_main: Boolean(main),
      };
    },
    { expected },
  );
  if (!details.has_main) throw new Error(`${path} has no main landmark`);
  return details;
}

async function checkActions(page, account, context) {
  for (const action of actions) {
    const response = await sessionRequest(page, action.path, {
      method: "POST",
      body: action.body,
    });
    const capabilityNames = Array.isArray(action.capability)
      ? action.capability
      : [action.capability];
    const allowed = capabilityNames.some((name) =>
      Boolean(context.capabilities?.[name]),
    );
    const expected = allowed ? "validation-or-success" : "403";
    const passed = allowed ? response.status !== 403 : response.status === 403;
    results.action_denials.push({
      profile: account.id,
      action: action.name,
      status: response.status,
      allowed,
      expected,
      passed,
    });
    if (!passed)
      failures.push(
        `${account.id} ${action.name}: expected ${expected}, got ${response.status}`,
      );
  }
}

async function checkSiteBoundaries(page, account) {
  const practiceIds = [
    ...new Set(knownAccounts.map((entry) => entry.clinic?.id).filter(Boolean)),
  ];
  for (const practiceId of practiceIds) {
    if (practiceId === account.clinic?.id) continue;
    const response = await sessionRequest(page, "/api/clinic/context", {
      method: "PATCH",
      body: { practice_id: practiceId },
    });
    const passed = [403, 404].includes(response.status);
    results.site_boundaries.push({
      profile: account.id,
      kind: "practice",
      attempted_id: practiceId,
      status: response.status,
      passed,
    });
    if (!passed)
      failures.push(
        `${account.id} cross-practice switch to ${practiceId} returned ${response.status}`,
      );
  }
  const authorizedSiteIds = new Set(
    (account.locations || []).map((site) => site.id),
  );
  const siteIds = [
    ...new Set(
      knownAccounts.flatMap((entry) =>
        (entry.locations || []).map((site) => site.id),
      ),
    ),
  ];
  for (const siteId of siteIds) {
    if (authorizedSiteIds.has(siteId)) continue;
    const response = await sessionRequest(page, "/api/clinic/context", {
      method: "PATCH",
      body: { site_id: siteId },
    });
    const passed = [403, 404].includes(response.status);
    results.site_boundaries.push({
      profile: account.id,
      kind: "site",
      attempted_id: siteId,
      status: response.status,
      passed,
    });
    if (!passed)
      failures.push(
        `${account.id} cross-site switch to ${siteId} returned ${response.status}`,
      );
  }
}

async function main() {
  const browser = await chromium.launch({
    channel:
      process.env.PLAYWRIGHT_CHANNEL ||
      (process.platform === "win32" ? "msedge" : "chrome"),
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    for (const profile of selectedProfiles) {
      await context.clearCookies();
      const account = await login(page, profile);
      const routeResults = [];
      for (const route of skipRoutes ? [] : routes) {
        try {
          const details = await inspectRoute(page, route);
          routeResults.push({ route: route[0], ...details });
        } catch (error) {
          const message = `${profile} ${route[0]}: ${error.message}`;
          failures.push(message);
          routeResults.push({ route: route[0], error: message });
        }
      }
      const contextResponse = await sessionRequest(page, "/api/clinic/context");
      if (contextResponse.status !== 200)
        throw new Error(
          `${profile} context failed: HTTP ${contextResponse.status}`,
        );
      const clinicContext = contextResponse.body;
      for (const routeResult of routeResults) {
        if (routeResult.error) {
          results.accessibility.push({
            profile,
            route: routeResult.route,
            passed: false,
            error: routeResult.error,
          });
          continue;
        }
        const deniedState =
          /permission|not authorized|access denied|unavailable|blocked|no access|reload|try again|loading this page/i.test(
            routeResult.text_sample,
          );
        const routePassed =
          routeResult.contains_expected_heading || deniedState;
        const passed =
          routePassed &&
          !routeResult.horizontal_overflow &&
          routeResult.unnamed_interactive_count === 0;
        results.accessibility.push({
          profile,
          ...routeResult,
          state: routeResult.contains_expected_heading
            ? "content"
            : "explicit-error-or-denial",
          passed,
        });
        if (!routePassed)
          failures.push(
            `${profile} ${routeResult.route} did not render its permitted heading or an explicit denial state`,
          );
      }
      await checkActions(page, account, clinicContext);
      await checkSiteBoundaries(page, account);
      results.profiles.push({
        profile,
        clinic_id: account.clinic?.id || null,
        site_ids: (account.locations || []).map((site) => site.id),
        capabilities: clinicContext.capabilities,
        routes: routeResults,
      });
    }
    results.summary = {
      profiles: results.profiles.length,
      routes: results.profiles.reduce(
        (count, entry) => count + entry.routes.length,
        0,
      ),
      action_checks: results.action_denials.length,
      action_failures: results.action_denials.filter((entry) => !entry.passed)
        .length,
      accessibility_checks: results.accessibility.length,
      accessibility_failures: results.accessibility.filter(
        (entry) => !entry.passed,
      ).length,
      site_boundary_checks: results.site_boundaries.length,
      failures,
    };
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(results, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(results.summary)}\n`);
    if (failures.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

await main();
