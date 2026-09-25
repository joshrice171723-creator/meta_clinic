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
      "Shared Launch tier: 2,000 orders/month across the pilot. At four clinics, that is 500 orders each if usage is even; $0.80/order above the tier.",
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
      "Shared planning allowance, not a per-clinic quote. Clinic/entity enrollment and claim fees need a contract; cash-pay clinics may not use it.",
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
      "Shared usage pool: $150 covers about 625 two-person 30-minute visits, or 156 per clinic at four clinics, before extras.",
    purpose:
      "Consumption-based WebRTC consultations via Twilio Programmable Video, with a signed BAA required before PHI use. At $0.004 per participant-minute, 35,000 participant-minutes cost $140 before extras, within the $150 usage budget.",
    value:
      "Capital efficiency: pay-as-you-go video usage scales with consultations. Twilio HIPAA Accounts require Security or Enterprise Edition; account fees and BAA terms must be confirmed separately.",
  },
  {
    category: "AI Clinical Scribe Engine",
    upfront: 0,
    monthly: 350,
    clinicBasis:
      "Shared planning reserve. Four clinics at about 112–125 drafts each would use 450–500 drafts/month; actual model cost is unverified.",
    purpose:
      "Pilot-wide audio and medical LLM processing reserve. The 450–500 draft notes/month figure is an unverified aggregate design target across participating clinics, not a purchased tier or per-clinic capacity; clinicians review generated notes.",
    value:
      "The development scribe already routes through OpenRouter. An OpenAI GPT audio-capable model is planned for the pilot; model selection and usage costs remain to be validated.",
  },
  {
    category: "Security & HIPAA hosting",
    upfront: 0,
    monthly: 400,
    clinicBasis:
      "Shared hosting allowance; incremental storage, traffic and account costs are not yet quoted.",
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

export const pilotClinics = 4;
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
      "$150 usage budget at published $0.004/participant-minute; account edition and other charges are separate.",
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
      "OpenRouter documents API access, not a $350 price. The $350 is a shared usage planning reserve for four pilot clinics, conditional on measured note and model costs.",
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
  allocatedCost: investorBudget.monthly / pilotClinics,
  namedAddons: 870 + 150 + 120 + 45,
};
export function I2eInvestorPage() {
  const t = conversionTarget;
  const savings = t.baseline - t.price;
  const contribution = t.price - t.allocatedCost;
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
          <a href="#capital">02 / Shared platform costs</a>
          <a href="#sales-deck">Sales deck</a>
        </nav>
        <main id="i2e-main">
          <section id="switching">
            <h1>01 / Medical weight loss + hormone optimization</h1>
            <p className="i2e-note">
              Conversion target: one independent practice · 3 providers · Jane
              customer with a separate clinical software stack · cost and profit
              modeled within a four-clinic pilot · USD / month
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
                      "Our cost basis / month",
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
                      "Shared platform budget",
                      "Meta Clinic · shared infrastructure",
                    ],
                    [
                      "Hint membership billing",
                      "$870",
                      "Membership billing",
                      "Shared platform budget",
                      "Meta Clinic · Stripe payment rails",
                    ],
                    [
                      "HubSpot CRM",
                      "$150",
                      "Patient pipeline + follow-up",
                      "Shared platform budget",
                      "Meta Clinic · native CRM",
                    ],
                    [
                      "DoseSpot eRx seats",
                      "$120",
                      "Embedded eRx · planned",
                      "In shared Photon tier",
                      "Photon Health · proposed",
                    ],
                    [
                      "Jane AI Scribe · 3 seats",
                      "$45",
                      "AI note drafts + review",
                      "In shared pilot reserve",
                      "OpenRouter · OpenAI GPT planned",
                    ],
                    [
                      "1:1 telehealth",
                      "Included in Jane",
                      "Video consultations",
                      "Metered within shared pool",
                      "Twilio Programmable Video",
                    ],
                    [
                      "Insurance billing engine",
                      "Add-on + clearinghouse · extra",
                      "Claims routing · planned",
                      "In shared Candid allowance",
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
                          Included in ours
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
                      {money(t.allocatedCost)} allocated at {pilotClinics}{" "}
                      clinics
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
            <p className="i2e-note">
              Proposed bundle within agreed usage limits; planned integrations
              depend on partner agreements and activation. Current-stack
              subtotal excludes insurance and clearinghouse fees. Our cost
              column allocates the $3,200 shared monthly budget across four
              pilot clinics; it does not add unquoted per-clinic fees. Lab
              connectivity, lab tests, medication purchases, payment processing,
              vendor overages and entity enrollment are separate.
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
              {ledger("Account cost and profit", [
                [
                  "Shared vendor cost / clinic at 4 pilots",
                  money(t.allocatedCost),
                ],
                [
                  "Modeled gross profit / clinic at 4 pilots",
                  `+${money(contribution)} / mo`,
                  "i2e-profit",
                ],
                [
                  "Modeled gross profit margin at 4 pilots",
                  `${((contribution / t.price) * 100).toFixed(1)}%`,
                  "i2e-profit",
                ],
              ])}
            </div>
            <p className="i2e-note">
              Four clinics paying $1,100 each bring in $4,400/month against the
              $3,200 shared vendor budget, leaving $1,200/month before excluded
              costs. At one clinic, the full shared budget still applies.
              Four-clinic capacity depends on scribe usage and vendor contracts;
              it is a planning case, not a guaranteed limit. Subscription
              savings exclude implementation and usage overages.{" "}
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
            <h2>02 / Shared platform costs</h2>
            <p className="i2e-budget-intro">
              What Meta Clinic budgets once to launch and each month to run the
              common platform. Four independently owned, three-provider clinics
              are the pilot planning case: $3,200 / 4 = $800 of shared cost
              allocated per clinic. The clinic-by-clinic column shows the usage
              this case assumes. It is not evidence that every vendor will serve
              four entities at the listed price.
            </p>
            <dl className="i2e-budget-summary">
              <div>
                <dt>One-time launch budget</dt>
                <dd>{money(investorBudget.upfront)}</dd>
              </div>
              <div>
                <dt>Shared monthly vendor stack</dt>
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
                  "Clinic-by-clinic effect",
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
                              ? "Shared monthly base + clinic usage"
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
              The $3,200 monthly total is the shared base for the four-clinic
              planning case. Clinic-level usage in the second column is within
              that base, not an extra charge. Final pricing depends on contracts
              and usage. Lab middleware and per-order test costs are excluded.
              LegitScript's published $2,150 annual fee is additional if
              certification is approved.
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
