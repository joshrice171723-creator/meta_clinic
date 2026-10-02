import {
  createContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LaunchIcon from "@mui/icons-material/Launch";
import MenuIcon from "@mui/icons-material/Menu";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import BusinessIcon from "@mui/icons-material/Business";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import type { ClinicSite } from "../../api/contracts";
import { Form } from "../../shared/ui";
import { isDemoFrame } from "../demo/frame";

export const COMPACT_NAV_QUERY = "(max-width: 900px)";
export const ClinicRailContext = createContext(false);
export function compactNavigation() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(COMPACT_NAV_QUERY).matches
  );
}

export function ClinicFrame({
  practiceName,
  timezone,
  locationName,
  locations = [],
  selectedLocationId,
  onLocationChange,
  navigation,
  children,
  developmentPreview = false,
  scopeSelector,
}: {
  practiceName: string;
  timezone: string;
  locationName?: string | null;
  locations?: Pick<ClinicSite, "id" | "code" | "name">[];
  selectedLocationId?: number | null;
  onLocationChange?: (siteId: number) => void;
  navigation: ReactNode;
  children: ReactNode;
  developmentPreview?: boolean;
  scopeSelector?: ReactNode;
}) {
  const [compact, setCompact] = useState(compactNavigation);
  const [collapsed, setCollapsed] = useState(compactNavigation);
  const desktopCollapsed = useRef(false);
  const focusScope = useRef(false);
  const tab = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const locationMenu = useRef<HTMLDivElement>(null);
  const locationTrigger = useRef<HTMLButtonElement>(null);
  const [locationMenuOpen, setLocationMenuOpen] = useState(false);
  const [highlightedLocation, setHighlightedLocation] = useState(0);
  const drawer = compact && !collapsed;
  const rail = !compact && collapsed;
  const toggleLabel = compact
    ? collapsed
      ? "Open clinic menu"
      : "Close clinic menu"
    : collapsed
      ? "Expand sidebar"
      : "Collapse sidebar";
  const selectedLocation = locations.find(
    (site) => site.id === selectedLocationId,
  );
  const highlightedLocationId = locations[highlightedLocation]?.id;
  const visibleLocationName =
    locationName || selectedLocation?.name || selectedLocation?.code;
  const selectLocation = (siteId: number) => {
    setLocationMenuOpen(false);
    onLocationChange?.(siteId);
    locationTrigger.current?.focus();
  };
  const close = () => {
    setCollapsed(true);
    tab.current?.focus();
  };
  useEffect(() => {
    const media = window.matchMedia(COMPACT_NAV_QUERY);
    const change = () => {
      setCompact(media.matches);
      if (media.matches) {
        if (panel.current?.contains(document.activeElement))
          tab.current?.focus();
        setCollapsed(true);
      } else setCollapsed(desktopCollapsed.current);
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!collapsed && focusScope.current) {
      focusScope.current = false;
      if (panel.current) panel.current.scrollTop = 0;
      (
        panel.current?.querySelector<HTMLElement>(
          '.practice-label [role="combobox"]:not([aria-disabled="true"]), .practice-label button:not(:disabled)',
        ) ?? tab.current
      )?.focus();
    }
  }, [collapsed]);
  useEffect(() => {
    if (!drawer) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [drawer]);
  useEffect(() => {
    const selectedIndex = locations.findIndex(
      (site) => site.id === selectedLocationId,
    );
    setHighlightedLocation(selectedIndex >= 0 ? selectedIndex : 0);
  }, [locations, selectedLocationId]);
  useEffect(() => {
    if (locationMenuOpen) locationMenu.current?.focus();
  }, [locationMenuOpen]);
  useEffect(() => {
    if (!locationMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (
        !locationMenu.current?.parentElement?.contains(event.target as Node)
      ) {
        setLocationMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [locationMenuOpen]);
  return (
    <div className="clinic-shell" data-collapsed={collapsed} data-rail={rail}>
      {drawer && (
        <button
          type="button"
          className="clinic-nav-backdrop"
          tabIndex={-1}
          aria-hidden="true"
          onClick={close}
        />
      )}
      <div
        className="clinic-sidebar-frame"
        role={drawer ? "dialog" : undefined}
        aria-modal={drawer || undefined}
        aria-label={drawer ? "Clinic menu" : undefined}
        onClick={(event) => {
          if (
            drawer &&
            (event.target as Element).closest(
              "nav a, nav button, .clinic-sidebar-bottom a",
            )
          )
            close();
        }}
        onKeyDown={(event) => {
          if (drawer && !event.defaultPrevented && event.key === "Escape") {
            event.preventDefault();
            close();
          }
          if (event.key !== "Tab" || !drawer) return;
          const controls = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
            ),
          ).filter((control) => control.getClientRects().length > 0);
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <aside id="clinic-sidebar" className="clinic-sidebar" ref={panel}>
          <div className="clinic-sidebar-header">
            <a
              className="wordmark"
              href="/clinic"
              hidden={compact && collapsed}
            >
              Meta Clinic
              <span className="brand-dot" />
            </a>
            <Tooltip describeChild title={toggleLabel} placement="right">
              <IconButton
                ref={tab}
                className="clinic-menu-toggle"
                aria-controls="clinic-sidebar-content"
                aria-expanded={!collapsed}
                aria-label={toggleLabel}
                data-demo-tour-control="true"
                onClick={() => {
                  if (!compact) desktopCollapsed.current = !collapsed;
                  setCollapsed(!collapsed);
                }}
                size="small"
              >
                {compact ? (
                  collapsed ? (
                    <MenuIcon fontSize="small" aria-hidden="true" />
                  ) : (
                    <CloseIcon fontSize="small" aria-hidden="true" />
                  )
                ) : collapsed ? (
                  <ChevronRightIcon fontSize="small" aria-hidden="true" />
                ) : (
                  <ChevronLeftIcon fontSize="small" aria-hidden="true" />
                )}
                <span className="clinic-menu-toggle-label">Menu</span>
              </IconButton>
            </Tooltip>
          </div>
          <div
            id="clinic-sidebar-content"
            className="clinic-sidebar-content"
            hidden={compact && collapsed}
          >
            {rail && (
              <Tooltip
                describeChild
                title={`${practiceName} · ${visibleLocationName || "No location selected"} · ${timezone}`}
                placement="right"
              >
                <IconButton
                  className="clinic-rail-scope"
                  aria-label={`Expand clinic context: ${practiceName}, ${visibleLocationName || "No location selected"}`}
                  aria-controls="clinic-scope"
                  aria-expanded={false}
                  onClick={() => {
                    desktopCollapsed.current = false;
                    focusScope.current = true;
                    setCollapsed(false);
                  }}
                >
                  <BusinessIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <div id="clinic-scope" className="practice-label" hidden={rail}>
              {scopeSelector}
              {!scopeSelector && <strong>{practiceName}</strong>}
              <small aria-label={`Clinic timezone: ${timezone}`}>
                {timezone}
              </small>
              {!scopeSelector && (
                <span className="practice-location">
                  <small>Location</small>
                  {locations.length > 1 ? (
                    <span className="practice-location-picker">
                      <button
                        ref={locationTrigger}
                        type="button"
                        className="practice-location-trigger"
                        aria-controls="clinic-location-options"
                        aria-expanded={locationMenuOpen}
                        aria-haspopup="listbox"
                        onClick={() => setLocationMenuOpen((open) => !open)}
                        onKeyDown={(event) => {
                          if (
                            event.key === "ArrowDown" ||
                            event.key === "ArrowUp" ||
                            event.key === "Enter" ||
                            event.key === " "
                          ) {
                            event.preventDefault();
                            setHighlightedLocation(
                              Math.max(
                                0,
                                locations.findIndex(
                                  (site) => site.id === selectedLocationId,
                                ),
                              ),
                            );
                            setLocationMenuOpen(true);
                          }
                        }}
                      >
                        <span className="practice-location-trigger-name">
                          {visibleLocationName || "Select a location"}
                        </span>
                        <ExpandMoreIcon
                          aria-hidden="true"
                          className="practice-location-chevron"
                          fontSize="small"
                        />
                      </button>
                      {locationMenuOpen && (
                        <div
                          id="clinic-location-options"
                          ref={locationMenu}
                          className="practice-location-menu"
                          role="listbox"
                          aria-label="Current clinic location"
                          aria-activedescendant={
                            highlightedLocationId
                              ? `clinic-location-option-${highlightedLocationId}`
                              : undefined
                          }
                          tabIndex={-1}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              event.preventDefault();
                              setLocationMenuOpen(false);
                              locationTrigger.current?.focus();
                            } else if (event.key === "ArrowDown") {
                              event.preventDefault();
                              setHighlightedLocation(
                                (highlightedLocation + 1) % locations.length,
                              );
                            } else if (event.key === "ArrowUp") {
                              event.preventDefault();
                              setHighlightedLocation(
                                (highlightedLocation - 1 + locations.length) %
                                  locations.length,
                              );
                            } else if (event.key === "Home") {
                              event.preventDefault();
                              setHighlightedLocation(0);
                            } else if (event.key === "End") {
                              event.preventDefault();
                              setHighlightedLocation(locations.length - 1);
                            } else if (
                              event.key === "Enter" ||
                              event.key === " "
                            ) {
                              event.preventDefault();
                              const site = locations[highlightedLocation];
                              if (site) selectLocation(site.id);
                            }
                          }}
                        >
                          {locations.map((site, index) => (
                            <button
                              key={site.id}
                              id={`clinic-location-option-${site.id}`}
                              type="button"
                              role="option"
                              aria-selected={site.id === selectedLocationId}
                              className="practice-location-option"
                              data-highlighted={index === highlightedLocation}
                              tabIndex={-1}
                              onMouseEnter={() => setHighlightedLocation(index)}
                              onClick={() => selectLocation(site.id)}
                            >
                              <span>{site.name || site.code}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </span>
                  ) : (
                    <span className="practice-location-value">
                      {locationName || "No location selected"}
                    </span>
                  )}
                </span>
              )}
            </div>
            <ClinicRailContext.Provider value={rail}>
              {navigation}
            </ClinicRailContext.Provider>
            <div className="clinic-sidebar-bottom">
              <Tooltip
                describeChild
                title="Launch & onboarding"
                placement="right"
              >
                <a href="/portal" aria-label="Launch & onboarding">
                  <LaunchIcon aria-hidden="true" fontSize="small" />
                  <span>Launch &amp; onboarding</span>
                </a>
              </Tooltip>
              {!developmentPreview && !isDemoFrame() && (
                <Form
                  className="clinic-sign-out"
                  endpoint="/api/session"
                  method="DELETE"
                  submit="Sign out"
                  onSuccess={() => window.location.replace("/login")}
                />
              )}
            </div>
          </div>
        </aside>
      </div>
      <div className="clinic-main" inert={drawer}>
        {children}
      </div>
    </div>
  );
}
