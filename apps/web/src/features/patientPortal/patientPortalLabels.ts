export function patientPortalLabel(value: string) {
  const cleaned = value
    .replace(/\bexample\s+catalog\s*/gi, "")
    .replace(/\bomni\s*/gi, "")
    .replace(
      /\b(?:dev(?:elopment)?(?:\s+seed)?|fixture|synthetic|demo)\s*/gi,
      "",
    )
    .replace(/\bSYN[_-]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned;
}

export function patientPortalReferenceLabel(value: string) {
  return /^SYN[-_]/i.test(value.trim()) ? null : patientPortalLabel(value);
}

export function patientPortalCodeLabel(value: string) {
  const label = patientPortalLabel(value).replace(/[_-]+/g, " ").trim();
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : value;
}
