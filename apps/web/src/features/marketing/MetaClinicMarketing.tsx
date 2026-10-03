import { useEffect, type ReactNode } from "react";
import { Button } from "@mui/material";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { FlagshipFeaturePage, isFlagshipSlug } from "./FlagshipFeaturePages";
import { FeatureStoryPage } from "./FeatureStoryPages";
import { ClinicTypeFeaturePage } from "./ClinicTypeFeaturePage";
import {
  ClinicTypePage,
  clinicTypeLabels,
  isClinicTypeSlug,
} from "./ClinicTypePages";
import { canonicalClinicFeatureSlug } from "./clinicTypeFeatures";
import { featureGroups, featureHref, marketingFeatures } from "./features";
import { MarketingHeader } from "./MarketingHeader";
import { ProductWalkthrough } from "./ProductWalkthrough";
import { useMarketingMetadata } from "./useMarketingMetadata";
import "./metaClinicMarketing.css";

const careModels = [
  {
    name: "Primary care",
    href: "/meta-clinic/primary-care",
    detail:
      "From a visit request to reviewed intake, documentation, and follow-up.",
  },
  {
    name: "Membership care",
    href: "/meta-clinic/membership-care",
    detail: "Build a program, define the offer, and see what patients choose.",
  },
  {
    name: "Urgent care",
    href: "/meta-clinic/urgent-care",
    detail: "Keep arrival, room, provider, and the next handoff in view.",
  },
  {
    name: "Weight management",
    href: "/meta-clinic/weight-loss",
    detail: "Connect program setup, recorded results, and the next check-in.",
  },
  {
    name: "Behavioral health",
    href: "/meta-clinic/behavioral-health",
    detail: "Bring session preparation, documentation, and follow-up together.",
  },
  {
    name: "Cash-pay care",
    href: "/meta-clinic/primary-care/cash-pay",
    detail: "Follow charges, payments, credits, and the remaining balance.",
  },
];

export function MetaClinicMarketing({
  featureSlug,
  clinicTypeSlug,
  children,
  title,
  unavailable = false,
}: {
  featureSlug?: string;
  clinicTypeSlug?: string;
  children?: ReactNode;
  title?: string;
  unavailable?: boolean;
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
  useMarketingMetadata({
    title:
      title ??
      (unavailable
        ? "Page not available - Meta Clinic"
        : activeClinicType && feature
          ? `${feature.label} for ${clinicTypeLabels[activeClinicType]} - Meta Clinic`
          : feature
            ? `${feature.label} — Meta Clinic`
            : activeClinicType
              ? `${clinicTypeLabels[activeClinicType]} — Meta Clinic`
              : "Meta Clinic — A connected clinic day"),
    description:
      feature?.summary ??
      (activeClinicType
        ? `Explore ${clinicTypeLabels[activeClinicType].toLowerCase()} workflows with product screens, practical steps, and a working clinic demo.`
        : "Connect scheduling, intake, visit documentation, cash billing, memberships, inventory, and follow-up in one clinic workspace."),
    path: window.location.pathname,
  });
  useEffect(() => {
    if (!unavailable) return;
    const existing = document.querySelector<HTMLMetaElement>(
      'meta[name="robots"]',
    );
    const robots = existing ?? document.createElement("meta");
    const previousContent = robots.getAttribute("content");
    robots.name = "robots";
    robots.content = "noindex,nofollow";
    if (!existing) document.head.appendChild(robots);
    return () => {
      if (!existing) robots.remove();
      else if (previousContent === null) robots.removeAttribute("content");
      else robots.content = previousContent;
    };
  }, [unavailable]);

  return (
    <div className="meta-marketing">
      <a className="meta-marketing__skip" href="#main">
        Skip to content
      </a>
      <MarketingHeader activeClinicType={activeClinicType} />

      {unavailable ? (
        <main
          id="main"
          className="meta-marketing__feature-missing meta-marketing__section"
        >
          <p className="meta-marketing__eyebrow">Page not available</p>
          <h1>This page is not available.</h1>
          <p>Explore the current product tutorials.</p>
          <Button
            href="/meta-clinic/resources"
            endIcon={<ArrowForwardRoundedIcon />}
          >
            Browse tutorials
          </Button>
        </main>
      ) : children ? (
        children
      ) : activeClinicType && featureSlug ? (
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
              <h1 id="meta-marketing-title">
                One clinic day.
                <br />
                <em>Connected from the start.</em>
              </h1>
              <p className="meta-marketing__lead">
                For independent clinics that need the appointment, patient
                context, care work, and payment record to stay together. See the
                work from the front desk to the next follow-up.
              </p>
              <div className="meta-marketing__actions">
                <Button
                  className="meta-marketing__button-primary"
                  href="/demo"
                  variant="contained"
                  endIcon={<ArrowForwardRoundedIcon />}
                >
                  Try the demo
                </Button>
                <Button
                  className="meta-marketing__button-secondary"
                  href="/meta-clinic/book-demo"
                  variant="outlined"
                >
                  Request a walkthrough
                </Button>
              </div>
              <p className="meta-marketing__hero-note">
                Explore with sample clinic records. No patient information
                needed.
              </p>
            </div>
            <figure className="meta-marketing__hero-capture">
              <a
                href="/meta-clinic/features/tracking-board"
                aria-label="Explore the Tracking Board"
              >
                <img
                  src="/marketing/captures/tracking-board-varied-stages-omni.png"
                  alt="Tracking Board with visits at different stages, room assignments, providers, and timing"
                  fetchPriority="high"
                />
              </a>
              <figcaption>
                The Tracking Board: each visit, its context, and its next
                handoff.
              </figcaption>
            </figure>
          </section>
          <ProductWalkthrough tour="day" id="workflow" />
          <section
            className="meta-marketing__section meta-marketing__care-models"
            id="clinic-types"
            aria-labelledby="care-model-title"
          >
            <h2 id="care-model-title">Start with the way you care.</h2>
            <p>
              One shared workspace, different operating models. Follow the
              product screens that matter to your team.
            </p>
            <div className="meta-marketing__model-list">
              {careModels.map((clinic) => (
                <article key={clinic.href}>
                  <h3>
                    <a href={clinic.href}>
                      {clinic.name}
                      <ArrowForwardRoundedIcon aria-hidden="true" />
                    </a>
                  </h3>
                  <p>{clinic.detail}</p>
                </article>
              ))}
            </div>
          </section>
          <section
            className="meta-marketing__tools meta-marketing__section"
            id="tools"
            aria-labelledby="tools-title"
          >
            <div className="meta-marketing__section-heading">
              <h2 id="tools-title">Find the task you want to make easier.</h2>
              <p>
                Each tutorial shows the screen, the action, and the next step.
                Start with one task or explore the full library.
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
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <Button
              href="/meta-clinic/resources"
              endIcon={<ArrowForwardRoundedIcon />}
            >
              Browse all tutorials
            </Button>
          </section>
          <section
            className="meta-marketing__section meta-marketing__buying"
            aria-labelledby="buying-title"
          >
            <h2 id="buying-title">Know what you are evaluating.</h2>
            <dl>
              <div>
                <dt>
                  <a href="/meta-clinic/pricing">Pricing and implementation</a>
                </dt>
                <dd>
                  See how software, setup, support, and connected-service costs
                  are scoped before requesting a quote.
                </dd>
              </div>
              <div>
                <dt>
                  <a href="/meta-clinic/security">Access and responsibility</a>
                </dt>
                <dd>
                  Understand the product controls and the deployment evidence
                  still needed before real-data use.
                </dd>
              </div>
              <div>
                <dt>
                  <a href="/meta-clinic/integrations">Connected services</a>
                </dt>
                <dd>
                  Separate work recorded in the app from messages, video,
                  payments, or prescriptions sent through a provider.
                </dd>
              </div>
            </dl>
          </section>
          <section
            className="meta-marketing__growth-close meta-marketing__section"
            aria-labelledby="meta-close-title"
          >
            <h2 id="meta-close-title">
              Bring one familiar task.
              <br />
              See where it leads.
            </h2>
            <p>
              Explore the product yourself, or request a conversation around
              your clinic’s workflow.
            </p>
            <div className="meta-marketing__actions">
              <Button
                className="meta-marketing__button-primary"
                href="/demo"
                variant="contained"
              >
                Try the demo
              </Button>
              <Button
                className="meta-marketing__button-secondary"
                href="/meta-clinic/book-demo"
                variant="outlined"
              >
                Request a walkthrough
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
          <a href="/demo">Demo</a>
          <a href="/meta-clinic/pricing">Pricing</a>
        </nav>
        <nav aria-label="Specialty links">
          <strong>Specialties</strong>
          <a href="/meta-clinic/weight-loss">Weight loss</a>
          <a href="/meta-clinic/behavioral-health">Behavioral health</a>
          <a href="/meta-clinic/primary-care/cash-pay">Cash-pay care</a>
        </nav>
        <nav aria-label="Resource links">
          <strong>Explore</strong>
          <a href="/meta-clinic/resources">Resources</a>
          <a href="/demo">Try the demo</a>
          <a href="/meta-clinic/site-map">Site map</a>
        </nav>
        <nav aria-label="Company links">
          <strong>Company</strong>
          <a href="/meta-clinic/about">About</a>
          <a href="/meta-clinic/security">Security</a>
          <a href="/meta-clinic/contact">Contact</a>
          <a href="/meta-clinic/legal/privacy">Privacy</a>
          <a href="/login">Sign in</a>
        </nav>
      </footer>
    </div>
  );
}
