import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import postcss from "postcss";
import {
  ownedSettings,
  ClinicAppearanceScope,
} from "../src/features/clinic/Appearance";
import { AppearanceSettings } from "../src/features/identity/Settings";
import { loginDestination } from "../src/api/client";
import { ClinicNavigation, Workspace } from "../src/features/clinic/Workspace";
import {
  CLINIC_MODES,
  CLINIC_PALETTES,
  CLINIC_THEMES,
  CLINIC_STATUS_COLORS,
  DEFAULT_APPEARANCE,
  clinicThemeStyle,
  normalizeAppearance,
  observeSystemAppearance,
  readSystemDark,
  resolveColorScheme,
} from "../src/features/clinic/appearancePreferences";

afterEach(() => vi.unstubAllGlobals());

const user = {
  id: 7,
  email_address: "synthetic@example.invalid",
  admin: false,
};
describe("account-owned appearance", () => {
  it.each(CLINIC_PALETTES)(
    "accepts every brightness for $label from the current account",
    ({ id }) => {
      for (const { id: mode } of CLINIC_MODES)
        expect(
          ownedSettings(
            { user_id: 7, appearance: { palette: id, mode, version: 1 } },
            7,
          ).appearance,
        ).toEqual({ palette: id, mode, version: 1 });
    },
  );
  it("rejects wrong account, malformed settings and invalid versions", () => {
    for (const value of [
      null,
      {},
      { user_id: 8, appearance: { ...DEFAULT_APPEARANCE, version: 0 } },
      ...[-1, 1.5, "1", undefined].map((version) => ({
        user_id: 7,
        appearance: { ...DEFAULT_APPEARANCE, version },
      })),
      {
        user_id: 7,
        appearance: { palette: "unknown", mode: "dark", version: 0 },
      },
    ])
      expect(() => ownedSettings(value, 7)).toThrow();
    expect(normalizeAppearance({ palette: "bad", mode: "bad" })).toEqual(
      DEFAULT_APPEARANCE,
    );
    expect(readSystemDark()).toBe(false);
  });
  it("drops extra response fields and retains an exact login return allowlist", () => {
    expect(
      ownedSettings(
        {
          user_id: 7,
          extra: "ignored",
          appearance: { ...DEFAULT_APPEARANCE, version: 2, extra: "ignored" },
        },
        7,
      ),
    ).toEqual({
      user_id: 7,
      appearance: { ...DEFAULT_APPEARANCE, version: 2 },
    });
    expect(loginDestination("/clinic/settings")).toBe("/clinic/settings");
    expect(loginDestination("//example.invalid")).toBe("/portal");
    expect(loginDestination("/clinic/settings?other=1")).toBe("/portal");
  });
  it("retains only a verified Omni development-view projection", () => {
    const development_access = {
      profile: "clinician",
      options: [
        {
          id: "clinician",
          label: "Clinician",
          description: "Synthetic clinician view.",
        },
      ],
    };
    expect(
      ownedSettings(
        {
          user_id: 7,
          appearance: { ...DEFAULT_APPEARANCE, version: 0 },
          development_access,
        },
        7,
      ).development_access,
    ).toEqual(development_access);
    expect(() =>
      ownedSettings(
        {
          user_id: 7,
          appearance: { ...DEFAULT_APPEARANCE, version: 0 },
          development_access: { profile: "admin", options: [] },
        },
        7,
      ),
    ).toThrow(/development view/);
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
  it("renders labeled controls, account identity, explicit save and conflict recovery", () => {
    const html = renderToStaticMarkup(
      <AppearanceSettings
        user={user}
        settings={{
          user_id: 7,
          appearance: { palette: "blue", mode: "dark", version: 2 },
        }}
        accept={() => {}}
      />,
    );
    expect(html.match(/<select /g)).toHaveLength(2);
    expect(html.match(/<option /g)).toHaveLength(6);
    expect(html).toContain("Color theme");
    expect(html).toContain("Brightness");
    expect(html).toContain('value="blue" selected=""');
    expect(html).toContain('value="dark" selected=""');
    expect(html).toContain("synthetic@example.invalid");
    expect(html).toContain("Save appearance");
    expect(html).toContain('name="appearance[version]"');
    expect(html).toContain("reload saved settings");
    expect(html).not.toContain("<details");
  });
  it("renders the Omni development-view swap only when the server supplies it", () => {
    const html = renderToStaticMarkup(
      <AppearanceSettings
        user={user}
        settings={{
          user_id: 7,
          appearance: { palette: "sage", mode: "system", version: 0 },
          development_access: {
            profile: "clinician",
            options: [
              {
                id: "administrator",
                label: "Administrator",
                description: "Full synthetic view.",
              },
              {
                id: "clinician",
                label: "Clinician",
                description: "Synthetic clinician view.",
              },
            ],
          },
        }}
        accept={() => {}}
      />,
    );
    expect(html).toContain("Development view");
    expect(html).toContain("Swap view");
    expect(html).toContain('name="profile"');
    expect(html).toContain('value="clinician" selected=""');
    expect(html).toContain("server-enforced permissions");
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
        <Workspace user={user}>
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
      patients: true,
      staff: false,
      inventory: true,
      appointments: false,
      encounters: false,
      documents: false,
      messages: false,
      billing: false,
      roles: false,
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
          patients: false,
          staff: false,
          inventory: false,
          appointments: false,
          encounters: false,
          documents: false,
          messages: false,
          billing: false,
          roles: false,
        }}
        path="/clinic"
      />,
    );
    expect(restricted.match(/<a /g)).toHaveLength(3);
    expect(restricted).toContain("/clinic/operations");
    expect(restricted).toContain("/clinic/settings");
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
  // Source-level breakpoint regression checks, not a browser layout engine.
  it.each([
    [1440, 4],
    [1280, 4],
    [1151, 4],
    [1150, 2],
    [1024, 2],
    [959, 2],
    [834, 2],
    [768, 2],
    [761, 2],
    [760, 2],
    [601, 2],
    [600, 1],
    [390, 1],
    [320, 1],
  ])(
    "uses %ipx responsive summary rules without side-by-side label/value squeeze",
    (width, columns) => {
      const root = postcss.parse(
        readFileSync("src/features/clinic/appearance.css", "utf8"),
      );
      const declarations = (selector: string) => {
        const result: Record<string, string> = {};
        root.walkRules((rule) => {
          if (!rule.selectors.includes(selector)) return;
          let parent = rule.parent;
          while (parent && parent.type !== "root") {
            if (parent.type === "atrule") {
              const media = /max-width:\s*(\d+)px/.exec(parent.params);
              if (!media || width > Number(media[1])) return;
            }
            parent = parent.parent;
          }
          rule.walkDecls((declaration) => {
            result[declaration.prop] = declaration.value;
          });
        });
        return result;
      };
      expect(
        declarations(".clinic-theme .pharmacy-summary")[
          "grid-template-columns"
        ],
      ).toBe(columns === 1 ? "1fr" : `repeat(${columns}, minmax(0, 1fr))`);
      expect(
        declarations(".clinic-theme .pharmacy-summary-item")["flex-direction"],
      ).toBe("column");
      expect(
        declarations(".clinic-theme .clinic-sign-out fieldset").display,
      ).toBe("block");
      expect(
        declarations(".clinic-theme .clinic-sign-out button")["white-space"],
      ).toBe("nowrap");
      expect(
        declarations(".clinic-theme .settings-form > fieldset")[
          "grid-template-columns"
        ],
      ).toBe(width <= 600 ? "1fr" : "repeat(2, minmax(0, 1fr))");
    },
  );
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
    expect(css).toMatch(/max-width:\s*600px/);
    expect(css).toMatch(/forced-colors:\s*active/);
    expect(css).toMatch(
      /\.clinic-theme \.clinic-sign-out[^{}]*\{[^}]*display:\s*block/,
    );
    expect(css).toContain("white-space: nowrap");
    expect(css).toContain("flex-direction: column");
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
