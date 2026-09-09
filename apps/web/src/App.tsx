import {
  Component,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { Button, Stack } from "@mui/material";
import type {
  DevelopmentAccount,
  RuntimeEnvironment,
  User,
} from "./api/contracts";
import { api, ApiError, csrf, currentLoginDestination } from "./api/client";
import { Form, LoadState } from "./shared/ui";
import { setBusinessDate } from "./shared/businessDate";
import { DevelopmentToolbar } from "./features/identity/DevelopmentAccountSwitcher";
import { SessionGuard } from "./features/identity/SessionGuard";
import {
  ClinicNavigationProvider,
  clinicRoute,
  clinicRouteHref,
  clinicTarget,
  useClinicNavigation,
  type ClinicHomeView,
  type ClinicNavigateOptions,
  type ClinicRoute,
} from "./features/clinic/clinicNavigation";

function lazyNamed<Module, Props>(
  load: () => Promise<Module>,
  select: (module: Module) => ComponentType<Props>,
) {
  return lazy(() => load().then((module) => ({ default: select(module) })));
}

const Home = lazyNamed(
  () => import("./features/launch/Home"),
  (m) => m.Home,
);
const TelehealthQueue = lazyNamed(
  () => import("./features/telehealth/TelehealthQueue"),
  (m) => m.TelehealthQueue,
);
const ClinicianTelehealthVisit = lazyNamed(
  () => import("./features/telehealth/ClinicianTelehealthVisit"),
  (m) => m.ClinicianTelehealthVisit,
);
const PatientTelehealthVisit = lazyNamed(
  () => import("./features/telehealth/PatientTelehealthVisit"),
  (m) => m.PatientTelehealthVisit,
);
const TelehealthSettings = lazyNamed(
  () => import("./features/telehealth/TelehealthSettings"),
  (m) => m.TelehealthSettings,
);
const TelehealthSessionProvider = lazyNamed(
  () => import("./features/telehealth/TelehealthSessionProvider"),
  (m) => m.TelehealthSessionProvider,
);
const Portal = lazyNamed(
  () => import("./features/launch/Portal"),
  (m) => m.Portal,
);
const Contact = lazyNamed(
  () => import("./features/launch/Contact"),
  (m) => m.Contact,
);
const Inquiries = lazyNamed(
  () => import("./features/launch/Inquiries"),
  (m) => m.Inquiries,
);
const loadPaperwork = () => import("./features/launch/Paperwork");
const Paperworks = lazyNamed(loadPaperwork, (m) => m.Paperworks);
const PaperworkPage = lazyNamed(loadPaperwork, (m) => m.PaperworkPage);
const Training = lazyNamed(
  () => import("./features/launch/Training"),
  (m) => m.Training,
);
const Login = lazyNamed(
  () => import("./features/identity/Login"),
  (m) => m.Login,
);
const Settings = lazyNamed(
  () => import("./features/identity/Settings"),
  (m) => m.Settings,
);
const Workspace = lazyNamed(
  () => import("./features/clinic/Workspace"),
  (m) => m.Workspace,
);
const Overview = lazyNamed(
  () => import("./features/clinic/TrackingBoardPage"),
  (m) => m.Overview,
);
const Operations = lazyNamed(
  () => import("./features/clinic/Operations"),
  (m) => m.Operations,
);
const Facilities = lazyNamed(
  () => import("./features/clinic/Facilities"),
  (m) => m.Facilities,
);
const Patients = lazyNamed(
  () => import("./features/clinic/Patients"),
  (m) => m.Patients,
);
const WorkforceApp = lazyNamed(
  () => import("./features/workforce/WorkforceApp"),
  (m) => m.WorkforceApp,
);
const EmployeeActivationPage = lazyNamed(
  () => import("./features/workforce/EmployeeActivationPage"),
  (m) => m.EmployeeActivationPage,
);
const KioskClockPage = lazyNamed(
  () => import("./features/workforce/KioskClockPage"),
  (m) => m.KioskClockPage,
);
const FrontDesk = lazyNamed(
  () => import("./features/clinic/FrontDesk"),
  (m) => m.FrontDesk,
);
const Billing = lazyNamed(
  () => import("./features/clinic/Billing"),
  (m) => m.Billing,
);
const BillingDashboard = lazyNamed(
  () => import("./features/clinic/BillingDashboard"),
  (m) => m.BillingDashboard,
);
const BillingServiceCatalog = lazyNamed(
  () => import("./features/clinic/BillingServiceCatalog"),
  (m) => m.BillingServiceCatalog,
);
const SubscriptionCatalog = lazyNamed(
  () => import("./features/clinic/subscriptions/SubscriptionCatalog"),
  (m) => m.SubscriptionCatalog,
);
const PatientStorefrontPreview = lazyNamed(
  () => import("./features/clinic/subscriptions/PatientStorefrontPreview"),
  (m) => m.PatientStorefrontPreview,
);
const Reminders = lazyNamed(
  () => import("./features/clinic/Reminders"),
  (m) => m.Reminders,
);
const loadCareFlow = () => import("./features/clinic/CareFlow");
const Schedule = lazyNamed(loadCareFlow, (m) => m.Schedule);
const EncounterPage = lazyNamed(loadCareFlow, (m) => m.EncounterPage);
const ChartSelectionPage = lazy(() =>
  import("./features/clinic/ChartSelectionPage").then((module) => ({
    default: ({ search }: { search: string }) => (
      <module.ChartSelectionPage {...module.chartSelectionProps(search)} />
    ),
  })),
);
const InventoryApp = lazyNamed(
  () => import("./features/inventory/InventoryApp"),
  (m) => m.InventoryApp,
);
const PatientPortal = lazyNamed(
  () => import("./features/patientPortal/PatientPortal"),
  (m) => m.PatientPortal,
);
const PatientPortalActivation = lazyNamed(
  () => import("./features/patientPortal/PatientPortalActivation"),
  (m) => m.PatientPortalActivation,
);
const StaffMessagingPage = lazyNamed(
  () => import("./features/staff-messaging/LiveStaffMessagingWorkspace"),
  (m) => m.StaffMessagingPage,
);
const ScribeReviewPage = lazyNamed(
  () => import("./features/scribe/LiveScribeReviewWorkspace"),
  (m) => m.ScribeReviewPage,
);

export function RoutePending({ root = false }: { root?: boolean }) {
  const status = (
    <section aria-labelledby="route-loading-title">
      <p id="route-loading-title" role="status">
        Loading this page…
      </p>
      <p className="page-fine-print">
        If it does not open shortly, reload the page to reconnect.
      </p>
      <Button size="small" onClick={() => window.location.reload()}>
        Reload page
      </Button>
    </section>
  );
  return root ? (
    <main id="main" className="wrap inner-page">
      {status}
    </main>
  ) : (
    status
  );
}

function RouteFailure({ root = false }: { root?: boolean }) {
  const message = (
    <>
      <LoadState error="This page could not load. Check your connection, then reload the page." />
      <Button variant="contained" onClick={() => window.location.reload()}>
        Reload page
      </Button>
    </>
  );
  return root ? (
    <main id="main" className="wrap inner-page">
      {message}
    </main>
  ) : (
    message
  );
}

class RouteErrorBoundary extends Component<
  { children: ReactNode; root?: boolean },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? (
      <RouteFailure root={this.props.root} />
    ) : (
      this.props.children
    );
  }
}

function RouteBoundary({
  children,
  root = false,
}: {
  children: ReactNode;
  root?: boolean;
}) {
  return (
    <RouteErrorBoundary root={root}>
      <Suspense fallback={<RoutePending root={root} />}>{children}</Suspense>
    </RouteErrorBoundary>
  );
}

function ClinicLegacyRedirect({ to }: { to: string }) {
  const { navigate } = useClinicNavigation();
  useEffect(() => {
    navigate(to, { replace: true });
  }, [navigate, to]);
  return <LoadState />;
}

function LaunchLayout({
  user,
  children,
  clinicAvailable,
}: {
  user: User | null;
  children: ReactNode;
  clinicAvailable: boolean;
  environment: RuntimeEnvironment;
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
        <a href="/portal/settings">Settings</a>
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

function PortalSettings({
  user,
  accounts,
  environment,
  businessDate,
  returnHref,
}: {
  user: User;
  accounts: DevelopmentAccount[];
  environment: RuntimeEnvironment;
  businessDate: string;
  returnHref: string;
}) {
  return (
    <Stack spacing={3}>
      <Button href={returnHref} sx={{ alignSelf: "flex-start" }}>
        Back to portal
      </Button>
      <h1>Settings</h1>
      {user.development_demo && (
        <DevelopmentToolbar
          accounts={accounts}
          activeId={user.development_account_id}
          environment={environment}
          businessDate={businessDate}
        />
      )}
      <Form
        endpoint="/api/session"
        method="DELETE"
        submit="Sign out"
        onSuccess={() => window.location.replace("/login")}
      />
    </Stack>
  );
}

function ClinicHome({
  view,
  active,
  search,
}: {
  view: ClinicHomeView;
  active: boolean;
  search: string;
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
          <RouteBoundary>
            <Overview active={active && view === "tracking"} />
          </RouteBoundary>
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
          <RouteBoundary>
            <Schedule search={search} />
          </RouteBoundary>
        </div>
      )}
    </>
  );
}

function ClinicPage({ route }: { route: ClinicRoute }) {
  const { path, search } = route;
  const telehealthVisit = /^\/clinic\/telehealth\/([0-9a-f-]{36})$/i.exec(path);
  const encounterVideo =
    /^\/clinic\/patients\/(\d+)\/encounters\/(\d+)\/telehealth$/.exec(path);
  const encounter = /^\/clinic\/patients\/(\d+)\/encounters\/(\d+)$/.exec(path),
    patient = /^\/clinic\/patients\/(\d+)$/.exec(path);
  return (
    <RouteBoundary key={clinicRouteHref(route)}>
      {path === "/clinic/telehealth" ? (
        <TelehealthQueue />
      ) : path === "/clinic/settings/telehealth" ? (
        <TelehealthSettings />
      ) : telehealthVisit ? (
        <ClinicianTelehealthVisit visitId={telehealthVisit[1]} />
      ) : encounterVideo ? (
        <ClinicianTelehealthVisit
          patientId={encounterVideo[1]}
          encounterId={encounterVideo[2]}
        />
      ) : path === "/clinic/operations" ? (
        <Operations />
      ) : path === "/clinic/facilities" ? (
        <Facilities />
      ) : path === "/clinic/chart-selection" ? (
        <ChartSelectionPage search={search} />
      ) : path === "/clinic/patients" ? (
        <Patients />
      ) : encounter ? (
        <EncounterPage patientId={encounter[1]} encounterId={encounter[2]} />
      ) : patient ? (
        <Patients id={patient[1]} />
      ) : path.startsWith("/clinic/inventory") ? (
        <InventoryApp path={path} />
      ) : path === "/clinic/staff" ? (
        <ClinicLegacyRedirect to="/clinic/workforce/employees" />
      ) : path.startsWith("/clinic/workforce") ? (
        <WorkforceApp path={path} />
      ) : path === "/clinic/front-desk" ? (
        <FrontDesk />
      ) : path === "/clinic/billing/patients" ? (
        <Billing />
      ) : path === "/clinic/billing/services" ? (
        <BillingServiceCatalog />
      ) : path === "/clinic/billing" ? (
        <BillingDashboard />
      ) : path === "/clinic/subscriptions" ? (
        <SubscriptionCatalog />
      ) : path === "/clinic/subscriptions/patient-preview" ? (
        <PatientStorefrontPreview />
      ) : path === "/clinic/reminders" ? (
        <Reminders />
      ) : path === "/clinic/messages" ? (
        <StaffMessagingPage />
      ) : path === "/clinic/scribe" ? (
        <ScribeReviewPage />
      ) : (
        <h1>Page not found.</h1>
      )}
    </RouteBoundary>
  );
}

function ClinicApplication({
  user,
  developmentAccounts,
  environment,
  businessDate,
}: {
  user: User;
  developmentAccounts: DevelopmentAccount[];
  environment: RuntimeEnvironment;
  businessDate: string;
}) {
  const [route, setRoute] = useState(() =>
    clinicRoute(
      window.location.pathname,
      window.location.search,
      window.history.state?.clinicView,
    ),
  );
  const routeRef = useRef(route);
  const blockerRef = useRef(new Set<() => string | null>());
  const historyIndexRef = useRef(
    Number.isSafeInteger(window.history.state?.clinicIndex)
      ? window.history.state.clinicIndex
      : 0,
  );
  const restoringHistoryRef = useRef(false);
  routeRef.current = route;

  const registerBlocker = useCallback(
    (blocker: (() => string | null) | null) => {
      if (blocker) blockerRef.current.add(blocker);
      return () => {
        if (blocker) blockerRef.current.delete(blocker);
      };
    },
    [],
  );
  const confirmNavigation = useCallback(() => {
    const messages = [...blockerRef.current]
      .map((blocker) => blocker())
      .filter(Boolean);
    const message = [...new Set(messages)].join("\n\n");
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
      <RouteBoundary key={clinicRouteHref(route)}>
        <Settings user={user} />
      </RouteBoundary>
    ) : (
      <ClinicPage route={route} />
    );

  return (
    <ClinicNavigationProvider value={navigation}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <RouteBoundary root>
        <Workspace
          key={user.id}
          user={user}
          path={route.path}
          homeView={route.homeView}
          developmentAccounts={developmentAccounts}
          environment={environment}
          businessDate={businessDate}
        >
          <div hidden={!home}>
            <ClinicHome
              view={route.homeView}
              active={home}
              search={route.search}
            />
          </div>
          {!home && page}
        </Workspace>
      </RouteBoundary>
    </ClinicNavigationProvider>
  );
}

export function App() {
  const [configuration, setConfiguration] = useState<{
    development_login: boolean;
    clinic_available: boolean;
    environment: RuntimeEnvironment;
    development_accounts: DevelopmentAccount[];
    business_date: string;
  }>({
    development_login: false,
    clinic_available: false,
    environment: "unknown",
    development_accounts: [],
    business_date: "",
  });
  useEffect(() => {
    csrf()
      .then((next) => {
        setBusinessDate(next.business_date);
        setConfiguration(next);
      })
      .catch(() => {});
  }, []);
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  const publicPage = [
    "/",
    "/contact",
    "/login",
    "/patient-portal/activate",
    "/workforce/activate",
    "/workforce/kiosk",
  ].includes(path);
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
            setSession((current) =>
              current.user
                ? current
                : {
                    error: "Unable to verify your session. Please reload.",
                  },
            );
        });
    void check();
    if (!publicPage)
      return () => {
        active = false;
      };
    const timer = window.setInterval(check, 60_000);
    window.addEventListener("focus", check);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [publicPage]);
  useEffect(() => {
    if (!publicPage && session.user === null)
      window.location.replace(
        "/login?next=" + encodeURIComponent(currentLoginDestination()),
      );
  }, [session.user, path, publicPage]);
  if (!publicPage && (!session.user || session.error))
    return (
      <main id="main" className="wrap inner-page">
        <LoadState error={session.error} />
      </main>
    );
  const user = session.user || null;
  const patientVideo = /^\/patient-portal\/telehealth\/([0-9a-f-]{36})$/i.exec(
    path,
  );
  let page: ReactNode;
  if (patientVideo && user)
    return (
      <SessionGuard key={user.id} expectedUserId={user.id}>
        <RouteBoundary root>
          <TelehealthSessionProvider contextKey={`patient:${user.id}`}>
            <PatientTelehealthVisit visitId={patientVideo[1]} />
          </TelehealthSessionProvider>
        </RouteBoundary>
      </SessionGuard>
    );
  if (path === "/patient-portal/activate")
    return (
      <RouteBoundary root>
        <PatientPortalActivation />
      </RouteBoundary>
    );
  if (path === "/workforce/activate")
    return (
      <RouteBoundary root>
        <EmployeeActivationPage />
      </RouteBoundary>
    );
  if (path === "/workforce/kiosk")
    return (
      <RouteBoundary root>
        <KioskClockPage />
      </RouteBoundary>
    );
  if (path.startsWith("/clinic") && user) {
    return (
      <SessionGuard key={user.id} expectedUserId={user.id}>
        <ClinicApplication
          user={user}
          developmentAccounts={configuration.development_accounts}
          environment={configuration.environment}
          businessDate={configuration.business_date}
        />
      </SessionGuard>
    );
  }
  if (
    (path === "/patient-portal" || path === "/patient-portal/settings") &&
    user
  )
    return (
      <SessionGuard key={user.id} expectedUserId={user.id}>
        <RouteBoundary root>
          <PatientPortal
            user={user}
            developmentAccounts={configuration.development_accounts}
            environment={configuration.environment}
            businessDate={configuration.business_date}
          />
        </RouteBoundary>
      </SessionGuard>
    );
  const doc = /^\/paperwork\/(\d+)$/.exec(path),
    guide = /^\/(?:training|materials)\/(\d+)$/.exec(path);
  page =
    path === "/" ? (
      <Home />
    ) : path === "/contact" ? (
      <Contact />
    ) : path === "/login" ? (
      <Login
        developmentLogin={configuration.development_login}
        developmentAccounts={configuration.development_accounts}
        environment={configuration.environment}
        businessDate={configuration.business_date}
      />
    ) : path === "/portal/settings" && user ? (
      <PortalSettings
        user={user}
        accounts={configuration.development_accounts}
        environment={configuration.environment}
        businessDate={configuration.business_date}
        returnHref="/portal"
      />
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
    <LaunchLayout
      user={user}
      clinicAvailable={configuration.clinic_available}
      environment={configuration.environment}
    >
      {publicPage ? (
        <RouteBoundary root>{page}</RouteBoundary>
      ) : (
        user && (
          <SessionGuard key={user.id} expectedUserId={user.id}>
            <MemberLayout key={user.id} user={user}>
              <RouteBoundary>{page}</RouteBoundary>
            </MemberLayout>
          </SessionGuard>
        )
      )}
    </LaunchLayout>
  );
}
