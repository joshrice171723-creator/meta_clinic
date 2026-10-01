import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright-core";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
vi.setConfig({ testTimeout: 20000 });
let server: ViteDevServer, browser: Browser, base: string;
const metadata = {
  performing_organization: "Synthetic performing lab",
  issuing_organization: "Synthetic issuing lab",
  method: "Synthetic original method",
  resulted_at: "2026-09-06T10:30:00.1200-05:00",
  received_at: "2026-09-06T16:15:00+00:00",
};
function version(
  results = [
    {
      name: "Synthetic measurement",
      value: "1.2500",
      value_kind: "numeric",
      unit: "mg/L",
      unit_code: "mg/L",
      code: null,
      reference_range: null,
      flag: null,
      ...metadata,
    },
  ],
) {
  return {
    id: 11,
    lab_report_id: 10,
    patient_id: 3,
    version_number: 1,
    title: "Synthetic report",
    status: "final",
    result_priority: "routine",
    collected_at: "2026-09-06T14:00:00Z",
    issued_at: "2026-09-06T16:00:00Z",
    results,
    entry_kind: "manual",
    content_digest: "a".repeat(64),
    recorded_at: "2026-09-06T18:00:00Z",
    recorded_by: 2,
    reviewed_at: null,
    reviewed_by: null,
    actions: [],
    follow_up: null,
  };
}
beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "synthetic-lab-provenance",
        enforce: "pre",
        resolveId(source, importer) {
          if (
            source === "./Workspace" &&
            importer?.includes("/features/clinic/")
          )
            return "\0synthetic-clinic";
          if (source === "/lab-entry.js") return "\0lab-entry";
        },
        load(id) {
          if (id === "\0synthetic-clinic")
            return `export const useClinic=()=>({capabilities:{patients:true,notes_read:true,notes_write:false,observations_write:true},practice:{id:2,name:'Synthetic clinic',timezone:'UTC'}});`;
          if (id === "\0lab-entry")
            return `import React from 'react';import {createRoot} from 'react-dom/client';import {PatientLabReports} from '/src/features/clinic/PatientLabReports.tsx';createRoot(document.getElementById('root')).render(React.createElement(PatientLabReports,{patientId:3,patientName:'Synthetic patient',encounterId:new URLSearchParams(location.search).has('create')?30:undefined}))`;
        },
        configureServer(vite) {
          vite.middlewares.use((req, res, next) => {
            if (req.url?.startsWith("/lab-test")) {
              res.setHeader("Content-Type", "text/html");
              res.end(
                '<div id="root"></div><script type="module" src="/lab-entry.js"></script>',
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

async function open(
  mode: "success" | "unknown" | "invalid" | "empty" = "success",
) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
  });
  page.setDefaultTimeout(8000);
  const first = version();
  if (mode === "empty")
    first.results = first.results.map((row) => {
      const copy = { ...row };
      Object.keys(metadata).forEach((key) => {
        delete (copy as Record<string, unknown>)[key];
      });
      return copy;
    });
  let current = first;
  const posts: Record<string, any>[] = [];
  const report = () => ({
    id: 10,
    patient_id: 3,
    site_id: 7,
    service_request_revision_id: 5,
    specimen: null,
    source_name: "Synthetic source report",
    external_report_id: "SYN-1",
    current_version_id: current.id,
    current_version: current,
    open_prior_follow_ups: [],
    created_at: "2026-09-06T18:00:00Z",
    updated_at: "2026-09-06T18:00:00Z",
    versions: current.id === first.id ? [first] : [first, current],
  });
  await page.route(/^http:\/\/127\.0\.0\.1:\d+\/api\//, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/csrf")
      return route.fulfill({ json: { csrf_token: "synthetic-only" } });
    if (url.pathname === "/api/clinic/patients/3/lab_reports")
      return route.fulfill({
        json: {
          reports: [report()],
          pagination: { page: 1, per_page: 25, total: 1 },
          can_write: true,
          can_review: false,
        },
      });
    if (url.pathname === "/api/clinic/patients/3/lab_reports/10")
      return route.fulfill({ json: { report: report() } });
    if (
      url.pathname === "/api/clinic/patients/3/lab_reports/10/versions" &&
      route.request().method() === "POST"
    ) {
      const input = route.request().postDataJSON().lab_report_version;
      posts.push(input);
      if (mode === "invalid")
        return route.fulfill({
          status: 422,
          json: {
            error: "Result time must be an ISO 8601 timestamp with an offset.",
          },
        });
      if (mode === "unknown" && posts.length === 1)
        return route.fulfill({
          status: 503,
          json: { error: "Synthetic response lost" },
        });
      current = { ...first, ...input, id: 12, version_number: 2 };
      return route.fulfill({ status: 201, json: { report: report() } });
    }
    return route.abort();
  });
  await page.goto(`${base}lab-test`);
  await page.getByRole("button", { name: "Correct", exact: true }).waitFor();
  return { page, posts };
}
it("current source display and correction preserve supplied organization, offset times, value and units", async () => {
  const { page, posts } = await open();
  await page
    .getByText(
      `Source performing organization: ${metadata.performing_organization}`,
      { exact: true },
    )
    .waitFor();
  await page
    .getByText(`Source result time: ${metadata.resulted_at}`, { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Correct", exact: true }).click();
  expect(
    await page
      .getByLabel("Source performing organization", { exact: true })
      .inputValue(),
  ).toBe(metadata.performing_organization);
  expect(
    await page.getByLabel("Source received time", { exact: true }).inputValue(),
  ).toBe(metadata.received_at);
  await page
    .getByLabel("Source method", { exact: true })
    .fill("Synthetic corrected method");
  await page
    .getByLabel("I confirmed this report belongs to the selected patient.")
    .check();
  await page
    .getByRole("button", { name: "Record correction", exact: true })
    .click();
  await page
    .getByText("Correction version recorded.", { exact: true })
    .waitFor();
  expect(posts).toHaveLength(1);
  expect(posts[0].results[0]).toMatchObject({
    ...metadata,
    method: "Synthetic corrected method",
    value: "1.2500",
    unit: "mg/L",
    unit_code: "mg/L",
  });
  await page
    .getByRole("button", { name: "Report history", exact: true })
    .click();
  await page
    .getByText(`Source method: ${metadata.method}`, { exact: true })
    .waitFor();
  await page
    .getByText("Source method: Synthetic corrected method", { exact: true })
    .first()
    .waitFor();
  await page.close();
});
it("absent source metadata stays absent and is never inferred from source name or report timestamps", async () => {
  const { page, posts } = await open("empty");
  expect(await page.getByText(/Source performing organization:/).count()).toBe(
    0,
  );
  expect(await page.getByText(/Source result time:/).count()).toBe(0);
  await page.getByRole("button", { name: "Correct", exact: true }).click();
  for (const label of [
    "Source performing organization",
    "Source issuing organization",
    "Source method",
    "Source result time",
    "Source received time",
  ])
    expect(await page.getByLabel(label, { exact: true }).inputValue()).toBe("");
  await page
    .getByLabel("I confirmed this report belongs to the selected patient.")
    .check();
  await page
    .getByRole("button", { name: "Record correction", exact: true })
    .click();
  await page
    .getByText("Correction version recorded.", { exact: true })
    .waitFor();
  for (const key of Object.keys(metadata))
    expect(posts[0].results[0][key]).toBeNull();
  await page.close();
});
it("explicit clearing affects only the new correction and retains the old version's supplied provenance", async () => {
  const { page, posts } = await open();
  await page.getByRole("button", { name: "Correct", exact: true }).click();
  await page
    .getByLabel("Source issuing organization", { exact: true })
    .fill("");
  await page.getByLabel("Source received time", { exact: true }).fill("");
  await page
    .getByLabel("I confirmed this report belongs to the selected patient.")
    .check();
  await page
    .getByRole("button", { name: "Record correction", exact: true })
    .click();
  await page
    .getByText("Correction version recorded.", { exact: true })
    .waitFor();
  expect(posts[0].results[0].issuing_organization).toBeNull();
  expect(posts[0].results[0].received_at).toBeNull();
  await page
    .getByRole("button", { name: "Report history", exact: true })
    .click();
  await page
    .getByText(
      `Source issuing organization: ${metadata.issuing_organization}`,
      { exact: true },
    )
    .waitFor();
  await page.close();
});
it("unknown correction response retries the exact metadata and request key without unlocking fields", async () => {
  const { page, posts } = await open("unknown");
  await page.getByRole("button", { name: "Correct", exact: true }).click();
  await page
    .getByLabel("I confirmed this report belongs to the selected patient.")
    .check();
  await page
    .getByRole("button", { name: "Record correction", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Retry unchanged report", exact: true })
    .waitFor();
  expect(
    await page.getByLabel("Source method", { exact: true }).isDisabled(),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Retry unchanged report", exact: true })
    .click();
  await page
    .getByText("Correction version recorded.", { exact: true })
    .waitFor();
  expect(posts).toHaveLength(2);
  expect(posts[1]).toEqual(posts[0]);
  await page.close();
});
it("rejected source time leaves supplied metadata editable and shows no success", async () => {
  const { page, posts } = await open("invalid");
  await page.getByRole("button", { name: "Correct", exact: true }).click();
  await page
    .getByLabel("Source result time", { exact: true })
    .fill("source time needs clarification");
  await page
    .getByLabel("I confirmed this report belongs to the selected patient.")
    .check();
  await page
    .getByRole("button", { name: "Record correction", exact: true })
    .click();
  await page
    .getByText("Result time must be an ISO 8601 timestamp with an offset.", {
      exact: true,
    })
    .waitFor();
  expect(posts).toHaveLength(1);
  expect(
    await page.getByLabel("Source result time", { exact: true }).inputValue(),
  ).toBe("source time needs clarification");
  expect(
    await page.getByLabel("Source method", { exact: true }).isDisabled(),
  ).toBe(false);
  expect(
    await page
      .getByText("Correction version recorded.", { exact: true })
      .count(),
  ).toBe(0);
  await page.close();
});


it("#175 creates an external result for an active lab order and retains its order and collected specimen on readback and reload", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
    timezoneId: "UTC",
  });
  page.setDefaultTimeout(8000);
  const reports: Record<string, any>[] = [];
  const posts: Record<string, any>[] = [];
  const unexpected: string[] = [];
  let reportReads = 0;
  let orderReads = 0;
  const order = {
    id: 175,
    patient_id: 3,
    encounter_id: 30,
    site_id: 7,
    request_kind: "lab",
    intent: "order",
    status: "active",
    priority: "routine",
    requested_display: "Synthetic active laboratory order",
    destination: "Synthetic external laboratory",
  };
  try {
    await page.route(/^http:\/\/127\.0\.0\.1:\d+\/api\//, async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      if (path === "/api/csrf" && method === "GET")
        return route.fulfill({ json: { csrf_token: "synthetic-only" } });
      if (
        path === "/api/clinic/patients/3/encounters/30/clinical_plan_workspace" &&
        method === "GET"
      ) {
        orderReads += 1;
        return route.fulfill({
          json: {
            patient_id: 3,
            encounter_id: 30,
            records: { service_requests: [order] },
          },
        });
      }
      if (path === "/api/clinic/patients/3/lab_reports" && method === "GET") {
        reportReads += 1;
        return route.fulfill({
          json: {
            reports,
            pagination: { page: 1, per_page: 25, total: reports.length },
            can_write: true,
            can_review: false,
          },
        });
      }
      if (path === "/api/clinic/patients/3/lab_reports" && method === "POST") {
        expect(request.headers()["x-csrf-token"]).toBe("synthetic-only");
        const input = request.postDataJSON().lab_report;
        posts.push(input);
        expect(input).toMatchObject({
          confirmed_patient: true,
          service_request_revision_id: order.id,
          source_name: "Synthetic external laboratory",
          external_report_id: "SYN-175-REPORT",
          specimen_identifier: "SYN-175-SPECIMEN",
          specimen_type_code: "synthetic-specimen",
          specimen_type_display: "Synthetic collected specimen",
          specimen_condition: "satisfactory",
          title: "Synthetic external result #175",
          collected_at: "2026-10-01T10:00:00.000Z",
          issued_at: "2026-10-01T11:00:00.000Z",
          results: [
            expect.objectContaining({
              name: "Synthetic laboratory measurement",
              value: "4.70",
            }),
          ],
        });
        expect(input.request_key).toMatch(/^[0-9a-f-]{36}$/);
        const currentVersion = {
          ...version(),
          ...input,
          id: 176,
          lab_report_id: 175,
          patient_id: 3,
          version_number: 1,
          recorded_at: "2026-10-01T12:00:00Z",
        };
        const report = {
          id: 175,
          patient_id: 3,
          site_id: 7,
          service_request_revision_id: input.service_request_revision_id,
          specimen: {
            id: 177,
            service_request_revision_id: input.service_request_revision_id,
            specimen_identifier: input.specimen_identifier,
            specimen_type_code: input.specimen_type_code,
            specimen_type_display: input.specimen_type_display,
            condition_code: input.specimen_condition,
            collected_at: input.collected_at,
            collected_by: 2,
          },
          source_name: input.source_name,
          external_report_id: input.external_report_id,
          current_version_id: currentVersion.id,
          current_version: currentVersion,
          open_prior_follow_ups: [],
          created_at: "2026-10-01T12:00:00Z",
          updated_at: "2026-10-01T12:00:00Z",
        };
        reports.push(report);
        return route.fulfill({ status: 201, json: { report } });
      }
      unexpected.push(method + " " + path);
      return route.abort();
    });
    await page.goto(base + "lab-test?create");
    await page
      .getByText("No lab reports are recorded for this patient.", { exact: true })
      .waitFor();
    const create = page.getByRole("button", { name: "New report", exact: true });
    await create.waitFor();
    expect(await create.isEnabled()).toBe(true);
    await create.click();
    await page
      .getByRole("combobox", { name: /^Authorized laboratory order(?:\s*\*)?$/ })
      .click();
    await page
      .getByRole("option", { name: /Synthetic active laboratory order/ })
      .click();
    await page.getByLabel(/^Source(?:\s*\*)?$/).fill("Synthetic external laboratory");
    await page.getByLabel("Accession or external ID", { exact: true }).fill("SYN-175-REPORT");
    await page.getByLabel(/^Title(?:\s*\*)?$/).fill("Synthetic external result #175");
    await page.getByLabel(/^Specimen type(?:\s*\*)?$/).fill("Synthetic collected specimen");
    await page.getByLabel(/^Specimen type code(?:\s*\*)?$/).fill("synthetic-specimen");
    await page.getByLabel("Specimen identifier", { exact: true }).fill("SYN-175-SPECIMEN");
    await page.getByLabel(/^Collected at(?:\s*\*)?$/).fill("2026-10-01T10:00");
    await page.getByLabel(/^Reported at(?:\s*\*)?$/).fill("2026-10-01T11:00");
    await page.getByLabel(/^Test(?:\s*\*)?$/).fill("Synthetic laboratory measurement");
    await page.getByLabel(/^Value(?:\s*\*)?$/).fill("4.70");
    await page
      .getByLabel("I confirmed this report belongs to the selected patient.")
      .check();
    await page.getByRole("button", { name: "Record report", exact: true }).click();
    await page.getByText("Lab report recorded.", { exact: true }).waitFor();
    await page
      .getByText("Synthetic external result #175", { exact: true })
      .waitFor();
    await page.getByText(/Synthetic laboratory measurement: 4.70/).waitFor();
    await page
      .getByText("Order #175 · Synthetic collected specimen · Satisfactory", {
        exact: true,
      })
      .waitFor();
    expect(posts).toHaveLength(1);
    expect(reports).toHaveLength(1);
    expect(reportReads).toBeGreaterThanOrEqual(2);
    expect(orderReads).toBeGreaterThanOrEqual(1);
    const readsBeforeReload = reportReads;
    await page.reload();
    await page
      .getByText("Synthetic external result #175", { exact: true })
      .waitFor();
    await page.getByText(/Synthetic laboratory measurement: 4.70/).waitFor();
    await page
      .getByText("Order #175 · Synthetic collected specimen · Satisfactory", {
        exact: true,
      })
      .waitFor();
    expect(reportReads).toBeGreaterThan(readsBeforeReload);
    expect(posts).toHaveLength(1);
    expect(reports[0].service_request_revision_id).toBe(order.id);
    expect(reports[0].specimen).toMatchObject({
      service_request_revision_id: order.id,
      specimen_identifier: "SYN-175-SPECIMEN",
      collected_at: "2026-10-01T10:00:00.000Z",
    });
    expect(unexpected).toEqual([]);
  } finally {
    await page.close();
  }
});
