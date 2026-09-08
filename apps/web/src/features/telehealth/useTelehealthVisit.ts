import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/client";
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
  const timerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!visitId) return;
    const generation = ++generationRef.current;
    setResult((current) => ({
      ...current,
      refreshing: true,
      error: undefined,
    }));
    try {
      const response =
        actor === "staff"
          ? await loadVisit(visitId)
          : await loadPatientVisit(visitId);
      if (generation !== generationRef.current) return;
      await reconcileAuthorization?.(response.data, response.version);
      setResult({ response, refreshing: false, stale: false });
    } catch (reason) {
      if (generation !== generationRef.current) return;
      if (reason instanceof ApiError && [401, 403, 404].includes(reason.status))
        await handleAuthorizationFailure?.(visitId, reason.status);
      if (reason instanceof ApiError && reason.status === 401) {
        window.location.replace(
          `/login?return_to=${encodeURIComponent(window.location.pathname)}`,
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
    void refresh();
    return () => {
      generationRef.current += 1;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [refresh]);

  useEffect(() => {
    if (!poll || !visitId || document.visibilityState !== "visible") return;
    const schedule = () => {
      timerRef.current = window.setTimeout(
        async () => {
          await refresh();
          schedule();
        },
        result.error ? 15_000 : 5_000,
      );
    };
    schedule();
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [poll, refresh, result.error, visitId]);

  return {
    ...result,
    refresh,
    setResponse: (response: TelehealthEnvelope<TelehealthVisit>) =>
      setResult({ response, refreshing: false, stale: false }),
  };
}
