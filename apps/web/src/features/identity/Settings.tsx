import type { User, UserSettings } from "../../api/contracts";
import { Card, Field, Form, LoadState } from "../../shared/ui";
import { useAppearance } from "../clinic/Appearance";
import { CLINIC_MODES, CLINIC_PALETTES } from "../clinic/appearancePreferences";

export function AppearanceSettings({
  user,
  settings,
  accept,
}: {
  user: User;
  settings: UserSettings;
  accept: (value: unknown) => void;
}) {
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
          Choose your colors and brightness. Save to use them wherever you sign
          in. Follow system uses each device’s light or dark setting.
        </p>
        <Form
          endpoint="/api/settings"
          method="PATCH"
          submit="Save appearance"
          className="settings-form"
          onSuccess={accept}
          values={{ expected_user_id: user.id }}
        >
          <input
            type="hidden"
            name="appearance[version]"
            value={settings.appearance.version}
          />
          <Field
            name="appearance[palette]"
            label="Color theme"
            value={settings.appearance.palette}
            options={CLINIC_PALETTES.map((p) => [p.id, p.label])}
          />
          <Field
            name="appearance[mode]"
            label="Brightness"
            value={settings.appearance.mode}
            options={CLINIC_MODES.map((m) => [m.id, m.label])}
          />
        </Form>
        <p className="form-note">
          Changes apply after a successful save. If a save fails or another
          device changes your settings,{" "}
          <a href="/clinic/settings">reload saved settings</a> before trying
          again. Reloading discards unsaved selections.
        </p>
      </Card>
      {settings.development_access && (
        <Card title="Development view">
          <p>
            Swap the OmniLogin account’s development view label without signing
            out. All views retain unrestricted access to this local synthetic
            clinic; this control exists only on the loopback development server.
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
                (option) => option.id === settings.development_access?.profile,
              )?.description
            }{" "}
            The selected view is shared by OmniLogin sessions using this local
            database. Reloaded requests continue through the local Omni
            development override and normal authorization for every other
            account.
          </p>
        </Card>
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
    />
  );
}
