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
      "Central monthly platform allowance, paid before a clinic joins. Incremental entity enrollment or claim fees remain unquoted; cash-pay clinics do not need claims routing.",
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
    monthly: 350,
    clinicBasis:
      "Central $350 planning reserve; $120 of additional audio/model usage is estimated for one added clinic. Actual usage remains unverified.",
    purpose:
      "Central reserve for audio and medical LLM processing. No note count is guaranteed at this price; clinicians review generated drafts.",
    value:
      "The development scribe already routes through OpenRouter. An OpenAI GPT audio-capable model is planned for the pilot; model selection and usage costs remain to be validated.",
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
export const addedClinicUsage = { video: 30, scribe: 120 };
export const stackCosts = [
  {
    name: "Base EMR & calendar",
    cost: 149,
    basis: "Brief assumption: Practice + 2 additional seats.",
    meta: "Shared clinic core: scheduling, charting and billing.",
  },
  {
    name: "Membership & billing infrastructure",
    cost: 890,
    basis:
      "Brief assumption: $290 × 3 + $20. Not a verified Hint quote; Jane's extra-provider insurance fees may also apply.",
    meta: "Membership workflow plus a planned claims integration. Candid is not a replacement for every Hint capability.",
  },
  {
    name: "Medical CRM & patient nurturing",
    cost: 150,
    basis: "Illustrative separate CRM subscription.",
    meta: "Patient outreach and follow-up in the clinic workspace.",
  },
  {
    name: "eRx & retail pharmacy links",
    cost: 120,
    basis: "Illustrative 3 × $40 standalone seats; provider quote required.",
    meta: "Embedded prescribing strategy using a contracted eRx provider.",
  },
  {
    name: "AI clinical scribe",
    cost: 45,
    basis: "3 × $15 Jane Scribe seats at published pricing.",
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
      "$1,500/mo planning allowance; linked product page does not publish that price.",
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
    url: "https://openrouter.ai/docs/quickstart",
    label: "OpenRouter API",
    basis:
      "OpenRouter documents API access, not pricing for this workload. $350 is the central monthly reserve; $120 is estimated additional usage for one new clinic, pending measurement.",
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
const conversionVendorSources: Record<string, string> = {
  "Photon Health · proposed": "Prescription Network API (eRx)",
  "Twilio Programmable Video": "HIPAA Telehealth Video API",
  "Candid Health · proposed": "Insurance billing engine",
  "OpenRouter · OpenAI GPT planned": "AI Clinical Scribe Engine",
  "Lab middleware · proposed": "Diagnostic lab connectivity (Quest / Labcorp)",
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
export const conversionTarget = {
  baseline: 149 + 870 + 150 + 120 + 45,
  price: 1100,
  vendorCost: addedClinicUsage.video + addedClinicUsage.scribe,
  namedAddons: 870 + 150 + 120 + 45,
};
export function I2eInvestorPage() {
  const t = conversionTarget;
  const savings = t.baseline - t.price;
  const contribution = t.price - t.vendorCost;
  useEffect(() => {
    const title = document.title;
    document.title = "Meta Clinic × i2E | Customer conversion workspace";
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex,nofollow";
    document.head.appendChild(robots);
    return () => {
      document.title = title;
      robots.remove();
    };
  }, []);
  const ledger = (label: string, rows: [string, ReactNode, string?][]) => (
    <TableContainer className="i2e-ledger">
      <Table size="small" aria-label={label}>
        <TableBody>
          {rows.map(([name, value, tone]) => (
            <TableRow key={name} className={tone || ""}>
              <TableCell component="th" scope="row">
                <I2eHelp label={name} />
              </TableCell>
              <TableCell align="right">{value}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
  return (
    <div className="i2e-page i2e-console">
      <header className="i2e-header">
        <a href="/meta-clinic" className="i2e-brand">
          m. <span>Meta Clinic</span>
        </a>
        <span>i2E / CUSTOMER CONVERSION WORKSPACE</span>
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
          <a href="#switching">01 / Conversion target</a>
          <a href="#potential-revenue">Other potential revenue</a>
          <a href="#capital">02 / Central operating budget</a>
          <a href="#sales-deck">Sales deck</a>
        </nav>
        <main id="i2e-main">
          <section id="switching">
            <h1>01 / Medical weight loss + hormone optimization</h1>
            <p className="i2e-note">
              Conversion target: one additional independent cash-pay weight-loss
              practice · 3 providers · existing central vendor stack already
              paid · incremental costs and revenue · USD / month
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
                      "Capability / current tool",
                      "Current stack / month",
                      "Our bundle",
                      "Included workflow",
                      "Added clinic cost / month",
                    ].map((header) => (
                      <TableCell key={header}>{header}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {[
                    [
                      "Jane Practice + 2 seats",
                      "$149",
                      "Scheduling + charting",
                      "Covered by central hosting",
                      "Meta Clinic · shared infrastructure",
                    ],
                    [
                      "Hint membership billing",
                      "$870",
                      "Membership billing",
                      "No separate vendor fee budgeted",
                      "Meta Clinic · Stripe payment rails",
                    ],
                    [
                      "HubSpot CRM",
                      "$150",
                      "Patient pipeline + follow-up",
                      "No separate vendor fee budgeted",
                      "Meta Clinic · native CRM",
                    ],
                    [
                      "DoseSpot eRx seats",
                      "$120",
                      "Embedded eRx · planned",
                      "Within central Photon tier",
                      "Photon Health · proposed",
                    ],
                    [
                      "Jane AI Scribe · 3 seats",
                      "$45",
                      "AI note drafts + review",
                      "$120 added usage estimate",
                      "OpenRouter · OpenAI GPT planned",
                    ],
                    [
                      "1:1 telehealth",
                      "Included in Jane",
                      "Video consultations",
                      "$30 added video usage",
                      "Twilio Programmable Video",
                    ],
                    [
                      "Insurance billing engine",
                      "Add-on + clearinghouse · extra",
                      "Claims routing · planned",
                      "Central billing engine · added fees unquoted",
                      "Candid Health · proposed",
                    ],
                    [
                      "Quest/Labcorp order/result tracking",
                      "Via Fullscript · outside subtotal",
                      "Direct lab tracking · planned",
                      "Connectivity quote + test costs",
                      "Lab middleware · proposed",
                    ],
                    [
                      "503A partner webhooks",
                      "Partner workflow · outside subtotal",
                      "Partner order + status · planned",
                      "Partner terms / usage",
                      "Compounding pharmacy · to be selected",
                    ],
                  ].map(([label, current, scope, cost, vendor]) => (
                    <TableRow key={label}>
                      <TableCell component="th" scope="row">
                        <I2eHelp label={label} />
                      </TableCell>
                      <TableCell
                        className={
                          ["$870", "$150", "$120", "$45"].includes(current)
                            ? "i2e-warning-cell"
                            : ""
                        }
                      >
                        {current}
                      </TableCell>
                      <TableCell>
                        <strong className="i2e-included">
                          {label === "Insurance billing engine"
                            ? "Optional add-on"
                            : "Included in ours"}
                        </strong>
                      </TableCell>
                      <TableCell>{scope}</TableCell>
                      <TableCell>
                        {cost}
                        <small className="i2e-vendor-label">
                          <I2eHelp label={vendor} />
                          {vendorSources[conversionVendorSources[vendor]] && (
                            <>
                              {" · "}
                              <a
                                href={
                                  vendorSources[conversionVendorSources[vendor]]
                                    .url
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Source
                              </a>
                            </>
                          )}
                        </small>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="i2e-total">
                    <TableCell component="th" scope="row">
                      <I2eHelp label="Total software bill" />
                    </TableCell>
                    <TableCell>
                      {money(t.baseline)} listed subscriptions
                    </TableCell>
                    <TableCell>{money(t.price)} bundled</TableCell>
                    <TableCell>3-provider practice</TableCell>
                    <TableCell>
                      {money(t.vendorCost)} modeled added-clinic usage
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
            <p className="i2e-note">
              Proposed bundle within agreed usage limits; planned integrations
              depend on partner agreements and activation. Current-stack
              subtotal excludes insurance and clearinghouse fees. The $3,200
              central monthly stack in Section 02 is already paid before this
              clinic joins. Adding this clinic is modeled at $30 video usage
              plus a $120 scribe allowance. No second Photon, Candid or hosting
              subscription is added within contracted capacity. Entity
              enrollment, vendor overages, lab connectivity, lab tests,
              medication purchases and payment processing are separate.
            </p>
            <div className="i2e-summary-ledgers">
              {ledger("Meta Clinic target offer", [
                ["Flat monthly platform fee", money(t.price), "i2e-total"],
                ["Monthly software saving", money(savings)],
                [
                  "Software cost reduction",
                  `${((savings / t.baseline) * 100).toFixed(1)}%`,
                ],
                ["Annual recurring saving", money(savings * 12)],
              ])}
              {ledger("Added-clinic cost and profit", [
                ["Added clinic vendor cost / month", money(t.vendorCost)],
                [
                  "Profit after modeled added costs / month",
                  `+${money(contribution)} / mo`,
                  "i2e-profit",
                ],
                [
                  "Profit margin after modeled added costs",
                  `${((contribution / t.price) * 100).toFixed(1)}%`,
                  "i2e-profit",
                ],
              ])}
            </div>
            <p className="i2e-note">
              The $950 is the new clinic's subscription minus its modeled $150
              added usage, after the $3,200 central monthly stack has already
              been funded. It is not whole-platform net profit; unquoted
              enrollment, overages and other transaction costs can reduce it.
              Subscription savings exclude implementation and usage overages.{" "}
              <a href="https://jane.app/pricing">Jane pricing</a>.
            </p>
          </section>
          <section id="potential-revenue">
            <h2>Other potential revenue</h2>
            <Grid
              label="Other potential revenue"
              headers={[
                "Revenue opportunity",
                "Illustrative economics",
                "Commercial basis",
              ]}
            >
              <TableRow>
                <TableCell component="th" scope="row">
                  <I2eHelp label="Pharmacy partner economics" />
                </TableCell>
                <TableCell>
                  Pricing and revenue share to be negotiated.
                </TableCell>
                <TableCell>
                  Potential share of partner transaction economics, subject to
                  agreements. The full spread is not automatically Meta Clinic
                  revenue.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell component="th" scope="row">
                  <I2eHelp label="2% platform fee via Stripe" />
                </TableCell>
                <TableCell>
                  2% of eligible payment volume. Example: $72,741 processed × 2%
                  = $1,454.82 gross platform fees.
                  <p className="i2e-note">
                    <strong>Weight-loss clinic benchmark:</strong>{" "}
                    Medi-Weightloss's 2025 Franchise Disclosure Document reports
                    2024 average monthly gross sales of $72,741 for 73 clinics
                    open more than two years; the median was $59,487. This is
                    per clinic, not per provider, and is not a national or
                    cash-only average. At $72,741 in eligible monthly payments,
                    a proposed 2% fee would generate $1,454.82 in gross platform
                    fees before payment costs. Actual fees depend on eligible
                    payments processed through the platform.{" "}
                    <a
                      href="https://pdfindx-51ec5d045801.herokuapp.com/get_pdf/NbxH2YWhNbxH2YWhNbxH2YWh#page=66"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Source: Medi-Weightloss 2025 FDD, Item 19, page 60
                    </a>
                    .
                  </p>
                </TableCell>
                <TableCell>
                  Proposed Meta Clinic application fee collected through Stripe
                  Connect, separate from Stripe processing charges and any
                  Stripe revenue-sharing agreement.
                </TableCell>
              </TableRow>
            </Grid>
            <p className="i2e-note">
              Illustrative opportunities, excluded from subscription
              contribution. Net proceeds depend on partner terms, payment costs,
              fulfillment, refunds and taxes. A payment-volume fee would be an
              additional clinic expense beyond the software subscription
              comparison.{" "}
              <a href="https://stripe.com/connect/pricing">
                Stripe Connect pricing
              </a>
              .
            </p>
          </section>
          <section id="capital">
            <h2>02 / Central operating budget</h2>
            <p className="i2e-budget-intro">
              What Meta Clinic budgets once to launch and each month to run the
              platform before adding the clinic in Section 01. The $1,500
              insurance billing allowance is one central monthly vendor line,
              not a charge for each new clinic.
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
                                  href="https://openrouter.ai/openai/gpt-4o-audio-preview"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  OpenAI audio option ↗
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
              The $3,200 monthly stack includes the $1,500 insurance engine,
              $800 Photon plan, $150 video reserve, $350 scribe reserve and $400
              hosting allowance. The $150 added-clinic estimate in Section 01 is
              incremental usage on top of this base, not a second base
              subscription. Final pricing depends on contracts and usage. Lab
              middleware and per-order test costs are excluded. LegitScript's
              published $2,150 annual fee is additional if approved.
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
