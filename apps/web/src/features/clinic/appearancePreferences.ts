import type { CSSProperties } from "react";

export const CLINIC_PALETTES = [
  { id: "juniper", label: "Juniper & porcelain" },
  { id: "cobalt", label: "Cobalt & limestone" },
  { id: "plum", label: "Plum & parchment" },
  { id: "saffron", label: "Saffron & ink" },
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
  palette: "juniper",
  mode: "system",
};

export function normalizeAppearance(value: unknown): ClinicAppearance {
  const candidate =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    palette:
      CLINIC_PALETTES.find((p) => p.id === candidate.palette)?.id ?? "juniper",
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
  juniper: {
    light: {
      background: "#f2f7f4",
      surface: "#fbfdfb",
      text: "#182b27",
      muted: "#52635e",
      accent: "#006b5f",
      "on-accent": "#ffffff",
      soft: "#d8eee6",
      border: "#b9cec4",
      control: "#456d61",
    },
    dark: {
      background: "#0d1714",
      surface: "#16231e",
      text: "#edf7f2",
      muted: "#b6c8c0",
      accent: "#62d4bd",
      "on-accent": "#063d34",
      soft: "#1f493d",
      border: "#49645a",
      control: "#8eb3a5",
    },
  },
  cobalt: {
    light: {
      background: "#f3f6fb",
      surface: "#fbfdff",
      text: "#18233c",
      muted: "#526078",
      accent: "#1d4ed8",
      "on-accent": "#ffffff",
      soft: "#dce8ff",
      border: "#b9c8df",
      control: "#4c648c",
    },
    dark: {
      background: "#0c1422",
      surface: "#17243a",
      text: "#f1f5ff",
      muted: "#c0cae0",
      accent: "#9cc5ff",
      "on-accent": "#122c5f",
      soft: "#1f3d70",
      border: "#4b6282",
      control: "#9aafd1",
    },
  },
  plum: {
    light: {
      background: "#faf5fb",
      surface: "#fffaff",
      text: "#2c1c3b",
      muted: "#665675",
      accent: "#6d28d9",
      "on-accent": "#ffffff",
      soft: "#ede0fb",
      border: "#d1bdd8",
      control: "#705681",
    },
    dark: {
      background: "#19121f",
      surface: "#291b34",
      text: "#fbf5ff",
      muted: "#d2c2d9",
      accent: "#d9b7ff",
      "on-accent": "#3d146e",
      soft: "#4c2c69",
      border: "#624e6e",
      control: "#bda4c8",
    },
  },
  saffron: {
    light: {
      background: "#fff7e8",
      surface: "#fffdf7",
      text: "#302614",
      muted: "#655a42",
      accent: "#704000",
      "on-accent": "#ffffff",
      soft: "#ffebba",
      border: "#dfcda8",
      control: "#79633b",
    },
    dark: {
      background: "#1d160a",
      surface: "#302512",
      text: "#fff9e9",
      muted: "#ddd0ad",
      accent: "#ffd978",
      "on-accent": "#452d00",
      soft: "#5a4010",
      border: "#705d37",
      control: "#d2bc7b",
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
