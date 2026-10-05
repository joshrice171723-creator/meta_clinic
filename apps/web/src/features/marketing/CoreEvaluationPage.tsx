import type { ReactNode } from "react";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { ProductWalkthrough } from "./ProductWalkthrough";
import type { GrowthPage } from "./growthPageContent";
import { marketingUrl } from "./marketingPaths";
import "./buyerInformationPages.css";

type Card = { title: string; body: string; link?: string; label?: string };
type CoreContent = {
  eyebrow: string;
  headline: string;
  lead: string;
  chapter: string;
  introduction: string;
  cards: readonly Card[];
  image?: string;
  imageAlt?: string;
  imageCaption?: string;
};

const coreContent = {
  "/platform": {
    eyebrow: "The clinic workspace",
    headline: "Follow the visit. Keep the context.",
    lead: "See how scheduling, visit work, billing, and inventory fit into the same clinic day. Start with the current screens, then evaluate the workflow your team needs.",
    chapter: "From the first request to the next action.",
    introduction:
      "Each team needs different details from the same visit. A connected workspace gives the handoff a place to happen.",
    cards: [
      {
        title: "Front desk",
        body: "Coordinate appointment time, visit type, staff, and resources, then follow the recorded visit status.",
        link: "/features/scheduling",
        label: "Explore scheduling",
      },
      {
        title: "Care team",
        body: "Open the patient and encounter context, review documentation, and record the next authorized step.",
        link: "/platform/clinical-documentation",
        label: "Explore documentation",
      },
      {
        title: "Operations",
        body: "Review charges, payments, memberships, and inventory work alongside the activity they support.",
        link: "/features/inventory",
        label: "Explore inventory",
      },
    ],
    image: "/marketing/captures/schedule-booking-omni-adapted.png",
    imageAlt:
      "Meta Clinic sample appointment form showing time, clinician, room, visit type, and reason.",
    imageCaption: "Appointment context in the synthetic clinic demo",
  },
  "/demo": {
    eyebrow: "Try the product",
    headline: "One clinic day. A closer look.",
    lead: "Open the interactive demo to explore the clinic workspace with sample records. Choose a task and follow the staff work it creates.",
    chapter: "Start with a task you know.",
    introduction:
      "Use the demo to inspect the current software. Sample activity does not establish a live connection to outside services.",
    cards: [
      {
        title: "Plan an appointment",
        body: "Review visit time, clinician, room, and visit type together.",
      },
      {
        title: "Follow the visit",
        body: "See the patient context and the recorded work for the next staff handoff.",
      },
      {
        title: "Inspect the follow-through",
        body: "Look at billing, memberships, inventory, and the next open task.",
      },
    ],
    image: "/marketing/scheduling-month.png",
    imageAlt:
      "Meta Clinic sample monthly calendar with in-person and remote appointments.",
    imageCaption: "Sample appointments in the interactive demo",
  },
  "/sandbox": {
    eyebrow: "Explore the workspace",
    headline: "Try a clinic task with sample records.",
    lead: "The sandbox is available through the product demo. Explore a workflow, inspect its recorded states, and bring the gaps that matter to your team to a walkthrough.",
    chapter: "A useful question makes a useful tryout.",
    introduction:
      "Pick one routine task, then look at what happens when information is missing or the plan changes.",
    cards: [
      {
        title: "Schedule a visit",
        body: "Inspect the booking, assigned people, and resources.",
      },
      {
        title: "Follow a handoff",
        body: "Find the next action and the person responsible for it.",
      },
      {
        title: "Note an exception",
        body: "Check what staff see when work is incomplete or needs review.",
      },
    ],
    image: "/marketing/tracking-board-app.png",
    imageAlt:
      "Meta Clinic sample tracking board with visit status and staff work.",
    imageCaption: "Visit handoffs in the synthetic clinic demo",
  },
  "/book-demo": {
    eyebrow: "Request a walkthrough",
    headline: "Bring the workflow your team needs to see.",
    lead: "Tell us about your clinic and one task you want to explore. This form sends a walkthrough request; it does not reserve a calendar time.",
    chapter: "Give the conversation a starting point.",
    introduction:
      "A short description is enough. Your current tools, team roles, and biggest handoff question help focus the walkthrough.",
    cards: [
      {
        title: "Your clinic",
        body: "Care model, team size, locations, and the systems you use now.",
      },
      {
        title: "Your workflow",
        body: "Where the task starts, who handles it, and the step you want to improve.",
      },
      {
        title: "Your decision",
        body: "The capabilities, connections, or implementation details you need to understand.",
      },
    ],
    image: "/marketing/captures/schedule-month-omni-october.png",
    imageAlt:
      "Meta Clinic sample monthly calendar with recorded appointment counts.",
    imageCaption: "A starting point for a scheduling walkthrough",
  },
  "/contact": {
    eyebrow: "Contact Meta Clinic",
    headline: "Start with your clinic question.",
    lead: "Ask about product fit, pricing, a required connection, or security review. Describe the business workflow and tell us how to reach you.",
    chapter: "Choose the conversation you need.",
    introduction:
      "Use the form for product and business questions. For care or patient-account questions, use your clinic's own contact channel.",
    cards: [
      {
        title: "Product fit",
        body: "Explain the task and the people who need to use the software.",
        link: "/platform",
        label: "See the platform",
      },
      {
        title: "Pricing and implementation",
        body: "Share team size, locations, current systems, and setup priorities.",
        link: "/pricing",
        label: "Understand pricing scope",
      },
      {
        title: "Security and connections",
        body: "Name the information flow, outside services, and evidence your team needs.",
        link: "/integrations",
        label: "See integration status",
      },
    ],
  },
} satisfies Record<string, CoreContent>;

type CorePath = keyof typeof coreContent;

export function isCoreEvaluationPath(path: string): path is CorePath {
  return Object.prototype.hasOwnProperty.call(coreContent, path);
}

export function CoreEvaluationPage({
  page,
  path,
  form,
}: {
  page: GrowthPage;
  path: CorePath;
  form?: ReactNode;
}) {
  const content: CoreContent = coreContent[path];
  const isRequest = path === "/book-demo" || path === "/contact";
  const isDemo = path === "/demo" || path === "/sandbox";
  return (
    <main id="main" className="growth-core growth-core--focused">
      <section className="growth-core__hero">
        <div className="growth-core__wrap growth-core__hero-grid">
          <div className="growth-core__hero-copy">
            <nav aria-label="Breadcrumb">
              <Link href="/meta-clinic" underline="hover" color="inherit">
                Meta Clinic
              </Link>
              <span aria-hidden="true"> / </span>
              <span aria-current="page">{page.title}</span>
            </nav>
            <p className="growth-core__eyebrow">{content.eyebrow}</p>
            <h1>{content.headline}</h1>
            <p className="growth-core__lead">{content.lead}</p>
            <div className="growth-core__actions">
              <Button
                component="a"
                variant="contained"
                disableElevation
                className="buyer-page__primary"
                href={path === "/contact" ? "#request" : "/demo"}
                endIcon={<ArrowForwardRoundedIcon />}
              >
                {path === "/contact" ? "Send your question" : "Try Our Sandbox"}
              </Button>
              <Button
                component="a"
                variant="text"
                className="buyer-page__secondary"
                href={path === "/contact" ? "/demo" : marketingUrl("/platform")}
              >
                {path === "/contact"
                  ? "Try Our Sandbox"
                  : "Explore the platform"}
              </Button>
            </div>
            {!isRequest && (
              <p className="growth-core__hero-note">
                Interactive demo with sample clinic records
              </p>
            )}
          </div>
          {content.image ? (
            <figure className="growth-core__visual">
              <span>Meta Clinic / clinic workspace</span>
              <img src={content.image} alt={content.imageAlt} />
              <figcaption>{content.imageCaption}</figcaption>
            </figure>
          ) : (
            <aside className="growth-core__question">
              <span>A useful starting point</span>
              <strong>One question. The right context.</strong>
              <p>
                Tell us what you want to improve, which systems are involved,
                and the answer your team needs to make a decision.
              </p>
            </aside>
          )}
        </div>
      </section>

      {form && (
        <section className="growth-core__request" id="request">
          <div className="growth-core__wrap growth-core__request-grid">
            <div>
              <p className="growth-core__eyebrow">
                {path === "/book-demo"
                  ? "Walkthrough request"
                  : "Your question"}
              </p>
              <h2>
                {path === "/book-demo"
                  ? "What would you like to see?"
                  : "How can we help?"}
              </h2>
              <p>
                Include the business context and a way to reach you. Please
                leave patient information out of the request.
              </p>
            </div>
            {form}
          </div>
        </section>
      )}

      <section
        className="growth-core__chapter growth-core__wrap"
        aria-labelledby="core-chapter-title"
      >
        <div className="growth-core__chapter-heading">
          <p className="growth-core__eyebrow">
            {isRequest ? "What to share" : "The workflow"}
          </p>
          <h2 id="core-chapter-title">{content.chapter}</h2>
          <p>{content.introduction}</p>
        </div>
        <div className="growth-core__cards">
          {content.cards.map((card, index) => (
            <article key={card.title}>
              <span>0{index + 1}</span>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
              {card.link && (
                <Link
                  href={marketingUrl(card.link)}
                  underline="hover"
                  color="inherit"
                >
                  {card.label}
                  <ArrowForwardRoundedIcon aria-hidden="true" />
                </Link>
              )}
            </article>
          ))}
        </div>
      </section>

      {path === "/platform" && <ProductWalkthrough tour="day" />}

      {!isRequest && (
        <section className="growth-core__close">
          <div className="growth-core__wrap">
            <p className="growth-core__eyebrow">
              {isDemo ? "Your next step" : "Try the current product"}
            </p>
            <h2>
              {isDemo
                ? "Open the demo and choose a task."
                : "See how your clinic day fits."}
            </h2>
            <div className="growth-core__actions">
              <Button
                component="a"
                variant="contained"
                disableElevation
                className="buyer-page__primary"
                href="/demo"
                endIcon={<ArrowForwardRoundedIcon />}
              >
                Try Our Sandbox
              </Button>
              <Button
                component="a"
                variant="text"
                className="buyer-page__secondary"
                href={marketingUrl("/platform")}
              >
                Explore the platform
              </Button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
