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
  TextField,
} from "@mui/material";
import ArrowOutwardRounded from "@mui/icons-material/ArrowOutwardRounded";
import PrintOutlined from "@mui/icons-material/PrintOutlined";
import "./i2e-investor.css";

export const investorCosts = [
  {
    category: "Core software development",
    upfront: 5000,
    monthly: 0,
    purpose:
      "Workflow development, UI components and sandbox integration testing.",
    value: "Build the shared care-delivery core.",
  },
  {
    category: "Healthcare legal & contracts",
    upfront: 2000,
    monthly: 0,
    purpose:
      "Budget for counsel-reviewed MSA and BAA templates; scope and quotes pending.",
    value: "Define customer, platform and partner responsibilities.",
  },
  {
    category: "Prescription network API",
    upfront: 0,
    monthly: 800,
    purpose:
      "Planning allowance for an eRx provider; routing, volume and benefit-check terms to confirm.",
    value: "Connect prescribing to external pharmacy fulfillment.",
  },
  {
    category: "Insurance billing engine",
    upfront: 0,
    monthly: 1500,
    purpose:
      "Planning allowance for claims and clearinghouse integration; optional for cash-pay clinics.",
    value: "Support a future hybrid payment model.",
  },
  {
    category: "Security & cloud hosting",
    upfront: 0,
    monthly: 400,
    purpose:
      "Hosting, access controls and audit infrastructure; security implementation remains necessary.",
    value: "Establish an accountable operating foundation.",
  },
  {
    category: "LegitScript certification",
    upfront: 1500,
    monthly: 0,
    purpose:
      "Placeholder allowance; applicability, application fees and recurring fees require confirmation.",
    value: "Evaluate payment and advertising channel requirements.",
  },
  {
    category: "EPCS assurance",
    upfront: 2000,
    monthly: 0,
    purpose:
      "Placeholder for EPCS assurance work; confirm provider certification coverage and our application scope.",
    value: "Resolve controlled-prescribing requirements before activation.",
  },
  {
    category: "Pharmacy & diagnostic partners",
    upfront: 0,
    monthly: 0,
    purpose:
      "No fixed fee assumed in this model. Partner quotes, per-order costs and agreements remain open.",
    value: "Coordinate partner orders and fulfillment status.",
  },
];
const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
export const investorBudget = {
  upfront: investorCosts.reduce((sum, row) => sum + row.upfront, 0),
  monthly: investorCosts.reduce((sum, row) => sum + row.monthly, 0),
};

export function I2eInvestorPage() {
  const [months, setMonths] = useState(7);
  const { upfront, monthly } = investorBudget;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"category" | "upfront" | "monthly">(
    "category",
  );
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const rows = investorCosts
    .filter((row) =>
      `${row.category} ${row.purpose}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort((a, b) => {
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
    document.title = "Meta Clinic × i2E | Investment conversation";
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
          <span aria-hidden="true">m.</span> Meta Clinic
        </a>
        <nav aria-label="Investor navigation">
          <a href="#capital">Costs</a>
          <a href="#roadmap">Milestones</a>
          <a href="#discussion">Discussion</a>
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
            <p className="i2e-eyebrow">
              PREPARED FOR i2E / INVESTMENT CONVERSATION
            </p>
            <h1>
              A connected clinic.
              <br />
              <em>A focused next chapter.</em>
            </h1>
            <p className="i2e-lead">
              One operating workspace for independent clinics — from the first
              appointment to care, payment and follow-up.
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
              <a href="#capital">Explore the operating plan ↓</a>
            </div>
          </div>
          <aside className="i2e-ask">
            <p className="i2e-eyebrow">THE OPPORTUNITY</p>
            <h2>Built around the independent clinic.</h2>
            <p>
              Connect the tools. Simplify the handoffs. Make the clinic day work
              better.
            </p>
            <div>
              <span>Focus</span>
              <b>Cash-pay & hybrid clinics</b>
            </div>
            <div>
              <span>First markets</span>
              <b>Concierge / Wellness / Med spas</b>
            </div>
            <div>
              <span>Next milestone</span>
              <b>Validate a repeatable pilot offering</b>
            </div>
          </aside>
        </section>
        <section className="i2e-thesis" aria-label="Investment thesis">
          <div>
            <span>01 / THE PROBLEM</span>
            <p>
              Small clinics piece together scheduling, charts, payments and
              supplier tools.
            </p>
          </div>
          <div>
            <span>02 / THE PRODUCT</span>
            <p>
              A shared clinic core with specialty workflows and optional
              integrations.
            </p>
          </div>
          <div>
            <span>03 / THE NEXT PROOF</span>
            <p>
              Validate willingness to pay, onboarding effort and repeatable
              clinic economics.
            </p>
          </div>
        </section>
        <section id="capital" className="i2e-capital">
          <div className="i2e-section-heading">
            <div>
              <p className="i2e-eyebrow">01 / OPERATING PLAN</p>
              <h2>Every dollar, with a purpose.</h2>
            </div>
            <p>
              Founder planning estimates in USD.
              <br />
              Vendor quotes and scope remain to be confirmed.
            </p>
          </div>
          <div className="i2e-capital-grid">
            <aside>
              <h3>Monthly cost mix</h3>
              <div
                className="i2e-donut"
                role="img"
                aria-label="Monthly estimates: insurance billing 1,500 dollars, prescription API 800 dollars, cloud hosting 400 dollars"
              >
                <div>
                  <strong>$2,700</strong>
                  <span>monthly estimate</span>
                </div>
              </div>
              <dl className="i2e-legend">
                <div>
                  <dt>
                    <i className="i2e-dot upfront" />
                    Insurance billing
                  </dt>
                  <dd>$1,500</dd>
                </div>
                <div>
                  <dt>
                    <i className="i2e-dot recurring" />
                    Prescription API
                  </dt>
                  <dd>$800</dd>
                </div>
                <div>
                  <dt>
                    <i className="i2e-dot reserve" />
                    Cloud hosting
                  </dt>
                  <dd>$400</dd>
                </div>
              </dl>
              <p className="i2e-note">
                Estimated fixed costs. Insurance is an optional module for
                cash-pay clinics.
              </p>
            </aside>
            <div className="i2e-matrix">
              <h3>Fixed cost data table</h3>
              <TextField
                label="Search costs"
                size="small"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                fullWidth
              />
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
                    {rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3}>
                          No costs match your search.
                        </TableCell>
                      </TableRow>
                    )}
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
              <p className="i2e-note" aria-live="polite">
                {rows.length} of {investorCosts.length} costs shown. Totals
                always include all planned costs.
              </p>
            </div>
            <aside className="i2e-runway">
              <p className="i2e-eyebrow">COST EXPLORER</p>
              <h3>Plan the operating period.</h3>
              <strong className="i2e-runway-number">
                {money(monthly)}
                <small> / mo</small>
              </strong>
              <p>Estimated fixed vendor costs at the modeled service scope.</p>
              <label id="i2e-months-label">
                Model duration <b>{months} months</b>
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
                  <dt>Upfront expenses</dt>
                  <dd>{money(upfront)}</dd>
                </div>
                <div>
                  <dt>{months}-month operating costs</dt>
                  <dd aria-live="polite">{money(monthly * months)}</dd>
                </div>
              </dl>
              <p className="i2e-note">
                Founder pay, taxes, acquisition, support, transaction fees,
                variable usage and recurring certification fees are not
                included.
              </p>
            </aside>
          </div>
        </section>
        <section className="i2e-fulfillment">
          <div className="i2e-section-heading">
            <div>
              <p className="i2e-eyebrow">02 / PRODUCT ARCHITECTURE</p>
              <h2>One workspace. Two fulfillment paths.</h2>
            </div>
            <p>
              Proposed integrations; provider contracts
              <br />
              and live connectivity are not established here.
            </p>
          </div>
          <div className="i2e-two-columns">
            <article>
              <span className="i2e-eyebrow">A / RETAIL PHARMACY</span>
              <h3>Route care. Let partners fulfill.</h3>
              <ol>
                <li>Clinician prepares a prescription</li>
                <li>eRx provider routes to a selected pharmacy</li>
                <li>Pharmacy dispenses; clinic tracks the handoff</li>
              </ol>
              <p>
                External fulfillment can limit inventory and logistics exposure.
                Network coverage and commercial terms need validation.
              </p>
            </article>
            <article>
              <span className="i2e-eyebrow">B / SPECIALTY PARTNER</span>
              <h3>Connect orders to the clinic workflow.</h3>
              <ol>
                <li>Clinician initiates an appropriate partner order</li>
                <li>Authorized pharmacy or laboratory processes it</li>
                <li>Status, charges and applicable stock events reconcile</li>
              </ol>
              <p>
                Commercial hypothesis: a $120 charge less a $45 supplier cost
                leaves a $75 gross spread before other costs. This is
                illustrative, not approved platform revenue or net profit;
                entity roles and prescribing rules require review.
              </p>
            </article>
          </div>
        </section>
        <section id="roadmap">
          <div className="i2e-section-heading">
            <div>
              <p className="i2e-eyebrow">03 / PROPOSED SEQUENCE</p>
              <h2>Clear milestones. Testable assumptions.</h2>
            </div>
            <p>Planning sequence, not promised completion dates.</p>
          </div>
          <div className="i2e-timeline">
            {[
              [
                "01",
                "Define the commercial foundation",
                "Confirm clinic demand, pricing, entity responsibilities and counsel-reviewed contracts.",
              ],
              [
                "02",
                "Resolve vendor & regulatory scope",
                "Obtain provider quotes; assess BAA/security obligations, EPCS coverage and certification applicability.",
              ],
              [
                "03",
                "Prove the connected workflow",
                "Verify clinic onboarding, end-to-end persistence and external integration behavior before activation.",
              ],
              [
                "04",
                "Measure pilot economics",
                "Track onboarding hours, support load, collected revenue and contribution margin per clinic.",
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
        <section id="discussion" className="i2e-discussion">
          <div>
            <p className="i2e-eyebrow">04 / CONVERSATION WITH i2E</p>
            <h2>
              A focused conversation.
              <br />A measurable next step.
            </h2>
            <p>
              Discuss the path forward, introductions to early clinic partners,
              and the evidence needed for the next investment decision.
            </p>
          </div>
          <div>
            <h3>Investor talking points</h3>
            <ul>
              <li>
                <strong>Capital discipline.</strong> Use a bounded budget to
                validate the clinic offering and replace estimates with actual
                quotes.
              </li>
              <li>
                <strong>Technical efficiency.</strong> Build the shared workflow
                once and integrate specialized services where they make economic
                sense.
              </li>
              <li>
                <strong>Revenue potential.</strong> At four clinics, each would
                need $675 in monthly contribution to cover the modeled $2,700
                fixed vendor costs; at three, $900. Pricing, volume and margins
                remain hypotheses.
              </li>
              <li>
                <strong>Milestone-based progress.</strong> Tie follow-on
                investment to workflow proof, clinic demand and measured unit
                economics.
              </li>
            </ul>
          </div>
        </section>
        <footer className="i2e-footer">
          <div>
            <strong>Meta Clinic / i2E discussion brief</strong>
            <p>
              Prepared for discussion. No i2E affiliation or investment
              commitment implied.
            </p>
          </div>
          <div>
            <span>Scope references</span>
            <a href="https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/business-associates/index.html">
              HHS · Business associates
            </a>
            <a href="https://www.deadiversion.usdoj.gov/faq/epcs-faq.html">
              DEA · EPCS
            </a>
            <a href="https://www.legitscript.com/certification/healthcare-certification/faq/">
              LegitScript · Applicability & fees
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}
