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
import {
  createTelehealthMediaAdapter,
  type TelehealthMediaAdapter,
  type TelehealthMediaAdapterCallbacks,
} from "./mediaAdapter";
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
  audioOnly: boolean;
  audioDeviceId?: string;
  videoDeviceId?: string;
};

type TelehealthJoinInput = Omit<
  TelehealthActiveSession,
  "roomExpiresAt" | "participantId" | "providerSubjectId" | "audioOnly"
> & { audioOnly?: boolean };

type TelehealthAuthorizationStatus =
  "idle" | "checking" | "confirmed" | "stale";

type TelehealthSessionValue = {
  active: TelehealthActiveSession | null;
  callState: TelehealthCallState;
  error: string | null;
  authorizationStatus: TelehealthAuthorizationStatus;
  authorizationError: string | null;
  retrying: boolean;
  terminationNotice: string | null;
  participants: TelehealthMediaParticipant[];
  microphoneEnabled: boolean;
  cameraEnabled: boolean;
  screenShareEnabled: boolean;
  dockExpanded: boolean;
  setDockExpanded: (expanded: boolean) => void;
  join: (input: TelehealthJoinInput) => Promise<void>;
  retryConnection: () => Promise<void>;
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
  registerVisitPolling: (visitId: string) => () => void;
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
  const [retrying, setRetrying] = useState(false);
  const [terminationNotice, setTerminationNotice] = useState<string | null>(
    null,
  );
  const [participants, setParticipants] = useState<
    TelehealthMediaParticipant[]
  >([]);
  const [dockExpanded, setDockExpanded] = useState(false);
  const scribe = useOptionalScribeRecording();
  const scribeRef = useRef(scribe);
  const adapterRef = useRef<TelehealthMediaAdapter | null>(null);
  const adapterCallbacksRef = useRef<TelehealthMediaAdapterCallbacks | null>(
    null,
  );
  const generationRef = useRef(0);
  const [authorizationCycle, setAuthorizationCycle] = useState(0);
  const retryingRef = useRef(false);
  const lastAuthorizationAtRef = useRef(0);
  const visibleVisitPollerRef = useRef<{
    visitId: string;
    count: number;
  } | null>(null);
  const authorizationStopRef = useRef<(reason: string) => void>(
    () => undefined,
  );

  if (!adapterCallbacksRef.current) {
    adapterCallbacksRef.current = {
      onParticipants: setParticipants,
      onState: (state) => {
        if (state === "ended" && activeRef.current) {
          setError(
            "The video call disconnected. Request a new secure connection to rejoin this visit.",
          );
          setCallState("error");
          return;
        }
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
    };
  }
  scribeRef.current = scribe;
  authorizationStatusRef.current = authorizationStatus;

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const adapterForProvider = useCallback(
    async (
      provider: TelehealthJoinGrant["provider"],
      expectedGeneration: number,
    ) => {
      if (generationRef.current !== expectedGeneration) return null;
      const previous = adapterRef.current;
      adapterRef.current = null;
      if (previous) await previous.destroy();
      if (generationRef.current !== expectedGeneration) return null;
      // Each adapter belongs to one join attempt. Retired SDK objects can emit
      // callbacks during asynchronous disposal; they must not update a new call.
      let adapter: TelehealthMediaAdapter | null = null;
      const ownsSession = () =>
        adapter !== null &&
        generationRef.current === expectedGeneration &&
        adapterRef.current === adapter;
      adapter = await createTelehealthMediaAdapter(provider, {
        onParticipants: (participants) => {
          if (ownsSession())
            adapterCallbacksRef.current!.onParticipants(participants);
        },
        onState: (state) => {
          if (ownsSession()) adapterCallbacksRef.current!.onState(state);
        },
        onError: (message) => {
          if (ownsSession()) adapterCallbacksRef.current!.onError(message);
        },
      });
      if (generationRef.current !== expectedGeneration) {
        await adapter.destroy();
        return null;
      }
      adapterRef.current = adapter;
      return adapter;
    },
    [],
  );

  const clearTelehealthContext = useCallback(async () => {
    generationRef.current += 1;
    const adapter = adapterRef.current;
    adapterRef.current = null;
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
    setRetrying(false);
    retryingRef.current = false;
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
    const adapter = adapterRef.current;
    adapterRef.current = null;
    setCallState("leaving");
    setError(null);
    setAuthorizationStatus("idle");
    setAuthorizationError(null);
    setRetrying(false);
    retryingRef.current = false;
    if (session)
      scribeRef.current?.terminateTelehealthCapture(
        session.visitId,
        "The call ended. Scribe is saving the permitted audio segment.",
      );
    try {
      await adapter?.leave();
    } catch {
      // Local tracks are still disposed by destroy below.
    }
    await adapter?.destroy();
    if (generation === generationRef.current) {
      setParticipants([]);
      setActive(null);
      activeRef.current = null;
      setDockExpanded(false);
      setCallState("ended");
      lastAuthorizationAtRef.current = 0;
    }
    if (!notifyServer || !session) return;
    try {
      if (session.actor === "staff")
        await leaveStaffVisit(session.visitId, session.version);
      else await leavePatientVisit(session.visitId, session.version);
    } catch (reason) {
      if (generation !== generationRef.current) return;
      setError(
        reason instanceof Error
          ? `You left the media call. Meta Clinic could not confirm the server leave: ${reason.message}`
          : "You left the media call. Meta Clinic could not confirm the server leave.",
      );
    }
  }, []);

  const stopForAuthorization = useCallback(
    async (reason: string, returnToLogin = false) => {
      const session = activeRef.current;
      if (!session) return;
      const generation = ++generationRef.current;
      const adapter = adapterRef.current;
      adapterRef.current = null;
      scribeRef.current?.terminateTelehealthCapture(
        session.visitId,
        "Video visit authorization ended. Scribe is saving the permitted audio segment.",
      );
      setCallState("leaving");
      setAuthorizationStatus("idle");
      setAuthorizationError(null);
      setRetrying(false);
      retryingRef.current = false;
      setTerminationNotice(reason);
      setError(null);
      try {
        await adapter?.leave();
      } catch {
        // Leave failures still release local tracks below.
      } finally {
        try {
          await adapter?.destroy();
        } catch {
          // The local media object may already have been detached.
        }
      }
      if (generation !== generationRef.current) return;
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
        currentParticipant.status !== "admitted";
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
        const roomExpiresAt = visit.room.expires_at ?? null;
        if (
          current.version === version &&
          current.roomExpiresAt === roomExpiresAt
        )
          return current;
        const next = {
          ...current,
          version,
          roomExpiresAt,
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

  const registerVisitPolling = useCallback((visitId: string) => {
    const current = visibleVisitPollerRef.current;
    if (current?.visitId === visitId) current.count += 1;
    else visibleVisitPollerRef.current = { visitId, count: 1 };
    return () => {
      const registered = visibleVisitPollerRef.current;
      if (!registered || registered.visitId !== visitId) return;
      registered.count -= 1;
      if (registered.count <= 0) visibleVisitPollerRef.current = null;
    };
  }, []);

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
        const adapter = await adapterForProvider(grant.provider, generation);
        if (generation !== generationRef.current) return;
        if (!adapter) return;
        const session: TelehealthActiveSession = {
          ...input,
          audioOnly: input.audioOnly ?? false,
          version: response.version,
          participantId: grant.participant.id,
          providerSubjectId: grant.participant.provider_subject_id,
          roomExpiresAt: grant.room.expires_at,
        };
        lastAuthorizationAtRef.current = Date.now();
        setAuthorizationStatus("confirmed");
        activeRef.current = session;
        setActive(session);
        await adapter.join({
          roomName: grant.room_name,
          token: grant.token,
          videoEnabled: !session.audioOnly,
          audioDeviceId: session.audioDeviceId,
          videoDeviceId: session.videoDeviceId,
        });
        grant = undefined;
      } catch (reason) {
        grant = undefined;
        if (generation !== generationRef.current) return;
        const adapter = adapterRef.current;
        adapterRef.current = null;
        await adapter?.destroy();
        if (generation !== generationRef.current) return;
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
    [adapterForProvider, leave],
  );

  const retryConnection = useCallback(async () => {
    const current = activeRef.current;
    if (!current)
      throw new Error("There is no active video visit to reconnect.");
    if (retryingRef.current) return;
    retryingRef.current = true;
    const generation = ++generationRef.current;
    let grant: TelehealthJoinGrant | undefined;
    setRetrying(true);
    setError(null);
    setAuthorizationError(null);
    setAuthorizationStatus("checking");
    setCallState("reconnecting");
    setAuthorizationCycle((cycle) => cycle + 1);
    scribeRef.current?.terminateTelehealthCapture(
      current.visitId,
      "The video connection is restarting. Scribe is saving the permitted audio segment.",
    );
    setParticipants([]);
    try {
      const previousAdapter = adapterRef.current;
      adapterRef.current = null;
      await previousAdapter?.destroy();
      if (generation !== generationRef.current) return;
      const response =
        current.actor === "staff"
          ? await requestStaffJoinGrant(current.visitId, current.version)
          : await requestPatientJoinGrant(current.visitId, current.version);
      grant = response.data.join_grant;
      if (!grant)
        throw new Error(
          "Meta Clinic could not issue a new secure connection for this visit.",
        );
      if (generation !== generationRef.current) return;
      const refreshed: TelehealthActiveSession = {
        ...current,
        version: response.version,
        participantId: grant.participant.id,
        providerSubjectId: grant.participant.provider_subject_id,
        roomExpiresAt: grant.room.expires_at,
      };
      activeRef.current = refreshed;
      setActive(refreshed);
      lastAuthorizationAtRef.current = Date.now();
      setAuthorizationStatus("confirmed");
      const adapter = await adapterForProvider(grant.provider, generation);
      if (generation !== generationRef.current || !adapter) return;
      await adapter.join({
        roomName: grant.room_name,
        token: grant.token,
        videoEnabled: !refreshed.audioOnly,
        audioDeviceId: refreshed.audioDeviceId,
        videoDeviceId: refreshed.videoDeviceId,
      });
      grant = undefined;
    } catch (reason) {
      grant = undefined;
      if (generation !== generationRef.current) return;
      if (
        reason instanceof ApiError &&
        [401, 403, 404].includes(reason.status)
      ) {
        await handleAuthorizationFailure(current.visitId, reason.status);
        return;
      }
      try {
        const adapter = adapterRef.current;
        adapterRef.current = null;
        await adapter?.destroy();
      } catch {
        // The previous call object was already detached from rendered media.
      }
      if (generation !== generationRef.current) return;
      setParticipants([]);
      setAuthorizationStatus("idle");
      setCallState("error");
      setError(
        reason instanceof Error
          ? reason.message
          : "The secure video connection could not be restored.",
      );
      throw reason;
    } finally {
      if (generation === generationRef.current) {
        retryingRef.current = false;
        setRetrying(false);
      }
    }
  }, [adapterForProvider, handleAuthorizationFailure]);

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
    if (!active || callState !== "error" || retrying) return;
    const session = activeRef.current;
    if (session)
      scribeRef.current?.terminateTelehealthCapture(
        session.visitId,
        "The video connection ended. Scribe is saving the permitted audio segment.",
      );
    setParticipants([]);
    const adapter = adapterRef.current;
    adapterRef.current = null;
    void adapter?.destroy();
  }, [active, callState, retrying]);

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
      const visiblePagePoller = visibleVisitPollerRef.current;
      const visiblePageOwnsPolling =
        document.visibilityState === "visible" &&
        visiblePagePoller?.visitId === session.visitId &&
        visiblePagePoller.count > 0;
      if (visiblePageOwnsPolling) {
        const staleFor = Date.now() - lastAuthorizationAtRef.current;
        if (staleFor >= AUTHORIZATION_MAX_STALE_MS) {
          await stopForAuthorization(
            "Video visit access could not be rechecked in time, so protected media was disconnected.",
          );
          return;
        }
        if (
          staleFor >=
          AUTHORIZATION_POLL_MS + AUTHORIZATION_REQUEST_TIMEOUT_MS
        ) {
          const secondsRemaining = Math.max(
            1,
            Math.ceil((AUTHORIZATION_MAX_STALE_MS - staleFor) / 1_000),
          );
          setAuthorizationStatus("stale");
          setAuthorizationError(
            `Visit access could not be rechecked. Reconnection and media changes are blocked; the call will disconnect unless access is confirmed within ${secondsRemaining} seconds.`,
          );
        }
        schedule();
        return;
      }
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
    authorizationCycle,
    handleAuthorizationFailure,
    reconcileAuthorization,
    stopForAuthorization,
  ]);

  useEffect(() => {
    return () => {
      generationRef.current += 1;
      const session = activeRef.current;
      const adapter = adapterRef.current;
      adapterRef.current = null;
      if (session)
        scribeRef.current?.terminateTelehealthCapture(
          session.visitId,
          "Your account or clinic context changed. Scribe is saving the permitted audio segment.",
        );
      void adapter?.destroy();
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
    if (!active || callState !== "ended") return;
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
      retrying,
      terminationNotice,
      participants,
      microphoneEnabled,
      cameraEnabled,
      screenShareEnabled,
      dockExpanded,
      setDockExpanded,
      join,
      retryConnection,
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
      registerVisitPolling,
      dismissTerminationNotice: () => setTerminationNotice(null),
      canNavigate,
    }),
    [
      active,
      callState,
      error,
      authorizationStatus,
      authorizationError,
      retrying,
      terminationNotice,
      participants,
      microphoneEnabled,
      cameraEnabled,
      screenShareEnabled,
      dockExpanded,
      join,
      retryConnection,
      leave,
      clearTelehealthContext,
      updateVersion,
      performMediaAction,
      ejectParticipant,
      ejectAllRemoteParticipants,
      reconcileAuthorization,
      handleAuthorizationFailure,
      registerVisitPolling,
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
