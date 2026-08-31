import { useEffect, useId, useState, type ReactNode } from "react";
import "./appearance.css";
import {
  CLINIC_MODES,
  CLINIC_PALETTES,
  clinicThemeStyle,
  normalizeAppearance,
  observeClinicAppearance,
  observeSystemAppearance,
  readClinicAppearance,
  readSystemDark,
  resolveColorScheme,
  saveClinicAppearance,
  type ClinicAppearance,
} from "./appearancePreferences";

export function useClinicAppearance() {
  const [preferences, setPreferences] = useState(readClinicAppearance);
  const [systemDark, setSystemDark] = useState(readSystemDark);
  const [message, setMessage] = useState("");
  useEffect(() => observeSystemAppearance(setSystemDark), []);
  useEffect(() => observeClinicAppearance(setPreferences), []);
  function change(value: ClinicAppearance) {
    const next = normalizeAppearance(value);
    setPreferences(next);
    setMessage(
      saveClinicAppearance(next)
        ? "Appearance saved in this browser."
        : "Appearance changed for this page. This browser could not remember it.",
    );
  }
  return { preferences, systemDark, message, change };
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

export function AppearancePicker({
  preferences,
  message,
  change,
}: Pick<
  ReturnType<typeof useClinicAppearance>,
  "preferences" | "message" | "change"
>) {
  const id = useId();
  const palette = CLINIC_PALETTES.find((p) => p.id === preferences.palette)!;
  return (
    <div className="clinic-appearance">
      <details>
        <summary>
          <span>
            Appearance <span aria-hidden="true">▾</span>
          </span>
          <span className="clinic-appearance-current">{palette.label}</span>
        </summary>
        <div className="clinic-appearance-panel">
          <div className="clinic-appearance-fields">
            <div>
              <label htmlFor={id + "-palette"}>Color theme</label>
              <select
                id={id + "-palette"}
                value={preferences.palette}
                onChange={(event) =>
                  change(
                    normalizeAppearance({
                      ...preferences,
                      palette: event.target.value,
                    }),
                  )
                }
              >
                {CLINIC_PALETTES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={id + "-mode"}>Brightness</label>
              <select
                id={id + "-mode"}
                value={preferences.mode}
                onChange={(event) =>
                  change(
                    normalizeAppearance({
                      ...preferences,
                      mode: event.target.value,
                    }),
                  )
                }
              >
                {CLINIC_MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p>
            Appearance is a browser preference, not synced to your account.
            People sharing this browser share its theme.
          </p>
          <p role="status">{message}</p>
        </div>
      </details>
    </div>
  );
}
