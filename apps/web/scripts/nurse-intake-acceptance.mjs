#!/usr/bin/env node

import { chromium } from "playwright-core";

const base = new URL(process.env.BROWSER_BASE_URL || "http://localhost:3000");
if (
  base.protocol !== "http:" ||
  !["localhost", "127.0.0.1"].includes(base.hostname)
) {
  throw new Error("BROWSER_BASE_URL must be loopback HTTP");
}

const patientId = Number(process.env.BROWSER_INTAKE_PATIENT_ID);
const encounterId = Number(process.env.BROWSER_INTAKE_ENCOUNTER_ID);
const profileId = process.env.BROWSER_INTAKE_PROFILE;
if (
  !Number.isSafeInteger(patientId) ||
  patientId < 1 ||
  !Number.isSafeInteger(encounterId) ||
  encounterId < 1 ||
  !profileId
) {
  throw new Error(
    "Set BROWSER_INTAKE_PATIENT_ID, BROWSER_INTAKE_ENCOUNTER_ID, and BROWSER_INTAKE_PROFILE to synthetic fixture values",
  );
}

const browser = await chromium.launch({ channel: "msedge" });
const context = await browser.newContext({
  viewport: { width: 1024, height: 768 },
});
const page = await context.newPage();
const path = `/clinic/patients/${patientId}/encounters/${encounterId}`;
const marker = `Synthetic intake recovery ${crypto.randomUUID()}`;

try {
  const csrfResponse = await context.request.get(
    new URL("/api/csrf", base).href,
  );
  const csrf = await csrfResponse.json();
  const account = csrf.development_accounts?.find(
    (entry) => entry.id === profileId,
  );
  if (!account?.clinic)
    throw new Error(`No synthetic clinic profile ${profileId}`);
  const login = await context.request.post(
    new URL("/api/development_session", base).href,
    {
      data: {
        profile: account.id,
        portal: "clinic",
        practice_id: account.clinic.id,
        ...(account.locations?.[0] ? { site_id: account.locations[0].id } : {}),
      },
      headers: {
        "X-CSRF-Token": csrf.csrf_token,
        Origin: base.origin,
        Referer: new URL("/login", base).href,
        Accept: "application/json",
      },
    },
  );
  if (login.status() !== 201)
    throw new Error(`Synthetic login HTTP ${login.status()}`);

  await page.goto(new URL(path, base).href, { waitUntil: "domcontentloaded" });
  const locationPicker = page.getByRole("dialog", {
    name: "Choose your location",
  });
  if (await locationPicker.isVisible()) {
    await locationPicker
      .getByRole("list", { name: "Available locations" })
      .locator('[role="button"]')
      .first()
      .click();
  }
  await page
    .getByRole("heading", { name: `Encounter #${encounterId}` })
    .waitFor();
  const reason = page.getByRole("textbox", { name: "What brings you in?" });
  await reason.waitFor({ timeout: 30000 });
  if (!(await reason.isEnabled())) {
    throw new Error("Synthetic profile cannot edit intake for this encounter");
  }
  await reason.fill(marker);
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes(`/encounters/${encounterId}/intake_revisions`) &&
      response.request().method() === "POST",
    { timeout: 30000 },
  );
  await page.getByRole("button", { name: "Save draft" }).click();
  const saved = await responsePromise;
  const body = await saved.json();
  if (saved.status() !== 201 || body.intake?.encounter_id !== encounterId) {
    throw new Error(`Intake save HTTP ${saved.status()}`);
  }

  await page.reload({ waitUntil: "domcontentloaded" });
  await reason.waitFor({ timeout: 30000 });
  if ((await reason.inputValue()) !== marker) {
    throw new Error("Saved intake answer did not survive a full reload");
  }
  const persisted = await page.evaluate(
    async (id) => {
      const response = await fetch(
        `/api/clinic/patients/${id.patientId}/encounters/${id.encounterId}/nurse_workspace`,
        { credentials: "same-origin" },
      );
      const payload = await response.json();
      return { status: response.status, version: payload.intake?.version };
    },
    { patientId, encounterId },
  );
  if (persisted.status !== 200 || persisted.version !== body.intake.version) {
    throw new Error("Reloaded intake version did not match the saved revision");
  }
  process.stdout.write(
    JSON.stringify({
      ok: true,
      patient_id: patientId,
      encounter_id: encounterId,
      version: persisted.version,
      save_status: saved.status(),
      reload_matched: true,
    }) + "\n",
  );
} catch (error) {
  process.stdout.write(
    JSON.stringify({ ok: false, error: error.message }) + "\n",
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
