import { useEffect, useState } from "react";
import { api } from "../../api/client";

export type InboxSource<T> = { loading: boolean; data?: T; error?: string };
export type InboxPage = { page: number; per_page: number; total: number };

export function freshInboxPages(scope: string) {
  return {
    scope,
    staff: 1,
    encounters: 1,
    renewals: 1,
    labReview: 1,
    labFollowUp: 1,
  };
}

export function visibleInboxSource<T>(
  key: string,
  enabled: boolean,
  result: { key: string } & InboxSource<T>,
): InboxSource<T> {
  if (!enabled) return { loading: false };
  return result.key === key ? result : { loading: true };
}

export function inboxPageCount(page: InboxPage) {
  return Math.max(1, Math.ceil(page.total / page.per_page));
}

// Bind rows to the complete source scope before rendering, not after an effect.
export function usePagedInboxSource<T>(
  path: string,
  enabled: boolean,
  revision: number,
  scope: string,
) {
  const key = JSON.stringify([path, scope]);
  const [result, setResult] = useState<{ key: string } & InboxSource<T>>({
    key: "",
    loading: enabled,
  });
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    setResult((current) => ({
      ...(current.key === key ? current : { key }),
      loading: true,
      error: undefined,
    }));
    api<T>(path, { signal: abort.signal })
      .then((data) => {
        if (!abort.signal.aborted) setResult({ key, loading: false, data });
      })
      .catch((reason: unknown) => {
        if (!abort.signal.aborted)
          setResult((current) => ({
            ...(current.key === key ? current : { key }),
            key,
            loading: false,
            error:
              reason instanceof Error ? reason.message : "Queue unavailable",
          }));
      });
    return () => abort.abort();
  }, [enabled, key, path, revision]);
  return visibleInboxSource(key, enabled, result);
}
