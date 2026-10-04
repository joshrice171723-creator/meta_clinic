import { businessNow } from "../../shared/businessDate";

export type WorkforceSite = {
  id: string;
  name: string;
  timezone: string;
  operating_hours?: Array<{
    day_of_week: number;
    closed: boolean;
    open_time: string | null;
    close_time: string | null;
  }>;
  request_options?: Record<string, boolean>;
};

export type WorkforceEmployment = {
  id: string;
  name: string;
  job_title: string;
};
export type WorkforceShift = {
  id: string;
  employment_id: string;
  employee_name: string;
  starts_at: string;
  ends_at: string;
  local_start: string;
  local_end: string;
  timezone: string;
  start_occurrence?: "only" | "first" | "second";
  end_occurrence?: "only" | "first" | "second";
  role_name: string | null;
  break_minutes: number;
};
export type ScheduleDraft = {
  id: string;
  site_id: string;
  week_start_on: string;
  timezone: string;
  status: string;
  revision: number;
  schedule_template_id: string | null;
  shifts?: WorkforceShift[];
};
export type ScheduleTemplate = {
  id: string;
  site_id: string;
  name: string;
  timezone: string;
  revision: number;
  active: boolean;
  shift_definitions: Array<Record<string, unknown>>;
};
export type SchedulePublication = {
  id: string;
  site_id: string;
  site_name: string;
  week_start_on: string;
  timezone: string;
  version: number;
  published_at: string;
  supersedes_id: string | null;
  shifts: WorkforceShift[];
};
export type ScheduleBootstrap = {
  schema_version: string;
  site: WorkforceSite;
  settings: Record<string, boolean | string | number | null>;
  employments: WorkforceEmployment[];
  templates: ScheduleTemplate[];
  drafts: ScheduleDraft[];
  publications: SchedulePublication[];
};
export type WorkforceRequest = {
  id: string;
  type: "availability_version" | "time_off_request" | "shift_swap_request";
  site_id: string;
  site_name?: string;
  employee_name?: string;
  status: string;
  reason: string;
  revision: number;
  created_at: string;
  decided_at?: string | null;
  decision_reason?: string | null;
  target_reason?: string | null;
  role_name?: string | null;
  expires_at?: string | null;
  employment_id?: string;
  requester_employment_id?: string;
  target_employment_id?: string;
  target_employee_name?: string;
  timezone?: string;
  starts_at?: string;
  ends_at?: string;
  effective_from?: string;
  effective_until?: string;
  weekly_rules?: Array<{
    day_of_week: number;
    start_time: string;
    end_time: string;
    available: boolean;
  }>;
  schedule_publication_id?: string;
  offered_shift_public_id?: string;
  can_target_decide?: boolean;
  can_cancel?: boolean;
};
export type SwapOption = {
  site_id: string;
  shifts: Array<{
    publication_id: string;
    shift_id: string;
    starts_at: string;
    ends_at: string;
    timezone: string;
  }>;
  employees: Array<{ id: string; name: string }>;
};

export function requestKey(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`;
}

export function mondayIso(date = businessNow()) {
  const copy = new Date(date);
  const day = copy.getDay();
  copy.setDate(copy.getDate() - ((day + 6) % 7));
  return `${copy.getFullYear()}-${String(copy.getMonth() + 1).padStart(2, "0")}-${String(copy.getDate()).padStart(2, "0")}`;
}

export function displayInterval(start: string, end: string, timezone: string) {
  const format = new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${format.format(new Date(start))} – ${format.format(new Date(end))}`;
}
