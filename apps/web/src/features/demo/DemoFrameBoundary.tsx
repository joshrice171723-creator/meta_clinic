import { useEffect, useState, type ReactNode } from "react";
import { Alert, Box, Button, Stack } from "@mui/material";
import { api } from "../../api/client";
import { isDemoFrame, notifyDemo } from "./frame";
import type { NavigationConfirmation } from "./accountSwitch";
import { confirmClinicNavigation } from "../clinic/clinicNavigation";
import {
  collectDemoNavigationBlockers,
  type DemoNavigationBlockers,
} from "./navigationBlockers";

type FrameRun = {
  active: boolean;
  run?: {
    id?: string;
    account?: { user_id: number | string } | null;
    mode: "clinic" | "patient";
    lesson_key?: string | null;
    sandbox?: boolean;
    steps: {
      id: string;
      href: string;
      status: string;
      description?: string;
      review?: boolean;
    }[];
  };
};

const navigationTourPaths = new Set([
  "/clinic",
  "/clinic/work",
  "/clinic/schedule",
  "/clinic/patients",
  "/clinic/refills",
  "/clinic/recalls",
  "/clinic/telehealth",
  "/clinic/scribe",
  "/clinic/front-desk",
  "/clinic/waitlist",
  "/clinic/operations",
  "/clinic/reminders",
  "/clinic/messages",
  "/clinic/inventory",
  "/clinic/workforce",
  "/clinic/billing",
  "/clinic/subscriptions",
  "/clinic/growth",
  "/clinic/setup",
  "/clinic/settings",
]);

const navigationTour = (run: FrameRun) =>
  run.run?.lesson_key === "navigation_tour";

const sandboxRun = (run: FrameRun) => run.run?.sandbox === true;

export function confirmUnregisteredDemoNavigation(
  blockers: DemoNavigationBlockers = { blocked: false, messages: [] },
) {
  if (blockers.blocked) return false;
  // Patient dialogs do not register clinic blockers. Require explicit discard
  // consent even when no beforeunload handler reports their component draft.
  return confirmClinicNavigation(
    blockers.messages.length
      ? blockers.messages
      : ["Switch accounts and discard any unsaved changes?"],
    true,
  );
}

export function demoRouteAllowed(
  href: string,
  run: FrameRun,
  origin: string,
): boolean {
  if (!run.active || !run.run) return false;
  const target = new URL(href, origin);
  if (target.origin !== origin) return false;
  if (sandboxRun(run))
    return run.run.mode === "clinic"
      ? /^\/clinic(?:\/|$)/.test(target.pathname)
      : /^\/patient-portal(?:\/|$)/.test(target.pathname) ||
          target.pathname === "/memberships/account";
  if (navigationTour(run))
    return (
      run.run.mode === "clinic" && navigationTourPaths.has(target.pathname)
    );
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
    const confirm = (event: MessageEvent<unknown>) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== window.parent ||
        !event.data ||
        typeof event.data !== "object"
      )
        return;
      const data = event.data as Record<string, unknown>;
      if (
        data.type !== "demo:confirm-navigation" ||
        typeof data.requestId !== "string" ||
        typeof data.generation !== "number"
      )
        return;
      let allowed = false;
      if (
        run?.active &&
        sandboxRun(run) &&
        run.run?.id !== undefined &&
        String(run.run.id) === data.runId &&
        run.run?.account?.user_id === data.userId
      ) {
        const blockers = collectDemoNavigationBlockers();
        const detail: NavigationConfirmation = {
          handled: false,
          allowed: false,
        };
        if (!blockers.blocked)
          window.dispatchEvent(
            new CustomEvent("demo:confirm-local-navigation", { detail }),
          );
        allowed = blockers.blocked
          ? false
          : detail.handled
            ? detail.allowed
            : confirmUnregisteredDemoNavigation(blockers);
      }
      window.parent.postMessage(
        { ...data, type: "demo:navigation-confirmed", allowed },
        window.location.origin,
      );
    };
    window.addEventListener("message", confirm);
    return () => window.removeEventListener("message", confirm);
  }, [run]);
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
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest<HTMLAnchorElement>("a[href]") ?? null;
      const isTourControl = Boolean(
        target?.closest("[data-demo-tour-control]"),
      );
      if (!run) return;
      if (navigationTour(run) && !anchor && !isTourControl) {
        event.preventDefault();
        event.stopPropagation();
        setBlockedLink(true);
        return;
      }
      if (!anchor) return;
      const isTourNavigation =
        navigationTour(run) &&
        anchor.dataset.demoTourNavigation === "true" &&
        demoRouteAllowed(anchor.href, run, window.location.origin);
      if (navigationTour(run) && !isTourNavigation) {
        event.preventDefault();
        event.stopPropagation();
        setBlockedLink(true);
        return;
      }
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
    const lockInteraction = (event: Event) => {
      if (!run || !navigationTour(run)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest("[data-demo-tour-navigation], [data-demo-tour-control]")
      )
        return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("demo:changed", changed);
    window.addEventListener("popstate", changed);
    document.addEventListener("click", navigate, true);
    document.addEventListener("submit", lockInteraction, true);
    document.addEventListener("beforeinput", lockInteraction, true);
    return () => {
      window.removeEventListener("demo:changed", changed);
      window.removeEventListener("popstate", changed);
      document.removeEventListener("click", navigate, true);
      document.removeEventListener("submit", lockInteraction, true);
      document.removeEventListener("beforeinput", lockInteraction, true);
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
        <Alert
          severity="info"
          onClose={
            navigationTour(run) ? undefined : () => setBlockedLink(false)
          }
        >
          {navigationTour(run)
            ? "This is a read-only navigation tour. Use the clinic navigation to preview another workspace."
            : "This area is outside the current lesson. Choose another lesson from the catalog to explore it in its own clinic."}
        </Alert>
      )}
      {navigationTour(run) && (
        <Alert severity="info">
          Navigation tour: use the clinic menu to preview each workspace. Page
          controls are disabled in this read-only tour.
        </Alert>
      )}
      {children}
    </>
  );
}

export function DemoFrameBoundary({ children }: { children: ReactNode }) {
  return isDemoFrame() ? <EmbeddedFrame>{children}</EmbeddedFrame> : children;
}
