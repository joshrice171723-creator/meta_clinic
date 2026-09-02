import { createContext, useContext, type ReactNode } from "react";
import type {
  ClinicCapabilities,
  ClinicOverview,
  ClinicWorkspaceContext,
  User,
} from "../../api/contracts";
import { LoadState, useResource } from "../../shared/ui";
import { ClinicFrame } from "./ClinicFrame";
import {
  AppearanceContext,
  ClinicAppearanceScope,
  useClinicAppearance,
} from "./Appearance";

const ClinicContext = createContext<ClinicWorkspaceContext | null>(null);
const ClinicOverviewContext = createContext<ClinicOverview | null>(null);
export function useClinic() {
  const clinic = useContext(ClinicContext);
  if (!clinic) throw new Error("Clinic pages require an authorized workspace.");
  return clinic;
}
export function useClinicOverview() {
  const clinic = useContext(ClinicOverviewContext);
  if (!clinic) throw new Error("Legacy clinic modules require their summary.");
  return clinic;
}
export function ClinicNavigation({
  capabilities,
  path,
}: {
  capabilities: ClinicCapabilities;
  path: string;
}) {
  const links = [
    { href: "/clinic", label: "Tracking Board", allowed: true },
    {
      href: "/clinic/patients",
      label: "Patients",
      allowed: capabilities.patients,
    },
    {
      href: "/clinic/schedule",
      label: "Schedule",
      allowed: capabilities.patients,
    },
    {
      href: "/clinic/inventory",
      label: "Inventory",
      allowed: capabilities.inventory,
    },
    {
      href: "/clinic/operations",
      label: "Operations",
      allowed: true,
    },
    {
      href: "/clinic/staff",
      label: "Employees",
      allowed: capabilities.staff,
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
  const { data, error } = useResource<ClinicWorkspaceContext>(
    "/api/clinic/context",
  );
  const overview = useResource<ClinicOverview>("/api/clinic");
  const appearance = useClinicAppearance(user.id);
  const path =
    typeof window === "undefined" ? "/clinic" : window.location.pathname;
  const trackingBoard = path.replace(/\/+$/, "") === "/clinic";
  if (!data || !overview.data)
    return (
      <ClinicAppearanceScope {...appearance}>
        <main id="main" className="wrap inner-page">
          <LoadState error={error || overview.error} />
          <a href="/portal">Return to My launch</a>
        </main>
      </ClinicAppearanceScope>
    );
  if (
    data.user_id !== user.id ||
    data.schema_version !== "clinic-context-v1" ||
    data.policy_version !== "clinic-authorization-v1" ||
    overview.data.practice.id !== data.practice.id
  )
    return (
      <ClinicAppearanceScope {...appearance}>
        <main id="main" className="wrap inner-page">
          <LoadState error="Unable to verify this clinic workspace. Reload and check your signed-in account." />
          <a href="/portal">Return to My launch</a>
        </main>
      </ClinicAppearanceScope>
    );
  return (
    <ClinicAppearanceScope {...appearance}>
      <AppearanceContext value={appearance}>
        <ClinicContext value={data}>
          <ClinicOverviewContext value={overview.data}>
            <ClinicFrame
              practiceName={data.practice.name}
              navigation={
                <ClinicNavigation
                  capabilities={data.capabilities}
                  path={path}
                />
              }
            >
              <header className="clinic-topbar">
                <span>
                  Currently logged in as: <strong>{user.email_address}</strong>
                  {data.credentials.length > 0 && (
                    <>, {data.credentials.join(", ")}</>
                  )}
                </span>
                <a href="/clinic/settings">My settings</a>
              </header>
              <main
                id="main"
                className={`clinic-content pharmacy-page${trackingBoard ? " tracking-board-page" : ""}`}
              >
                {children}
              </main>
            </ClinicFrame>
          </ClinicOverviewContext>
        </ClinicContext>
      </AppearanceContext>
    </ClinicAppearanceScope>
  );
}
