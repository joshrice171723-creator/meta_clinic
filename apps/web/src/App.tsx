import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User } from "./api/contracts";
import { api, ApiError, csrf, loginDestination } from "./api/client";
import { Form, LoadState } from "./shared/ui";
import { Home } from "./features/launch/Home";
import { Portal } from "./features/launch/Portal";
import { Contact } from "./features/launch/Contact";
import { Inquiries } from "./features/launch/Inquiries";
import { PaperworkPage, Paperworks } from "./features/launch/Paperwork";
import { Training } from "./features/launch/Training";
import { Login } from "./features/identity/Login";
import { Settings } from "./features/identity/Settings";
import { Workspace } from "./features/clinic/Workspace";
import { Overview } from "./features/clinic/TrackingBoardPage";
import { Operations } from "./features/clinic/Operations";
import { Patients } from "./features/clinic/Patients";
import { Staff } from "./features/clinic/Staff";
import { FrontDesk } from "./features/clinic/FrontDesk";
import { Billing } from "./features/clinic/Billing";
import { BillingDashboard } from "./features/clinic/BillingDashboard";
import { EncounterPage, Schedule } from "./features/clinic/CareFlow";
import {
  ChartSelectionPage,
  chartSelectionProps,
} from "./features/clinic/ChartSelectionPage";
import { InventoryApp } from "./features/inventory/InventoryApp";
import {
  ClinicNavigationProvider,
  clinicRoute,
  clinicRouteHref,
  clinicTarget,
  type ClinicHomeView,
  type ClinicNavigateOptions,
  type ClinicRoute,
} from "./features/clinic/clinicNavigation";

function LaunchLayout({
  user,
  children,
  clinicAvailable,
}: {
  user: User | null;
  children: ReactNode;
  clinicAvailable: boolean;
}) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header wrap">
        <a className="wordmark" href="/">
          APPly
          <span className="brand-dot" />
        </a>
        <nav aria-label="Main navigation">
          <a href="/#approach">The approach</a>
          <a href="/#process">How it works</a>
          <a className="login-link" href={user ? "/portal" : "/login"}>
            {user ? "My launch" : "Member login"}
          </a>
          <a className="nav-cta" href="/contact">
            Contact us ↗
          </a>
        </nav>
      </header>
      {user?.development_demo && (
        <div className="wrap demo-notice session-notice">
          Development demo session · You are already signed in.
        </div>
      )}
      {children}
      <footer className="wrap footer-wrap">
        <div className="site-footer">
          <a className="wordmark" href="/">
            APPly
            <span className="brand-dot" />
          </a>
          <span>Independent practices. A supported start.</span>
          <div className="footer-links">
            <a href="/contact">Contact</a>
            <a href="/login">Member login</a>
            {clinicAvailable && <a href="/clinic">Clinic workspace</a>}
            <span>Sherman &amp; North Texas</span>
          </div>
        </div>
        <div className="footer-bottom">
          <p>
            Clinic-launch consulting. Not legal or clinical advice. No guarantee
            of approval or opening date.
          </p>
          <span>© {new Date().getFullYear()} APPly</span>
        </div>
      </footer>
    </>
  );
}
function MemberLayout({ user, children }: { user: User; children: ReactNode }) {
  return (
    <main id="main" className="wrap inner-page portal-page">
      <nav className="member-navigation" aria-label="Member navigation">
        <a href="/portal">My launch</a>
        <a href="/paperwork">Paperwork</a>
        <a href="/training">Training</a>
        {user.admin && <a href="/inquiries">Inquiries</a>}
        <Form
          endpoint="/api/session"
          method="DELETE"
          submit="Sign out"
          onSuccess={() => window.location.replace("/login")}
        />
      </nav>
      {children}
    </main>
  );
}

function ClinicHome({
  view,
  active,
}: {
  view: ClinicHomeView;
  active: boolean;
}) {
  const [visited, setVisited] = useState<Set<ClinicHomeView>>(
    () => new Set([view]),
  );
  const trackingPanel = useRef<HTMLDivElement>(null);
  const schedulePanel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisited((current) =>
      current.has(view) ? current : new Set([...current, view]),
    );
    if (active)
      (view === "tracking" ? trackingPanel : schedulePanel).current?.focus();
  }, [active, view]);

  return (
    <>
      {(visited.has("tracking") || view === "tracking") && (
        <div
          ref={trackingPanel}
          className="clinic-route-panel"
          hidden={view !== "tracking"}
          tabIndex={-1}
          aria-label="Tracking Board"
        >
          <Overview active={active && view === "tracking"} />
        </div>
      )}
      {(visited.has("schedule") || view === "schedule") && (
        <div
          ref={schedulePanel}
          className="clinic-route-panel"
          hidden={view !== "schedule"}
          tabIndex={-1}
          aria-label="Schedule"
        >
          <Schedule />
        </div>
      )}
    </>
  );
}

function ClinicPage({ route }: { route: ClinicRoute }) {
  const { path, search } = route;
  const encounter = /^\/clinic\/patients\/(\d+)\/encounters\/(\d+)$/.exec(path),
    patient = /^\/clinic\/patients\/(\d+)$/.exec(path);
  return path === "/clinic/operations" ? (
    <Operations />
  ) : path === "/clinic/chart-selection" ? (
    <ChartSelectionPage {...chartSelectionProps(search)} />
  ) : path === "/clinic/patients" ? (
    <Patients />
  ) : encounter ? (
    <EncounterPage patientId={encounter[1]} encounterId={encounter[2]} />
  ) : patient ? (
    <Patients id={patient[1]} />
  ) : path.startsWith("/clinic/inventory") ? (
    <InventoryApp path={path} />
  ) : path === "/clinic/staff" ? (
    <Staff />
  ) : path === "/clinic/front-desk" ? (
    <FrontDesk />
  ) : path === "/clinic/billing/patients" ? (
    <Billing />
  ) : path === "/clinic/billing" ? (
    <BillingDashboard />
  ) : (
    <h1>Page not found.</h1>
  );
}

function ClinicApplication({ user }: { user: User }) {
  const [route, setRoute] = useState(() =>
    clinicRoute(
      window.location.pathname,
      window.location.search,
      window.history.state?.clinicView,
    ),
  );
  const routeRef = useRef(route);
  const blockerRef = useRef<(() => string | null) | null>(null);
  const historyIndexRef = useRef(
    Number.isSafeInteger(window.history.state?.clinicIndex)
      ? window.history.state.clinicIndex
      : 0,
  );
  const restoringHistoryRef = useRef(false);
  routeRef.current = route;

  const registerBlocker = useCallback(
    (blocker: (() => string | null) | null) => {
      blockerRef.current = blocker;
      return () => {
        if (blockerRef.current === blocker) blockerRef.current = null;
      };
    },
    [],
  );
  const confirmNavigation = useCallback(() => {
    const message = blockerRef.current?.();
    return !message || window.confirm(message);
  }, []);
  const navigate = useCallback(
    (href: string, options: ClinicNavigateOptions = {}) => {
      const target = clinicTarget(href, window.location.origin);
      if (!target || !confirmNavigation()) return false;
      const next = clinicRoute(
        target.pathname,
        target.search,
        options.homeView,
      );
      if (options.homeView) next.homeView = options.homeView;
      const sameHome =
        routeRef.current.path === "/clinic" && next.path === "/clinic";
      const method = options.replace || sameHome ? "replaceState" : "pushState";
      const historyIndex =
        method === "pushState"
          ? historyIndexRef.current + 1
          : historyIndexRef.current;
      window.history[method](
        { clinicView: next.homeView, clinicIndex: historyIndex },
        "",
        clinicRouteHref(next),
      );
      historyIndexRef.current = historyIndex;
      routeRef.current = next;
      setRoute(next);
      return true;
    },
    [confirmNavigation],
  );

  useEffect(() => {
    const initial = routeRef.current;
    window.history.replaceState(
      {
        ...window.history.state,
        clinicView: initial.homeView,
        clinicIndex: historyIndexRef.current,
      },
      "",
      clinicRouteHref(initial),
    );
    const restore = (event: PopStateEvent) => {
      if (restoringHistoryRef.current) {
        restoringHistoryRef.current = false;
        return;
      }
      const next = clinicRoute(
        window.location.pathname,
        window.location.search,
        event.state?.clinicView,
      );
      if (!confirmNavigation()) {
        const current = routeRef.current;
        const nextIndex = event.state?.clinicIndex;
        const delta = Number.isSafeInteger(nextIndex)
          ? historyIndexRef.current - nextIndex
          : 0;
        if (delta !== 0) {
          restoringHistoryRef.current = true;
          window.history.go(delta);
        } else {
          window.history.pushState(
            {
              clinicView: current.homeView,
              clinicIndex: historyIndexRef.current,
            },
            "",
            clinicRouteHref(current),
          );
        }
        return;
      }
      if (Number.isSafeInteger(event.state?.clinicIndex))
        historyIndexRef.current = event.state.clinicIndex;
      routeRef.current = next;
      setRoute(next);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [confirmNavigation]);

  const navigation = useMemo(
    () => ({ navigate, registerBlocker }),
    [navigate, registerBlocker],
  );
  const home = route.path === "/clinic";
  const page =
    route.path === "/clinic/settings" ? (
      <Settings user={user} />
    ) : (
      <ClinicPage route={route} />
    );

  return (
    <ClinicNavigationProvider value={navigation}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Workspace
        key={user.id}
        user={user}
        path={route.path}
        homeView={route.homeView}
      >
        <div hidden={!home}>
          <ClinicHome view={route.homeView} active={home} />
        </div>
        {!home && page}
      </Workspace>
    </ClinicNavigationProvider>
  );
}

export function App() {
  const [configuration, setConfiguration] = useState({
    development_login: false,
    clinic_available: false,
  });
  useEffect(() => {
    csrf()
      .then(setConfiguration)
      .catch(() => {});
  }, []);
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  const publicPage = ["/", "/contact", "/login"].includes(path);
  const [session, setSession] = useState<{
    user?: User | null;
    error?: string;
  }>({});
  useEffect(() => {
    let active = true;
    const check = () =>
      api<{ user: User }>("/api/session")
        .then((s) => {
          if (active) setSession(s);
        })
        .catch((e) => {
          if (!active) return;
          if (e instanceof ApiError && e.status === 401)
            setSession({ user: null });
          else
            setSession({
              error: "Unable to verify your session. Please reload.",
            });
        });
    void check();
    const timer = window.setInterval(check, 60_000);
    window.addEventListener("focus", check);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, []);
  useEffect(() => {
    if (!publicPage && session.user === null)
      window.location.replace(
        "/login?next=" + encodeURIComponent(loginDestination(path)),
      );
  }, [session.user, path, publicPage]);
  if (!publicPage && (!session.user || session.error))
    return (
      <main id="main" className="wrap inner-page">
        <LoadState error={session.error} />
      </main>
    );
  const user = session.user || null;
  let page: ReactNode;
  if (path.startsWith("/clinic") && user) {
    return <ClinicApplication user={user} />;
  }
  const doc = /^\/paperwork\/(\d+)$/.exec(path),
    guide = /^\/(?:training|materials)\/(\d+)$/.exec(path);
  page =
    path === "/" ? (
      <Home />
    ) : path === "/contact" ? (
      <Contact />
    ) : path === "/login" ? (
      <Login developmentLogin={configuration.development_login} />
    ) : path === "/portal" ? (
      <Portal clinicAvailable={configuration.clinic_available} />
    ) : path === "/paperwork" ? (
      <Paperworks />
    ) : doc && user ? (
      <PaperworkPage id={doc[1]} user={user} />
    ) : path === "/training" || path === "/materials" ? (
      <Training />
    ) : guide ? (
      <Training id={guide[1]} />
    ) : path === "/inquiries" ? (
      <Inquiries />
    ) : (
      <h1>Page not found.</h1>
    );
  return (
    <LaunchLayout user={user} clinicAvailable={configuration.clinic_available}>
      {publicPage
        ? page
        : user && (
            <MemberLayout key={user.id} user={user}>
              {page}
            </MemberLayout>
          )}
    </LaunchLayout>
  );
}
