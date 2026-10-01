import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
const entry = "\0scheduling-original-111-fixture.tsx";
const mercer = {
  id: 801,
  display_name: "SYN_Mercer, Alex",
  reference: "SYN-111-801",
};
const vale = {
  id: 802,
  display_name: "SYN_Vale, Briar",
  reference: "SYN-111-802",
};
beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    cacheDir: fileURLToPath(
      new URL("../../../tmp/scheduling-original-111-cache", import.meta.url),
    ),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "scheduling-original-111-fixture",
        enforce: "pre",
        resolveId(id) {
          if (id === entry) return entry;
        },
        load(id) {
          if (id !== entry) return;
          return [
            'import React,{useState,useDeferredValue} from "react";',
            'import {createRoot} from "react-dom/client";',
            'import {BookingPatientPicker} from "/src/features/clinic/BookingPatientPicker";',
            'import {useResource} from "/src/shared/ui";',
            "function MountedPicker(){",
            'const [query,setQuery]=useState(""); const [selected,setSelected]=useState(); const [editing,setEditing]=useState(false);',
            "const deferred=useDeferredValue(query);",
            'const patients=useResource("/api/clinic/patients/lookup?q="+encodeURIComponent(deferred.trim())+"&per_page=25",{enabled:deferred.trim().length>0});',
            'return React.createElement(React.Fragment,null,React.createElement(BookingPatientPicker,{patient:selected,editing,query,results:patients.data?.patients??[],loading:Boolean(deferred.trim()&&!patients.data&&!patients.error),error:patients.error,disabled:false,canReviewPatient:false,onEditingChange:setEditing,onQueryChange:setQuery,onSelect:setSelected}),React.createElement("output",{"data-testid":"selected-patient-id"},selected?.id??""));',
            "}",
            'createRoot(document.getElementById("root")).render(React.createElement(MountedPicker));',
          ].join("\n");
        },
        configureServer(vite) {
          vite.middlewares.use((req, res, next) => {
            if (!req.url?.startsWith("/__scheduling_original_111_proof"))
              return next();
            res.setHeader("Content-Type", "text/html");
            res.end(
              '<!doctype html><html><body><div id="root"></div><script type="module" src="/@id/__x00__scheduling-original-111-fixture.tsx"></script></body></html>',
            );
          });
        },
      },
    ],
  });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === "string")
    throw new Error("No browser fixture port");
  baseUrl = "http://127.0.0.1:" + address.port;
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || "/usr/bin/chromium",
    headless: true,
  });
}, 20000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

async function routeApi(
  page: Page,
  lookup: (query: string) => Promise<unknown> | unknown,
  onFinished?: (query: string | null) => void,
) {
  const requests: { method: string; path: string; query: string | null }[] = [];
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      requests.push({
        method: request.method(),
        path: url.pathname,
        query: url.searchParams.get("q"),
      });
      if (request.method() !== "GET")
        throw new Error("Unexpected mutation in read-only browser proof");
      const body =
        url.pathname === "/api/csrf"
          ? { csrf_token: "synthetic-proof" }
          : url.pathname === "/api/clinic/patients/lookup"
            ? await lookup(url.searchParams.get("q") || "")
            : undefined;
      if (body === undefined)
        throw new Error("Unexpected API path: " + url.pathname);
      // The older search may already have been aborted by the actual useResource hook.
      await route
        .fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(body),
        })
        .catch((error) => {
          if (!request.failure()) throw error;
        });
      onFinished?.(url.searchParams.get("q"));
    },
  );
  return requests;
}

function diagnostic(page: Page) {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error")
      console.error("111 browser", message.text());
  });
  page.on("requestfailed", (request) =>
    console.error("111 request failed", request.url(), request.failure()),
  );
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      requests.push(request.url());
  });
  return async () =>
    console.error(
      "111 diagnostic",
      JSON.stringify({
        url: page.url(),
        errors,
        requests,
        body: (await page.locator("body").innerText({ timeout: 1_000 })).slice(
          0,
          4_000,
        ),
      }),
    );
}

it("#111 mounted picker preserves a multi-token server name match and selects its exact identity", async () => {
  const page = await browser.newPage();
  const report = diagnostic(page);
  try {
    const requests = await routeApi(page, (query) => ({
      patients: query === "Mercer Alex" ? [mercer] : [],
    }));
    await page.goto(baseUrl + "/__scheduling_original_111_proof");
    await page
      .getByRole("combobox", { name: "Find patient" })
      .fill("Mercer Alex");
    // The label contains punctuation between the terms. A second contiguous-label
    // filter would discard this valid result of the backend's normalized token search.
    await page.getByRole("option", { name: /SYN_Mercer, Alex/ }).waitFor();
    expect(requests.some((request) => request.query === "Mercer Alex")).toBe(
      true,
    );
    await page.getByRole("option", { name: /SYN_Mercer, Alex/ }).click();
    expect(await page.getByTestId("selected-patient-id").textContent()).toBe(
      "801",
    );
    expect(await page.locator("body").textContent()).toContain(
      "Clinic reference: SYN-111-801",
    );
  } catch (error) {
    await report();
    throw error;
  } finally {
    await page.close();
  }
}, 15000);

it("#111 mounted actual resource hook keeps the newer match when an older empty lookup finishes late", async () => {
  const page = await browser.newPage();
  const report = diagnostic(page);
  let releaseOlder!: () => void;
  let sawOlder!: () => void;
  let finishOlder!: () => void;
  const olderFinished = new Promise<void>((resolve) => {
    finishOlder = resolve;
  });
  const olderSeen = new Promise<void>((resolve) => {
    sawOlder = resolve;
  });
  const olderBody = new Promise<unknown>((resolve) => {
    releaseOlder = () => resolve({ patients: [] });
  });
  try {
    const requests = await routeApi(
      page,
      (query) => {
        if (query === "Mercer") {
          sawOlder();
          return olderBody;
        }
        return { patients: query === "Vale Briar" ? [vale] : [] };
      },
      (query) => {
        if (query === "Mercer") finishOlder();
      },
    );
    await page.goto(baseUrl + "/__scheduling_original_111_proof");
    const input = page.getByRole("combobox", { name: "Find patient" });
    await input.fill("Mercer");
    await olderSeen;
    await input.fill("Vale Briar");
    await page.getByRole("option", { name: /SYN_Vale, Briar/ }).waitFor();
    releaseOlder();
    await olderFinished;
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    expect(
      await page.getByRole("option", { name: /SYN_Vale, Briar/ }).count(),
    ).toBe(1);
    expect(
      await page.getByText("No matching patients.", { exact: true }).count(),
    ).toBe(0);
    expect(
      requests
        .filter((request) => request.path.endsWith("/lookup"))
        .map((request) => request.query),
    ).toEqual(["Mercer", "Vale Briar"]);
    await page.getByRole("option", { name: /SYN_Vale, Briar/ }).click();
    expect(await page.getByTestId("selected-patient-id").textContent()).toBe(
      "802",
    );
  } catch (error) {
    await report();
    throw error;
  } finally {
    releaseOlder?.();
    await page.close();
  }
}, 15000);
