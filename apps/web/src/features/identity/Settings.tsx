import { useEffect, useRef, useState } from "react";
import type { User, UserSettings } from "../../api/contracts";
import { api } from "../../api/client";
import { Card, ErrorMessage, Field, Form, LoadState } from "../../shared/ui";
import { useAppearance } from "../clinic/Appearance";
import {
  CLINIC_MODES,
  CLINIC_PALETTES,
  CLINIC_STATUS_COLORS,
  CLINIC_THEMES,
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
      <p className="eyebrow">YOUR ACCOUNT</p>
      <h1>Settings</h1>
      <p className="clinic-lead">
        Personal preferences for your clinic workspace.
      </p>
      <Card title="Signed-in account">
        <p className="settings-account">{user.email_address}</p>
        <p>These settings belong to you, not everyone at your clinic.</p>
      </Card>
      <Card title="Appearance">
        <p>
          Choose your colors and brightness. Your selection saves immediately
          after the server accepts it. Follow system uses each device’s light or
          dark setting.
        </p>
        <form
          className="settings-form appearance-form"
          onSubmit={(event) => event.preventDefault()}
          onChange={(event) => {
            const target = event.nativeEvent.target as HTMLSelectElement;
            if (target.name === "appearance[palette]")
              changeAppearance({
                palette: target.value as typeof selection.palette,
              });
            if (target.name === "appearance[mode]")
              changeAppearance({ mode: target.value as typeof selection.mode });
          }}
        >
          <fieldset disabled={saveState === "saving"}>
            <input
              type="hidden"
              name="appearance[version]"
              value={settings.appearance.version}
              readOnly
            />
            <Field
              name="appearance[palette]"
              label="Color theme"
              value={selection.palette}
              options={CLINIC_PALETTES.map((p) => [p.id, p.label])}
            />
            <Field
              name="appearance[mode]"
              label="Brightness"
              value={selection.mode}
              options={CLINIC_MODES.map((m) => [m.id, m.label])}
            />
          </fieldset>
        </form>
        <section
          className="appearance-preview"
          aria-labelledby="appearance-preview-title"
        >
          <h3
            className="appearance-preview-title"
            id="appearance-preview-title"
          >
            Preview the color themes
          </h3>
          <p className="appearance-preview-description">
            Samples show how each palette looks in{" "}
            {selection.mode === "dark"
              ? "dark"
              : selection.mode === "light"
                ? "light"
                : systemDark
                  ? "dark"
                  : "light"}{" "}
            mode. The selected theme is marked in text.
          </p>
          <div
            className="appearance-preview-grid"
            role="list"
            aria-labelledby="appearance-preview-title"
          >
            {CLINIC_PALETTES.map(({ id, label }) => {
              const scheme =
                selection.mode === "dark"
                  ? "dark"
                  : selection.mode === "light"
                    ? "light"
                    : systemDark
                      ? "dark"
                      : "light";
              const theme = CLINIC_THEMES[id][scheme];
              const status = CLINIC_STATUS_COLORS[scheme];
              const selected = selection.palette === id;
              return (
                <article
                  role="listitem"
                  className="appearance-preview-tile"
                  key={id}
                  aria-current={selected ? "true" : undefined}
                  style={{
                    backgroundColor: theme.background,
                    borderColor: selected ? theme.accent : theme.border,
                    color: theme.text,
                  }}
                >
                  <div className="appearance-preview-heading">
                    <strong>{label}</strong>
                    {selected && <span>Selected</span>}
                  </div>
                  <div className="appearance-preview-samples">
                    <span style={{ backgroundColor: theme.surface }}>
                      Surface
                    </span>
                    <span
                      style={{ backgroundColor: theme.soft, color: theme.text }}
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
                </article>
              );
            })}
          </div>
        </section>
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
          If a save fails or another device changes your settings,{" "}
          <a href="/clinic/settings">reload saved settings</a> before trying
          again. Reloading discards unsaved selections.
        </p>
      </Card>
      {settings.development_access && (
        <div className="development-settings">
          <Card title="Development view">
            <p>
              Swap the OmniLogin account’s development view label without
              signing out. All views retain unrestricted access to this local
              synthetic clinic; this control exists only on the loopback
              development server.
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
  if (!appearance.settings)
    return (
      <div className="clinic-settings">
        <h1>Settings</h1>
        <LoadState error={appearance.error} />
        {appearance.error && (
          <a className="text-link" href="/clinic/settings">
            Reload settings
          </a>
        )}
      </div>
    );
  return (
    <AppearanceSettings
      user={user}
      settings={appearance.settings}
      accept={appearance.accept}
      systemDark={appearance.systemDark}
    />
  );
}
