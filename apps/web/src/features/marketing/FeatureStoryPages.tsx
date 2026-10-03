import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { Button } from "@mui/material";
import { marketingFeatures } from "./features";
import { MembershipWalkthrough } from "./MembershipWalkthrough";
import { ProductWalkthrough } from "./ProductWalkthrough";
import { featureTour } from "./productWalkthroughs";
import "./featureStoryPages.css";

type Story = {
  eyebrow: string;
  title: string;
  lead: string;
  chapter: string;
  chapterLead: string;
  workflows: [
    { title: string; copy: string },
    { title: string; copy: string },
    { title: string; copy: string },
  ];
  image?: { src: string; alt: string; caption: string };
  secondaryImage?: { src: string; alt: string; caption: string };
  photos?: [
    { src: string; alt: string; caption: string },
    { src: string; alt: string; caption: string },
  ];
  related: string;
  relatedCopy: string;
  layout: "split" | "folio" | "wide" | "offset";
};

export const stories: Record<string, Story> = {
  "tracking-board": {
    eyebrow: "The live clinic floor",
    title: "Know where every visit stands.",
    lead: "A clinic day has more than a waiting list. See arrivals, room assignments, care in progress, and checkout in one readable board.",
    chapter: "A handoff is easier when the whole team can see it.",
    chapterLead:
      "The board brings the operational facts of a visit into one scan: where the patient is, who owns the next step, and what has already happened.",
    workflows: [
      {
        title: "Find the visit",
        copy: "Read room, patient, visit reason, and current stage together instead of searching through separate lists.",
      },
      {
        title: "See care context",
        copy: "View recorded vitals and care tasks beside the assigned provider without treating a colored badge as clinical judgment.",
      },
      {
        title: "Move the day forward",
        copy: "Use timing and stage to identify the next operational handoff, from intake through checkout.",
      },
    ],
    image: {
      src: "/marketing/captures/tracking-board-varied-stages-omni.png",
      alt: "Actual Meta Clinic Tracking Board with fictional visits across waiting, intake, ready for provider, and provider assigned stages, with room, vitals, care, provider, and timing columns.",
      caption: "Tracking Board · direct synthetic app capture",
    },
    photos: [
      {
        src: "/marketing/tracking-board-team.png",
        alt: "Three fictional clinic staff coordinating at a bright reception workspace.",
        caption: "The team can see where the day stands.",
      },
      {
        src: "/marketing/tracking-board-handoff.png",
        alt: "A fictional clinic nurse guiding a patient from reception toward an exam room.",
        caption: "A clear handoff helps the visit move forward.",
      },
    ],
    related: "scheduling",
    relatedCopy:
      "Start with the calendar that gives each visit its time and place.",
    layout: "wide",
  },
  "intake-forms": {
    eyebrow: "Before the encounter",
    title: "A better visit begins before arrival.",
    lead: "Gather the information a service needs, then let staff see what has been submitted and what still needs review.",
    chapter: "From invitation to reviewed answers.",
    chapterLead:
      "An intake form should help the next person in the workflow, not become another disconnected inbox.",
    workflows: [
      {
        title: "Send the right form",
        copy: "Associate visit-specific questions with the appointment, with patient identity and due date in view.",
      },
      {
        title: "Review what arrived",
        copy: "See submitted responses and review state together, while incomplete items stay clearly marked.",
      },
      {
        title: "Bring context forward",
        copy: "Keep intake answers connected to the encounter so the care team can use them during the visit.",
      },
    ],
    related: "clinical-notes",
    relatedCopy: "Carry reviewed intake into the visit documentation flow.",
    layout: "split",
  },
  "team-workspace": {
    eyebrow: "Work with an owner",
    title: "The next task should have a name beside it.",
    lead: "Give front desk and care teams a shared view of assigned work, handoffs, and due times without losing role boundaries.",
    chapter: "A calmer way to pass work between people.",
    chapterLead:
      "See what is ready, who is responsible, and which task depends on another part of the clinic day.",
    workflows: [
      {
        title: "Claim the work",
        copy: "Open a team queue that names the task, owner, patient context, and next action.",
      },
      {
        title: "Hand off clearly",
        copy: "Move a visit-related task to the next role with its status and context intact.",
      },
      {
        title: "Follow through",
        copy: "Review completed and still-open work before the day ends.",
      },
    ],
    related: "tracking-board",
    relatedCopy: "See those handoffs alongside the current clinic floor.",
    layout: "offset",
  },
  "labs-results": {
    eyebrow: "Orders to answers",
    title: "Keep a result close to the question behind it.",
    lead: "Follow lab work from order to received result, clinician review, and the next patient-facing step.",
    chapter: "A result is a step in care, not the end of a list.",
    chapterLead:
      "Separate received, reviewed, and follow-up states so a team can tell what has actually been done.",
    workflows: [
      {
        title: "See ordered work",
        copy: "Keep order date, test, patient, and requesting clinician in a single view.",
      },
      {
        title: "Review source values",
        copy: "Open the reported result beside its source and recorded review state.",
      },
      {
        title: "Close the loop",
        copy: "Connect the result to the follow-up task or care plan that follows.",
      },
    ],
    related: "care-plans",
    relatedCopy: "Turn reviewed findings into a documented next step.",
    layout: "folio",
  },
  "medication-workflows": {
    eyebrow: "Medication work in context",
    title: "Make each medication step explicit.",
    lead: "Keep the proposed therapy, clinician review, local record, and fulfillment route distinct in the encounter.",
    chapter: "The route matters as much as the order.",
    chapterLead:
      "A clear workflow distinguishes preparation, authorization, and recorded outcome instead of implying that a local entry was transmitted.",
    workflows: [
      {
        title: "Prepare in context",
        copy: "Start from the visit and see the therapy, instructions, and selected fulfillment route.",
      },
      {
        title: "Review deliberately",
        copy: "Show which clinician action is still required before the next stage.",
      },
      {
        title: "Record the outcome",
        copy: "Keep local documentation and external transmission status visibly separate.",
      },
    ],
    related: "clinical-notes",
    relatedCopy: "Keep the decision connected to the encounter record.",
    layout: "wide",
  },
  "care-plans": {
    eyebrow: "Care between visits",
    title: "Give the plan a path forward.",
    lead: "Bring goals, planned services, tasks, and follow-up dates into one continuing view of care.",
    chapter: "The plan can move without losing its history.",
    chapterLead:
      "Turn documented intent into work the team can see, then preserve the change when a goal or date moves.",
    workflows: [
      {
        title: "Define the goal",
        copy: "Keep the care goal and its visit context visible to the team.",
      },
      {
        title: "Assign the next step",
        copy: "Connect services and follow-up tasks to an owner and target date.",
      },
      {
        title: "Review progress",
        copy: "See what was completed and which plan items remain open.",
      },
    ],
    related: "reminders",
    relatedCopy: "Help the next visit or follow-up stay visible.",
    layout: "offset",
  },
  "cash-billing": {
    eyebrow: "Revenue without mystery",
    title: "A clear path from visit to payment.",
    lead: "See the service, its price, what has been paid, and what remains in a clinic-first cash billing flow.",
    chapter: "Every charge should be understandable.",
    chapterLead:
      "Tie a charge to its service and keep the balance legible as payment or correction work happens.",
    workflows: [
      {
        title: "Start with the service",
        copy: "Bring configured prices into the visit checkout view with a readable line item.",
      },
      {
        title: "See payment state",
        copy: "Separate amount due, recorded payments, and remaining balance.",
      },
      {
        title: "Keep a correction trail",
        copy: "Show the reason and record behind a changed charge or refund.",
      },
    ],
    image: {
      src: "/marketing/captures/finance-open-invoice-queue.png",
      alt: "Meta Clinic invoice ledger with synthetic patient balances, dates, and payment states.",
      caption: "Invoice ledger · direct synthetic app capture",
    },
    secondaryImage: {
      src: "/marketing/captures/finance-paid-invoice-detail.png",
      alt: "Meta Clinic paid invoice detail showing synthetic line items, settled balance, and payment history.",
      caption: "Paid invoice detail · direct synthetic app capture",
    },
    photos: [
      {
        src: "/marketing/cash-billing-team.png",
        alt: "Two fictional clinic staff reviewing checkout work at a bright front desk.",
        caption: "A shared view when the visit reaches checkout.",
      },
      {
        src: "/marketing/cash-billing-checkout.png",
        alt: "A fictional patient and clinic staff member talking at a reception counter.",
        caption: "A clear conversation at the end of the visit.",
      },
    ],
    related: "invoices",
    relatedCopy: "Follow the billed service into its invoice history.",
    layout: "split",
  },
  "memberships-packages": {
    eyebrow: "Care models with choice",
    title: "Shape an ongoing-care offer with clarity.",
    lead: "Build programs, collect reusable services, and define the terms a patient will see before an offer goes live.",
    chapter: "From a care idea to a published program.",
    chapterLead:
      "The catalog lets a clinic organize distinct programs and tiers without burying their differences in a long billing list.",
    workflows: [
      {
        title: "Create the program",
        copy: "Give each care model a name, description, and place in the patient-facing catalog.",
      },
      {
        title: "Reuse the right services",
        copy: "Define visits and sessions once, then add the relevant services to each tier.",
      },
      {
        title: "Publish clear terms",
        copy: "Preview the patient card and publish a version of the tier when its terms are ready.",
      },
    ],
    image: {
      src: "/marketing/captures/membership-catalog-five-programs.png",
      alt: "Actual Meta Clinic membership catalog with five fictional published programs and program descriptions.",
      caption: "Membership catalog · five programs · direct synthetic app capture",
    },
    photos: [
      {
        src: "/marketing/memberships-team.png",
        alt: "Fictional clinician and care coordinator discussing a program at a laptop in a bright clinic office.",
        caption: "A care model starts with a team conversation.",
      },
      {
        src: "/marketing/memberships-front-desk.png",
        alt: "Fictional clinic coordinator discussing program options with a patient at reception.",
        caption: "Clear terms make the next conversation easier.",
      },
    ],
    related: "cash-billing",
    relatedCopy: "See how pay-per-visit care lives alongside memberships.",
    layout: "folio",
  },
  invoices: {
    eyebrow: "The financial record",
    title: "An invoice people can actually read.",
    lead: "Present services, adjustments, payment history, and balance as one clear record for clinic staff.",
    chapter: "From line item to settled balance.",
    chapterLead:
      "An invoice should answer what was billed, why, and what happened afterward.",
    workflows: [
      {
        title: "Review each line",
        copy: "Keep the billed service and price connected to its visit.",
      },
      {
        title: "Track the state",
        copy: "Distinguish the invoice total, allocated payment, credit, and remaining balance.",
      },
      {
        title: "Follow the history",
        copy: "Show payments and adjustments in the same financial story.",
      },
    ],
    image: {
      src: "/marketing/captures/finance-paid-invoice-detail.png",
      alt: "Meta Clinic synthetic paid invoice showing line items, allocated payment, credit, and zero balance.",
      caption: "Paid invoice detail · captured from the synthetic clinic workspace",
    },
    photos: [
      {
        src: "/marketing/invoices-team.png",
        alt: "Two fictional clinic staff reviewing financial paperwork together at a desk.",
        caption: "The record should help the team answer the question.",
      },
      {
        src: "/marketing/invoices-patient.png",
        alt: "A fictional clinic coordinator giving a visit document to a patient at reception.",
        caption: "An understandable record is easier to share.",
      },
    ],
    related: "cash-billing",
    relatedCopy: "Explore the checkout flow behind the invoice.",
    layout: "wide",
  },
  "optional-insurance": {
    eyebrow: "A choice for your model",
    title: "Choose whether insurance belongs in your clinic.",
    lead: "The current clinic setup includes an insurance-workflow setting alongside cash billing. Coverage and claim records exist in the data layer; a dedicated claim workspace is still being developed.",
    chapter: "Set the model, then build the workflow around it.",
    chapterLead:
      "Clinic configuration and local records are the starting point. A payer submission screen is not available in the current app.",
    workflows: [
      {
        title: "Choose the clinic setting",
        copy: "Turn insurance workflows on in clinic setup when the practice intends to use them.",
      },
      {
        title: "Keep local records distinct",
        copy: "Coverage and claim data do not imply that a payer has received or accepted anything.",
      },
      {
        title: "Add payer steps deliberately",
        copy: "Claim preparation, transmission, and response handling need their own verified app workflow.",
      },
    ],
    related: "invoices",
    relatedCopy: "See the financial record that follows billed care.",
    layout: "offset",
  },
  "online-requests": {
    eyebrow: "The digital front door",
    title: "Let patients raise a hand. Keep the clinic in control.",
    lead: "A request is a beginning: collect the service and preferred time, then let the team review before a visit is confirmed.",
    chapter: "From interest to a real appointment.",
    chapterLead:
      "Patients get a simple first step while staff retain a clear review and scheduling path.",
    workflows: [
      {
        title: "Capture the request",
        copy: "Ask for the care sought and a practical callback or time preference.",
      },
      {
        title: "Review together",
        copy: "See request details and staff ownership in one queue.",
      },
      {
        title: "Confirm the visit",
        copy: "Move an approved request into scheduling with the right service context.",
      },
    ],
    related: "scheduling",
    relatedCopy: "See where a reviewed request becomes an appointment.",
    layout: "split",
  },
  "patient-portal": {
    eyebrow: "A place to return",
    title: "Give patients their next step in one place.",
    lead: "Bring upcoming visits, forms, available documents, and care follow-up into a patient view tied to their identity.",
    chapter: "Less searching between visits.",
    chapterLead:
      "A patient can see what is coming, what needs a response, and what information is available to them.",
    workflows: [
      {
        title: "Prepare for a visit",
        copy: "Find appointment time, location or virtual format, and forms to complete.",
      },
      {
        title: "See available records",
        copy: "Open shared information that belongs to the patient's own account.",
      },
      {
        title: "Know what is next",
        copy: "Find follow-up actions and communication in a clear return path.",
      },
    ],
    related: "intake-forms",
    relatedCopy: "Explore the forms patients can complete before care.",
    layout: "folio",
  },
  reminders: {
    eyebrow: "Timely follow-through",
    title: "Keep the next visit on the radar.",
    lead: "Prepare appointment and follow-up messages with timing, channel, and outcome visible to the team.",
    chapter: "A message is useful when its status is clear.",
    chapterLead:
      "Teams should know what is scheduled, what was recorded as sent, and what still needs a person to act.",
    workflows: [
      {
        title: "Plan the message",
        copy: "Connect a reminder to an appointment or follow-up event.",
      },
      {
        title: "Respect preferences",
        copy: "Choose the configured communication route and timing.",
      },
      {
        title: "See the outcome",
        copy: "Read delivery and response state without assuming that prepared means received.",
      },
    ],
    related: "patient-portal",
    relatedCopy: "Give patients a place to find the next action.",
    layout: "offset",
  },
  telehealth: {
    eyebrow: "Visits beyond the room",
    title: "A virtual visit still belongs to the clinic day.",
    lead: "Keep the video appointment, preparation, encounter context, and next step connected for remote care.",
    chapter: "The visit has a before, during, and after.",
    chapterLead:
      "A virtual room is one part of care. The surrounding schedule and encounter remain just as important.",
    workflows: [
      {
        title: "Prepare together",
        copy: "Show virtual visit time, provider, and readiness steps before entry.",
      },
      {
        title: "Enter from the visit",
        copy: "Keep the room action close to the scheduled appointment.",
      },
      {
        title: "Return to the record",
        copy: "Carry documentation and follow-up forward after the call.",
      },
    ],
    related: "scheduling",
    relatedCopy: "See virtual rooms beside in-person appointments.",
    layout: "wide",
  },
};

export function FeatureStoryPage({ slug }: { slug: string }) {
  const story = stories[slug];
  const feature = marketingFeatures.find((item) => item.slug === slug);
  if (!story || !feature) return null;
  const related = marketingFeatures.find((item) => item.slug === story.related);
  const tour = featureTour(slug);
  const relatedTour = ["clinical-notes", "intake-forms", "patient-portal", "telehealth", "online-requests"].includes(slug);

  return (
    <main id="main" className={`meta-story meta-story--${story.layout}`}>
      <section className="meta-story__hero meta-story__wrap">
        <div className="meta-story__hero-copy">
          <a className="meta-story__crumb" href="/meta-clinic#tools">
            All features <span aria-hidden="true">/</span> {feature.label}
          </a>
          <p className="meta-story__eyebrow">{story.eyebrow}</p>
          <h1>{story.title}</h1>
          <p className="meta-story__lead">{story.lead}</p>
          <Button
            href={slug === "memberships-packages" ? "#build-a-membership" : "#feature-workflows"}
            endIcon={<ArrowForwardRoundedIcon />}
            variant="contained"
          >
            Explore the workflow
          </Button>
        </div>
      </section>

      {slug === "memberships-packages" && <MembershipWalkthrough />}
      {tour && <ProductWalkthrough tour={tour} id={relatedTour ? "related-product-workflow" : "feature-workflows"} context={relatedTour ? `These shared workspace screens show the context around ${feature.label.toLowerCase()}. Explore the demo for the feature's full workflow.` : undefined} />}

      {!tour && slug !== "memberships-packages" && story.image && (
        <figure className="meta-story__product meta-story__wrap">
          <img src={story.image.src} alt={story.image.alt} loading="eager" />
          <figcaption>
            <span>{story.image.caption}</span>
            <a href={story.image.src} target="_blank" rel="noreferrer">
              Open full-size image
            </a>
          </figcaption>
        </figure>
      )}

      {(!tour || relatedTour) && slug !== "memberships-packages" && <section
        className="meta-story__work meta-story__wrap"
        id="feature-workflows"
      >
        <div className="meta-story__work-heading">
          <p className="meta-story__eyebrow">How it moves</p>
          <h2>{story.chapter}</h2>
          <p>{story.chapterLead}</p>
        </div>
        <div className="meta-story__workflows">
          {story.workflows.map((item, index) => (
            <article key={item.title}>
              <span>0{index + 1}</span>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </article>
          ))}
        </div>
      </section>}

      {!tour && slug !== "memberships-packages" && story.secondaryImage && (
        <figure className="meta-story__product meta-story__product--secondary meta-story__wrap">
          <img
            src={story.secondaryImage.src}
            alt={story.secondaryImage.alt}
            loading="lazy"
          />
          <figcaption>
            <span>{story.secondaryImage.caption}</span>
            <a href={story.secondaryImage.src} target="_blank" rel="noreferrer">
              Open full-size image
            </a>
          </figcaption>
        </figure>
      )}

      {!tour && slug !== "memberships-packages" && story.photos && (
        <section
          className="meta-story__people meta-story__wrap"
          aria-label={`${feature.label} in the clinic`}
        >
          {story.photos.map((photo) => (
            <figure key={photo.src}>
              <img src={photo.src} alt={photo.alt} loading="lazy" />
              <figcaption>{photo.caption}</figcaption>
            </figure>
          ))}
        </section>
      )}

      {related && (
        <aside className="meta-story__next meta-story__wrap">
          <div>
            <span>Keep the work connected</span>
            <h2>{story.relatedCopy}</h2>
          </div>
          <a href={`/meta-clinic/features/${related.slug}`}>
            Explore {related.label}{" "}
            <ArrowForwardRoundedIcon aria-hidden="true" />
          </a>
        </aside>
      )}
    </main>
  );
}

export const storySlugs = Object.keys(stories);
