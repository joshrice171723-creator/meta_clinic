import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const twilio = vi.hoisted(() => ({
  connect: vi.fn(),
  createLocalAudioTrack: vi.fn(),
  createLocalVideoTrack: vi.fn(),
}));

vi.mock("twilio-video", () => ({
  connect: twilio.connect,
  createLocalAudioTrack: twilio.createLocalAudioTrack,
  createLocalVideoTrack: twilio.createLocalVideoTrack,
  isSupported: true,
  LocalVideoTrack: class {
    kind = "video" as const;
    name: string;
    mediaStreamTrack: MediaStreamTrack;
    isStopped = false;
    isEnabled = true;
    private listeners = new Map<string, Set<() => void>>();

    constructor(
      mediaStreamTrack: MediaStreamTrack,
      options?: { name?: string },
    ) {
      this.mediaStreamTrack = mediaStreamTrack;
      this.name = options?.name || "camera";
    }

    on(event: string, listener: () => void) {
      const listeners = this.listeners.get(event) || new Set();
      listeners.add(listener);
      this.listeners.set(event, listeners);
      return this;
    }

    enable() {
      this.isEnabled = true;
      this.mediaStreamTrack.enabled = true;
      return this;
    }

    disable() {
      this.isEnabled = false;
      this.mediaStreamTrack.enabled = false;
      return this;
    }

    restart = vi.fn().mockResolvedValue(undefined);

    stop() {
      if (this.isStopped) return this;
      this.isStopped = true;
      this.mediaStreamTrack.stop();
      for (const listener of this.listeners.get("stopped") || []) listener();
      return this;
    }
  },
}));

import { createTelehealthMediaAdapter } from "../src/features/telehealth/mediaAdapter";
import {
  TwilioMediaAdapter,
  projectTwilioParticipants,
} from "../src/features/telehealth/twilioAdapter";

type Listener = (...args: unknown[]) => void;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function emitter() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    on: vi.fn((event: string, listener: Listener) => {
      const current = listeners.get(event) || new Set();
      current.add(listener);
      listeners.set(event, current);
    }),
    off: vi.fn((event: string, listener: Listener) => {
      listeners.get(event)?.delete(listener);
    }),
    emit(event: string, ...args: unknown[]) {
      for (const listener of listeners.get(event) || []) listener(...args);
    },
  };
}

function mediaStreamTrack(id: string, kind: "audio" | "video") {
  return {
    id,
    kind,
    enabled: true,
    readyState: "live",
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;
}

function localTrack(id: string, kind: "audio" | "video", name = kind) {
  const media = mediaStreamTrack(id, kind);
  return {
    kind,
    name,
    mediaStreamTrack: media,
    isEnabled: true,
    isStopped: false,
    enable: vi.fn(function (this: { isEnabled: boolean }) {
      this.isEnabled = true;
      media.enabled = true;
      return this;
    }),
    disable: vi.fn(function (this: { isEnabled: boolean }) {
      this.isEnabled = false;
      media.enabled = false;
      return this;
    }),
    restart: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(function (this: { isStopped: boolean }) {
      this.isStopped = true;
      media.stop();
      return this;
    }),
  };
}

function publication(track: ReturnType<typeof localTrack>) {
  return {
    track,
    trackName: track.name,
    isSubscribed: true,
  };
}

function cancelable<T>(promise: Promise<T>) {
  return Object.assign(promise, { cancel: vi.fn() });
}

function roomFixture() {
  const roomEvents = emitter();
  const localEvents = emitter();
  const audio = localTrack("local-audio", "audio", "microphone");
  const camera = localTrack("local-video", "video", "camera");
  const audioPublication = publication(audio);
  const cameraPublication = publication(camera);
  const localParticipant = {
    identity: "provider-subject-local",
    sid: "PA-local",
    audioTracks: new Map([["MT-audio", audioPublication]]),
    videoTracks: new Map([["MT-video", cameraPublication]]),
    tracks: new Map([
      ["MT-audio", audioPublication],
      ["MT-video", cameraPublication],
    ]),
    publishTrack: vi.fn().mockResolvedValue({}),
    unpublishTrack: vi.fn(),
    on: localEvents.on,
    off: localEvents.off,
  };
  const remoteAudio = mediaStreamTrack("remote-audio", "audio");
  const remoteVideo = mediaStreamTrack("remote-video", "video");
  const remoteScreen = mediaStreamTrack("remote-screen", "video");
  const remoteParticipant = {
    identity: "provider-subject-remote",
    sid: "PA-remote",
    audioTracks: new Map([
      [
        "MT-remote-audio",
        {
          isSubscribed: true,
          trackName: "microphone",
          track: { mediaStreamTrack: remoteAudio },
        },
      ],
    ]),
    videoTracks: new Map([
      [
        "MT-remote-video",
        {
          isSubscribed: true,
          trackName: "camera",
          track: { mediaStreamTrack: remoteVideo },
        },
      ],
      [
        "MT-remote-screen",
        {
          isSubscribed: true,
          trackName: "apply-screen-share",
          track: { mediaStreamTrack: remoteScreen },
        },
      ],
    ]),
  };
  const room = {
    name: "apply-visit-1",
    sid: "RM-1",
    state: "connected",
    localParticipant,
    participants: new Map([["PA-remote", remoteParticipant]]),
    disconnect: vi.fn(),
    on: roomEvents.on,
    off: roomEvents.off,
  };
  return {
    room,
    roomEvents,
    localEvents,
    audio,
    camera,
    localParticipant,
    remoteAudio,
    remoteVideo,
    remoteScreen,
  };
}

function callbacks() {
  return {
    onParticipants: vi.fn(),
    onState: vi.fn(),
    onError: vi.fn(),
  };
}

async function joinedAdapter(fixture = roomFixture()) {
  twilio.connect.mockReturnValueOnce(
    cancelable(Promise.resolve(fixture.room)),
  );
  const events = callbacks();
  const adapter = new TwilioMediaAdapter(events);
  await adapter.join({
    roomName: "apply-visit-1",
    token: "ephemeral-token",
  });
  return { adapter, events, fixture };
}

beforeEach(() => {
  vi.clearAllMocks();
  twilio.connect.mockReset();
  twilio.createLocalAudioTrack.mockReset();
  twilio.createLocalVideoTrack.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Twilio participant projection", () => {
  it("keeps Twilio identity and session IDs separate while projecting provider-owned tracks", () => {
    const fixture = roomFixture();
    const participants = projectTwilioParticipants(fixture.room as never);

    expect(participants).toEqual([
      expect.objectContaining({
        participantId: "provider-subject-local",
        providerSubjectId: "provider-subject-local",
        providerSessionId: "PA-local",
        displayName: null,
        isLocal: true,
        audioTrack: fixture.audio.mediaStreamTrack,
        videoTrack: fixture.camera.mediaStreamTrack,
      }),
      expect.objectContaining({
        participantId: "provider-subject-remote",
        providerSubjectId: "provider-subject-remote",
        providerSessionId: "PA-remote",
        displayName: null,
        isLocal: false,
        audioTrack: fixture.remoteAudio,
        videoTrack: fixture.remoteVideo,
        screenVideoTrack: fixture.remoteScreen,
        subscribed: true,
      }),
    ]);
  });
});

describe("Twilio media lifecycle", () => {
  it("joins the server-authorized room and reports Twilio reconnection state", async () => {
    const { events, fixture } = await joinedAdapter();

    expect(twilio.connect).toHaveBeenCalledWith(
      "ephemeral-token",
      expect.objectContaining({
        name: "apply-visit-1",
        audio: true,
        video: true,
        logLevel: "off",
      }),
    );
    fixture.roomEvents.emit("reconnecting", new Error("network"));
    fixture.roomEvents.emit("reconnected");

    expect(events.onState.mock.calls.map(([state]) => state)).toEqual([
      "joining",
      "joined",
      "reconnecting",
      "joined",
    ]);
  });

  it("stops all local media immediately when Twilio disconnects", async () => {
    const { events, fixture } = await joinedAdapter();

    fixture.roomEvents.emit("disconnected", fixture.room);

    expect(fixture.audio.stop).toHaveBeenCalledTimes(1);
    expect(fixture.camera.stop).toHaveBeenCalledTimes(1);
    expect(events.onParticipants).toHaveBeenLastCalledWith([]);
    expect(events.onState).toHaveBeenLastCalledWith("ended");
  });

  it("cancels an in-flight join and disposes tracks if Twilio resolves late", async () => {
    const fixture = roomFixture();
    const pending = deferred<typeof fixture.room>();
    const connection = cancelable(pending.promise);
    twilio.connect.mockReturnValueOnce(connection);
    const adapter = new TwilioMediaAdapter(callbacks());

    const joining = adapter.join({
      roomName: "apply-visit-1",
      token: "ephemeral-token",
    });
    await Promise.resolve();
    await adapter.destroy();
    pending.resolve(fixture.room);
    await joining;

    expect(connection.cancel).toHaveBeenCalledTimes(1);
    expect(fixture.room.disconnect).toHaveBeenCalledTimes(1);
    expect(fixture.audio.stop).toHaveBeenCalledTimes(1);
    expect(fixture.camera.stop).toHaveBeenCalledTimes(1);
  });

  it("stops a microphone acquired after the room was destroyed", async () => {
    const { adapter, fixture } = await joinedAdapter();
    fixture.localParticipant.audioTracks.clear();
    fixture.localParticipant.tracks.delete("MT-audio");
    const pending = deferred<ReturnType<typeof localTrack>>();
    twilio.createLocalAudioTrack.mockReturnValueOnce(pending.promise);

    const enabling = adapter.setMicrophone(true);
    await adapter.destroy();
    const lateTrack = localTrack("late-audio", "audio");
    pending.resolve(lateTrack);
    await enabling;

    expect(lateTrack.stop).toHaveBeenCalledTimes(1);
    expect(fixture.localParticipant.publishTrack).not.toHaveBeenCalled();
  });

  it("stops a track when publishing finishes after teardown", async () => {
    const { adapter, fixture } = await joinedAdapter();
    fixture.localParticipant.audioTracks.clear();
    fixture.localParticipant.tracks.delete("MT-audio");
    const lateTrack = localTrack("publishing-audio", "audio");
    const publishing = deferred<object>();
    twilio.createLocalAudioTrack.mockResolvedValueOnce(lateTrack);
    fixture.localParticipant.publishTrack.mockReturnValueOnce(
      publishing.promise,
    );

    const enabling = adapter.setMicrophone(true);
    await Promise.resolve();
    expect(fixture.localParticipant.publishTrack).toHaveBeenCalledWith(
      lateTrack,
    );
    await adapter.destroy();
    publishing.resolve({});
    await enabling;

    expect(lateTrack.stop).toHaveBeenCalledTimes(1);
  });

  it("stops a screen capture that resolves after teardown", async () => {
    const { adapter, fixture } = await joinedAdapter();
    const pending = deferred<MediaStream>();
    const screen = mediaStreamTrack("late-screen", "video");
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getDisplayMedia: vi.fn(() => pending.promise),
      },
    });

    const sharing = adapter.startScreenShare();
    await adapter.destroy();
    pending.resolve({
      getVideoTracks: () => [screen],
      getTracks: () => [screen],
    } as unknown as MediaStream);
    await sharing;

    expect(screen.stop).toHaveBeenCalledTimes(1);
    expect(fixture.localParticipant.publishTrack).not.toHaveBeenCalled();
  });

  it("uses provider tracks for microphone, camera, device, and screen controls", async () => {
    const { adapter, fixture } = await joinedAdapter();
    const screenSource = mediaStreamTrack("screen", "video");
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getDisplayMedia: vi.fn().mockResolvedValue({
          getVideoTracks: () => [screenSource],
          getTracks: () => [screenSource],
        }),
      },
    });

    await adapter.setMicrophone(false);
    await adapter.setCamera(false);
    await adapter.selectInputDevice("audio", "preferred-microphone");
    await adapter.selectInputDevice("video", "preferred-camera");
    await adapter.startScreenShare();
    await adapter.stopScreenShare();

    expect(fixture.audio.disable).toHaveBeenCalledTimes(1);
    expect(fixture.camera.disable).toHaveBeenCalledTimes(1);
    expect(fixture.audio.restart).toHaveBeenCalledWith({
      deviceId: { exact: "preferred-microphone" },
    });
    expect(fixture.camera.restart).toHaveBeenCalledWith({
      deviceId: { exact: "preferred-camera" },
    });
    expect(fixture.localParticipant.publishTrack).toHaveBeenCalledTimes(1);
    expect(fixture.localParticipant.unpublishTrack).toHaveBeenCalledTimes(1);
    expect(screenSource.stop).toHaveBeenCalledTimes(1);
  });

  it("keeps participant removal server-authoritative", async () => {
    const { adapter } = await joinedAdapter();

    expect(adapter.ejectParticipant("provider-subject-remote")).toBe(false);
    expect(adapter.ejectAllRemoteParticipants()).toBe(0);
  });

  it("rejects a legacy Daily grant before creating media", () => {
    expect(() =>
      createTelehealthMediaAdapter("daily", callbacks()),
    ).toThrow(/retired video connection/i);
  });
});
