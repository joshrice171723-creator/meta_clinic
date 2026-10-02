#!/usr/bin/env node
// #9 encounter-label proof against the existing authorized actual Rails/Vite stack.
// No source/component imports, aliases, API success stubs, fixture creation or clinical writes.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const HEAD = process.env.QA_REAL_HEAD;
assert(typeof HEAD === "string" && /^[a-f0-9]{40}$/.test(HEAD), "QA_REAL_HEAD must identify the exact final frozen source");
const SOURCE_BLOBS = {
  "src/features/clinic/CareFlow.tsx": "c547cd8d95079752d196be00e6cd24a270c92262",
  "src/features/clinic/careFlow.css": "c3f9271420c99cd94b97f3767ba4a4eb0dd66c25",
  "test/support/authorizedRealStack.ts": "85eec1275e7cff258e73c87f6915b1900e08d498",
};
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "phone_fallback", width: 390, height: 844 },
];
const RAIL_LABELS = ["Summary", "Intake", "Chart", "Documentation", "Completion"];
const JUMP_LABELS = ["Education", "History", "Labs", "Medication", "Orders & plans", "HPI", "ROS", "SOAP assessment", "Plan", "Signing"];
const report = {
  key: "9 | Truncated labels",
  source_revision: HEAD,
  source_blobs: SOURCE_BLOBS,
  outcome: "blocked",
  verification_scope: "Actual provider encounter header, encounter-section rail, chart quick navigation, and original-prefix candidate controls at desktop/tablet/phone widths",
  reused_evidence: "Existing booking recurrence clipping proof; not rerun by this script",
  checks: [],
  failed_checks: [],
  api_mutations_after_login: [],
  limitations: [
    "Original report identifies encounter examples only as Trac… / avail… / provi…; exact historical controls and viewport are unknown",
    "Current provider-control evidence does not invalidate a historical observation or prove other screens",
    "No booking, SOAP note, intake, handoff, assignment, signing or completion mutation is performed",
    "No hosted/Muse, release, clinical or accessibility acceptance is inferred",
  ],
};
let browser;
let context;
let page;
let outputDir;
let exitCode = 1;
const normal = (text) => String(text ?? "").replace(/\s+/g, " ").trim();

function positive(value, label) {
  assert(Number.isSafeInteger(value) && value > 0, `Missing valid existing fixture field: ${label}`);
  return value;
}

function readFixture() {
  assert.equal(process.env.QA_REAL_ISOLATED, "1", "Only the existing isolated actual-stack contract is supported");
  const base = new URL(process.env.QA_REAL_BASE_URL ?? "");
  assert.equal(base.protocol, "http:");
  assert(["localhost", "127.0.0.1"].includes(base.hostname), "Runtime must be loopback");
  assert(!base.username && !base.password && !base.search && !base.hash, "Do not supply credential/query/fragment URLs");
  assert.equal(process.env.QA_REAL_HEAD, HEAD, "Freeze the exact reviewed source before this proof");
  const fixture = JSON.parse(readFileSync(process.env.QA_REAL_FIXTURE, "utf8"));
  assert.equal(fixture.schema, "authorized-real-stack-v1");
  assert.equal(fixture.synthetic, true);
  assert(/^apply_authorized_qa_20261001_[a-f0-9]{10}_development$/.test(fixture.isolated_database));
  assert.equal(fixture.head, process.env.QA_REAL_HEAD);
  const notes = fixture.note_scenarios;
  assert(notes && typeof notes === "object", "Existing note_scenarios is required; the proof does not seed or invent records");
  const scenario = { site_id: fixture.site_id, patient_id: fixture.patient_id, open_encounter_id: notes.open_encounter_id };
  positive(fixture.actor_user_id, "actor_user_id");
  positive(fixture.practice_id, "practice_id");
  positive(scenario.site_id, "site_id");
  positive(scenario.patient_id, "patient_id");
  positive(scenario.open_encounter_id, "note_scenarios.open_encounter_id");
  assert(typeof fixture.profile === "string" && fixture.profile.length > 0, "Existing synthetic profile required");
  return { base, fixture, scenario };
}

function verifySource() {
  const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  for (const [path, expected] of Object.entries(SOURCE_BLOBS)) {
    // Git text blobs use LF; normalize Windows checkout CRLF without masking content changes.
    const bytes = Buffer.from(readFileSync(resolve(webRoot, path), "utf8").replace(/\r\n/g, "\n"), "utf8");
    const actual = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    assert.equal(actual, expected, `${path} changed after freeze; root must review/rebase rather than reuse this proof blindly`);
  }
}

async function jsonGet(base, path) {
  const response = await page.request.get(new URL(path, base).href);
  assert.equal(response.status(), 200, `Actual GET failed: ${path}`);
  return response.json();
}

async function login(base, fixture, scenario, route) {
  // Mirrors authorizedRealStack.ts's existing synthetic session helper exactly.
  await page.goto(new URL(`/login?next=${encodeURIComponent(route)}`, base).href);
  const csrf = await jsonGet(base, "/api/csrf");
  const response = await page.request.post(new URL("/api/development_session", base).href, {
    data: { profile: fixture.profile, portal: "clinic", practice_id: fixture.practice_id, site_id: scenario.site_id },
    headers: { Origin: base.origin, "X-CSRF-Token": csrf.csrf_token },
  });
  assert.equal(response.status(), 201, "Existing synthetic development-session helper refused this actor/context");
  await page.goto(new URL(route, base).href);
  await page.locator(".clinic-shell").waitFor({ state: "visible", timeout: 30000 });
  const session = await jsonGet(base, "/api/session");
  const clinic = await jsonGet(base, "/api/clinic/context");
  assert.equal(session.user.id, fixture.actor_user_id);
  assert.equal(clinic.practice.id, fixture.practice_id);
  assert.equal(clinic.current_site.id, scenario.site_id);
  const encounter = await jsonGet(base, `/api/clinic/encounters/${scenario.open_encounter_id}?patient_id=${scenario.patient_id}`);
  assert.equal(encounter.encounter.id, scenario.open_encounter_id);
  assert.equal(encounter.encounter.patient_id, scenario.patient_id);
  assert.equal(Number(encounter.encounter.site_id), scenario.site_id);
  assert.equal(encounter.encounter.status, "open", "The supplied existing encounter must remain open");
  report.actual_identity = { actor_user_id: session.user.id, practice_id: clinic.practice.id, site_id: clinic.current_site.id, patient_id: scenario.patient_id, encounter_id: encounter.encounter.id };
}

async function measureLabel(locator) {
  await locator.scrollIntoViewIfNeeded();
  return locator.evaluate((element) => {
    const normal = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
    const text = normal(element.innerText);
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    const clips = [{ name: "viewport", left: 0, top: 0, right: innerWidth, bottom: innerHeight, x: true, y: true }];
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      const css = getComputedStyle(ancestor);
      const x = /^(hidden|clip|auto|scroll)$/.test(css.overflowX);
      const y = /^(hidden|clip|auto|scroll)$/.test(css.overflowY);
      if (x || y) {
        const bounds = ancestor.getBoundingClientRect();
        const left = bounds.left + ancestor.clientLeft;
        const top = bounds.top + ancestor.clientTop;
        clips.push({ name: ancestor.tagName.toLowerCase() + (ancestor.classList.contains("chart-quick-jump-links") ? ".chart-quick-jump-links" : ancestor.classList.contains("encounter-section-links") ? ".encounter-section-links" : ""), left, top, right: left + ancestor.clientWidth, bottom: top + ancestor.clientHeight, x, y });
      }
    }
    const clipped = [];
    let textRects = 0;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (!normal(walker.currentNode.textContent)) continue;
      const parent = walker.currentNode.parentElement;
      if (!parent || parent.closest('[aria-hidden="true"]')) continue;
      const css = getComputedStyle(parent);
      if (css.visibility === "hidden" || css.display === "none") continue;
      const range = document.createRange();
      range.selectNodeContents(walker.currentNode);
      for (const rect of range.getClientRects()) {
        if (!rect.width || !rect.height) continue;
        textRects++;
        for (const clip of clips) {
          if ((clip.x && (rect.left < clip.left - 1.5 || rect.right > clip.right + 1.5)) || (clip.y && (rect.top < clip.top - 1.5 || rect.bottom > clip.bottom + 1.5))) clipped.push({ ancestor: clip.name, x: clip.x, y: clip.y });
        }
      }
    }
    return { text, aria_label: element.getAttribute("aria-label"), width: box.width, height: box.height, client_width: element.clientWidth, scroll_width: element.scrollWidth, white_space: style.whiteSpace, text_overflow: style.textOverflow, line_clamp: style.webkitLineClamp, text_rects: textRects, clipped, contains_literal_truncation: /\b(?:Trac|avail|provi)(?:…|\.\.\.)/i.test(text) };
  });
}

async function checkGroup(group, selector, labels, viewport) {
  for (let index = 0; index < labels.length; index++) {
    const label = labels[index];
    const locator = page.locator(selector).getByRole("link", { name: label, exact: true });
    assert.equal(await locator.count(), 1, `Missing actual ${group} control: ${label}`);
    const measured = await measureLabel(locator);
    const screenshot = `${viewport.name}-${group}-${index}.png`;
    await locator.screenshot({ path: resolve(outputDir, screenshot), animations: "disabled" });
    const valid = measured.text === label && measured.text_rects > 0 && !measured.clipped.length && !measured.contains_literal_truncation;
    report.checks.push({ viewport, group, expected_label: label, actual: measured, screenshot, passed: valid });
    if (!valid) report.failed_checks.push({ viewport: viewport.name, group, label, reason: "Actual label is missing, clipped or literally abbreviated" });
  }
}

async function confirmActualChart() {
  await page.locator(".provider-encounter-workflow").waitFor();
  const confirm = page.locator("#chart-access").getByRole("button", { name: /^Confirm and (?:begin charting|open chart|view signed chart)$/ });
  assert.equal(await confirm.count(), 1, "The actual open encounter must retain its deliberate patient/encounter confirmation gate");
  const label = normal(await confirm.innerText());
  const gate = await measureLabel(confirm);
  report.checks.push({ group: "identity-confirm-gate", expected_label: label, actual: gate, passed: gate.text_rects > 0 && !gate.clipped.length && !gate.contains_literal_truncation });
  if (gate.clipped.length || gate.contains_literal_truncation || !gate.text_rects) report.failed_checks.push({ group: "identity-confirm-gate", label, reason: "The actual local confirmation label is clipped" });
  await confirm.click();
  await page.getByRole("navigation", { name: "Chart quick navigation", exact: true }).waitFor();
}

try {
  const { base, fixture, scenario } = readFixture();
  verifySource();
  const candidateOutputDir = resolve(process.env.QA_REAL_OUTPUT_DIR || `artifacts/original-9-provider-labels-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  assert(!existsSync(candidateOutputDir), "Use a fresh evidence directory; do not overwrite prior failures");
  mkdirSync(candidateOutputDir, { recursive: true });
  outputDir = candidateOutputDir;
  browser = await chromium.launch({ ...(process.env.BROWSER_EXECUTABLE_PATH ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH } : { channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === "win32" ? "msedge" : "chrome") }), headless: true });
  context = await browser.newContext({ viewport: { width: VIEWPORTS[0].width, height: VIEWPORTS[0].height }, timezoneId: "UTC" });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  const route = `/clinic/patients/${scenario.patient_id}/encounters/${scenario.open_encounter_id}`;
  await login(base, fixture, scenario, route);
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method()) && path !== "/api/session") report.api_mutations_after_login.push({ method: request.method(), path });
  });
  await confirmActualChart();
  // One focused reload proves the real confirmation gate is retained. No draft editing.
  await page.reload();
  await confirmActualChart();
  report.engine = await browser.version();
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.evaluate(async () => { await document.fonts.ready; await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    await checkGroup("section-rail", ".encounter-section-links", RAIL_LABELS, viewport);
    await checkGroup("quick-jump", ".chart-quick-jump-links", JUMP_LABELS, viewport);
    const headerControls = page.locator("#chart-patient a, #chart-patient button, #chart-access a, #chart-access button");
    for (let index = 0; index < await headerControls.count(); index++) {
      const locator = headerControls.nth(index);
      if (!await locator.isVisible()) continue;
      const text = normal(await locator.innerText());
      const measured = await measureLabel(locator);
      const valid = text.length > 0 && measured.text_rects > 0 && !measured.clipped.length && !measured.contains_literal_truncation;
      report.checks.push({ viewport, group: "provider-header", actual: measured, passed: valid });
      if (!valid) report.failed_checks.push({ viewport: viewport.name, group: "provider-header", label: text, reason: "Actual provider header control is clipped or missing its full visible label" });
    }
    const controls = page.locator('.provider-encounter-workflow button, .provider-encounter-workflow a, a[href="/clinic"]');
    for (let index = 0; index < await controls.count(); index++) {
      const locator = controls.nth(index);
      if (!await locator.isVisible()) continue;
      const text = normal(await locator.innerText());
      if (!/(?:track|avail|provi)/i.test(text)) continue;
      const measured = await measureLabel(locator);
      report.checks.push({ viewport, group: "original-prefix-candidate", actual: measured, passed: measured.text_rects > 0 && !measured.clipped.length && !measured.contains_literal_truncation });
      if (measured.clipped.length || measured.contains_literal_truncation || !measured.text_rects) report.failed_checks.push({ viewport: viewport.name, group: "original-prefix-candidate", label: text, reason: "Actual original-prefix candidate is clipped/abbreviated" });
    }
    const header = page.locator("#chart-access");
    await header.screenshot({ path: resolve(outputDir, `${viewport.name}-chart-access.png`), animations: "disabled" });
  }
  assert.equal(report.api_mutations_after_login.length, 0, "Unexpected domain API mutation occurred; preserve this failure");
  assert.equal(report.failed_checks.length, 0, "Provider label clipping found; root must review exact evidence before proposing a production hunk");
  report.outcome = "focused_actual_provider_viewport_checks_passed";
  report.whole_original_claim_closed = false;
  exitCode = 0;
} catch (error) {
  report.outcome = report.checks.length ? "failed_or_inconclusive" : "blocked";
  report.error = error instanceof Error ? error.message : String(error);
  report.whole_original_claim_closed = false;
} finally {
  await context?.close().catch(() => { report.cleanup_failure = "isolated browser context failed to close"; exitCode = 1; });
  await browser?.close().catch(() => { report.cleanup_failure = "owned browser failed to close"; exitCode = 1; });
  if (report.cleanup_failure) report.outcome = "failed_cleanup";
  report.finished_at = new Date().toISOString();
  const output = JSON.stringify(report, null, 2) + "\n";
  if (outputDir) writeFileSync(resolve(outputDir, "result.json"), output, { flag: "wx" });
  process.stdout.write(output);
  process.exitCode = exitCode;
}
