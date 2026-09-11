let selectedDate = "";

export function setBusinessDate(value: string) {
  selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

export function businessNow() {
  const now = new Date();
  if (!selectedDate) return now;
  const [year, month, day] = selectedDate.split("-").map(Number);
  now.setFullYear(year, month - 1, day);
  return now;
}

export function businessTimeAfter(milliseconds: number, now = businessNow()) {
  return new Date(now.getTime() + milliseconds);
}

export function isBeforeBusinessTime(
  value: string | Date,
  now = businessNow(),
) {
  const timestamp =
    value instanceof Date ? value.getTime() : new Date(value).getTime();
  return !Number.isNaN(timestamp) && timestamp < now.getTime();
}
