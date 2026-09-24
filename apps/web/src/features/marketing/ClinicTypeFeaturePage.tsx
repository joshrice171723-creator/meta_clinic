import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { Button } from "@mui/material";
import { clinicTypeLabels, type ClinicTypeSlug } from "./ClinicTypePages";
import {
  canonicalClinicFeatureSlug,
  clinicTypeFeatureHref,
  clinicTypeToolkits,
} from "./clinicTypeFeatures";
import { marketingFeatures } from "./features";
import { stories } from "./FeatureStoryPages";
import { MembershipWalkthrough } from "./MembershipWalkthrough";
import "./clinicTypeFeaturePage.css";

type AppVisual = {
  src: string;
  alt: string;
  caption: string;
};

const featureVisuals: Record<string, AppVisual> = {
  scheduling: {
    src: "/marketing/captures/schedule-day-omni-morning.png",
    alt: "Meta Clinic day schedule with fictional appointments distributed across rooms and times.",
    caption: "Day schedule · direct synthetic app capture",
  },
  "tracking-board": {
    src: "/marketing/captures/tracking-board-varied-stages-omni.png",
    alt: "Actual Meta Clinic Tracking Board with fictional visits in several stages, room assignments, vitals, care indicators, providers, and timing.",
    caption: "Tracking Board · direct synthetic app capture",
  },
  inventory: {
    src: "/marketing/captures/inventory-catalog-100-products.png",
    alt: "Actual Meta Clinic inventory catalog with fictional products, available quantities, reorder points, and stock actions.",
    caption: "Inventory catalog · direct synthetic app capture",
  },
  "clinical-notes": {
    src: "/marketing/captures/patient-directory-21-natural-records.png",
    alt: "Meta Clinic patient directory with sample records.",
    caption: "Patient directory",
  },
  "cash-billing": {
    src: "/marketing/captures/finance-open-invoice-queue.png",
    alt: "Meta Clinic invoice ledger with synthetic patient balances, dates, and payment states.",
    caption: "Invoice ledger · direct synthetic app capture",
  },
  "memberships-packages": {
    src: "/marketing/captures/membership-catalog-five-programs.png",
    alt: "Actual Meta Clinic membership catalog with five fictional published programs and program descriptions.",
    caption: "Membership catalog · five programs · direct synthetic app capture",
  },
  invoices: {
    src: "/marketing/captures/finance-open-invoice-detail.png",
    alt: "Meta Clinic open invoice showing five synthetic service lines, recorded charges, and its remaining balance.",
    caption: "Invoice detail · direct synthetic app capture",
  },
  telehealth: {
    src: "/marketing/captures/schedule-day-omni-morning.png",
    alt: "Meta Clinic day schedule with sample appointments.",
    caption: "Day schedule",
  },
};

const supportingVisuals: Record<ClinicTypeSlug, AppVisual> = {
  "primary-care": {
    src: "/marketing/captures/patient-directory-21-natural-records.png",
    alt: "Meta Clinic patient list from a synthetic primary care workspace.",
    caption: "Related patient workspace · synthetic clinic capture",
  },
  "membership-care": featureVisuals["memberships-packages"],
  "urgent-care": featureVisuals["tracking-board"],
  "weight-management": featureVisuals["memberships-packages"],
  "hormone-health": featureVisuals.scheduling,
  "behavioral-health": featureVisuals.telehealth,
  "rehabilitation-pt": featureVisuals["memberships-packages"],
  infusion: featureVisuals.inventory,
  aesthetics: featureVisuals.inventory,
};

const flagshipWorkflows: Record<string, { title: string; copy: string }[]> = {
  scheduling: [
    {
      title: "Place the visit",
      copy: "Choose a time that fits the clinician, location, room, and service duration.",
    },
    {
      title: "See the day",
      copy: "Compare day and month views as appointments and resources change.",
    },
    {
      title: "Prepare the handoff",
      copy: "Keep the booked visit connected to arrival and the next team's work.",
    },
  ],
  inventory: [
    {
      title: "Review stock",
      copy: "See recorded quantities and locations before a service needs supplies.",
    },
    {
      title: "Record movement",
      copy: "Keep receiving, use, and corrections in a visible stock history.",
    },
    {
      title: "Plan ahead",
      copy: "Notice the products that need attention before the clinic day begins.",
    },
  ],
  "clinical-notes": [
    {
      title: "Open the encounter",
      copy: "Document within the right patient and visit context.",
    },
    {
      title: "Keep draft state clear",
      copy: "Separate work in progress from reviewed or finalized content.",
    },
    {
      title: "Return to the plan",
      copy: "Carry the recorded next step into follow-up care.",
    },
  ],
};

export function ClinicTypeFeaturePage({
  clinicType,
  requestedSlug,
}: {
  clinicType: ClinicTypeSlug;
  requestedSlug: string;
}) {
  const slug = canonicalClinicFeatureSlug(requestedSlug);
  const toolkit = clinicTypeToolkits[clinicType];
  const item = toolkit.features.find((entry) => entry.slug === slug);
  const feature = marketingFeatures.find((entry) => entry.slug === slug);
  if (!item || !feature) {
    return (
      <main id="main" className="meta-type-feature meta-type-feature__missing">
        <p className="meta-type-feature__eyebrow">
          {clinicTypeLabels[clinicType]} toolkit
        </p>
        <h1>That feature is not in this toolkit.</h1>
        <Button
          href={`/meta-clinic/${clinicType}#features`}
          endIcon={<ArrowForwardRoundedIcon />}
        >
          Explore {clinicTypeLabels[clinicType]} features
        </Button>
      </main>
    );
  }

  const visual = featureVisuals[slug] ?? supportingVisuals[clinicType];
  const workflows = stories[slug]?.workflows ?? flagshipWorkflows[slug] ?? [];
  const otherFeatures = toolkit.features
    .filter((entry) => entry.slug !== slug)
    .slice(0, 3);
  const index = toolkit.features.findIndex((entry) => entry.slug === slug);

  return (
    <main
      id="main"
      className={`meta-type-feature meta-type-feature--${index % 3}`}
    >
      <section className="meta-type-feature__hero meta-type-feature__wrap">
        <div className="meta-type-feature__intro">
          <a
            className="meta-type-feature__crumb"
            href={`/meta-clinic/${clinicType}#features`}
          >
            {clinicTypeLabels[clinicType]} <span aria-hidden="true">/</span>{" "}
            Features
          </a>
          <p className="meta-type-feature__eyebrow">
            {feature.label} for {clinicTypeLabels[clinicType]}
          </p>
          <h1>{item.headline}</h1>
          <p className="meta-type-feature__lead">{item.useCase}</p>
          <Button
            variant="contained"
            href={slug === "memberships-packages" ? "#build-a-membership" : "#see-the-workflow"}
            endIcon={<ArrowForwardRoundedIcon />}
          >
            See the workflow
          </Button>
        </div>
        <figure className="meta-type-feature__hero-photo">
          <img
            src={`/marketing/${toolkit.photos[index % 2]}`}
            alt={`${clinicTypeLabels[clinicType]} clinic team at work.`}
            loading="eager"
          />
          <figcaption>{clinicTypeLabels[clinicType]} in practice</figcaption>
        </figure>
      </section>

      {slug === "memberships-packages" && <MembershipWalkthrough />}

      {slug !== "memberships-packages" && <><section
        className="meta-type-feature__story meta-type-feature__wrap"
        id="see-the-workflow"
      >
        <div className="meta-type-feature__story-copy">
          <p className="meta-type-feature__eyebrow">Inside the workflow</p>
          <h2>{feature.headline}</h2>
          <p>{feature.summary}</p>
        </div>
        <figure className="meta-type-feature__app">
          <img src={visual.src} alt={visual.alt} loading="lazy" />
          <figcaption>
            {visual.caption}
          </figcaption>
        </figure>
      </section>

      <section className="meta-type-feature__steps meta-type-feature__wrap">
        <div className="meta-type-feature__steps-heading">
          <p className="meta-type-feature__eyebrow">How it works</p>
          <h2>
            Three parts of a clearer {feature.label.toLowerCase()} journey.
          </h2>
        </div>
        <div className="meta-type-feature__step-grid">
          {workflows.map((workflow, step) => (
            <article key={workflow.title}>
              <span>0{step + 1}</span>
              <h3>{workflow.title}</h3>
              <p>{workflow.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        className="meta-type-feature__people meta-type-feature__wrap"
        aria-label={`${clinicTypeLabels[clinicType]} clinic photography`}
      >
        <figure>
          <img
            src={`/marketing/${toolkit.photos[(index + 1) % 2]}`}
            alt={`Fictional ${clinicTypeLabels[clinicType]} staff and patient in a clean clinic.`}
            loading="lazy"
          />
          <figcaption>Care works best when the next step is clear.</figcaption>
        </figure>
        <div>
          <p className="meta-type-feature__eyebrow">
            Part of a connected clinic
          </p>
          <h2>Keep the next step close.</h2>
          <p>{toolkit.introduction}</p>
          <a href={`/meta-clinic/${clinicType}#features`}>
            Explore the {clinicTypeLabels[clinicType]} toolkit{" "}
            <ArrowForwardRoundedIcon aria-hidden="true" />
          </a>
        </div>
      </section></>}

      <aside className="meta-type-feature__related meta-type-feature__wrap">
        <p className="meta-type-feature__eyebrow">Explore next</p>
        <h2>More tools for {clinicTypeLabels[clinicType].toLowerCase()}.</h2>
        <div>
          {otherFeatures.map((related) => {
            const relatedFeature = marketingFeatures.find(
              (entry) => entry.slug === related.slug,
            );
            return (
              <a
                key={related.slug}
                href={clinicTypeFeatureHref(clinicType, related.slug)}
              >
                <span>
                  {relatedFeature?.label}
                  <small>{related.headline}</small>
                </span>
                <ArrowForwardRoundedIcon aria-hidden="true" />
              </a>
            );
          })}
        </div>
      </aside>
    </main>
  );
}
