import {
  LocalVideoTrack,
  connect,
  createLocalAudioTrack,
  createLocalVideoTrack,
  isSupported,
  type LocalAudioTrack,
  type LocalParticipant,
  type RemoteParticipant,
  type Room,
} from "twilio-video";
import type {
  TelehealthMediaAdapter,
  TelehealthMediaAdapterCallbacks,
  TelehealthMediaJoinInput,
} from "./mediaAdapter";
import type { TelehealthMediaParticipant } from "./types";

const SCREEN_TRACK_NAME = "apply-screen-share";

function localAudioTrack(participant: LocalParticipant) {
  return Array.from(participant.audioTracks.values())[0]?.track ?? null;
}

function localVideoTracks(participant: LocalParticipant) {
  return Array.from(participant.videoTracks.values());
}

function remoteAudioTrack(participant: RemoteParticipant) {
  return (
    Array.from(participant.audioTracks.values()).find(
      (publication) => publication.isSubscribed && publication.track,
    )?.track?.mediaStreamTrack ?? null
  );
}

function remoteVideoTrack(
  participant: RemoteParticipant,
  screenShare: boolean,
) {
  return (
    Array.from(participant.videoTracks.values()).find(
      (publication) =>
        publication.isSubscribed &&
        publication.track &&
        (publication.trackName === SCREEN_TRACK_NAME) === screenShare,
    )?.track?.mediaStreamTrack ?? null
  );
}

export function projectTwilioParticipants(room: Room) {
  const local = room.localParticipant;
  const localVideos = localVideoTracks(local);
  const localCamera = localVideos.find(
    (publication) => publication.trackName !== SCREEN_TRACK_NAME,
  )?.track;
  const localScreen = localVideos.find(
    (publication) => publication.trackName === SCREEN_TRACK_NAME,
  )?.track;
  const participants: TelehealthMediaParticipant[] = [
    {
      participantId: local.identity || local.sid,
      providerSubjectId: local.identity || null,
      providerSessionId: local.sid,
      displayName: null,
      role: "local",
      isLocal: true,
      audioTrack: localAudioTrack(local)?.mediaStreamTrack ?? null,
      videoTrack: localCamera?.mediaStreamTrack ?? null,
      screenVideoTrack: localScreen?.mediaStreamTrack ?? null,
      subscribed: true,
    },
  ];

  for (const participant of room.participants.values()) {
    const audioTrack = remoteAudioTrack(participant);
    const videoTrack = remoteVideoTrack(participant, false);
    const screenVideoTrack = remoteVideoTrack(participant, true);
    participants.push({
      participantId: participant.identity || participant.sid,
      providerSubjectId: participant.identity || null,
      providerSessionId: participant.sid,
      displayName: null,
      role: "remote",
      isLocal: false,
      audioTrack,
      videoTrack,
      screenVideoTrack,
      subscribed: Boolean(audioTrack || videoTrack || screenVideoTrack),
    });
  }

  return participants;
}

export class TwilioMediaAdapter implements TelehealthMediaAdapter {
  private room: Room | null = null;
  private connecting: ReturnType<typeof connect> | null = null;
  private screenTrack: LocalVideoTrack | null = null;
  private generation = 0;

  constructor(private readonly callbacks: TelehealthMediaAdapterCallbacks) {}

  private ownsRoom(room: Room, generation: number) {
    return this.room === room && this.generation === generation;
  }

  private stopUnownedTrack(
    room: Room,
    track: LocalAudioTrack | LocalVideoTrack,
  ) {
    try {
      room.localParticipant.unpublishTrack(track);
    } finally {
      track.stop();
    }
  }

  private refreshParticipants = () => {
    if (this.room)
      this.callbacks.onParticipants(projectTwilioParticipants(this.room));
  };

  private participantChanged = () => this.refreshParticipants();

  private reconnected = () => {
    if (!this.room) return;
    this.callbacks.onState("joined");
    this.refreshParticipants();
  };

  private reconnecting = () => {
    if (this.room) this.callbacks.onState("reconnecting");
  };

  private disconnected = (room: Room, error?: Error) => {
    if (this.room !== room) return;
    this.unbindRoom(room);
    this.room = null;
    const screenTrack = this.screenTrack;
    this.screenTrack = null;
    for (const publication of room.localParticipant.tracks.values())
      if (publication.track.kind !== "data") publication.track.stop();
    if (screenTrack && !screenTrack.isStopped) screenTrack.stop();
    this.callbacks.onParticipants([]);
    if (error) {
      this.callbacks.onError(
        "The video connection was interrupted. Request a new secure connection to rejoin.",
      );
      this.callbacks.onState("error");
      return;
    }
    this.callbacks.onState("ended");
  };

  private bindRoom(room: Room) {
    room.on("participantConnected", this.participantChanged);
    room.on("participantDisconnected", this.participantChanged);
    room.on("trackSubscribed", this.participantChanged);
    room.on("trackUnsubscribed", this.participantChanged);
    room.on("trackEnabled", this.participantChanged);
    room.on("trackDisabled", this.participantChanged);
    room.on("trackPublished", this.participantChanged);
    room.on("trackUnpublished", this.participantChanged);
    room.on("trackStarted", this.participantChanged);
    room.on("trackSwitchedOff", this.participantChanged);
    room.on("trackSwitchedOn", this.participantChanged);
    room.on("reconnecting", this.reconnecting);
    room.on("reconnected", this.reconnected);
    room.on("disconnected", this.disconnected);
    room.localParticipant.on("trackPublished", this.participantChanged);
    room.localParticipant.on("trackEnabled", this.participantChanged);
    room.localParticipant.on("trackDisabled", this.participantChanged);
    room.localParticipant.on("trackStopped", this.participantChanged);
  }

  private unbindRoom(room: Room) {
    room.off("participantConnected", this.participantChanged);
    room.off("participantDisconnected", this.participantChanged);
    room.off("trackSubscribed", this.participantChanged);
    room.off("trackUnsubscribed", this.participantChanged);
    room.off("trackEnabled", this.participantChanged);
    room.off("trackDisabled", this.participantChanged);
    room.off("trackPublished", this.participantChanged);
    room.off("trackUnpublished", this.participantChanged);
    room.off("trackStarted", this.participantChanged);
    room.off("trackSwitchedOff", this.participantChanged);
    room.off("trackSwitchedOn", this.participantChanged);
    room.off("reconnecting", this.reconnecting);
    room.off("reconnected", this.reconnected);
    room.off("disconnected", this.disconnected);
    room.localParticipant.off("trackPublished", this.participantChanged);
    room.localParticipant.off("trackEnabled", this.participantChanged);
    room.localParticipant.off("trackDisabled", this.participantChanged);
    room.localParticipant.off("trackStopped", this.participantChanged);
  }

  async join(input: TelehealthMediaJoinInput) {
    await this.destroy();
    if (!isSupported)
      throw new Error(
        "This browser cannot start a secure video visit. Use a current version of Chrome, Edge, Firefox, or Safari.",
      );
    if (!input.roomName.trim())
      throw new Error(
        "The server did not provide a video room for this visit.",
      );

    const generation = ++this.generation;
    this.callbacks.onState("joining");
    const connecting = connect(input.token, {
      name: input.roomName,
      audio: true,
      video: true,
      logLevel: "off",
      networkQuality: { local: 1, remote: 1 },
    });
    this.connecting = connecting;
    try {
      const room = await connecting;
      if (generation !== this.generation || this.connecting !== connecting) {
        room.disconnect();
        for (const publication of room.localParticipant.tracks.values())
          if (publication.track.kind !== "data") publication.track.stop();
        return;
      }
      this.connecting = null;
      this.room = room;
      this.bindRoom(room);
      this.callbacks.onState("joined");
      this.refreshParticipants();
    } catch (reason) {
      if (this.connecting === connecting) this.connecting = null;
      if (generation !== this.generation) return;
      await this.destroy();
      throw new Error(
        "The secure video connection could not be completed. Check your camera, microphone, and network, then try again.",
        { cause: reason },
      );
    }
  }

  async setMicrophone(enabled: boolean) {
    const room = this.room;
    if (!room)
      throw new Error("Join the visit before changing the microphone.");
    const publications = Array.from(room.localParticipant.audioTracks.values());
    if (publications.length) {
      for (const publication of publications)
        enabled ? publication.track.enable() : publication.track.disable();
    } else if (enabled) {
      const generation = this.generation;
      const track = await createLocalAudioTrack();
      if (!this.ownsRoom(room, generation)) {
        track.stop();
        return;
      }
      try {
        await room.localParticipant.publishTrack(track);
      } catch (reason) {
        track.stop();
        if (!this.ownsRoom(room, generation)) return;
        throw reason;
      }
      if (!this.ownsRoom(room, generation)) {
        this.stopUnownedTrack(room, track);
        return;
      }
    }
    this.refreshParticipants();
  }

  async setCamera(enabled: boolean) {
    const room = this.room;
    if (!room) throw new Error("Join the visit before changing the camera.");
    const publications = localVideoTracks(room.localParticipant).filter(
      (publication) => publication.trackName !== SCREEN_TRACK_NAME,
    );
    if (publications.length) {
      for (const publication of publications)
        enabled ? publication.track.enable() : publication.track.disable();
    } else if (enabled) {
      const generation = this.generation;
      const track = await createLocalVideoTrack();
      if (!this.ownsRoom(room, generation)) {
        track.stop();
        return;
      }
      try {
        await room.localParticipant.publishTrack(track);
      } catch (reason) {
        track.stop();
        if (!this.ownsRoom(room, generation)) return;
        throw reason;
      }
      if (!this.ownsRoom(room, generation)) {
        this.stopUnownedTrack(room, track);
        return;
      }
    }
    this.refreshParticipants();
  }

  async selectInputDevice(kind: "audio" | "video", deviceId: string) {
    const room = this.room;
    if (!room) throw new Error("Join the visit before changing devices.");
    const constraints: MediaTrackConstraints = {
      deviceId: { exact: deviceId },
    };
    const generation = this.generation;
    if (kind === "audio") {
      const tracks = Array.from(room.localParticipant.audioTracks.values()).map(
        (publication) => publication.track,
      );
      if (tracks.length) {
        await Promise.all(tracks.map((track) => track.restart(constraints)));
        if (!this.ownsRoom(room, generation)) {
          for (const track of tracks) track.stop();
          return;
        }
      } else {
        const track = await createLocalAudioTrack(constraints);
        if (!this.ownsRoom(room, generation)) {
          track.stop();
          return;
        }
        try {
          await room.localParticipant.publishTrack(track);
        } catch (reason) {
          track.stop();
          if (!this.ownsRoom(room, generation)) return;
          throw reason;
        }
        if (!this.ownsRoom(room, generation)) {
          this.stopUnownedTrack(room, track);
          return;
        }
      }
    } else {
      const tracks = localVideoTracks(room.localParticipant)
        .filter((publication) => publication.trackName !== SCREEN_TRACK_NAME)
        .map((publication) => publication.track);
      if (tracks.length) {
        await Promise.all(tracks.map((track) => track.restart(constraints)));
        if (!this.ownsRoom(room, generation)) {
          for (const track of tracks) track.stop();
          return;
        }
      } else {
        const track = await createLocalVideoTrack(constraints);
        if (!this.ownsRoom(room, generation)) {
          track.stop();
          return;
        }
        try {
          await room.localParticipant.publishTrack(track);
        } catch (reason) {
          track.stop();
          if (!this.ownsRoom(room, generation)) return;
          throw reason;
        }
        if (!this.ownsRoom(room, generation)) {
          this.stopUnownedTrack(room, track);
          return;
        }
      }
    }
    this.refreshParticipants();
  }

  async startScreenShare() {
    const room = this.room;
    if (!room) throw new Error("Join the visit before sharing your screen.");
    if (!navigator.mediaDevices?.getDisplayMedia)
      throw new Error("Screen sharing is not available in this browser.");
    if (this.screenTrack) return;
    const generation = this.generation;

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });
    const source = stream.getVideoTracks()[0];
    if (!source) {
      for (const track of stream.getTracks()) track.stop();
      throw new Error("No screen was selected to share.");
    }
    if (!this.ownsRoom(room, generation)) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    const screenTrack = new LocalVideoTrack(source, {
      name: SCREEN_TRACK_NAME,
    });
    this.screenTrack = screenTrack;
    screenTrack.on("stopped", () => {
      if (this.screenTrack !== screenTrack) return;
      this.room?.localParticipant.unpublishTrack(screenTrack);
      this.screenTrack = null;
      this.refreshParticipants();
    });
    try {
      await room.localParticipant.publishTrack(screenTrack);
      if (!this.ownsRoom(room, generation)) {
        if (this.screenTrack === screenTrack) this.screenTrack = null;
        this.stopUnownedTrack(room, screenTrack);
        return;
      }
      this.refreshParticipants();
    } catch (reason) {
      if (this.screenTrack === screenTrack) this.screenTrack = null;
      screenTrack.stop();
      if (!this.ownsRoom(room, generation)) return;
      throw new Error("Screen sharing could not be started.", {
        cause: reason,
      });
    }
  }

  async stopScreenShare() {
    const screenTrack = this.screenTrack;
    this.screenTrack = null;
    if (!screenTrack) return;
    this.room?.localParticipant.unpublishTrack(screenTrack);
    screenTrack.stop();
    this.refreshParticipants();
  }

  ejectParticipant(providerSubjectId: string) {
    if (!providerSubjectId.trim())
      throw new Error(
        "The server did not provide a valid media participant identity.",
      );
    // Twilio participant removal is server-authoritative. The authenticated
    // APPly mutation disconnects the matching identity through Twilio's REST API.
    return false;
  }

  ejectAllRemoteParticipants() {
    // Twilio participant removal is server-authoritative. Ending the APPly
    // visit closes remote media through the backend provider operation.
    return 0;
  }

  async leave() {
    await this.destroy();
  }

  async destroy() {
    this.generation += 1;
    const connecting = this.connecting;
    this.connecting = null;
    connecting?.cancel();

    const room = this.room;
    this.room = null;
    const screenTrack = this.screenTrack;
    this.screenTrack = null;
    if (room) {
      this.unbindRoom(room);
      room.disconnect();
      for (const publication of room.localParticipant.tracks.values())
        if (publication.track.kind !== "data") publication.track.stop();
    }
    if (screenTrack && !screenTrack.isStopped) screenTrack.stop();
    this.callbacks.onParticipants([]);
  }
}
