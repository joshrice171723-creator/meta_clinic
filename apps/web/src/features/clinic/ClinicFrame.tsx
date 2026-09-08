import { useEffect, useRef, useState, type ReactNode } from "react";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LaunchIcon from "@mui/icons-material/Launch";
import PublicIcon from "@mui/icons-material/Public";
import type { ClinicSite } from "../../api/contracts";
import { Form } from "../../shared/ui";

export const COMPACT_NAV_QUERY = "(max-width: 900px)";
export function compactNavigation() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(COMPACT_NAV_QUERY).matches
  );
}

export function ClinicFrame({
  practiceName,
  locationName,
  locations = [],
  selectedLocationId,
  onLocationChange,
  navigation,
  children,
  developmentPreview = false,
}: {
  practiceName: string;
  locationName?: string | null;
  locations?: Pick<ClinicSite, "id" | "code" | "name">[];
  selectedLocationId?: number | null;
  onLocationChange?: (siteId: number) => void;
  navigation: ReactNode;
  children: ReactNode;
  developmentPreview?: boolean;
}) {
  const locationMenu = useRef<HTMLDivElement>(null);
  const locationTrigger = useRef<HTMLButtonElement>(null);
  const [locationMenuOpen, setLocationMenuOpen] = useState(false);
  const [highlightedLocation, setHighlightedLocation] = useState(0);
  const selectedLocation = locations.find(
    (site) => site.id === selectedLocationId,
  );
  const visibleLocationName =
    locationName || selectedLocation?.name || selectedLocation?.code;
  const locationScopeLabel = visibleLocationName || "All locations";
  const selectLocation = (siteId: number) => {
    setLocationMenuOpen(false);
    onLocationChange?.(siteId);
    locationTrigger.current?.focus();
  };
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
    <div className="clinic-shell">
      <div className="clinic-sidebar-frame">
        <aside id="clinic-sidebar" className="clinic-sidebar">
          <a className="wordmark" href="/clinic">
            APPly
            <span className="brand-dot" />
          </a>
          <div className="practice-label">
            <strong>{practiceName}</strong>
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
                      {locationScopeLabel}
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
                        } else if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          const site = locations[highlightedLocation];
                          if (site) selectLocation(site.id);
                        }
                      }}
                    >
                      {locations.map((site, index) => (
                        <button
                          key={site.id}
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
          </div>
          {navigation}
          <div className="clinic-sidebar-bottom">
            <a href="/portal">
              <LaunchIcon aria-hidden="true" fontSize="small" />
              <span>Launch &amp; onboarding</span>
            </a>
            <a href="/">
              <PublicIcon aria-hidden="true" fontSize="small" />
              <span>APPly selling site</span>
            </a>
            {!developmentPreview && (
              <Form
                className="clinic-sign-out"
                endpoint="/api/session"
                method="DELETE"
                submit="Sign out"
                onSuccess={() => window.location.replace("/login")}
              />
            )}
          </div>
        </aside>
      </div>
      <div className="clinic-main">{children}</div>
    </div>
  );
}
