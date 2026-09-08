export type ScribeRemoteAudioTrack = {
  participantId: string;
  displayName?: string | null;
  track: MediaStreamTrack;
  subscribed: boolean;
};

export type ScribeAudioBridgeInput = {
  localAudioTrack: MediaStreamTrack | null;
  remoteAudioTracks: readonly ScribeRemoteAudioTrack[];
};

export type ScribeAudioAttachment = {
  stream: MediaStream;
  sourceCount: number;
  detach: () => Promise<void>;
};

type AttachedTrack = {
  original: MediaStreamTrack;
  clone: MediaStreamTrack;
  source: MediaStreamAudioSourceNode;
};

function permittedTracks(input: ScribeAudioBridgeInput) {
  const remote = input.remoteAudioTracks
    .filter(({ subscribed, track }) => subscribed && track.kind === "audio")
    .map(({ track }) => track);
  return [input.localAudioTrack, ...remote].filter(
    (track): track is MediaStreamTrack =>
      Boolean(track && track.kind === "audio" && track.readyState === "live"),
  );
}

/**
 * Creates a Scribe-owned, audio-only mix from call-provider tracks.
 *
 * The provider retains ownership of every original track. Detaching this bridge
 * stops only cloned tracks and never connects the capture graph to speakers.
 */
export async function attachScribeTracks(
  input: ScribeAudioBridgeInput,
): Promise<ScribeAudioAttachment> {
  const originals = permittedTracks(input);
  if (originals.length === 0)
    throw new Error("No authorized call audio is available for Scribe.");

  const context = new AudioContext();
  const destination = context.createMediaStreamDestination();
  const attached: AttachedTrack[] = [];
  let syncTimer: number | null = null;
  let detached = false;

  try {
    for (const original of originals) {
      const clone = original.clone();
      clone.enabled = original.enabled;
      const source = context.createMediaStreamSource(new MediaStream([clone]));
      source.connect(destination);
      attached.push({ original, clone, source });
    }
    if (context.state === "suspended") await context.resume();

    // Provider mute controls commonly toggle `enabled` without replacing the
    // track. Keep clones aligned so muted periods are not captured.
    syncTimer = window.setInterval(() => {
      for (const { original, clone } of attached) {
        clone.enabled =
          original.enabled && original.readyState === "live" && !original.muted;
      }
    }, 100);

    const detach = async () => {
      if (detached) return;
      detached = true;
      if (syncTimer !== null) window.clearInterval(syncTimer);
      syncTimer = null;
      for (const { clone, source } of attached) {
        try {
          source.disconnect();
        } catch {
          // The graph may already be disconnected after a provider teardown.
        }
        clone.stop();
      }
      destination.stream.getTracks().forEach((track) => track.stop());
      await context.close().catch(() => undefined);
    };

    return {
      stream: destination.stream,
      sourceCount: attached.length,
      detach,
    };
  } catch (error) {
    if (syncTimer !== null) window.clearInterval(syncTimer);
    for (const { clone, source } of attached) {
      try {
        source.disconnect();
      } catch {
        // Continue releasing the remaining cloned inputs.
      }
      clone.stop();
    }
    destination.stream.getTracks().forEach((track) => track.stop());
    await context.close().catch(() => undefined);
    throw error;
  }
}

export async function detachScribeTracks(
  attachment: ScribeAudioAttachment | null,
) {
  await attachment?.detach();
}
