import { useEffect, useState } from "react";
import {
  Button,
  Slider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableFooter,
  TableSortLabel,
} from "@mui/material";
import ArrowOutwardRounded from "@mui/icons-material/ArrowOutwardRounded";
import PrintOutlined from "@mui/icons-material/PrintOutlined";
import "./i2e-investor.css";

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
const sources = [
  ["Jane / U.S. pricing", "https://jane.app/pricing"],
  [
    "Jane / medical & lab workflows",
    "https://jane.app/guide/medical-wellness-hub",
  ],
  [
    "Jane / reported financing & ARR",
    "https://betakit.com/jane-software-to-be-reportedly-valued-at-1-8-billion-in-upcoming-secondary-financing/",
  ],
  [
    "Photon / Amazon Pharmacy",
    "https://blog.photon.health/amazon-pharmacy-and-photon-collaborate-to-improve-transparency-and-access-for-patients/",
  ],
  [
    "HHS / business associate liability",
    "https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/business-associates/factsheet/index.html",
  ],
  [
    "DEA / EPCS requirements",
    "https://www.deadiversion.usdoj.gov/faq/epcs-faq.html",
  ],
  [
    "LegitScript / certification",
    "https://www.legitscript.com/certification/healthcare-certification/faq/",
  ],
  [
    "FDA / compounding",
    "https://www.fda.gov/drugs/human-drug-compounding/compounding-and-fda-questions-and-answers",
  ],
];
function Anchor({ children }: { children: string }) {
  return (
    <span className="i2e-anchor" aria-hidden="true">
      {children}
    </span>
  );
}

export function I2eInvestorPage() {
  const [months, setMonths] = useState(6);
  const [clinics, setClinics] = useState(4);
  const { capital, upfront, monthly, retail, wholesale } = investorBudget;
  const runway = (capital - upfront) / monthly;
  const spread = retail - wholesale;
  const orders = Math.ceil(monthly / spread);
  const [sort, setSort] = useState<"category" | "upfront" | "monthly">(
    "category",
  );
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const rows = [...investorCosts].sort((a, b) => {
    const comparison =
      sort === "category"
        ? a.category.localeCompare(b.category)
        : a[sort] - b[sort];
    return direction === "asc" ? comparison : -comparison;
  });
  const changeSort = (key: typeof sort) => {
    setDirection(sort === key && direction === "asc" ? "desc" : "asc");
    setSort(key);
  };
  useEffect(() => {
    const title = document.title;
    document.title = "Meta Clinic × i2E | Clinical transaction strategy";
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
    <div className="i2e-page">
      <a className="i2e-skip" href="#i2e-main">
        Skip to investment overview
      </a>
      <header className="i2e-header">
        <a href="/meta-clinic" className="i2e-brand">
          <span aria-hidden="true">m.</span>Meta Clinic
        </a>
        <nav aria-label="Investor navigation">
          <a href="#positioning">Positioning</a>
          <a href="#capital">Capital</a>
          <a href="#supply-chain">Supply chain</a>
          <a href="#roadmap">Milestones</a>
        </nav>
        <Button
          className="i2e-print"
          startIcon={<PrintOutlined />}
          onClick={() => window.print()}
        >
          Print brief
        </Button>
      </header>
      <main id="i2e-main">
        <section className="i2e-hero">
          <div>
            <h1>
              The operating system
              <br />
              for <em>clinical commerce.</em>
            </h1>
            <p className="i2e-lead">
              Connect the clinic day to the transactions behind it:
              prescriptions, diagnostics, claims and fulfillment in one
              coordinated workspace.
            </p>
            <div className="i2e-hero-actions">
              <Button
                variant="contained"
                disableElevation
                href="/demo"
                endIcon={<ArrowOutwardRounded />}
              >
                Explore the product demo
              </Button>
              <span>Strategy briefing prepared for i2E</span>
            </div>
          </div>
          <aside className="i2e-intro">
            <h2>
              Build once.
              <br />
              Scale with clinic activity.
            </h2>
            <p>
              Our strategy combines a shared care-delivery core with embedded
              service integrations and transaction-linked revenue.
            </p>
            <dl>
              <div>
                <dt>Initial market</dt>
                <dd>Concierge, wellness & med spas</dd>
              </div>
              <div>
                <dt>Distribution</dt>
                <dd>Repeatable clinic onboarding</dd>
              </div>
              <div>
                <dt>Economic engine</dt>
                <dd>Software + transaction margin</dd>
              </div>
            </dl>
          </aside>
        </section>
        <dl className="i2e-metrics" aria-label="Funding plan">
          <div>
            <dt>Funding ask</dt>
            <dd>{money(capital)}</dd>
          </div>
          <div>
            <dt>Upfront execution</dt>
            <dd>{money(upfront)}</dd>
          </div>
          <div>
            <dt>Fixed vendor stack</dt>
            <dd>
              {money(monthly)}
              <small> / mo</small>
            </dd>
          </div>
          <div>
            <dt>Modeled operating runway</dt>
            <dd>
              {runway.toFixed(2)}
              <small> months</small>
            </dd>
          </div>
        </dl>
        <section id="positioning">
          <div className="i2e-section-heading">
            <h2>
              <Anchor>↔️</Anchor>Compete on the whole clinical transaction.
            </h2>
            <p>
              A focused strategy against an established practice-management
              platform.
            </p>
          </div>
          <div className="i2e-comparison">
            <article>
              <h3>
                Jane App <span>Established platform</span>
              </h3>
              <p className="i2e-statement">
                Practice management
                <br />
                with an integration ecosystem.
              </p>
              <dl>
                <div>
                  <dt>Core offering</dt>
                  <dd>
                    Scheduling, charting, payments and insurance workflows.
                  </dd>
                </div>
                <div>
                  <dt>U.S. base pricing</dt>
                  <dd>
                    $54 Balance / $79 Practice / $99 Thrive per month;
                    practitioner and feature charges apply.
                  </dd>
                </div>
                <div>
                  <dt>Connected services</dt>
                  <dd>
                    Insurance add-on starts at $20/mo; Claim.MD clearinghouse
                    account is separate. Fullscript supports lab ordering.
                  </dd>
                </div>
                <div>
                  <dt>The buying question</dt>
                  <dd>
                    What is the total cost and workflow effort across the
                    clinic's full service stack?
                  </dd>
                </div>
              </dl>
              <p className="i2e-note">
                Category scale: BetaKit reported a $1.8B valuation and $100M ARR
                milestone in 2025. Historical reporting, not a current valuation
                or a Meta Clinic comparable; currencies are not normalized here.{" "}
                <a href={sources[2][1]}>Read report</a>.
              </p>
            </article>
            <article>
              <h3>
                Meta Clinic <span>Our strategic advantage</span>
              </h3>
              <p className="i2e-statement">
                Unify the workflow.
                <br />
                <em>Participate in the transaction.</em>
              </p>
              <dl>
                <div>
                  <dt>Architecture</dt>
                  <dd>
                    One clinic workflow spanning care, orders, billing,
                    fulfillment and reconciliation.
                  </dd>
                </div>
                <div>
                  <dt>Integration strategy</dt>
                  <dd>
                    Embed eRx, diagnostic and clearinghouse services behind a
                    shared operating experience.
                  </dd>
                </div>
                <div>
                  <dt>Revenue strategy</dt>
                  <dd>
                    Combine recurring software revenue with transaction
                    economics where the commercial structure permits.
                  </dd>
                </div>
                <div>
                  <dt>Defensibility to build</dt>
                  <dd>
                    Repeatable onboarding, reliable handoffs and operational
                    depth that grows with clinic activity.
                  </dd>
                </div>
              </dl>
              <p className="i2e-note">
                Target architecture and commercial strategy. Named provider
                connections and transaction revenue are not represented as live.
                Current Jane feature and pricing references:{" "}
                <a href={sources[0][1]}>pricing</a> /{" "}
                <a href={sources[1][1]}>medical workflows</a>.
              </p>
            </article>
          </div>
        </section>
        <section id="capital">
          <div className="i2e-section-heading">
            <h2>
              <Anchor>⚖️</Anchor>Capital into execution.
            </h2>
            <p>
              USD budget model. Amounts retain the founder's estimates; they are
              not vendor quotes.
            </p>
          </div>
          <div className="i2e-capital-grid">
            <div className="i2e-budget-summary">
              <h3>{Math.floor(runway)} full months of modeled operations</h3>
              <p className="i2e-statement">
                {money(capital - upfront)}
                <br />
                <small>allocated to operations</small>
              </p>
              <p>
                {money(capital)} funds {money(upfront)} in upfront work, leaving{" "}
                {money(capital - upfront)} against a {money(monthly)} monthly
                vendor stack.
              </p>
              <p className="i2e-formula">
                {money(capital - upfront)} ÷ {money(monthly)} ={" "}
                {runway.toFixed(2)} months
              </p>
              <label id="i2e-months-label">
                Operating period <b>{months} months</b>
              </label>
              <Slider
                aria-labelledby="i2e-months-label"
                min={1}
                max={12}
                step={1}
                value={months}
                onChange={(_, value) => setMonths(value as number)}
                valueLabelDisplay="auto"
              />
              <dl>
                <div>
                  <dt>Operating expenses</dt>
                  <dd aria-live="polite">{money(monthly * months)}</dd>
                </div>
                <div>
                  <dt>Upfront + operating</dt>
                  <dd>{money(upfront + monthly * months)}</dd>
                </div>
              </dl>
              <p className="i2e-note">
                {Math.floor(runway)} full months of the listed fixed costs,
                assuming no revenue and unchanged rates. Founder pay,
                acquisition, support, taxes, variable usage and renewal fees are
                excluded; this is not guaranteed company runway.
              </p>
            </div>
            <div className="i2e-matrix">
              <h3>Fixed cost data table</h3>
              <TableContainer
                tabIndex={0}
                role="region"
                aria-label="Scrollable fixed cost data table"
              >
                <Table size="small" aria-label="Fixed cost estimates">
                  <TableHead>
                    <TableRow>
                      {(
                        [
                          ["category", "Investment / purpose"],
                          ["upfront", "Upfront"],
                          ["monthly", "Monthly"],
                        ] as const
                      ).map(([key, label]) => (
                        <TableCell
                          key={key}
                          align={key === "category" ? "left" : "right"}
                          sortDirection={sort === key ? direction : false}
                        >
                          <TableSortLabel
                            active={sort === key}
                            direction={sort === key ? direction : "asc"}
                            onClick={() => changeSort(key)}
                          >
                            {label}
                          </TableSortLabel>
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.category}>
                        <TableCell component="th" scope="row">
                          <strong>{row.category}</strong>
                          <p>{row.purpose}</p>
                          <small>{row.value}</small>
                        </TableCell>
                        <TableCell align="right" className="i2e-upfront">
                          {money(row.upfront)}
                        </TableCell>
                        <TableCell align="right" className="i2e-recurring">
                          {money(row.monthly)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell>All planned costs</TableCell>
                      <TableCell align="right">{money(upfront)}</TableCell>
                      <TableCell align="right">{money(monthly)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </TableContainer>
              <p className="i2e-note">
                Telehealth pricing reference:{" "}
                <a href="https://www.twilio.com/en-us/video/pricing">
                  Twilio Video pricing
                </a>
                . The $150 models video usage only; recording, transcription,
                storage, taxes and applicable account fees are excluded. Confirm{" "}
                <a href="https://www.twilio.com/docs/iam/twilio-editions/hippa">
                  HIPAA Account and BAA terms
                </a>
                . Participant-minutes count each connected participant
                separately.
              </p>
            </div>
          </div>
        </section>
        <section id="supply-chain">
          <div className="i2e-section-heading">
            <h2>
              <Anchor>📦</Anchor>Two fulfillment paths. One transaction layer.
            </h2>
            <p>
              Target automated flows. Integration activation follows provider
              contracts and verified implementation.
            </p>
          </div>
          <div className="i2e-flow-grid">
            <article>
              <h3>Flow A / Commercial retail</h3>
              <ol className="i2e-flow">
                <li>
                  <span>01</span>
                  <div>
                    <strong>Care team writes order</strong>
                    <p>Prescription originates in the clinic workflow.</p>
                  </div>
                </li>
                <li>
                  <span>02</span>
                  <div>
                    <strong>Photon API routes prescription</strong>
                    <p>Target embedded prescribing and routing layer.</p>
                  </div>
                </li>
                <li>
                  <span>03</span>
                  <div>
                    <strong>Amazon Pharmacy fulfills</strong>
                    <p>
                      Illustrative destination; patient choice and network
                      availability apply.
                    </p>
                  </div>
                </li>
              </ol>
              <p className="i2e-flow-result">
                No inventory ownership in this modeled retail flow.
              </p>
              <p className="i2e-note">
                Photon's Amazon Pharmacy collaboration is documented; Meta
                Clinic connectivity is a target.{" "}
                <a href={sources[3][1]}>Provider announcement</a>.
              </p>
            </article>
            <article>
              <h3>Flow B / Specialty compounding</h3>
              <ol className="i2e-flow">
                <li>
                  <span>01</span>
                  <div>
                    <strong>
                      Clinician selects an appropriate formulation
                    </strong>
                    <p>
                      Patient-specific prescription and legally permissible
                      ingredients.
                    </p>
                  </div>
                </li>
                <li>
                  <span>02</span>
                  <div>
                    <strong>Platform routes to a licensed 503A pharmacy</strong>
                    <p>
                      Target order, fulfillment and reconciliation webhooks.
                    </p>
                  </div>
                </li>
                <li>
                  <span>03</span>
                  <div>
                    <strong>Reconcile supplier cost and customer charge</strong>
                    <p>
                      Illustrative structure: $45 wholesale cost / $120 retail
                      charge.
                    </p>
                  </div>
                </li>
              </ol>
              <div className="i2e-spread">
                <span>
                  $120<small>Retail charge</small>
                </span>
                <b>−</b>
                <span>
                  $45<small>Supplier cost</small>
                </span>
                <b>=</b>
                <span>
                  $75<small>Gross spread</small>
                </span>
              </div>
              <p className="i2e-note">
                Core transaction-margin hypothesis, before shipping, payment
                fees, refunds and service costs. Meta Clinic's right to collect
                or retain this spread depends on the agreed entity, pharmacy and
                payment structure. Compounding is not general manufacturing or
                blanket peptide authorization.{" "}
                <a href={sources[7][1]}>FDA reference</a>.
              </p>
            </article>
          </div>
        </section>
        <section id="discussion">
          <div className="i2e-section-heading">
            <h2>
              <Anchor>📊</Anchor>A small cohort can test the economics.
            </h2>
            <p>Fixed-stack coverage model. Gross spread is not net profit.</p>
          </div>
          <div className="i2e-economics">
            <div>
              <p className="i2e-statement">{orders} orders per month.</p>
              <p>
                At {money(spread)} gross spread per order, {orders} orders
                generate {money(orders * spread)} before other costs — covering
                the modeled fixed vendor stack.
              </p>
              <label id="i2e-clinics-label">
                Pilot clinics <b>{clinics}</b>
              </label>
              <Slider
                aria-labelledby="i2e-clinics-label"
                min={1}
                max={10}
                step={1}
                value={clinics}
                onChange={(_, value) => setClinics(value as number)}
                valueLabelDisplay="auto"
              />
              <p className="i2e-formula" aria-live="polite">
                {Math.ceil(orders / clinics)} orders per clinic / month at{" "}
                {clinics} clinics
              </p>
            </div>
            <div className="i2e-matrix">
              <TableContainer
                tabIndex={0}
                role="region"
                aria-label="Scrollable pilot economics"
              >
                <Table aria-label="Pilot clinic cost coverage">
                  <TableHead>
                    <TableRow>
                      <TableCell>Pilot clinics</TableCell>
                      <TableCell align="right">Orders / clinic / mo</TableCell>
                      <TableCell align="right">Gross spread / mo</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {[3, 4].map((count) => (
                      <TableRow key={count}>
                        <TableCell component="th" scope="row">
                          {count} clinics
                        </TableCell>
                        <TableCell align="right">
                          {Math.ceil(orders / count)}
                        </TableCell>
                        <TableCell align="right">
                          {money(count * Math.ceil(orders / count) * spread)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <p className="i2e-note">
                Three clinics at {Math.ceil(orders / 3)} orders each, or four at{" "}
                {Math.ceil(orders / 4)}, cover the listed stack only if the full
                modeled spread is retained. Additional costs raise the
                break-even volume. Pilot demand and realized contribution must
                establish profitability.
              </p>
            </div>
          </div>
        </section>
        <section id="roadmap">
          <div className="i2e-section-heading">
            <h2>
              <Anchor>🎯</Anchor>Execute toward repeatable clinic economics.
            </h2>
            <p>Milestones for the next investment decision.</p>
          </div>
          <div className="i2e-timeline">
            {[
              [
                "01",
                "Finish the shared core",
                "Complete connected care, order and billing workflows with sandbox verification.",
              ],
              [
                "02",
                "Activate the service stack",
                "Finalize commercial agreements, legal scope, security controls and required provider assurance.",
              ],
              [
                "03",
                "Launch the pilot cohort",
                "Onboard 3–4 target clinics and measure time-to-value, workflow adoption and order volume.",
              ],
              [
                "04",
                "Prove contribution margin",
                "Measure collected revenue, true cost per order and support load before scaling acquisition.",
              ],
            ].map(([step, title, body]) => (
              <article key={step}>
                <span>{step}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="i2e-close">
          <h2>
            Our ambition: become the operating layer
            <br />
            for independent clinical commerce.
          </h2>
          <p>
            i2E conversation: a $30,000 execution plan, introductions to pilot
            clinics, and measurable milestones for follow-on capital.
          </p>
        </section>
        <footer className="i2e-footer">
          <div>
            <strong>Meta Clinic / i2E strategy brief</strong>
            <p>
              Source review: September 24, 2026. No i2E affiliation or
              commitment implied.
            </p>
          </div>
          <div>
            <strong>Supporting references</strong>
            {sources.slice(4, 7).map(([label, url]) => (
              <a key={url} href={url}>
                {label}
              </a>
            ))}
          </div>
        </footer>
      </main>
    </div>
  );
}
