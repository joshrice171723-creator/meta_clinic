import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const dailyModule = vi.hoisted(() => ({ createCallObject: vi.fn() }));

vi.mock("@daily-co/daily-js", () => ({
  default: { createCallObject: dailyModule.createCallObject },
}));

import {
  DailyMediaAdapter,
  projectDailyParticipants,
} from "../src/features/telehealth/dailyAdapter";

function track(id: string) {
  return { id, enabled: true } as MediaStreamTrack;
}

function callWithParticipants() {
  const localAudio = track("local-audio");
  const remoteAudio = track("remote-audio");
  const remoteVideo = track("remote-video");
  const participants = {
    local: {
      local: true,
      session_id: "daily-session-local",
      user_id: "provider-subject-local",
      user_name: "Care team",
      tracks: {
        audio: { state: "playable", persistentTrack: localAudio },
        video: { state: "off", persistentTrack: track("ignored-video") },
      },
    },
    remote: {
      local: false,
      session_id: "daily-session-remote",
      user_id: "provider-subject-remote",
      user_name: "Patient",
      tracks: {
        audio: { state: "playable", persistentTrack: remoteAudio },
        video: { state: "playable", persistentTrack: remoteVideo },
      },
    },
  };
  return {
    participants,
    call: {
      participants: vi.fn(() => participants),
      updateParticipant: vi.fn(),
    },
  };
}

describe("Daily participant projection", () => {
  it("retains provider subject and Daily session IDs as separate identities", () => {
    const { call } = callWithParticipants();
    const projected = projectDailyParticipants(call as never);

    expect(projected).toEqual([
      expect.objectContaining({
        participantId: "provider-subject-local",
        providerSubjectId: "provider-subject-local",
        providerSessionId: "daily-session-local",
        displayName: "Care team",
        isLocal: true,
        audioTrack: expect.objectContaining({ id: "local-audio" }),
        videoTrack: null,
      }),
      expect.objectContaining({
        participantId: "provider-subject-remote",
        providerSubjectId: "provider-subject-remote",
        providerSessionId: "daily-session-remote",
        displayName: "Patient",
        isLocal: false,
        audioTrack: expect.objectContaining({ id: "remote-audio" }),
        videoTrack: expect.objectContaining({ id: "remote-video" }),
      }),
    ]);
  });

  it("maps an authoritative provider subject to a remote Daily session before ejection", () => {
    const { call } = callWithParticipants();
    const adapter = new DailyMediaAdapter({
      onParticipants: vi.fn(),
      onState: vi.fn(),
      onError: vi.fn(),
    });
    (adapter as unknown as { call: typeof call }).call = call;

    expect(adapter.ejectParticipant("provider-subject-remote")).toBe(true);
    expect(call.updateParticipant).toHaveBeenCalledWith(
      "daily-session-remote",
      {
        eject: true,
      },
    );
    expect(adapter.ejectParticipant("app-participant-id")).toBe(false);
    expect(adapter.ejectParticipant("provider-subject-local")).toBe(false);
    expect(call.updateParticipant).toHaveBeenCalledTimes(1);
  });

  it("attempts ejection for every remote session and never ejects the local actor", () => {
    const { participants, call } = callWithParticipants();
    const secondRemote = {
      local: false,
      session_id: "daily-session-remote-2",
      user_id: "provider-subject-remote-2",
      user_name: "Care team",
      tracks: {},
    };
    const expandedCall = {
      ...call,
      participants: vi.fn(() => ({ ...participants, secondRemote })),
    };
    const adapter = new DailyMediaAdapter({
      onParticipants: vi.fn(),
      onState: vi.fn(),
      onError: vi.fn(),
    });
    (adapter as unknown as { call: typeof expandedCall }).call = expandedCall;

    expect(adapter.ejectAllRemoteParticipants()).toBe(2);
    expect(expandedCall.updateParticipant.mock.calls).toEqual([
      ["daily-session-remote", { eject: true }],
      ["daily-session-remote-2", { eject: true }],
    ]);
  });

  it("keeps server removal and end mutations ahead of browser media ejection", () => {
    const source = readFileSync(
      "src/features/telehealth/ClinicianTelehealthVisit.tsx",
      "utf8",
    ).replaceAll("\r\n", "\n");
    const endFlow = source.slice(
      source.indexOf("const endForEveryone"),
      source.indexOf("const removeFromCall"),
    );
    const removeFlow = source.slice(
      source.indexOf("const removeFromCall"),
      source.indexOf("const mappedCallState"),
    );

    expect(endFlow.indexOf("await applyMutation")).toBeGreaterThanOrEqual(0);
    expect(
      endFlow.indexOf("await session.ejectAllRemoteParticipants()"),
    ).toBeGreaterThan(endFlow.indexOf("await applyMutation"));
    expect(endFlow.indexOf("await session.leave(false)")).toBeGreaterThan(
      endFlow.indexOf("await session.ejectAllRemoteParticipants()"),
    );
    expect(
      removeFlow.indexOf("const response = await applyMutation"),
    ).toBeGreaterThanOrEqual(0);
    expect(removeFlow.indexOf("removed?.provider_subject_id")).toBeGreaterThan(
      removeFlow.indexOf("const response = await applyMutation"),
    );
    expect(
      removeFlow.indexOf("await session.ejectParticipant(providerSubjectId)"),
    ).toBeGreaterThan(removeFlow.indexOf("removed?.provider_subject_id"));
    expect(removeFlow).not.toContain("session.ejectParticipant(participantId)");
  });
});
