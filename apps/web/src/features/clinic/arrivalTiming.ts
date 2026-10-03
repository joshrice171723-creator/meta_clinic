export function lateArrivalMessage(
  minutes: number | null | undefined,
): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const remaining = Math.floor(minutes % 60);
  const parts = [
    days ? `${days} day${days === 1 ? "" : "s"}` : "",
    hours ? `${hours} hr` : "",
    remaining ? `${remaining} min` : "",
  ].filter(Boolean);
  return `Arrived ${parts.join(" ")} after the scheduled start.`;
}
