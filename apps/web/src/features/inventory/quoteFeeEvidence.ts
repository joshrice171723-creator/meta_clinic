export type QuoteFeeEvidence = {
  quoted_fee_amount?: string | null;
  quoted_fee_currency?: string | null;
  quoted_fee_basis?: string | null;
};

export function quoteFeeEvidenceLabel(evidence: QuoteFeeEvidence) {
  if (
    evidence.quoted_fee_amount == null ||
    !evidence.quoted_fee_currency ||
    !evidence.quoted_fee_basis
  )
    return "Quoted fees unknown";
  return `Quoted fee: ${evidence.quoted_fee_currency} ${evidence.quoted_fee_amount} · ${evidence.quoted_fee_basis} · not included in merchandise totals`;
}
