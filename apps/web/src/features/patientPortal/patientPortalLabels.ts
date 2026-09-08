export function patientPortalLabel(value: string) {
  const cleaned = value
    .replace(/\bdev\s+seed\s*/gi, "")
    .replace(/\bsynthetic\s*/gi, "")
    .replace(/\bSYN[_-]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned;
}

export function patientPortalReferenceLabel(value: string) {
  return /^SYN[-_]/i.test(value.trim()) ? null : patientPortalLabel(value);
}
