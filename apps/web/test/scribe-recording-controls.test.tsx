import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ScribeRecordingControls,
  scribeRecordingBlocksNavigation,
  type ScribeRecordingPhase,
} from "../src/features/scribe/ScribeRecordingControls";
import { ScribeAudioMeter } from "../src/features/scribe/ScribeAudioMeter";
import {
  canBeginPersistentScribeSession,
  scribeReviewPath,
  type ScribeRecordingSessionInput,
} from "../src/features/scribe/ScribeRecordingProvider";

describe("ScribeRecordingControls", () => {
  it("keeps every live or retryable capture phase inside the workspace navigation guard", () => {
    const blocked: ScribeRecordingPhase[] = [
      "requesting_permission",
      "recording",
      "paused",
      "stopping",
      "upload_error",
    ];
    for (const phase of blocked)
      expect(scribeRecordingBlocksNavigation(phase)).toBe(true);
    for (const phase of [
      "idle",
      "completed",
      "error",
    ] satisfies ScribeRecordingPhase[])
      expect(scribeRecordingBlocksNavigation(phase)).toBe(false);
  });

  it("renders an explicit consent-disabled Record action and microphone meter", () => {
    const html = renderToStaticMarkup(
      <ScribeRecordingControls
        encounterId={42}
        encounterVersion={3}
        processingAllowed={false}
        scopeKey="practice-1:encounter-42"
      />,
    );
    expect(html).toContain("Visit audio");
    expect(html).toContain("Microphone input level");
    expect(html).toContain(
      "Accepted recording consent is required before recording.",
    );
    expect(html).toContain("Record");
    expect(html).toContain("disabled");
    expect(html).not.toContain("Transcribe");
  });

  it("exposes the compact live microphone level as an accessible meter", () => {
    const html = renderToStaticMarkup(
      <ScribeAudioMeter level={64} active={true} />,
    );

    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-label="Microphone input level"');
    expect(html).toContain('aria-valuenow="64"');
  });

  it("keeps one encounter in the dock and supports context before recording consent", () => {
    const session: ScribeRecordingSessionInput = {
      encounterId: 42,
      encounterVersion: 3,
      processingAllowed: true,
      scopeKey: "membership-1:site-1:42",
      patientLabel: "Synthetic Patient",
      contextContent: "Reviewer context",
    };
    expect(canBeginPersistentScribeSession(null, session)).toBe(true);
    expect(canBeginPersistentScribeSession(session, session)).toBe(true);
    expect(
      canBeginPersistentScribeSession(session, { ...session, encounterId: 43 }),
    ).toBe(false);
    expect(
      canBeginPersistentScribeSession(
        null,
        { ...session, processingAllowed: false },
        false,
      ),
    ).toBe(true);
    expect(
      canBeginPersistentScribeSession(null, {
        ...session,
        processingAllowed: false,
      }),
    ).toBe(false);
    expect(scribeReviewPath(session.encounterId)).toBe(
      "/clinic/scribe?encounter_id=42&review=1",
    );
    expect(scribeReviewPath(session.encounterId, "recording-7")).toBe(
      "/clinic/scribe?encounter_id=42&review=1&review_token=recording-7",
    );
  });
});
