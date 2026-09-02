import { useEffect, useRef, useState, type ReactNode } from "react";
import { Form } from "../../shared/ui";

export const COMPACT_NAV_QUERY = "(max-width: 760px)";
export function compactNavigation() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(COMPACT_NAV_QUERY).matches
  );
}
export function ClinicFrame({
  practiceName,
  navigation,
  children,
}: {
  practiceName: string;
  navigation: ReactNode;
  children: ReactNode;
}) {
  const [compact, setCompact] = useState(compactNavigation);
  const [collapsed, setCollapsed] = useState(compactNavigation);
  const tab = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const drawer = compact && !collapsed;
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
      }
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!drawer) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [drawer]);
  return (
    <div className="clinic-shell" data-collapsed={collapsed}>
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
          if (event.key === "Escape" && !collapsed) {
            event.preventDefault();
            close();
          }
          if (event.key !== "Tab" || !drawer) return;
          const controls = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
            ),
          );
          const first = controls[0],
            last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <button
          type="button"
          ref={tab}
          className="clinic-chart-tab"
          aria-controls="clinic-sidebar"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Open clinic menu" : "Collapse clinic menu"}
          onClick={() => setCollapsed(!collapsed)}
        >
          <span aria-hidden="true">{collapsed ? "›" : "‹"}</span>
          <span>Menu</span>
        </button>
        <aside
          id="clinic-sidebar"
          className="clinic-sidebar"
          ref={panel}
          hidden={collapsed}
        >
          <a className="wordmark" href="/clinic">
            APPly
            <span className="brand-dot" />
          </a>
          <div className="practice-label">
            <strong>{practiceName}</strong>
            <span>Local synthetic prototype</span>
          </div>
          {navigation}
          <div className="clinic-sidebar-bottom">
            <a href="/portal">← Launch &amp; onboarding</a>
            <a href="/">APPly selling site</a>
            <Form
              className="clinic-sign-out"
              endpoint="/api/session"
              method="DELETE"
              submit="Sign out"
              onSuccess={() => window.location.replace("/login")}
            />
          </div>
        </aside>
      </div>
      <div className="clinic-main" inert={drawer}>
        {children}
      </div>
    </div>
  );
}
