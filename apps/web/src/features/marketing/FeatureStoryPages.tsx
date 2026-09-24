import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { Button } from "@mui/material";
import { marketingFeatures } from "./features";
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
  related: string;
  relatedCopy: string;
  layout: "split" | "folio" | "wide" | "offset";
};

const stories: Record<string, Story> = {
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
    related: "invoices",
    relatedCopy: "Follow the billed service into its invoice history.",
    layout: "split",
  },
  "memberships-packages": {
    eyebrow: "Care models with choice",
    title: "Give recurring care clear terms.",
    lead: "Show the services, access period, included use, and renewal state that make a membership understandable.",
    chapter: "The offer and the patient record should agree.",
    chapterLead:
      "Keep what a patient purchased beside what has been used, without hiding changes in a billing log.",
    workflows: [
      {
        title: "Define the offer",
        copy: "Describe included services, cycle, and price before enrollment.",
      },
      {
        title: "Track what is used",
        copy: "See remaining visits or benefits beside the patient membership.",
      },
      {
        title: "Handle change visibly",
        copy: "Make renewal, pause, and end dates easy to understand.",
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
        copy: "Distinguish draft, sent, partial, and paid records with words and amounts.",
      },
      {
        title: "Follow the history",
        copy: "Show payments and adjustments in the same financial story.",
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
            href="#feature-workflows"
            endIcon={<ArrowForwardRoundedIcon />}
            variant="contained"
          >
            Explore the workflow
          </Button>
        </div>
      </section>

      <section
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
      </section>

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
