export function patientPortalLabel(value: string) {
  const cleaned = value
    .replace(/\bdev\s+seed\s*/gi, "")
    .replace(/\bsynthetic\s*/gi, "")
    .replace(/\bSYN[_-]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned ? `${cleaned[0].toUpperCase()}${cleaned.slice(1)}` : cleaned;
}
