import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  attachScribeTracks,
  detachScribeTracks,
} from "../src/features/telehealth/ScribeAudioBridge";

class FakeTrack {
  private static nextId = 1;
  readonly id: string;
  kind = "audio";
  readyState: MediaStreamTrackState = "live";
  enabled = true;
  muted = false;
  stopped = false;
  clones: FakeTrack[] = [];

  constructor(id = `track-${FakeTrack.nextId++}`) {
    this.id = id;
  }

  clone() {
    const clone = new FakeTrack();
    clone.enabled = this.enabled;
    this.clones.push(clone);
    return clone as unknown as MediaStreamTrack;
  }

  stop() {
    this.stopped = true;
    this.readyState = "ended";
  }
}

class FakeMediaStream {
  constructor(private readonly tracks: MediaStreamTrack[] = []) {}
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === "audio");
  }
}

class FakeSourceNode {
  connectedTo: unknown = null;
  disconnected = false;
  connect(target: unknown) {
    this.connectedTo = target;
  }
  disconnect() {
    this.disconnected = true;
  }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: AudioContextState = "running";
  closed = false;
  resumed = false;
  readonly outputTrack = new FakeTrack();
  readonly destination = {
    stream: new FakeMediaStream([
      this.outputTrack as unknown as MediaStreamTrack,
    ]),
  };
  readonly sources: FakeSourceNode[] = [];

  constructor() {
    FakeAudioContext.instances.push(this);
  }
  createMediaStreamDestination() {
    return this.destination as unknown as MediaStreamAudioDestinationNode;
  }
  createMediaStreamSource(_stream: MediaStream) {
    const source = new FakeSourceNode();
    this.sources.push(source);
    return source as unknown as MediaStreamAudioSourceNode;
  }
  async resume() {
    this.resumed = true;
    this.state = "running";
  }
  async close() {
    this.closed = true;
  }
}

describe("ScribeAudioBridge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeAudioContext.instances = [];
    vi.stubGlobal("MediaStream", FakeMediaStream);
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("window", {
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("mixes only live subscribed audio clones and never stops provider-owned tracks", async () => {
    const local = new FakeTrack();
    const subscribed = new FakeTrack();
    const unsubscribed = new FakeTrack();
    const ended = new FakeTrack();
    ended.readyState = "ended";

    const attachment = await attachScribeTracks({
      localAudioTrack: local as unknown as MediaStreamTrack,
      remoteAudioTracks: [
        {
          participantId: "subscribed",
          track: subscribed as unknown as MediaStreamTrack,
          subscribed: true,
        },
        {
          participantId: "unsubscribed",
          track: unsubscribed as unknown as MediaStreamTrack,
          subscribed: false,
        },
        {
          participantId: "ended",
          track: ended as unknown as MediaStreamTrack,
          subscribed: true,
        },
      ],
    });

    const context = FakeAudioContext.instances[0];
    expect(attachment.sourceCount).toBe(2);
    expect(local.clones).toHaveLength(1);
    expect(subscribed.clones).toHaveLength(1);
    expect(unsubscribed.clones).toHaveLength(0);
    expect(ended.clones).toHaveLength(0);
    expect(context.sources).toHaveLength(2);
    expect(
      context.sources.every(
        (source) => source.connectedTo === context.destination,
      ),
    ).toBe(true);

    await detachScribeTracks(attachment);

    expect(local.stopped).toBe(false);
    expect(subscribed.stopped).toBe(false);
    expect(local.clones[0].stopped).toBe(true);
    expect(subscribed.clones[0].stopped).toBe(true);
    expect(context.outputTrack.stopped).toBe(true);
    expect(context.sources.every((source) => source.disconnected)).toBe(true);
    expect(context.closed).toBe(true);
  });

  it("keeps cloned capture tracks aligned with provider mute and end state", async () => {
    const local = new FakeTrack();
    const attachment = await attachScribeTracks({
      localAudioTrack: local as unknown as MediaStreamTrack,
      remoteAudioTracks: [],
    });
    const clone = local.clones[0];

    local.enabled = false;
    await vi.advanceTimersByTimeAsync(100);
    expect(clone.enabled).toBe(false);

    local.enabled = true;
    local.muted = true;
    await vi.advanceTimersByTimeAsync(100);
    expect(clone.enabled).toBe(false);

    local.muted = false;
    await vi.advanceTimersByTimeAsync(100);
    expect(clone.enabled).toBe(true);

    local.readyState = "ended";
    await vi.advanceTimersByTimeAsync(100);
    expect(clone.enabled).toBe(false);
    await attachment.detach();
  });

  it("deduplicates the same live provider track and releases only Scribe-owned audio", async () => {
    const shared = new FakeTrack("shared-call-audio");

    const attachment = await attachScribeTracks({
      localAudioTrack: shared as unknown as MediaStreamTrack,
      remoteAudioTracks: [
        {
          participantId: "duplicate-provider-slot",
          track: shared as unknown as MediaStreamTrack,
          subscribed: true,
        },
      ],
    });

    const context = FakeAudioContext.instances[0];
    expect(attachment.sourceCount).toBe(1);
    expect(shared.clones).toHaveLength(1);
    expect(context.sources).toHaveLength(1);

    await attachment.detach();

    expect(shared.stopped).toBe(false);
    expect(shared.clones[0].stopped).toBe(true);
    expect(context.outputTrack.stopped).toBe(true);
    expect(context.sources[0].disconnected).toBe(true);
    expect(context.closed).toBe(true);
  });

  it("refuses to create a capture graph without authorized live call audio", async () => {
    await expect(
      attachScribeTracks({ localAudioTrack: null, remoteAudioTracks: [] }),
    ).rejects.toThrow("No authorized call audio");
    expect(FakeAudioContext.instances).toHaveLength(0);
    await expect(detachScribeTracks(null)).resolves.toBeUndefined();
  });
});
