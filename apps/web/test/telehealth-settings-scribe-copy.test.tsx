import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = state.cursor++;
      return actual.useState(
        index < state.values.length ? state.values[index] : initial,
      );
    },
  };
});
vi.mock("../src/features/clinic/Workspace", () => ({
  useClinic: () => ({
    capabilities: { telehealth_configure: true },
    practice: { id: 1, name: "Synthetic clinic" },
  }),
}));
vi.mock("../src/features/clinic/clinicNavigation", () => ({
  useClinicNavigation: () => ({ registerBlocker: () => () => undefined }),
}));
import { TelehealthSettings } from "../src/features/telehealth/TelehealthSettings";

describe("Muse234 Scribe consent helper rendering", () => {
  it.each([false, true])(
    "renders the full helper once with Scribe enabled=%s",
    (enabled) => {
      const draft = {
        consent_title: "Synthetic consent",
        consent_body: "Synthetic wording",
        patient_instructions: "Synthetic instructions",
        support_label: "Clinic support",
        locale: "en-US",
        join_early_minutes: 15,
        join_late_minutes: 30,
        max_room_minutes: 120,
        grant_ttl_seconds: 120,
        checkin_max_age_minutes: 240,
        allow_audio_only: false,
        allow_staff_screen_share: false,
        require_location: true,
        require_callback: true,
        scribe_enabled: enabled,
        scribe_consent_title: "Synthetic recording consent",
        scribe_consent_body: "Synthetic recording wording",
      };
      state.cursor = 0;
      state.values = [
        {
          version: 0,
          allowed_actions: ["telehealth.configure"],
          data: {
            enabled: false,
            provider_account_ref: null,
            health_status: "not_configured",
            draft,
            visit_type_rules: [],
            options: { visit_types: [], sites: [] },
          },
        },
        { enabled: false, provider_account_ref: "", draft, rules: [] },
      ];
      // Only inject the loaded settings state; render the real React/MUI tree.
      const html = renderToStaticMarkup(<TelehealthSettings />);
      const copy =
        "Recording requires its own patient consent. A patient can continue the video visit without recording. Notes remain drafts until the clinician reviews them.";
      expect(html.split(copy)).toHaveLength(2);
      expect(html.split("Scribe during video calls")).toHaveLength(2);
      expect(html).toContain('id="telehealth-scribe"');
    },
  );
});
