import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";
import {
  api,
  ApiError,
  currentLoginDestination,
  SESSION_CHANGED_EVENT,
  setApiActor,
} from "../../api/client";
import type { User } from "../../api/contracts";
import { isDemoFrame } from "../demo/frame";

type SessionPolicy = {
  idle_expires_at: string;
  absolute_expires_at: string;
  idle_timeout_seconds: number;
  server_time: string;
};

export type SessionBootstrap = {
  user?: User | null;
  session_policy?: SessionPolicy;
  clinic_access?: {
    active: boolean;
    authorization_generation: number;
  } | null;
  error?: string;
};

export function SessionGuard({
  children,
  expectedUserId,
  initialSession,
}: {
  children: ReactNode;
  expectedUserId?: number;
  initialSession?: SessionBootstrap;
}) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const embeddedDemo = isDemoFrame();
  const deadline = useRef<number | null>(null);
  const lastActivity = useRef(0);
  const acknowledgedActivity = useRef(0);
  const requestActive = useRef(false);
  const authorizationGeneration = useRef<number | null>(null);
  const alive = useRef(true);
  useLayoutEffect(() => {
    setApiActor(expectedUserId);
  }, [expectedUserId]);

  const accept = (policy: SessionPolicy | undefined) => {
    if (!alive.current) return;
    if (!policy) throw new Error("Session timing is unavailable.");
    const serverTime = Date.parse(policy.server_time);
    const expires = Math.min(
      Date.parse(policy.idle_expires_at),
      Date.parse(policy.absolute_expires_at),
    );
    if (!Number.isFinite(serverTime) || !Number.isFinite(expires))
      throw new Error("Session timing is unavailable.");
    deadline.current = Date.now() + Math.max(0, expires - serverTime);
    setRemaining(Math.max(0, Math.ceil((expires - serverTime) / 1000)));
    setExpired(expires <= serverTime);
  };

  const acceptResponse = (response: SessionBootstrap) => {
    if (expectedUserId !== undefined && response.user?.id !== expectedUserId) {
      setExpired(true);
      return false;
    }
    if (response.clinic_access) {
      if (!response.clinic_access.active) {
        setExpired(true);
        return false;
      }
      if (authorizationGeneration.current === null) {
        authorizationGeneration.current =
          response.clinic_access.authorization_generation;
      } else if (
        authorizationGeneration.current !==
        response.clinic_access.authorization_generation
      ) {
        setExpired(true);
        return false;
      }
    }
    accept(response.session_policy);
    return true;
  };

  const check = async (extend: boolean) => {
    if (requestActive.current) return;
    requestActive.current = true;
    const activity = lastActivity.current;
    if (extend) setBusy(true);
    try {
      const response = await api<SessionBootstrap>("/api/session", {
        method: extend ? "PATCH" : "GET",
      });
      if (!alive.current) return;
      if (!acceptResponse(response)) return;
      if (extend) acknowledgedActivity.current = activity;
      setError("");
    } catch (cause) {
      if (!alive.current) return;
      if (cause instanceof ApiError && cause.status === 401) setExpired(true);
      else
        setError(
          "Unable to confirm your session. Your current work remains open until the session expires.",
        );
    } finally {
      requestActive.current = false;
      if (alive.current) setBusy(false);
    }
  };

  useEffect(() => {
    alive.current = true;
    if (initialSession) {
      try {
        if (!acceptResponse(initialSession)) return;
        setError("");
      } catch {
        void check(false);
      }
    } else void check(false);
    const activity = (event: Event) => {
      if (event.isTrusted && document.visibilityState === "visible")
        lastActivity.current = Date.now();
    };
    const events = ["pointerdown", "keydown", "pointermove", "wheel"] as const;
    events.forEach((event) =>
      window.addEventListener(event, activity, { passive: true }),
    );
    const timer = window.setInterval(() => {
      const left =
        deadline.current === null
          ? null
          : Math.ceil((deadline.current - Date.now()) / 1000);
      setRemaining(left === null ? null : Math.max(0, left));
      if (left !== null && left <= 0) setExpired(true);
    }, 1000);
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const recentlyActive =
        lastActivity.current > acknowledgedActivity.current &&
        Date.now() - lastActivity.current < 60_000;
      // Background polling never extends an unattended session.
      void check(recentlyActive);
    }, 30_000);
    const focus = () => {
      void check(false);
    };
    window.addEventListener("focus", focus);
    const lock = () => setExpired(true);
    window.addEventListener(SESSION_CHANGED_EVENT, lock);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
      window.clearInterval(heartbeat);
      window.removeEventListener("focus", focus);
      window.removeEventListener(SESSION_CHANGED_EVENT, lock);
      events.forEach((event) => window.removeEventListener(event, activity));
    };
  }, [expectedUserId, initialSession]);

  const signIn = async () => {
    if (embeddedDemo) {
      setBusy(true);
      setError("");
      try {
        await api("/api/demo/run/resume", { method: "POST", body: {} });
        window.location.reload();
      } catch {
        setError(
          "The demo workspace could not be resumed. Return to the lesson catalog and try again.",
        );
        setBusy(false);
      }
      return;
    }
    window.location.replace(
      `/login?next=${encodeURIComponent(currentLoginDestination())}`,
    );
  };
  if (expired)
    return (
      <Box component="main" sx={{ maxWidth: 520, mx: "auto", my: 10, p: 3 }}>
        <Typography variant="h5" component="h1" gutterBottom>
          Session locked
        </Typography>
        <Typography sx={{ mb: 3 }}>
          Sign in again to reopen your workspace.
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Button
          variant="contained"
          onClick={() => void signIn()}
          disabled={busy}
          data-demo-tour-control={embeddedDemo ? "true" : undefined}
        >
          {busy
            ? "Resuming…"
            : embeddedDemo
              ? "Resume demo workspace"
              : "Sign in again"}
        </Button>
      </Box>
    );
  if (remaining === null)
    return (
      <Box component="main" sx={{ maxWidth: 520, mx: "auto", my: 10, p: 3 }}>
        {error ? (
          <Alert
            severity="warning"
            action={<Button onClick={() => void check(false)}>Retry</Button>}
          >
            Your session could not be confirmed. Reconnect to reopen your
            workspace.
          </Alert>
        ) : (
          <Typography role="status">Checking your session…</Typography>
        )}
      </Box>
    );
  return (
    <>
      {error && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" onClick={() => void check(false)}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}
      {children}
      <Dialog
        open={remaining !== null && remaining <= 120}
        aria-labelledby="session-warning-title"
      >
        <DialogTitle id="session-warning-title">
          Keep your session open?
        </DialogTitle>
        <DialogContent>
          <Typography>
            Your session will lock in{" "}
            {Math.max(1, Math.ceil((remaining ?? 0) / 60))} minute
            {(remaining ?? 0) > 60 ? "s" : ""}. Save your work or continue
            working.
          </Typography>
          {error && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api("/api/session", { method: "DELETE" });
                signIn();
              } catch {
                setError("Sign-out could not be confirmed. Please try again.");
                setBusy(false);
              }
            }}
          >
            Sign out
          </Button>
          <Button
            variant="contained"
            disabled={busy}
            onClick={() => {
              lastActivity.current = Date.now();
              void check(true);
            }}
          >
            {busy ? "Checking…" : "Continue working"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
