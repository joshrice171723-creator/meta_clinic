import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api } from "../../api/client";
import type { UserSettings } from "../../api/contracts";
import "./appearance.css";
import "./clinicFrame.css";
import "./trackingBoard.css";
import "./careFlow.css";
import "./careFlow.css";
import {
  CLINIC_MODES,
  CLINIC_PALETTES,
  DEFAULT_APPEARANCE,
  clinicThemeStyle,
  normalizeAppearance,
  observeSystemAppearance,
  readSystemDark,
  resolveColorScheme,
  type ClinicAppearance,
} from "./appearancePreferences";

// Ownership is checked again when accepting a response after an account change.
export function ownedSettings(value: unknown, userId: number): UserSettings {
  const data = value as UserSettings | undefined;
  const appearance = data?.appearance;
  if (
    data?.user_id !== userId ||
    !appearance ||
    !CLINIC_PALETTES.some((p) => p.id === appearance.palette) ||
    !CLINIC_MODES.some((m) => m.id === appearance.mode) ||
    !Number.isSafeInteger(appearance.version) ||
    appearance.version < 0
  )
    throw new Error(
      "Unable to verify these settings. Reload and check your signed-in account.",
    );
  return {
    user_id: userId,
    appearance: {
      ...normalizeAppearance(appearance),
      version: appearance.version,
    },
  };
}

export function useClinicAppearance(userId: number) {
  const [settings, setSettings] = useState<UserSettings>();
  const [error, setError] = useState("");
  const [systemDark, setSystemDark] = useState(readSystemDark);
  useEffect(() => observeSystemAppearance(setSystemDark), []);
  useEffect(() => {
    const abort = new AbortController();
    setSettings(undefined);
    setError("");
    api<UserSettings>("/api/settings", { signal: abort.signal })
      .then((value) => {
        if (!abort.signal.aborted) setSettings(ownedSettings(value, userId));
      })
      .catch((reason) => {
        if (!abort.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load settings.",
          );
      });
    return () => abort.abort();
  }, [userId]);
  const current = settings?.user_id === userId ? settings : undefined;
  return {
    settings: current,
    error,
    systemDark,
    preferences: current?.appearance ?? DEFAULT_APPEARANCE,
    accept: (value: unknown) => setSettings(ownedSettings(value, userId)),
  };
}

export const AppearanceContext = createContext<ReturnType<
  typeof useClinicAppearance
> | null>(null);
export function useAppearance() {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error("Settings require a signed-in clinic workspace.");
  return value;
}

export function ClinicAppearanceScope({
  preferences,
  systemDark,
  children,
}: {
  preferences: ClinicAppearance;
  systemDark: boolean;
  children: ReactNode;
}) {
  const scheme = resolveColorScheme(preferences.mode, systemDark);
  return (
    <div
      className="clinic-theme"
      data-clinic-palette={preferences.palette}
      data-clinic-mode={preferences.mode}
      data-color-scheme={scheme}
      style={clinicThemeStyle(preferences.palette, scheme)}
    >
      {children}
    </div>
  );
}
