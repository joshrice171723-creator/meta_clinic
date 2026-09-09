import type { TelehealthJoinGrant, TelehealthMediaParticipant } from "./types";

export type TelehealthMediaState =
  "joining" | "joined" | "reconnecting" | "ended" | "error";

export type TelehealthMediaAdapterCallbacks = {
  onParticipants: (participants: TelehealthMediaParticipant[]) => void;
  onState: (state: TelehealthMediaState) => void;
  onError: (message: string) => void;
};

export type TelehealthMediaJoinInput = {
  roomName: string;
  token: string;
};

export interface TelehealthMediaAdapter {
  join(input: TelehealthMediaJoinInput): Promise<void>;
  leave(): Promise<void>;
  destroy(): Promise<void>;
  setMicrophone(enabled: boolean): Promise<void>;
  setCamera(enabled: boolean): Promise<void>;
  selectInputDevice(kind: "audio" | "video", deviceId: string): Promise<void>;
  startScreenShare(): Promise<void>;
  stopScreenShare(): Promise<void>;
  ejectParticipant(providerSubjectId: string): boolean;
  ejectAllRemoteParticipants(): number;
}

export async function createTelehealthMediaAdapter(
  provider: TelehealthJoinGrant["provider"],
  callbacks: TelehealthMediaAdapterCallbacks,
): Promise<TelehealthMediaAdapter> {
  if (provider === "twilio") {
    const { TwilioMediaAdapter } = await import("./twilioAdapter");
    return new TwilioMediaAdapter(callbacks);
  }
  throw new Error(
    "This visit uses a retired video connection. Refresh the visit or contact support for help.",
  );
}
