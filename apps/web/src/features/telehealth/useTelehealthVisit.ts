import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, loginDestination } from "../../api/client";
import { useVisiblePolling } from "./useVisiblePolling";
import { loadPatientVisit, loadVisit } from "./api";
import { useOptionalTelehealthSession } from "./TelehealthSessionProvider";
import type {
  TelehealthActor,
  TelehealthEnvelope,
  TelehealthVisit,
} from "./types";

export function useTelehealthVisit(
  actor: TelehealthActor,
  visitId: string | null,
  { poll = false }: { poll?: boolean } = {},
) {
  const session = useOptionalTelehealthSession();
  const reconcileAuthorization = session?.reconcileAuthorization;
  const handleAuthorizationFailure = session?.handleAuthorizationFailure;
  const [result, setResult] = useState<{
    response?: TelehealthEnvelope<TelehealthVisit>;
    error?: string;
    refreshing: boolean;
    stale: boolean;
  }>({ refreshing: true, stale: false });
  const generationRef = useRef(0);
  const requestRef = useRef<AbortController | null>(null);
  const responseScopeRef = useRef<string | null>(null);
  const scope = `${actor}:${visitId}`;

  const refresh = useCallback(async () => {
    if (!visitId) return;
    const generation = ++generationRef.current;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setResult((current) => ({
      ...current,
      refreshing: true,
      error: undefined,
    }));
    try {
      const response =
        actor === "staff"
          ? await loadVisit(visitId, controller.signal)
          : await loadPatientVisit(visitId, controller.signal);
      if (generation !== generationRef.current) return;
      await reconcileAuthorization?.(response.data, response.version);
      if (generation !== generationRef.current) return;
      responseScopeRef.current = `${actor}:${visitId}`;
      setResult({ response, refreshing: false, stale: false });
    } catch (reason) {
      if (generation !== generationRef.current) return;
      if (
        reason instanceof ApiError &&
        [401, 403, 404].includes(reason.status)
      ) {
        setResult({ refreshing: false, stale: false, error: reason.message });
        await handleAuthorizationFailure?.(visitId, reason.status);
        if (generation !== generationRef.current) return;
        if (reason.status !== 401) return;
      }
      if (reason instanceof ApiError && reason.status === 401) {
        window.location.replace(
          `/login?next=${encodeURIComponent(loginDestination(window.location.pathname))}`,
        );
        return;
      }
      setResult((current) => ({
        ...current,
        refreshing: false,
        stale: Boolean(current.response),
        error:
          reason instanceof Error
            ? reason.message
            : "Unable to load this video visit.",
      }));
    }
  }, [actor, handleAuthorizationFailure, reconcileAuthorization, visitId]);

  useEffect(() => {
    generationRef.current += 1;
    if (responseScopeRef.current !== scope)
      setResult({ refreshing: Boolean(visitId), stale: false });
    void refresh();
    return () => {
      generationRef.current += 1;
      requestRef.current?.abort();
    };
  }, [refresh, scope, visitId]);

  useVisiblePolling(
    refresh,
    poll && Boolean(visitId),
    result.error ? 15_000 : 5_000,
  );

  return {
    ...result,
    response: responseScopeRef.current === scope ? result.response : undefined,
    refresh,
    setResponse: (response: TelehealthEnvelope<TelehealthVisit>) => {
      if (response.data.public_id !== visitId) return;
      generationRef.current += 1;
      requestRef.current?.abort();
      responseScopeRef.current = scope;
      setResult({ response, refreshing: false, stale: false });
    },
  };
}
