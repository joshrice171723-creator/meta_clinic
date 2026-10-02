import { useEffect, useState } from "react";
import { Button, IconButton, Popover } from "@mui/material";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { FlagshipFeaturePage, isFlagshipSlug } from "./FlagshipFeaturePages";
import { FeatureStoryPage } from "./FeatureStoryPages";
import { ClinicTypeFeaturePage } from "./ClinicTypeFeaturePage";
import {
  ClinicTypePage,
  clinicTypeLabels,
  isClinicTypeSlug,
} from "./ClinicTypePages";
import {
  canonicalClinicFeatureSlug,
  clinicTypeFeatureHref,
  clinicTypeToolkits,
} from "./clinicTypeFeatures";
import { featureGroups, featureHref, marketingFeatures } from "./features";
import "./metaClinicMarketing.css";

const workflow = [
  {
    number: "01",
    title: "Inquiry and access",
    description:
      "Make the requested service and the next booking step clear to the patient and front desk.",
  },
  {
    number: "02",
    title: "Intake and preparation",
    description:
      "Collect relevant information and show staff what needs review before the appointment.",
  },
  {
    number: "03",
    title: "Scheduling and arrival",
    description:
      "Connect the visit time, team, and resources to the day-of-visit work.",
  },
  {
    number: "04",
    title: "The clinical visit",
    description:
      "Give the authorized care team the patient context and a place to document its decisions.",
  },
  {
    number: "05",
    title: "Payment and operations",
    description:
      "Keep charges, membership questions, or supply work visible to the people who own them.",
  },
  {
    number: "06",
    title: "Follow-through",
    description:
      "Record the next contact and open tasks so the journey does not end at checkout.",
  },
];

const priorityClinics = [
  {
    name: "Weight loss",
    href: "/meta-clinic/weight-loss",
    detail:
      "Connect program intake, remote visits, clinician review, membership administration, and follow-up.",
  },
  {
    name: "Behavioral health",
    href: "/meta-clinic/behavioral-health",
    detail:
      "Coordinate recurring sessions, documentation, patient communication, and the next agreed step.",
  },
  {
    name: "Cash-pay care",
    href: "/meta-clinic/primary-care/cash-pay",
    detail:
      "Make service terms, booking, the visit, payment questions, and follow-through easier to follow.",
  },
];

const productTour = [
  {
    name: "Clinic dashboard",
    detail: "Start with today's work and the items that need an owner.",
    href: "/meta-clinic/platform/tasks",
  },
  {
    name: "Schedule",
    detail:
      "Trace a booking into the people and resources required for the visit.",
    href: "/meta-clinic/platform/scheduling",
  },
  {
    name: "Patient chart",
    detail:
      "Inspect the visit context and the documentation the care team reviews.",
    href: "/meta-clinic/platform/clinical-documentation",
  },
  {
    name: "Intake",
    detail: "See what a patient submits and what staff still need to check.",
    href: "/meta-clinic/platform/patient-intake",
  },
  {
    name: "Inventory",
    detail: "Follow a supply question into the relevant clinic workflow.",
    href: "/meta-clinic/platform/inventory",
  },
  {
    name: "Billing",
    detail:
      "Review how a charge, invoice, or payment question reaches the right team.",
    href: "/meta-clinic/platform/billing",
  },
];

const benefits = [
  {
    title: "A connected patient journey",
    detail:
      "See how access, intake, scheduling, the visit, and follow-up pass between patients and staff.",
    href: "/meta-clinic/platform",
  },
  {
    title: "A clearer clinic day",
    detail:
      "Give front desk, clinical, and operations teams context for the work each role owns.",
    href: "/meta-clinic/platform/workflows",
  },
  {
    title: "Assistance with human review",
    detail:
      "Evaluate AI-assisted work with its source information, reviewer, and limits made explicit.",
    href: "/meta-clinic/ai",
  },
  {
    title: "Fit for your care model",
    detail:
      "Start with a specialty workflow and review what is available for your clinic's setting.",
    href: "/meta-clinic/site-map",
  },
];

const buyerQuestions = [
  {
    title: "Security and data",
    detail:
      "Request current, scoped evidence for access, privacy, and the agreements that apply.",
    href: "/meta-clinic/security",
  },
  {
    title: "Integrations and migration",
    detail:
      "Confirm each data flow, existing system handoff, and current vendor connection before planning a change.",
    href: "/meta-clinic/integrations",
  },
  {
    title: "Implementation and support",
    detail:
      "Use a walkthrough to define roles, setup work, training needs, and the help path for your team.",
    href: "/meta-clinic/book-demo",
  },
  {
    title: "Pricing and scope",
    detail:
      "Discuss the clinic model and proposed capabilities before reviewing a written commercial offer.",
    href: "/meta-clinic/pricing",
  },
];

const homeQuestions = [
  {
    question: "Can we see a workflow for our specialty?",
    answer:
      "Start with a specialty page and use the synthetic demo to inspect the current interface. A live walkthrough can focus on your own roles and exception cases.",
  },
  {
    question: "Does the software make clinical decisions?",
    answer:
      "Clinical assessment, treatment, prescribing, and approval remain with appropriately authorized people. Assisted outputs require review in the applicable workflow.",
  },
  {
    question: "Are every feature and integration available today?",
    answer:
      "No page alone establishes availability. Confirm the exact product behavior, configuration, external connection, and agreement scope during evaluation.",
  },
];

const clinicGroups: {
  heading: string;
  types: { name: string; detail: string; slug?: string }[];
}[] = [
  {
    heading: "Everyday & access care",
    types: [
      {
        name: "Primary care",
        slug: "primary-care",
        detail:
          "Visits, chart context, results, billing, and follow-up shaped around the services a practice offers.",
      },
      {
        name: "Membership care",
        slug: "membership-care",
        detail:
          "A primary-care workflow with a configured membership and access model alongside visits and follow-up.",
      },
      {
        name: "Urgent care",
        slug: "urgent-care",
        detail:
          "Walk-in arrival, episodic visits, capacity, and discharge follow-up in one operational flow.",
      },
    ],
  },
  {
    heading: "Ongoing care",
    types: [
      {
        name: "Weight management",
        slug: "weight-management",
        detail:
          "Intake, visits, measurements, labs, offers, and follow-up composed around a clinic's program.",
      },
      {
        name: "Hormone health",
        slug: "hormone-health",
        detail:
          "Clinic-selected intake, longitudinal monitoring, labs, medication workflows, and follow-up.",
      },
      {
        name: "Behavioral health",
        slug: "behavioral-health",
        detail:
          "Sessions, documentation, communication, and goals organized for the practice's model of care.",
      },
      {
        name: "Rehabilitation & PT",
        slug: "rehabilitation-pt",
        detail:
          "Planned visit series, progress, scheduling, and care tasks with the resources the practice uses.",
      },
    ],
  },
  {
    heading: "Treatment & procedure care",
    types: [
      {
        name: "Infusion",
        slug: "infusion",
        detail:
          "Scheduling, supply visibility, and financial follow-through today, with infusion-specific workflows to shape around your clinic.",
      },
      {
        name: "Aesthetics",
        slug: "aesthetics",
        detail:
          "Appointments, procedure documentation, rooms or equipment, inventory, and packages where selected.",
      },
    ],
  },
];

const clinicTypes = clinicGroups.flatMap((group) => group.types);

export function MetaClinicMarketing({
  featureSlug,
  clinicTypeSlug,
}: {
  featureSlug?: string;
  clinicTypeSlug?: string;
}) {
  const activeClinicType =
    clinicTypeSlug && isClinicTypeSlug(clinicTypeSlug)
      ? clinicTypeSlug
      : undefined;
  const canonicalFeatureSlug = featureSlug
    ? canonicalClinicFeatureSlug(featureSlug)
    : undefined;
  const feature = marketingFeatures.find(
    (item) => item.slug === canonicalFeatureSlug,
  );
  const visibleFeatureGroups = activeClinicType
    ? featureGroups
        .map((group) => ({
          ...group,
          features: group.features.filter((item) =>
            clinicTypeToolkits[activeClinicType].features.some(
              (selected) => selected.slug === item.slug,
            ),
          ),
        }))
        .filter((group) => group.features.length > 0)
    : featureGroups;
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [selectedClinic, setSelectedClinic] = useState(clinicTypes[0]);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const toggleTool = (tool: string) => {
    setSelectedTools((current) =>
      current.includes(tool)
        ? current.filter((selected) => selected !== tool)
        : [...current, tool],
    );
  };
  useEffect(() => {
    const previousTitle = document.title;
    document.title =
      activeClinicType && feature
        ? `${feature.label} for ${clinicTypeLabels[activeClinicType]} — Meta Clinic`
        : activeClinicType
          ? `${clinicTypeLabels[activeClinicType]} — Meta Clinic`
          : feature
            ? `${feature.label} — Meta Clinic`
            : "Meta Clinic — A more connected clinic day";
    return () => {
      document.title = previousTitle;
    };
  }, [feature, activeClinicType]);

  return (
    <div className="meta-marketing">
      <a className="meta-marketing__skip" href="#main">
        Skip to content
      </a>
      <header className="meta-marketing__header">
        <a
          className="meta-marketing__brand"
          href="/meta-clinic"
          aria-label="Meta Clinic home"
        >
          <span className="meta-marketing__brand-mark" aria-hidden="true">
            <span />
            <span />
          </span>
          Meta Clinic
        </a>
        <nav className="meta-marketing__nav" aria-label="Main navigation">
          <a href="/meta-clinic/platform">Platform</a>
          <details className="meta-marketing__nav-menu">
            <summary>Specialties</summary>
            <div>
              <a href="/meta-clinic#clinic-types">Explore clinic types</a>
              <a href="/meta-clinic/weight-loss">Weight loss</a>
              <a href="/meta-clinic/behavioral-health">Behavioral health</a>
              <a href="/meta-clinic/primary-care/cash-pay">Cash-pay care</a>
              <a href="/meta-clinic/infusion">Infusion</a>
            </div>
          </details>
          <Button
            className="meta-marketing__nav-button"
            aria-controls={
              menuAnchor ? "meta-marketing-feature-menu" : undefined
            }
            aria-expanded={Boolean(menuAnchor)}
            aria-haspopup="dialog"
            onClick={(event) => setMenuAnchor(event.currentTarget)}
          >
            Features <span aria-hidden="true">⌄</span>
          </Button>
          <a href="/meta-clinic/ai">AI</a>
          <a href="/meta-clinic/security">Security</a>
          <a href="/meta-clinic/pricing">Pricing</a>
          <a href="/meta-clinic/resources">Resources</a>
          <a className="meta-marketing__mobile-sign-in" href="/login">
            Sign in
          </a>
        </nav>
        <Button
          className="meta-marketing__sign-in"
          href="/login"
          variant="outlined"
        >
          Sign in
        </Button>
        <Button
          className="meta-marketing__book-demo"
          href="/meta-clinic/book-demo"
          variant="contained"
        >
          Book a demo
        </Button>
      </header>

      <Popover
        id="meta-marketing-feature-menu"
        open={Boolean(menuAnchor)}
        anchorEl={menuAnchor}
        onClose={() => setMenuAnchor(null)}
        slotProps={{
          paper: { role: "dialog", "aria-label": "Features" },
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
      >
        <nav className="meta-marketing__mega" aria-label="Features">
          {visibleFeatureGroups.map((group) => (
            <div key={group.heading}>
              <h2>{group.heading}</h2>
              {group.features.map((item) => (
                <a
                  key={item.slug}
                  href={
                    activeClinicType
                      ? clinicTypeFeatureHref(activeClinicType, item.slug)
                      : featureHref(item)
                  }
                  onClick={() => setMenuAnchor(null)}
                >
                  <span
                    className="meta-marketing__mega-icon"
                    aria-hidden="true"
                  >
                    ↗
                  </span>
                  {item.label}
                </a>
              ))}
            </div>
          ))}
        </nav>
      </Popover>

      {activeClinicType && featureSlug ? (
        <ClinicTypeFeaturePage
          clinicType={activeClinicType}
          requestedSlug={featureSlug}
        />
      ) : activeClinicType ? (
        <ClinicTypePage slug={activeClinicType} />
      ) : featureSlug ? (
        isFlagshipSlug(featureSlug) ? (
          <FlagshipFeaturePage slug={featureSlug} />
        ) : feature ? (
          <FeatureStoryPage slug={featureSlug} />
        ) : (
          <main
            id="main"
            className="meta-marketing__feature-missing meta-marketing__section"
          >
            <p className="meta-marketing__eyebrow">Feature not found</p>
            <h1>That feature page is not here.</h1>
            <Button
              href="/meta-clinic#tools"
              endIcon={<ArrowForwardRoundedIcon />}
            >
              Browse features
            </Button>
          </main>
        )
      ) : (
        <main id="main">
          <section
            className="meta-marketing__hero"
            aria-labelledby="meta-marketing-title"
          >
            <div className="meta-marketing__hero-copy">
              <p className="meta-marketing__eyebrow">
                Connected software for independent clinics
              </p>
              <h1 id="meta-marketing-title">
                Run your clinic from <em>one connected platform.</em>
              </h1>
              <p className="meta-marketing__lead">
                Connect intake, scheduling, visits, payments, and follow-up in
                one clinic workflow. Explore how it can fit weight loss,
                behavioral health, and cash-pay care.
              </p>
              <div className="meta-marketing__actions">
                <Button
                  className="meta-marketing__button-primary"
                  href="/meta-clinic/demo"
                  variant="contained"
                  endIcon={<ArrowForwardRoundedIcon />}
                >
                  Explore the demo
                </Button>
                <Button
                  className="meta-marketing__button-secondary"
                  href="/meta-clinic/book-demo"
                  variant="outlined"
                >
                  Book a demo
                </Button>
              </div>
              <div className="meta-marketing__hero-note">
                <span
                  className="meta-marketing__note-line"
                  aria-hidden="true"
                />
                The guided demo uses synthetic records. Confirm current feature
                scope in a walkthrough.
              </div>
            </div>

            <figure className="meta-marketing__hero-capture">
              <a
                href="/meta-clinic/demo"
                aria-label="Open the guided demo after viewing the clinic schedule"
              >
                <img
                  src="/marketing/scheduling-month.png"
                  alt="Meta Clinic month schedule showing remote and in-person synthetic appointments"
                />
              </a>
              <figcaption>
                Clinic schedule from the synthetic Meta Clinic demo
              </figcaption>
            </figure>
          </section>

          <div
            className="meta-marketing__values"
            aria-label="Platform principles"
          >
            <span>People first</span>
            <span>Clear next steps</span>
            <span>Connected care work</span>
          </div>

          <section
            className="meta-marketing__growth-section meta-marketing__section"
            aria-labelledby="meta-tour-title"
          >
            <p className="meta-marketing__eyebrow">Explore the product</p>
            <h2 id="meta-tour-title">See the work behind a clinic day.</h2>
            <p className="meta-marketing__growth-intro">
              Open the guided synthetic demo or explore the areas your team
              needs to evaluate. Each view should be checked against your
              clinic's process in a walkthrough.
            </p>
            <div className="meta-marketing__growth-grid meta-marketing__growth-grid--three">
              {productTour.map((screen) => (
                <article key={screen.name}>
                  <h3>{screen.name}</h3>
                  <p>{screen.detail}</p>
                  <a href={screen.href}>
                    Explore {screen.name.toLowerCase()}
                    <ArrowForwardRoundedIcon aria-hidden="true" />
                  </a>
                </article>
              ))}
            </div>
            <Button
              href="/meta-clinic/demo"
              endIcon={<ArrowForwardRoundedIcon />}
            >
              Open the guided demo
            </Button>
          </section>

          <section
            className="meta-marketing__growth-section meta-marketing__section"
            aria-labelledby="meta-priority-title"
          >
            <p className="meta-marketing__eyebrow">
              Start with your care model
            </p>
            <h2 id="meta-priority-title">
              Explore the clinic workflows built around your day.
            </h2>
            <div className="meta-marketing__growth-grid meta-marketing__growth-grid--three">
              {priorityClinics.map((clinic) => (
                <article key={clinic.href}>
                  <h3>{clinic.name}</h3>
                  <p>{clinic.detail}</p>
                  <a href={clinic.href}>
                    Explore {clinic.name}
                    <ArrowForwardRoundedIcon aria-hidden="true" />
                  </a>
                </article>
              ))}
            </div>
          </section>

          <section
            className="meta-marketing__clinics meta-marketing__section"
            id="clinic-types"
          >
            <div className="meta-marketing__section-heading">
              <p className="meta-marketing__eyebrow">Find your fit</p>
              <h2>What kind of clinic are you building?</h2>
              <p>
                Different practices need different workflows. Start with your
                care model, then shape the tools around it.
              </p>
            </div>
            <div className="meta-marketing__clinic-groups">
              {clinicGroups.map((group) => (
                <div
                  className="meta-marketing__clinic-group"
                  key={group.heading}
                >
                  <h3>{group.heading}</h3>
                  <div className="meta-marketing__clinic-buttons">
                    {group.types.map((clinic) => (
                      <Button
                        key={clinic.name}
                        className="meta-marketing__clinic-button"
                        href={
                          clinic.slug
                            ? `/meta-clinic/${clinic.slug}`
                            : undefined
                        }
                        onClick={
                          clinic.slug
                            ? undefined
                            : () => setSelectedClinic(clinic)
                        }
                        aria-pressed={
                          clinic.slug
                            ? undefined
                            : selectedClinic.name === clinic.name
                        }
                        endIcon={<ArrowForwardRoundedIcon />}
                      >
                        {clinic.name}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="meta-marketing__clinic-detail" aria-live="polite">
              <div>
                <span>Explore a care model</span>
                <h3>{selectedClinic.name}</h3>
              </div>
              <div className="meta-marketing__clinic-detail-copy">
                <p>{selectedClinic.detail}</p>
                {selectedClinic.slug && (
                  <Button
                    href={`/meta-clinic/${selectedClinic.slug}`}
                    endIcon={<ArrowForwardRoundedIcon />}
                  >
                    Explore {selectedClinic.name}
                  </Button>
                )}
              </div>
            </div>
            <p className="meta-marketing__clinic-note">
              Telehealth can be part of a compatible clinic model without
              requiring a physical front desk.
            </p>
          </section>

          <section
            className="meta-marketing__platform meta-marketing__section"
            id="platform"
          >
            <div className="meta-marketing__section-heading">
              <p className="meta-marketing__eyebrow">The platform</p>
              <h2>Designed for the whole clinic day.</h2>
            </div>
            <p>
              A clinic is more than a calendar or a chart. Meta Clinic is shaped
              around the handoffs between people, visits, operations, and the
              work that continues afterward.
            </p>
          </section>

          <section
            className="meta-marketing__growth-section meta-marketing__section"
            aria-labelledby="meta-benefits-title"
          >
            <p className="meta-marketing__eyebrow">Why the workflow matters</p>
            <h2 id="meta-benefits-title">
              Give each part of the clinic day a clear next step.
            </h2>
            <div className="meta-marketing__growth-grid">
              {benefits.map((benefit) => (
                <article key={benefit.title}>
                  <h3>{benefit.title}</h3>
                  <p>{benefit.detail}</p>
                  <a href={benefit.href}>
                    Explore this area
                    <ArrowForwardRoundedIcon aria-hidden="true" />
                  </a>
                </article>
              ))}
            </div>
          </section>

          <section
            className="meta-marketing__tools meta-marketing__section"
            id="tools"
          >
            <div className="meta-marketing__section-heading">
              <p className="meta-marketing__eyebrow">Build your toolkit</p>
              <h2>The right tools for your way of caring.</h2>
              <p>
                Explore capabilities across the clinic day. Your specialty,
                delivery model, and payment model can be combined rather than
                bundled into one fixed package.
              </p>
            </div>
            <div className="meta-marketing__tool-groups">
              {featureGroups.map((group) => (
                <div className="meta-marketing__tool-group" key={group.heading}>
                  <h3>{group.heading}</h3>
                  <div>
                    {group.features.map((tool) => (
                      <div className="meta-marketing__tool-row" key={tool.slug}>
                        <a href={featureHref(tool)}>
                          {tool.label}
                          <ArrowForwardRoundedIcon aria-hidden="true" />
                        </a>
                        <IconButton
                          aria-label={`${selectedTools.includes(tool.label) ? "Remove" : "Add"} ${tool.label} ${selectedTools.includes(tool.label) ? "from" : "to"} toolkit preview`}
                          aria-pressed={selectedTools.includes(tool.label)}
                          onClick={() => toggleTool(tool.label)}
                        >
                          {selectedTools.includes(tool.label) ? "−" : "+"}
                        </IconButton>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="meta-marketing__tool-summary" aria-live="polite">
              <div>
                <span>Your toolkit preview</span>
                <strong>
                  {selectedTools.length === 0
                    ? "Choose a tool to start"
                    : `${selectedTools.length} selected`}
                </strong>
              </div>
              <p>
                {selectedTools.length === 0
                  ? "Select capabilities above to explore a combination."
                  : selectedTools.join(" · ")}
              </p>
              {selectedTools.length > 0 && (
                <Button onClick={() => setSelectedTools([])}>
                  Clear selection
                </Button>
              )}
            </div>
            <p className="meta-marketing__tool-note">
              This preview does not change a clinic&apos;s configuration.
              Available workflows and setup depend on the clinic&apos;s actual
              needs.
            </p>
          </section>

          <section
            className="meta-marketing__workflow meta-marketing__section"
            id="workflow"
          >
            <div className="meta-marketing__section-heading">
              <p className="meta-marketing__eyebrow">How it works</p>
              <h2>From first contact to the next step.</h2>
            </div>
            <div className="meta-marketing__workflow-grid">
              {workflow.map((step) => (
                <article key={step.number}>
                  <span>{step.number}</span>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </article>
              ))}
            </div>
          </section>

          <section
            className="meta-marketing__growth-section meta-marketing__section"
            aria-labelledby="meta-comparison-title"
          >
            <p className="meta-marketing__eyebrow">A workflow to evaluate</p>
            <h2 id="meta-comparison-title">
              Follow one patient journey across the handoffs.
            </h2>
            <div className="meta-marketing__comparison">
              <article>
                <h3>When work is spread across tools</h3>
                <p>
                  Staff may need to check separate places for the booking,
                  submitted intake, visit context, payment question, and open
                  follow-up.
                </p>
                <p>
                  The evaluation question is where information gets repeated,
                  delayed, or lost between owners.
                </p>
              </article>
              <article>
                <h3>What to inspect in Meta Clinic</h3>
                <p>
                  Use one synthetic journey to inspect scheduling, staff review,
                  the visit, payment context, and the next recorded task in
                  sequence.
                </p>
                <p>
                  Confirm each available screen and handoff against your
                  clinic’s actual process before planning a change.
                </p>
              </article>
            </div>
            <Button
              href="/meta-clinic/demo"
              endIcon={<ArrowForwardRoundedIcon />}
            >
              Open the guided demo
            </Button>
          </section>

          <section
            className="meta-marketing__audience meta-marketing__section"
            id="who-its-for"
          >
            <div>
              <p className="meta-marketing__eyebrow">Who it&apos;s for</p>
              <h2>
                Made for independent clinics with their own way of working.
              </h2>
            </div>
            <div>
              <p>
                From the people greeting patients to the clinicians delivering
                care, each team needs the right context for its part of the day.
                Meta Clinic is designed to support different specialties and
                care models without losing a connected core.
              </p>
              <Button
                className="meta-marketing__audience-link"
                href="#main"
                endIcon={<ArrowForwardRoundedIcon />}
              >
                Back to the beginning
              </Button>
            </div>
          </section>

          <section
            className="meta-marketing__growth-section meta-marketing__section"
            aria-labelledby="meta-proof-title"
          >
            <p className="meta-marketing__eyebrow">Evaluate with evidence</p>
            <h2 id="meta-proof-title">
              See the current product and ask what is available.
            </h2>
            <div className="meta-marketing__comparison">
              <article>
                <h3>Walk through the interface</h3>
                <p>
                  The guided demo uses synthetic records so your team can
                  inspect screens and handoffs without patient data.
                </p>
                <a href="/meta-clinic/demo">
                  Explore the guided demo{" "}
                  <ArrowForwardRoundedIcon aria-hidden="true" />
                </a>
              </article>
              <article>
                <h3>Review the people and scope</h3>
                <p>
                  Learn about the team, then confirm feature availability,
                  setup, and support for your care model in a live conversation.
                </p>
                <a href="/meta-clinic/about">
                  About Meta Clinic{" "}
                  <ArrowForwardRoundedIcon aria-hidden="true" />
                </a>
              </article>
            </div>
          </section>

          <section
            className="meta-marketing__growth-section meta-marketing__section"
            aria-labelledby="meta-evaluation-title"
          >
            <p className="meta-marketing__eyebrow">For the buying team</p>
            <h2 id="meta-evaluation-title">
              Bring the hard questions into the walkthrough.
            </h2>
            <div className="meta-marketing__growth-grid">
              {buyerQuestions.map((item) => (
                <article key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.detail}</p>
                  <a href={item.href}>
                    Review this topic
                    <ArrowForwardRoundedIcon aria-hidden="true" />
                  </a>
                </article>
              ))}
            </div>
          </section>

          <section
            className="meta-marketing__growth-section meta-marketing__section"
            aria-labelledby="meta-questions-title"
          >
            <p className="meta-marketing__eyebrow">Common questions</p>
            <h2 id="meta-questions-title">
              Know what to verify before choosing software.
            </h2>
            <div className="meta-marketing__home-faq">
              {homeQuestions.map((item) => (
                <article key={item.question}>
                  <h3>{item.question}</h3>
                  <p>{item.answer}</p>
                </article>
              ))}
            </div>
          </section>

          <section
            className="meta-marketing__growth-close meta-marketing__section"
            aria-labelledby="meta-close-title"
          >
            <p className="meta-marketing__eyebrow">Next step</p>
            <h2 id="meta-close-title">See the workflow for your clinic.</h2>
            <p>
              Explore the synthetic demo, then bring one patient journey and
              your team’s questions to a focused walkthrough.
            </p>
            <div className="meta-marketing__actions">
              <Button
                className="meta-marketing__button-primary"
                href="/meta-clinic/demo"
                variant="contained"
              >
                Explore the demo
              </Button>
              <Button
                className="meta-marketing__button-secondary"
                href="/meta-clinic/book-demo"
                variant="outlined"
              >
                Book a demo
              </Button>
            </div>
          </section>
        </main>
      )}

      <footer className="meta-marketing__footer">
        <div className="meta-marketing__footer-intro">
          <a className="meta-marketing__brand" href="/meta-clinic">
            Meta Clinic
          </a>
          <p>Connected software for independent clinics.</p>
        </div>
        <nav aria-label="Product links">
          <strong>Product</strong>
          <a href="/meta-clinic/platform">Platform</a>
          <a href="/meta-clinic/ai">AI</a>
          <a href="/meta-clinic/demo">Demo</a>
          <a href="/meta-clinic/pricing">Pricing</a>
        </nav>
        <nav aria-label="Specialty links">
          <strong>Specialties</strong>
          <a href="/meta-clinic/weight-loss">Weight loss</a>
          <a href="/meta-clinic/behavioral-health">Behavioral health</a>
          <a href="/meta-clinic/primary-care/cash-pay">Cash-pay care</a>
          <a href="/meta-clinic/infusion">Infusion</a>
        </nav>
        <nav aria-label="Resource links">
          <strong>Explore</strong>
          <a href="/meta-clinic/resources">Resources</a>
          <a href="/meta-clinic/sandbox">Sandbox</a>
          <a href="/meta-clinic/site-map">Site map</a>
        </nav>
        <nav aria-label="Company links">
          <strong>Company</strong>
          <a href="/meta-clinic/about">About</a>
          <a href="/meta-clinic/security">Security</a>
          <a href="/meta-clinic/contact">Contact</a>
          <a href="/login">Sign in</a>
        </nav>
      </footer>
    </div>
  );
}
