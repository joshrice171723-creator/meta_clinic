import type { ReactNode } from "react";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { featureGroups, featureHref } from "./features";
import { clinicTypeLabels } from "./ClinicTypePages";
import { isUnavailableMarketingPath } from "./marketingAvailability";
import { marketingUrl } from "./marketingPaths";
import "./buyerInformationPages.css";

const buyerPaths = [
  "/about",
  "/pricing",
  "/security",
  "/integrations",
  "/site-map",
] as const;
type BuyerPath = (typeof buyerPaths)[number];

export function isBuyerInformationPath(path: string): path is BuyerPath {
  return buyerPaths.some((candidate) => candidate === path);
}

const introductions: Record<
  BuyerPath,
  { title: string; eyebrow: string; headline: string; lead: string }
> = {
  "/about": {
    title: "About Meta Clinic",
    eyebrow: "Our focus",
    headline: "Built around the work of an independent clinic.",
    lead: "Meta Clinic is clinic software in development. It brings patient access, scheduling, visit work, cash-pay billing, memberships, and inventory into a connected workspace.",
  },
  "/pricing": {
    title: "Pricing",
    eyebrow: "Software + implementation",
    headline: "A clear scope before a price.",
    lead: "Meta Clinic does not publish subscription rates yet. Pricing discussions are quote-based, with software, implementation, optional support, and external service costs considered separately.",
  },
  "/security": {
    title: "Security",
    eyebrow: "Controls and readiness",
    headline: "Understand the safeguards. Know the limits.",
    lead: "The application includes access checks, protected sessions, and recorded change history. Here is what those controls cover—and what still needs deployment-specific review before a clinic relies on them.",
  },
  "/integrations": {
    title: "Integrations",
    eyebrow: "Connection status",
    headline: "Know what connects today.",
    lead: "A workflow inside Meta Clinic and a connection to an outside service are separate capabilities. Use the status below to understand the current software scope before planning your systems.",
  },
  "/site-map": {
    title: "Site map",
    eyebrow: "Find your next step",
    headline: "A direct path to the information you need.",
    lead: "Explore the product, try the demo, or find the details behind a clinic software decision.",
  },
};

function Actions({
  primary = "Try Our Sandbox",
  primaryHref = "/demo",
  secondary = "Explore the platform",
  secondaryHref = marketingUrl("/platform"),
}: {
  primary?: string;
  primaryHref?: string;
  secondary?: string;
  secondaryHref?: string;
}) {
  return (
    <div className="buyer-page__actions">
      <Button
        component="a"
        href={primaryHref}
        variant="contained"
        disableElevation
        endIcon={<ArrowForwardRoundedIcon />}
        className="buyer-page__primary"
      >
        {primary}
      </Button>
      <Button
        component="a"
        href={secondaryHref}
        variant="text"
        className="buyer-page__secondary"
      >
        {secondary}
      </Button>
    </div>
  );
}

function SectionHeading({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="buyer-page__section-heading">
      <p className="buyer-page__eyebrow">{label}</p>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  );
}

function AboutBody() {
  return (
    <>
      <section className="buyer-page__wrap buyer-page__about-intro">
        <SectionHeading
          label="The problem we are working on"
          title="The visit is one journey. The work often lives in several places."
        >
          A booking becomes intake, a visit, a charge, and a follow-up. When
          each step lives in a different tool, staff have to rebuild the context
          and find the next owner.
        </SectionHeading>
        <figure className="buyer-page__product">
          <img
            src="/marketing/tracking-board-app.png"
            alt="Meta Clinic tracking board showing sample clinic visits and their recorded workflow status."
            loading="lazy"
          />
          <figcaption>
            A shared view of visit work in the synthetic demo.
          </figcaption>
        </figure>
      </section>
      <section className="buyer-page__band">
        <div className="buyer-page__wrap buyer-page__split">
          <SectionHeading
            label="Who it is for"
            title="Independent clinics. Practical workflows."
          >
            Our initial focus is small, cash-pay ambulatory practices, including
            nurse practitioner and physician assistant-led clinics. The broader
            product direction supports different specialties and operating
            models through a shared core.
          </SectionHeading>
          <div className="buyer-page__reading">
            <h3>Configuration should follow the clinic.</h3>
            <p>
              Care model, visit types, team roles, locations, and selected
              modules shape the workspace. The public demo is a starting point
              for evaluating those choices.
            </p>
            <h3>Coverage still needs a close look.</h3>
            <p>
              A page about a specialty does not establish that every
              specialty-specific workflow is ready. Start with the exact task
              your staff need and inspect it in the demo.
            </p>
          </div>
        </div>
      </section>
      <section className="buyer-page__wrap buyer-page__section">
        <SectionHeading
          label="How the product takes shape"
          title="Software, setup, and clinic ownership."
        >
          The commercial direction combines a software subscription with
          separately scoped implementation work. The clinic retains ownership of
          its operating decisions and professional responsibilities.
        </SectionHeading>
        <div className="buyer-page__three-column">
          <article>
            <span className="buyer-page__number">01</span>
            <h3>Review the fit</h3>
            <p>
              Follow a familiar task through the demo. Identify the
              configuration, missing work, and outside services your clinic
              would require.
            </p>
          </article>
          <article>
            <span className="buyer-page__number">02</span>
            <h3>Scope the setup</h3>
            <p>
              An implementation engineer can help define configuration, approved
              connections, migration mapping, and staff validation as separate
              deliverables.
            </p>
          </article>
          <article>
            <span className="buyer-page__number">03</span>
            <h3>Agree on the handoff</h3>
            <p>
              Confirm what is delivered, who supports it, and what staff must
              validate before operational use. Terms and readiness remain part
              of that agreement.
            </p>
          </article>
        </div>
      </section>
      <section className="buyer-page__close">
        <div className="buyer-page__wrap">
          <p className="buyer-page__eyebrow">Start with the product</p>
          <h2>Bring one clinic workflow.</h2>
          <p>
            See how the current software handles it, then discuss the gaps that
            matter to your team.
          </p>
          <Actions />
        </div>
      </section>
    </>
  );
}

const pricingComponents = [
  {
    title: "Platform subscription",
    cadence: "Recurring",
    scope:
      "The agreed workflows and modules, provider and location scope, and account access.",
    clarify:
      "Included capabilities, limits, hosting responsibilities, export, and cancellation terms.",
  },
  {
    title: "Implementation",
    cadence: "Separate project scope",
    scope:
      "Clinic configuration, approved integration work, migration mapping, reconciliation, staff validation, and handoff where agreed.",
    clarify:
      "Source systems, deliverables, dependencies, acceptance criteria, and change-order rules.",
  },
  {
    title: "Optional ongoing support",
    cadence: "By agreement",
    scope:
      "Additional configuration or workflow support after the initial handoff.",
    clarify:
      "Available hours, response expectations, ownership, and what requires a new project.",
  },
  {
    title: "External services",
    cadence: "Provider-dependent",
    scope:
      "Payment processing, video, messaging, or other services selected for the deployment.",
    clarify:
      "Which party contracts with the provider, vendor fees, usage charges, and connection readiness.",
  },
] as const;

function PricingBody() {
  return (
    <>
      <section className="buyer-page__wrap buyer-page__section">
        <SectionHeading
          label="Cost structure"
          title="Four parts to review together."
        >
          These are the components of a pricing discussion, rather than
          published packages or a purchase offer. The written scope determines
          what is included.
        </SectionHeading>
        <div className="buyer-page__costs">
          {pricingComponents.map((item, index) => (
            <article key={item.title}>
              <div className="buyer-page__cost-title">
                <span className="buyer-page__number">0{index + 1}</span>
                <h3>{item.title}</h3>
                <span className="buyer-page__meta">{item.cadence}</span>
              </div>
              <div>
                <p>{item.scope}</p>
                <p className="buyer-page__detail">
                  <strong>Clarify in the proposal:</strong> {item.clarify}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="buyer-page__band">
        <div className="buyer-page__wrap buyer-page__split">
          <SectionHeading
            label="What shapes the scope"
            title="Tell us how your clinic works."
          >
            A useful pricing request starts with the size of the team and the
            first workflow to improve.
          </SectionHeading>
          <div className="buyer-page__reading">
            <ul className="buyer-page__checklist">
              <li>
                <strong>Practice:</strong> care model, prescribing providers,
                staff roles, and locations.
              </li>
              <li>
                <strong>Priorities:</strong> the workflows and modules you want
                to use first.
              </li>
              <li>
                <strong>Current systems:</strong> the tools you use and the
                records you would need to move.
              </li>
              <li>
                <strong>Connections:</strong> the payment, video, messaging, or
                other providers you require.
              </li>
              <li>
                <strong>Implementation:</strong> configuration, training,
                migration, and support needs.
              </li>
            </ul>
            <p>
              Please describe the systems and workflow; leave patient records
              and credentials out of the request.
            </p>
            <Actions
              primary="Request pricing details"
              primaryHref={marketingUrl("/contact")}
              secondary="See connection status"
              secondaryHref={marketingUrl("/integrations")}
            />
          </div>
        </div>
      </section>
      <section className="buyer-page__wrap buyer-page__section buyer-page__split">
        <SectionHeading
          label="Common questions"
          title="Know what you are comparing."
        />
        <div className="buyer-page__reading">
          <h3>Can I purchase online?</h3>
          <p>
            There is no self-service software subscription checkout or published
            rate card. Use the contact form to discuss scope and current
            availability.
          </p>
          <h3>Is migration included?</h3>
          <p>
            Migration is separately scoped implementation work. Source access,
            mapping, validation, and readiness must be agreed before any
            transfer.
          </p>
          <h3>Does a quote mean the clinic can go live?</h3>
          <p>
            Commercial scope and operational readiness are separate. Supported
            connections, security review, agreements, and clinic validation must
            be confirmed for the intended deployment.
          </p>
        </div>
      </section>
    </>
  );
}

const securityControls = [
  {
    control: "Clinic access",
    implemented:
      "Server-side checks evaluate the member, clinic, requested action, and applicable site permissions.",
    limit:
      "The clinic must define and validate its own role assignments; visible navigation is not an access grant.",
  },
  {
    control: "Session protection",
    implemented:
      "Authenticated cookie sessions, session expiry, and cross-site request forgery protection are built into the application.",
    limit:
      "Hosted cookie settings, identity operations, and account lifecycle need review for the intended deployment.",
  },
  {
    control: "Recorded history",
    implemented:
      "Selected record changes and protected operations carry actor and event history. Required clinic audit failures block affected operations.",
    limit:
      "This does not establish complete coverage of every read, export, privileged action, or retention requirement.",
  },
  {
    control: "Protected fields",
    implemented:
      "Selected clinical values use application-level encryption. Protected application responses are marked to prevent caching.",
    limit:
      "This does not establish encryption of every database, backup, file, log, or outside service.",
  },
] as const;

function SecurityBody() {
  return (
    <>
      <section className="buyer-page__wrap buyer-page__section">
        <SectionHeading
          label="Application controls"
          title="Specific safeguards, with defined scope."
        >
          These descriptions reflect the software implementation. They are not
          an independent assessment of a customer deployment.
        </SectionHeading>
        <TableContainer
          className="buyer-page__table-container"
          tabIndex={0}
          role="region"
          aria-label="Application controls and limitations"
        >
          <Table className="buyer-page__table">
            <caption>
              Current application controls and their review boundaries
            </caption>
            <TableHead>
              <TableRow>
                <TableCell>Area</TableCell>
                <TableCell>Implemented in the software</TableCell>
                <TableCell>Boundary to review</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {securityControls.map((row) => (
                <TableRow key={row.control}>
                  <TableCell component="th" scope="row">
                    {row.control}
                  </TableCell>
                  <TableCell>{row.implemented}</TableCell>
                  <TableCell>{row.limit}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </section>
      <section className="buyer-page__band">
        <div className="buyer-page__wrap buyer-page__split">
          <SectionHeading
            label="Before operational use"
            title="Review the deployment, not just the feature list."
          >
            The public demo uses sample records. A proposed clinic deployment
            needs its own technical, operational, privacy, and contractual
            review.
          </SectionHeading>
          <div className="buyer-page__reading">
            <h3>Items that need current evidence</h3>
            <ul className="buyer-page__checklist">
              <li>Hosting and data locations; encryption and key ownership.</li>
              <li>
                Backup coverage, a verified restore, and agreed recovery
                objectives.
              </li>
              <li>Audit coverage, retention, export, and incident handling.</li>
              <li>
                Each outside processor, data flow, and applicable agreement.
              </li>
              <li>
                Clinic access assignments and acceptance of the intended
                workflows.
              </li>
            </ul>
            <p>
              HIPAA compliance, independent security certification, an available
              business associate agreement, and guaranteed recovery times are
              not established by this page.
            </p>
          </div>
        </div>
      </section>
      <section className="buyer-page__wrap buyer-page__section buyer-page__split">
        <SectionHeading
          label="A focused security conversation"
          title="Start with your data flow."
        />
        <div className="buyer-page__reading">
          <p>
            Tell us the workflows you plan to use, the staff who need access,
            and the outside services involved. Ask for evidence that names the
            environment, scope, owner, date, and remaining exceptions.
          </p>
          <Actions
            primary="Ask a security question"
            primaryHref={marketingUrl("/contact")}
            secondary="Review integrations"
            secondaryHref={marketingUrl("/integrations")}
          />
        </div>
      </section>
    </>
  );
}

// Status describes source-defined support, never a claim about current hosted credentials or partner acceptance.
const integrationRows = [
  {
    name: "Stripe payments",
    status: "Development sandbox",
    detail:
      "Connected-account Checkout and monthly memberships have a sandbox-only implementation. Payment status follows verified provider events.",
    limit:
      "Live processing is disabled; production activation and operational acceptance remain separate.",
  },
  {
    name: "Twilio Video",
    status: "Adapter implemented",
    detail:
      "Video visit scheduling and joining have a Twilio media adapter, with short-lived participant grants and signed callback validation.",
    limit:
      "Requires configured credentials, clinic telehealth policy, provider readiness, and deployment review.",
  },
  {
    name: "Twilio SMS",
    status: "Recovery workflow",
    detail:
      "An optional SMS adapter sends patient-portal password recovery links.",
    limit:
      "This is not a general reminder or campaign integration; sender configuration and rollout gates apply.",
  },
  {
    name: "Outside-pharmacy prescribing",
    status: "Simulated network",
    detail:
      "Prescription preparation, authorized review, attempt history, and reconciliation can be explored with a simulated pharmacy network.",
    limit:
      "No external pharmacy or prescribing-network acceptance is claimed. Controlled-substance prescribing is outside this simulation.",
  },
  {
    name: "Laboratory services",
    status: "Local workflow",
    detail:
      "Lab orders, specimens, manually entered report versions, staff review, and result follow-up can be coordinated inside the application.",
    limit:
      "Laboratory partner coverage, external ordering, and result delivery must be confirmed separately.",
  },
  {
    name: "Supplier purchasing",
    status: "Local workflow",
    detail:
      "Recorded price sheets and manual quotes support purchase-order preparation, receiving, and reconciliation inside the application.",
    limit:
      "Supplier price feeds, electronic ordering, and external acknowledgments are not presented as live connections.",
  },
] as const;

function IntegrationsBody() {
  return (
    <>
      <section className="buyer-page__wrap buyer-page__section">
        <SectionHeading
          label="Current scope"
          title="A connection inventory you can use."
        >
          Status describes the implemented software path. It does not confirm
          credentials, partner approval, or live availability for a particular
          clinic.
        </SectionHeading>
        <div className="buyer-page__connections">
          {integrationRows.map((row) => (
            <article key={row.name}>
              <div className="buyer-page__connection-name">
                <h3>{row.name}</h3>
                <Chip label={row.status} size="small" variant="outlined" />
              </div>
              <div>
                <p>{row.detail}</p>
                <p className="buyer-page__detail">
                  <strong>Current limit:</strong> {row.limit}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="buyer-page__band">
        <div className="buyer-page__wrap buyer-page__split">
          <SectionHeading
            label="Planning a connection"
            title="Start with the exchange you need."
          >
            Name the system, the information moving between it and Meta Clinic,
            and the staff action it supports.
          </SectionHeading>
          <div className="buyer-page__reading">
            <h3>What the scope should establish</h3>
            <ul className="buyer-page__checklist">
              <li>Supported provider, account owner, and connection method.</li>
              <li>Fields exchanged, permissions, and applicable agreements.</li>
              <li>Fees, setup work, and vendor prerequisites.</li>
              <li>
                Handling for rejected, delayed, duplicated, or unknown outcomes.
              </li>
              <li>Acceptance evidence and who maintains the connection.</li>
            </ul>
            <p>
              A public developer API, integration service levels, and universal
              vendor compatibility are not offered by this page.
            </p>
            <Actions
              primary="Discuss a required connection"
              primaryHref={marketingUrl("/contact")}
              secondary="Review security"
              secondaryHref={marketingUrl("/security")}
            />
          </div>
        </div>
      </section>
    </>
  );
}

const siteMapGroups = [
  {
    title: "Explore the product",
    description: "See the workspace and the workflows behind it.",
    links: [
      ["Meta Clinic overview", "/meta-clinic"],
      ["Platform", marketingUrl("/platform")],
      ["Workflows", marketingUrl("/platform/workflows")],
      ["AI assistance", marketingUrl("/ai")],
      ["Product tutorials", marketingUrl("/resources")],
    ],
  },
  {
    title: "Evaluate the fit",
    description: "Try the software, then focus a conversation on your clinic.",
    links: [
      ["Try Our Sandbox", "/demo"],
      ["Pricing", marketingUrl("/pricing")],
    ],
  },
  {
    title: "Understand the details",
    description: "Read the current scope and the questions behind rollout.",
    links: [
      ["About Meta Clinic", marketingUrl("/about")],
      ["Security", marketingUrl("/security")],
      ["Integration status", marketingUrl("/integrations")],
      ["Inquiry privacy", marketingUrl("/legal/privacy")],
      ["Contact", marketingUrl("/contact")],
    ],
  },
] as const;

function SiteMapBody() {
  const careModels = Object.entries(clinicTypeLabels).filter(
    ([slug]) => !isUnavailableMarketingPath(`/${slug}`),
  );
  return (
    <>
      <section className="buyer-page__wrap buyer-page__section">
        <nav aria-label="Website directory" className="buyer-page__directory">
          {siteMapGroups.map((group) => (
            <div key={group.title}>
              <h2>{group.title}</h2>
              <p>{group.description}</p>
              <ul>
                {group.links.map(([label, href]) => (
                  <li key={href}>
                    <Link href={href} underline="hover">
                      {label}
                      <ArrowForwardRoundedIcon aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </section>
      <section className="buyer-page__band">
        <div className="buyer-page__wrap">
          <SectionHeading
            label="Product directory"
            title="Find the workflow your team needs."
          />
          <nav
            aria-label="Product feature directory"
            className="buyer-page__directory buyer-page__directory--features"
          >
            {featureGroups.map((group) => (
              <div key={group.heading}>
                <h3>{group.heading}</h3>
                <ul>
                  {group.features
                    .filter(
                      (feature) =>
                        !isUnavailableMarketingPath(featureHref(feature)),
                    )
                    .map((feature) => (
                      <li key={feature.slug}>
                        <Link href={featureHref(feature)} underline="hover">
                          {feature.label}
                          <ArrowForwardRoundedIcon aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </section>
      <section className="buyer-page__wrap buyer-page__section">
        <SectionHeading
          label="Care models"
          title="Explore the clinic context."
        />
        <nav
          aria-label="Care model directory"
          className="buyer-page__care-models"
        >
          {careModels.map(([slug, label]) => (
            <Link key={slug} href={marketingUrl(`/${slug}`)} underline="hover">
              {label}
              <ArrowForwardRoundedIcon aria-hidden="true" />
            </Link>
          ))}
        </nav>
      </section>
    </>
  );
}

export function BuyerInformationPage({ path }: { path: BuyerPath }) {
  const intro = introductions[path];
  return (
    <main id="main" className={`buyer-page buyer-page--${path.slice(1)}`}>
      <section className="buyer-page__hero">
        <div className="buyer-page__wrap">
          <nav aria-label="Breadcrumb" className="buyer-page__breadcrumb">
            <Link href="/meta-clinic" underline="hover">
              Meta Clinic
            </Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{intro.title}</span>
          </nav>
          <p className="buyer-page__eyebrow">{intro.eyebrow}</p>
          <h1>{intro.headline}</h1>
          <p className="buyer-page__lead">{intro.lead}</p>
          {path === "/about" && <Actions />}
          {path === "/pricing" && (
            <Actions
              primary="Request pricing details"
              primaryHref={marketingUrl("/contact")}
              secondary="Try Our Sandbox"
              secondaryHref="/demo"
            />
          )}
          {(path === "/security" || path === "/integrations") && (
            <Link
              className="buyer-page__hero-link"
              href={marketingUrl("/contact")}
              underline="always"
            >
              {path === "/security"
                ? "Ask a security question"
                : "Discuss your required connections"}
            </Link>
          )}
        </div>
      </section>
      {path === "/about" ? (
        <AboutBody />
      ) : path === "/pricing" ? (
        <PricingBody />
      ) : path === "/security" ? (
        <SecurityBody />
      ) : path === "/integrations" ? (
        <IntegrationsBody />
      ) : (
        <SiteMapBody />
      )}
    </main>
  );
}
