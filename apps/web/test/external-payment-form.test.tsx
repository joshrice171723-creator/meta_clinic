import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Real payment form/MUI, controlled transport and independently synthetic money.
// This exercises no application database, processor, or live financial write.
let server: ViteDevServer;
let browser: Browser;
let base: string;
const modules: Record<string, string> = {
  "../../../api/client": `export class ApiError extends Error {constructor(status,message,code){super(message);this.status=status;this.code=code}}
    export async function api(path,options){const response=await fetch(path,{method:options.method,headers:{'Content-Type':'application/json'},body:JSON.stringify(options.body)});const body=await response.json();if(!response.ok)throw new ApiError(response.status,body.error,body.code);return body;}`,
};

beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "synthetic-external-payment",
        enforce: "pre",
        resolveId(id, importer) {
          if (id === "/qa-entry.tsx") return "\0qa-entry.tsx";
          if (
            importer?.includes("/src/features/clinic/billing/") &&
            id in modules
          )
            return `\0qa-mock:${encodeURIComponent(id)}`;
        },
        load(id) {
          if (id.startsWith("\0qa-mock:"))
            return modules[decodeURIComponent(id.slice(9))];
          if (id === "\0qa-entry.tsx")
            return `
          import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
          import {ExternalPaymentForm} from '/src/features/clinic/billing/ExternalPaymentForm';
          const invoice={id:705,status:'posted',currency:'USD',total:'25.00',allocated:'0',balance:'25.00',created_at:'2026-10-02T00:00:00Z'};
          function Fixture(){const [open,setOpen]=useState(false);const [pending,setPending]=useState(false);const [message,setMessage]=useState('');
            return <><button onClick={()=>setOpen(true)}>Open invoice</button><button disabled={pending} onClick={()=>setOpen(false)}>Close invoice</button>
            <button onClick={()=>{setOpen(false);setTimeout(()=>setOpen(true),30)}}>Refresh invoice</button>
            {open&&<ExternalPaymentForm clinic={{practice:{id:701},user_id:702,membership_id:703}} invoice={invoice} patientId={706} patientLabel="Synthetic receipt patient · SYN-706" disabled={new URLSearchParams(location.search).has('disabled')} onPendingChange={setPending} onRecorded={setMessage}/>}
            {message&&<p role="status">{message}</p>}</>}
          createRoot(document.getElementById('root')).render(<Fixture/>);`;
        },
        configureServer(vite) {
          vite.middlewares.use("/qa", async (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await vite.transformIndexHtml(
                "/qa",
                '<div id="root"></div><script type="module" src="/qa-entry.tsx"></script>',
              ),
            );
          });
        },
      },
    ],
  });
  await server.listen();
  base = server.resolvedUrls!.local[0];
  const executablePath =
    process.env.BROWSER_EXECUTABLE_PATH ||
    [
      "/usr/bin/chromium",
      "/usr/bin/google-chrome",
      chromium.executablePath(),
    ].find(existsSync);
  browser = await chromium.launch({
    executablePath,
    args: ["--no-sandbox"],
    headless: true,
  });
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

type Body = {
  payment: {
    external_event_reference: string;
    currency: string;
    amount: string;
    payment_amount: string;
  };
};
function acknowledgment(body: Body) {
  return {
    payment_allocation: {
      id: 708,
      invoice_id: 705,
      patient_id: 706,
      payment_event_id: 709,
      amount: body.payment.amount,
      payment_event: {
        id: 709,
        amount: body.payment.payment_amount,
        unapplied_amount: "0",
      },
    },
  };
}
async function fixture(
  outcomes: ("success" | "unknown" | "reject" | "mismatch")[] = ["success"],
  query = "",
) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  page.setDefaultTimeout(5000);
  const writes: Body[] = [];
  await page.route("**/api/**", async (route) => {
    expect(new URL(route.request().url()).pathname).toBe(
      "/api/clinic/invoices/705/payment_allocations",
    );
    expect(route.request().method()).toBe("POST");
    const body = route.request().postDataJSON() as Body;
    writes.push(body);
    const outcome = outcomes.shift() ?? "success";
    await route.fulfill({
      status: outcome === "unknown" ? 503 : outcome === "reject" ? 422 : 201,
      json:
        outcome === "unknown"
          ? { error: "Synthetic lost acknowledgment" }
          : outcome === "reject"
            ? { error: "Synthetic rejected allocation" }
            : outcome === "mismatch"
              ? {
                  payment_allocation: {
                    ...acknowledgment(body).payment_allocation,
                    patient_id: 999,
                  },
                }
              : acknowledgment(body),
    });
  });
  await page.goto(`${base}qa${query}`);
  return { page, writes };
}
const reference = (page: Page) =>
  page.getByRole("textbox", { name: "Event reference", exact: true });
const received = (page: Page) =>
  page.getByRole("textbox", { name: "Money received (USD)", exact: true });
const submit = (page: Page) =>
  page.getByRole("button", { name: "Record received payment", exact: true });

it("records a full-balance payment in three actions from the invoice list", async () => {
  const { page, writes } = await fixture();
  try {
    await page
      .getByRole("button", { name: "Open invoice", exact: true })
      .click();
    expect(await received(page).inputValue()).toBe("25.00");
    expect(
      await page
        .getByText(/Synthetic receipt patient.*Invoice #705.*USD/)
        .count(),
    ).toBe(1);
    await reference(page).fill("synthetic-bank-event-1");
    await submit(page).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]).toEqual({
      payment: {
        external_event_reference: "synthetic-bank-event-1",
        currency: "USD",
        amount: "25",
        payment_amount: "25.00",
      },
    });
    await page.getByRole("status").waitFor();
    expect(await page.getByRole("status").innerText()).toContain(
      "USD 25.00 applied",
    );
  } finally {
    await page.close();
  }
});

it("preserves partial, excess and explicit allocation as separate values", async () => {
  const { page, writes } = await fixture();
  try {
    await page
      .getByRole("button", { name: "Open invoice", exact: true })
      .click();
    await received(page).fill("10.125");
    expect(
      await page
        .getByText("Apply to invoice #705: USD 10.125", { exact: true })
        .count(),
    ).toBe(1);
    await received(page).fill("30");
    expect(
      await page
        .getByText("Money not applied here: USD 5.00", { exact: true })
        .count(),
    ).toBe(1);
    await page
      .getByRole("button", { name: "Adjust allocation", exact: true })
      .click();
    await page
      .getByRole("textbox", {
        name: "Apply to this invoice (USD)",
        exact: true,
      })
      .fill("10.125");
    expect(
      await page
        .getByText("Money not applied here: USD 19.875", { exact: true })
        .count(),
    ).toBe(1);
    await reference(page).fill("synthetic-bank-event-2");
    await submit(page).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0].payment).toMatchObject({
      amount: "10.125",
      payment_amount: "30",
    });
  } finally {
    await page.close();
  }
});

it("Cancel performs no write and closing/reopening retains the scoped draft", async () => {
  const { page, writes } = await fixture();
  try {
    await page
      .getByRole("button", { name: "Open invoice", exact: true })
      .click();
    await reference(page).fill("synthetic-unsaved-event");
    await received(page).fill("7");
    await page
      .getByRole("button", { name: "Close invoice", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Open invoice", exact: true })
      .click();
    expect(await reference(page).inputValue()).toBe("synthetic-unsaved-event");
    expect(await received(page).inputValue()).toBe("7");
    await page
      .getByRole("button", { name: "Cancel payment", exact: true })
      .click();
    expect(await reference(page).inputValue()).toBe("");
    expect(await received(page).inputValue()).toBe("25.00");
    expect(writes).toEqual([]);
  } finally {
    await page.close();
  }
});

it("keeps the exact intent locked across an unknown outcome, refresh, and later rejection", async () => {
  const { page, writes } = await fixture(["unknown", "reject", "success"]);
  try {
    await page
      .getByRole("button", { name: "Open invoice", exact: true })
      .click();
    await reference(page).fill("synthetic-unknown-event");
    await submit(page).dblclick();
    const retry = page.getByRole("button", {
      name: "Retry same payment",
      exact: true,
    });
    await retry.waitFor();
    expect(writes).toHaveLength(1);
    expect(await reference(page).isDisabled()).toBe(true);
    expect(
      await page
        .getByRole("button", { name: "Cancel payment", exact: true })
        .isDisabled(),
    ).toBe(true);
    expect(
      await page
        .getByRole("button", { name: "Close invoice", exact: true })
        .isDisabled(),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Refresh invoice", exact: true })
      .click();
    await retry.waitFor();
    await retry.click();
    await page.getByText(/Synthetic rejected allocation/).waitFor();
    expect(await reference(page).isDisabled()).toBe(true);
    await retry.click();
    await page.getByRole("status").waitFor();
    expect(writes).toHaveLength(3);
    expect(writes[1]).toEqual(writes[0]);
    expect(writes[2]).toEqual(writes[0]);
  } finally {
    await page.close();
  }
});

it("a mismatched acknowledgment stays unknown and an initial rejection retains editable fields", async () => {
  for (const outcome of ["mismatch", "reject"] as const) {
    const { page, writes } = await fixture([outcome]);
    try {
      await page
        .getByRole("button", { name: "Open invoice", exact: true })
        .click();
      await reference(page).fill(`synthetic-${outcome}-event`);
      await submit(page).click();
      await page.getByRole("alert").first().waitFor();
      await expect
        .poll(() => reference(page).isDisabled())
        .toBe(outcome === "mismatch");
      expect(await reference(page).inputValue()).toBe(
        `synthetic-${outcome}-event`,
      );
      expect(await page.getByRole("status").count()).toBe(0);
      expect(writes).toHaveLength(1);
    } finally {
      await page.close();
    }
  }
});

it("missing evidence, invalid amounts and disabled prerequisite never write", async () => {
  const { page, writes } = await fixture();
  try {
    await page
      .getByRole("button", { name: "Open invoice", exact: true })
      .click();
    expect(await submit(page).isDisabled()).toBe(true);
    await reference(page).fill("synthetic-invalid-event");
    for (const value of ["0", "-1", "1.1234567"]) {
      await received(page).fill(value);
      expect(await submit(page).isDisabled()).toBe(true);
    }
    expect(writes).toEqual([]);
  } finally {
    await page.close();
  }
  const gated = await fixture([], "?disabled");
  try {
    await gated.page
      .getByRole("button", { name: "Open invoice", exact: true })
      .click();
    expect(await reference(gated.page).isDisabled()).toBe(true);
    expect(await submit(gated.page).isDisabled()).toBe(true);
    expect(gated.writes).toEqual([]);
  } finally {
    await gated.page.close();
  }
});
