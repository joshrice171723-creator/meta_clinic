export type WorkforceSite = {
  id: number;
  code: string;
  name: string;
};

export type WorkforceEmployment = {
  id: number;
  status: "active" | "inactive";
  effective_from: string;
  effective_until: string | null;
  active_for_work: boolean;
  staff_member: {
    id: number;
    display_name: string;
    job_title: string;
    active: boolean;
  };
  membership_summary: {
    id: number;
    email_address: string;
    active: boolean;
  };
  sites: Array<
    WorkforceSite & {
      active: boolean;
      effective_from: string;
      effective_until: string | null;
    }
  >;
};

export type EmploymentAdminData = {
  schema_version: 1;
  employments: WorkforceEmployment[];
  staff_members: Array<{
    id: number;
    display_name: string;
    job_title: string;
    linked: boolean;
  }>;
  membership_options: Array<{ id: number; email_address: string }>;
  invitations: Array<{
    id: number;
    staff_member_id: number;
    display_name: string;
    email_address: string;
    expires_at: string;
  }>;
  sites: WorkforceSite[];
};

export type WorkforceSettingValue = string | number | boolean | null | Record<string, unknown>;
export type WorkforceSettingValues = Record<string, WorkforceSettingValue>;

export type WorkforceSettingsVersion = {
  id: number;
  scope_kind: "practice" | "site";
  site_id: number | null;
  revision: number;
  effective_from: string;
  values: WorkforceSettingValues;
};

export type EffectiveWorkforceSettings = {
  values: WorkforceSettingValues;
  versions: {
    practice: { id: number; revision: number; effective_from: string };
    site: { id: number; revision: number; effective_from: string } | null;
  };
};

export type WorkforceSettingsData = {
  schema_version: 1;
  scope: { kind: "practice" | "site"; site_id: number | null };
  current_version: WorkforceSettingsVersion | null;
  latest_revision: number;
  effective_settings: EffectiveWorkforceSettings | null;
  sites: WorkforceSite[];
  setting_contract: {
    required_keys: string[];
    site_keys: string[];
    practice_only_keys: string[];
    boolean_keys: string[];
    nullable_integer_keys: string[];
    enum_values: Record<string, string[]>;
  };
};
