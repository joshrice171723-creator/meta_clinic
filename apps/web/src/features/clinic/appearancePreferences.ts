import type { CSSProperties } from "react";

export const CLINIC_PALETTES = [
  { id: "sage", label: "Sage & ivory" },
  { id: "blue", label: "Mineral blue" },
  { id: "graphite", label: "Warm graphite" },
] as const;
export const CLINIC_MODES = [
  { id: "system", label: "Follow system" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
] as const;
export type ClinicPalette = (typeof CLINIC_PALETTES)[number]["id"];
export type ClinicMode = (typeof CLINIC_MODES)[number]["id"];
export type ClinicAppearance = { palette: ClinicPalette; mode: ClinicMode };
export type ColorScheme = "light" | "dark";
export const DEFAULT_APPEARANCE: ClinicAppearance = {
  palette: "sage",
  mode: "system",
};

export function normalizeAppearance(value: unknown): ClinicAppearance {
  const candidate =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    palette:
      CLINIC_PALETTES.find((p) => p.id === candidate.palette)?.id ?? "sage",
    mode: CLINIC_MODES.find((m) => m.id === candidate.mode)?.id ?? "system",
  };
}

export function resolveColorScheme(
  mode: ClinicMode,
  systemDark: boolean,
): ColorScheme {
  return mode === "system" ? (systemDark ? "dark" : "light") : mode;
}
export function readSystemDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}
export function observeSystemAppearance(onChange: (dark: boolean) => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const update = () => onChange(media.matches);
  media.addEventListener("change", update);
  update();
  return () => media.removeEventListener("change", update);
}
type ThemeTokens = {
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  "on-accent": string;
  soft: string;
  border: string;
  control: string;
};
export const CLINIC_THEMES: Record<
  ClinicPalette,
  Record<ColorScheme, ThemeTokens>
> = {
  sage: {
    light: {
      background: "#f5f7f4",
      surface: "#ffffff",
      text: "#20352f",
      muted: "#52655e",
      accent: "#1f5c4d",
      "on-accent": "#ffffff",
      soft: "#e6efe8",
      border: "#ccd8d1",
      control: "#71847a",
    },
    dark: {
      background: "#151d19",
      surface: "#1e2823",
      text: "#e5eee8",
      muted: "#b3c4b9",
      accent: "#a7d4ba",
      "on-accent": "#14261c",
      soft: "#2b4034",
      border: "#495d51",
      control: "#8aab99",
    },
  },
  blue: {
    light: {
      background: "#f4f7fa",
      surface: "#ffffff",
      text: "#213747",
      muted: "#536574",
      accent: "#245a81",
      "on-accent": "#ffffff",
      soft: "#e7eff6",
      border: "#cbd6df",
      control: "#71818e",
    },
    dark: {
      background: "#151d25",
      surface: "#1d2934",
      text: "#e2edf5",
      muted: "#b4c6d4",
      accent: "#a9cfea",
      "on-accent": "#162936",
      soft: "#2a4051",
      border: "#4b6071",
      control: "#8da8bd",
    },
  },
  graphite: {
    light: {
      background: "#f7f5f1",
      surface: "#ffffff",
      text: "#2a3533",
      muted: "#616a64",
      accent: "#3e4b49",
      "on-accent": "#ffffff",
      soft: "#ecefe7",
      border: "#d7d8d0",
      control: "#7c8178",
    },
    dark: {
      background: "#201f1c",
      surface: "#292823",
      text: "#eeeee6",
      muted: "#c5c5b8",
      accent: "#c5d0c2",
      "on-accent": "#242c25",
      soft: "#3b4037",
      border: "#606054",
      control: "#a3a798",
    },
  },
};
export const CLINIC_STATUS_COLORS = {
  light: {
    warning: "#8a4b12",
    "warning-bg": "#fff2d9",
    error: "#9e313d",
    "error-bg": "#fcebed",
    success: "#275d35",
    "success-bg": "#e8f2e9",
  },
  dark: {
    warning: "#ffd298",
    "warning-bg": "#48331b",
    error: "#ffc1c9",
    "error-bg": "#492930",
    success: "#b5e2bc",
    "success-bg": "#233d2b",
  },
};
export function clinicThemeStyle(
  palette: ClinicPalette,
  scheme: ColorScheme,
): CSSProperties {
  return {
    colorScheme: scheme,
    ...Object.fromEntries(
      Object.entries({
        ...CLINIC_THEMES[palette][scheme],
        ...CLINIC_STATUS_COLORS[scheme],
      }).map(([name, value]) => ["--clinic-" + name, value]),
    ),
  };
}
