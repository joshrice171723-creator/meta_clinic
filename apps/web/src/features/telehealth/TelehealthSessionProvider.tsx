import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  leavePatientVisit,
  leaveStaffVisit,
  loadPatientVisit,
  loadVisit,
  requestPatientJoinGrant,
  requestStaffJoinGrant,
} from "./api";
import { ApiError } from "../../api/client";
import { DailyMediaAdapter } from "./dailyAdapter";
import { useOptionalScribeRecording } from "../scribe/ScribeRecordingProvider";
import type {
  TelehealthActor,
  TelehealthCallState,
  TelehealthJoinGrant,
  TelehealthMediaParticipant,
  TelehealthVisit,
} from "./types";

export type TelehealthActiveSession = {
  visitId: string;
  actor: TelehealthActor;
  version: number;
  participantId: string;
  providerSubjectId: string;
  patientId: number;
  patientName: string;
  encounterId: number | null;
  returnPath: string;
  roomExpiresAt: string | null;
};

type TelehealthJoinInput = Omit<
  TelehealthActiveSession,
  "roomExpiresAt" | "participantId" | "providerSubjectId"
>;

type TelehealthAuthorizationStatus =
  "idle" | "checking" | "confirmed" | "stale";

type TelehealthSessionValue = {
  active: TelehealthActiveSession | null;
  callState: TelehealthCallState;
  error: string | null;
  authorizationStatus: TelehealthAuthorizationStatus;
  authorizationError: string | null;
  terminationNotice: string | null;
  participants: TelehealthMediaParticipant[];
  microphoneEnabled: boolean;
  cameraEnabled: boolean;
  screenShareEnabled: boolean;
  dockExpanded: boolean;
  setDockExpanded: (expanded: boolean) => void;
  join: (input: TelehealthJoinInput) => Promise<void>;
  leave: (notifyServer?: boolean) => Promise<void>;
  clearTelehealthContext: () => Promise<void>;
  updateVersion: (version: number) => void;
  toggleMicrophone: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  selectInputDevice: (
    kind: "audio" | "video",
    deviceId: string,
  ) => Promise<void>;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => Promise<void>;
  ejectParticipant: (providerSubjectId: string) => Promise<boolean>;
  ejectAllRemoteParticipants: () => Promise<number>;
  reconcileAuthorization: (
    visit: TelehealthVisit,
    version: number,
  ) => Promise<void>;
  handleAuthorizationFailure: (
    visitId: string,
    status: number,
  ) => Promise<void>;
  dismissTerminationNotice: () => void;
  canNavigate: (href: string) => boolean;
};

const TelehealthSessionContext = createContext<TelehealthSessionValue | null>(
  null,
);

const AUTHORIZATION_POLL_MS = 5_000;
const AUTHORIZATION_REQUEST_TIMEOUT_MS = 5_000;
const AUTHORIZATION_MAX_STALE_MS = 20_000;

function pathPatientId(path: string) {
  const match = /^\/clinic\/patients\/(\d+)(?:\/|$)/.exec(path);
  return match ? Number(match[1]) : null;
}

function localParticipant(participants: TelehealthMediaParticipant[]) {
  return participants.find((participant) => participant.isLocal);
}

export function TelehealthSessionProvider({
  children,
  contextKey,
  path,
}: {
  children: ReactNode;
  contextKey: string;
  path?: string;
}) {
  const [active, setActive] = useState<TelehealthActiveSession | null>(null);
  const activeRef = useRef<TelehealthActiveSession | null>(null);
  const [callState, setCallState] = useState<TelehealthCallState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [authorizationStatus, setAuthorizationStatus] =
    useState<TelehealthAuthorizationStatus>("idle");
  const authorizationStatusRef = useRef<TelehealthAuthorizationStatus>("idle");
  const [authorizationError, setAuthorizationError] = useState<string | null>(
    null,
  );
  const [terminationNotice, setTerminationNotice] = useState<string | null>(
    null,
  );
  const [participants, setParticipants] = useState<
    TelehealthMediaParticipant[]
  >([]);
  const [dockExpanded, setDockExpanded] = useState(false);
  const scribe = useOptionalScribeRecording();
  const scribeRef = useRef(scribe);
  const adapterRef = useRef<DailyMediaAdapter | null>(null);
  const generationRef = useRef(0);
  const lastAuthorizationAtRef = useRef(0);
  const authorizationStopRef = useRef<(reason: string) => void>(
    () => undefined,
  );

  if (!adapterRef.current) {
    adapterRef.current = new DailyMediaAdapter({
      onParticipants: setParticipants,
      onState: (state) => {
        if (
          state === "reconnecting" &&
          authorizationStatusRef.current === "stale"
        ) {
          authorizationStopRef.current(
            "The media connection was interrupted while visit access was unconfirmed, so protected media was disconnected.",
          );
          return;
        }
        setCallState(state);
      },
      onError: setError,
    });
  }
  scribeRef.current = scribe;
  authorizationStatusRef.current = authorizationStatus;

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const clearTelehealthContext = useCallback(async () => {
    generationRef.current += 1;
    const adapter = adapterRef.current;
    const session = activeRef.current;
    if (session)
      scribeRef.current?.terminateTelehealthCapture(
        session.visitId,
        "Video visit context changed. Scribe is saving the permitted audio segment.",
      );
    setActive(null);
    activeRef.current = null;
    setParticipants([]);
    setCallState("idle");
    setAuthorizationStatus("idle");
    setAuthorizationError(null);
    setTerminationNotice(null);
    lastAuthorizationAtRef.current = 0;
    setDockExpanded(false);
    setError(null);
    await adapter?.destroy();
    if (session) {
      const request =
        session.actor === "staff"
          ? leaveStaffVisit(session.visitId, session.version)
          : leavePatientVisit(session.visitId, session.version);
      void request.catch(() => undefined);
    }
  }, []);

  const leave = useCallback(async (notifyServer = true) => {
    const session = activeRef.current;
    const generation = ++generationRef.current;
    setCallState("leaving");
    setError(null);
    setAuthorizationStatus("idle");
    setAuthorizationError(null);
    if (session)
      scribeRef.current?.terminateTelehealthCapture(
        session.visitId,
        "The call ended. Scribe is saving the permitted audio segment.",
      );
    try {
      await adapterRef.current?.leave();
    } catch {
      // Local tracks are still disposed by destroy below.
    }
    await adapterRef.current?.destroy();
    setParticipants([]);
    setActive(null);
    activeRef.current = null;
    setDockExpanded(false);
    setCallState("ended");
    lastAuthorizationAtRef.current = 0;
    if (!notifyServer || !session) return;
    try {
      if (session.actor === "staff")
        await leaveStaffVisit(session.visitId, session.version);
      else await leavePatientVisit(session.visitId, session.version);
    } catch (reason) {
      if (generation !== generationRef.current) return;
      setError(
        reason instanceof Error
          ? `You left the media call. APPly could not confirm the server leave: ${reason.message}`
          : "You left the media call. APPly could not confirm the server leave.",
      );
    }
  }, []);

  const stopForAuthorization = useCallback(
    async (reason: string, returnToLogin = false) => {
      const session = activeRef.current;
      if (!session) return;
      generationRef.current += 1;
      scribeRef.current?.terminateTelehealthCapture(
        session.visitId,
        "Video visit authorization ended. Scribe is saving the permitted audio segment.",
      );
      setCallState("leaving");
      setAuthorizationStatus("idle");
      setAuthorizationError(null);
      setTerminationNotice(reason);
      setError(null);
      try {
        await adapterRef.current?.leave();
      } catch {
        await adapterRef.current?.destroy();
      }
      setParticipants([]);
      setActive(null);
      activeRef.current = null;
      setDockExpanded(false);
      setCallState("ended");
      lastAuthorizationAtRef.current = 0;
      if (returnToLogin)
        window.location.replace(
          `/login?return_to=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`,
        );
    },
    [],
  );
  authorizationStopRef.current = (reason) => void stopForAuthorization(reason);

  const reconcileAuthorization = useCallback(
    async (visit: TelehealthVisit, version: number) => {
      const session = activeRef.current;
      if (!session || session.visitId !== visit.public_id) return;
      const currentParticipant = visit.participants.find(
        (participant) =>
          participant.is_current && participant.id === session.participantId,
      );
      const participantRevoked =
        !currentParticipant ||
        currentParticipant.provider_subject_id !== session.providerSubjectId ||
        currentParticipant.status === "removed" ||
        currentParticipant.status === "left";
      const visitClosed =
        ["ending", "ended", "cancelled", "no_show"].includes(visit.status) ||
        ["ending", "ended", "failed"].includes(visit.room.status) ||
        visit.access_state === "unavailable" ||
        visit.access_state === "ended";
      if (participantRevoked || visitClosed) {
        await stopForAuthorization(
          participantRevoked
            ? "Video visit access ended because your participant authorization was removed."
            : "Video visit media ended because the server closed this visit room.",
        );
        return;
      }
      lastAuthorizationAtRef.current = Date.now();
      setAuthorizationStatus("confirmed");
      setAuthorizationError(null);
      setActive((current) => {
        if (!current || current.visitId !== session.visitId) return current;
        const next = {
          ...current,
          version,
          roomExpiresAt: visit.room.expires_at ?? null,
        };
        activeRef.current = next;
        return next;
      });
    },
    [stopForAuthorization],
  );

  const handleAuthorizationFailure = useCallback(
    async (visitId: string, status: number) => {
      if (
        activeRef.current?.visitId !== visitId ||
        ![401, 403, 404].includes(status)
      )
        return;
      await stopForAuthorization(
        status === 401
          ? "Your sign-in expired, so the video visit was disconnected."
          : "Video visit access is no longer authorized.",
        status === 401,
      );
    },
    [stopForAuthorization],
  );

  const join = useCallback(
    async (input: TelehealthJoinInput) => {
      if (activeRef.current && activeRef.current.visitId !== input.visitId)
        await leave(true);
      const generation = ++generationRef.current;
      setError(null);
      setAuthorizationError(null);
      setAuthorizationStatus("checking");
      setTerminationNotice(null);
      setCallState("joining");
      let grant: TelehealthJoinGrant | undefined;
      try {
        const response =
          input.actor === "staff"
            ? await requestStaffJoinGrant(input.visitId, input.version)
            : await requestPatientJoinGrant(input.visitId, input.version);
        grant = response.data.join_grant;
        if (!grant)
          throw new Error(
            "The server did not issue media access for this visit.",
          );
        if (generation !== generationRef.current) return;
        const session: TelehealthActiveSession = {
          ...input,
          version: response.version,
          participantId: grant.participant.id,
          providerSubjectId: grant.participant.provider_subject_id,
          roomExpiresAt: grant.room.expires_at,
        };
        lastAuthorizationAtRef.current = Date.now();
        setAuthorizationStatus("confirmed");
        activeRef.current = session;
        setActive(session);
        await adapterRef.current?.join({
          roomUrl: grant.room_url,
          token: grant.token,
          displayName: input.actor === "patient" ? "Patient" : "Care team",
        });
        grant = undefined;
      } catch (reason) {
        grant = undefined;
        if (generation !== generationRef.current) return;
        await adapterRef.current?.destroy();
        setActive(null);
        activeRef.current = null;
        setCallState("error");
        setAuthorizationStatus("idle");
        lastAuthorizationAtRef.current = 0;
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to join the video visit.",
        );
        throw reason;
      }
    },
    [leave],
  );

  const updateVersion = useCallback((version: number) => {
    setActive((current) => {
      if (!current) return current;
      if (current.version === version) return current;
      const next = { ...current, version };
      activeRef.current = next;
      return next;
    });
  }, []);

  const performMediaAction = useCallback(
    async (action: () => Promise<void>) => {
      setError(null);
      try {
        if (authorizationStatusRef.current !== "confirmed")
          throw new Error(
            "Media changes are blocked until visit access is confirmed.",
          );
        await action();
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "The media setting did not change.",
        );
        throw reason;
      }
    },
    [],
  );

  const ejectParticipant = useCallback(async (providerSubjectId: string) => {
    if (activeRef.current?.actor !== "staff")
      throw new Error(
        "Only the authorized care team can remove a media participant.",
      );
    return adapterRef.current?.ejectParticipant(providerSubjectId) ?? false;
  }, []);

  const ejectAllRemoteParticipants = useCallback(async () => {
    if (activeRef.current?.actor !== "staff")
      throw new Error(
        "Only the authorized care team can end remote media sessions.",
      );
    return adapterRef.current?.ejectAllRemoteParticipants() ?? 0;
  }, []);

  const microphoneEnabled = Boolean(
    localParticipant(participants)?.audioTrack?.enabled,
  );
  const cameraEnabled = Boolean(
    localParticipant(participants)?.videoTrack?.enabled,
  );
  const screenShareEnabled = Boolean(
    localParticipant(participants)?.screenVideoTrack,
  );

  const canNavigate = useCallback(
    (href: string) => {
      if (!active) return true;
      const target = new URL(href, window.location.origin);
      const targetPatientId = pathPatientId(target.pathname);
      return targetPatientId === null || targetPatientId === active.patientId;
    },
    [active],
  );

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer: number | null = null;
    let request: AbortController | null = null;
    const sessionGeneration = generationRef.current;

    const schedule = (delay = AUTHORIZATION_POLL_MS) => {
      timer = window.setTimeout(() => void pollAuthorization(), delay);
    };

    const pollAuthorization = async () => {
      const session = activeRef.current;
      if (
        cancelled ||
        !session ||
        generationRef.current !== sessionGeneration ||
        session.visitId !== active.visitId
      )
        return;
      request = new AbortController();
      const requestTimeout = window.setTimeout(
        () => request?.abort(),
        AUTHORIZATION_REQUEST_TIMEOUT_MS,
      );
      try {
        const response =
          session.actor === "staff"
            ? await loadVisit(session.visitId, request.signal)
            : await loadPatientVisit(session.visitId, request.signal);
        if (
          cancelled ||
          generationRef.current !== sessionGeneration ||
          activeRef.current?.visitId !== session.visitId
        )
          return;
        await reconcileAuthorization(response.data, response.version);
      } catch (reason) {
        if (
          cancelled ||
          generationRef.current !== sessionGeneration ||
          activeRef.current?.visitId !== session.visitId
        )
          return;
        if (
          reason instanceof ApiError &&
          [401, 403, 404].includes(reason.status)
        ) {
          await handleAuthorizationFailure(session.visitId, reason.status);
          return;
        }
        const staleFor = Date.now() - lastAuthorizationAtRef.current;
        if (staleFor >= AUTHORIZATION_MAX_STALE_MS) {
          await stopForAuthorization(
            "Video visit access could not be rechecked in time, so protected media was disconnected.",
          );
          return;
        }
        const secondsRemaining = Math.max(
          1,
          Math.ceil((AUTHORIZATION_MAX_STALE_MS - staleFor) / 1_000),
        );
        setAuthorizationStatus("stale");
        setAuthorizationError(
          `Visit access could not be rechecked. Reconnection and media changes are blocked; the call will disconnect unless access is confirmed within ${secondsRemaining} seconds.`,
        );
      } finally {
        window.clearTimeout(requestTimeout);
        request = null;
        if (
          !cancelled &&
          generationRef.current === sessionGeneration &&
          activeRef.current?.visitId === active.visitId
        )
          schedule();
      }
    };

    schedule();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      request?.abort();
    };
  }, [
    active?.actor,
    active?.visitId,
    handleAuthorizationFailure,
    reconcileAuthorization,
    stopForAuthorization,
  ]);

  useEffect(() => {
    return () => {
      const session = activeRef.current;
      if (session)
        scribeRef.current?.terminateTelehealthCapture(
          session.visitId,
          "Your account or clinic context changed. Scribe is saving the permitted audio segment.",
        );
      void adapterRef.current?.destroy();
      if (session) {
        const request =
          session.actor === "staff"
            ? leaveStaffVisit(session.visitId, session.version)
            : leavePatientVisit(session.visitId, session.version);
        void request.catch(() => undefined);
      }
      activeRef.current = null;
    };
  }, [contextKey]);

  useEffect(() => {
    if (!active || (callState !== "ended" && callState !== "error")) return;
    scribeRef.current?.terminateTelehealthCapture(
      active.visitId,
      "Call media ended. Scribe is saving the permitted audio segment.",
    );
  }, [active, callState]);

  useEffect(() => {
    if (!path || !active) return;
    const selected = pathPatientId(path);
    if (selected !== null && selected !== active.patientId) void leave(true);
  }, [active, leave, path]);

  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);

  const value = useMemo<TelehealthSessionValue>(
    () => ({
      active,
      callState,
      error,
      authorizationStatus,
      authorizationError,
      terminationNotice,
      participants,
      microphoneEnabled,
      cameraEnabled,
      screenShareEnabled,
      dockExpanded,
      setDockExpanded,
      join,
      leave,
      clearTelehealthContext,
      updateVersion,
      toggleMicrophone: () =>
        performMediaAction(() =>
          adapterRef.current!.setMicrophone(!microphoneEnabled),
        ),
      toggleCamera: () =>
        performMediaAction(() => adapterRef.current!.setCamera(!cameraEnabled)),
      selectInputDevice: (kind, deviceId) =>
        performMediaAction(() =>
          adapterRef.current!.selectInputDevice(kind, deviceId),
        ),
      startScreenShare: () =>
        performMediaAction(() => adapterRef.current!.startScreenShare()),
      stopScreenShare: () =>
        performMediaAction(() => adapterRef.current!.stopScreenShare()),
      ejectParticipant,
      ejectAllRemoteParticipants,
      reconcileAuthorization,
      handleAuthorizationFailure,
      dismissTerminationNotice: () => setTerminationNotice(null),
      canNavigate,
    }),
    [
      active,
      callState,
      error,
      authorizationStatus,
      authorizationError,
      terminationNotice,
      participants,
      microphoneEnabled,
      cameraEnabled,
      screenShareEnabled,
      dockExpanded,
      join,
      leave,
      clearTelehealthContext,
      updateVersion,
      performMediaAction,
      ejectParticipant,
      ejectAllRemoteParticipants,
      reconcileAuthorization,
      handleAuthorizationFailure,
      canNavigate,
    ],
  );

  return (
    <TelehealthSessionContext value={value}>
      {children}
    </TelehealthSessionContext>
  );
}

export function useTelehealthSession() {
  const value = useContext(TelehealthSessionContext);
  if (!value)
    throw new Error(
      "Telehealth pages require the authenticated telehealth session provider.",
    );
  return value;
}

export function useOptionalTelehealthSession() {
  return useContext(TelehealthSessionContext);
}
