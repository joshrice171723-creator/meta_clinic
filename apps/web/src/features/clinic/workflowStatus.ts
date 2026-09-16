export type WorkflowStatusDomain =
  | "membership"
  | "patient_flow"
  | "appointment"
  | "encounter"
  | "chart"
  | "billing";

export type WorkflowStatusDefinition = {
  domain: WorkflowStatusDomain;
  record: string;
  statuses: readonly string[];
  owner: string;
  note: string;
};

/** Each record owns its own status; one status never implies another. */
export const WORKFLOW_STATUS_MAP: readonly WorkflowStatusDefinition[] = [
  {
    domain: "membership",
    record: "Membership payment",
    statuses: ["prospective", "payment_pending", "paid", "cancelled"],
    owner: "Membership and billing",
    note: "A verified payment creates or activates the patient record.",
  },
  {
    domain: "patient_flow",
    record: "Initial-contact work item",
    statuses: ["open", "claimed", "in_progress", "completed", "blocked"],
    owner: "Front desk / patient-flow queue",
    note: "Completion makes scheduling available; it does not book a visit.",
  },
  {
    domain: "appointment",
    record: "Appointment",
    statuses: ["scheduled", "confirmed", "cancelled", "no_show", "completed"],
    owner: "Scheduling",
    note: "A scheduled appointment is not an arrival or an encounter.",
  },
  {
    domain: "encounter",
    record: "Visit / encounter",
    statuses: ["checked_in", "in_progress", "completed"],
    owner: "Clinic operations and clinical staff",
    note: "The Tracking Board begins when check-in or an encounter is recorded.",
  },
  {
    domain: "chart",
    record: "Clinical note",
    statuses: ["unopened", "draft", "signed", "amended"],
    owner: "Authorized clinical staff",
    note: "Encounter completion does not sign or amend a note.",
  },
  {
    domain: "billing",
    record: "Invoice / payment ledger",
    statuses: ["draft", "posted", "paid", "refunded", "void"],
    owner: "Billing and accounting",
    note: "Ledger actions remain separate from membership and encounter status.",
  },
] as const;

const STATUS_LABELS: Record<string, string> = {
  prospective: "Prospective",
  payment_pending: "Payment pending",
  paid: "Paid",
  open: "Open",
  claimed: "Claimed",
  in_progress: "In progress",
  completed: "Completed",
  blocked: "Blocked",
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  no_show: "No-show",
  checked_in: "Checked in",
  unopened: "Unopened",
  draft: "Draft",
  signed: "Signed",
  amended: "Amended",
  posted: "Posted",
  refunded: "Refunded",
  void: "Voided",
};

export function workflowStatusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}
