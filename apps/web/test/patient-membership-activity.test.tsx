import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright-core";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Subscription } from "../src/features/clinic/subscriptions/contracts";
const root = fileURLToPath(new URL("..", import.meta.url));
let server: ViteDevServer, browser: Browser, base: string;
const subscription = (
  id: number,
  events: Subscription["events"],
  processor: Subscription["processor"] = "local_membership_simulator",
): Subscription => ({
  id,
  invoice_id: id + 100,
  version_id: 1,
  state: "active",
  processor,
  amount: "59.00",
  currency: "USD",
  balance: "0.00",
  invoice_status: "posted",
  starts_at: "2026-09-01T00:00:00Z",
  ends_at: "2026-10-01T00:00:00Z",
  cancellation_effective_at: null,
  terms: {
    family_id: 1,
    family_name: "Synthetic care",
    package_id: id,
    package_name: `Synthetic plan ${id}`,
    description: "Synthetic only",
    tier: "standard",
    amount: "59.00",
    currency: "USD",
    duration: 1,
    duration_unit: "months",
    renewal: "automatic",
    cancellation: "end_of_term",
    refund_policy: "manual_review",
    terms: "Synthetic terms",
    eligibility_review: false,
    max_per_patient: 1,
    available_from: null,
    available_until: null,
    components: [],
  },
  events,
});
const events = [
  { kind: "processing", occurred_at: "2026-09-01T10:00:00Z" },
  { kind: "active", occurred_at: "2026-09-01T10:05:00Z" },
  { kind: "payment_failed", occurred_at: "2026-10-01T10:00:00Z" },
  { kind: "outcome_unknown", occurred_at: "2026-10-01T10:01:00Z" },
  { kind: "active", occurred_at: "2026-10-01T10:05:00Z" },
  { kind: "canceled", occurred_at: "2026-10-02T10:00:00Z" },
];
beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root,
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "synthetic-patient-membership-history",
        resolveId(source) {
          if (source === "/membership-entry.js") return "\0membership-entry";
        },
        load(id) {
          if (id === "\0membership-entry")
            return `import React from 'react';import {createRoot} from 'react-dom/client';import {PatientSubscriptions} from '/src/features/patientPortal/PatientSubscriptions.tsx';createRoot(document.getElementById('root')).render(React.createElement(PatientSubscriptions,{onChanged:()=>{}}));`;
        },
        configureServer(vite) {
          vite.middlewares.use((req, res, next) => {
            if (req.url === "/membership") {
              res.setHeader("Content-Type", "text/html");
              res.end(
                '<div id="root"></div><script type="module" src="/membership-entry.js"></script>',
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
    executablePath: ["/usr/bin/chromium", chromium.executablePath()].find(
      existsSync,
    ),
    args: ["--no-sandbox"],
  });
}, 60000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});
async function open(subscriptions: Subscription[], failure = false) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    timezoneId: "America/New_York",
  });
  page.setDefaultTimeout(8000);
  const requests: string[] = [];
  await page.route(/^http:\/\/127\.0\.0\.1:\d+\/api\//, (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push(`${route.request().method()} ${path}`);
    if (path === "/api/csrf")
      return route.fulfill({ json: { csrf_token: "synthetic-only" } });
    if (
      path === "/api/patient_portal/subscriptions" &&
      route.request().method() === "GET"
    )
      return route.fulfill(
        failure
          ? { status: 403, json: { error: "Synthetic patient scope denied" } }
          : {
              json: {
                catalog: [],
                subscriptions,
                can_purchase: false,
                processor: "local_membership_simulator",
                payment: {
                  checkout_available: false,
                  next_step: "clinic_follow_up",
                },
              },
            },
      );
    return route.abort();
  });
  await page.goto(`${base}membership`);
  return { page, requests };
}
it("shows each recorded renewal/failure/cancellation event without treating it as payment or notification proof", async () => {
  const { page, requests } = await open([subscription(1, events)]);
  try {
    const toggle = page.getByRole("button", {
      name: "Membership activity (6)",
      exact: true,
    });
    await toggle.waitFor();
    await toggle.focus();
    await page.keyboard.press("Enter");
    expect(await toggle.getAttribute("aria-expanded")).toBe("true");
    const history = page.getByRole("region", {
      name: "Membership activity (6)",
      exact: true,
    });
    expect(await history.getByRole("listitem").count()).toBe(6);
    expect(
      await history
        .getByText("Active access recorded", { exact: false })
        .count(),
    ).toBe(2);
    await history.getByText(/Payment outcome unconfirmed/).waitFor();
    await history.getByText(/Cancellation recorded/).waitFor();
    await history
      .getByText(/Local simulator records; no provider charge/)
      .waitFor();
    await history.getByText(/America\/New_York/).waitFor();
    expect(await history.locator("time").first().getAttribute("datetime")).toBe(
      events[0].occurred_at,
    );
    expect(requests).toEqual([
      "GET /api/csrf",
      "GET /api/patient_portal/subscriptions",
    ]);
    await toggle.click();
    expect(await toggle.getAttribute("aria-expanded")).toBe("false");
  } finally {
    await page.close();
  }
}, 60000);
it("keeps histories attached to their owning returned membership and retains repeated events in server order", async () => {
  const { page, requests } = await open([
    subscription(1, events.slice(0, 2)),
    subscription(
      2,
      [{ kind: "refunded", occurred_at: "2026-10-02T11:00:00Z" }],
      "development_fixture",
    ),
  ]);
  try {
    await page
      .getByRole("button", { name: "Membership activity (2)", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Membership activity (1)", exact: true })
      .click();
    const first = page.getByRole("region", {
      name: "Membership activity (2)",
      exact: true,
    });
    const second = page.getByRole("region", {
      name: "Membership activity (1)",
      exact: true,
    });
    expect(await first.getByRole("listitem").allTextContents()).toEqual([
      expect.stringContaining("Payment processing recorded"),
      expect.stringContaining("Active access recorded"),
    ]);
    expect(await first.getByText(/Refund recorded/).count()).toBe(0);
    await second.getByText(/Refund recorded/).waitFor();
    await second.getByText(/Development fixture records/).waitFor();
    expect(await second.getByText(/Active access recorded/).count()).toBe(0);
    expect(requests.some((r) => r.startsWith("POST"))).toBe(false);
  } finally {
    await page.close();
  }
}, 60000);
it("shows absent history and unknown event/time explicitly without inventing a current state", async () => {
  const { page } = await open([
    subscription(1, []),
    subscription(2, [
      { kind: "future_internal_code", occurred_at: "not-a-date" },
    ]),
  ]);
  try {
    await page
      .getByRole("button", { name: "Membership activity (0)", exact: true })
      .click();
    await page
      .getByText("No membership activity is recorded.", { exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Membership activity (1)", exact: true })
      .click();
    await page
      .getByText(/Date unavailable · Unrecognized membership activity/)
      .waitFor();
    expect(await page.getByText(/future_internal_code/).count()).toBe(0);
    expect(
      await page
        .getByRole("region", { name: "Membership activity (1)" })
        .locator("time")
        .getAttribute("datetime"),
    ).toBeNull();
  } finally {
    await page.close();
  }
}, 60000);
it("does not display membership history when the existing patient-scoped read is denied", async () => {
  const { page, requests } = await open([subscription(1, events)], true);
  try {
    await page.getByText(/Synthetic patient scope denied/).waitFor();
    expect(
      await page.getByRole("button", { name: /Membership activity/ }).count(),
    ).toBe(0);
    expect(requests.some((r) => r.startsWith("POST"))).toBe(false);
  } finally {
    await page.close();
  }
}, 60000);
it("clears history after a fresh denied read and recovers only from a new authorized projection", async () => {
  const { page, requests } = await open([subscription(1, events)]);
  try {
    await page
      .getByRole("button", { name: "Membership activity (6)", exact: true })
      .click();
    let denied = true;
    await page.route(/\/api\/patient_portal\/subscriptions$/, (route) =>
      route.fulfill(
        denied
          ? {
              status: 403,
              json: { error: "Synthetic read revoked" },
            }
          : {
              json: {
                catalog: [],
                subscriptions: [subscription(2, [])],
                can_purchase: false,
              },
            },
      ),
    );
    await page.reload();
    await page.getByText(/Synthetic read revoked/).waitFor();
    expect(
      await page.getByRole("button", { name: /Membership activity/ }).count(),
    ).toBe(0);
    denied = false;
    await page.reload();
    await page
      .getByRole("button", { name: "Membership activity (0)", exact: true })
      .click();
    await page
      .getByText("No membership activity is recorded.", { exact: true })
      .waitFor();
    expect(await page.getByText(/Active access recorded/).count()).toBe(0);
    expect(requests.some((request) => !request.startsWith("GET"))).toBe(false);
  } finally {
    await page.close();
  }
}, 60000);
it("does not interpret prototype names as recognized activity or merge equal-time events", async () => {
  const { page } = await open([
    subscription(1, [
      { kind: "constructor", occurred_at: "2026-09-30T12:00:00Z" },
      { kind: "active", occurred_at: "2026-09-30T12:00:00Z" },
      { kind: "active", occurred_at: "2026-09-30T12:00:00Z" },
    ]),
  ]);
  try {
    await page
      .getByRole("button", { name: "Membership activity (3)", exact: true })
      .click();
    const history = page.getByRole("region", {
      name: "Membership activity (3)",
      exact: true,
    });
    expect(await history.getByRole("listitem").count()).toBe(3);
    expect(
      await history.getByText(/Unrecognized membership activity/).count(),
    ).toBe(1);
    expect(await history.getByText(/Active access recorded/).count()).toBe(2);
  } finally {
    await page.close();
  }
}, 60000);
