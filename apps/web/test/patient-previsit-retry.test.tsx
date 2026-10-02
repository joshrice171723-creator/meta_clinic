import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page, type Route } from "playwright-core";
import { fileURLToPath } from "node:url";

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
const empty = { appointment_id: 42, note: null, can_edit: true };
function receipt(body: any, key = body.previsit_note.request_key) {
  const value = body.previsit_note;
  return {
    ...empty,
    note: {
      id: 17,
      version_number: value.expected_version + 1,
      request_key: key,
      status: value.status,
      text: value.text,
      additional_text: value.text,
      intake_answers: value.intake_answers,
      submitted_at: "2026-09-30T12:00:00Z",
    },
  };
}
beforeAll(async () => {
  const virtualId = "\0patient-retry.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "patient-retry-fixture",
        resolveId(id) {
          if (id === virtualId) return id;
        },
        load(id) {
          if (id === virtualId)
            return `import React from "react";import {createRoot} from "react-dom/client";
        import {PatientPrevisitNote} from "/src/features/patientPortal/PatientPrevisitNote";
        import {PrevisitNoteImport} from "/src/features/clinic/PrevisitNoteImport";
        const clinical=new URLSearchParams(location.search).get("mode")==="clinical";
        createRoot(document.getElementById("root")).render(clinical
          ? React.createElement(PrevisitNoteImport,{patientId:12,encounterId:30,subjective:"",disabled:false,onAppend:()=>{}})
          : React.createElement(PatientPrevisitNote,{appointmentId:42,appointmentLabel:"Synthetic appointment"}));`;
        },
        configureServer(s) {
          s.middlewares.use("/retry-test", async (_req, res) => {
            res.setHeader("Content-Type", "text/html");
            res.end(
              await s.transformIndexHtml(
                "/retry-test",
                '<div id="root"></div><script type="module" src="/@id/__x00__patient-retry.tsx"></script>',
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
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
      process.env.BROWSER_EXECUTABLE_PATH ||
      "/usr/bin/chromium",
    headless: true,
  });
}, 15000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});
async function open(page: Page) {
  page.setDefaultTimeout(5000);
  await page.route("**/api/csrf", (route) =>
    route.fulfill({
      json: { csrf_token: "synthetic-fixture-not-a-credential" },
    }),
  );
  await page.goto(`${baseUrl}/retry-test`);
  await page
    .getByRole("button", { name: "Complete intake / visit note" })
    .click();
  await page
    .getByRole("textbox", { name: "Anything else the clinic should know?" })
    .fill("Synthetic draft context");
}
const editor = (page: Page) =>
  page.getByRole("textbox", { name: "Anything else the clinic should know?" });

const navigationBlockers = (page: Page) =>
  page.evaluate(() => {
    const detail = { blocked: false, messages: [] as string[] };
    window.dispatchEvent(
      new CustomEvent("demo:collect-navigation-blockers", { detail }),
    );
    return detail;
  });

it("retries an unconfirmed draft with identical body/key after 408 and a later rejection", async () => {
  const page = await browser.newPage();
  const requests: any[] = [];
  await page.route("**/previsit_note", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: empty });
    const body = route.request().postDataJSON();
    requests.push(body);
    if (requests.length === 1)
      return route.fulfill({
        status: 408,
        json: { error: "Synthetic timeout" },
      });
    if (requests.length === 2)
      return route.fulfill({
        status: 422,
        json: { error: "Synthetic later rejection" },
      });
    return route.fulfill({ json: receipt(body) });
  });
  await open(page);
  expect(await navigationBlockers(page)).toEqual({
    blocked: false,
    messages: ["Discard your unsaved patient intake and visit note?"],
  });
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByText(/original save outcome is still unknown/).waitFor();
  expect((await navigationBlockers(page)).blocked).toBe(true);
  expect(await editor(page).isDisabled()).toBe(true);
  await page.getByRole("button", { name: "Retry same request" }).click();
  await expect.poll(() => requests.length).toBe(2);
  await expect
    .poll(() =>
      page.getByRole("button", { name: "Retry same request" }).isEnabled(),
    )
    .toBe(true);
  expect(await editor(page).isDisabled()).toBe(true);
  await page.getByRole("button", { name: "Retry same request" }).click();
  await page
    .getByText("Saved as a draft. Confirm when you are ready to send it.")
    .waitFor();
  expect(requests).toHaveLength(3);
  expect(requests[1]).toEqual(requests[0]);
  expect(requests[2]).toEqual(requests[0]);
  expect(requests[0].previsit_note).toMatchObject({
    status: "draft",
    attestation: false,
    expected_version: 0,
  });
  expect(await editor(page).isDisabled()).toBe(false);
  expect(await navigationBlockers(page)).toEqual({
    blocked: false,
    messages: [],
  });
  await page.close();
});

it("keeps uncertainty after a lost response and later stale rejection, then reconciles only the matching persisted receipt", async () => {
  const page = await browser.newPage();
  let captured: any;
  let gets = 0;
  let posts = 0;
  await page.route("**/previsit_note", async (route) => {
    if (route.request().method() === "GET") {
      gets++;
      return route.fulfill({
        json:
          gets === 1
            ? empty
            : receipt(
                captured,
                gets === 2
                  ? "other-request"
                  : captured.previsit_note.request_key,
              ),
      });
    }
    captured ??= route.request().postDataJSON();
    posts++;
    if (posts === 1) return route.abort("failed");
    expect(route.request().postDataJSON()).toEqual(captured);
    return route.fulfill({
      status: 409,
      json: { error: "Synthetic stale retry", code: "stale_record" },
    });
  });
  await open(page);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByText(/original save outcome is still unknown/).waitFor();
  await page.getByRole("button", { name: "Retry same request" }).click();
  await expect.poll(() => posts).toBe(2);
  await expect
    .poll(() =>
      page.getByRole("button", { name: "Check saved intake" }).isEnabled(),
    )
    .toBe(true);
  expect(
    await page.getByRole("button", { name: "Keep my draft" }).count(),
  ).toBe(0);
  await page.getByRole("button", { name: "Check saved intake" }).click();
  await page.getByText(/does not acknowledge the original request/).waitFor();
  expect(await editor(page).isDisabled()).toBe(true);
  await page.getByRole("button", { name: "Check saved intake" }).click();
  await page
    .getByText("Saved as a draft. Confirm when you are ready to send it.")
    .waitFor();
  expect(await editor(page).isDisabled()).toBe(false);
  expect(posts).toBe(2);
  await page.close();
});

it("rejects a success for the wrong key/version/status and retains the exact retry", async () => {
  const page = await browser.newPage();
  const requests: any[] = [];
  await page.route("**/previsit_note", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: empty });
    const body = route.request().postDataJSON();
    requests.push(body);
    const result = receipt(body);
    if (requests.length === 1) result.note.request_key = "another-request";
    if (requests.length === 2) result.note.version_number++;
    if (requests.length === 3) result.note.status = "submitted";
    return route.fulfill({ json: result });
  });
  await open(page);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  for (let count = 1; count <= 3; count++) {
    await expect.poll(() => requests.length).toBe(count);
    await expect
      .poll(() =>
        page.getByRole("button", { name: "Retry same request" }).isEnabled(),
      )
      .toBe(true);
    expect(await editor(page).isDisabled()).toBe(true);
    await page.getByRole("button", { name: "Retry same request" }).click();
  }
  await page
    .getByText("Saved as a draft. Confirm when you are ready to send it.")
    .waitFor();
  expect(requests).toHaveLength(4);
  for (const body of requests) expect(body).toEqual(requests[0]);
  await page.close();
});

it("preserves the existing local-draft choice after a definitive initial stale rejection", async () => {
  const page = await browser.newPage();
  let gets = 0;
  await page.route("**/previsit_note", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json:
          ++gets === 1
            ? empty
            : receipt({
                previsit_note: {
                  text: "Other saved context",
                  intake_answers: {},
                  status: "draft",
                  expected_version: 0,
                  request_key: "other",
                },
              }),
      });
    return route.fulfill({
      status: 409,
      json: { error: "Synthetic stale save", code: "stale_record" },
    });
  });
  await open(page);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect
    .poll(() => page.getByRole("button", { name: "Keep my draft" }).isEnabled())
    .toBe(true);
  expect(await editor(page).inputValue()).toBe("Synthetic draft context");
  await page.getByRole("button", { name: "Keep my draft" }).click();
  expect(await editor(page).inputValue()).toBe("Synthetic draft context");
  expect(await editor(page).isDisabled()).toBe(false);
  await page.close();
});

it("retains explicit unknown/declined answers and permits editing after a definitive initial rejection", async () => {
  const page = await browser.newPage();
  const sourceAnswers = {
    goals: { state: "unknown", value: "" },
    care_needs: { state: "declined", value: "" },
  };
  let captured: any;
  await page.route("**/previsit_note", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: receipt({
          previsit_note: {
            text: "Earlier context",
            intake_answers: sourceAnswers,
            status: "draft",
            expected_version: 1,
            request_key: "earlier",
          },
        }),
      });
    captured = route.request().postDataJSON();
    return route.fulfill({
      status: 422,
      json: { error: "Synthetic initial rejection" },
    });
  });
  await open(page);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page
    .getByText("Synthetic initial rejection", { exact: true })
    .waitFor();
  expect(captured.previsit_note.intake_answers).toEqual(sourceAnswers);
  expect(captured.previsit_note.expected_version).toBe(2);
  expect(await editor(page).inputValue()).toBe("Synthetic draft context");
  expect(await editor(page).isDisabled()).toBe(false);
  expect(
    await page.getByRole("button", { name: "Retry same request" }).count(),
  ).toBe(0);
  await page.close();
});

it("#197 resolves an empty clinical previsit read and shows the current note after reload", async () => {
  const page = await browser.newPage();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reads = 0;
  const methods: string[] = [];
  try {
    await page.route(
      "**/api/clinic/patients/12/encounters/30/previsit_note",
      async (route) => {
        methods.push(route.request().method());
        reads++;
        if (reads === 1) await gate;
        await route.fulfill({
          json: {
            patient_id: 12,
            encounter_id: 30,
            appointment_id: 42,
            note:
              reads === 1
                ? null
                : {
                    id: 17,
                    version_number: 1,
                    text: "Synthetic current previsit context",
                    status: "submitted",
                    attestation: {
                      id: "patient-intake",
                      version: "1",
                      accepted: true,
                    },
                    submitted_at: "2026-10-01T12:00:00Z",
                  },
          },
        });
      },
    );
    await page.route("**/api/csrf", (route) =>
      route.fulfill({
        json: { csrf_token: "synthetic-fixture-not-a-credential" },
      }),
    );
    await page.goto(`${baseUrl}/retry-test?mode=clinical`);
    const loading = page
      .getByRole("status")
      .filter({ hasText: "Checking for a pre-visit note…" });
    await loading.waitFor();
    release();
    await expect.poll(() => loading.count()).toBe(0);
    expect(await page.getByRole("alert").count()).toBe(0);
    expect(
      await page
        .getByRole("button", { name: "Review note", exact: true })
        .count(),
    ).toBe(0);
    await page.reload();
    await page
      .getByRole("heading", { name: "Before this visit", exact: true })
      .waitFor();
    expect(
      await page
        .getByText("Synthetic current previsit context", { exact: true })
        .isVisible(),
    ).toBe(true);
    expect(
      await page
        .getByText("Patient confirmed the intake for care-team review.", {
          exact: true,
        })
        .isVisible(),
    ).toBe(true);
    expect(await loading.count()).toBe(0);
    expect(methods).toEqual(["GET", "GET"]);
  } finally {
    release();
    await page.close();
  }
}, 20000);

it("#197 replaces a failed clinical previsit read with an actionable retry", async () => {
  const page = await browser.newPage();
  let reads = 0;
  try {
    await page.route(
      "**/api/clinic/patients/12/encounters/30/previsit_note",
      (route) => {
        expect(route.request().method()).toBe("GET");
        return ++reads === 1
          ? route.abort("failed")
          : route.fulfill({
              json: {
                patient_id: 12,
                encounter_id: 30,
                appointment_id: 42,
                note: null,
              },
            });
      },
    );
    await page.route("**/api/csrf", (route) =>
      route.fulfill({
        json: { csrf_token: "synthetic-fixture-not-a-credential" },
      }),
    );
    await page.goto(`${baseUrl}/retry-test?mode=clinical`);
    const error = page.getByText(
      "The patient's pre-visit note could not be loaded.",
      { exact: true },
    );
    await error.waitFor();
    expect(await page.getByRole("status").count()).toBe(0);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => reads).toBe(2);
    await expect.poll(() => error.count()).toBe(0);
    expect(await page.getByRole("status").count()).toBe(0);
  } finally {
    await page.close();
  }
}, 20000);

it("#197 resolves a stalled clinical previsit read at the actual transport deadline and retries", async () => {
  const page = await browser.newPage();
  let stalled: Route | undefined;
  let reads = 0;
  try {
    await page.clock.install();
    await page.route(
      "**/api/clinic/patients/12/encounters/30/previsit_note",
      (route) => {
        expect(route.request().method()).toBe("GET");
        reads++;
        if (reads === 1) {
          stalled = route;
          return;
        }
        return route.fulfill({
          json: {
            patient_id: 12,
            encounter_id: 30,
            appointment_id: 42,
            note: null,
          },
        });
      },
    );
    await page.route("**/api/csrf", (route) =>
      route.fulfill({
        json: { csrf_token: "synthetic-fixture-not-a-credential" },
      }),
    );
    await page.goto(`${baseUrl}/retry-test?mode=clinical`);
    await page
      .getByRole("status")
      .filter({ hasText: "Checking for a pre-visit note…" })
      .waitFor();
    await expect.poll(() => reads).toBe(1);
    await page.clock.runFor(30_001);
    const error = page.getByText(
      "The patient's pre-visit note could not be loaded.",
      { exact: true },
    );
    await error.waitFor();
    expect(await page.getByRole("status").count()).toBe(0);
    await stalled?.abort("failed").catch(() => undefined);
    stalled = undefined;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => reads).toBe(2);
    await expect.poll(() => error.count()).toBe(0);
    expect(await page.getByRole("status").count()).toBe(0);
  } finally {
    await stalled?.abort("failed").catch(() => undefined);
    await page.close();
  }
}, 20000);
