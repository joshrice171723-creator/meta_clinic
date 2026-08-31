import { createContext, useContext, type ReactNode } from "react";
import type { ClinicOverview } from "../../api/contracts";
import { Card, Form, LoadState, useResource } from "../../shared/ui";
import {
  AppearancePicker,
  ClinicAppearanceScope,
  useClinicAppearance,
} from "./Appearance";

const ClinicContext = createContext<ClinicOverview | null>(null);
export function useClinic() {
  const clinic = useContext(ClinicContext);
  if (!clinic) throw new Error("Clinic pages require an authorized workspace.");
  return clinic;
}
export function ClinicNavigation({
  capabilities,
  path,
}: {
  capabilities: Pick<
    ClinicOverview["capabilities"],
    "patients_access" | "inventory_access" | "staff_access"
  >;
  path: string;
}) {
  const links = [
    { href: "/clinic", label: "Overview", allowed: true },
    {
      href: "/clinic/patients",
      label: "EHR · Patients",
      allowed: capabilities.patients_access,
    },
    {
      href: "/clinic/pharmacy",
      label: "EHR · Pharmacy",
      allowed: capabilities.inventory_access,
    },
    {
      href: "/clinic/inventory",
      label: "Office inventory",
      allowed: capabilities.inventory_access,
    },
    {
      href: "/clinic/staff",
      label: "Employees",
      allowed: capabilities.staff_access,
    },
  ];
  const currentPath = path.replace(/\/+$/, "") || "/";
  return (
    <nav aria-label="Clinic navigation">
      {links
        .filter((link) => link.allowed)
        .map(({ href, label }) => (
          <a
            key={href}
            href={href}
            aria-current={
              currentPath === href ||
              (href !== "/clinic" && currentPath.startsWith(href + "/"))
                ? "page"
                : undefined
            }
          >
            {label}
          </a>
        ))}
    </nav>
  );
}
export function Workspace({ children }: { children: ReactNode }) {
  const { data, error } = useResource<ClinicOverview>("/api/clinic");
  const appearance = useClinicAppearance();
  if (!data)
    return (
      <ClinicAppearanceScope {...appearance}>
        <main id="main" className="wrap inner-page">
          <LoadState error={error} />
          <a href="/portal">Return to My launch</a>
        </main>
      </ClinicAppearanceScope>
    );
  const c = data.capabilities;
  return (
    <ClinicAppearanceScope {...appearance}>
      <ClinicContext value={data}>
        <div className="clinic-shell">
          <aside className="clinic-sidebar">
            <a className="wordmark" href="/clinic">
              APPly
              <span className="brand-dot" />
            </a>
            <p className="workspace-label">CLINIC WORKSPACE</p>
            <div className="practice-label">
              <strong>{data.practice.name}</strong>
              <span>Local synthetic prototype</span>
            </div>
            <ClinicNavigation
              capabilities={c}
              path={
                typeof window === "undefined"
                  ? "/clinic"
                  : window.location.pathname
              }
            />
            <div className="clinic-sidebar-bottom">
              <a href="/portal">← Launch &amp; onboarding</a>
              <a href="/">APPly selling site</a>
              <Form
                endpoint="/api/session"
                method="DELETE"
                submit="Sign out"
                onSuccess={() => window.location.replace("/login")}
              />
            </div>
          </aside>
          <div className="clinic-main">
            <header className="clinic-topbar">
              <span>CLINIC OPERATIONS</span>
              <AppearancePicker {...appearance} />
            </header>
            <p className="clinic-safety">
              SYNTHETIC ONLY · Not a released EHR. No real patient or employee
              information. Production clinic access is disabled.
            </p>
            <main id="main" className="clinic-content pharmacy-page">
              {children}
            </main>
          </div>
        </div>
      </ClinicContext>
    </ClinicAppearanceScope>
  );
}
export function Overview() {
  const clinic = useClinic(),
    c = clinic.capabilities;
  return (
    <>
      <p className="eyebrow">YOUR PRACTICE AT A GLANCE</p>
      <h1>Clinic overview.</h1>
      <p className="clinic-lead">
        The business of running your clinic, separate from the work of launching
        it.
      </p>
      <div className="clinic-stats">
        {c.patients_access && (
          <a className="clinic-stat" href="/clinic/patients">
            <span>Fictional patients</span>
            <strong>{clinic.patient_count}</strong>
            <small>Open EHR workspace ↗</small>
          </a>
        )}
        {c.inventory_access && (
          <a className="clinic-stat" href="/clinic/inventory">
            <span>Items at reorder level</span>
            <strong>{clinic.low_stock?.length}</strong>
            <small>Review inventory ↗</small>
          </a>
        )}
        {c.staff_access && (
          <a className="clinic-stat" href="/clinic/staff">
            <span>Active directory entries</span>
            <strong>{clinic.active_staff_count}</strong>
            <small>Manage employees ↗</small>
          </a>
        )}
      </div>
      <div className="clinic-grid">
        <Card title="What you can try.">
          <ul className="clinic-feature-list">
            <li>
              Fictional patient directory and append-only draft entries. No
              prescribing, orders, or clinical signing.
            </li>
            <li>
              Office and pharmacy inventory with append-only stock history. No
              purchases are placed.
            </li>
            <li>
              Staff directory. Entries do not create logins or change access.
            </li>
          </ul>
        </Card>
        <Card title="Needs attention.">
          {clinic.low_stock === null ? (
            <p>Inventory details are restricted to assigned inventory users.</p>
          ) : clinic.low_stock.length === 0 ? (
            <p>No items are currently at the reorder level.</p>
          ) : (
            <ul>
              {clinic.low_stock.map((i) => (
                <li key={i.id}>
                  {i.name} · {i.quantity} on hand · reorder at {i.reorder_level}
                </li>
              ))}
            </ul>
          )}
          <p>
            SharePoint mapping, clinical workflow review, security controls, and
            real-data release remain future work.
          </p>
        </Card>
      </div>
    </>
  );
}
