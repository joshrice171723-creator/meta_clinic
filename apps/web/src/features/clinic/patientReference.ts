export function patientReferenceLabel(
  reference?: string | null,
): string | null {
  const label = reference?.trim();
  return label && !/^SYN[-_]/i.test(label) ? label : null;
}
