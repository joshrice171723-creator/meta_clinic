import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const prototype = readFileSync(
  new URL("../design/clinic-intake-handoff-prototype.html", import.meta.url),
  "utf8",
);
const text = prototype.replace(/\s+/g, " ");

describe("isolated intake and handoff design prototype", () => {
  it("is visibly synthetic, local-only, and excluded from runtime routes", () => {
    expect(text).toContain("Example only — not saved");
    expect(text).toContain("SYN_Rivera, Mara");
    expect(text).toContain("SYN-ENCOUNTER-42");
    expect(text).toContain("Every transition on this page is simulated");
    expect(prototype).not.toMatch(
      /fetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|WebSocket|EventSource/,
    );
    expect(prototype).not.toMatch(
      /localStorage|sessionStorage|indexedDB|document\.cookie|serviceWorker|CacheStorage|\bcaches\b/,
    );
    expect(prototype).not.toMatch(
      /console\.|location\.(?:search|hash)|history\.(?:pushState|replaceState|go|back|forward)|postMessage|BroadcastChannel/,
    );
    expect(prototype).not.toMatch(/https?:\/\//);
  });

  it("covers confirmation, explicit states, handoff decisions, SOAP boundary, and recovery copy", () => {
    for (const expected of [
      "Confirm patient and visit",
      "Encounter route: intake to discharge",
      "1. Intake",
      "2. Triage",
      "3. Handoff",
      "4. Provider exam",
      "5. Diagnosis",
      "6. Discharge",
      "Example role",
      "Example discharge operator (unapproved placeholder)",
      "Not recorded",
      "Unknown",
      "Recorded — not reviewed",
      "No vital thresholds or readiness decision is derived here",
      "Simulate save intake",
      "Simulate save triage state",
      "Request clinician review",
      "Accept handoff",
      "Return for correction",
      "Decline handoff",
      "Provider exam draft",
      "Locked until a clinician explicitly accepts",
      "Simulate save exam draft",
      "Diagnosis draft",
      "never infers or confirms a diagnosis",
      "Simulate save diagnosis draft",
      "Discharge disposition",
      "separate explicit transition",
      "Simulate discharge disposition",
      "Simulated wrong-patient checkpoint",
      "Opening this preview does not accept a handoff",
      "Simulate stale intake conflict",
      "Simulate expired session",
      "Simulate unknown save outcome",
      "Reset isolated example",
      "This static artifact cannot load a current server version",
      "This static artifact has no sign-in flow",
      "This static artifact cannot reconcile a server outcome",
      "protected receipt or status lookup",
      "no change may be replayed automatically",
      "The prior result remains part of the example history",
      "Example staff A (handoff pending)",
      "Example staff A (follow-up needed)",
    ])
      expect(text).toContain(expected);

    expect(text).not.toMatch(/medicat|treat(?:ment)?|prescrib/i);
    expect(text).toContain("Staff context stays attributed to Example staff A");
    expect(text).toContain("Synthetic diagnosis draft — not confirmed");
    expect(text).toContain("This prototype has no checkout, departure");
    expect(text).toContain("Disposition simulated — not encounter completion");
    expect(text).toContain("does not establish who has discharge authority");
    expect(text).not.toContain("Completed in example");

    expect(prototype).toContain('id="requestButton" type="button" disabled');
    expect(prototype).toContain("let intakeSaved = false");
    expect(prototype).toMatch(
      /requestButton\.disabled\s*=\s*[\s\S]*?role !== "staff"[\s\S]*?!intakeSaved/,
    );
    expect(prototype).toMatch(
      /returnButton\.disabled\s*=\s*next !== "pending" \|\| role !== "clinician"/,
    );
    expect(prototype).toMatch(
      /declineButton\.disabled\s*=\s*next !== "pending" \|\| role !== "clinician"/,
    );
    expect(prototype).toMatch(/saveTriageButton\.disabled = role !== "staff"/);
    expect(prototype).toMatch(
      /const dischargeReady =\s*diagnosisSaved &&\s*accepted &&\s*role === "discharge"/,
    );

    expect(text).toContain("Opening the SOAP preview is never an acceptance");
    expect(text).toContain(
      "It does not sign, close, check out, or prove departure",
    );
  });

  it("includes responsive and assistive-technology safeguards", () => {
    expect(prototype).toContain('aria-live="polite"');
    expect(prototype).toContain('role="alert"');
    expect(prototype).toContain("prefers-reduced-motion: reduce");
    expect(prototype).toContain("@media (max-width: 600px)");
    expect(prototype).toContain("min-height: 44px");
    expect(prototype).toContain("focus-visible");
    expect(prototype).toContain('href="#main"');
  });

  it("keeps the full route artifact out of runtime navigation and protected channels", () => {
    const app = readFileSync(
      new URL("../src/App.tsx", import.meta.url),
      "utf8",
    );
    expect(app).not.toContain("clinic-intake-handoff-prototype");
    expect(prototype).not.toMatch(
      /fetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|document\.cookie|serviceWorker|CacheStorage|console\.|location\.(?:search|hash)|history\.(?:pushState|replaceState|go|back|forward)|postMessage|BroadcastChannel/,
    );
  });
});
