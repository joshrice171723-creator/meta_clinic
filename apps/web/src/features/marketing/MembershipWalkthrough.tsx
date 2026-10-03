import { useEffect } from "react";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { Button } from "@mui/material";
import "./membershipWalkthrough.css";

const steps = [
  {
    number: "01",
    kind: "Program",
    title: "Start with the care you want to offer.",
    body: "A program is the home for a type of ongoing care. Name it and write the short description patients will use to understand who it is for. A clinic can keep several programs separate, such as primary care and metabolic health.",
    detail:
      "In the catalog: Programs → Add program → name and describe the care model.",
    image:
      "/marketing/captures/membership-programs-populated-northside-clinic-2026-09-24-synthetic-direct.png",
    alt: "Meta Clinic membership catalog on the Programs tab, showing a published primary care program and a draft wellness program.",
    caption: "Programs organize the tabs patients browse.",
  },
  {
    number: "02",
    kind: "Service",
    title: "Define what the membership includes.",
    body: "A service is a reusable unit of care, such as a follow-up visit or a care coordination check-in. Define it once, then use it in the tiers where it belongs. This keeps the offer concrete for patients and practical for staff.",
    detail:
      "In the catalog: Services → Add service → describe the visit or care activity.",
    image:
      "/marketing/captures/membership-services-list-northside-clinic-2026-09-24-synthetic-direct.png",
    alt: "Meta Clinic Services tab listing available reusable services including care coordination, wellness consultation, and primary care follow-up.",
    caption: "Reusable services become the contents of a tier.",
  },
  {
    number: "03",
    kind: "Tier",
    title: "Give the offer its price and terms.",
    body: "A tier combines one program with its included services, price, length, renewal choice, and written terms. Draft it privately, then review exactly what a patient will be offered. Separate tiers can give patients a meaningful choice within one program.",
    detail:
      "In the catalog: Tiers → Create membership tier → choose program, services, price, and term.",
    image:
      "/marketing/captures/membership-tiers-populated-northside-clinic-2026-09-24-synthetic-direct.png",
    alt: "Meta Clinic Tiers tab showing a primary care membership priced at USD 79 for one month with one included service, plus a draft wellness tier.",
    caption:
      "The tier carries the price, term, services, and publication state.",
  },
  {
    number: "04",
    kind: "Preview & publish",
    title: "Read the card the way a patient will.",
    body: "Open the patient card preview before publishing. Check that the price, term, included services, and full terms tell the same story. Publishing creates the version patients can select; the draft can continue to be edited for a future version.",
    detail:
      "In the catalog: Preview patient card → review terms → Publish version.",
    image:
      "/marketing/captures/membership-tier-preview-northside-clinic-2026-09-24-synthetic-direct.png",
    alt: "Meta Clinic patient card preview showing the primary care membership at $79 for a one-month term with a primary care follow-up included.",
    caption: "Preview the offer before patients see it.",
  },
  {
    number: "05",
    kind: "Patient view",
    title: "Let patients compare before they commit.",
    body: "The patient view shows the published program, tier price, term, and included care together. Choosing a membership starts a separate account step. The patient reviews their selection, verifies their email, and reaches checkout only after account setup.",
    detail:
      "Patient path: compare the offer → choose a tier → create an account → verify email → checkout.",
    image: "/marketing/captures/membership-patient-storefront-synthetic.png",
    alt: "Patient-facing Meta Clinic membership view showing Northside Clinic's primary care tier, $79 price, one-month term, included follow-up, and Choose membership action.",
    caption:
      "Patient view preview using the product membership card and sample published terms.",
    href: "/meta-clinic/membership-care/patient-view",
    linkLabel: "Explore the patient view",
  },
] as const;

export function MembershipWalkthrough() {
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id !== "build-a-membership" && !/^membership-step-0[1-5]$/.test(id))
      return;
    const frame = window.requestAnimationFrame(() =>
      document.getElementById(id)?.scrollIntoView(),
    );
    return () => window.cancelAnimationFrame(frame);
  }, []);
  return (
    <section
      className="membership-walkthrough"
      id="build-a-membership"
      aria-labelledby="membership-walkthrough-title"
    >
      <div className="membership-walkthrough__intro">
        <p className="membership-walkthrough__eyebrow">
          From clinic setup to patient choice
        </p>
        <h2 id="membership-walkthrough-title">
          Build your own membership, step by step.
        </h2>
        <p>
          Programs organize the care model. Services define what is included.
          Tiers put a price and terms around that care. The published tier
          becomes the offer a patient can choose.
        </p>
        <div
          className="membership-walkthrough__rail"
          aria-label="Membership creation stages"
        >
          {steps.map((step) => (
            <a key={step.number} href={`#membership-step-${step.number}`}>
              <span>{step.number}</span>
              {step.kind}
            </a>
          ))}
        </div>
      </div>
      <div className="membership-walkthrough__steps">
        {steps.map((step) => (
          <article
            className="membership-walkthrough__step"
            id={`membership-step-${step.number}`}
            key={step.number}
          >
            <div className="membership-walkthrough__copy">
              <span className="membership-walkthrough__number">
                {step.number} / {step.kind}
              </span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              <div className="membership-walkthrough__detail">
                {step.detail}
              </div>
              {"href" in step && (
                <a className="membership-walkthrough__link" href={step.href}>
                  {step.linkLabel}
                  <ArrowForwardRoundedIcon aria-hidden="true" />
                </a>
              )}
            </div>
            <figure className="membership-walkthrough__visual">
              <a
                href={step.image}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open full-size image: ${step.caption}`}
              >
                <img src={step.image} alt={step.alt} loading="lazy" />
              </a>
              <figcaption>
                {step.caption}
                <span>View full screen ↗</span>
              </figcaption>
            </figure>
          </article>
        ))}
      </div>
      <div className="membership-walkthrough__close">
        <strong>See both sides of the membership.</strong>
        <Button
          href="/demo"
          variant="contained"
          disableElevation
          endIcon={<ArrowForwardRoundedIcon />}
        >
          Try the demo
        </Button>
        <a href="/meta-clinic/membership-care/patient-view">
          Open the patient view <ArrowForwardRoundedIcon aria-hidden="true" />
        </a>
        <a href="/meta-clinic/book-demo">
          Walk through it with us <ArrowForwardRoundedIcon aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
