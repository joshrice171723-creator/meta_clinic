import { businessNow } from "../../shared/businessDate";

export type PunchEvent = "clock_in" | "break_start" | "break_end" | "clock_out";

export type BadgeRecord = {
  id: number;
  employment_id: number;
  employee_name: string;
  status: "issued" | "revoked" | "replaced";
  format: "code128";
  pin_required: boolean;
  issued_at: string;
  revoked_at: string | null;
};

export type KioskEnrollment = {
  id: number;
  site_id: number;
  site_name: string;
  status: "issued" | "enrolled" | "revoked" | "expired";
  expires_at: string;
  enrolled_at: string | null;
  revoked_at: string | null;
};

export type KioskConfiguration = {
  enrolled: true;
  site_id: number;
  site_name: string;
  scanner_enabled: boolean;
  camera_enabled: boolean;
  manual_badge_entry_enabled: boolean;
  pin_required: boolean;
  camera_formats: string[];
};

export type ClockChallenge = {
  challenge: string;
  expires_at: string;
  employee_label: string;
  allowed_transitions: PunchEvent[];
  break_target_minutes: number | null;
  break_reminder_due: boolean;
};

export type PunchResult = {
  id: number;
  request_key: string;
  saved: boolean;
  replayed: boolean;
  event_type: PunchEvent;
  occurred_at_utc: string;
  site_id: number;
  allowed_transitions: PunchEvent[];
};

export type TimeSegment = {
  id: number;
  site_id: number;
  segment_kind: "work" | "break" | "manual";
  local_date: string;
  started_at_utc: string;
  ended_at_utc: string;
  raw_minutes: number;
  rounded_minutes: number | null;
  paid_minutes: number | null;
  regular_minutes: number | null;
  overtime_minutes: number | null;
  exception_codes: string[];
  settings_provenance: Record<string, unknown>;
};

export type Timecard = {
  id: number;
  scoped_site_id?: number | null;
  employment_id: number;
  employee_name: string;
  period_start: string;
  period_end: string;
  version_number: number;
  status: "draft" | "submitted" | "approved" | "superseded";
  source_digest: string;
  unresolved_exceptions: string[];
  settings_provenance: Record<string, unknown>;
  snapshot: {
    period: { start: string; end: string };
    totals: {
      raw_minutes: number;
      rounded_minutes: number | null;
      paid_minutes: number | null;
      regular_minutes: number | null;
      overtime_minutes: number | null;
    };
    schedule_checks?: {
      site_id: number;
      local_date: string;
      status: "no_published_schedule" | "compared";
      publication_ids: number[];
    }[];
    segments: TimeSegment[];
  };
  lock_version: number;
  submitted_at: string | null;
  approved_at: string | null;
  workflow?: {
    approval_mode:
      "manager_required" | "employee_submit_manager_approve" | null;
    can_submit: boolean;
    can_approve: boolean;
    note: string | null;
  };
};

export type TimecardEmployee = {
  id: number;
  name: string;
};

export type Adjustment = {
  id: number;
  employment_id: number;
  employee_name: string;
  period_start: string;
  period_end: string;
  timecard_version_id: number;
  status: "submitted" | "approved" | "denied";
  correction_type: "add_segment" | "replace_segment" | "remove_segment";
  source_interval: {
    site_id: number;
    started_at_utc: string;
    ended_at_utc: string;
  } | null;
  proposed_changes: Record<string, string | number>;
  reason: string;
  requested_at: string;
  reviewed_at: string | null;
  decision_reason: string | null;
  resulting_timecard_version_id: number | null;
  lock_version: number;
  can_decide: boolean;
};

export type BarcodeDetectorLike = {
  detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string }>>;
};

export type BarcodeDetectorConstructor = {
  new (options: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<string[]>;
};

export const punchLabels: Record<PunchEvent, string> = {
  clock_in: "Clock in",
  break_start: "Start break",
  break_end: "End break",
  clock_out: "Clock out",
};

export function formatMinutes(minutes: number | null) {
  if (minutes === null) return "Not configured";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h ${remainder.toString().padStart(2, "0")}m`;
}

export function currentWeekStart() {
  const date = businessNow();
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  return date.toISOString().slice(0, 10);
}
