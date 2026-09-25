import { Fragment, useEffect, type ReactNode } from "react";
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import ArrowOutwardRounded from "@mui/icons-material/ArrowOutwardRounded";
import PrintOutlined from "@mui/icons-material/PrintOutlined";
import "./i2e-investor.css";
import { I2eHelp } from "./I2eHelp";

// Proposed two-stage scribe workload; the current development route is different.
export const scribeCostModel = {
  minutesPerNote: 30,
  inputTokensPerNote: 6000,
  outputTokensPerNote: 2000,
  whisperPerMinute: 0.006,
  lunaInputPerMillion: 0.2,
  lunaOutputPerMillion: 1.2,
  creditPurchaseFee: 0.055,
};
export const scribeCostForNotes = (notes: number) =>
  notes *
  (scribeCostModel.minutesPerNote * scribeCostModel.whisperPerMinute +
    (scribeCostModel.inputTokensPerNote / 1_000_000) *
      scribeCostModel.lunaInputPerMillion +
    (scribeCostModel.outputTokensPerNote / 1_000_000) *
      scribeCostModel.lunaOutputPerMillion) *
  (1 + scribeCostModel.creditPurchaseFee);
export const scribeAllowance = (notes: number) =>
  Math.ceil((scribeCostForNotes(notes) * 1.1) / 10) * 10;

export const investorCosts = [
  {
    category: "AI Infrastructure & Workstation Hardware",
    upfront: 5000,
    monthly: 0,
    clinicBasis: "One-time shared build budget; not repeated per clinic.",
    purpose:
      "Provision a high-performance developer workstation and budget for multi-million-token AI API usage, model experimentation, execution and local orchestration.",
    value:
      "Engineering velocity: reduce hardware and compute bottlenecks. A 10x acceleration is a target, not a measured result; training and inference costs require separate scoping.",
  },
  {
    category: "Healthcare legal & contracts",
    upfront: 2000,
    monthly: 0,
    clinicBasis:
      "One-time platform templates; each clinic still signs its own agreements.",
    purpose:
      "Deploy a scalable Master Platform MSA and click-through BAA framework that defines platform, partner and clinic responsibilities.",
    value:
      "Counsel-reviewed contracts; statutory duties and malpractice exposure cannot simply be transferred away.",
  },
  {
    category: "DEA EPCS Compliance Audit",
    upfront: 2000,
    monthly: 0,
    clinicBasis:
      "One-time application-level allowance; clinic and prescriber enrollment may add costs.",
    purpose:
      "Establish the audit or certification coverage needed for controlled-substance e-prescribing, including provider identity and access requirements.",
    value:
      "Scope depends on the prescribing application and vendor coverage; this budget is not an approval.",
  },
  {
    category: "LegitScript certification",
    upfront: 1500,
    monthly: 0,
    clinicBasis:
      "One-time platform application allowance; $2,150 annual fee is additional.",
    purpose:
      "Pursue healthcare merchant certification where required. The $1,500 setup allowance exceeds the published $975 application fee; a $2,150 annual fee is due upon approval and is not in the monthly budget.",
    value:
      "Certification eligibility depends on the platform's role and services; approval does not guarantee processor acceptance.",
  },
  {
    category: "Prescription Network API (eRx)",
    upfront: 0,
    monthly: 800,
    clinicBasis:
      "Central API Launch tier covers up to 2,000 orders/month across the platform. Adding a clinic has no new base fee within that tier; overages are $0.80/order.",
    purpose:
      "Embed prescription routing through the proposed Photon Health integration, with medication-history and benefit-data scope confirmed in contracting.",
    value:
      "Photon publishes $800 monthly for 2,000 orders on Launch, plus $0.80 per additional order. Network and benefit-data scope require provider confirmation.",
  },
  {
    category: "Insurance billing engine",
    upfront: 0,
    monthly: 1500,
    clinicBasis:
      "One $1,500/month planning allowance for the platform, not a per-clinic price. Coverage for separately owned clinics, entity enrollment and claim fees are unquoted; cash-pay clinics do not need claims routing.",
    purpose:
      "Integrate ANSI X12 837 claim workflows and clearinghouse submission through the proposed Candid Health API layer.",
    value:
      "Expand into hybrid clinics while keeping insurance optional for cash-pay practices. The $1,500 monthly figure is a planning allowance, not a published Candid quote.",
  },
  {
    category: "HIPAA Telehealth Video API",
    upfront: 0,
    monthly: 150,
    clinicBasis:
      "Central $150 usage reserve; one added clinic at 125 two-person, 30-minute visits adds about $30 at $0.004 per participant-minute, before extras.",
    purpose:
      "Consumption-based WebRTC consultations via Twilio Programmable Video, with a signed BAA required before PHI use. Additional clinics add metered participant-minute usage.",
    value:
      "Capital efficiency: pay-as-you-go video usage scales with consultations. Twilio HIPAA Accounts require Security or Enterprise Edition; account fees and BAA terms must be confirmed separately.",
  },
  {
    category: "AI Clinical Scribe Engine",
    upfront: 0,
    monthly: scribeAllowance(500),
    clinicBasis:
      "Central $110/month allowance models 500 notes; one added clinic models 125 more notes for $30/month. Each note assumes 30 audio minutes, 6,000 GPT-5.6 Luna input tokens and 2,000 output tokens, with 5.5% credit fee, 10% reserve and rounding. Pilot usage will determine actual cost.",
    purpose:
      "Model a two-stage OpenRouter workflow: Whisper-1 transcribes audio, then GPT-5.6 Luna drafts a note for clinician review. This is a pricing scenario, not the current development route or a guaranteed note capacity.",
    value:
      "The development scribe already routes through OpenRouter. Whisper-to-Luna routing and real consultation usage require implementation and pilot validation.",
  },
  {
    category: "Security & HIPAA hosting",
    upfront: 0,
    monthly: 400,
    clinicBasis:
      "Central hosting allowance. No additional fixed amount is modeled for one clinic; storage, traffic and isolation terms need validation.",
    purpose:
      "Implement isolated hosting, access controls and audit infrastructure using an appropriate AWS HIPAA-eligible or Aptible configuration.",
    value:
      "Hosting eligibility supports the architecture; BAAs, safeguards and operating controls remain essential.",
  },
  {
    category: "503A pharmacy partner workflows",
    upfront: 0,
    monthly: 0,
    clinicBasis:
      "No fixed fee budgeted; each clinic's partner and per-order terms remain unquoted.",
    purpose:
      "Build partner-order and status pipelines for licensed 503A pharmacies, with transaction-based economics.",
    value:
      "Pharmacy partners are integration targets. No fixed platform fee is modeled; variable costs and terms require contracts.",
  },
  {
    category: "Diagnostic lab connectivity (Quest / Labcorp)",
    upfront: 0,
    monthly: 0,
    clinicBasis:
      "Not included in totals. Per-provider, interface and clinic enrollment fees need a quote.",
    purpose:
      "Planned bidirectional lab ordering and result tracking through a contracted middleware partner. Interface enrollment, implementation and any platform subscription require a quote.",
    value:
      "Healthie publishes $10/month per ordering provider and $5/month per non-NPI ordering user for Enterprise customers linking existing lab accounts; its Quest/Labcorp connections typically take at least five months. This is a comparator, not a Meta Clinic contract or included budget.",
  },
  {
    category: "Wholesale clinical lab orders",
    upfront: 0,
    monthly: 0,
    clinicBasis:
      "No fixed fee budgeted; tests and processing are charged per order.",
    purpose:
      "Patient-specific cash-pay lab orders through a prospective partner catalog, with test prices and processing charges assessed per order.",
    value:
      "Rupa publishes no practitioner subscription and a 7% processing fee on wholesale catalog prices passed to patients. Meta Clinic has no agreed catalog, resale rights or transaction margin.",
  },
];
const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
export const investorBudget = {
  capital: 30000,
  upfront: investorCosts.reduce((sum, row) => sum + row.upfront, 0),
  monthly: investorCosts.reduce((sum, row) => sum + row.monthly, 0),
};
export const addedClinicUsage = { video: 30, scribe: scribeAllowance(125) };
// Retained for existing imports; this model is no longer rendered in the i2E page.
export const conversionTarget = {
  baseline: null as number | null,
  price: 1100,
  vendorCost: addedClinicUsage.video + addedClinicUsage.scribe,
  namedAddons: null,
};
export const stackCosts = [
  {
    name: "Base EMR & calendar",
    cost: null,
    basis:
      "Jane plan and provider-seat price depend on configuration; obtain the clinic's current invoice.",
    meta: "Jane provides scheduling and charting; compare the actual plan and seat count.",
  },
  {
    name: "Hint Launch · alternative platform",
    cost: 870,
    basis:
      "Published Hint Launch rate: $290/month for 1 clinician plus $290/month for each additional clinician. Three clinicians = $870/month. Includes unlimited members; transaction fees are extra. This prices Hint's full platform, not a membership-only add-on.",
    meta: "Relevant alternative for weight-management practices; Hint advertises weight-loss EMR, scheduling and recurring billing. Capabilities overlap with Jane, so do not add this amount to Jane's bill without a verified customer invoice proving both subscriptions are used.",
  },
  {
    name: "Medical CRM & patient nurturing",
    cost: null,
    basis:
      "No HubSpot price claimed. Include it only if purchased; use the clinic's actual plan and invoice.",
    meta: "Jane covers core patient records, booking and communications. A separate CRM may be useful for broader lead pipelines or marketing automation; Meta Clinic's target connects acquisition and follow-up to clinic operations.",
  },
  {
    name: "eRx & retail pharmacy links",
    cost: null,
    basis:
      "No DoseSpot price claimed. Confirm current Jane e-prescribing access and any separate vendor contract with the clinic.",
    meta: "Jane medication management is not the same as sending prescriptions; U.S. e-prescribing availability depends on Jane beta access. Meta's Photon integration is proposed, not active.",
  },
  {
    name: "AI clinical scribe",
    cost: 45,
    basis:
      "Optional: $15 per opted-in clinician monthly at published pricing; $45 only if all three use the paid tier.",
    meta: "Integrated draft-note workflow with clinician review.",
  },
];
const salesDeckUrl = "https://meta-clinic-market-deck.trt53.chatgpt.site/";
const vendorSources: Record<
  string,
  { url: string; label: string; basis: string }
> = {
  "Prescription Network API (eRx)": {
    url: "https://photonhealth.com/blog/introducing-photon-self-serve",
    label: "Photon plans",
    basis:
      "Published Launch plan: $800/mo includes 2,000 orders; $0.80 per extra order.",
  },
  "Insurance billing engine": {
    url: "https://get.candidhealth.com/medical-billing-software",
    label: "Candid product",
    basis:
      "$1,500/mo planning allowance; linked product page does not publish that price or multi-owner contract terms.",
  },
  "HIPAA Telehealth Video API": {
    url: "https://www.twilio.com/en-us/video/pricing",
    label: "Twilio pricing",
    basis:
      "$150 central usage reserve; one added clinic's 125 two-person 30-minute visits would add $30 at the published $0.004/participant-minute. Account edition and extras are separate.",
  },
  "LegitScript certification": {
    url: "https://www.legitscript.com/certification/healthcare-certification/faq/",
    label: "LegitScript fees",
    basis:
      "Published $975 application fee and $2,150 annual fee upon approval. $1,500 shown is a setup allowance.",
  },
  "AI Clinical Scribe Engine": {
    url: "https://openrouter.ai/openai/whisper-1",
    label: "Whisper pricing",
    basis:
      "Whisper $0.006/audio minute; GPT-5.6 Luna $0.20/M input and $1.20/M output tokens. Standard OpenRouter credit purchases carry a 5.5% fee. Modeled 500 notes cost about $96.85, budgeted at $110; 125 notes cost about $24.21, budgeted at $30.",
  },
  "Diagnostic lab connectivity (Quest / Labcorp)": {
    url: "https://help.gethealthie.com/article/1260-direct-labs-by-healthie",
    label: "Healthie E-Labs terms",
    basis:
      "Healthie Enterprise comparator: $10/mo per ordering provider; $5/mo per non-NPI ordering user. Enterprise and interface costs require a quote.",
  },
  "Wholesale clinical lab orders": {
    url: "https://help.rupahealth.com/en/articles/6131530-how-does-rupa-health-s-pricing-work",
    label: "Rupa pricing model",
    basis:
      "Rupa comparator: no practitioner subscription; wholesale test price plus 7% processing to patients. Meta Clinic terms unquoted.",
  },
};
const janeSources: Record<string, { url: string; label: string }[]> = {
  "Jane plan + provider seats": [
    { url: "https://jane.app/pricing", label: "Jane plans" },
  ],
  "Hint Launch · alternative platform": [
    {
      url: "https://www.hint.com/weight-management",
      label: "Hint features and pricing",
    },
    {
      url: "https://jane.app/features/packages-and-memberships",
      label: "Jane membership availability",
    },
  ],
  "Jane AI Scribe · 3 seats": [
    {
      url: "https://jane.app/guide/ai-scribe",
      label: "Jane AI Scribe",
    },
    { url: "https://jane.app/pricing", label: "Jane pricing" },
  ],
  "Jane memberships + payment processing": [
    { url: "https://jane.app/features/packages-and-memberships", label: "Jane memberships" },
    { url: "https://jane.app/pricing", label: "Jane payment rates" },
  ],
  "CRM / HubSpot optional reference": [
    { url: "https://jane.app/guide/how-to-connect-trustdrivencare-to-jane", label: "Jane CRM integration" },
    { url: "https://www.hubspot.com/pricing/crm?product=marketing", label: "HubSpot pricing" },
  ],
  "1:1 telehealth": [
    { url: "https://jane.app/features/telehealth", label: "Jane telehealth" },
  ],
  "Medication records and e-prescribing": [
    { url: "https://jane.app/guide/medical-wellness-hub", label: "Jane medical hub / roadmap" },
    { url: "https://jane.app/guide/prescriptions", label: "Jane prescriptions guide" },
  ],
  "Insurance billing engine": [
    { url: "https://jane.app/pricing", label: "Jane insurance billing" },
  ],
  "Quest/Labcorp order/result tracking": [
    {
      url: "https://jane.app/guide/fullscript-integration",
      label: "Jane and Fullscript Labs",
    },
  ],
  "503A partner pharmacy orders/status": [
    {
      url: "https://jane.app/integrations",
      label: "Jane integration directory; confirm partner coverage",
    },
  ],
};
const metaCostSources: Record<string, { key: string; label: string }[]> = {
  "Hint Launch · alternative platform": [],
  "Jane memberships + payment processing": [
    { key: "HIPAA Telehealth Video API", label: "Stripe Connect pricing" },
  ],
  "Jane AI Scribe · 3 seats": [
    { key: "AI Clinical Scribe Engine", label: "Model usage cost basis" },
  ],
  "1:1 telehealth": [
    { key: "HIPAA Telehealth Video API", label: "Twilio published rate" },
  ],
  "Medication records and e-prescribing": [
    { key: "Prescription Network API (eRx)", label: "Photon published plan" },
  ],
  "Quest/Labcorp order/result tracking": [
    { key: "Diagnostic lab connectivity (Quest / Labcorp)", label: "Healthie comparator terms" },
  ],
  "Insurance billing engine": [
    { key: "Insurance billing engine", label: "Candid product; estimate is not quoted" },
  ],
};
function Grid({
  label,
  headers,
  children,
}: {
  label: string;
  headers: string[];
  children: ReactNode;
}) {
  return (
    <TableContainer
      className="i2e-grid"
      tabIndex={0}
      role="region"
      aria-label={label}
    >
      <Table size="small" aria-label={label}>
        <TableHead>
          <TableRow>
            {headers.map((header, index) => (
              <TableCell
                key={header}
                scope="col"
                align={index === 0 ? "left" : "right"}
              >
                <I2eHelp label={header} />
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>{children}</TableBody>
      </Table>
    </TableContainer>
  );
}
export function I2eInvestorPage() {
  useEffect(() => {
    const title = document.title;
    document.title = "Meta Clinic × i2E | Clinic cost-to-serve comparison";
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex,nofollow";
    document.head.appendChild(robots);
    return () => {
      document.title = title;
      robots.remove();
    };
  }, []);
  return (
    <div className="i2e-page i2e-console">
      <header className="i2e-header">
        <a href="/meta-clinic" className="i2e-brand">
          m. <span>Meta Clinic</span>
        </a>
        <span>i2E / CLINIC COST-TO-SERVE COMPARISON</span>
        <div>
          <Button href="/demo" endIcon={<ArrowOutwardRounded />}>
            Demo
          </Button>
          <Button onClick={() => window.print()} startIcon={<PrintOutlined />}>
            Print
          </Button>
        </div>
      </header>
      <div className="i2e-workspace">
        <nav className="i2e-nav" aria-label="Dashboard sections">
          <a href="#switching">01 / Clinic cost comparison</a>
          <a href="#capital">02 / Meta Clinic cost to operate</a>
          <a href="#sales-deck">Sales deck</a>
        </nav>
        <main id="i2e-main">
          <section id="switching">
            <h1>01 / Medical weight loss + hormone optimization</h1>
            <p className="i2e-note">
              Cost-to-deliver comparison: one three-provider independent
              cash-pay weight-management practice · Jane prices are published
              list prices; Meta Clinic costs are internal models or marked
              unknown · USD / month
            </p>
            <TableContainer
              className="i2e-grid i2e-comparison-table"
              tabIndex={0}
              role="region"
              aria-label="Clinic software comparison"
            >
              <Table size="small" aria-label="Clinic software comparison">
                <TableHead>
                  <TableRow>
                    {[
                      "Capability area",
                      "What Jane or the named vendor provides",
                      "What Jane / vendor charges the clinic",
                      "Can Meta Clinic provide this at market launch?",
                      "Meta Clinic cost to deliver it",
                    ].map((header) => (
                      <TableCell key={header}>{header}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {[
                    [
                      "Jane plan + provider seats",
                      "Core scheduling, online booking, charting, patient communications, billing and reporting.",
                      "Thrive is $99/month and includes one full-time practitioner. Two more provider licenses are charged by scheduled hours; Jane's calculator or the clinic invoice is needed for the actual three-provider total.",
                      "Target: one clinic platform for the same broad workflow. Feature-by-feature parity and launch readiness are not established by this comparison.",
                      "$400/month shared hosting allowance in the operating budget. No per-clinic allocation or measured marginal infrastructure cost; build/support labor is not included.",
                    ],
                    [
                      "Hint Launch · alternative platform",
      "Full weight-management platform: EMR/charting, scheduling, communications, e-prescribing/refills, lab ordering/results, memberships and automated billing. AI documentation and employer-management/eligibility are Pro features. Hint is an alternative to Jane, not a presumed Jane add-on.",
      "Launch: $870/month for 3 clinicians and unlimited members ($290 first + $290 each additional). Pro: $784/month for 3 clinicians and 100 members ($320 base + 2 × $232), before extra members. Launch processing: cards 3% + $0.30 (+1% Amex); ACH 1% + $0.25 (capped at $5). Pro processing: cards 2.75% + $0.30 (+1% Amex); ACH 0.75% + $0.25 (capped at $5).",
                      "Target: connect membership enrollment, recurring charges, visits and follow-up. Employer management and eligibility automation are not claimed as equivalent to Hint Pro.",
                      "No separate membership vendor fee is budgeted. Payment processing and Connect costs depend on transaction volume and payment architecture; Meta's amount is unknown without those inputs.",
                    ],
                    [
                      "Jane memberships + payment processing",
                      "Thrive includes recurring packages/memberships, automated invoices, usage tracking and reports. Jane Payments online cards: 2.85% + $0.25; in-person: 2.6% + $0.10.",
                      "Memberships are included in Thrive's $99 base; add two provider licenses. Payment processing is charged per transaction at Jane's published rates.",
                      "Target: recurring membership billing connected to clinic records and follow-up. This is a comparable category, not a unique Meta feature.",
                      "Payment rails use Stripe Connect in the model. If clinics pay Stripe directly, Stripe lists no platform fee and its standard online card processing starts at 2.9% + $0.30/charge. If Meta handles pricing, Connect adds $2/active account/month + 0.25% + $0.25/payout, plus processing. No transaction volume or architecture is fixed, so total is unknown.",
                    ],
                    [
                      "CRM / HubSpot optional reference",
                      "Jane has patient records, secure messaging and follow-up. A separate CRM is optional for sales pipeline or advanced campaign automation, not required for routine patient communications.",
      "HubSpot CRM Free: $0 for up to 2 users and 1,000 contacts. For 3 seats, Starter is currently shown as $21/month promotional ($7/seat) or $60/month at its displayed standard monthly price ($20/seat); limits apply.",
                      "Target: connect prospect capture and follow-up with clinic workflows. The exact CRM feature match is not established here.",
                      "No separate CRM subscription is in the model. Engineering, shared hosting, messaging delivery and support are not allocated per clinic.",
                    ],
                    [
                      "Jane AI Scribe · 3 seats",
                      "Draft notes for clinician review; 5 notes/month free per practitioner, then $15/month per opted-in practitioner for unlimited notes.",
                      "$0 if each clinician stays within 5 free notes; $45/month if all 3 choose unlimited.",
                      "Target: generated draft notes for clinician review. Workflow intent aligns; clinical quality and feature parity are not established by price alone.",
                      "$30/month modeled incremental usage for 125 notes (30 audio minutes each). Shared 500-note allowance is $110/month. These are usage assumptions requiring pilot validation.",
                    ],
                    [
                      "1:1 telehealth",
                      "Jane includes integrated one-to-one video visits in every plan at no extra subscription charge. Group telehealth is a separate add-on.",
                      "Included in Jane plan; no additional 1:1 fee.",
                      "Target: one-to-one video visits linked to appointments and records.",
                      "$30/month modeled incremental Twilio usage for 125 two-person 30-minute visits; $150/month central usage reserve. BAA/account or other fees are not included in this usage estimate.",
                    ],
                    [
                      "Medication records and e-prescribing",
      "Jane supports medication lists/history, prescription chart templates and fax workflows. Jane describes direct U.S. e-prescribing as upcoming; charting/fax is not electronic pharmacy transmission.",
      "Medication records/templates are within the plan. Direct e-prescribing is not generally available in the sources reviewed; if a clinic needs it now, a separate vendor may be required, but no standard vendor or public price is established here.",
                      "Target: e-prescribing through a contracted network. Controlled-substance, pharmacy-network and prescriber enrollment coverage need definition.",
                      "Photon publishes $800/month centrally for up to 2,000 orders, then $0.80/order. No added base fee is modeled for a clinic within that tier; allocation, implementation and entity terms are unpriced/uncontracted.",
                    ],
                    [
                      "Quest/Labcorp order/result tracking",
                      "Jane connects to Fullscript for supplement plans and U.S. lab orders/results in supported states; Fullscript is separate and test charges vary.",
                      "Fullscript platform is marketed as free; lab panels/tests are charged separately. Lab ordering excludes patients in NY, NJ, RI, HI and offshore U.S. territories.",
                      "Target: orders and results linked to the chart. Exact catalog, state coverage, interface scope and launch partner are not established here.",
                      "No lab partner is contracted or budgeted. Comparator only: Healthie E-Labs lists $10/ordering provider/month ($30 for 3) + $5/non-NPI user, before Enterprise subscription, setup and tests; this is not a Meta quote.",
                    ],
                    [
                      "Insurance billing engine",
                      "Jane offers eligibility, claims, rejection handling, ERAs and payment posting through Insurance Billing + Claim.MD; the clearinghouse account is separate.",
                      "$20/month + $5/full-time or $2.50/part-time per additional provider license; Claim.MD charges are separate and not priced here. Optional for this cash-pay example.",
                      "Target: optional claims workflow for insurance-enabled clinics; not needed for the cash-pay scenario.",
                      "Candid is modeled at $1,500/month for the shared platform. This is an internal allowance, not a vendor quote; per-clinic, clearinghouse and entity fees are unknown.",
                    ],
                    [
                      "503A partner pharmacy orders/status",
                      "Jane has an integrations directory; exact compounding-pharmacy order/status support depends on the named partner and clinic setup.",
                      "No universal price can be stated without the selected pharmacy and clinic contract.",
                      "Target: partner-specific order/status connection subject to pharmacy selection, permitted data exchange and coverage.",
                      "No partner selected. Fixed and per-order cost is unknown; $0 in the budget means unpriced, not free.",
                    ],
                  ].map(([label, janeFeatures, janePrice, metaCoverage, metaCost]) => (
                    <TableRow key={label}>
                      <TableCell component="th" scope="row">
                        <I2eHelp label={label} />
                      </TableCell>
                      <TableCell>{janeFeatures}</TableCell>
                      <TableCell>
                        {janePrice}
                        {janeSources[label]?.map((source) => (
                          <small className="i2e-vendor-label" key={source.url}>
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {source.label}
                            </a>
                          </small>
                        ))}
                      </TableCell>
                      <TableCell>{metaCoverage}</TableCell>
                      <TableCell>
                        {metaCost}
                        <small className="i2e-vendor-label">
                          {metaCostSources[label]?.map(({ key, label: sourceLabel }) =>
                            vendorSources[key] ? (
                              <a
                                href={vendorSources[key].url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={vendorSources[key].basis}
                                key={key}
                              >
                                {` · ${sourceLabel}`}
                              </a>
                            ) : null,
                          )}
                        </small>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <p className="i2e-note">
              This compares published competitor pricing with Meta Clinic's
              modeled cost to deliver comparable workflows. Jane's three-provider
              subscription total depends on provider license hours. Hint Launch
              is an alternative full platform, not an assumed Jane add-on. Meta
              Clinic's {money(investorBudget.monthly)} shared monthly operating
              budget is detailed in Section 02; per-clinic cost allocation,
              implementation labor, payment volume, partner contracts and any
              unquoted or usage-based fees remain explicit unknowns.
            </p>
          </section>
          <section id="capital">
            <h2>02 / Meta Clinic cost to operate</h2>
            <p className="i2e-budget-intro">
              Shared one-time and monthly Meta Clinic operating-cost models.
              These include infrastructure for several target services, not a
              per-clinic invoice. The $1,500 insurance billing line is an
              optional central planning allowance; Candid has not quoted
              coverage for multiple independent owners.
            </p>
            <dl className="i2e-budget-summary">
              <div>
                <dt>One-time launch budget</dt>
                <dd>{money(investorBudget.upfront)}</dd>
              </div>
              <div>
                <dt>Central vendor stack / month</dt>
                <dd>
                  {money(investorBudget.monthly)}
                  <span> / month</span>
                </dd>
              </div>
            </dl>
            <div className="i2e-budget-table">
              <Grid
                label="Shared platform cost breakdown"
                headers={[
                  "What the budget covers",
                  "Central cost and added-clinic effect",
                  "Upfront",
                  "Monthly",
                ]}
              >
                {investorCosts.map((row, index) => (
                  <Fragment key={row.category}>
                    {[0, 4, 9].includes(index) && (
                      <TableRow className="i2e-budget-group">
                        <TableCell colSpan={4}>
                          {index === 0
                            ? "Launch setup"
                            : index === 4
                              ? "Central monthly vendor stack"
                              : "Partner-dependent services"}
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow>
                      <TableCell component="th" scope="row">
                        <I2eHelp label={row.category} />
                        {vendorSources[row.category] && (
                          <span className="i2e-budget-source">
                            <a
                              href={vendorSources[row.category].url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={vendorSources[row.category].basis}
                            >
                              {vendorSources[row.category].label} ↗
                            </a>
                            {row.category === "AI Clinical Scribe Engine" && (
                              <>
                                {" · "}
                                <a
                                  href="https://openrouter.ai/openai/gpt-5.6-luna"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  GPT-5.6 Luna pricing ↗
                                </a>
                                {" · "}
                                <a
                                  href="https://openrouter.ai/pricing/"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  OpenRouter fees ↗
                                </a>
                              </>
                            )}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{row.clinicBasis}</TableCell>
                      <TableCell align="right">
                        {row.category.startsWith("Diagnostic lab") ||
                        row.category === "Wholesale clinical lab orders"
                          ? "Unquoted"
                          : money(row.upfront)}
                      </TableCell>
                      <TableCell align="right">
                        {row.category.startsWith("Diagnostic lab")
                          ? "Unquoted"
                          : row.category === "Wholesale clinical lab orders"
                            ? "Per order"
                            : money(row.monthly)}
                      </TableCell>
                    </TableRow>
                  </Fragment>
                ))}
              </Grid>
            </div>
            <p className="i2e-note">
              $0 means no fixed amount budgeted, not that the service is free.
              The {money(investorBudget.monthly)} modeled monthly stack includes
              a $1,500 optional insurance-engine allowance (not a Candid quote),
              the $800 Photon plan, $150 video reserve,
              $110 modeled scribe allowance and $400 hosting allowance. Section
              01 shows the modeled $30 video and $30 scribe usage for its
              stated clinic assumptions; those are incremental usage estimates,
              not allocated shares of the shared stack. Final clinic cost
              allocation depends on contracts and usage. Lab middleware and
              per-order test costs are excluded. LegitScript's published $2,150
              annual fee is additional if approved.
            </p>
          </section>
          <section id="sales-deck">
            <h2>Sales deck / detailed market scenarios</h2>
            <Button href={salesDeckUrl}>Show deck</Button>
            <span className="i2e-note">Back returns to this workspace.</span>
          </section>
        </main>
      </div>
    </div>
  );
}
