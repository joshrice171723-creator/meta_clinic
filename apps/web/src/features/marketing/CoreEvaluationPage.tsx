import { ProductWalkthrough } from "./ProductWalkthrough";
import type { ReactNode } from "react";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import type { GrowthPage } from "./growthPageContent";
import { marketingUrl } from "./marketingPaths";

type Card = { title: string; body: string; link: string; label: string };
type CoreContent = {
  chapter: string;
  introduction: string;
  cards: readonly Card[];
  decisionHeading: string;
  decision: string;
  next: string;
  image?: string;
  imageAlt?: string;
  imageCaption?: string;
  imageKind?: "photo" | "product";
  scene?: { image: string; alt: string; heading: string; body: string };
  asideBody?: string;
};

const coreContent = {
  "/platform": {
    chapter: "One journey, several teams",
    introduction: "Follow a patient request through the work it creates. The platform pages let you inspect each handoff, then use the guided demo to see the current screens together.",
    cards: [
      { title: "Prepare the visit", body: "Start with the request, intake status, and the appointment the front desk needs to coordinate.", link: "/platform/patient-intake", label: "Explore patient intake" },
      { title: "Run the clinic day", body: "See scheduling and visit context before work moves to the next responsible person.", link: "/features/scheduling", label: "Explore scheduling" },
      { title: "Finish the work", body: "Review payment context, open tasks, and what still needs follow-through.", link: "/platform/billing", label: "Explore billing" },
    ],
    decisionHeading: "See the work move across your team.",
    decision: "Start with an appointment, see who owns the next step, and follow the work through the visit and payment. Bring one familiar clinic process to a walkthrough.",
    next: "Start with the product screens, then discuss which parts fit your clinic today.",
    image: "/marketing/captures/schedule-booking-omni-adapted.png",
    imageAlt: "Meta Clinic synthetic appointment form showing the patient, time, room, clinician, visit type, and visit reason.",
    imageCaption: "Appointment context in the synthetic clinic demo",
    scene: { image: "/marketing/scheduling-team.png", alt: "Two clinic staff members reviewing a calendar at a workstation.", heading: "The screen matters because a team uses it.", body: "Use a walkthrough to ask what the front desk, clinician, and operations staff each need to see as the same visit moves forward." },
  },
  "/demo": {
    chapter: "Pick a task and follow it",
    introduction: "The guided demo uses synthetic records. Choose a familiar clinic task and watch how its context moves between scheduling, the visit, and operations.",
    cards: [
      { title: "Plan an appointment", body: "Look at visit time, people, room, and reason together before the day begins.", link: "/features/scheduling", label: "See scheduling" },
      { title: "Review the visit", body: "Inspect the patient context and the clinical work that still requires an authorized reviewer.", link: "/platform/clinical-documentation", label: "See documentation" },
      { title: "Close the loop", body: "Look for the invoice state, open balance, and next staff action after the visit.", link: "/platform/billing", label: "See billing" },
    ],
    decisionHeading: "See how the pieces connect.",
    decision: "Trace one appointment from scheduling through visit work and billing. Write down the handoffs you want your team to discuss in a walkthrough.",
    next: "Open the product demo or request a walkthrough using one of your own clinic scenarios.",
    image: "/marketing/scheduling-month.png",
    imageAlt: "Meta Clinic synthetic month schedule with in-person and remote appointments.",
    imageCaption: "Month schedule in the synthetic clinic demo",
  },
  "/sandbox": {
    chapter: "Explore one task at a time",
    introduction: "Use the synthetic product environment to answer a concrete question. Start with a task, note what each role can see, and bring any gaps to a focused walkthrough.",
    cards: [
      { title: "Start with the schedule", body: "Find an appointment and identify its visit type, timing, and assigned resources.", link: "/features/scheduling", label: "View scheduling" },
      { title: "Follow a handoff", body: "Move from the appointment to the recorded visit or staff work that follows it.", link: "/platform/workflows", label: "View workflows" },
      { title: "Record your questions", body: "Separate what you saw from the configuration or connection you still need to verify.", link: "/book-demo", label: "Plan a walkthrough" },
    ],
    decisionHeading: "Explore with a clear question.",
    decision: "Try the schedule, find a visit, and inspect the work that follows. Bring your team's questions to a focused walkthrough.",
    next: "Try the demo, then ask about the exact workflow your team needs.",
    image: "/marketing/tracking-board-app.png",
    imageAlt: "Meta Clinic synthetic tracking board showing visit status and staff work.",
    imageCaption: "Visit handoffs in the synthetic clinic demo",
  },
  "/pricing": {
    chapter: "Define the scope before the number",
    introduction: "Pricing starts with your care model, team size, locations, and the workflows you plan to use first.",
    cards: [
      { title: "Your care model", body: "Name the specialty, locations, team roles, patient access model, and current systems.", link: "/solutions", label: "Explore care models" },
      { title: "Product scope", body: "Choose the workflows to evaluate and ask which functions are currently available for that setup.", link: "/platform", label: "Explore the platform" },
      { title: "Implementation and services", body: "Clarify setup, training, support, external services, and any separate costs in a written proposal.", link: "/book-demo", label: "Discuss scope" },
    ],
    decisionHeading: "Get a quote your team can evaluate.",
    decision: "Compare the proposed scope, implementation work, support, external services, and total commitment in one written proposal.",
    next: "Bring your first use case to a pricing conversation.",
    asideBody: "Share your specialty, team size, locations, and first priority. Those details make the quote useful for a real clinic decision.",
    image: "/marketing/captures/finance-open-invoice-detail.png",
    imageAlt: "Meta Clinic invoice detail with sample clinic charges and an open balance.",
    imageCaption: "Invoice detail",
  },
  "/security": {
    chapter: "Ask for the evidence that applies",
    introduction: "Review how your clinic's data would move, who can access it, and which agreements apply to your setup.",
    cards: [
      { title: "Data and access", body: "Identify the data your clinic would use, who needs access, and which controls should be reviewed.", link: "/platform/roles-permissions", label: "Review access topics" },
      { title: "Connections and vendors", body: "List every external service you expect and ask what connection and agreement currently exists.", link: "/integrations", label: "Review integrations" },
      { title: "Policies and responsibility", body: "Request the applicable documents, owners, dates, and scope before relying on any statement.", link: "/contact", label: "Ask for details" },
    ],
    decisionHeading: "Bring your security questions together.",
    decision: "Share your intended data flows, user roles, and required agreements so the team can answer with the documents and controls relevant to your setup.",
    next: "Send the security questions and environment details that matter to your clinic.",
    asideBody: "Start with the systems you expect to connect, the team members who need access, and the information they handle.",
    image: "/marketing/captures/tutorial-scribe-context.png",
    imageAlt: "Scribe showing recording consent and linked visit controls.",
    imageCaption: "An example of consent and visit-context controls to inspect",
  },
  "/book-demo": {
    chapter: "Make the walkthrough useful",
    introduction: "Share one clinic workflow and the people who need to evaluate it. A concrete scenario helps the conversation start with the right screens.",
    cards: [
      { title: "Name the care model", body: "Tell us your specialty, locations if relevant, and the work your team handles each day.", link: "/solutions", label: "Explore care models" },
      { title: "Choose one journey", body: "Scheduling, incomplete intake, a visit handoff, or an invoice question makes a focused starting point.", link: "/platform", label: "Explore workflows" },
      { title: "Bring the decision makers", body: "Owners, managers, clinicians, and operations staff may need different answers. Bring the people needed for your decision.", link: "/demo", label: "Preview the product" },
    ],
    decisionHeading: "Show us the workflow you care about.",
    decision: "Tell us where the process starts, who touches it, and where it slows down. We can use that path to guide the product walkthrough.",
    next: "Tell us what your clinic needs to see.",
    image: "/marketing/captures/schedule-month-omni-october.png",
    imageAlt: "Meta Clinic calendar with appointment counts across a month.",
    imageCaption: "Start a walkthrough with a real clinic workflow",
    scene: { image: "/marketing/primary-care-front-desk.png", alt: "A patient speaking with a clinic front desk coordinator.", heading: "Bring the people behind the process.", body: "A focused conversation is easier when the people who schedule, deliver, and follow through on care can describe the same journey together." },
  },
  "/contact": {
    chapter: "Route your question to the right conversation",
    introduction: "You can ask about product fit, a clinic workflow, pricing scope, or current security information. Keep the message focused on your business question.",
    cards: [
      { title: "Product fit", body: "Describe the workflow you want to improve and the people who own each step.", link: "/platform", label: "Explore the platform" },
      { title: "A guided look", body: "Use the synthetic demo to identify what you want to inspect with the team.", link: "/demo", label: "Explore the demo" },
      { title: "Current details", body: "Ask for the specific source and scope of a security, integration, or commercial statement.", link: "/security", label: "Review security topics" },
    ],
    decisionHeading: "Get to the right conversation.",
    decision: "Tell us your clinic type, the workflow in question, and the best way to reach you. For patient matters, use your clinic's care channel.",
    next: "Send the business question and a way to reach you.",
    asideBody: "Ask about product fit, a workflow, pricing scope, or security review. Include the best way for us to reach you.",
    image: "/marketing/primary-care-front-desk.png",
    imageAlt: "A patient speaking with a clinic front desk coordinator.",
    imageKind: "photo",
  },
} satisfies Record<string, CoreContent>;

type CorePath = keyof typeof coreContent;

export function isCoreEvaluationPath(path: string): path is CorePath {
  return Object.prototype.hasOwnProperty.call(coreContent, path);
}

export function CoreEvaluationPage({ page, path, form }: { page: GrowthPage; path: CorePath; form?: ReactNode }) {
  const content: CoreContent = coreContent[path];
  const showTour = ["/platform", "/demo", "/sandbox"].includes(path);
  return <main id="main" className="growth-core">
    <section className="growth-core__hero">
      <div className="growth-core__wrap growth-core__hero-grid">
        <div className="growth-core__hero-copy">
          <nav aria-label="Breadcrumb"><a href="/meta-clinic">Meta Clinic</a><span aria-hidden="true"> / </span><span aria-current="page">{page.title}</span></nav>
          <p className="growth-core__eyebrow">{page.eyebrow}</p>
          <h1>{page.headline}</h1>
          <p className="growth-core__lead">{page.lead}</p>
          <div className="growth-core__actions">
            <a className="growth-core__primary" href={page.primaryCta.path}>{page.primaryCta.label}<ArrowForwardRoundedIcon aria-hidden="true" /></a>
            <a className="growth-core__secondary" href={page.secondaryCta.path}>{page.secondaryCta.label}</a>
          </div>
          {(path === "/demo" || path === "/sandbox" || path === "/platform") && <p className="growth-core__hero-note">Product demo with sample clinic records</p>}
        </div>
        {content.image ? <figure className={`growth-core__visual${content.imageKind === "photo" ? " growth-core__visual--photo" : ""}`}>{content.imageKind !== "photo" && <span>Meta Clinic / clinic workspace</span>}<img src={content.image} alt={content.imageAlt} />{content.imageCaption && <figcaption>{content.imageCaption}</figcaption>}</figure>
          : <aside className="growth-core__question"><span>For your evaluation</span><strong>{path === "/pricing" ? "What does your clinic need first?" : path === "/security" ? "Which evidence applies to your environment?" : "What would make this conversation useful?"}</strong><p>{content.asideBody ?? content.introduction}</p></aside>}
      </div>
    </section>

    {form && <section className="growth-core__request" id="request"><div className="growth-core__wrap growth-core__request-grid"><div><p className="growth-core__eyebrow">Your next step</p><h2>{content.next}</h2><p>Tell us about the business workflow. Please leave patient information out of your request.</p></div>{form}</div></section>}

    {showTour && <ProductWalkthrough tour="day" />}
    {!showTour && <section className="growth-core__chapter growth-core__wrap" aria-labelledby="core-chapter-title">
      <div className="growth-core__chapter-heading"><p className="growth-core__eyebrow">The evaluation path</p><h2 id="core-chapter-title">{content.chapter}</h2><p>{content.introduction}</p></div>
      <div className="growth-core__cards">{content.cards.map((card, index) => <article key={card.title}><span>0{index + 1}</span><h3>{card.title}</h3><p>{card.body}</p><a href={marketingUrl(card.link)}>{card.label}<ArrowForwardRoundedIcon aria-hidden="true" /></a></article>)}</div>
    </section>}

    {!showTour && content.scene && <section className="growth-core__scene growth-core__wrap"><figure><img src={content.scene.image} alt={content.scene.alt} loading="lazy" /></figure><div><p className="growth-core__eyebrow">People and process</p><h2>{content.scene.heading}</h2><p>{content.scene.body}</p></div></section>}


    <section className="growth-core__decision growth-core__wrap"><div><p className="growth-core__eyebrow">A closer look</p><h2>{content.decisionHeading}</h2></div><p>{content.decision}</p></section>

    <section className="growth-core__close"><div className="growth-core__wrap"><p className="growth-core__eyebrow">Continue your evaluation</p><h2>{content.next}</h2><div className="growth-core__actions"><a className="growth-core__primary" href={path === "/demo" || path === "/sandbox" ? "/demo" : path === "/book-demo" || path === "/contact" ? "#request" : marketingUrl("/book-demo")}>{path === "/demo" || path === "/sandbox" ? "Open the guided demo" : path === "/book-demo" || path === "/contact" ? "Go to the form" : "Book a walkthrough"}<ArrowForwardRoundedIcon aria-hidden="true" /></a><a className="growth-core__secondary" href={marketingUrl(path === "/platform" ? "/demo" : "/platform")}>{path === "/platform" ? "Explore the demo" : "Explore the platform"}</a></div></div></section>
  </main>;
}
