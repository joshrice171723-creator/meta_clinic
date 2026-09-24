#!/usr/bin/env node
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const base = process.env.MARKETING_BASE_URL || "http://127.0.0.1:3100";
const slugs = [
  "scheduling",
  "tracking-board",
  "intake-forms",
  "team-workspace",
  "inventory",
  "clinical-notes",
  "labs-results",
  "medication-workflows",
  "care-plans",
  "cash-billing",
  "memberships-packages",
  "invoices",
  "optional-insurance",
  "online-requests",
  "patient-portal",
  "reminders",
  "telehealth",
];
const out = resolve("outputs/marketing-browser-check");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  channel: process.platform === "win32" ? "msedge" : "chrome",
  headless: true,
});
const failures = [];
try {
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const home = `${base}/meta-clinic`;
    await page.goto(home, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /features/i }).focus();
    await page.keyboard.press("Enter");
    const dropdownLinks = await page
      .locator('nav[aria-label="Features"] a[href^="/meta-clinic/features/"]')
      .count();
    if (dropdownLinks !== slugs.length)
      failures.push(
        `${width}px dropdown: ${dropdownLinks}/${slugs.length} links`,
      );
    await page
      .locator(
        'nav[aria-label="Features"] a[href="/meta-clinic/features/tracking-board"]',
      )
      .focus();
    await page.keyboard.press("Enter");
    await page.waitForURL("**/meta-clinic/features/tracking-board");
    try {
      await page
        .getByRole("heading", { name: "Know where every visit stands." })
        .waitFor({ timeout: 10000 });
    } catch {
      failures.push(`${width}px dropdown: keyboard link failed`);
    }
    await page.goto(home, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /features/i }).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    if (
      (await page
        .getByRole("button", { name: /features/i })
        .getAttribute("aria-expanded")) !== "false"
    )
      failures.push(`${width}px dropdown: Escape failed`);
    if (process.env.MARKETING_KEYBOARD_ONLY === "1") {
      await page.close();
      continue;
    }
    for (const slug of slugs) {
      const response = await page.goto(`${base}/meta-clinic/features/${slug}`, {
        waitUntil: "networkidle",
      });
      const images = page.locator("main img");
      for (let i = 0; i < (await images.count()); i += 1) {
        await images.nth(i).scrollIntoViewIfNeeded();
        await images
          .nth(i)
          .evaluate((img) => img.decode().catch(() => undefined));
      }
      const outcome = await page.evaluate(() => ({
        title: document.querySelector("main h1")?.textContent?.trim(),
        images: [...document.querySelectorAll("main img")].map((img) => ({
          src: img.getAttribute("src"),
          loaded: img.complete && img.naturalWidth > 0,
          alt: Boolean(img.alt),
        })),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        related: document
          .querySelector('main aside a[href^="/meta-clinic/features/"]')
          ?.getAttribute("href"),
      }));
      if (response?.status() !== 200 || !outcome.title)
        failures.push(`${width}px ${slug}: route/title`);
      if (
        !outcome.images.length ||
        outcome.images.some((img) => !img.loaded || !img.alt)
      )
        failures.push(
          `${width}px ${slug}: image load/alt ${JSON.stringify(outcome.images.filter((img) => !img.loaded || !img.alt))}`,
        );
      if (outcome.overflow > 1)
        failures.push(
          `${width}px ${slug}: ${outcome.overflow}px horizontal overflow`,
        );
      if (!outcome.related) failures.push(`${width}px ${slug}: related link`);
      if (
        width === 1440 &&
        ["tracking-board", "intake-forms", "cash-billing"].includes(slug)
      ) {
        await page.screenshot({
          path: resolve(out, `${slug}-${width}.png`),
          fullPage: true,
        });
      }
      if (width === 320 && slug === "tracking-board") {
        await page.screenshot({
          path: resolve(out, `${slug}-${width}.png`),
          fullPage: true,
        });
      }
    }
    await page.close();
  }
} finally {
  await browser.close();
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    process.env.MARKETING_KEYBOARD_ONLY === "1"
      ? "Marketing keyboard check passed: Features dropdown opens, navigates, and closes at 1440, 390, and 320px."
      : `Marketing browser check passed: ${slugs.length} routes at 1440, 390, and 320px; dropdown, images, related links, and reflow.`,
  );
}
