import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(
    new URL(`../src/${path}`, import.meta.url),
    "utf8",
  ).replaceAll("\r\n", "\n");
}

function section(contents: string, start: string, end: string) {
  const startIndex = contents.indexOf(start);
  const endIndex = contents.indexOf(end, startIndex + start.length);

  expect(startIndex, `missing section start: ${start}`).toBeGreaterThanOrEqual(
    0,
  );
  expect(endIndex, `missing section end: ${end}`).toBeGreaterThan(startIndex);
  return contents.slice(startIndex, endIndex);
}

describe("entry recovery source contract", () => {
  const controls = source("features/identity/DevelopmentAccountSwitcher.tsx");

  it("declares a workspace deadline and navigation-only recovery copy", () => {
    expect(controls).toContain("const LOGIN_NAVIGATION_DEADLINE_MS = 8_000");
    expect(controls).toContain("window.setTimeout(() => {");
    expect(controls).toContain(
      "Select Open workspace to continue without signing in again.",
    );
    expect(controls).toContain(
      "Select Open workspace to try again without signing in again.",
    );
    expect(controls).toContain('? "Opening…"');
    expect(controls).toContain('? "Open workspace"');
  });

  it("routes a retry around the session mutation instead of adding a replay path", () => {
    const logIn = section(
      controls,
      "  const logIn = async () => {",
      "\n\n  return (",
    );
    const retryGuard = logIn.indexOf("if (entryDestination)");
    const sessionMutation = logIn.indexOf('"/api/development_session"');

    expect(retryGuard).toBeGreaterThanOrEqual(0);
    expect(sessionMutation).toBeGreaterThan(retryGuard);
    expect(logIn).toContain("openWorkspace(entryDestination)");
    expect(logIn.match(/\/api\/development_session/g)).toHaveLength(1);
    expect(logIn).not.toContain("setTimeout");
  });
});

describe("message history source contract", () => {
  const reminders = source("features/clinic/Reminders.tsx");

  it("maps the complete attempt collection and includes truthful outcome fields", () => {
    const history = section(
      reminders,
      "function DeliveryAttemptHistory",
      "\n\nfunction NeedsAttention",
    );

    expect(history).toContain(
      "const attempts = reminder.delivery_attempts || []",
    );
    expect(history).toContain("attempts.map((attempt)");
    expect(history).toContain("Delivery attempts ({attempts.length})");
    expect(history).toContain("Provider:");
    expect(history).toContain("Destination:");
    expect(history).toContain(
      'deliveryAttemptTime("Queued", attempt.queued_at)',
    );
    expect(history).toContain(
      'deliveryAttemptTime("Accepted", attempt.accepted_at)',
    );
    expect(history).toContain(
      'deliveryAttemptTime("Completed", attempt.completed_at)',
    );
    expect(history).toContain("Failure classification:");
    expect(history).toContain('Retryable: {attempt.retryable ? "Yes" : "No"}');
    expect(history).toContain(
      "Accepted by the provider; delivery is not confirmed.",
    );
    expect(history).toContain("No confirmed delivery outcome is recorded.");
    expect(history).not.toContain("latest_delivery_attempt");
  });

  it("accepts only positive patient context and applies it to message history", () => {
    expect(reminders).toContain(
      "patientIdParam && /^[1-9]\\d*$/.test(patientIdParam)",
    );
    expect(reminders).toContain(
      'if (patientId) params.set("patient_id", patientId)',
    );
    expect(reminders).toContain(
      "reminder.appointment?.id === Number(appointmentId)",
    );
    expect(reminders).toContain('label="Selected appointment"');
  });
});

describe("cancellation communication review source contract", () => {
  const frontDesk = source("features/clinic/FrontDesk.tsx");

  it("states the action did not send a cancellation message in both confirmed paths", () => {
    expect(
      frontDesk.match(/No cancellation message was sent by this action\./g),
    ).toHaveLength(2);
  });

  it("offers a permission-gated review handoff with patient and appointment context", () => {
    expect(frontDesk).toContain("canReviewReminders && noticeContext");
    expect(frontDesk).toContain(
      "href={`/clinic/reminders?patient_id=${noticeContext.patientId}&appointment_id=${noticeContext.appointmentId}`}",
    );
    expect(frontDesk).toContain('? "Review patient message"');
    expect(frontDesk).toContain("patientId: appointment.patient_id");
    expect(frontDesk).toContain("appointmentId: appointment.id");
  });

  it("keeps cancellation itself scoped to the appointment transition endpoint", () => {
    const transition = section(
      frontDesk,
      "  async function transition(",
      "\n\n  async function startVisit(",
    );

    expect(transition).toContain(
      "`/api/clinic/appointments/${appointment.id}/transition`",
    );
    expect(transition).toContain("cancellation_message_acknowledged: true");
    expect(transition).not.toContain("/api/clinic/reminders");
    expect(transition).not.toContain("queueReminder");
    expect(transition).not.toContain("sendMessage");
  });
});
