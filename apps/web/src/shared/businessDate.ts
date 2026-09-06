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
