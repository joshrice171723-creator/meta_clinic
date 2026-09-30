import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
let server: ViteDevServer, browser: Browser, base: string;
function capture(date = "2026-09-30") {
  const time = `${date}T12:00:00Z`;
  return {
    source_digest: "a".repeat(64),
    snapshot: {
      invoices: {
        date,
        timezone: "UTC",
        as_of: time,
        currencies: [
          {
            currency: "USD",
            posted_line_total: "100.01",
            current_outstanding_balance: "25.00",
          },
        ],
      },
      payments: {
        as_of: time,
        currencies: [
          { currency: "USD", payment_amount: "75.01", refund_amount: "0.00" },
        ],
      },
      drawers: {
        as_of: time,
        open_count: 1,
        awaiting_reconciliation_count: 0,
        variance_count: 0,
        carried_count: 1,
      },
      visits: {
        as_of: time,
        total: 1,
        timezone: "America/Chicago",
        counts: { scheduled: 1 },
      },
      reconciliation: {
        version: 1,
        site_id: 7,
        scope: "Different date cohorts; no equality inferred.",
        sources: {
          invoices: [
            { id: 10, patient_id: 3, currency: "USD", status: "posted" },
          ],
          payments: [
            { id: 20, patient_id: 3, currency: "USD", amount: "75.01" },
          ],
          refunds: [],
          drawers: [{ id: 30, status: "open", expected_cash: "75.01" }],
          carried_drawers: [],
          visits: [
            {
              id: 40,
              site_id: 7,
              patient_id: 3,
              status: date === "2026-09-30" ? "scheduled" : "cancelled",
            },
          ],
        },
      },
    },
  };
}
beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "synthetic-day-end",
        resolveId(source) {
          if (source === "/day-end-entry.js") return "\0day-end-entry";
        },
        load(id) {
          if (id === "\0day-end-entry")
            return `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {DayEndReconciliation} from '/src/features/clinic/DayEndReconciliation.tsx';function App(){const[date,setDate]=useState('2026-09-30');return React.createElement(React.Fragment,null,React.createElement('button',{onClick:()=>setDate(date==='2026-09-30'?'2026-09-29':'2026-09-30')},'Switch report date'),React.createElement(DayEndReconciliation,{date,siteId:7}));}createRoot(document.getElementById('root')).render(React.createElement(App))`;
        },
        configureServer(vite) {
          vite.middlewares.use((req, res, next) => {
            if (req.url?.startsWith("/day-end-test")) {
              res.setHeader("Content-Type", "text/html");
              res.end(
                '<div id="root"></div><script type="module" src="/day-end-entry.js"></script>',
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

type Input = {
  date: string;
  site_id: number;
  comparison_outcome: string;
  source_digest: string;
  request_key: string;
  review_note: string;
};
function receipt(input: Input) {
  return {
    id: 55,
    date: input.date,
    reviewed_at: "2026-09-30T18:00:00Z",
    reviewed_by: "synthetic@example.invalid",
    review_note: input.review_note,
    snapshot: {
      ...capture(input.date).snapshot,
      reconciliation: {
        ...capture(input.date).snapshot.reconciliation,
        outcome: input.comparison_outcome,
        source_digest: input.source_digest,
      },
    },
  };
}
async function open(
  mode: "success" | "unknown" | "changed" | "denied" = "success",
) {
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  const posts: Input[] = [];
  let saved: ReturnType<typeof receipt>[] = [];
  let reads = 0;
  await page.route(/^http:\/\/127\.0\.0\.1:\d+\/api\//, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/csrf")
      return route.fulfill({ json: { csrf_token: "synthetic-only" } });
    if (url.pathname.endsWith("/preview")) {
      reads++;
      return route.fulfill(
        mode === "denied"
          ? { status: 403, json: { error: "Synthetic permission denied" } }
          : { json: capture(url.searchParams.get("date")!) },
      );
    }
    if (
      url.pathname === "/api/clinic/day_end_reviews" &&
      route.request().method() === "GET"
    )
      return route.fulfill({
        json: {
          reviews: saved.filter(
            (row) => row.date === url.searchParams.get("date"),
          ),
        },
      });
    if (
      url.pathname === "/api/clinic/day_end_reviews" &&
      route.request().method() === "POST"
    ) {
      const input = route.request().postDataJSON().day_end_review as Input;
      posts.push(input);
      if (mode === "changed")
        return route.fulfill({
          status: 409,
          json: { error: "Source records changed", code: "source_changed" },
        });
      if (mode === "unknown" && posts.length === 1)
        return route.fulfill({
          status: 503,
          json: { error: "Synthetic save response lost" },
        });
      saved = [receipt(input)];
      return route.fulfill({ status: 201, json: { review: saved[0] } });
    }
    return route.abort();
  });
  await page.goto(`${base}day-end-test`);
  return { page, posts, reads: () => reads };
}
async function fill(page: Page) {
  await page.getByLabel("Comparison outcome").click();
  await page
    .getByRole("option", { name: "Follow-up required", exact: true })
    .click();
  await page
    .getByLabel("Comparison evidence or follow-up")
    .fill("Check the listed records locally.");
}
it("persists a complete source comparison with explicit outcome and renders its attributed receipt after reload", async () => {
  const { page, posts } = await open();
  await page
    .getByRole("button", { name: "invoices · 1 identified records" })
    .click();
  expect(
    await page
      .getByRole("link", { name: "Open current invoices #10" })
      .getAttribute("href"),
  ).toBe("/clinic/billing/patients?patient_id=3&invoice_id=10");
  expect(
    await page
      .getByRole("button", { name: "Save source reconciliation" })
      .isDisabled(),
  ).toBe(true);
  await fill(page);
  await page
    .getByRole("button", { name: "Save source reconciliation" })
    .click();
  await page
    .getByText(
      "Reconciliation #55 saved for 2026-09-30 by synthetic@example.invalid.",
    )
    .waitFor();
  expect(posts).toHaveLength(1);
  expect(posts[0].source_digest).toBe("a".repeat(64));
  expect(posts[0].comparison_outcome).toBe("follow_up_required");
  await page.reload();
  await page.getByRole("button", { name: /Reconciliation #55/ }).click();
  await page
    .getByText("Follow-up required: Check the listed records locally.")
    .waitFor();
  await page.close();
});
it("unknown save retains exact request and blocks retry from another date", async () => {
  const { page, posts } = await open("unknown");
  await fill(page);
  await page
    .getByRole("button", { name: "Save source reconciliation" })
    .click();
  await page
    .getByRole("button", { name: "Retry same reconciliation" })
    .waitFor();
  expect(
    await page.getByLabel("Comparison evidence or follow-up").isDisabled(),
  ).toBe(true);
  await page.getByRole("button", { name: "Switch report date" }).click();
  expect(
    await page
      .getByRole("button", { name: "Retry same reconciliation" })
      .isDisabled(),
  ).toBe(true);
  await page.getByRole("button", { name: "Switch report date" }).click();
  await page.getByRole("button", { name: "Retry same reconciliation" }).click();
  await page
    .getByText(
      "Reconciliation #55 saved for 2026-09-30 by synthetic@example.invalid.",
    )
    .waitFor();
  expect(posts).toHaveLength(2);
  expect(posts[1]).toEqual(posts[0]);
  await page.close();
});
it("changed-source rejection refreshes the comparison and cannot show a saved receipt", async () => {
  const { page, posts, reads } = await open("changed");
  await fill(page);
  await page
    .getByRole("button", { name: "Save source reconciliation" })
    .click();
  await page.getByText("Source records changed", { exact: true }).waitFor();
  expect(posts).toHaveLength(1);
  await expect.poll(reads).toBeGreaterThan(1);
  expect(await page.getByText(/Reconciliation #55 saved/).count()).toBe(0);
  expect(
    await page.getByLabel("Comparison evidence or follow-up").isDisabled(),
  ).toBe(false);
  await page.close();
});
it("denied preview cannot submit or display source rows", async () => {
  const { page, posts } = await open("denied");
  await page.getByText("Synthetic permission denied").waitFor();
  await fill(page);
  expect(
    await page
      .getByRole("button", { name: "Save source reconciliation" })
      .isDisabled(),
  ).toBe(true);
  expect(
    await page.getByRole("button", { name: /identified records/ }).count(),
  ).toBe(0);
  expect(posts).toHaveLength(0);
  await page.close();
});
it("late prior-date preview never replaces the new date's comparison", async () => {
  const { page } = await open();
  let release: () => void = () => {};
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  await page.route(/day_end_reviews\/preview/, async (route) => {
    const date = new URL(route.request().url()).searchParams.get("date")!;
    if (date === "2026-09-30") {
      entered();
      await delayed;
    }
    await route.fulfill({ json: capture(date) }).catch(() => {});
  });
  await page
    .getByRole("button", { name: "Refresh comparison sources" })
    .click();
  await started;
  await page.getByRole("button", { name: "Switch report date" }).click();
  await page
    .getByRole("button", { name: "visits · 1 identified records" })
    .click();
  await page.getByText(/status: cancelled/).waitFor();
  release();
  await page.waitForTimeout(100);
  expect(await page.getByText(/status: scheduled/).count()).toBe(0);
  await page.close();
});

it("late save receipt cannot announce success in a newer report context", async () => {
  const { page } = await open();
  let release: () => void = () => {};
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  await page.route(/day_end_reviews$/, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const input = route.request().postDataJSON().day_end_review as Input;
    entered();
    await delayed;
    await route
      .fulfill({ status: 201, json: { review: receipt(input) } })
      .catch(() => {});
  });
  await fill(page);
  await page
    .getByRole("button", { name: "Save source reconciliation" })
    .click();
  await started;
  await page.getByRole("button", { name: "Switch report date" }).click();
  const completed = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith("/day_end_reviews"),
  );
  release();
  await completed;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(await page.getByText(/Reconciliation #55 saved/).count()).toBe(0);
  expect(
    await page
      .getByRole("button", { name: "Retry same reconciliation" })
      .isDisabled(),
  ).toBe(true);
  await page.close();
});
