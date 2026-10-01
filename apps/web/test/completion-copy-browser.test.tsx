import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright-core";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

// Controlled local renderer: no identities, server writes, clinical decisions or live API.
let server: ViteDevServer, browser: Browser, baseUrl: string;
const ownership =
  "I reviewed the current owner or pool for every unfinished item. These tasks remain open after encounter completion.";
const explanation =
  "This records the completion review, ends the encounter, completes the linked appointment when applicable, and makes the visit eligible for checkout. Open tasks remain open with their recorded owner or pool.";
beforeAll(async () => {
  const virtualId = "\0completion-copy-entry";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "completion-copy-fixture",
        enforce: "pre",
        resolveId(id, importer) {
          if (id === virtualId) return virtualId;
          if (id === "./Workspace" && importer?.endsWith("/CareFlow.tsx"))
            return "\0completion-context";
          if (id === "../../shared/ui" && importer?.endsWith("/CareFlow.tsx"))
            return "\0completion-resource";
          if (
            id === "./EncounterFollowUp" &&
            importer?.endsWith("/CareFlow.tsx")
          )
            return "\0completion-followup";
        },
        load(id) {
          if (id === "\0completion-context")
            return 'export const useClinic=()=>({capabilities:{encounters:true},current_site:{id:17},practice:{timezone:"UTC"}});';
          if (id === "\0completion-followup")
            return "export const EncounterFollowUpPanel=()=>null;";
          if (id === "\0completion-resource")
            return `export * from "/src/shared/ui";
        export const useResource=()=>({data:{can_complete:true,evidence:{follow_up:{id:1,version:1,status:"recorded"},signed_instruction:null,education_events:[],open_tasks:[]},options:{disposition_codes:["completed_as_planned"],instructions_statuses:["not_required"],education_statuses:["not_required"]}},refresh:()=>{}});`;
          if (id !== virtualId) return;
          return `import React from "react";import {createRoot} from "react-dom/client";
        import {VisitWrapUp} from "/src/features/clinic/CareFlow";
        import "/src/shared/forms.css";import "/src/features/clinic/careFlow.css";
        createRoot(document.getElementById("root")).render(React.createElement(VisitWrapUp,{patient:{id:7,display_name:"Synthetic completion copy"},encounter:{id:9,patient_id:7,site_id:17,status:"open"},timezone:"UTC"}));`;
        },
        configureServer(s) {
          s.middlewares.use("/completion-copy", async (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await s.transformIndexHtml(
                "/completion-copy",
                '<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/@id/__x00__completion-copy-entry"></script>',
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
    throw new Error("No fixture port");
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
it.each([
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
])(
  "34/229 full visible accessible completion copy at $name",
  async (viewport) => {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
    });
    page.setDefaultTimeout(5000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let apiCalls = 0;
    await page.route("**/api/**", async (route) => {
      if (!new URL(route.request().url()).pathname.startsWith("/api/"))
        return route.continue();
      apiCalls++;
      await route.abort();
    });
    try {
      await page.goto(`${baseUrl}/completion-copy`);
      const checkbox = page.getByRole("checkbox", {
        name: ownership,
        exact: true,
      });
      await checkbox.waitFor().catch(async (error) => {
        throw new Error(
          `${error.message} Browser errors: ${errors.join(" | ")} Body: ${await page.locator("body").innerText()}`,
        );
      });
      await checkbox.scrollIntoViewIfNeeded();
      const metrics = await checkbox.evaluate((input) => {
        const label = input.closest("label")!,
          span = label.querySelector(".MuiFormControlLabel-label")!,
          style = getComputedStyle(span);
        return {
          text: span.textContent,
          overflow: span.scrollWidth > span.clientWidth,
          whiteSpace: style.whiteSpace,
          textOverflow: style.textOverflow,
        };
      });
      expect(metrics.text).toBe(ownership);
      expect(metrics.overflow).toBe(false);
      expect(metrics.whiteSpace).not.toBe("nowrap");
      expect(metrics.textOverflow).not.toBe("ellipsis");
      const output =
        process.env.META_CLINIC_TEST_OUTPUT_DIR ||
        fileURLToPath(
          new URL("../../../outputs/completion-copy-triage", import.meta.url),
        );
      await mkdir(output, { recursive: true });
      await page.screenshot({
        path: join(output, `${viewport.name}-ownership.png`),
        fullPage: true,
        animations: "disabled",
      });
      await page
        .getByRole("button", { name: "Complete encounter", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Complete encounter?",
        exact: true,
      });
      await dialog.waitFor();
      const text = dialog.getByText(explanation, { exact: true });
      expect(await text.isVisible()).toBe(true);
      expect(
        await text.evaluate((node) => node.scrollWidth > node.clientWidth),
      ).toBe(false);
      await dialog
        .getByRole("button", { name: "Confirm completion", exact: true })
        .click();
      const error = dialog.getByRole("alert");
      await error.waitFor();
      expect(await error.innerText()).toBe(
        "Choose the visit outcome, written-instruction status, and education status.",
      );
      expect(await dialog.isVisible()).toBe(true);
      expect(apiCalls).toBe(0);
      await page.screenshot({
        path: join(output, `${viewport.name}-confirmation.png`),
        fullPage: true,
        animations: "disabled",
      });
    } finally {
      await page.close();
    }
  },
  20000,
);
