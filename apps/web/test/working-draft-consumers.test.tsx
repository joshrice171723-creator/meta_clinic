import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright-core";
import { fileURLToPath } from "node:url";

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;

beforeAll(async () => {
  const virtualId = "\0working-draft-consumers.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "working-draft-consumers-fixture",
        resolveId: (id) => (id === virtualId ? virtualId : undefined),
        load(id) {
          if (id !== virtualId) return;
          return `import React from "react";
          import {createRoot} from "react-dom/client";
          import {useWorkingDraft} from "/src/features/clinic/useWorkingDraft";
          const kind=new URLSearchParams(location.search).get("kind");
          const config=kind==="registration"?{kind}:kind==="appointment"?{kind,patientId:12}:{kind,patientId:12,encounterId:30};
          function App() {
            const draft=useWorkingDraft(config);
            const [text,setText]=React.useState("Synthetic unsent edit");
            const [result,setResult]=React.useState("unrequested");
            const initial=React.useRef(null);
            if(draft.ready && !initial.current) initial.current=draft.restored;
            const save=(value)=>{setResult("pending");void draft.save(value).then(value=>setResult(String(value)));};
            return React.createElement(React.Fragment,null,
              React.createElement("textarea",{"aria-label":"Unsent edit",value:text,onChange:e=>setText(e.target.value)}),
              React.createElement("button",{disabled:!draft.ready,onClick:()=>save(initial.current)},"Retry exact snapshot"),
              React.createElement("button",{disabled:!draft.ready,onClick:()=>save({...initial.current,unsent_edit:text})},"Save replacement"),
              React.createElement("button",{disabled:!draft.ready,onClick:()=>{setResult("pending");void draft.clear().then(value=>setResult(String(value)));}},"Clear copy"),
              React.createElement("p",{id:"restored"},JSON.stringify(draft.restored)),
              React.createElement("p",{id:"result"},result),
              React.createElement("p",{id:"status"},draft.status));
          }
          createRoot(document.getElementById("root")).render(React.createElement(App));`;
        },
        configureServer(s) {
          s.middlewares.use("/draft-consumers", async (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await s.transformIndexHtml(
                "/draft-consumers",
                '<div id="root"></div><script type="module" src="/@id/__x00__working-draft-consumers.tsx"></script>',
              ),
            );
          });
        },
      },
    ],
  });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === "string")
    throw new Error("Missing fixture port");
  baseUrl = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || "/usr/bin/chromium",
    headless: true,
  });
}, 15000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

// Exercise the real shared hook at each consumer's endpoint and with its
// opaque operation identity. These are transport-contract tests, not complete
// registration/booking/clinical mutation workflows.
const consumers = [
  {
    kind: "registration",
    patient: null,
    encounter: null,
    payload: {
      body: {
        clinic_patient: {
          display_name: "Synthetic Patient",
          request_key: "synthetic-registration-exact",
        },
      },
      requestKey: "synthetic-registration-exact",
      pending: true,
      outcomeUnconfirmed: true,
    },
  },
  {
    kind: "appointment",
    patient: 12,
    encounter: null,
    payload: {
      draft: { patientId: "12", reason: "Synthetic booking" },
      attempt: {
        body: {
          appointment: {
            patient_id: "12",
            request_key: "synthetic-booking-exact",
          },
        },
      },
      outcomeUnconfirmed: true,
    },
  },
  {
    kind: "soap",
    patient: 12,
    encounter: 30,
    payload: {
      schema_version: 1,
      patient_id: 12,
      encounter_id: 30,
      sections: {
        subjective: "Synthetic note",
        objective: "",
        assessment: "",
        plan: "",
      },
      pending_attempt: {
        requestKey: "synthetic-note-exact",
        body: { note: { request_key: "synthetic-note-exact" } },
      },
    },
  },
];

for (const consumer of consumers) {
  it.each(["replace", "clear", "retry", "conflict", "rejected", "wrong-owner"])(
    `${consumer.kind} preserves recovered identity and unsent edits after uncertain save: %s`,
    async (mode) => {
      const page = await browser.newPage();
      let version = 4;
      let payload: unknown = consumer.payload;
      const puts: Array<{ expected_version: number; payload: unknown }> = [];
      const unexpected: string[] = [];
      let releaseReplacement: (() => void) | undefined;
      const replacementGate = new Promise<void>((resolve) => {
        releaseReplacement = resolve;
      });
      await page.route("**/api/**", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (!url.pathname.startsWith("/api/")) {
          await route.continue();
          return;
        }
        if (url.pathname === "/api/csrf") {
          await route.fulfill({ json: { csrf_token: "synthetic-csrf" } });
          return;
        }
        if (url.pathname !== `/api/clinic/working_drafts/${consumer.kind}`) {
          unexpected.push(`${request.method()} ${url.pathname}`);
          await route.abort();
          return;
        }
        expect(url.searchParams.get("patient_id")).toBe(
          consumer.patient == null ? null : String(consumer.patient),
        );
        expect(url.searchParams.get("encounter_id")).toBe(
          consumer.encounter == null ? null : String(consumer.encounter),
        );
        if (request.method() === "PUT") {
          const body = request.postDataJSON();
          puts.push(body);
          if (puts.length === 1) {
            expect(body).toEqual({
              expected_version: 4,
              payload: consumer.payload,
            });
            version = 5;
            payload = body.payload;
            await route.abort("failed"); // committed, response lost
            return;
          }
          await replacementGate;
          if (mode === "rejected") {
            await route.fulfill({
              status: 503,
              json: { error: "Synthetic unavailable" },
            });
            return;
          }
          if (mode === "retry") {
            // Exact retry preserves the original expected version and payload.
            expect(body).toEqual(puts[0]);
          } else {
            expect(body.expected_version).toBe(5);
            version = 6;
            payload = body.payload;
          }
        } else if (puts.length === 1 && mode === "conflict") {
          payload = { other_window: "Synthetic competing edit" };
        }
        await route.fulfill({
          json: {
            kind: consumer.kind,
            patient_id:
              mode === "wrong-owner" && puts.length === 1
                ? 999
                : consumer.patient,
            encounter_id: consumer.encounter,
            record_id: null,
            scope: "main",
            version,
            payload,
            updated_at: null,
          },
        });
      });
      await page.goto(`${baseUrl}/draft-consumers?kind=${consumer.kind}`);
      await expect
        .poll(() => page.locator("#restored").innerText())
        .toBe(JSON.stringify(consumer.payload));
      await page.getByRole("button", { name: "Retry exact snapshot" }).click();
      await expect
        .poll(() => page.locator("#result").innerText())
        .toBe("false");
      expect(await page.locator("#status").innerText()).toBe("error");
      await page
        .getByRole("textbox", { name: "Unsent edit" })
        .fill("Synthetic changed after unknown save");
      await page
        .getByRole("button", {
          name:
            mode === "clear"
              ? "Clear copy"
              : mode === "retry"
                ? "Retry exact snapshot"
                : "Save replacement",
        })
        .click();
      if (mode !== "conflict" && mode !== "wrong-owner") {
        await expect.poll(() => puts.length).toBe(2);
        expect(await page.locator("#result").innerText()).toBe("pending");
        expect(await page.locator("#status").innerText()).toBe("saving");
        expect(payload).toEqual(consumer.payload); // older commit cannot acknowledge this operation
        releaseReplacement!();
      }
      const rejected = ["conflict", "rejected", "wrong-owner"].includes(mode);
      await expect
        .poll(() => page.locator("#result").innerText())
        .toBe(String(!rejected));
      expect(await page.locator("#status").innerText()).toBe(
        mode === "conflict" ? "conflict" : rejected ? "error" : "saved",
      );
      expect(
        await page.getByRole("textbox", { name: "Unsent edit" }).inputValue(),
      ).toBe("Synthetic changed after unknown save");
      if (mode === "replace")
        expect(payload).toEqual({
          ...consumer.payload,
          unsent_edit: "Synthetic changed after unknown save",
        });
      if (mode === "clear") expect(payload).toBeNull();
      if (["retry", "rejected", "wrong-owner"].includes(mode))
        expect(payload).toEqual(consumer.payload);
      if (mode === "conflict") {
        expect(payload).toEqual({ other_window: "Synthetic competing edit" });
        await page.getByRole("button", { name: "Clear copy" }).click();
        expect(await page.locator("#status").innerText()).toBe("conflict");
      }
      expect(puts).toHaveLength(
        mode === "conflict" || mode === "wrong-owner" ? 1 : 2,
      );
      expect(unexpected).toEqual([]); // hook never replays an official mutation
      await page.close();
    },
    15000,
  );
}
