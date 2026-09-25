import { useEffect, useState, type ReactNode } from "react";
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
    purpose:
      "Provision a high-performance developer workstation and budget for multi-million-token AI API usage, model experimentation, execution and local orchestration.",
    value:
      "Engineering velocity: reduce hardware and compute bottlenecks. A 10x acceleration is a target, not a measured result; training and inference costs require separate scoping.",
  },
  {
    category: "Healthcare legal & contracts",
    upfront: 2000,
    monthly: 0,
    purpose:
      "Deploy a scalable Master Platform MSA and click-through BAA framework that defines platform, partner and clinic responsibilities.",
    value:
      "Counsel-reviewed contracts; statutory duties and malpractice exposure cannot simply be transferred away.",
  },
  {
    category: "DEA EPCS Compliance Audit",
    upfront: 2000,
    monthly: 0,
    purpose:
      "Establish the audit or certification coverage needed for controlled-substance e-prescribing, including provider identity and access requirements.",
    value:
      "Scope depends on the prescribing application and vendor coverage; this budget is not an approval.",
  },
  {
    category: "LegitScript certification",
    upfront: 1500,
    monthly: 0,
    purpose:
      "Pursue healthcare merchant certification where required. The $1,500 setup allowance exceeds the published $975 application fee; a $2,150 annual fee is due upon approval and is not in the monthly budget.",
    value:
      "Certification eligibility depends on the platform's role and services; approval does not guarantee processor acceptance.",
  },
  {
    category: "Prescription Network API (eRx)",
    upfront: 0,
    monthly: 800,
    purpose:
      "Embed prescription routing through the proposed Photon Health integration, with medication-history and benefit-data scope confirmed in contracting.",
    value:
      "Photon publishes $800 monthly for 2,000 orders on Launch, plus $0.80 per additional order. Network and benefit-data scope require provider confirmation.",
  },
  {
    category: "Insurance billing engine",
    upfront: 0,
    monthly: 1500,
    purpose:
      "Integrate ANSI X12 837 claim workflows and clearinghouse submission through the proposed Candid Health API layer.",
    value:
      "Expand into hybrid clinics while keeping insurance optional for cash-pay practices. The $1,500 monthly figure is a planning allowance, not a published Candid quote.",
  },
  {
    category: "HIPAA Telehealth Video API",
    upfront: 0,
    monthly: 150,
    purpose:
      "Consumption-based WebRTC consultations via Twilio Programmable Video, with a signed BAA required before PHI use. At $0.004 per participant-minute, 35,000 participant-minutes cost $140 before extras, within the $150 usage budget.",
    value:
      "Capital efficiency: pay-as-you-go video usage scales with consultations. Twilio HIPAA Accounts require Security or Enterprise Edition; account fees and BAA terms must be confirmed separately.",
  },
  {
    category: "AI Clinical Scribe Engine",
    upfront: 0,
    monthly: 350,
    purpose:
      "Audio streaming pipelines and medical LLM token processing, targeting 450–500 automated multi-system SOAP note drafts per month. Design targets will be verified during the pilot; clinicians review generated notes.",
    value:
      "The development scribe already routes through OpenRouter. An OpenAI GPT audio-capable model is planned for the pilot; model selection and usage costs remain to be validated.",
  },
  {
    category: "Security & HIPAA hosting",
    upfront: 0,
    monthly: 400,
    purpose:
      "Implement isolated hosting, access controls and audit infrastructure using an appropriate AWS HIPAA-eligible or Aptible configuration.",
    value:
      "Hosting eligibility supports the architecture; BAAs, safeguards and operating controls remain essential.",
  },
  {
    category: "B2B Compounding Labs & Diagnostics",
    upfront: 0,
    monthly: 0,
    purpose:
      "Build partner-order and result pipelines for diagnostic networks and licensed 503A pharmacies, with transaction-based economics.",
    value:
      "Quest/Labcorp and pharmacy partners are integration targets. No fixed platform fee is modeled; variable costs and terms require contracts.",
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
  retail: 120,
  wholesale: 45,
};

export const incrementalCosts = [
  {
    name: "eRx prescriber seats",
    monthly: 195,
    basis:
      "3 providers × $65; proposed wholesale rate, not a Photon/Surescripts quote.",
  },
  {
    name: "Twilio Video usage",
    monthly: 125,
    basis:
      "31,250 participant-minutes at $0.004; excludes account fees and extras.",
  },
  {
    name: "AI scribe processing",
    monthly: 120,
    basis:
      "Proposed incremental audio/token allowance; validate note length and model usage.",
  },
  {
    name: "Clearinghouse / entity mapping",
    monthly: 60,
    basis:
      "Proposed location allowance; independent entities may require separate enrollment and terms.",
  },
];
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
export function clinicEconomics(
  clinics: number,
  subscription = 0,
  allowance = 0,
  incremental = 500,
) {
  const monthly =
    investorBudget.monthly + (clinics - 1) * incremental + clinics * allowance;
  const revenue = clinics * subscription;
  const spread = investorBudget.retail - investorBudget.wholesale;
  return {
    monthly,
    average: monthly / clinics,
    revenue,
    contribution: revenue - monthly,
    orders: Math.ceil(monthly / spread),
    remainingOrders: Math.ceil(Math.max(0, monthly - revenue) / spread),
  };
}
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
      "OpenRouter route exists in development; $350/mo is a planning allowance for a future OpenAI GPT model.",
  },
};
const conversionVendorSources: Record<string, string> = {
  "Photon Health · proposed": "Prescription Network API (eRx)",
  "Twilio Programmable Video": "HIPAA Telehealth Video API",
  "Candid Health · proposed": "Insurance billing engine",
  "OpenRouter · OpenAI GPT planned": "AI Clinical Scribe Engine",
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
export const clinicServiceProfiles = [
  { name: "Cash-pay / no eRx", insurance: false, erx: false },
  { name: "Insurance / no eRx", insurance: true, erx: false },
  { name: "Cash-pay / with eRx", insurance: false, erx: true },
  { name: "Insurance / with eRx", insurance: true, erx: true },
];
export function incrementalForServices(insurance: boolean, erx: boolean) {
  return 125 + 120 + (insurance ? 60 : 0) + (erx ? 195 : 0);
}
export const conversionTarget = {
  baseline: 149 + 870 + 150 + 120 + 45,
  price: 1100,
  variable: 500,
  namedAddons: 870 + 150 + 120 + 45,
  orders: 30,
};
export function I2eInvestorPage() {
  const [showDeck, setShowDeck] = useState(false);
  const t = conversionTarget;
  const savings = t.baseline - t.price;
  const contribution = t.price - t.variable;
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
          <a href="#capital">02 / Vendor budget</a>
          <a href="#sales-deck">Sales deck</a>
        </nav>
        <main id="i2e-main">
          <section id="switching">
            <h1>01 / Medical weight loss + hormone optimization</h1>
            <p className="i2e-note">
              Conversion target: one independent practice · 3 providers · Jane
              customer with a separate clinical software stack · USD / month
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
                      "Our vendor cost / month",
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
                      "$195",
                      "Photon Health · proposed",
                    ],
                    [
                      "Jane AI Scribe · 3 seats",
                      "$45",
                      "AI note drafts + review",
                      "$120",
                      "OpenRouter · OpenAI GPT planned",
                    ],
                    [
                      "1:1 telehealth",
                      "Included in Jane",
                      "Video consultations",
                      "$125",
                      "Twilio Programmable Video",
                    ],
                    [
                      "Insurance billing engine",
                      "Add-on + clearinghouse · extra",
                      "Claims routing · planned",
                      "$60",
                      "Candid Health · proposed",
                    ],
                    [
                      "Quest/Labcorp order/result tracking",
                      "Via Fullscript · outside subtotal",
                      "Direct lab tracking · planned",
                      "Partner terms / usage",
                      "Quest / Labcorp · proposed",
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
                      {money(t.variable)} vendor cost estimate
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
            <p className="i2e-note">
              Proposed bundle within agreed usage limits; planned integrations
              depend on partner agreements and activation. Current-stack
              subtotal excludes insurance and clearinghouse fees. Our $500
              vendor cost estimate includes insurance mapping; shared platform
              costs, lab tests, medication purchases and payment processing are
              separate.
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
                ["Vendor cost / clinic", money(t.variable)],
                [
                  "Gross software profit / clinic",
                  `+${money(contribution)} / mo`,
                  "i2e-profit",
                ],
                [
                  "Gross software profit margin",
                  `${((contribution / t.price) * 100).toFixed(1)}%`,
                  "i2e-profit",
                ],
              ])}
            </div>
            <p className="i2e-note">
              Gross software profit before shared platform costs. Cash-pay with
              eRx: $440 vendor cost / $660 gross software profit. Subscription
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
            <h2>02 / Shared execution and vendor budget</h2>
            <Grid
              label="Fixed cost matrix"
              headers={["Category", "Upfront", "Monthly", "Published basis"]}
            >
              {investorCosts.map((row) => (
                <TableRow key={row.category}>
                  <TableCell component="th" scope="row">
                    <I2eHelp label={row.category} />
                  </TableCell>
                  <TableCell align="right">{money(row.upfront)}</TableCell>
                  <TableCell align="right">{money(row.monthly)}</TableCell>
                  <TableCell align="right">
                    {vendorSources[row.category] ? (
                      <>
                        {vendorSources[row.category].basis}{" "}
                        <a
                          href={vendorSources[row.category].url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {vendorSources[row.category].label}
                        </a>
                        {row.category === "AI Clinical Scribe Engine" && (
                          <>
                            {" · "}
                            <a
                              href="https://openrouter.ai/openai/gpt-4o-audio-preview"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              OpenAI audio model option
                            </a>
                          </>
                        )}
                      </>
                    ) : (
                      "Planning allowance"
                    )}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="i2e-total">
                <TableCell>Total shared budget</TableCell>
                <TableCell align="right">
                  {money(investorBudget.upfront)}
                </TableCell>
                <TableCell align="right">
                  {money(investorBudget.monthly)}
                </TableCell>
                <TableCell />
              </TableRow>
            </Grid>
            <p className="i2e-note">
              Estimated vendor budget; final pricing depends on usage and
              account terms. LegitScript's published $2,150 annual fee is
              additional if certification is approved.
            </p>
          </section>
          <section id="sales-deck">
            <h2>Sales deck / detailed market scenarios</h2>
            <Button
              href={salesDeckUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open published deck
            </Button>
            <Button onClick={() => setShowDeck(!showDeck)}>
              {showDeck ? "Hide deck" : "Show deck"}
            </Button>
            {showDeck && (
              <iframe
                title="Meta Clinic sales revenue deck"
                src={salesDeckUrl}
                className="i2e-deck-frame"
                loading="lazy"
              />
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
