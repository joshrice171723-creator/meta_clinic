import { useEffect, useState, type ReactNode } from "react";
import {
  Button,
  TextField,
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
) {
  const incremental = incrementalCosts.reduce(
    (sum, row) => sum + row.monthly,
    0,
  );
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
const deckPrices = [
  ["Solo / micro", 600, 3000],
  ["Small clinic", 1200, 6000],
  ["Established group", 3500, 15000],
  ["Midsize group", 8000, 35000],
  ["Large regional", 15000, 75000],
] as const;
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
export function I2eInvestorPage() {
  const [subscriptionInput, setSubscriptionInput] = useState("1200");
  const [allowanceInput, setAllowanceInput] = useState("0");
  const [showDeck, setShowDeck] = useState(false);
  const valid = (value: string) =>
    value.trim() !== "" &&
    Number.isFinite(Number(value)) &&
    Number(value) >= 0 &&
    Number(value) <= 100000;
  const validInputs = valid(subscriptionInput) && valid(allowanceInput);
  const subscription = Number(subscriptionInput),
    allowance = Number(allowanceInput);
  const incremental = incrementalCosts.reduce(
    (sum, row) => sum + row.monthly,
    0,
  );
  const software = stackCosts.reduce((sum, row) => sum + row.cost, 0);
  const spread = investorBudget.retail - investorBudget.wholesale;
  useEffect(() => {
    const title = document.title;
    document.title = "Meta Clinic × i2E | Platform economics";
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
        Skip to dashboard
      </a>
      <header className="i2e-header">
        <a href="/meta-clinic" className="i2e-brand">
          m. <span>Meta Clinic</span>
        </a>
        <span>PLATFORM ECONOMICS / i2E</span>
        <div>
          <Button href="/demo" endIcon={<ArrowOutwardRounded />}>
            Product demo
          </Button>
          <Button onClick={() => window.print()} startIcon={<PrintOutlined />}>
            Print
          </Button>
        </div>
      </header>
      <div className="i2e-workspace">
        <nav className="i2e-nav" aria-label="Dashboard sections">
          <a href="#overview">Overview</a>
          <a href="#scaling">Per-clinic costs</a>
          <a href="#positioning">Stack value</a>
          <a href="#capital">Execution budget</a>
          <a href="#breakeven">Break-even</a>
          <a href="#sales-deck">Sales deck</a>
          <a href="#roadmap">Engineering notes</a>
        </nav>
        <main id="i2e-main">
          <section id="overview">
            <div className="i2e-heading">
              <div>
                <h1>⚙️ Platform economics</h1>
                <p>
                  Independent clinic businesses · Three providers per modeled
                  clinic · USD
                </p>
              </div>
              <span className="i2e-status">Planning model / 25 Sep 2026</span>
            </div>
            <dl className="i2e-metrics">
              <div>
                <dt>Initial platform execution</dt>
                <dd>{money(investorBudget.upfront)}</dd>
              </div>
              <div>
                <dt>First clinic + shared platform / mo</dt>
                <dd>{money(investorBudget.monthly)}</dd>
              </div>
              <div>
                <dt>Each additional clinic / mo</dt>
                <dd>~{money(incremental)}</dd>
              </div>
              <div>
                <dt>Funding ask</dt>
                <dd>{money(investorBudget.capital)}</dd>
              </div>
            </dl>
            <p className="i2e-answer">
              <strong>
                Budget approximately $500/month in additional vendor costs for
                each new independent three-provider clinic.
              </strong>{" "}
              This is the supplied wholesale scenario, not a contracted all-in
              price. Add onboarding, support, payment fees, hosting growth and
              any entity-specific vendor minimums. Separate owners require
              separate tenant access, agreements and enrollment; a new clinic is
              not merely an extra location.
            </p>
          </section>
          <section id="scaling">
            <div className="i2e-heading">
              <h2>📦 Multi-tenant cost grid</h2>
              <span>Base $3,200 + ($500 × additional clinics)</span>
            </div>
            <div className="i2e-split">
              <Grid
                label="Incremental vendor costs"
                headers={[
                  "Per new 3-provider clinic",
                  "Monthly estimate",
                  "Cost driver",
                ]}
              >
                {incrementalCosts.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell component="th" scope="row">
                      {row.name}
                    </TableCell>
                    <TableCell align="right">{money(row.monthly)}</TableCell>
                    <TableCell>{row.basis}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="i2e-total">
                  <TableCell>Total incremental vendor estimate</TableCell>
                  <TableCell align="right">{money(incremental)}</TableCell>
                  <TableCell>
                    Per additional independently owned clinic
                  </TableCell>
                </TableRow>
              </Grid>
              <div className="i2e-assumptions">
                <h3>Revenue & additional cost assumptions</h3>
                <TextField
                  label="Monthly subscription per clinic ($)"
                  type="number"
                  size="small"
                  value={subscriptionInput}
                  onChange={(e) => setSubscriptionInput(e.target.value)}
                  error={!valid(subscriptionInput)}
                  helperText={
                    valid(subscriptionInput)
                      ? "Default $1,200 from the published small-clinic sales scenario."
                      : "Enter a value from $0 to $100,000."
                  }
                  slotProps={{ htmlInput: { min: 0, max: 100000, step: 50 } }}
                />
                <TextField
                  label="Additional monthly costs per clinic ($)"
                  type="number"
                  size="small"
                  value={allowanceInput}
                  onChange={(e) => setAllowanceInput(e.target.value)}
                  error={!valid(allowanceInput)}
                  helperText={
                    valid(allowanceInput)
                      ? "$0 means unbudgeted, not zero real costs. Add support, hosting and other fees."
                      : "Enter a value from $0 to $100,000."
                  }
                  slotProps={{ htmlInput: { min: 0, max: 100000, step: 25 } }}
                />
              </div>
            </div>
            {validInputs ? (
              <Grid
                label="Independent clinic network costs"
                headers={[
                  "Independent clinics",
                  "Providers",
                  "Vendor base / mo",
                  "Added allowance / mo",
                  "Total cost / mo",
                  "Cost / clinic / mo",
                  "Subscriptions / mo",
                  "Contribution / mo",
                ]}
              >
                {[1, 2, 3, 4, 10].map((count) => {
                  const e = clinicEconomics(count, subscription, allowance);
                  return (
                    <TableRow key={count}>
                      <TableCell component="th" scope="row">
                        {count}
                      </TableCell>
                      <TableCell align="right">{count * 3}</TableCell>
                      <TableCell align="right">
                        {money(clinicEconomics(count).monthly)}
                      </TableCell>
                      <TableCell align="right">
                        {money(count * allowance)}
                      </TableCell>
                      <TableCell align="right">{money(e.monthly)}</TableCell>
                      <TableCell align="right">{money(e.average)}</TableCell>
                      <TableCell align="right">{money(e.revenue)}</TableCell>
                      <TableCell
                        align="right"
                        className={e.contribution < 0 ? "i2e-negative" : ""}
                      >
                        {money(e.contribution)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </Grid>
            ) : (
              <p role="alert">
                Correct the assumptions to calculate network economics.
              </p>
            )}
            <p className="i2e-note">
              Contribution = modeled subscriptions minus listed costs, before
              tax, founder compensation, unbudgeted support and acquisition
              costs. The $500 is added after the first clinic to avoid counting
              its baseline services twice. No assumption of permanently flat
              engineering headcount or server capacity is made.
            </p>
            <Grid
              label="New clinic setup expense gaps"
              headers={[
                "One-time onboarding cost",
                "Current budget treatment",
                "Next evidence",
              ]}
            >
              {[
                [
                  "Tenant setup, migration & training",
                  "Not yet costed",
                  "Measure delivery hours × loaded hourly rate.",
                ],
                [
                  "Provider identity / EPCS onboarding",
                  "Not yet quoted",
                  "Confirm per-prescriber verification, enrollment and token fees.",
                ],
                [
                  "Independent entity / payer enrollment",
                  "Not yet quoted",
                  "Confirm TIN/NPI enrollment, clearinghouse minimums and setup charges.",
                ],
                [
                  "Clinic legal & certification scope",
                  "Case-specific",
                  "Confirm new entity/domain obligations; shared platform scope does not establish blanket coverage.",
                ],
              ].map((row) => (
                <TableRow key={row[0]}>
                  {row.map((cell, i) => (
                    <TableCell
                      key={cell}
                      component={i === 0 ? "th" : "td"}
                      scope={i === 0 ? "row" : undefined}
                    >
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </Grid>
          </section>
          <section id="positioning">
            <div className="i2e-heading">
              <h2>↔️ Total stack value matrix</h2>
              <span>Illustrative three-provider buying scenario</span>
            </div>
            <Grid
              label="Total stack value matrix"
              headers={[
                "Capability",
                "External stack / mo",
                "Scenario basis",
                "Meta Clinic strategy",
              ]}
            >
              {stackCosts.map((row) => (
                <TableRow key={row.name}>
                  <TableCell component="th" scope="row">
                    {row.name}
                  </TableCell>
                  <TableCell align="right">{money(row.cost)}</TableCell>
                  <TableCell>{row.basis}</TableCell>
                  <TableCell>{row.meta}</TableCell>
                </TableRow>
              ))}
              <TableRow className="i2e-total">
                <TableCell>Software subtotal</TableCell>
                <TableCell align="right">{money(software)}</TableCell>
                <TableCell colSpan={2}>
                  Sum of the five supplied software scenarios; not a Jane quote
                  or guaranteed saving.
                </TableCell>
              </TableRow>
            </Grid>
            <p className="i2e-note">
              Jane already offers charting, memberships, insurance integrations
              and Fullscript lab workflows. External products shown here are
              optional scenario choices, not mandatory purchases for every Jane
              customer. <a href="https://jane.app/pricing">Jane pricing</a> ·{" "}
              <a href="https://jane.app/guide/medical-wellness-hub">
                Jane medical workflows
              </a>{" "}
              · <a href="https://get.hint.com/hint-core">Hint Core</a>. Proposed
              Meta Clinic integrations are not represented as live or as
              feature-for-feature replacements.
            </p>
          </section>
          <section id="capital">
            <div className="i2e-heading">
              <h2>⚖️ Execution budget</h2>
              <span>$10,500 upfront / $3,200 monthly baseline</span>
            </div>
            <Grid
              label="Fixed cost estimates"
              headers={[
                "Investment",
                "Upfront",
                "Monthly",
                "Execution purpose",
              ]}
            >
              {investorCosts.map((row) => (
                <TableRow key={row.category}>
                  <TableCell component="th" scope="row">
                    {row.category}
                  </TableCell>
                  <TableCell align="right">{money(row.upfront)}</TableCell>
                  <TableCell align="right">{money(row.monthly)}</TableCell>
                  <TableCell>
                    {row.purpose}
                    <small>{row.value}</small>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="i2e-total">
                <TableCell>Total baseline</TableCell>
                <TableCell align="right">
                  {money(investorBudget.upfront)}
                </TableCell>
                <TableCell align="right">
                  {money(investorBudget.monthly)}
                </TableCell>
                <TableCell>
                  Initial one-clinic model; additional clinics use the
                  incremental grid.
                </TableCell>
              </TableRow>
            </Grid>
            <p className="i2e-note">
              The $10,500 is a shared initial execution pool in this model.
              Platform assurance is not automatically repeated for every signup,
              but entity, domain, provider and material system changes may add
              review or certification costs. $30,000 − $10,500 = $19,500 for
              operations: 6.09 months at the initial $3,200 baseline. Growth
              reduces this runway unless revenue offsets added expense.
            </p>
          </section>
          <section id="breakeven">
            <div className="i2e-heading">
              <h2>📊 Break-even clarity</h2>
              <span>$120 retail − $45 supplier = $75 gross spread</span>
            </div>
            <p>
              <strong>
                43 orders/month cover the initial $3,200 stack only.
              </strong>{" "}
              At that volume, modeled gross spread is $3,225. Each additional
              clinic adds vendor costs; the network targets below include those
              costs.
            </p>
            {validInputs && (
              <Grid
                label="Network order targets"
                headers={[
                  "Independent clinics",
                  "Total cost / mo",
                  "Orders: no subscriptions",
                  "Orders / clinic (rounded up)",
                  "Orders after subscriptions",
                ]}
              >
                {[1, 3, 4, 10].map((count) => {
                  const e = clinicEconomics(count, subscription, allowance);
                  return (
                    <TableRow key={count}>
                      <TableCell component="th" scope="row">
                        {count}
                      </TableCell>
                      <TableCell align="right">{money(e.monthly)}</TableCell>
                      <TableCell align="right">{e.orders}</TableCell>
                      <TableCell align="right">
                        {Math.ceil(e.orders / count)}
                      </TableCell>
                      <TableCell align="right">{e.remainingOrders}</TableCell>
                    </TableRow>
                  );
                })}
              </Grid>
            )}
            <p className="i2e-note">
              Orders after subscriptions = ceiling(max($0, monthly cost −
              subscriptions) ÷ $75). Whole-order rounding can create surplus
              coverage. The $75 excludes shipping, card fees, refunds and
              service costs; retaining it requires a lawful contracted
              pharmacy/payment structure. It is not net profit or a blanket
              authorization for compounded products.
            </p>
          </section>
          <section id="sales-deck">
            <div className="i2e-heading">
              <h2>📈 Sales deck / revenue potential</h2>
              <Button
                href={salesDeckUrl}
                target="_blank"
                rel="noopener noreferrer"
                endIcon={<ArrowOutwardRounded />}
              >
                Open published deck
              </Button>
            </div>
            <p>
              The published deck models 2027–2031 subscription and
              implementation revenue across ten clinic markets. These are
              customer price scenarios, separate from Meta Clinic's delivery
              expenses above.
            </p>
            <Grid
              label="Published sales deck price scenarios"
              headers={[
                "Organization size",
                "Subscription / mo",
                "One-time implementation",
              ]}
            >
              {deckPrices.map(([name, monthly, upfront]) => (
                <TableRow key={name}>
                  <TableCell component="th" scope="row">
                    {name}
                  </TableCell>
                  <TableCell align="right">{money(monthly)}</TableCell>
                  <TableCell align="right">{money(upfront)}</TableCell>
                </TableRow>
              ))}
            </Grid>
            <p className="i2e-note">
              Published baseline verified September 25, 2026. Prices are per
              organization, not per provider. The $500 cost model applies only
              to the proposed three-provider clinic; it does not establish
              delivery costs for larger organizations. Implementation charges
              are revenue, not an estimate of onboarding expense. Embedded deck
              inputs are independent of this dashboard.
            </p>
            <Button
              variant="outlined"
              onClick={() => setShowDeck(!showDeck)}
              aria-expanded={showDeck}
              aria-controls="i2e-live-deck"
            >
              {showDeck ? "Hide embedded deck" : "Show embedded sales deck"}
            </Button>
            {showDeck && (
              <div id="i2e-live-deck">
                <p className="i2e-note">
                  If the embed is blocked by your browser or hosting policy, use
                  “Open published deck” above.
                </p>
                <iframe
                  title="Meta Clinic published sales revenue deck"
                  src={salesDeckUrl}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                />
              </div>
            )}
          </section>
          <section id="roadmap">
            <h2>⚙️ Engineering parameters & cost boundaries</h2>
            <pre className="i2e-technical">{`MODEL_STATUS = planning assumptions; vendor contracts not verified\nTENANCY = independent owners; separate authorization, agreements and enrollment\nUPFRONT_POOL = $10,500 shared initial execution; scope-dependent exceptions\nBASE_MONTHLY = $3,200 including first pilot clinic\nADDITIONAL_CLINIC = $500/month estimate for 3 providers, before unbudgeted costs\nTELEMETRY = compute capacity, transcription speed and engineering velocity require pilot measurement\nVIDEO = Twilio usage $0.004/participant-minute; HIPAA account/BAA terms and extras separate\nCLINICAL_AI = draft notes require clinician review; time savings are design targets`}</pre>
            <p className="i2e-note">
              <a href="https://www.twilio.com/en-us/video/pricing">
                Twilio pricing
              </a>{" "}
              ·{" "}
              <a href="https://www.twilio.com/docs/iam/twilio-editions/hippa">
                Twilio HIPAA terms
              </a>{" "}
              ·{" "}
              <a href="https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/business-associates/factsheet/index.html">
                HHS obligations
              </a>{" "}
              ·{" "}
              <a href="https://www.deadiversion.usdoj.gov/faq/epcs-faq.html">
                DEA EPCS
              </a>{" "}
              ·{" "}
              <a href="https://www.legitscript.com/certification/healthcare-certification/faq/">
                LegitScript scope
              </a>
            </p>
          </section>
          <footer>
            Meta Clinic / i2E discussion workspace · Proposed economics, not
            committed funding or realized results.
          </footer>
        </main>
      </div>
    </div>
  );
}
