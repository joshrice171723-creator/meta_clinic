import { useEffect, useState, type ReactNode } from "react";
import { Alert, Box, Button, Stack } from "@mui/material";
import { api } from "../../api/client";
import { isDemoFrame, notifyDemo } from "./frame";
import { DemoSpotlight } from "./DemoSpotlight";

type FrameRun = {
  active: boolean;
  run?: {
    mode: "clinic" | "patient";
    lesson_key?: string | null;
    steps: {
      id: string;
      href: string;
      status: string;
      description?: string;
      review?: boolean;
    }[];
  };
};

export function demoRouteAllowed(
  href: string,
  run: FrameRun,
  origin: string,
): boolean {
  if (!run.active || !run.run) return false;
  const target = new URL(href, origin);
  if (target.origin !== origin) return false;
  return run.run.steps.some((step) => {
    if (step.status === "locked" || !step.href) return false;
    const allowed = new URL(step.href, origin);
    const clinic = allowed.pathname.startsWith("/clinic");
    if (clinic !== (run.run?.mode === "clinic")) return false;
    if (target.pathname === allowed.pathname) return true;
    return (
      allowed.pathname !== "/clinic" &&
      target.pathname.startsWith(`${allowed.pathname}/`)
    );
  });
}

function EmbeddedFrame({ children }: { children: ReactNode }) {
  const [run, setRun] = useState<FrameRun>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [blockedLink, setBlockedLink] = useState(false);
  useEffect(() => {
    document.body.dataset.demoActive = "true";
    return () => {
      delete document.body.dataset.demoActive;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    api<FrameRun>("/api/demo/run", { signal: controller.signal })
      .then((result) => {
        setRun(result);
        setError("");
        notifyDemo("demo:loaded");
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "The lesson could not be loaded.",
          );
      });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    const changed = () => setRevision((value) => value + 1);
    const navigate = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (!anchor || !run) return;
      if (
        !demoRouteAllowed(anchor.href, run, window.location.origin) ||
        anchor.target ||
        anchor.hasAttribute("download")
      ) {
        event.preventDefault();
        event.stopPropagation();
        setBlockedLink(true);
      }
    };
    window.addEventListener("demo:changed", changed);
    window.addEventListener("popstate", changed);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("demo:changed", changed);
      window.removeEventListener("popstate", changed);
      document.removeEventListener("click", navigate, true);
    };
  }, [run]);
  if (
    error ||
    !run ||
    !demoRouteAllowed(window.location.href, run, window.location.origin)
  ) {
    return (
      <Box sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Alert severity={error ? "error" : "info"}>
            {error ||
              (!run
                ? "Loading your lesson…"
                : "Choose a lesson from the catalog to continue.")}
          </Alert>
          {error && (
            <Button onClick={() => setRevision((value) => value + 1)}>
              Try again
            </Button>
          )}
        </Stack>
      </Box>
    );
  }
  return (
    <>
      {blockedLink && (
        <Alert severity="info" onClose={() => setBlockedLink(false)}>
          This area is outside the current lesson. Choose another lesson from
          the catalog to explore it in its own clinic.
        </Alert>
      )}
      {children}
      {run.run?.steps
        .filter(
          (step) =>
            step.status === "available" &&
            (!run.run?.lesson_key || step.id === run.run.lesson_key),
        )
        .slice(0, 1)
        .map((step) => (
          <DemoSpotlight
            key={step.id}
            step={step.id}
            review={step.review === true}
            description={
              step.description ||
              "Follow the highlighted action to complete this lesson."
            }
          />
        ))}
    </>
  );
}

export function DemoFrameBoundary({ children }: { children: ReactNode }) {
  return isDemoFrame() ? <EmbeddedFrame>{children}</EmbeddedFrame> : children;
}
