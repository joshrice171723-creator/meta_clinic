export const janeProfiles = [
  {
    name: "Jane cash-pay clinic",
    current:
      "Jane subscription plus separately purchased membership, eRx, lab, CRM and scribe tools actually used. Exclude tools already included in the Jane plan.",
    offer:
      "One quoted software bundle for the clinic's demonstrated cash-pay workflows: scheduling, charting, memberships, prescribing and lab follow-up.",
    proof:
      "Prove recurring payments, chart migration, prescriptions and lab results before retiring existing subscriptions.",
  },
  {
    name: "Jane insurance-billing clinic",
    current:
      "Jane subscription and insurance add-on, separate clearinghouse charges, and any additional clinical software. Include recurring and usage-based fees once.",
    offer:
      "A connected clinical-to-claim workflow with an explicit software and clearinghouse quote covering eligibility, submission, corrections and payment posting.",
    proof:
      "Prove payer enrollment, eligibility, claims, rejections, remittances and outstanding receivables migration before switching.",
  },
] as const;

export const clinicMarkets = [
  {
    name: "Direct primary care",
    payment: "Cash-pay / membership",
    prices: ["299–599", "599–1,199", "1,499–3,499", "3,999–8,499", "8,500+"],
    implementation: [
      "1,500–2,500",
      "3,000–6,000",
      "8,000–15,000",
      "20,000–40,000",
      "50,000+",
    ],
    switchReason:
      "Consolidate membership billing, prescribing and lab follow-up around one longitudinal chart.",
    proof: "Membership collection, renewals, labs and eRx handoffs.",
    complex: false,
  },
  {
    name: "Medical weight loss",
    payment: "Cash-pay / membership",
    prices: ["399–699", "699–1,399", "1,799–3,999", "4,499–9,499", "10,000+"],
    implementation: [
      "2,000–3,500",
      "4,500–7,500",
      "10,000–18,000",
      "25,000–45,000",
      "55,000+",
    ],
    switchReason:
      "Connect treatment programs, medication orders, monitoring labs and renewals.",
    proof:
      "Order status, medication history, recurring follow-up and inventory reconciliation.",
    complex: false,
  },
  {
    name: "Functional medicine",
    payment: "Cash-pay / membership",
    prices: ["349–649", "649–1,299", "1,699–3,799", "4,299–8,999", "9,000+"],
    implementation: [
      "2,000–3,500",
      "4,000–7,000",
      "9,000–17,000",
      "22,000–42,000",
      "50,000+",
    ],
    switchReason:
      "Connect long-form documentation, lab review, recurring programs and supplement/stock workflows.",
    proof: "Lab interfaces, longitudinal chart review and inventory scope.",
    complex: false,
  },
  {
    name: "Hormone management",
    payment: "Cash-pay / membership",
    prices: ["399–699", "699–1,399", "1,799–3,999", "4,499–9,499", "10,000+"],
    implementation: [
      "2,000–3,500",
      "4,500–7,500",
      "10,000–18,000",
      "25,000–45,000",
      "55,000+",
    ],
    switchReason:
      "Keep repeat labs, refills, prescriptions and follow-up in one recorded workflow.",
    proof: "EPCS coverage where applicable, lab follow-up and refill safety.",
    complex: false,
  },
  {
    name: "Cash-pay IV therapy",
    payment: "Cash-pay / membership",
    prices: ["499–899", "899–1,699", "2,299–4,999", "5,499–10,999", "12,000+"],
    implementation: [
      "3,500–5,500",
      "6,000–10,000",
      "14,000–24,000",
      "30,000–55,000",
      "65,000+",
    ],
    switchReason:
      "Connect administration records with purchasing, lots and stock consumption.",
    proof:
      "Nursing administration, timing, monitoring, lot traceability and exceptions.",
    complex: true,
  },
  {
    name: "Family medicine",
    payment: "Insurance-enabled",
    prices: ["599–999", "999–1,999", "2,499–5,999", "6,499–13,999", "15,000+"],
    implementation: [
      "3,000–5,500",
      "6,000–10,000",
      "14,000–24,000",
      "30,000–55,000",
      "65,000+",
    ],
    switchReason:
      "Connect front desk, clinical documentation, eligibility and claim follow-up.",
    proof:
      "Payer enrollment, claims, rejection correction and payment posting.",
    complex: false,
  },
  {
    name: "Psychiatry",
    payment: "Insurance-enabled",
    prices: ["449–899", "899–1,799", "2,199–4,999", "5,499–11,999", "13,000+"],
    implementation: [
      "2,500–4,500",
      "5,000–8,500",
      "11,000–19,000",
      "24,000–44,000",
      "55,000+",
    ],
    switchReason:
      "Bring medication management, telehealth, sensitive-record permissions and billing together.",
    proof:
      "Specialty notes, sensitive-record controls, EPCS and authorization tracking.",
    complex: false,
  },
  {
    name: "Urgent care",
    payment: "Insurance-enabled",
    prices: [
      "799–1,299",
      "1,299–2,499",
      "3,499–7,499",
      "7,999–16,999",
      "18,000+",
    ],
    implementation: [
      "4,500–7,000",
      "8,000–12,000",
      "18,000–28,000",
      "35,000–65,000",
      "75,000+",
    ],
    switchReason:
      "Unify walk-in tracking, clinical handoffs, testing, stock and charge capture.",
    proof:
      "Concurrent throughput, testing, charge capture and claim corrections.",
    complex: false,
  },
  {
    name: "Rheumatology",
    payment: "Insurance-enabled",
    prices: [
      "899–1,499",
      "1,499–2,999",
      "3,999–8,499",
      "8,999–18,999",
      "20,000+",
    ],
    implementation: [
      "5,000–8,500",
      "10,000–15,000",
      "22,000–35,000",
      "40,000–75,000",
      "85,000+",
    ],
    switchReason:
      "Link medications, repeat labs, authorizations, purchasing and lot-level stock.",
    proof:
      "Specialty charting, medical/pharmacy benefit authorization and drug billing.",
    complex: true,
  },
  {
    name: "Specialty infusion",
    payment: "Insurance-enabled",
    prices: [
      "1,199–1,999",
      "1,999–3,999",
      "4,999–10,999",
      "11,999–24,999",
      "25,000+",
    ],
    implementation: [
      "7,000–11,000",
      "13,000–20,000",
      "28,000–45,000",
      "50,000–90,000",
      "100,000+",
    ],
    switchReason:
      "Connect referral-to-treatment-to-payment with authorization and medication acquisition.",
    proof:
      "Chair/resource scheduling, complex authorization, procurement and reimbursement.",
    complex: true,
  },
] as const;
