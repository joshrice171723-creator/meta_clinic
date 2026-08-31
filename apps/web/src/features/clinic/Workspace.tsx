import { createContext, useContext, type ReactNode } from "react";
import type { ClinicOverview, User } from "../../api/contracts";
import { LoadState, useResource } from "../../shared/ui";
import { ClinicFrame } from "./ClinicFrame";
import {
  AppearanceContext,
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
      label: "Patients",
      allowed: capabilities.patients_access,
    },
    {
      href: "/clinic/pharmacy",
      label: "Pharmacy",
      allowed: capabilities.inventory_access,
    },
    {
      href: "/clinic/operations",
      label: "Operations",
      allowed: true,
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
    { href: "/clinic/settings", label: "Settings", allowed: true },
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
export function Workspace({
  children,
  user,
}: {
  children: ReactNode;
  user: User;
}) {
  const { data, error } = useResource<ClinicOverview>("/api/clinic");
  const appearance = useClinicAppearance(user.id);
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
      <AppearanceContext value={appearance}>
        <ClinicContext value={data}>
          <ClinicFrame
            practiceName={data.practice.name}
            navigation={
              <ClinicNavigation
                capabilities={c}
                path={
                  typeof window === "undefined"
                    ? "/clinic"
                    : window.location.pathname
                }
              />
            }
          >
            <header className="clinic-topbar">
              <span>CLINIC WORKSPACE</span>
              <a href="/clinic/settings">My settings</a>
            </header>
            <p className="clinic-safety">
              SYNTHETIC ONLY · Not a released EHR. No real patient or employee
              information. Production clinic access is disabled.
            </p>
            <main id="main" className="clinic-content pharmacy-page">
              {children}
            </main>
          </ClinicFrame>
        </ClinicContext>
      </AppearanceContext>
    </ClinicAppearanceScope>
  );
}
