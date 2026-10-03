import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";

let server: ViteDevServer;
let browser: Browser;
let base: string;
beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "synthetic-invoice-recovery-fixture",
        resolveId: (id) =>
          id === "/simulator-entry.tsx" ? "\0simulator-fixture" : undefined,
        load(id) {
          if (id !== "\0simulator-fixture") return;
          return `import React,{useState} from "react";
        import {createRoot} from "react-dom/client";
        import {InvoiceCheckoutControls} from "/src/features/clinic/InvoiceCheckoutControls";
        function Fixture() {
          const [invoice,setInvoice]=useState(Number(new URL(location.href).searchParams.get("invoice")||77));
          window.switchInvoice=(id)=>{history.replaceState(null,"","?invoice="+id);setInvoice(id);};
          const payment={state:"available",eligible:true,reason:null,amount:invoice===77?"25.00":"40.00",currency:"USD",can_cancel:false,synthetic_collection:{enabled:true,eligible:true}};
          return React.createElement(InvoiceCheckoutControls,{key:invoice,invoiceId:invoice,patientId:301,endpoint:"/api/clinic/invoices/"+invoice+"/online_payment",onlinePayment:payment,actionLabel:"Collect online",onChanged:()=>{window.changed=(window.changed||0)+1;}});
        }
        createRoot(document.getElementById("root")).render(React.createElement(Fixture));`;
        },
        configureServer(vite) {
          vite.middlewares.use(
            "/simulator-fixture",
            async (_request, response) => {
              response.setHeader("Content-Type", "text/html");
              response.end(
                await vite.transformIndexHtml(
                  "/simulator-fixture",
                  '<div id="root"></div><script type="module" src="/simulator-entry.tsx"></script>',
                ),
              );
            },
          );
        },
      },
    ],
  });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === "string")
    throw new Error("No fixture port");
  base = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || "/usr/bin/chromium",
    headless: true,
  });
}, 20000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

type Draft = { version: number; payload: unknown };
type Attempt = {
  url: string;
  body: {
    online_payment: { request_key: string; amount: string; outcome: string };
  };
};
async function fixture(page: Page) {
  page.setDefaultTimeout(5000);
  const drafts = new Map<string, Draft>();
  const attempts: Attempt[] = [];
  const errors: string[] = [];
  let readFailure = false;
  let clearFailure = false;
  let malformed = false;
  let responseStatus = 408;
  let wait: Promise<void> | null = null;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(`${base}/api/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/csrf")
      return route.fulfill({
        json: { csrf_token: "synthetic-fixture-not-a-credential" },
      });
    if (url.pathname === "/api/clinic/working_drafts/checkout") {
      const key = url.searchParams.toString();
      const previous = drafts.get(key) || { version: 0, payload: null };
      let current = previous;
      if (request.method() === "GET" && readFailure)
        return route.fulfill({
          status: 503,
          json: { error: "Synthetic recovery unavailable" },
        });
      if (request.method() === "PUT") {
        const input = request.postDataJSON();
        if (input.payload === null && clearFailure)
          return route.fulfill({
            status: 403,
            json: { error: "Synthetic clear rejected" },
          });
        if (input.expected_version !== previous.version)
          return route.fulfill({
            status: 409,
            json: {
              error: "Synthetic version conflict",
              code: "draft_conflict",
            },
          });
        current = { version: previous.version + 1, payload: input.payload };
        drafts.set(key, current);
      }
      return route.fulfill({
        json: {
          kind: "checkout",
          patient_id: Number(url.searchParams.get("patient_id")),
          encounter_id: null,
          record_id: Number(url.searchParams.get("record_id")),
          scope: url.searchParams.get("scope"),
          updated_at: "2026-10-03T23:00:00Z",
          ...current,
          ...(malformed && url.searchParams.get("scope") === "synthetic_payment"
            ? {
                payload: {
                  invoiceId: 999,
                  endpoint: "/wrong",
                  attempt: {
                    request_key: "wrong",
                    amount: "1",
                    outcome: "succeeded",
                  },
                },
              }
            : {}),
        },
      });
    }
    if (url.pathname.endsWith("/simulate")) {
      attempts.push({ url: url.pathname, body: request.postDataJSON() });
      const status = responseStatus;
      const gate = wait;
      if (gate) await gate;
      return route.fulfill(
        status === 200
          ? {
              json: {
                simulation: { state: "succeeded", collection_intent_id: 91 },
              },
            }
          : {
              status,
              json: {
                error: "Synthetic uncertain response",
                ...(status === 409 ? { code: "outcome_unconfirmed" } : {}),
              },
            },
      );
    }
    throw new Error(
      `Unexpected fixture request ${request.method()} ${url.pathname}`,
    );
  });
  return {
    drafts,
    attempts,
    errors,
    setReadFailure: (value: boolean) => {
      readFailure = value;
    },
    setClearFailure: (value: boolean) => {
      clearFailure = value;
    },
    setMalformed: (value: boolean) => {
      malformed = value;
    },
    setStatus: (value: number) => {
      responseStatus = value;
    },
    setWait: (value: Promise<void> | null) => {
      wait = value;
    },
  };
}
async function approve(page: Page) {
  await page
    .getByRole("button", { name: "Simulate approved card", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Record simulated outcome", exact: true })
    .click();
}
async function switchInvoice(page: Page, invoice: number) {
  await page.evaluate(
    (id) =>
      (
        window as unknown as { switchInvoice: (id: number) => void }
      ).switchInvoice(id),
    invoice,
  );
}
const retry = (page: Page) =>
  page.getByRole("button", { name: "Retry same payment attempt", exact: true });

it("preserves the exact invoice-bound attempt through A→B→A and a full reload, with no automatic replay", async () => {
  const page = await browser.newPage();
  const f = await fixture(page);
  try {
    await page.goto(`${base}/simulator-fixture?invoice=77`);
    await approve(page);
    await retry(page).waitFor();
    await expect.poll(() => f.attempts.length).toBe(1);
    const original = structuredClone(f.attempts[0]);
    await switchInvoice(page, 88);
    await approve(page);
    await expect.poll(() => f.attempts.length).toBe(2);
    expect(f.attempts[1].body.online_payment.request_key).not.toBe(
      original.body.online_payment.request_key,
    );
    await switchInvoice(page, 77);
    await retry(page).waitFor();
    expect(
      await page
        .getByRole("button", { name: "Simulate approved card", exact: true })
        .count(),
    ).toBe(0);
    expect(await page.getByText(/unconfirmed outcome/).count()).toBe(1);
    expect(f.attempts.length).toBe(2);
    await page.reload();
    await retry(page).waitFor();
    expect(f.attempts.length).toBe(2);
    expect(
      await page
        .getByRole("button", { name: "Collect online", exact: true })
        .count(),
    ).toBe(0);
    f.setStatus(200);
    await retry(page).click();
    await expect.poll(() => f.attempts.length).toBe(3);
    expect(f.attempts[2]).toEqual(original);
    await page.getByText(/Simulated card payment recorded/).waitFor();
    expect(
      [...f.drafts.entries()].find(
        ([key]) =>
          key.includes("record_id=77") && key.includes("synthetic_payment"),
      )?.[1].payload,
    ).toBeNull();
    expect(f.errors).toEqual([]);
  } finally {
    await page.close();
  }
}, 20000);

it("retains an abandoned in-flight attempt without applying its late acknowledgement to another invoice", async () => {
  const page = await browser.newPage();
  const f = await fixture(page);
  let release!: () => void;
  try {
    f.setStatus(200);
    f.setWait(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    await page.goto(`${base}/simulator-fixture?invoice=77`);
    await approve(page);
    await expect.poll(() => f.attempts.length).toBe(1);
    const original = structuredClone(f.attempts[0]);
    await switchInvoice(page, 88);
    await page
      .getByRole("button", { name: "Simulate approved card", exact: true })
      .waitFor();
    const response = page.waitForResponse((r) =>
      r.url().endsWith("/77/online_payment/simulate"),
    );
    release();
    await (await response).finished();
    expect(
      await page.evaluate(
        () => (window as unknown as { changed?: number }).changed || 0,
      ),
    ).toBe(0);
    await switchInvoice(page, 77);
    await retry(page).waitFor();
    f.setWait(null);
    await retry(page).click();
    await page.getByText(/Simulated card payment recorded/).waitFor();
    expect(f.attempts[1]).toEqual(original);
    expect(f.errors).toEqual([]);
  } finally {
    release?.();
    await page.close();
  }
}, 20000);

it("blocks collection when recovery cannot load or its saved invoice identity does not match", async () => {
  const page = await browser.newPage();
  const f = await fixture(page);
  try {
    f.setReadFailure(true);
    await page.goto(`${base}/simulator-fixture?invoice=77`);
    await page.getByText("Synthetic recovery unavailable").waitFor();
    expect(
      await page
        .getByRole("button", { name: "Simulate approved card", exact: true })
        .isDisabled(),
    ).toBe(true);
    expect(f.attempts).toEqual([]);
    f.setReadFailure(false);
    f.setMalformed(true);
    await page.reload();
    await page.getByText(/saved payment attempt cannot be verified/).waitFor();
    expect(
      await page
        .getByRole("button", { name: "Simulate approved card", exact: true })
        .isDisabled(),
    ).toBe(true);
    expect(f.attempts).toEqual([]);
  } finally {
    await page.close();
  }
}, 15000);

it("does not enable a new intent when clearing a confirmed attempt fails", async () => {
  const page = await browser.newPage();
  const f = await fixture(page);
  try {
    f.setStatus(200);
    f.setClearFailure(true);
    await page.goto(`${base}/simulator-fixture?invoice=77`);
    await approve(page);
    await page.getByText(/recovery record could not be cleared/).waitFor();
    const original = structuredClone(f.attempts[0]);
    expect(
      await page
        .getByRole("button", { name: "Simulate approved card", exact: true })
        .count(),
    ).toBe(0);
    f.setClearFailure(false);
    await retry(page).click();
    await page.getByText(/Simulated card payment recorded/).waitFor();
    expect(f.attempts[1]).toEqual(original);
    expect(f.errors).toEqual([]);
  } finally {
    await page.close();
  }
}, 15000);

it("retains an explicit outcome_unconfirmed 409 for identical retry", async () => {
  const page = await browser.newPage();
  const f = await fixture(page);
  try {
    f.setStatus(409);
    await page.goto(`${base}/simulator-fixture?invoice=77`);
    await approve(page);
    await retry(page).waitFor();
    const original = structuredClone(f.attempts[0]);
    await page.reload();
    await retry(page).waitFor();
    f.setStatus(200);
    await retry(page).click();
    await page.getByText(/Simulated card payment recorded/).waitFor();
    expect(f.attempts[1]).toEqual(original);
  } finally {
    await page.close();
  }
}, 15000);
