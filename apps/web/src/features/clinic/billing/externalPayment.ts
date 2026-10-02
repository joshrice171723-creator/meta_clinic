export type ExternalPaymentAttempt = {
  invoiceId: number;
  patientId: number;
  currency: string;
  reference: string;
  received: string;
  allocation: string;
};

export function paymentUnits(value: unknown): bigint | null {
  if (typeof value !== "string") return null;
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,6}))?$/.exec(value.trim());
  return match
    ? BigInt(match[1]) * 1_000_000n + BigInt((match[2] ?? "").padEnd(6, "0"))
    : null;
}

function paymentDecimal(value: bigint) {
  const fraction = (value % 1_000_000n)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  return `${value / 1_000_000n}${fraction ? `.${fraction}` : ""}`;
}

export function externalPaymentAmounts(
  received: string,
  balance: string,
  allocationOverride: string | null,
) {
  const total = paymentUnits(received);
  const due = paymentUnits(balance);
  const allocation =
    allocationOverride === null
      ? total !== null && due !== null
        ? total < due
          ? total
          : due
        : null
      : paymentUnits(allocationOverride);
  if (total === null || total <= 0n || due === null || due <= 0n)
    return {
      error:
        "Enter the positive amount actually received, with up to six decimal places.",
    };
  if (allocation === null || allocation <= 0n)
    return { error: "Enter a positive amount to apply to this invoice." };
  if (allocation > total)
    return { error: "The amount applied cannot exceed the money received." };
  if (allocation > due)
    return {
      error:
        "The amount applied cannot exceed the outstanding invoice balance.",
    };
  return {
    error: "",
    allocation: paymentDecimal(allocation),
    notAppliedHere: paymentDecimal(total - allocation),
  };
}

export function externalPaymentResponse(
  value: unknown,
  attempt: ExternalPaymentAttempt,
): { unapplied: string } | null {
  if (!value || typeof value !== "object") return null;
  const allocation = (value as { payment_allocation?: Record<string, unknown> })
    .payment_allocation;
  const event = allocation?.payment_event as
    Record<string, unknown> | undefined;
  const positiveId = (id: unknown) =>
    typeof id === "number" && Number.isSafeInteger(id) && id > 0;
  const unapplied = paymentUnits(event?.unapplied_amount);
  const received = paymentUnits(attempt.received);
  if (
    !positiveId(allocation?.id) ||
    !positiveId(allocation?.payment_event_id) ||
    event?.id !== allocation?.payment_event_id ||
    allocation?.invoice_id !== attempt.invoiceId ||
    allocation?.patient_id !== attempt.patientId ||
    paymentUnits(allocation?.amount) !== paymentUnits(attempt.allocation) ||
    paymentUnits(event?.amount) !== paymentUnits(attempt.received) ||
    unapplied === null ||
    received === null ||
    unapplied < 0n ||
    unapplied > received
  )
    return null;
  return { unapplied: event!.unapplied_amount as string };
}

export function externalPaymentMoney(value: string, currency: string) {
  const [whole, fraction = ""] = value.split(".");
  return `${currency} ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.padEnd(2, "0")}`;
}
