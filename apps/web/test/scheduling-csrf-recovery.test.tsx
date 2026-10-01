import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright-core";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
let server: ViteDevServer, browser: Browser, base: string;
beforeAll(async () => {
  const id = "\0scheduling-recovery-fixture.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "scheduling-recovery-fixture.tsx",
        enforce: "pre",
        resolveId(v, importer) {
          if (v === id) return id;
          if (importer?.endsWith("CareFlow.tsx") && v === "./Workspace")
            return "\0recovery-context";
          if (importer?.endsWith("CareFlow.tsx") && v === "./clinicNavigation")
            return "\0recovery-navigation";
        },
        load(v) {
          if (v === "\0recovery-context")
            return `export function useClinic(){return {capabilities:{patients:true},practice:{id:81},sites:[]};}`;
          if (v === "\0recovery-navigation")
            return `export function useClinicNavigation(){return {registerBlocker:()=>()=>{}};}`;
          if (v === id)
            return `import React from "react";import {createRoot} from "react-dom/client";import {BookingFormEditor} from "/src/features/clinic/CareFlow";
const params=new URL(location.href).searchParams;const kind=params.get("kind");const uncertain=params.get("uncertain")==="true";
const draft={patientId:"71",siteId:"101",roomId:"103",clinicianId:"105",visitTypeId:"107",startsAt:"2026-12-01T10:00",endsAt:"2026-12-01T10:30",reason:"Synthetic",repeat:kind==="series"?"weekly":"none",repeatIntervalWeeks:1,repeatCount:2,seriesResolutions:[],visitModality:"in_person"};
const body={patient_id:"71",site_id:"101",room_id:"103",booked_clinician_id:"105",clinician_id:"105",visit_type_id:"107",starts_at:"2026-12-01T10:00:00.000Z",ends_at:"2026-12-01T10:30:00.000Z",request_key:"synthetic-exact-attempt",occurrence_count:2};
const initial={draft,attempt:kind==="booking"?{body:{appointment:body}}:null,outcomeUnconfirmed:kind==="booking"&&uncertain,holdAttempt:kind==="hold"?{body:{hold:body}}:null,holdOutcomeUnconfirmed:kind==="hold"&&uncertain,seriesAttempt:kind==="series"?{body:{series:body}}:null,seriesOutcomeUnconfirmed:kind==="series"&&uncertain};window.saved=[];window.closeCount=0;
const workingDraft={updatedAt:null,status:"saved",save:async value=>{window.saved.push(JSON.parse(JSON.stringify(value)));return true;},clear:async()=>true};
createRoot(document.getElementById("root")).render(React.createElement(BookingFormEditor,{timezone:"UTC",initialPatientId:71,initialDraft:initial,workingDraft,onClose:()=>window.closeCount++,onReloadDraft:()=>{}}));`;
        },
        transform(code, id) {
          if (id.endsWith("/features/clinic/CareFlow.tsx"))
            return (
              (process.env.PATCH_BASELINE
                ? execFileSync(
                    "git",
                    [
                      "show",
                      "890dc7eb5507a5b9eee3d02c58c1fa36d350dfb6:apps/web/src/features/clinic/CareFlow.tsx",
                    ],
                    { encoding: "utf8" },
                  )
                : code) + "\nexport { BookingFormEditor };"
            );
        },
        configureServer(s) {
          s.middlewares.use("/fixture", async (_q, r) => {
            r.setHeader("Content-Type", "text/html");
            r.end(
              await s.transformIndexHtml(
                "/fixture",
                '<div id="root"></div><script type="module" src="/@id/__x00__scheduling-recovery-fixture.tsx"></script>',
              ),
            );
          });
        },
      },
    ],
  });
  await server.listen();
  const a = server.httpServer!.address();
  if (!a || typeof a === "string") throw Error("No port");
  base = `http://127.0.0.1:${a.port}`;
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
  });
}, 15000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});
it.each([
  ...["booking", "hold", "series"].map((kind) => [kind, 422] as const),
  ...["booking", "hold", "series"].map((kind) => [kind, 403] as const),
])(
  "preserves uncertain %s exact attempt through explicit %s denial",
  async (kind, status) => {
    const page = await browser.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(msg.text());
    });
    page.on("pageerror", (error) =>
      console.log("Fixture page error:", error.message),
    );
    page.setDefaultTimeout(5000);
    const writes: unknown[] = [];
    await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
      const req = route.request(),
        url = new URL(req.url());
      if (req.method() === "POST") {
        writes.push(req.postDataJSON());
        return route.fulfill({
          status,
          json: {
            error:
              status === 422
                ? "Your session expired. Please try again."
                : "Synthetic permission denied",
          },
        });
      }
      let data: unknown = {};
      if (url.pathname === "/api/csrf") data = { csrf_token: "synthetic" };
      else if (url.pathname === "/api/clinic/patients/lookup")
        data = {
          patients: [
            { id: 71, display_name: "Synthetic Patient", reference: "SYN" },
          ],
        };
      else if (url.pathname === "/api/clinic/clinicians")
        data = {
          clinicians: [
            { id: 105, display_name: "Synthetic Clinician", site_ids: [101] },
          ],
        };
      else if (url.pathname.includes("booking_options"))
        data = { data: { enabled: false, allowed_modalities: ["in_person"] } };
      else if (url.pathname.includes("service_offerings"))
        data = { service_offerings: [] };
      else if (url.pathname === "/api/clinic/facilities")
        data =
          url.searchParams.get("type") === "sites"
            ? { sites: [{ id: 101, code: "SYN", name: "Synthetic" }] }
            : url.searchParams.get("type") === "rooms"
              ? { rooms: [{ id: 103, site_id: 101, name: "Synthetic Room" }] }
              : { visit_types: [{ id: 107, name: "Synthetic Visit" }] };
      else if (url.pathname.includes("scheduling_policy"))
        data = {
          policy: { revision: 1, overbook_allowed: false },
          can_overbook: false,
          can_capacity_override: false,
        };
      else if (url.pathname.includes("appointments"))
        data = { appointments: [] };
      return route.fulfill({ json: data });
    });
    try {
      await page.goto(`${base}/fixture?kind=${kind}&uncertain=true`);
      await page
        .getByText("Synthetic Patient", { exact: true })
        .first()
        .waitFor();
      if (kind === "hold")
        await page.getByRole("button", { name: /Retry.*hold/i }).click();
      else
        await page
          .locator("form")
          .evaluate((form) =>
            form.dispatchEvent(
              new Event("submit", { bubbles: true, cancelable: true }),
            ),
          );
      await page
        .getByText(
          kind === "hold"
            ? "The hold outcome is unknown. Retry this exact hold request before booking or editing."
            : kind === "series"
              ? "The series outcome is unknown. Retry the same request before editing or leaving."
              : "The scheduling outcome is unknown. Retry this exact request before editing or leaving scheduling.",
          { exact: true },
        )
        .waitFor();
      const saved = await page.evaluate(() => (window as any).saved.at(-1));
      const field =
        kind === "booking"
          ? "attempt"
          : kind === "hold"
            ? "holdAttempt"
            : "seriesAttempt";
      const uncertainField =
        kind === "booking"
          ? "outcomeUnconfirmed"
          : kind === "hold"
            ? "holdOutcomeUnconfirmed"
            : "seriesOutcomeUnconfirmed";
      expect(saved[uncertainField]).toBe(true);
      expect(
        saved[field].body[kind === "booking" ? "appointment" : kind]
          .request_key,
      ).toBe("synthetic-exact-attempt");
      expect(writes).toHaveLength(1);
      expect(writes[0]).toEqual(saved[field].body);
      expect(
        await page
          .getByRole("button", { name: "Change patient", exact: true })
          .isDisabled(),
      ).toBe(true);
    } catch (error) {
      console.log("Fixture body:", await page.locator("body").innerText());
      throw error;
    } finally {
      await page.close();
    }
  },
  15000,
);
