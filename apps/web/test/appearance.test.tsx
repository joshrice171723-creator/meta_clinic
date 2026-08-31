import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AppearancePicker,
  ClinicAppearanceScope,
} from "../src/features/clinic/Appearance";
import { ClinicNavigation, Workspace } from "../src/features/clinic/Workspace";
import {
  APPEARANCE_KEY,
  CLINIC_MODES,
  CLINIC_PALETTES,
  CLINIC_THEMES,
  CLINIC_STATUS_COLORS,
  DEFAULT_APPEARANCE,
  clinicThemeStyle,
  normalizeAppearance,
  observeClinicAppearance,
  observeSystemAppearance,
  readClinicAppearance,
  readSystemDark,
  resolveColorScheme,
  saveClinicAppearance,
} from "../src/features/clinic/appearancePreferences";

afterEach(() => vi.unstubAllGlobals());

function browserStorage() {
  const values = new Map<string, string>();
  const getItem = vi.fn((key: string) => values.get(key) ?? null);
  const setItem = vi.fn((key: string, value: string) => values.set(key, value));
  vi.stubGlobal("window", { localStorage: { getItem, setItem } });
  return { values, getItem, setItem };
}

describe("cosmetic-only appearance persistence", () => {
  it("defaults safely without a browser or a saved preference", () => {
    expect(readClinicAppearance()).toEqual(DEFAULT_APPEARANCE);
    expect(readSystemDark()).toBe(false);
    expect(saveClinicAppearance(DEFAULT_APPEARANCE)).toBe(false);
    browserStorage();
    expect(readClinicAppearance()).toEqual(DEFAULT_APPEARANCE);
  });
  it.each(CLINIC_PALETTES)(
    "round-trips every brightness for $label",
    ({ id }) => {
      const storage = browserStorage();
      for (const mode of CLINIC_MODES) {
        const preference = { palette: id, mode: mode.id };
        expect(saveClinicAppearance(preference)).toBe(true);
        expect(readClinicAppearance()).toEqual(preference);
        expect(storage.setItem).toHaveBeenLastCalledWith(
          APPEARANCE_KEY,
          JSON.stringify(preference),
        );
      }
      expect([...storage.values.keys()]).toEqual([APPEARANCE_KEY]);
    },
  );
  it("rejects malformed, oversized or unsupported values without copying extra data", () => {
    const { values } = browserStorage();
    for (const raw of [
      "not json",
      "null",
      "[]",
      '"blue"',
      "x".repeat(129),
      '{"palette":"url(example.invalid)","mode":"invalid"}',
    ]) {
      values.set(APPEARANCE_KEY, raw);
      expect(readClinicAppearance()).toEqual(DEFAULT_APPEARANCE);
    }
    const extra = {
      palette: "blue",
      mode: "dark",
      unrelated: "synthetic ignored field",
    };
    const safe = normalizeAppearance(extra);
    expect(safe).toEqual({ palette: "blue", mode: "dark" });
    expect(saveClinicAppearance(safe)).toBe(true);
    expect(values.get(APPEARANCE_KEY)).toBe('{"palette":"blue","mode":"dark"}');
    expect(
      normalizeAppearance({ palette: "graphite", mode: "unsupported" }),
    ).toEqual({ palette: "graphite", mode: "system" });
  });
  it("continues when browser policy blocks storage access or writes", () => {
    vi.stubGlobal("window", {
      get localStorage() {
        throw new Error("Blocked");
      },
    });
    expect(readClinicAppearance()).toEqual(DEFAULT_APPEARANCE);
    expect(saveClinicAppearance(DEFAULT_APPEARANCE)).toBe(false);
    vi.stubGlobal("window", {
      localStorage: {
        getItem() {
          throw new Error("Unavailable");
        },
        setItem() {
          throw new Error("Quota");
        },
      },
    });
    expect(readClinicAppearance()).toEqual(DEFAULT_APPEARANCE);
    expect(saveClinicAppearance(DEFAULT_APPEARANCE)).toBe(false);
  });
  it("only responds to its own storage key or an explicit browser-storage clear", () => {
    const { values } = browserStorage();
    const addEventListener = vi.fn(),
      removeEventListener = vi.fn();
    Object.assign(window, { addEventListener, removeEventListener });
    const update = vi.fn();
    const unsubscribe = observeClinicAppearance(update);
    const listener = addEventListener.mock.calls[0][1];
    listener({ key: "unrelated" });
    expect(update).not.toHaveBeenCalled();
    values.set(APPEARANCE_KEY, '{"palette":"graphite","mode":"light"}');
    listener({ key: APPEARANCE_KEY });
    expect(update).toHaveBeenLastCalledWith({
      palette: "graphite",
      mode: "light",
    });
    values.clear();
    listener({ key: null });
    expect(update).toHaveBeenLastCalledWith(DEFAULT_APPEARANCE);
    unsubscribe();
    expect(removeEventListener).toHaveBeenCalledWith("storage", listener);
  });
});

describe("system appearance and UI scope", () => {
  it("follows OS changes and cleans up its listener, without overriding explicit choices", () => {
    const media = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal("window", { matchMedia: vi.fn(() => media) });
    const update = vi.fn();
    const unsubscribe = observeSystemAppearance(update);
    expect(update).toHaveBeenLastCalledWith(false);
    media.matches = true;
    media.addEventListener.mock.calls[0][1]();
    expect(readSystemDark()).toBe(true);
    expect(update).toHaveBeenLastCalledWith(true);
    expect(resolveColorScheme("system", true)).toBe("dark");
    expect(resolveColorScheme("system", false)).toBe("light");
    expect(resolveColorScheme("light", true)).toBe("light");
    expect(resolveColorScheme("dark", false)).toBe("dark");
    unsubscribe();
    expect(media.removeEventListener).toHaveBeenCalledWith(
      "change",
      media.addEventListener.mock.calls[0][1],
    );
  });
  it("renders all choices as labeled native controls, outside mutation forms", () => {
    const html = renderToStaticMarkup(
      <AppearancePicker
        preferences={{ palette: "blue", mode: "dark" }}
        change={() => {}}
        message="Appearance saved in this browser."
      />,
    );
    expect(html).toContain("<summary>");
    expect(html.match(/<select /g)).toHaveLength(2);
    expect(html.match(/<option /g)).toHaveLength(6);
    expect(html).toMatch(/<label for="[^"]+">Color theme<\/label>/);
    expect(html).toMatch(/<label for="[^"]+">Brightness<\/label>/);
    expect(html).toContain('value="blue" selected=""');
    expect(html).toContain('value="dark" selected=""');
    expect(html).toContain('role="status"');
    expect(html).toContain("People sharing this browser share its theme");
    expect(html).not.toContain("<form");
  });
  it.each(CLINIC_PALETTES)(
    "scopes $label styles to the clinic and renders loading without protected content",
    ({ id }) => {
      const html = renderToStaticMarkup(
        <ClinicAppearanceScope
          preferences={{ palette: id, mode: "dark" }}
          systemDark={false}
        >
          <p>Example</p>
        </ClinicAppearanceScope>,
      );
      expect(html).toContain('class="clinic-theme"');
      expect(html).toContain('data-clinic-palette="' + id + '"');
      expect(html).toContain('data-color-scheme="dark"');
      expect(html).toContain("color-scheme:dark");
      expect(html).toContain(
        "--clinic-background:" + CLINIC_THEMES[id].dark.background,
      );
      const loading = renderToStaticMarkup(
        <Workspace>
          <p>Must stay hidden before authorization</p>
        </Workspace>,
      );
      expect(loading).toContain("Loading");
      expect(loading).toContain('class="clinic-theme"');
      expect(loading).not.toContain("Must stay hidden");
    },
  );
  it("marks the active module including details without exposing restricted navigation", () => {
    const capabilities = {
      patients_access: true,
      inventory_access: true,
      staff_access: false,
    };
    for (const path of [
      "/clinic/patients",
      "/clinic/patients/7",
      "/clinic/patients/",
    ]) {
      const html = renderToStaticMarkup(
        <ClinicNavigation capabilities={capabilities} path={path} />,
      );
      expect(html).toContain('href="/clinic/patients" aria-current="page"');
      expect(html.match(/aria-current="page"/g)).toHaveLength(1);
      expect(html).not.toContain("/clinic/staff");
    }
    const restricted = renderToStaticMarkup(
      <ClinicNavigation
        capabilities={{
          patients_access: false,
          inventory_access: false,
          staff_access: false,
        }}
        path="/clinic"
      />,
    );
    expect(restricted.match(/<a /g)).toHaveLength(1);
    expect(restricted).toContain('href="/clinic" aria-current="page"');
  });
});

function contrast(a: string, b: string) {
  function luminance(hex: string) {
    const [r, g, b] = hex
      .slice(1)
      .match(/../g)!
      .map((v) => parseInt(v, 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return r * 0.2126 + g * 0.7152 + b * 0.0722;
  }
  const values = [luminance(a), luminance(b)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
describe("theme color and responsive contracts", () => {
  it.each(CLINIC_PALETTES)(
    "keeps $label text and controls readable in both appearances",
    ({ id }) => {
      for (const scheme of ["light", "dark"] as const) {
        const t = CLINIC_THEMES[id][scheme],
          status = CLINIC_STATUS_COLORS[scheme];
        for (const foreground of [t.text, t.muted, t.accent])
          for (const background of [t.background, t.surface, t.soft])
            expect(contrast(foreground, background)).toBeGreaterThanOrEqual(
              4.5,
            );
        expect(contrast(t["on-accent"], t.accent)).toBeGreaterThanOrEqual(4.5);
        for (const surface of [t.background, t.surface, t.soft]) {
          expect(contrast(t.control, surface)).toBeGreaterThanOrEqual(3);
          expect(contrast(t.accent, surface)).toBeGreaterThanOrEqual(3);
          expect(contrast(status.warning, surface)).toBeGreaterThanOrEqual(4.5);
        }
        for (const name of ["warning", "error", "success"] as const)
          expect(
            contrast(status[name], status[`${name}-bg`]),
          ).toBeGreaterThanOrEqual(4.5);
        expect(Object.keys(clinicThemeStyle(id, scheme))).toHaveLength(16);
      }
    },
  );
  it("keeps theme styling scoped, touch-sized, responsive and free of downloaded assets", () => {
    const css = readFileSync("src/features/clinic/appearance.css", "utf8");
    expect(css).not.toMatch(/@import|url\(|#[0-9a-f]{3,8}\b/i);
    expect(css).toMatch(/min-height:\s*44px/);
    expect(css).toMatch(/max-width:\s*760px/);
    expect(css).toMatch(/max-width:\s*440px/);
    expect(css).toMatch(/forced-colors:\s*active/);
    expect(css).not.toMatch(/position:\s*(fixed|absolute)/);
    // Every style-rule selector must be rooted in the clinic or its picker.
    for (const rule of css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .matchAll(/([^{}]+)\{/g)) {
      const selector = rule[1].trim();
      if (!selector.startsWith("@"))
        expect(selector).toMatch(/^\.clinic-(theme|appearance)/);
    }
  });
  it("keeps full-sized form and action text after legacy clinic overrides", () => {
    const css = readFileSync("src/features/clinic/appearance.css", "utf8");
    for (const selector of [
      ".clinic-theme .clinic-content .form-field input",
      ".clinic-theme .clinic-content .form-field textarea",
      ".clinic-theme .clinic-content select",
      ".clinic-theme .clinic-content .primary-link",
    ]) {
      const lastRule = css.slice(css.lastIndexOf(selector)).split("}")[0];
      expect(lastRule).toMatch(/font-size:\s*16px/);
    }
  });
});
