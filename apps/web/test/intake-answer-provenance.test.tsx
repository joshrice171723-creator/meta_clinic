import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright-core";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  EncounterIntakeRevision,
  NurseWorkspace,
} from "../src/api/contracts";
import { IntakeAnswerProvenance } from "../src/features/clinic/IntakeAnswerProvenance";

export const savedIntake: EncounterIntakeRevision = {
  id: 100,
  patient_id: 12,
  encounter_id: 30,
  version: 4,
  status: "incomplete",
  identity_state: "not_confirmed",
  visit_reason_state: "not_recorded",
  history_state: "not_recorded",
  vitals_state: "not_recorded",
  observation_ids: [],
  history_review_ids: [],
  recorded_at: "2026-09-30T12:00:00Z",
  recorded_by_membership_id: 7,
  questionnaire: {
    text: "",
    status: "draft",
    form_id: "weight-management-initial-v1",
    questionnaire_version: 3,
    answers: {
      weight: {
        state: "answered",
        value: "80.125",
        unit: "kg",
        source: "home_measured",
      },
      symptoms: { state: "declined", value: "" },
    },
    items: {
      weight: {
        question: {
          id: "weight",
          label: "Weight when recorded",
          question_version: 2,
        },
        questionnaire_version: 2,
        original_response: {
          state: "answered",
          value: " 80.125 ",
          unit: "kg",
          source: "home_measured",
        },
        source: "staff_recorded",
        recorded_at: "2026-09-29T10:00:00Z",
        recorded_by_membership_id: 6,
        confirmation: "staff_confirmed",
        confirmed_at: "2026-09-30T11:00:00Z",
        supersedes_revision_id: 90,
      },
    },
  },
};

export const currentFields = [
  { id: "weight", label: "Current changed weight wording" },
  { id: "symptoms", label: "Current symptoms" },
];

function render(
  intake: EncounterIntakeRevision,
  patientId = 12,
  encounterId = 30,
  questionIds = ["weight", "symptoms"],
) {
  return renderToStaticMarkup(
    <IntakeAnswerProvenance
      intake={intake}
      patientId={patientId}
      encounterId={encounterId}
      fields={currentFields}
      questionIds={questionIds}
      scopeId="measurements"
    />,
  );
}

describe("saved intake answer source", () => {
  it("uses the recorded question and item-level source instead of current form or revision author", () => {
    const html = render(savedIntake);
    expect(html).toContain("Weight when recorded");
    expect(html).not.toContain("Current changed weight wording");
    expect(html).toContain("Question version 2");
    expect(html).toContain("Membership #6");
    expect(html).toContain("2026-09-29T10:00:00Z");
    expect(html).toContain("80.125");
    expect(html).toContain("kg");
    expect(html).toContain("Home measured");
    expect(html).toContain("Earlier intake record #90");
    expect(html).toContain("Staff confirmed");
    expect(html).toContain(
      "Confirmation records the answer; it does not record clinical review.",
    );
    expect(html).not.toContain("Clinically reviewed");
    expect(html).not.toMatch(/<input[^>]*type="number"/);
  });

  it("does not invent question snapshots, authors or confirmation for legacy answers", () => {
    const legacy = structuredClone(savedIntake);
    delete legacy.questionnaire!.items;
    legacy.questionnaire!.answers = { weight: { state: "unknown", value: "" } };
    const html = render(legacy);
    expect(html).toContain("Recorded question unavailable");
    expect(html).toContain("Current label: Current changed weight wording");
    expect(html).toContain("Answer source unavailable");
    expect(html).toContain("Confirmation unavailable");
    expect(html).toContain("Unknown");
    expect(html).not.toContain("Staff confirmed");
    expect(html).not.toContain("Membership #7");
  });

  it("fails closed for patient or encounter mismatches", () => {
    for (const [patientId, encounterId] of [
      [99, 30],
      [12, 99],
    ]) {
      const html = render(savedIntake, patientId, encounterId);
      expect(html).toContain(
        "Saved intake does not match the selected patient and encounter.",
      );
      expect(html).not.toContain("80.125");
      expect(html).not.toContain("Weight when recorded");
      expect(html).not.toContain("Membership #6");
    }
  });

  it("preserves zero and repeated dose details and escapes entered content", () => {
    const intake = structuredClone(savedIntake);
    intake.questionnaire!.answers.weight = {
      state: "answered",
      value: "0",
      unit: "kg",
    };
    expect(render(intake)).toMatch(/>0</);
    intake.questionnaire!.answers.medications = {
      state: "answered",
      value: "",
      entries: [
        {
          name: "Synthetic medicine",
          dose_value: "0.125",
          dose_unit: "mL",
          actual_use: "uncertain",
          details: "<script>unsafe()</script>",
        },
      ],
    };
    const html = render(intake, 12, 30, ["medications"]);
    expect(html).toContain("0.125");
    expect(html).toContain("mL");
    expect(html).toContain("uncertain");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("identifies a group without saved answers without claiming completion", () => {
    const intake = structuredClone(savedIntake);
    delete intake.questionnaire;
    const html = render(intake);
    expect(html).toContain("No saved questionnaire answers in this group.");
    expect(html).not.toContain("Staff confirmed");
  });
});

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
beforeAll(async () => {
  const virtualId = "\0intake-provenance-browser-entry.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "intake-provenance-browser-entry",
        enforce: "pre",
        resolveId(id, importer) {
          if (
            id === "./Workspace" &&
            /\/(NurseEncounterWorkspace|VitalSignsEntry|IntakeConsentEvidence|PatientCareCoordination)\.tsx$/.test(
              importer ?? "",
            )
          )
            return "\0nurse-provenance-clinic-context";
          if (id === virtualId) return virtualId;
        },
        load(id) {
          if (id === "\0nurse-provenance-clinic-context")
            return "export const useClinic = () => ({membership_id: 7});";
          if (id !== virtualId) return;
          return `import React, {useState} from "react";
          import {createRoot} from "react-dom/client";
          import {IntakeAnswerProvenance} from "/src/features/clinic/IntakeAnswerProvenance";
          import {NurseEncounterWorkspaceContent} from "/src/features/clinic/NurseEncounterWorkspace";
          function App() {
            const [fixture, replace] = useState(window.initialIntakeFixture);
            const [refreshError, setRefreshError] = useState("");
            window.replaceIntakeFixture = replace;
            if (fixture.workspace) return React.createElement(NurseEncounterWorkspaceContent, {
              patient: {id: 12, display_name: "Synthetic receipt patient"},
              encounter: {id: 30, patient_id: 12, site_id: 15, room_id: null,
                status: "open", visit_modality: "video"},
              observations: [], careSummary: null,
              roomsResource: {data: {rooms: []}, refresh: () => {}},
              resource: {data: fixture.workspace, error: refreshError,
                refresh: () => {window.refreshCount = (window.refreshCount || 0) + 1;
                  if (fixture.refreshFails) setRefreshError("Controlled refresh failure");}}
            });
            return React.createElement(IntakeAnswerProvenance, fixture);
          }
          createRoot(document.getElementById("root")).render(React.createElement(App));`;
        },
        configureServer(s) {
          s.middlewares.use("/intake-test", async (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end(
              await s.transformIndexHtml(
                "/intake-test",
                '<div id="root"></div><script type="module" src="/@id/__x00__intake-provenance-browser-entry.tsx"></script>',
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
    throw new Error("Missing browser test port");
  baseUrl = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    ...(process.env.BROWSER_EXECUTABLE_PATH
      ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH }
      : { channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" }),
    headless: true,
  });
}, 15000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

it("selects saved questions by keyboard and resets the disclosure on revision and context changes", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  page.setDefaultTimeout(5000);
  const errors: string[] = [];
  const apiReads: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      apiReads.push(request.url());
  });
  const fixture = {
    intake: savedIntake,
    patientId: 12,
    encounterId: 30,
    fields: currentFields,
    questionIds: ["weight", "symptoms"],
    scopeId: "measurements",
  };
  await page.addInitScript(
    (value) => Object.assign(window, { initialIntakeFixture: value }),
    fixture,
  );
  try {
    await page.goto(baseUrl + "/intake-test");
    const disclosure = page.getByRole("button", {
      name: "Inspect saved answer source",
    });
    await disclosure.focus();
    await page.keyboard.press("Enter");
    await page
      .getByRole("region", { name: "Selected saved answer source" })
      .waitFor();
    if (process.env.PROVENANCE_EVIDENCE_DIR) {
      await page.locator(".MuiCollapse-entered").waitFor();
      await mkdir(process.env.PROVENANCE_EVIDENCE_DIR, { recursive: true });
      await page.screenshot({
        path: join(
          process.env.PROVENANCE_EVIDENCE_DIR,
          "saved-answer-source-desktop.png",
        ),
        fullPage: true,
      });
    }
    const select = page.getByRole("combobox", { name: "Saved question" });
    await select.focus();
    await page.keyboard.press("ArrowDown");
    await page
      .getByRole("option", { name: "Current symptoms", exact: true })
      .click();
    const region = page.getByRole("region", {
      name: "Selected saved answer source",
    });
    await region.getByText("Declined", { exact: true }).waitFor();
    expect(await region.textContent()).not.toContain("80.125");
    expect(await region.textContent()).not.toContain("Staff confirmed");
    const revised = structuredClone(fixture);
    revised.intake.id = 101;
    revised.intake.version = 5;
    revised.intake.questionnaire!.answers.weight = {
      state: "answered",
      value: "81.000",
      unit: "kg",
    };
    revised.intake.questionnaire!.items!.weight.original_response = {
      state: "answered",
      value: "81.000",
      unit: "kg",
    };
    revised.intake.questionnaire!.items!.weight.supersedes_revision_id = 100;
    await page.evaluate(
      (value) =>
        (
          window as unknown as {
            replaceIntakeFixture: (fixture: unknown) => void;
          }
        ).replaceIntakeFixture(value),
      revised,
    );
    expect(await disclosure.getAttribute("aria-expanded")).toBe("false");
    await disclosure.click();
    await region.getByText("81.000", { exact: true }).first().waitFor();
    expect(await region.getByText("81.000", { exact: true }).count()).toBe(2);
    expect(await select.textContent()).toContain("Weight when recorded");
    await page.evaluate(
      (value) =>
        (
          window as unknown as {
            replaceIntakeFixture: (fixture: unknown) => void;
          }
        ).replaceIntakeFixture(value),
      { ...revised, patientId: 99 },
    );
    await page
      .getByText(
        "Saved intake does not match the selected patient and encounter.",
      )
      .waitFor();
    expect(await page.getByText("81.000", { exact: true }).count()).toBe(0);
    expect(apiReads).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}, 15000);

it.each([false, true])(
  "keeps acknowledged correction provenance when refresh fails=%s and retains the previous intake",
  async (refreshFails) => {
    const previous = structuredClone(savedIntake);
    previous.questionnaire!.answers = {
      visit_reason: { state: "answered", value: "Synthetic original answer" },
    };
    previous.questionnaire!.items = {
      visit_reason: {
        ...savedIntake.questionnaire!.items!.weight,
        question: {
          id: "visit_reason",
          label: "Recorded visit reason",
          question_version: 2,
        },
        original_response: {
          state: "answered",
          value: "Synthetic original answer",
        },
      },
    };
    previous.questionnaire!.questionnaire_version = 3;
    const receipt = structuredClone(previous);
    receipt.id = 101;
    receipt.version = 5;
    receipt.questionnaire!.answers.visit_reason = {
      state: "answered",
      value: "Synthetic corrected answer",
    };
    receipt.questionnaire!.items!.visit_reason = {
      ...receipt.questionnaire!.items!.visit_reason,
      original_response: {
        state: "answered",
        value: "Synthetic corrected answer",
      },
      source: "patient_reported",
      recorded_at: "2026-09-30T13:00:00Z",
      recorded_by_membership_id: 8,
      supersedes_revision_id: previous.id,
    };
    const workspace: NurseWorkspace = {
      schema_version: "nurse-workspace-v1",
      patient_id: 12,
      encounter_id: 30,
      intake: previous,
      handoff: null,
      tasks: [],
      capabilities: {
        intake_write: true,
        handoff_request: false,
        handoff_respond: false,
        tasks_write: false,
        observations_write: false,
      },
      questionnaire_form: {
        id: "weight-management-initial-v1",
        version: 3,
        fields: [
          {
            id: "visit_reason",
            label: "Current visit reason",
            reusable: false,
          },
        ],
        chunks: [
          {
            index: 0,
            id: "today_visit",
            label: "Today's visit",
            description: "Synthetic source correction",
            fields: ["visit_reason"],
          },
        ],
        answer_states: ["unanswered", "answered", "unknown", "declined"],
        provenance: ["patient_reported", "staff_recorded"],
        medication_options: [],
      },
    };
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    page.setDefaultTimeout(5000);
    const errors: string[] = [];
    const saves: Array<{
      intake: {
        expected_version: number;
        request_key: string;
        questionnaire: { answers: Record<string, { value: string }> };
      };
    }> = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.addInitScript(
      (value) => Object.assign(window, { initialIntakeFixture: value }),
      { workspace, refreshFails },
    );
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (!path.startsWith("/api/")) {
        await route.continue();
      } else if (path === "/api/csrf") {
        await route.fulfill({
          json: { csrf_token: "controlled-synthetic-csrf" },
        });
      } else if (
        path === "/api/clinic/patients/12/encounters/30/intake_revisions" &&
        request.method() === "POST"
      ) {
        saves.push(request.postDataJSON());
        await route.fulfill({ json: { intake: receipt } });
      } else {
        await route.fulfill({
          status: 404,
          json: { error: "Unexpected controlled request" },
        });
      }
    });
    try {
      await page.goto(baseUrl + "/intake-test");
      await page
        .getByText("Rooming & intake", { exact: true })
        .waitFor()
        .catch(() => {
          throw new Error(`Workspace did not render: ${errors.join("; ")}`);
        });
      const disclosure = page.getByRole("button", {
        name: "Inspect saved answer source",
      });
      await disclosure.click();
      const region = page.getByRole("region", {
        name: "Selected saved answer source",
      });
      await region
        .getByText("Synthetic original answer", { exact: true })
        .first()
        .waitFor();
      await page
        .getByRole("textbox", { name: "Current visit reason", exact: true })
        .fill("Synthetic corrected answer");
      await page
        .getByRole("button", { name: "Save draft", exact: true })
        .click();
      await page.getByText("Intake revision saved.", { exact: true }).waitFor();
      expect(saves).toHaveLength(1);
      expect(saves[0].intake.expected_version).toBe(4);
      expect(saves[0].intake.request_key).toBeTruthy();
      expect(saves[0].intake.questionnaire.answers.visit_reason.value).toBe(
        "Synthetic corrected answer",
      );
      expect(
        await page.evaluate(
          () => (window as unknown as { refreshCount: number }).refreshCount,
        ),
      ).toBe(1);
      // The old workspace response stays retained after either refresh outcome.
      expect(
        await page.evaluate(
          () =>
            (
              window as unknown as {
                initialIntakeFixture: { workspace: NurseWorkspace };
              }
            ).initialIntakeFixture.workspace.intake!.id,
        ),
      ).toBe(100);
      expect(await disclosure.getAttribute("aria-expanded")).toBe("false");
      await disclosure.click();
      await region
        .getByText("Synthetic corrected answer", { exact: true })
        .first()
        .waitFor();
      expect(
        await region
          .getByText("Synthetic corrected answer", { exact: true })
          .count(),
      ).toBe(2);
      expect(await region.textContent()).toContain("Membership #8");
      expect(await region.textContent()).toContain("2026-09-30T13:00:00Z");
      expect(await region.textContent()).toContain(
        "Earlier intake record #100",
      );
      expect(await region.textContent()).not.toContain(
        "Synthetic original answer",
      );
      expect(await region.textContent()).not.toContain("Membership #6");
      expect(await region.textContent()).not.toContain(
        "Earlier intake record #90",
      );
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  },
  15000,
);
