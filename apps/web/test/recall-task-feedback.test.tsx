import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright-core";
import { fileURLToPath } from "node:url";

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;

beforeAll(async () => {
  const virtualId = "\0recall-task-feedback.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "recall-task-feedback-fixture",
        enforce: "pre",
        resolveId(id, importer) {
          if (id === virtualId) return virtualId;
          if (importer?.endsWith("/RecallWorklist.tsx") && id === "./Workspace")
            return "\0recall-context";
          if (
            importer?.endsWith("/RecallWorklist.tsx") &&
            id === "../../shared/ui"
          )
            return "\0recall-resource";
        },
        transform(code, id) {
          if (id.endsWith("/WorkInbox.tsx"))
            return code + "\nexport { TaskActions };";
        },
        load(id) {
          if (id === "\0recall-context")
            return "export const useClinic=()=>({capabilities:{patients:true,encounters:true}});";
          if (id === "\0recall-resource")
            return 'export {LoadState} from "/src/shared/ui"; export const useResource=()=>({data:{summary:{due:Number(new URLSearchParams(location.search).get("due")||0),upcoming:0,snoozed:0},recalls:[]}});';
          if (id !== virtualId) return;
          return `import React from "react";
          import {createRoot} from "react-dom/client";
          import {RecallWorklist} from "/src/features/clinic/RecallWorklist";
          import {TaskActions} from "/src/features/clinic/WorkInbox";
          function App() {
            const [notice,setNotice]=React.useState("");
            return React.createElement(React.Fragment,null,
              React.createElement(RecallWorklist),
              React.createElement("p",{id:"receipt"},notice),
              !notice && React.createElement(TaskActions,{task:{id:81,version:2,state:"claimed",assigned_to_membership_id:9,dependency_ids:[],eligible_assignees:[]},actorMembershipId:9,availableTasks:[],onChanged:message=>setNotice(message)}));
          }
          createRoot(document.getElementById("root")).render(React.createElement(App));`;
        },
        configureServer(s) {
          s.middlewares.use("/feedback", async (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await s.transformIndexHtml(
                "/feedback",
                '<div id="root"></div><script type="module" src="/@id/__x00__recall-task-feedback.tsx"></script>',
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

it.each([0, 2])(
  "explains the existing recall creation path and due count %s",
  async (due) => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/feedback?due=${due}`);
    expect(
      await page
        .getByRole("link", {
          name: "Open patient register to record follow-up",
        })
        .getAttribute("href"),
    ).toBe("/clinic/patients");
    expect(await page.getByText(/To create a recall/).innerText()).toContain(
      "Needed with the clinician-entered plan and due date",
    );
    expect(
      await page
        .getByText(
          due
            ? "Next action: work due recalls first"
            : "No recalls are due now",
          { exact: true },
        )
        .count(),
    ).toBe(1);
    if (!due)
      expect(
        await page
          .getByText("Next action: work due recalls first", { exact: true })
          .count(),
      ).toBe(0);
    await page.close();
  },
);

it.each(["confirmed", "wrong-task", "failed"])(
  "acknowledges only the matching resolved task: %s",
  async (outcome) => {
    const page = await browser.newPage();
    await page.route("**/api/csrf", (route) =>
      route.fulfill({ json: { csrf_token: "synthetic" } }),
    );
    await page.route("**/api/clinic/clinical_tasks/81", async (route) => {
      const body = route.request().postDataJSON();
      expect(body.task.action).toBe("complete");
      expect(body.task.expected_version).toBe(2);
      expect(body.task.resolution_code).toBe("completed");
      expect(body.task.request_key).toBeTruthy();
      await route.fulfill(
        outcome === "failed"
          ? { status: 503, json: { error: "Synthetic unavailable" } }
          : {
              json: {
                task: {
                  id: outcome === "wrong-task" ? 82 : 81,
                  version: 3,
                  state: "completed",
                },
              },
            },
      );
    });
    await page.goto(`${baseUrl}/feedback`);
    await page.getByRole("button", { name: "Resolve", exact: true }).click();
    if (outcome === "confirmed") {
      await expect
        .poll(() => page.locator("#receipt").innerText())
        .toBe("Clinical task resolved.");
      expect(
        await page
          .getByRole("button", { name: "Resolve", exact: true })
          .count(),
      ).toBe(0);
    } else {
      await expect.poll(() => page.getByRole("alert").count()).toBe(1);
      expect(await page.locator("#receipt").innerText()).toBe("");
    }
    await page.close();
  },
);
