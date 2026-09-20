#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(webRoot, "../..");
const baseUrl = new URL(
  process.env.GUIDED_DEMO_BASE_URL || "http://127.0.0.1:3230",
);
const outputDirectory = resolve(repoRoot, "outputs/guided-demo-audit");
const reportPath = resolve(outputDirectory, "latest.json");

if (
  baseUrl.protocol !== "http:" ||
  !["127.0.0.1", "localhost"].includes(baseUrl.hostname)
) {
  throw new Error("GUIDED_DEMO_BASE_URL must be loopback HTTP.");
}

const expectedSignals = {
  "Review telehealth": /Virtual waiting room[\s\S]*Alex Morgan/i,
  "Review workforce": /Current employees[\s\S]*Jordan Example/i,
  "Review growth": /Membership pipeline/i,
};

const browser = await chromium.launch({
  channel:
    process.env.PLAYWRIGHT_CHANNEL ||
    (process.platform === "win32" ? "msedge" : "chrome"),
  headless: true,
});

const report = { base_url: baseUrl.href, lessons: [], failures: [] };
let expectedLessonCount = 0;
const saveReport = () => {
  report.summary = {
    lessons: report.lessons.length,
    failures: report.failures.length,
    passed:
      expectedLessonCount > 0 &&
      report.lessons.length === expectedLessonCount &&
      report.failures.length === 0,
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
};

try {
  mkdirSync(outputDirectory, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  await page.goto(new URL("/demo", baseUrl).href, {
    waitUntil: "domcontentloaded",
  });
  await page.locator("main").waitFor({ state: "visible", timeout: 45000 });
  await page
    .getByRole("heading", { name: "Your details", exact: true })
    .waitFor({ state: "visible", timeout: 45000 });
  await page.getByLabel(/Name/).fill("Guided demo audit");
  await page.getByLabel(/Email/).fill("guided-demo-audit@example.test");
  await page.getByLabel(/Company/).fill("Meta Clinic audit");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .locator('button[aria-label^="Open "]')
    .first()
    .waitFor({ state: "visible", timeout: 45000 });

  const lessonTitles = await page
    .locator('button[aria-label^="Open "]')
    .evaluateAll((buttons) =>
      buttons
        .map((button) =>
          button.getAttribute("aria-label")?.replace(/^Open /, ""),
        )
        .filter(Boolean),
    );
  if (lessonTitles.length < 45) {
    throw new Error(
      `Expected at least 45 lesson cards, found ${lessonTitles.length}.`,
    );
  }
  expectedLessonCount = lessonTitles.length;

  for (const [index, title] of lessonTitles.entries()) {
    browserErrors.length = 0;
    const screenshot = resolve(
      outputDirectory,
      `${String(index + 1).padStart(2, "0")}-${title
        .replaceAll(/[^a-z0-9]+/gi, "-")
        .replaceAll(/^-|-$/g, "")
        .toLowerCase()}.png`,
    );
    try {
      const openButton = page.getByRole("button", {
        name: `Open ${title}`,
        exact: true,
      });
      await openButton.scrollIntoViewIfNeeded();
      await openButton.click();
      await page
        .getByRole("heading", { name: title, exact: true })
        .waitFor({ state: "visible", timeout: 45000 });
      const guide = page.locator("[data-demo-guide]");
      await guide.waitFor({ state: "visible", timeout: 45000 });
      const guideText = (await guide.innerText()).replace(/\s+/g, " ").trim();
      const completeGuide =
        /Lesson guide/.test(guideText) &&
        /Before you start:/.test(guideText) &&
        /Done when:/.test(guideText);
      const frameElement = page.locator('iframe[name="clinic-demo-workspace"]');
      await frameElement.waitFor({ state: "visible", timeout: 45000 });
      const frame = page
        .frames()
        .find(
          (candidate) =>
            candidate !== page.mainFrame() &&
            candidate.url().includes("demo_step="),
        );
      if (!frame) throw new Error(`${title}: workspace frame was unavailable.`);
      const workspace = frame.locator(".clinic-main, #main, main").first();
      await workspace.waitFor({ state: "visible", timeout: 45000 });
      const workspaceHeading = workspace.locator("h1, h2").first();
      await workspaceHeading.waitFor({ state: "visible", timeout: 45000 });

      const expected = expectedSignals[title];
      if (expected)
        await frame
          .getByText(expected)
          .waitFor({ state: "visible", timeout: 45000 });
      const mainText = (await workspace.innerText())
        .replace(/\s+/g, " ")
        .trim();
      const tutorialVisible =
        (await frame.locator("[data-demo-coach]").count()) > 0;
      const tutorialExpected = title !== "Tour the clinic workspace";
      const expectedPrepared = !expected || expected.test(mainText);
      const explicitFailure =
        /This lesson could not be loaded|Unable to load|Unexpected error|Try again/i.test(
          mainText,
        );
      await page.screenshot({ path: screenshot, fullPage: true });

      const result = {
        number: index + 1,
        title,
        route: new URL(frame.url()).pathname + new URL(frame.url()).search,
        workspace_heading: await workspaceHeading.innerText(),
        complete_guide: completeGuide,
        tutorial_visible: tutorialVisible,
        tutorial_expected: tutorialExpected,
        expected_prepared: expectedPrepared,
        explicit_failure: explicitFailure,
        browser_errors: [...new Set(browserErrors)],
        screenshot,
      };
      report.lessons.push(result);
      if (
        !completeGuide ||
        (tutorialExpected && !tutorialVisible) ||
        !expectedPrepared ||
        explicitFailure ||
        result.browser_errors.length
      )
        report.failures.push(result);
      process.stdout.write(`${index + 1}/${lessonTitles.length} ${title}\n`);
      saveReport();

      await page
        .getByRole("button", { name: "Back to lessons", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Explore clinic workflows", exact: true })
        .waitFor({ state: "visible", timeout: 45000 });
    } catch (error) {
      await page.screenshot({ path: screenshot, fullPage: true });
      const result = {
        number: index + 1,
        title,
        error: error instanceof Error ? error.message : String(error),
        browser_errors: [...new Set(browserErrors)],
        screenshot,
      };
      report.lessons.push(result);
      report.failures.push(result);
      process.stdout.write(
        `${index + 1}/${lessonTitles.length} ${title} FAILED\n`,
      );
      saveReport();
      const catalogHeading = page.getByRole("heading", {
        name: "Explore clinic workflows",
        exact: true,
      });
      if (!(await catalogHeading.isVisible().catch(() => false))) {
        const backButton = page.getByRole("button", {
          name: "Back to lessons",
          exact: true,
        });
        if (await backButton.isVisible().catch(() => false))
          await backButton.click();
        await catalogHeading.waitFor({ state: "visible", timeout: 45000 });
      }
    }
  }
  await context.close();
} finally {
  await browser.close();
}

saveReport();
process.stdout.write(`${JSON.stringify(report.summary)}\n`);
if (report.failures.length) process.exitCode = 1;
