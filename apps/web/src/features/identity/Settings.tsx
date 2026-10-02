import { useEffect, useRef, useState } from "react";
import Switch from "@mui/material/Switch";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import { useClinic } from "../clinic/Workspace";
import { ReminderSettings } from "../clinic/ReminderSettings";
import type { User, UserSettings } from "../../api/contracts";
import { api } from "../../api/client";
import { Card, ErrorMessage, Field, Form, LoadState } from "../../shared/ui";
import { useAppearance } from "../clinic/Appearance";
import {
  CLINIC_MODES,
  CLINIC_PALETTES,
  CLINIC_STATUS_COLORS,
  CLINIC_THEMES,
  resolveColorScheme,
} from "../clinic/appearancePreferences";

export function AppearanceSettings({
  user,
  settings,
  accept,
  systemDark = false,
}: {
  user: User;
  settings: UserSettings;
  accept: (value: unknown) => void;
  systemDark?: boolean;
}) {
  const [selection, setSelection] = useState(settings.appearance);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [saveError, setSaveError] = useState("");
  const inFlight = useRef(false);
  const lastServerVersion = useRef(settings.appearance.version);
  const acceptedVersion = useRef<number | undefined>(undefined);

  useEffect(() => {
    const version = settings.appearance.version;
    if (version === lastServerVersion.current) return;
    lastServerVersion.current = version;
    if (inFlight.current || acceptedVersion.current === version) return;
    setSelection(settings.appearance);
    setSaveState((current) => (current === "error" ? "idle" : current));
    setSaveError("");
  }, [settings.appearance]);

  async function saveAppearance(next: typeof selection) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaveState("saving");
    setSaveError("");
    try {
      const result = await api<Record<string, unknown> | undefined>(
        "/api/settings",
        {
          method: "PATCH",
          body: {
            appearance: {
              palette: next.palette,
              mode: next.mode,
              version: settings.appearance.version,
            },
            expected_user_id: user.id,
          },
        },
      );
      const responseAppearance = (
        result as { appearance?: { version?: unknown } }
      )?.appearance;
      if (typeof responseAppearance?.version === "number") {
        acceptedVersion.current = responseAppearance.version;
        lastServerVersion.current = responseAppearance.version;
      }
      accept(result);
      setSaveState("saved");
    } catch (error) {
      setSaveState("error");
      setSaveError(
        error instanceof Error
          ? error.message
          : "The request failed. Choose a setting again to retry.",
      );
    } finally {
      inFlight.current = false;
    }
  }

  function changeAppearance(partial: Partial<typeof selection>) {
    const next = { ...selection, ...partial };
    setSelection(next);
    void saveAppearance(next);
  }

  return (
    <div className="clinic-settings">
      <h1>My preferences</h1>
      <p className="clinic-lead">
        Appearance preferences for your signed-in account.
      </p>
      <Card title="Signed-in account">
        <p className="settings-account">{user.email_address}</p>
        <p>Appearance changes apply to your signed-in account.</p>
      </Card>
      <Card title="Appearance">
        <p>
          Choose a color palette and display brightness. Follow system matches
          this device’s light or dark setting.
        </p>
        <form
          className="settings-form appearance-form"
          onSubmit={(event) => event.preventDefault()}
        >
          <input
            type="hidden"
            name="appearance[version]"
            value={settings.appearance.version}
            readOnly
          />
          <fieldset
            className="appearance-picker"
            disabled={saveState === "saving"}
          >
            <legend className="appearance-picker-header">
              <span className="appearance-picker-title">
                Select a color theme
              </span>
              <label className="appearance-mode-toggle">
                <span>Dark mode</span>
                <Switch
                  checked={
                    resolveColorScheme(selection.mode, systemDark) === "dark"
                  }
                  onChange={() =>
                    changeAppearance({
                      mode:
                        resolveColorScheme(selection.mode, systemDark) ===
                        "dark"
                          ? "light"
                          : "dark",
                    })
                  }
                  slotProps={{ input: { "aria-label": "Dark mode" } }}
                />
              </label>
            </legend>
            <div className="appearance-preview-grid">
              {CLINIC_PALETTES.map(({ id, label }) => {
                const scheme = resolveColorScheme(selection.mode, systemDark);
                const theme = CLINIC_THEMES[id][scheme];
                const status = CLINIC_STATUS_COLORS[scheme];
                const selected = selection.palette === id;
                return (
                  <label
                    className="appearance-preview-tile"
                    key={id}
                    data-selected={selected ? "true" : "false"}
                    style={{
                      backgroundColor: theme.background,
                      borderColor: selected ? theme.accent : theme.border,
                      color: theme.text,
                    }}
                  >
                    <input
                      type="radio"
                      name="appearance[palette]"
                      value={id}
                      checked={selected}
                      onChange={() =>
                        changeAppearance({
                          palette: id,
                          ...(id === "astra" ? { mode: "dark" as const } : {}),
                        })
                      }
                    />
                    <div className="appearance-preview-heading">
                      <strong>{label}</strong>
                      {selected && <span>Selected</span>}
                    </div>
                    <div className="appearance-preview-samples">
                      <span style={{ backgroundColor: theme.surface }}>
                        Surface
                      </span>
                      <span
                        style={{
                          backgroundColor: theme.soft,
                          color: theme.text,
                        }}
                      >
                        Text
                      </span>
                      <span
                        style={{
                          backgroundColor: theme.accent,
                          color: theme["on-accent"],
                        }}
                      >
                        Action
                      </span>
                      <span
                        style={{
                          backgroundColor: status["success-bg"],
                          color: status.success,
                        }}
                      >
                        Status
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </form>
        <div className="appearance-save-status" aria-live="polite">
          {saveState === "saving" && <p role="status">Saving appearance…</p>}
          {saveState === "saved" && <p role="status">Appearance saved.</p>}
          {saveState === "error" && (
            <>
              <ErrorMessage message={saveError} />
              <button
                className="primary-link appearance-retry"
                type="button"
                onClick={() => void saveAppearance(selection)}
                disabled={inFlight.current}
              >
                Retry saving appearance
              </button>
              <p className="form-note">
                Your saved appearance is unchanged until the retry succeeds.
              </p>
            </>
          )}
        </div>
        <p className="form-note">
          If saving fails or another device changes your settings,{" "}
          <a href="/clinic/settings">reload the page</a> before trying again.
          Reloading discards unsaved selections.
        </p>
      </Card>
      {settings.development_access && (
        <div className="development-settings">
          <Card title="Workspace view">
            <p>
              Choose a workspace view. Omni access and permissions stay the
              same.
            </p>
            <Form
              endpoint="/api/development_access"
              method="PATCH"
              submit="Swap view"
              className="settings-form"
              values={{ expected_user_id: user.id }}
              onSuccess={() => window.location.assign("/clinic/settings")}
            >
              <Field
                name="profile"
                label="Privilege view"
                value={settings.development_access.profile}
                options={settings.development_access.options.map((option) => [
                  option.id,
                  option.label,
                ])}
              />
            </Form>
            <p className="form-note">
              {
                settings.development_access.options.find(
                  (option) =>
                    option.id === settings.development_access?.profile,
                )?.description
              }{" "}
              The selected view is shared by OmniLogin sessions using this local
              database. Reloaded requests continue through the local Omni
              development override and normal authorization for every other
              account.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}

export function Settings({ user }: { user: User }) {
  const appearance = useAppearance();
  const clinic = useClinic();
  if (!appearance.settings)
    return (
      <div className="clinic-settings">
        <h1>My preferences</h1>
        <LoadState error={appearance.error} />
        {appearance.error && (
          <a className="text-link" href="/clinic/settings">
            Reload settings
          </a>
        )}
      </div>
    );
  return (
    <>
      <AppearanceSettings
        user={user}
        settings={appearance.settings}
        accept={appearance.accept}
        systemDark={appearance.systemDark}
      />
      {(clinic.capabilities.telehealth_configure ||
        clinic.capabilities.roles) && (
        <Box
          component="section"
          className="clinic-settings"
          aria-labelledby="clinic-settings-heading"
          sx={{ mt: 4 }}
        >
          <h2 id="clinic-settings-heading">Clinic settings</h2>
          <p className="clinic-lead">Settings for {clinic.practice.name}.</p>
          {clinic.capabilities.telehealth_configure && (
            <Button
              href="/clinic/settings/telehealth"
              variant="outlined"
              sx={{ mb: 2 }}
            >
              Telehealth settings
            </Button>
          )}
          {clinic.capabilities.roles && <ReminderSettings />}
        </Box>
      )}
    </>
  );
}
