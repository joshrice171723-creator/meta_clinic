import DailyIframe, {
  type DailyCall,
  type DailyParticipant,
} from "@daily-co/daily-js";
import type { TelehealthMediaParticipant } from "./types";

type DailyTrackProjection = {
  state?: string;
  persistentTrack?: MediaStreamTrack | null;
};

type DailyParticipantProjection = DailyParticipant & {
  user_id?: string;
  user_name?: string;
  audioTrack?: MediaStreamTrack | null;
  videoTrack?: MediaStreamTrack | null;
  screenVideoTrack?: MediaStreamTrack | null;
  tracks?: {
    audio?: DailyTrackProjection;
    video?: DailyTrackProjection;
    screenVideo?: DailyTrackProjection;
  };
};

function participantTrack(
  participant: DailyParticipantProjection,
  kind: "audio" | "video" | "screenVideo",
) {
  const projection = participant.tracks?.[kind];
  if (projection && projection.state !== "playable") return null;
  const modern = projection?.persistentTrack;
  if (modern) return modern;
  if (kind === "audio") return participant.audioTrack ?? null;
  if (kind === "video") return participant.videoTrack ?? null;
  return participant.screenVideoTrack ?? null;
}

export function projectDailyParticipants(call: DailyCall) {
  return Object.values(call.participants()).map((value) => {
    const participant = value as DailyParticipantProjection;
    const audioTrack = participantTrack(participant, "audio");
    const videoTrack = participantTrack(participant, "video");
    const screenVideoTrack = participantTrack(participant, "screenVideo");
    return {
      participantId: participant.user_id || participant.session_id,
      providerSubjectId: participant.user_id || null,
      providerSessionId: participant.session_id,
      displayName: participant.user_name || null,
      role: participant.local ? "local" : "remote",
      isLocal: participant.local,
      audioTrack,
      videoTrack,
      screenVideoTrack,
      subscribed: participant.local || Boolean(audioTrack || videoTrack),
    } satisfies TelehealthMediaParticipant;
  });
}

export type DailyAdapterCallbacks = {
  onParticipants: (participants: TelehealthMediaParticipant[]) => void;
  onState: (
    state: "joining" | "joined" | "reconnecting" | "ended" | "error",
  ) => void;
  onError: (message: string) => void;
};

export class DailyMediaAdapter {
  private call: DailyCall | null = null;
  private callbacks: DailyAdapterCallbacks;

  constructor(callbacks: DailyAdapterCallbacks) {
    this.callbacks = callbacks;
  }

  private refreshParticipants = () => {
    if (this.call)
      this.callbacks.onParticipants(projectDailyParticipants(this.call));
  };

  private joined = () => {
    this.callbacks.onState("joined");
    this.refreshParticipants();
  };

  private left = () => {
    this.callbacks.onState("ended");
    this.callbacks.onParticipants([]);
  };

  private networkChanged = (event: { threshold?: string }) => {
    if (event.threshold === "very-low") this.callbacks.onState("reconnecting");
    else if (this.call?.meetingState() === "joined-meeting")
      this.callbacks.onState("joined");
  };

  private failed = (event: { errorMsg?: string }) => {
    this.callbacks.onError(
      event.errorMsg || "The video connection could not be completed.",
    );
    this.callbacks.onState("error");
  };

  async join(input: {
    roomUrl: string;
    token: string;
    displayName?: string | null;
  }) {
    await this.destroy();
    const call = DailyIframe.createCallObject({
      subscribeToTracksAutomatically: true,
      dailyConfig: { avoidEval: true },
    });
    this.call = call;
    call.on("participant-joined", this.refreshParticipants);
    call.on("participant-updated", this.refreshParticipants);
    call.on("participant-left", this.refreshParticipants);
    call.on("track-started", this.refreshParticipants);
    call.on("track-stopped", this.refreshParticipants);
    call.on("joined-meeting", this.joined);
    call.on("left-meeting", this.left);
    call.on("network-quality-change", this.networkChanged);
    call.on("error", this.failed);
    this.callbacks.onState("joining");
    try {
      await call.join({
        url: input.roomUrl,
        token: input.token,
        userName: input.displayName || undefined,
      });
      this.refreshParticipants();
    } catch (error) {
      await this.destroy();
      throw error;
    }
  }

  async setMicrophone(enabled: boolean) {
    if (!this.call)
      throw new Error("Join the visit before changing the microphone.");
    await this.call.setLocalAudio(enabled);
    this.refreshParticipants();
  }

  async setCamera(enabled: boolean) {
    if (!this.call)
      throw new Error("Join the visit before changing the camera.");
    await this.call.setLocalVideo(enabled);
    this.refreshParticipants();
  }

  async selectInputDevice(kind: "audio" | "video", deviceId: string) {
    if (!this.call) throw new Error("Join the visit before changing devices.");
    await this.call.setInputDevicesAsync(
      kind === "audio"
        ? { audioDeviceId: deviceId }
        : { videoDeviceId: deviceId },
    );
    this.refreshParticipants();
  }

  async startScreenShare() {
    if (!this.call)
      throw new Error("Join the visit before sharing your screen.");
    await this.call.startScreenShare();
    this.refreshParticipants();
  }

  async stopScreenShare() {
    if (!this.call) return;
    await this.call.stopScreenShare();
    this.refreshParticipants();
  }

  ejectParticipant(providerSubjectId: string) {
    if (!providerSubjectId.trim())
      throw new Error(
        "The server did not provide a valid media participant identity.",
      );
    if (!this.call) return false;
    const participant = Object.values(this.call.participants()).find(
      (value) => {
        const candidate = value as DailyParticipantProjection;
        return !candidate.local && candidate.user_id === providerSubjectId;
      },
    );
    if (!participant) return false;
    this.call.updateParticipant(participant.session_id, { eject: true });
    return true;
  }

  ejectAllRemoteParticipants() {
    if (!this.call) return 0;
    const participants = Object.values(this.call.participants()).filter(
      (participant) => !participant.local,
    );
    let firstError: unknown;
    for (const participant of participants) {
      try {
        this.call.updateParticipant(participant.session_id, { eject: true });
      } catch (error) {
        firstError ??= error;
      }
    }
    if (firstError) throw firstError;
    return participants.length;
  }

  async leave() {
    if (!this.call) return;
    try {
      if (this.call.meetingState() !== "left-meeting") await this.call.leave();
    } finally {
      await this.destroy();
    }
  }

  async destroy() {
    const call = this.call;
    this.call = null;
    if (!call) return;
    call.off("participant-joined", this.refreshParticipants);
    call.off("participant-updated", this.refreshParticipants);
    call.off("participant-left", this.refreshParticipants);
    call.off("track-started", this.refreshParticipants);
    call.off("track-stopped", this.refreshParticipants);
    call.off("joined-meeting", this.joined);
    call.off("left-meeting", this.left);
    call.off("network-quality-change", this.networkChanged);
    call.off("error", this.failed);
    if (!call.isDestroyed()) await call.destroy();
    this.callbacks.onParticipants([]);
  }
}
