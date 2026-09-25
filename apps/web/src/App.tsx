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
import { DemoFrameBoundary } from "./features/demo/DemoFrameBoundary";
import { hasGrowthPage } from "./features/marketing/marketingPaths";
import { isDemoFrame } from "./features/demo/frame";
import {
  SessionGuard,
  type SessionBootstrap,
} from "./features/identity/SessionGuard";
import {
  AppearanceContext,
  ClinicAppearanceScope,
  useClinicAppearance,
} from "./features/clinic/Appearance";
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
import {
  ClinicRealtimeNotice,
  ClinicRealtimeProvider,
} from "./features/clinic/ClinicRealtime";

function lazyNamed<Module, Props>(
  load: () => Promise<Module>,
  select: (module: Module) => ComponentType<Props>,
) {
  return lazy(() => load().then((module) => ({ default: select(module) })));
}

const WorkInbox = lazyNamed(
  () => import("./features/clinic/WorkInbox"),
  (m) => m.WorkInbox,
);
const DemoJourney = lazyNamed(
  () => import("./features/demo/DemoJourney"),
  (m) => m.DemoJourney,
);
const GrowthMarketingPage = lazyNamed(
  () => import("./features/marketing/GrowthMarketingPage"),
  (m) => m.GrowthMarketingPage,
);
const I2eInvestorPage = lazyNamed(
  () => import("./features/marketing/I2eInvestorPage"),
  (m) => m.I2eInvestorPage,
);
const MembershipPatientView = lazyNamed(
  () => import("./features/marketing/MembershipPatientView"),
  (m) => m.MembershipPatientView,
);
const WaitlistWorkspace = lazyNamed(
  () => import("./features/clinic/WaitlistWorkspace"),
  (m) => m.WaitlistWorkspace,
);
const RecallWorklist = lazyNamed(
  () => import("./features/clinic/RecallWorklist"),
  (m) => m.RecallWorklist,
);
const RefillRequestQueue = lazyNamed(
  () => import("./features/clinic/RefillRequestQueue"),
  (m) => m.RefillRequestQueue,
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
const MetaClinicMarketing = lazyNamed(
  () => import("./features/marketing/MetaClinicMarketing"),
  (m) => m.MetaClinicMarketing,
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
const OwnerCommandCenter = lazyNamed(
  () => import("./features/owner/OwnerCommandCenter"),
  (m) => m.OwnerCommandCenter,
);
const OwnerActivationPage = lazyNamed(
  () => import("./features/owner/OwnerActivationPage"),
  (m) => m.OwnerActivationPage,
);
const OwnerPasswordResetPage = lazyNamed(
  () => import("./features/owner/OwnerPasswordResetPage"),
  (m) => m.OwnerPasswordResetPage,
);
const FounderDecisionWorkspace = lazyNamed(
  () => import("./features/founder/FounderDecisionWorkspace"),
  (m) => m.FounderDecisionWorkspace,
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
const PatientRegistrationPage = lazyNamed(
  () => import("./features/clinic/Patients"),
  (m) => m.PatientRegistrationPage,
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
const MembershipGrowth = lazyNamed(
  () => import("./features/membershipGrowth/MembershipGrowth"),
  (m) => m.MembershipGrowth,
);
const PublicMembershipStorefront = lazyNamed(
  () => import("./features/membershipGrowth/PublicMembershipStorefront"),
  (m) => m.PublicMembershipStorefront,
);
const PublicMembershipDirectory = lazyNamed(
  () => import("./features/membershipGrowth/PublicMembershipDirectory"),
  (m) => m.PublicMembershipDirectory,
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
const PatientPortalRecovery = lazyNamed(
  () => import("./features/patientPortal/PatientPortalRecovery"),
  (m) => m.PatientPortalRecovery,
);
const MembershipAccountActivation = lazyNamed(
  () => import("./features/membershipGrowth/MembershipAccountActivation"),
  (m) => m.MembershipAccountActivation,
);
const MembershipAccount = lazyNamed(
  () => import("./features/membershipGrowth/MembershipAccount"),
  (m) => m.MembershipAccount,
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

export function PublicMembershipEntry({
  children,
  preserveSession = import.meta.env.DEV,
}: {
  children: ReactNode;
  preserveSession?: boolean;
}) {
  const [state, setState] = useState<"clearing" | "ready" | "failed">(
    preserveSession ? "ready" : "clearing",
  );

  useEffect(() => {
    // Vite reloads every open tab after source edits. A brochure tab must not
    // revoke the shared clinic cookie while developing the staff workflow.
    if (preserveSession) return;
    let active = true;
    void api<void>("/api/session", { method: "DELETE" })
      .then(() => {
        if (active) setState("ready");
      })
      .catch(() => {
        if (active) setState("failed");
      });
    return () => {
      active = false;
    };
  }, [preserveSession]);

  if (state === "clearing") return <RoutePending root />;
  if (state === "failed")
    return (
      <main id="main" className="wrap inner-page">
        <LoadState error="We could not start a private membership visit. Reload the page before continuing." />
        <Button variant="contained" onClick={() => window.location.reload()}>
          Reload page
        </Button>
      </main>
    );
  return <>{children}</>;
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
}: {
  user: User | null;
  children: ReactNode;
  environment: RuntimeEnvironment;
}) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header wrap">
        <a className="wordmark" href="/">
          Meta Clinic
          <span className="brand-dot" />
        </a>
        <nav aria-label="Main navigation">
          <a className="login-link" href={user ? "/portal" : "/login"}>
            {user ? "My account" : "Sign in"}
          </a>
        </nav>
      </header>
      {children}
      <footer className="wrap footer-wrap">
        <div className="site-footer">
          <a className="wordmark" href="/">
            Meta Clinic
            <span className="brand-dot" />
          </a>
          <span>Independent practices. A supported start.</span>
          <div className="footer-links">
            <a href="/login">Sign in</a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>
            Clinic-launch consulting. Not legal or clinical advice. No guarantee
            of approval or opening date.
          </p>
          <span>© {new Date().getFullYear()} Meta Clinic</span>
        </div>
      </footer>
    </>
  );
}
function MemberLayout({ user, children }: { user: User; children: ReactNode }) {
  const appearance = useClinicAppearance(user.id);
  const content = (
    <main id="main" className="wrap inner-page portal-page">
      <nav className="member-navigation" aria-label="Member navigation">
        <a href="/portal">Launch &amp; onboarding</a>
        <a href="/paperwork">Paperwork</a>
        <a href="/training">Training</a>
        {user.admin && <a href="/inquiries">Inquiries</a>}
        {user.admin && <a href="/owner">Owner Command Center</a>}
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
  return (
    <ClinicAppearanceScope {...appearance}>
      <AppearanceContext value={appearance}>{content}</AppearanceContext>
    </ClinicAppearanceScope>
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
      {(user.workspace_tools || user.development_demo) && (
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
      ) : path === "/clinic/work" ? (
        <WorkInbox />
      ) : path === "/clinic/waitlist" ? (
        <WaitlistWorkspace />
      ) : path === "/clinic/recalls" ? (
        <RecallWorklist />
      ) : path === "/clinic/refills" ? (
        <RefillRequestQueue />
      ) : path === "/clinic/operations" ? (
        <Operations />
      ) : path === "/clinic/setup" || path === "/clinic/facilities" ? (
        <Facilities />
      ) : path === "/clinic/chart-selection" ? (
        <ChartSelectionPage search={search} />
      ) : path === "/clinic/patients/new" ? (
        <PatientRegistrationPage />
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
      ) : path === "/clinic/growth" ? (
        <MembershipGrowth />
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
      const sameRoute =
        clinicRouteHref(routeRef.current) === clinicRouteHref(next);
      const method =
        options.replace || sameRoute ? "replaceState" : "pushState";
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
    () => ({ navigate, registerBlocker, confirmNavigation }),
    [navigate, registerBlocker, confirmNavigation],
  );
  const home = route.path === "/clinic" || route.path === "/clinic/schedule";
  const page =
    route.path === "/clinic/settings" ? (
      <RouteBoundary key={clinicRouteHref(route)}>
        <Settings user={user} />
      </RouteBoundary>
    ) : (
      <ClinicPage route={route} />
    );

  return (
    <ClinicRealtimeProvider key={user.id}>
      <ClinicNavigationProvider value={navigation}>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <ClinicRealtimeNotice />
        <RouteBoundary root>
          <Workspace
            key={user.id}
            user={user}
            path={route.path}
            search={route.search}
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
    </ClinicRealtimeProvider>
  );
}

export function App() {
  if (window.location.pathname.replace(/\/$/, "") === "/") {
    return (
      <RouteBoundary root>
        <MetaClinicMarketing />
      </RouteBoundary>
    );
  }
  if (window.location.pathname.replace(/\/$/, "") === "/demo") {
    return (
      <RouteBoundary root>
        <DemoJourney />
      </RouteBoundary>
    );
  }
  return (
    <DemoFrameBoundary>
      <Application />
    </DemoFrameBoundary>
  );
}

function Application() {
  const [configurationError, setConfigurationError] = useState(false);
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
        setConfigurationError(false);
      })
      .catch(() => setConfigurationError(true));
  }, []);
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  const publicMembership =
    /^\/memberships\/([a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9]))$/.exec(path);
  const publicMembershipRoute =
    path === "/memberships" ||
    (publicMembership !== null && path !== "/memberships/account");
  const marketingFeature = /^\/meta-clinic\/features\/([a-z0-9-]+)$/.exec(path);
  const growthMarketing = hasGrowthPage(path) && path !== "/meta-clinic";
  const marketingClinicFeature =
    /^\/meta-clinic\/(primary-care|membership-care|urgent-care|weight-management|hormone-health|behavioral-health|rehabilitation-pt|aesthetics|infusion)\/features\/([a-z0-9-]+)$/.exec(
      path,
    );
  const marketingClinicType =
    /^\/meta-clinic\/(primary-care|membership-care|urgent-care|weight-management|hormone-health|behavioral-health|rehabilitation-pt|aesthetics|infusion)$/.exec(
      path,
    );
  const publicPage =
    [
      "/",
      "/login",
      "/meta-clinic",
      "/meta-clinic/membership-care/patient-view",
      "/patient-portal/activate",
      "/patient-portal/recovery",
      "/memberships/account/activate",
      "/owner/activate",
      "/owner/password-reset",
      "/workforce/activate",
      "/workforce/kiosk",
      "/memberships",
      "/founder-decisions",
      "/i2e",
    ].includes(path) ||
    (publicMembership !== null && path !== "/memberships/account") ||
    marketingFeature !== null ||
    marketingClinicFeature !== null ||
    marketingClinicType !== null ||
    growthMarketing;
  const [session, setSession] = useState<SessionBootstrap>({});
  useEffect(() => {
    if (publicMembershipRoute) {
      setSession({ user: null });
      return;
    }
    let active = true;
    const check = () =>
      api<SessionBootstrap>("/api/session")
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
  }, [publicMembershipRoute, publicPage]);
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
  if (path === "/i2e")
    return (
      <RouteBoundary root>
        <I2eInvestorPage />
      </RouteBoundary>
    );
  const patientVideo = /^\/patient-portal\/telehealth\/([0-9a-f-]{36})$/i.exec(
    path,
  );
  let page: ReactNode;
  if (patientVideo && user)
    return (
      <SessionGuard
        key={user.id}
        expectedUserId={user.id}
        initialSession={session}
      >
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
  if (path === "/patient-portal/recovery")
    return (
      <RouteBoundary root>
        <PatientPortalRecovery />
      </RouteBoundary>
    );
  if (path === "/memberships/account/activate")
    return (
      <RouteBoundary root>
        <MembershipAccountActivation />
      </RouteBoundary>
    );
  if (path === "/memberships/account" && user)
    return (
      <SessionGuard
        key={user.id}
        expectedUserId={user.id}
        initialSession={session}
      >
        <RouteBoundary root>
          <MembershipAccount />
        </RouteBoundary>
      </SessionGuard>
    );
  if (path === "/owner/activate")
    return (
      <RouteBoundary root>
        <OwnerActivationPage />
      </RouteBoundary>
    );
  if (path === "/owner/password-reset")
    return (
      <RouteBoundary root>
        <OwnerPasswordResetPage />
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
  if (path === "/founder-decisions")
    return (
      <RouteBoundary root>
        <FounderDecisionWorkspace />
      </RouteBoundary>
    );
  if (path === "/meta-clinic/membership-care/patient-view")
    return (
      <RouteBoundary root>
        <MembershipPatientView
          capture={new URLSearchParams(window.location.search).has("capture")}
        />
      </RouteBoundary>
    );
  if (growthMarketing)
    return (
      <RouteBoundary root>
        <GrowthMarketingPage path={path} />
      </RouteBoundary>
    );
  if (
    path === "/meta-clinic" ||
    marketingFeature ||
    marketingClinicType ||
    marketingClinicFeature
  )
    return (
      <RouteBoundary root>
        <MetaClinicMarketing
          featureSlug={marketingClinicFeature?.[2] ?? marketingFeature?.[1]}
          clinicTypeSlug={
            marketingClinicFeature?.[1] ?? marketingClinicType?.[1]
          }
        />
      </RouteBoundary>
    );
  if (path === "/memberships")
    return (
      <RouteBoundary root>
        <PublicMembershipEntry>
          <PublicMembershipDirectory />
        </PublicMembershipEntry>
      </RouteBoundary>
    );
  if (publicMembership)
    return (
      <RouteBoundary root>
        <PublicMembershipEntry>
          <PublicMembershipStorefront
            slug={publicMembership[1]}
            guidedDemo={isDemoFrame()}
          />
        </PublicMembershipEntry>
      </RouteBoundary>
    );
  if (path.startsWith("/clinic") && user) {
    return (
      <SessionGuard
        key={user.id}
        expectedUserId={user.id}
        initialSession={session}
      >
        <ClinicApplication
          user={user}
          developmentAccounts={configuration.development_accounts}
          environment={configuration.environment}
          businessDate={configuration.business_date}
        />
      </SessionGuard>
    );
  }
  if (path === "/owner" && user) {
    return (
      <LaunchLayout user={user} environment={configuration.environment}>
        <SessionGuard
          key={user.id}
          expectedUserId={user.id}
          initialSession={session}
        >
          <MemberLayout key={user.id} user={user}>
            {user.workspace_tools && (
              <DevelopmentToolbar
                accounts={configuration.development_accounts}
                activeId={user.development_account_id}
                environment={configuration.environment}
                businessDate={configuration.business_date}
              />
            )}
            <RouteBoundary>
              <OwnerCommandCenter />
            </RouteBoundary>
          </MemberLayout>
        </SessionGuard>
      </LaunchLayout>
    );
  }
  if (
    (path === "/patient-portal" || path === "/patient-portal/settings") &&
    user
  )
    return (
      <SessionGuard
        key={user.id}
        expectedUserId={user.id}
        initialSession={session}
      >
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
    path === "/" || path === "/login" ? (
      <Login
        developmentLogin={configuration.development_login}
        configurationError={configurationError}
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
    <LaunchLayout user={user} environment={configuration.environment}>
      {publicPage ? (
        <RouteBoundary root>{page}</RouteBoundary>
      ) : (
        user && (
          <SessionGuard
            key={user.id}
            expectedUserId={user.id}
            initialSession={session}
          >
            <MemberLayout key={user.id} user={user}>
              <RouteBoundary>{page}</RouteBoundary>
            </MemberLayout>
          </SessionGuard>
        )
      )}
    </LaunchLayout>
  );
}
