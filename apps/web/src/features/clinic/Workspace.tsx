import { createContext, useContext, type ReactNode } from "react";
import { useEffect } from "react";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import DashboardIcon from "@mui/icons-material/Dashboard";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import LocalPharmacyIcon from "@mui/icons-material/LocalPharmacy";
import PeopleAltIcon from "@mui/icons-material/PeopleAlt";
import PersonSearchIcon from "@mui/icons-material/PersonSearch";
import SettingsIcon from "@mui/icons-material/Settings";
import StorefrontIcon from "@mui/icons-material/Storefront";
import DeskIcon from "@mui/icons-material/RoomService";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import type {
  ClinicCapabilities,
  ClinicOverview,
  ClinicWorkspaceContext,
  User,
} from "../../api/contracts";
import { LoadState, useResource } from "../../shared/ui";
import { ClinicFrame } from "./ClinicFrame";
import {
  clinicTarget,
  type ClinicHomeView,
  useClinicNavigation,
} from "./clinicNavigation";
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
  homeView = "tracking",
}: {
  capabilities: ClinicCapabilities;
  path: string;
  homeView?: ClinicHomeView;
}) {
  const { navigate } = useClinicNavigation();
  const frontDesk = [
    capabilities.patient_identity_read,
    capabilities.appointments_read,
    capabilities.appointments_book,
    capabilities.billing_read,
  ].some((value) => value === true);
  const links = [
    {
      href: "/clinic/front-desk",
      label: "Front desk",
      Icon: DeskIcon,
      allowed: frontDesk,
    },
    {
      href: "/clinic",
      label: "Tracking Board",
      Icon: DashboardIcon,
      allowed: capabilities.patients === true,
      view: "tracking" as const,
    },
    {
      href: "/clinic/patients",
      label: "Patients",
      Icon: PersonSearchIcon,
      allowed: capabilities.patients,
    },
    {
      href: "/clinic",
      label: "Schedule",
      Icon: CalendarMonthIcon,
      allowed:
        capabilities.appointments_read === true ||
        capabilities.patients === true,
      view: "schedule" as const,
    },
    {
      href: "/clinic/pharmacy",
      label: "Pharmacy",
      Icon: LocalPharmacyIcon,
      allowed: capabilities.inventory,
    },
    {
      href: "/clinic/operations",
      label: "Operations",
      Icon: StorefrontIcon,
      allowed: true,
    },
    {
      href: "/clinic/inventory",
      label: "Inventory",
      Icon: Inventory2Icon,
      allowed: capabilities.inventory,
    },
    {
      href: "/clinic/staff",
      label: "Employees",
      Icon: PeopleAltIcon,
      allowed: capabilities.staff,
    },
    {
      href: "/clinic/billing",
      label: "Billing",
      Icon: ReceiptLongIcon,
      allowed: capabilities.billing_read === true,
    },
    {
      href: "/clinic/settings",
      label: "Settings",
      Icon: SettingsIcon,
      allowed: true,
    },
  ];
  const currentPath = path.replace(/\/+$/, "") || "/";
  return (
    <nav aria-label="Clinic navigation">
      {links
        .filter((link) => link.allowed)
        .map(({ href, label, Icon, view }) => {
          const current = view
            ? currentPath === "/clinic" && homeView === view
            : currentPath === href ||
              (href !== "/clinic" && currentPath.startsWith(href + "/"));
          return view ? (
            <button
              key={`${href}-${view}`}
              type="button"
              aria-current={current ? "page" : undefined}
              onClick={() => navigate(href, { homeView: view })}
            >
              <Icon aria-hidden="true" fontSize="small" />
              {label}
            </button>
          ) : (
            <a
              key={href}
              href={href}
              aria-current={current ? "page" : undefined}
            >
              <Icon aria-hidden="true" fontSize="small" />
              {label}
            </a>
          );
        })}
    </nav>
  );
}

export function clinicLandingDestination(
  capabilities: ClinicCapabilities,
  path: string,
  homeView: ClinicHomeView,
) {
  if (
    path.replace(/\/+$/, "") !== "/clinic" ||
    homeView !== "tracking" ||
    capabilities.patients === true
  )
    return null;
  const administrative = [
    capabilities.patient_identity_read,
    capabilities.appointments_read,
    capabilities.appointments_book,
    capabilities.billing_read,
  ].some((value) => value === true);
  return administrative ? "/clinic/front-desk" : "/clinic/operations";
}

export function Workspace({
  children,
  user,
  path = typeof window === "undefined" ? "/clinic" : window.location.pathname,
  homeView = "tracking",
}: {
  children: ReactNode;
  user: User;
  path?: string;
  homeView?: ClinicHomeView;
}) {
  const { navigate } = useClinicNavigation();
  const { data, error } = useResource<ClinicWorkspaceContext>(
    "/api/clinic/context",
  );
  const overview = useResource<ClinicOverview>("/api/clinic");
  const appearance = useClinicAppearance(user.id);
  const landingDestination = data
    ? clinicLandingDestination(data.capabilities, path, homeView)
    : null;
  useEffect(() => {
    if (landingDestination) navigate(landingDestination, { replace: true });
  }, [landingDestination, navigate]);
  const trackingBoard =
    path.replace(/\/+$/, "") === "/clinic" && homeView === "tracking";
  const inventoryPage = path.startsWith("/clinic/inventory");
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
  if (landingDestination)
    return (
      <ClinicAppearanceScope {...appearance}>
        <main id="main" className="wrap inner-page">
          <LoadState />
        </main>
      </ClinicAppearanceScope>
    );
  return (
    <ClinicAppearanceScope {...appearance}>
      <AppearanceContext value={appearance}>
        <ClinicContext value={data}>
          <ClinicOverviewContext value={overview.data}>
            <div
              onClick={(event) => {
                if (
                  event.defaultPrevented ||
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                const anchor = (
                  event.target as Element
                ).closest<HTMLAnchorElement>("a[href]");
                if (
                  !anchor ||
                  anchor.target ||
                  anchor.hasAttribute("download") ||
                  anchor.rel.split(/\s+/).includes("external") ||
                  anchor.closest('[contenteditable="true"]') ||
                  !clinicTarget(anchor.href, window.location.origin)
                )
                  return;
                if (anchor.getAttribute("aria-disabled") === "true") {
                  event.preventDefault();
                  return;
                }
                event.preventDefault();
                navigate(anchor.href, {
                  homeView:
                    anchor.dataset.clinicView === "schedule"
                      ? "schedule"
                      : anchor.dataset.clinicView === "tracking"
                        ? "tracking"
                        : undefined,
                });
              }}
            >
              <ClinicFrame
                practiceName={data.practice.name}
                navigation={
                  <ClinicNavigation
                    capabilities={data.capabilities}
                    path={path}
                    homeView={homeView}
                  />
                }
              >
                <header className="clinic-topbar" aria-label="Clinic context">
                  <span className="clinic-topbar-context">
                    Currently logged in as:{" "}
                    <strong>{user.email_address}</strong>
                    {data.credentials.length > 0 && (
                      <>, {data.credentials.join(", ")}</>
                    )}
                  </span>
                  <span className="clinic-topbar-actions">
                    <span className="clinic-topbar-location">
                      {data.practice.name}
                    </span>
                    <a href="/clinic/settings">My settings</a>
                  </span>
                </header>
                <main
                  id="main"
                  className={`clinic-content pharmacy-page${trackingBoard ? " tracking-board-page" : ""}${inventoryPage ? " inventory-page" : ""}`}
                >
                  {children}
                </main>
              </ClinicFrame>
            </div>
          </ClinicOverviewContext>
        </ClinicContext>
      </AppearanceContext>
    </ClinicAppearanceScope>
  );
}
