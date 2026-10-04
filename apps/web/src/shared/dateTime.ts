type DateTimeOptions = {
  fallback?: string;
  timeZone?: string;
  timeZoneName?: "short" | "long";
};

function parsedDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.valueOf()) ? date : null;
}

// Shift a calendar date without applying the browser's timezone or DST offset.
export function shiftCalendarDay(value: string, offset: number) {
  const date = parsedDate(`${value}T12:00:00Z`);
  if (!date || date.toISOString().slice(0, 10) !== value) return null;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function formatDisplayDateTime(
  value: string | Date | null | undefined,
  {
    fallback = "Date not recorded",
    timeZone,
    timeZoneName = "short",
  }: DateTimeOptions = {},
) {
  const date = parsedDate(value);
  if (!date) return fallback;
  try {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
      timeZoneName,
    }).format(date);
  } catch {
    return fallback;
  }
}

export function formatDisplayDate(
  value: string | Date | null | undefined,
  { fallback = "Date not recorded", timeZone }: DateTimeOptions = {},
) {
  const isDateOnly =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = parsedDate(isDateOnly ? `${value}T00:00:00Z` : value);
  if (!date || (isDateOnly && date.toISOString().slice(0, 10) !== value))
    return fallback;
  try {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: isDateOnly ? "UTC" : timeZone,
    }).format(date);
  } catch {
    return fallback;
  }
}
