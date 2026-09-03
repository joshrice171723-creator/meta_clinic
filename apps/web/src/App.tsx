import { useEffect, useState, type ReactNode } from "react";
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
import { BillingDashboard } from "./features/clinic/BillingDashboard";
import { EncounterPage, Schedule } from "./features/clinic/CareFlow";
import {
  ChartSelectionPage,
  chartSelectionProps,
} from "./features/clinic/ChartSelectionPage";
import { Catalog } from "./features/inventory/Catalog";
import { NewProduct } from "./features/inventory/NewProduct";
import { Product } from "./features/inventory/Product";
import { InventoryApp } from "./features/inventory/InventoryApp";

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
    const pharmacy = /^\/clinic\/pharmacy\/(\d+)$/.exec(path),
      encounter = /^\/clinic\/patients\/(\d+)\/encounters\/(\d+)$/.exec(path),
      patient = /^\/clinic\/patients\/(\d+)$/.exec(path);
    page =
      path === "/clinic" ? (
        <Overview />
      ) : path === "/clinic/operations" ? (
        <Operations />
      ) : path === "/clinic/settings" ? (
        <Settings user={user} />
      ) : path === "/clinic/billing" ? (
        <BillingDashboard />
      ) : path === "/clinic/schedule" ? (
        <Schedule />
      ) : path === "/clinic/chart-selection" ? (
        <ChartSelectionPage {...chartSelectionProps(window.location.search)} />
      ) : path.startsWith("/clinic/inventory") ? (
        <InventoryApp path={path} />
      ) : path === "/clinic/pharmacy" ? (
        <Catalog />
      ) : path === "/clinic/pharmacy/new" ? (
        <NewProduct />
      ) : pharmacy ? (
        <Product id={pharmacy[1]} />
      ) : path === "/clinic/patients" ? (
        <Patients />
      ) : encounter ? (
        <EncounterPage patientId={encounter[1]} encounterId={encounter[2]} />
      ) : patient ? (
        <Patients id={patient[1]} />
      ) : path === "/clinic/staff" ? (
        <Staff />
      ) : (
        <h1>Page not found.</h1>
      );
    return (
      <>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Workspace key={user.id} user={user}>
          {page}
        </Workspace>
      </>
    );
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
