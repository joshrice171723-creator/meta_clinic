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
import { clinicMarkets, janeProfiles } from "./i2eMarketData";

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
      "Pursue healthcare merchant certification where required to support payment and advertising access.",
    value:
      "Confirm application and annual fees; certification does not guarantee Stripe or other processor acceptance.",
  },
  {
    category: "Prescription Network API (eRx)",
    upfront: 0,
    monthly: 800,
    purpose:
      "Embed prescription routing through the proposed Photon Health integration, with medication-history and benefit-data scope confirmed in contracting.",
    value:
      "Retention: connected prescribing and external fulfillment. The assumed 2,000-order allowance, Surescripts access and real-time benefit checks require provider confirmation.",
  },
  {
    category: "Insurance billing engine",
    upfront: 0,
    monthly: 1500,
    purpose:
      "Integrate ANSI X12 837 claim workflows and clearinghouse submission through the proposed Candid Health API layer.",
    value:
      "Expand into hybrid clinics while keeping insurance optional for cash-pay practices.",
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
      "The Admin Killer: designed to reduce charting labor by up to three hours per day and strengthen adoption and retention. Time savings and adoption impact are pilot validation targets, not measured outcomes.",
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
                {header}
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
  baseline: 1354,
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
  const network = clinicEconomics(10, t.price);
  const spread = investorBudget.retail - investorBudget.wholesale;
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
                {name}
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
          <a href="#scaling">02 / Ten owners</a>
          <a href="#clinic-markets">03 / Clinic markets</a>
          <a href="#capital">04 / Vendor budget</a>
          <a href="#sales-deck">Sales deck</a>
        </nav>
        <main id="i2e-main">
          <section id="switching">
            <h1>01 / Medical weight loss + hormone optimization</h1>
            <p className="i2e-note">
              Conversion target: one independent practice · 3 providers · Jane
              customer with a separate clinical software stack · USD / month
            </p>
            <div className="i2e-conversion-grid">
              <div>
                <h2>Current software stack</h2>
                {ledger("Current Jane customer software stack", [
                  ["Jane Practice + 2 seats · assumption", "$149"],
                  ["Hint membership billing", "$870", "i2e-warning"],
                  ["HubSpot CRM", "$150", "i2e-warning"],
                  ["DoseSpot eRx seats", "$120", "i2e-warning"],
                  ["Jane AI Scribe · 3 seats", "$45", "i2e-warning"],
                  [
                    "Named add-ons subtotal",
                    money(t.namedAddons),
                    "i2e-warning",
                  ],
                  ["Unreconciled baseline allowance", "$20", "i2e-warning"],
                  [
                    "Working total software bill",
                    money(t.baseline),
                    "i2e-total",
                  ],
                ])}
                <p>
                  <strong>Conversion pain:</strong> Separate prescribing, lab,
                  membership and pharmacy handoffs. Target practices still
                  re-entering orders or faxing their compounding partner.
                </p>
                <p className="i2e-note">
                  Illustrative stack, not verified customer invoices. Named
                  items total $1,334; the supplied $1,354 baseline includes $20
                  not yet attributed. Jane Scribe is an add-on within Jane, not
                  a separate login.
                </p>
              </div>
              <div>
                <h2>Meta Clinic target offer</h2>
                {ledger("Meta Clinic target offer", [
                  ["Flat monthly platform fee", money(t.price), "i2e-total"],
                  ["Monthly software saving", money(savings)],
                  [
                    "Saving on working baseline",
                    `${((savings / t.baseline) * 100).toFixed(1)}%`,
                  ],
                  ["Annual recurring saving", money(savings * 12)],
                  ["Saving on named items only", "$234 / 17.5%"],
                  ["Price for exactly 20% off $1,354", "$1,083.20"],
                ])}
                <p>
                  <strong>Why switch:</strong> One clinical workspace connecting
                  charting, membership billing, prescribing, labs and
                  partner-order status. Replace verified workflows and their
                  invoices together.
                </p>
                <p>
                  <strong>Target bundle:</strong> Embedded 503A partner
                  webhooks, bidirectional Quest/Labcorp order/result tracking
                  and Twilio video. Integration scope, contracts and required
                  BAAs must be verified before these are sold as live
                  capabilities.
                </p>
                <p className="i2e-note">
                  Implementation, migration, overlap charges and usage limits
                  are quoted separately. Savings exclude labor. Jane already
                  offers charting, telehealth and membership options; compare
                  the clinic's actual stack, not missing features by assumption.{" "}
                  <a href="https://jane.app/pricing">Jane pricing</a>.
                </p>
              </div>
              <div>
                <h2>Account contribution ledger</h2>
                {ledger("Account contribution ledger", [
                  ...incrementalCosts.map(
                    (row) =>
                      [row.name, money(row.monthly)] as [string, ReactNode],
                  ),
                  [
                    "Incremental vendor estimate",
                    money(t.variable),
                    "i2e-total",
                  ],
                  [
                    "Software contribution",
                    `+${money(contribution)} / mo`,
                    "i2e-profit",
                  ],
                  [
                    "Contribution / subscription",
                    `${((contribution / t.price) * 100).toFixed(1)}%`,
                    "i2e-profit",
                  ],
                  [
                    "Illustrative spread / order",
                    `$120 − $45 = ${money(spread)}`,
                  ],
                  [
                    "30 orders × $75 gross spread",
                    `+${money(t.orders * spread)}`,
                    "i2e-profit",
                  ],
                ])}
                <p className="i2e-note">
                  $600 is incremental contribution before shared platform
                  expense, not net profit. This snapshot includes insurance
                  mapping; a cash-pay clinic with eRx models $440 vendor expense
                  and $660 contribution. No eRx: $245 cash-pay or $305
                  insurance, with video and scribe retained.
                </p>
                <p className="i2e-note">
                  The $2,250 transaction scenario is gross spread before
                  fulfillment, processing, refunds, tax and other costs. Order
                  volume and partner economics are unverified. It is separate
                  from the software-only network result.
                </p>
              </div>
            </div>
          </section>
          <section id="scaling">
            <h2>02 / Ten independent owners · ten separate clinics</h2>
            <Grid
              label="Ten independent owners scale ledger"
              headers={["Network metric", "Monthly amount / basis"]}
            >
              {[
                [
                  "Fixed upfront capital pool",
                  "$10,500 one-time · workstation, legal templates, certification and audit budgets",
                ],
                ["Central platform + first clinic", "$3,200 / mo"],
                ["Nine additional independent sites", "9 × $500 = $4,500 / mo"],
                ["Total network software costs", money(network.monthly)],
                [
                  "Total network software revenue",
                  "10 × $1,100 = $11,000 / mo",
                ],
                [
                  "Network software contribution",
                  `+${money(network.contribution)} / mo · ${((network.contribution / network.revenue) * 100).toFixed(0)}%`,
                ],
                ["Allocated expense / account", money(network.average)],
                [
                  "Allocated contribution / account",
                  `+${money(network.contribution / 10)}`,
                ],
              ].map(([name, value]) => (
                <TableRow
                  key={name}
                  className={name.includes("contribution") ? "i2e-profit" : ""}
                >
                  <TableCell component="th" scope="row">
                    {name}
                  </TableCell>
                  <TableCell>{value}</TableCell>
                </TableRow>
              ))}
            </Grid>
            <p className="i2e-note">
              The first clinic's vendor usage is included in the $3,200 base;
              only nine incremental bundles are added. Ten separate owners
              require separate tenant access, agreements and enrollment. +$3,300
              is modeled software contribution before unbudgeted expenses, not
              net cash flow or guaranteed profit. No compounding orders or labor
              savings are required for this result.
            </p>
          </section>
          <section id="clinic-markets">
            <h2>03 / Ten clinic markets · conversion priorities</h2>
            <Grid
              label="Ten clinic market scenarios"
              headers={[
                "Clinic specialty",
                "Model",
                "Small-clinic deck range / mo",
                "Reason to switch",
                "Required proof",
              ]}
            >
              {clinicMarkets.map((row) => (
                <TableRow key={row.name}>
                  <TableCell component="th" scope="row">
                    {row.name}
                  </TableCell>
                  <TableCell>{row.payment}</TableCell>
                  <TableCell>${row.prices[1]}</TableCell>
                  <TableCell>{row.switchReason}</TableCell>
                  <TableCell>{row.proof}</TableCell>
                </TableRow>
              ))}
            </Grid>
            <Grid
              label="Two Jane clinic profiles"
              headers={[
                "Jane profile",
                "Current bill to compare",
                "Conversion offer",
              ]}
            >
              {janeProfiles.map((row) => (
                <TableRow key={row.name}>
                  <TableCell component="th" scope="row">
                    {row.name}
                  </TableCell>
                  <TableCell>{row.current}</TableCell>
                  <TableCell>{row.offer}</TableCell>
                </TableRow>
              ))}
            </Grid>
            <p className="i2e-note">
              The $1,100 target is for the featured three-provider practice.
              Published specialty ranges are proposals, not universal quotes or
              proof of delivery readiness.
            </p>
          </section>
          <section id="capital">
            <h2>04 / Shared execution and vendor budget</h2>
            <Grid
              label="Fixed cost matrix"
              headers={["Category", "Upfront", "Monthly"]}
            >
              {investorCosts.map((row) => (
                <TableRow key={row.category}>
                  <TableCell component="th" scope="row">
                    {row.category}
                  </TableCell>
                  <TableCell align="right">{money(row.upfront)}</TableCell>
                  <TableCell align="right">{money(row.monthly)}</TableCell>
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
              </TableRow>
            </Grid>
            <p className="i2e-note">
              Planning allowances; vendor minimums, account fees, renewals and
              entity-specific charges require quotes. No funding ask or labor
              estimate is included.
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
