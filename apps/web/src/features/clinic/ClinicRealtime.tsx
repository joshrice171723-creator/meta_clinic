import Alert from "@mui/material/Alert";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { clinicRealtimeSession, SESSION_CHANGED_EVENT } from "../../api/client";

export type ClinicRealtimeTopic =
  "tracking_board" | "work_inbox" | "telehealth_queue" | "staff_messaging";

type ConnectionState =
  | "inactive"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "authorization_required";

type RealtimeContextValue = {
  state: ConnectionState;
  subscriptionCount: number;
  subscribe: (topic: ClinicRealtimeTopic, listener: () => void) => () => void;
};

const EMPTY_CONTEXT: RealtimeContextValue = {
  state: "inactive",
  subscriptionCount: 0,
  subscribe: () => () => undefined,
};
const ClinicRealtimeContext = createContext(EMPTY_CONTEXT);
const ALL_TOPICS: ClinicRealtimeTopic[] = [
  "tracking_board",
  "work_inbox",
  "telehealth_queue",
  "staff_messaging",
];

function parseEvent(block: string): { event: string; data: string } {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  return { event, data: data.join("\n") };
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = window.setTimeout(done, ms);
    function done() {
      signal.removeEventListener("abort", abort);
      resolve();
    }
    function abort() {
      window.clearTimeout(timer);
      reject(signal.reason);
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}

export function ClinicRealtimeProvider({ children }: { children: ReactNode }) {
  const subscriptions = useRef(new Map<ClinicRealtimeTopic, Set<() => void>>());
  const [hasSubscriptions, setHasSubscriptions] = useState(false);
  const [state, setState] = useState<ConnectionState>("inactive");
  const [subscriptionCount, setSubscriptionCount] = useState(0);

  const subscribe = useCallback(
    (topic: ClinicRealtimeTopic, listener: () => void) => {
      const listeners = subscriptions.current.get(topic) ?? new Set();
      listeners.add(listener);
      subscriptions.current.set(topic, listeners);
      setSubscriptionCount((count) => count + 1);
      setHasSubscriptions(true);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) subscriptions.current.delete(topic);
        setSubscriptionCount((count) => {
          return Math.max(0, count - 1);
        });
        setHasSubscriptions(subscriptions.current.size > 0);
      };
    },
    [],
  );

  useEffect(() => {
    const session = clinicRealtimeSession();
    if (!session.enabled || !hasSubscriptions) {
      setState("inactive");
      return;
    }

    const controller = new AbortController();
    let retryDelay = 1_000;
    let pendingTopics = new Set<ClinicRealtimeTopic>();
    let flushTimer: number | undefined;
    const flush = () => {
      flushTimer = undefined;
      for (const topic of pendingTopics) {
        subscriptions.current.get(topic)?.forEach((listener) => {
          try {
            listener();
          } catch {
            // One view failing to refresh must not interrupt other subscribers.
          }
        });
      }
      pendingTopics = new Set();
    };
    const invalidate = (topics: ClinicRealtimeTopic[]) => {
      topics.forEach((topic) => pendingTopics.add(topic));
      if (flushTimer === undefined) flushTimer = window.setTimeout(flush, 120);
    };
    const onSessionChanged = () => {
      setState("authorization_required");
      controller.abort("Clinic session changed");
    };
    const onVisibilityChanged = () => {
      if (document.visibilityState === "visible") invalidate(ALL_TOPICS);
    };
    window.addEventListener(SESSION_CHANGED_EVENT, onSessionChanged);
    document.addEventListener("visibilitychange", onVisibilityChanged);

    const connect = async () => {
      let retrying = false;
      while (!controller.signal.aborted) {
        if (document.visibilityState !== "visible") {
          setState("reconnecting");
          await new Promise<void>((resolve) => {
            const visible = () => {
              if (document.visibilityState === "visible") {
                document.removeEventListener("visibilitychange", visible);
                resolve();
              }
            };
            document.addEventListener("visibilitychange", visible);
            controller.signal.addEventListener(
              "abort",
              () => {
                document.removeEventListener("visibilitychange", visible);
                resolve();
              },
              { once: true },
            );
          });
          if (controller.signal.aborted) break;
        }

        setState(retrying ? "reconnecting" : "connecting");
        try {
          const response = await fetch("/api/clinic/realtime/events", {
            credentials: "same-origin",
            cache: "no-store",
            redirect: "error",
            headers: session.headers,
            signal: controller.signal,
          });
          if ([401, 403, 409].includes(response.status)) {
            setState("authorization_required");
            return;
          }
          if (!response.ok || !response.body)
            throw new Error("The live update stream is unavailable.");

          setState("connected");
          retryDelay = 1_000;
          retrying = false;
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (!controller.signal.aborted) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder
              .decode(value, { stream: true })
              .replace(/\r\n/g, "\n");
            let boundary = buffer.indexOf("\n\n");
            while (boundary >= 0) {
              const block = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);
              const message = parseEvent(block);
              if (message.event === "resync") invalidate(ALL_TOPICS);
              if (message.event === "session-expired") {
                setState("authorization_required");
                return;
              }
              if (message.event === "invalidate") {
                try {
                  const parsed = JSON.parse(message.data) as {
                    topics?: unknown;
                  };
                  const topics = Array.isArray(parsed.topics)
                    ? parsed.topics.filter(
                        (topic): topic is ClinicRealtimeTopic =>
                          ALL_TOPICS.includes(topic as ClinicRealtimeTopic),
                      )
                    : [];
                  invalidate(topics);
                } catch {
                  // Malformed invalidations are ignored; reconnect resyncs from REST.
                }
              }
              boundary = buffer.indexOf("\n\n");
            }
            if (buffer.length > 8_192) buffer = buffer.slice(-8_192);
          }
          if (!controller.signal.aborted)
            throw new Error("Live update stream ended.");
        } catch {
          if (controller.signal.aborted) break;
          setState("reconnecting");
          retrying = true;
          await wait(retryDelay, controller.signal).catch(() => undefined);
          retryDelay = Math.min(retryDelay * 2, 30_000);
        }
      }
    };

    void connect();
    return () => {
      controller.abort();
      if (flushTimer !== undefined) window.clearTimeout(flushTimer);
      window.removeEventListener(SESSION_CHANGED_EVENT, onSessionChanged);
      document.removeEventListener("visibilitychange", onVisibilityChanged);
    };
  }, [hasSubscriptions]);

  const value = { state, subscriptionCount, subscribe };
  return (
    <ClinicRealtimeContext.Provider value={value}>
      {children}
    </ClinicRealtimeContext.Provider>
  );
}

export function useClinicRealtimeTopic(
  topic: ClinicRealtimeTopic,
  onInvalidate: () => void,
  options: {
    enabled?: boolean;
    fallbackIntervalMs?: number;
    freshnessIntervalMs?: number;
  } = {},
) {
  const { state, subscribe } = useContext(ClinicRealtimeContext);
  const callbackRef = useRef(onInvalidate);
  callbackRef.current = onInvalidate;
  const enabled = options.enabled ?? true;
  const fallbackIntervalMs = options.fallbackIntervalMs ?? 30_000;
  const freshnessIntervalMs = options.freshnessIntervalMs ?? fallbackIntervalMs;

  useEffect(() => {
    if (!enabled) return;
    return subscribe(topic, () => callbackRef.current());
  }, [enabled, subscribe, topic]);

  useEffect(() => {
    if (!enabled) return;
    const intervalMs =
      state === "authorization_required"
        ? 0
        : state === "connected"
          ? freshnessIntervalMs
          : fallbackIntervalMs;
    const refreshWhenVisible = () => {
      if (
        state !== "authorization_required" &&
        document.visibilityState === "visible"
      )
        callbackRef.current();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const timer =
      intervalMs > 0
        ? window.setInterval(refreshWhenVisible, intervalMs)
        : undefined;
    return () => {
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [enabled, fallbackIntervalMs, freshnessIntervalMs, state]);

  return state;
}

export function ClinicRealtimeNotice() {
  const { state, subscriptionCount } = useContext(ClinicRealtimeContext);
  if (subscriptionCount === 0 || state === "connected" || state === "inactive")
    return null;
  const authorizationRequired = state === "authorization_required";
  return (
    <Alert severity="warning" role="status" sx={{ borderRadius: 0 }}>
      {authorizationRequired
        ? "Live updates stopped because clinic access changed. Reopen the clinic workspace to continue."
        : "Live updates are reconnecting. This view is refreshing periodically; verify the latest status before acting."}
    </Alert>
  );
}
