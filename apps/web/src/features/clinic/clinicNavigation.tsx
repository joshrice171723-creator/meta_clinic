import { createContext, useContext, type ReactNode } from "react";

export type ClinicHomeView = "tracking" | "schedule";

export type ClinicRoute = {
  path: string;
  search: string;
  homeView: ClinicHomeView;
};

export type ClinicNavigateOptions = {
  homeView?: ClinicHomeView;
  replace?: boolean;
};

type ClinicNavigationValue = {
  confirmNavigation?: () => boolean;
  navigate: (href: string, options?: ClinicNavigateOptions) => boolean;
  registerBlocker: (blocker: (() => string | null) | null) => () => void;
};

const ClinicNavigationContext = createContext<ClinicNavigationValue>({
  navigate: () => false,
  registerBlocker: () => () => {},
});

export function normalizeClinicPath(pathname: string) {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path === "/clinic/schedule" ? "/clinic" : path;
}

function scheduleAliasSearch(search: string) {
  const input = new URLSearchParams(search);
  const output = new URLSearchParams();
  const patientId = input.get("patient_id");
  if (
    patientId &&
    /^[1-9]\d*$/.test(patientId) &&
    Number.isSafeInteger(Number(patientId))
  )
    output.set("patient_id", String(Number(patientId)));
  if (input.get("visit_modality") === "video")
    output.set("visit_modality", "video");
  return output.size ? `?${output}` : "";
}

export function clinicRoute(
  pathname: string,
  search = "",
  historyView?: unknown,
): ClinicRoute {
  const originalPath = pathname.replace(/\/+$/, "") || "/";
  const storedView: ClinicHomeView | undefined =
    historyView === "schedule" || historyView === "tracking"
      ? historyView
      : undefined;
  return {
    path: normalizeClinicPath(originalPath),
    search:
      originalPath === "/clinic/schedule"
        ? scheduleAliasSearch(search)
        : search,
    homeView:
      originalPath === "/clinic/schedule"
        ? "schedule"
        : originalPath === "/clinic"
          ? (storedView ?? "tracking")
          : "tracking",
  };
}

export function clinicRouteHref(route: ClinicRoute) {
  return route.path + route.search;
}

export function clinicTarget(href: string, origin: string) {
  try {
    const target = new URL(href, origin);
    return target.origin === origin && /^\/clinic(?:\/|$)/.test(target.pathname)
      ? target
      : null;
  } catch {
    return null;
  }
}

export function ClinicNavigationProvider({
  value,
  children,
}: {
  value: ClinicNavigationValue;
  children: ReactNode;
}) {
  return (
    <ClinicNavigationContext value={value}>{children}</ClinicNavigationContext>
  );
}

export function useClinicNavigation() {
  return useContext(ClinicNavigationContext);
}
