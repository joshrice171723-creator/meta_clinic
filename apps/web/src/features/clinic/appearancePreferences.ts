import type { CSSProperties } from "react";

export const CLINIC_PALETTES = [
  { id: "owner", label: "Owner blue & white" },
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
  palette: "cobalt",
  mode: "light",
};

export function normalizeAppearance(value: unknown): ClinicAppearance {
  const candidate =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    palette:
      CLINIC_PALETTES.find((p) => p.id === candidate.palette)?.id ?? "cobalt",
    mode: CLINIC_MODES.find((m) => m.id === candidate.mode)?.id ?? "light",
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
export type ClinicSidebarTokens = {
  ground: string;
  on: string;
  muted: string;
  selected: string;
  "selected-on": string;
};
export const CLINIC_SIDEBAR_THEMES: Record<
  ClinicPalette,
  Record<ColorScheme, ClinicSidebarTokens>
> = {
  owner: {
    light: { ground: "#1976d2", on: "#ffffff", muted: "#d7e8f9", selected: "#ffffff", "selected-on": "#1976d2" },
    dark: { ground: "#115293", on: "#ffffff", muted: "#c5dcf2", selected: "#1976d2", "selected-on": "#ffffff" },
  },
  juniper: {
    light: {
      ground: "#163937",
      on: "#f3f6f4",
      muted: "#b6c4c1",
      selected: "#f3f6f4",
      "selected-on": "#163937",
    },
    dark: {
      ground: "#101b18",
      on: "#e5eee8",
      muted: "#aabdb2",
      selected: "#2b4034",
      "selected-on": "#e5eee8",
    },
  },
  cobalt: {
    light: {
      ground: "#193b52",
      on: "#f2f7fb",
      muted: "#b5c9d7",
      selected: "#f2f7fb",
      "selected-on": "#193b52",
    },
    dark: {
      ground: "#101b25",
      on: "#e2edf5",
      muted: "#aebfcd",
      selected: "#2a4051",
      "selected-on": "#e2edf5",
    },
  },
  plum: {
    light: {
      ground: "#29302f",
      on: "#f7f7f3",
      muted: "#c0c7c0",
      selected: "#f7f7f3",
      "selected-on": "#29302f",
    },
    dark: {
      ground: "#191a18",
      on: "#eeeee6",
      muted: "#b9bcb1",
      selected: "#3b4037",
      "selected-on": "#eeeee6",
    },
  },
  saffron: {
    light: {
      ground: "#50300a",
      on: "#fff9e9",
      muted: "#e7cf9a",
      selected: "#fff1c6",
      "selected-on": "#50300a",
    },
    dark: {
      ground: "#171108",
      on: "#fff9e9",
      muted: "#d5bf88",
      selected: "#493514",
      "selected-on": "#fff9e9",
    },
  },
};
export const CLINIC_THEMES: Record<
  ClinicPalette,
  Record<ColorScheme, ThemeTokens>
> = {
  owner: {
    light: { background: "#f8f7f2", surface: "#f8f7f2", text: "rgba(0, 0, 0, 0.87)", muted: "rgba(0, 0, 0, 0.6)", accent: "#1976d2", "on-accent": "#ffffff", soft: "#eeede8", border: "rgba(0, 0, 0, 0.12)", control: "#6b7280" },
    dark: { background: "#121212", surface: "#1e1e1e", text: "#ffffff", muted: "rgba(255, 255, 255, 0.7)", accent: "#90caf9", "on-accent": "#0d47a1", soft: "#173b5c", border: "rgba(255, 255, 255, 0.12)", control: "#b0bec5" },
  },
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
