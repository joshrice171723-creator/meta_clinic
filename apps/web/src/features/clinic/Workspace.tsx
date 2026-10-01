import { isDemoFrame } from "../demo/frame";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Typography,
} from "@mui/material";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import DashboardIcon from "@mui/icons-material/Dashboard";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import PeopleAltIcon from "@mui/icons-material/PeopleAlt";
import PersonSearchIcon from "@mui/icons-material/PersonSearch";
import SettingsIcon from "@mui/icons-material/Settings";
import SettingsSuggestOutlinedIcon from "@mui/icons-material/SettingsSuggestOutlined";
import StorefrontIcon from "@mui/icons-material/Storefront";
import DeskIcon from "@mui/icons-material/RoomService";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import MedicationOutlinedIcon from "@mui/icons-material/MedicationOutlined";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import { TelehealthSessionProvider } from "../telehealth/TelehealthSessionProvider";
import { TelehealthDock } from "../telehealth/TelehealthDock";
import type {
  ClinicCapabilities,
  ClinicOverview,
  ClinicWorkspaceContext,
  DevelopmentAccount,
  RuntimeEnvironment,
  User,
} from "../../api/contracts";
import { api, setClinicPractice } from "../../api/client";
import { ClinicScopeSelector } from "./ClinicScopeSelector";
import { LoadState, useResource } from "../../shared/ui";
import { ClinicFrame } from "./ClinicFrame";
import {
  clinicTarget,
  type ClinicHomeView,
  useClinicNavigation,
} from "./clinicNavigation";
import "./clinicNavigation.css";
import {
  AppearanceContext,
  ClinicAppearanceScope,
  useClinicAppearance,
} from "./Appearance";
import { ScribeRecordingProvider } from "../scribe/ScribeRecordingProvider";
import { DevelopmentToolbar } from "../identity/DevelopmentAccountSwitcher";
import {
  canLoadClinicOverview,
  clinicOverviewRequired,
  requiresClinicSetup,
  requiresLocationSelection,
} from "./locationSelection";
import { PatientContextBar } from "./PatientContextBar";
import { version as clinicVersion } from "../../../package.json";

type ClinicContextValue = ClinicWorkspaceContext & {
  refreshWorkspace: () => void;
};
const ClinicContext = createContext<ClinicContextValue | null>(null);
const ClinicOverviewContext = createContext<ClinicOverview | null>(null);
type ClinicNavigationLink = {
  href: string;
  label: string;
  description?: string;
  Icon: typeof DashboardIcon;
  allowed: boolean | undefined;
};

function LocationSelectionDialog({
  sites,
  selectingSiteId,
  error,
  onSelect,
  scopeSelector,
  setupNotice,
  onCancel,
}: {
  sites: ClinicWorkspaceContext["sites"];
  selectingSiteId: number | null;
  error: string;
  onSelect: (siteId: number) => void;
  scopeSelector?: ReactNode;
  setupNotice?: ReactNode;
  onCancel?: () => void;
}) {
  return (
    <Dialog
      aria-describedby="location-picker-description"
      aria-labelledby="location-picker-title"
      open
      onClose={selectingSiteId === null ? onCancel : undefined}
    >
      <DialogTitle id="location-picker-title">Choose your location</DialogTitle>
      <DialogContent>
        {scopeSelector}
        {setupNotice}
        <Typography
          color="text.secondary"
          id="location-picker-description"
          variant="body2"
        >
          Choose a location you are authorized to use before entering the clinic
          workspace.
        </Typography>
        <List aria-label="Available locations" sx={{ mt: 1 }}>
          {sites.map((site) => (
            <ListItemButton
              key={site.id}
              disabled={selectingSiteId !== null}
              onClick={() => onSelect(site.id)}
            >
              <ListItemText primary={site.name || site.code} />
            </ListItemButton>
          ))}
        </List>
        {onCancel && (
          <Button disabled={selectingSiteId !== null} onClick={onCancel}>
            Back to current location
          </Button>
        )}
        {error && (
          <Typography color="error" role="alert" variant="body2">
            {error}
          </Typography>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function LocationSetupNotice({
  sites,
  canSetup,
  onSelect,
}: {
  sites: ClinicWorkspaceContext["sites"];
  canSetup: boolean;
  onSelect?: (siteId: number) => void;
}) {
  const location = sites[0];
  if (!location) return null;
  return (
    <Alert severity="warning" sx={{ my: 2 }}>
      {location.name || location.code} isn&apos;t finalized yet — complete
      clinic setup to open its workspaces.
      {sites.length > 1 &&
        ` ${sites.length - 1} other eligible location(s) also need setup.`}
      {canSetup ? (
        <Button
          href={onSelect ? undefined : "/clinic/setup"}
          onClick={onSelect ? () => onSelect(location.id) : undefined}
          size="small"
          sx={{ ml: 1 }}
        >
          Complete clinic setup
        </Button>
      ) : (
        " Ask a clinic administrator to complete setup."
      )}
    </Alert>
  );
}

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
  const frontDesk = [
    capabilities.patient_identity_read,
    capabilities.appointments_read,
    capabilities.appointments_book,
    capabilities.billing_read,
  ].some((value) => value === true);
  const groups: {
    id: string;
    label: string;
    links: ClinicNavigationLink[];
  }[] = [
    {
      id: "care",
      label: "Care",
      links: [
        {
          href: "/clinic/work",
          label: "Patient Flow",
          description: "Pre-scheduling work inbox",
          Icon: InboxOutlinedIcon,
          allowed: true,
        },
        {
          href: "/clinic/schedule",
          label: "Schedule",
          description: "Booked appointments",
          Icon: CalendarMonthIcon,
          allowed:
            capabilities.appointments_read === true ||
            capabilities.patients === true,
        },
        {
          href: "/clinic",
          label: "Tracking Board",
          description: "Arrival and encounters",
          Icon: DashboardIcon,
          allowed: capabilities.patients === true,
        },
        {
          href: "/clinic/patients",
          label: "Patients",
          Icon: PersonSearchIcon,
          allowed: capabilities.patients,
        },
        {
          href: "/clinic/refills",
          label: "Refill requests",
          Icon: MedicationOutlinedIcon,
          allowed:
            capabilities.patients &&
            (capabilities.clinical_records_read === true ||
              capabilities.medication_requests_write === true),
        },
        {
          href: "/clinic/recalls",
          label: "Recalls and care gaps",
          Icon: NotificationsNoneIcon,
          allowed: capabilities.patients && capabilities.encounters,
        },
        {
          href: "/clinic/telehealth",
          label: "Telehealth",
          Icon: VideocamOutlinedIcon,
          allowed: capabilities.telehealth_read === true,
        },
        {
          href: "/clinic/scribe",
          label: "Scribe",
          Icon: ReceiptLongIcon,
          allowed: capabilities.scribe_read === true,
        },
      ],
    },
    {
      id: "operations",
      label: "Operations",
      links: [
        {
          href: "/clinic/front-desk",
          label: "Front desk",
          Icon: DeskIcon,
          allowed: frontDesk,
        },
        {
          href: "/clinic/waitlist",
          label: "Capacity and waitlist",
          Icon: CalendarMonthIcon,
          allowed: capabilities.appointments_read === true,
        },
        {
          href: "/clinic/operations",
          label: "Morning view",
          description: "Schedule, drawer, invoices, staffing",
          Icon: StorefrontIcon,
          allowed: true,
        },
        {
          href: "/clinic/operations#connectors-transmissions",
          label: "Connectors & transmissions",
          description: "Connection status and local simulator readouts",
          Icon: StorefrontIcon,
          allowed: true,
        },
        {
          href: "/clinic/reminders",
          label: "Reminders",
          Icon: NotificationsNoneIcon,
          allowed: capabilities.reminders === true,
        },
        {
          href: "/clinic/messages",
          label: "Messages",
          Icon: ForumOutlinedIcon,
          allowed: capabilities.staff_messaging_read === true,
        },
      ],
    },
    {
      id: "inventory",
      label: "Inventory",
      links: [
        {
          href: "/clinic/inventory",
          label: "Inventory",
          Icon: Inventory2Icon,
          allowed: capabilities.inventory,
        },
      ],
    },
    {
      id: "people",
      label: "People",
      links: [
        {
          href: "/clinic/workforce",
          label: "Workforce",
          Icon: PeopleAltIcon,
          allowed: Object.entries(capabilities).some(
            ([key, value]) => key.startsWith("workforce_") && value === true,
          ),
        },
      ],
    },
    {
      id: "account",
      label: "Account",
      links: [
        {
          href: "/clinic/billing",
          label: "Billing",
          Icon: ReceiptLongIcon,
          allowed: capabilities.billing_read === true,
        },
        {
          href: "/clinic/subscriptions",
          label: "Subscriptions",
          Icon: ReceiptLongIcon,
          allowed: capabilities.subscription_catalog_read === true,
        },
        {
          href: "/clinic/growth",
          label: "Growth",
          Icon: TrendingUpIcon,
          allowed:
            capabilities.subscriptions_review === true ||
            capabilities.subscription_catalog_publish === true,
        },
        {
          href: "/clinic/setup",
          label: "Clinic setup",
          Icon: SettingsSuggestOutlinedIcon,
          allowed: capabilities.facilities_read === true,
        },
        {
          href: "/clinic/settings",
          label: "Settings",
          Icon: SettingsIcon,
          allowed: true,
        },
      ],
    },
  ];
  const currentPath = path.replace(/\/+$/, "") || "/";
  return (
    <nav className="clinic-work-navigation" aria-label="Clinic navigation">
      {groups.map((group) => {
        const links = group.links.filter((link) => link.allowed);
        if (!links.length) return null;
        const headingId = `clinic-navigation-${group.id}`;
        return (
          <section key={group.id} aria-labelledby={headingId}>
            <List
              component="div"
              disablePadding
              subheader={
                <ListSubheader component="h2" disableSticky id={headingId}>
                  {group.label}
                </ListSubheader>
              }
            >
              {links.map(({ href, label, description, Icon }) => {
                const current =
                  href === "/clinic"
                    ? currentPath === "/clinic" && homeView === "tracking"
                    : href === "/clinic/schedule"
                      ? currentPath === "/clinic/schedule" ||
                        (currentPath === "/clinic" && homeView === "schedule")
                      : currentPath === href ||
                        currentPath.startsWith(href + "/");
                return (
                  <ListItemButton
                    component="a"
                    key={href}
                    href={href}
                    selected={current}
                    aria-current={current ? "page" : undefined}
                    data-demo-tour-navigation="true"
                  >
                    <ListItemIcon>
                      <Icon aria-hidden="true" fontSize="small" />
                    </ListItemIcon>
                    <ListItemText primary={label} secondary={description} />
                  </ListItemButton>
                );
              })}
            </List>
          </section>
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
  if (administrative) return "/clinic/front-desk";
  if (capabilities.telehealth_read) return "/clinic/telehealth";
  if (capabilities.telehealth_configure) return "/clinic/settings/telehealth";
  if (capabilities.workforce_self) return "/clinic/workforce/hours";
  if (capabilities.facilities_read) return "/clinic/setup";
  return "/clinic/operations";
}

export function showsClinicScopeSelector(
  demoFrame: boolean,
  sandboxDemo: boolean,
) {
  return !demoFrame || sandboxDemo;
}

export function Workspace({
  children,
  user,
  path = typeof window === "undefined" ? "/clinic" : window.location.pathname,
  search = typeof window === "undefined" ? "" : window.location.search,
  homeView = "tracking",
  developmentAccounts = [],
  environment = "unknown",
  businessDate = "",
  ownerPinRequired = false,
}: {
  children: ReactNode;
  user: User;
  path?: string;
  search?: string;
  homeView?: ClinicHomeView;
  developmentAccounts?: DevelopmentAccount[];
  environment?: RuntimeEnvironment;
  businessDate?: string;
  ownerPinRequired?: boolean;
}) {
  const { navigate, confirmNavigation } = useClinicNavigation();
  const {
    data,
    error,
    refresh: refreshWorkspace,
  } = useResource<ClinicWorkspaceContext>("/api/clinic/context");
  const [locationSelectionMade, setLocationSelectionMade] = useState(false);
  const [locationPickerRequested, setLocationPickerRequested] = useState(false);
  const locationSelected =
    !locationPickerRequested &&
    (locationSelectionMade || Boolean(data?.current_site));
  const [switchingPractice, setSwitchingPractice] = useState(false);
  useLayoutEffect(() => {
    setClinicPractice(data?.practice.id);
    return () => setClinicPractice(undefined);
  }, [data?.practice.id]);
  const [selectingSiteId, setSelectingSiteId] = useState<number | null>(null);
  const [locationPickerError, setLocationPickerError] = useState("");
  const selectingLocation = useRef(false);
  const [previousLocationContext, setPreviousLocationContext] =
    useState<ClinicWorkspaceContext | null>(null);

  const selectSite = async (siteId: number) => {
    if (selectingLocation.current) return;
    if (data?.current_site?.id === siteId) {
      setLocationPickerRequested(false);
      setLocationPickerError("");
      return;
    }
    if (confirmNavigation && !confirmNavigation()) return;
    selectingLocation.current = true;
    setSelectingSiteId(siteId);
    setLocationPickerError("");
    try {
      await api("/api/clinic/context", {
        method: "PATCH",
        body: { site_id: siteId },
      });
      setPreviousLocationContext(data ?? null);
      setLocationSelectionMade(true);
      setLocationPickerRequested(false);
      refreshWorkspace();
      overview.refresh();
    } catch (caught) {
      setPreviousLocationContext(null);
      setLocationPickerError(
        caught instanceof Error
          ? caught.message
          : "Unable to select this location. Try again.",
      );
    } finally {
      selectingLocation.current = false;
      setSelectingSiteId(null);
    }
  };
  const selectPractice = async (practiceId: number) => {
    if (selectingLocation.current || practiceId === data?.practice.id) return;
    if (confirmNavigation && !confirmNavigation()) return;
    selectingLocation.current = true;
    setSwitchingPractice(true);
    setLocationPickerError("");
    try {
      await api("/api/clinic/context", {
        method: "PATCH",
        body: { practice_id: practiceId },
      });
      window.location.replace("/clinic");
    } catch (caught) {
      setLocationPickerError(
        caught instanceof Error
          ? caught.message
          : "Unable to switch clinics. Try again.",
      );
      selectingLocation.current = false;
      setSwitchingPractice(false);
    }
  };
  const overview = useResource<ClinicOverview>("/api/clinic", {
    enabled: canLoadClinicOverview(
      data?.sites,
      locationSelected,
      clinicOverviewRequired(path),
    ),
  });
  const appearance = useClinicAppearance(user.id);
  const setupFeatures = data?.features as
    | (NonNullable<ClinicWorkspaceContext["features"]> & {
        site_specialty_configured?: boolean;
      })
    | undefined;
  const setupRequired = requiresClinicSetup(
    data?.current_site?.id,
    setupFeatures,
  );
  const staffSetupPath = path === "/clinic/workforce/employees";
  const landingDestination =
    data && !setupRequired
      ? clinicLandingDestination(data.capabilities, path, homeView)
      : null;
  useEffect(() => {
    if (landingDestination) navigate(landingDestination, { replace: true });
  }, [landingDestination, navigate]);
  useEffect(() => {
    if (setupRequired && path !== "/clinic/setup" && !staffSetupPath)
      navigate("/clinic/setup", { replace: true });
  }, [navigate, path, setupRequired, staffSetupPath]);
  useEffect(() => {
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [path, homeView]);
  const trackingBoard =
    path.replace(/\/+$/, "") === "/clinic" && homeView === "tracking";
  const inventoryPage = path.startsWith("/clinic/inventory");
  const schedulePage = path.startsWith("/clinic/schedule");
  const scribePage = path.startsWith("/clinic/scribe");
  const locationName =
    data?.current_site?.name || data?.current_site?.code || null;
  const incompleteSites =
    data?.sites.filter((site) => site.finalized !== true) ?? [];
  const onlyIncompleteSites =
    !!data?.sites.length && incompleteSites.length === data.sites.length;
  if (!data)
    return (
      <ClinicAppearanceScope {...appearance}>
        <main id="main" className="wrap inner-page">
          <LoadState error={error} />
          {error && (
            <Button
              variant="contained"
              onClick={() => {
                refreshWorkspace();
              }}
            >
              Try again
            </Button>
          )}
          <a href="/portal">Return to My launch</a>
        </main>
      </ClinicAppearanceScope>
    );
  if (
    data.user_id !== user.id ||
    data.schema_version !== "clinic-context-v1" ||
    data.policy_version !== "clinic-authorization-v1"
  )
    return (
      <ClinicAppearanceScope {...appearance}>
        <main id="main" className="wrap inner-page">
          <LoadState error="Unable to verify this clinic workspace. Reload and check your signed-in account." />
          <a href="/portal">Return to My launch</a>
        </main>
      </ClinicAppearanceScope>
    );
  if (requiresLocationSelection(data.sites, locationSelected))
    return (
      <ClinicAppearanceScope {...appearance}>
        <main id="main" className="wrap inner-page">
          <LocationSelectionDialog
            scopeSelector={
              <ClinicScopeSelector
                context={data}
                disabled={switchingPractice || selectingSiteId !== null}
                onPracticeChange={(id) => void selectPractice(id)}
              />
            }
            setupNotice={
              onlyIncompleteSites && (
                <LocationSetupNotice
                  sites={incompleteSites}
                  canSetup={data.capabilities.clinic_setup_write === true}
                  onSelect={(siteId) => void selectSite(siteId)}
                />
              )
            }
            error={locationPickerError}
            onSelect={(siteId) => void selectSite(siteId)}
            selectingSiteId={selectingSiteId}
            sites={data.sites}
            onCancel={
              data.current_site
                ? () => {
                    setLocationPickerRequested(false);
                    setLocationPickerError("");
                  }
                : undefined
            }
          />
        </main>
      </ClinicAppearanceScope>
    );
  if (data === previousLocationContext)
    return (
      <ClinicAppearanceScope {...appearance}>
        <main id="main" className="wrap inner-page">
          <LoadState />
        </main>
      </ClinicAppearanceScope>
    );
  const clinicContext: ClinicContextValue = {
    ...data,
    refreshWorkspace,
  };
  if (setupRequired && !staffSetupPath)
    return (
      <ClinicAppearanceScope {...appearance}>
        <AppearanceContext value={appearance}>
          <ClinicContext value={clinicContext}>
            <ClinicOverviewContext value={overview.data ?? null}>
              <main id="main" className="wrap inner-page">
                {onlyIncompleteSites && (
                  <LocationSetupNotice
                    sites={incompleteSites}
                    canSetup={data.capabilities.clinic_setup_write === true}
                  />
                )}
                {data.sites.length > 1 && (
                  <Button
                    onClick={() => {
                      setLocationPickerError("");
                      setLocationPickerRequested(true);
                    }}
                  >
                    Choose another location
                  </Button>
                )}
                {path === "/clinic/setup" ? (
                  children
                ) : (
                  <Typography color="text.secondary">
                    Complete Clinic Setup for this location to continue.
                  </Typography>
                )}
              </main>
            </ClinicOverviewContext>
          </ClinicContext>
        </AppearanceContext>
      </ClinicAppearanceScope>
    );
  if (clinicOverviewRequired(path) && !overview.data)
    return (
      <ClinicAppearanceScope {...appearance}>
        <main id="main" className="wrap inner-page">
          <LoadState error={overview.error} />
          {overview.error && (
            <Button variant="contained" onClick={overview.refresh}>
              Try again
            </Button>
          )}
          <a href="/portal">Return to My launch</a>
        </main>
      </ClinicAppearanceScope>
    );
  if (
    clinicOverviewRequired(path) &&
    overview.data &&
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
        <ClinicContext value={clinicContext}>
          <ClinicOverviewContext value={overview.data ?? null}>
            <ScribeRecordingProvider
              key={`${user.id}:${data.practice.id}:${data.membership_id ?? "none"}:${data.current_site?.id ?? "all"}`}
            >
              <TelehealthSessionProvider
                path={path}
                contextKey={`${user.id}:${data.practice.id}:${data.membership_id}:${data.current_site?.id ?? "all"}`}
              >
                <div
                  inert={selectingSiteId !== null || switchingPractice}
                  aria-busy={selectingSiteId !== null || switchingPractice}
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
                    scopeSelector={
                      showsClinicScopeSelector(
                        isDemoFrame(),
                        data.demo_sandbox === true,
                      ) && (
                        <ClinicScopeSelector
                          context={data}
                          disabled={
                            switchingPractice || selectingSiteId !== null
                          }
                          onPracticeChange={(id) => void selectPractice(id)}
                          onLocationChange={(id) => void selectSite(id)}
                        />
                      )
                    }
                    practiceName={data.practice.name}
                    timezone={data.practice.timezone}
                    locationName={locationName}
                    locations={data.sites}
                    selectedLocationId={data.current_site?.id}
                    onLocationChange={(siteId) => void selectSite(siteId)}
                    navigation={
                      <ClinicNavigation
                        capabilities={data.capabilities}
                        path={path}
                        homeView={homeView}
                      />
                    }
                    developmentPreview={!!user.development_demo}
                  >
                    {!scribePage &&
                      (user.workspace_tools || user.development_demo) &&
                      !isDemoFrame() && (
                        <DevelopmentToolbar
                          className="clinic-development-toolbar"
                          accounts={developmentAccounts}
                          activeId={user.development_account_id}
                          businessDate={businessDate}
                          environment={environment}
                          ownerPinRequired={ownerPinRequired}
                        />
                      )}
                    {!scribePage && !isDemoFrame() && (
                      <header
                        className={`clinic-topbar${user.development_demo ? " clinic-topbar-development" : ""}`}
                        aria-label="Clinic context"
                      >
                        {!user.development_demo && (
                          <div className="clinic-topbar-context">
                            <span>
                              Signed in as <strong>{user.email_address}</strong>
                              {data.credentials.length > 0 && (
                                <>, {data.credentials.join(", ")}</>
                              )}
                            </span>
                          </div>
                        )}
                        <span className="clinic-topbar-actions">
                          <span className="clinic-topbar-location">
                            {data.current_site?.name ||
                              data.current_site?.code ||
                              data.practice.name}
                          </span>
                          <a href="/clinic/settings">My settings</a>
                          <a
                            href="/clinic/updates"
                            aria-current={
                              path === "/clinic/updates" ? "page" : undefined
                            }
                          >
                            Version {clinicVersion} · Update log
                          </a>
                        </span>
                      </header>
                    )}
                    <PatientContextBar
                      key={`${data.practice.id}:${data.current_site?.id ?? "all"}`}
                      capabilities={data.capabilities}
                      path={path}
                      search={search}
                      practiceName={data.practice.name}
                      locationName={locationName || "All locations"}
                    />
                    <main
                      id="main"
                      tabIndex={-1}
                      className={`clinic-content${trackingBoard ? " tracking-board-page" : ""}${inventoryPage ? " inventory-page" : ""}${schedulePage ? " schedule-page" : ""}${scribePage ? " scribe-page" : ""}`}
                    >
                      {locationPickerError && (
                        <Typography color="error" role="alert">
                          {locationPickerError}
                        </Typography>
                      )}
                      {children}
                    </main>
                  </ClinicFrame>
                </div>
                <TelehealthDock />
              </TelehealthSessionProvider>
            </ScribeRecordingProvider>
          </ClinicOverviewContext>
        </ClinicContext>
      </AppearanceContext>
    </ClinicAppearanceScope>
  );
}
