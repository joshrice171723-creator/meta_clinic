import { useEffect, useState } from "react";
import { Button, IconButton, Popover } from "@mui/material";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import LocalFloristOutlinedIcon from "@mui/icons-material/LocalFloristOutlined";
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
    title: "A clear beginning",
    description:
      "Bring scheduling, arrival, and intake into a more understandable front-desk flow.",
  },
  {
    number: "02",
    title: "Context for the visit",
    description:
      "Give the care team a connected view of the work in front of them and the next step.",
  },
  {
    number: "03",
    title: "Follow-through that stays visible",
    description:
      "Keep outstanding work and follow-up in view after the appointment ends.",
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
          <a href="/meta-clinic#platform">Platform</a>
          <a href="/meta-clinic#clinic-types">Clinic types</a>
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
          <a href="/meta-clinic#workflow">How it works</a>
        </nav>
        <Button
          className="meta-marketing__sign-in"
          href="/login"
          variant="outlined"
        >
          Sign in
        </Button>
      </header>

      <Popover
        id="meta-marketing-feature-menu"
        open={Boolean(menuAnchor)}
        anchorEl={menuAnchor}
        onClose={() => setMenuAnchor(null)}
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
                A more connected clinic day
              </p>
              <h1 id="meta-marketing-title">
                Care, connected from the <em>first hello.</em>
              </h1>
              <p className="meta-marketing__lead">
                Meta Clinic brings the front desk, the visit, and what comes
                next into one thoughtful workspace. One connected foundation,
                shaped for different kinds of independent clinics.
              </p>
              <div className="meta-marketing__actions">
                <Button
                  className="meta-marketing__button-primary"
                  href="#platform"
                  variant="contained"
                  endIcon={<ArrowForwardRoundedIcon />}
                >
                  Explore the platform
                </Button>
                <Button
                  className="meta-marketing__button-secondary"
                  href="#workflow"
                  variant="outlined"
                >
                  See how it works
                </Button>
              </div>
              <div className="meta-marketing__hero-note">
                <span
                  className="meta-marketing__note-line"
                  aria-hidden="true"
                />
                Built around the way real clinic days move.
              </div>
            </div>

            <div
              className="meta-marketing__visual"
              aria-label="Illustrative clinic workflow"
            >
              <div className="meta-marketing__visual-orbit meta-marketing__visual-orbit--one" />
              <div className="meta-marketing__visual-orbit meta-marketing__visual-orbit--two" />
              <div className="meta-marketing__visual-disc" />
              <div className="meta-marketing__preview">
                <div className="meta-marketing__preview-top">
                  <span className="meta-marketing__preview-brand">
                    Meta Clinic
                  </span>
                  <span className="meta-marketing__preview-tag">
                    Clinic workspace
                  </span>
                </div>
                <div className="meta-marketing__preview-body">
                  <div
                    className="meta-marketing__preview-side"
                    aria-hidden="true"
                  >
                    <span className="meta-marketing__preview-side-active" />
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="meta-marketing__preview-main">
                    <p className="meta-marketing__preview-kicker">
                      Today&apos;s flow
                    </p>
                    <h2>One view of what&apos;s next.</h2>
                    <div className="meta-marketing__preview-rule" />
                    <div className="meta-marketing__preview-row">
                      <span className="meta-marketing__preview-icon">
                        <CalendarMonthOutlinedIcon />
                      </span>
                      <div>
                        <strong>Welcome</strong>
                        <small>Scheduling and arrival</small>
                      </div>
                      <span className="meta-marketing__preview-arrow">↗</span>
                    </div>
                    <div className="meta-marketing__preview-row">
                      <span className="meta-marketing__preview-icon">
                        <AssignmentOutlinedIcon />
                      </span>
                      <div>
                        <strong>Care</strong>
                        <small>Visit context and next steps</small>
                      </div>
                      <span className="meta-marketing__preview-arrow">↗</span>
                    </div>
                    <div className="meta-marketing__preview-row">
                      <span className="meta-marketing__preview-icon">
                        <ForumOutlinedIcon />
                      </span>
                      <div>
                        <strong>Follow-through</strong>
                        <small>Open work stays visible</small>
                      </div>
                      <span className="meta-marketing__preview-arrow">↗</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="meta-marketing__floating-card">
                <span className="meta-marketing__floating-icon">
                  <LocalFloristOutlinedIcon />
                </span>
                <div>
                  <strong>Every step, in context.</strong>
                  <span>A calmer way to keep work moving.</span>
                </div>
              </div>
              <p className="meta-marketing__visual-caption">
                Illustrative workflow
              </p>
            </div>
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
        </main>
      )}

      <footer className="meta-marketing__footer">
        <a className="meta-marketing__brand" href="/meta-clinic">
          Meta Clinic
        </a>
        <span>Thoughtful software for independent clinics.</span>
        <a href="/login">Sign in</a>
      </footer>
    </div>
  );
}
