import { useEffect, useState, type FormEvent } from "react";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { Alert, Button, TextField } from "@mui/material";
import { api } from "../../api/client";
import { getGrowthPage, type GrowthPage } from "./growthPageContent";
import { marketingPaths } from "./marketingPaths";
import "./growthMarketingPage.css";

const priority = [
  { label: "Weight loss", path: "/weight-loss" },
  { label: "Behavioral health", path: "/behavioral-health" },
  { label: "Cash-pay care", path: "/primary-care/cash-pay" },
];

const conversionPaths = new Set([
  "/book-demo", "/request-demo", "/contact", "/pilot", "/get-started", "/signup",
]);

function ContactForm({ path }: { path: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await api<{ received: boolean }>("/api/contact_messages", {
        method: "POST",
        body: { contact_message: { name, email, message: `${path}: ${message}`, website } },
      });
      setSuccess(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The request could not be confirmed. Please try again.");
    } finally {
      setPending(false);
    }
  }
  if (success) return <Alert severity="success">Your request was received. We will use the contact details you provided to follow up.</Alert>;
  return (
    <form className="growth-page__form" onSubmit={submit}>
      <TextField label="Your name" value={name} onChange={(event) => setName(event.target.value)} required inputProps={{ maxLength: 120 }} />
      <TextField label="Work email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required inputProps={{ maxLength: 254 }} />
      <TextField label="Your clinic and what you would like to see" value={message} onChange={(event) => setMessage(event.target.value)} required multiline minRows={4} inputProps={{ maxLength: 3000 }} />
      <div className="growth-page__honeypot" aria-hidden="true"><label htmlFor="growth-website">Website</label><input id="growth-website" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></div>
      <p>Business inquiries only. Do not include patient information.</p>
      {error && <Alert severity="error">{error}</Alert>}
      <Button type="submit" variant="contained" disabled={pending}>{pending ? "Sending request…" : "Request a conversation"}</Button>
    </form>
  );
}

function Header() {
  return (
    <header className="growth-page__header">
      <a className="growth-page__brand" href="/" aria-label="Meta Clinic home"><span className="growth-page__mark" aria-hidden="true">✳</span> Meta Clinic</a>
      <nav aria-label="Marketing navigation">
        <details className="growth-page__nav-menu"><summary>Platform</summary><div>
          <a href="/platform">Platform overview</a>
          <a href="/platform/scheduling">Scheduling</a>
          <a href="/platform/patient-intake">Patient intake</a>
          <a href="/platform/memberships">Memberships</a>
          <a href="/platform/inventory">Inventory</a>
          <a href="/platform/billing">Billing</a>
          <a href="/platform/workflows">Workflows</a>
        </div></details>
        <details className="growth-page__nav-menu"><summary>Specialties</summary><div>
          {priority.map((item) => <a href={item.path} key={item.path}>{item.label}</a>)}
          <a href="/infusion">Infusion</a>
        </div></details>
        <a href="/ai">AI</a>
        <a href="/security">Security</a>
        <a href="/pricing">Pricing</a>
        <a href="/resources">Resources</a>
        <a className="growth-page__mobile-signin" href="/login">Sign in</a>
      </nav>
      <a className="growth-page__signin" href="/login">Sign in</a>
      <Button href="/book-demo" variant="contained" size="small">Book a demo</Button>
    </header>
  );
}

function Footer() {
  return (
    <footer className="growth-page__footer">
      <div><strong>Meta Clinic</strong><p>Connected software for independent clinics.</p></div>
      <div><span>Product</span><a href="/platform">Platform</a><a href="/ai">AI</a><a href="/demo">Demo</a><a href="/pricing">Pricing</a></div>
      <div><span>Specialties</span>{priority.map((item) => <a href={item.path} key={item.path}>{item.label}</a>)}<a href="/infusion">Infusion</a></div>
      <div><span>Resources</span><a href="/resources">Guides and templates</a><a href="/sandbox">Sandbox</a><a href="/site-map">Site map</a></div>
      <div><span>Company</span><a href="/about">About</a><a href="/security">Security</a><a href="/contact">Contact</a><a href="/login">Sign in</a></div>
    </footer>
  );
}

function Breadcrumbs({ page }: { page: GrowthPage }) {
  const segments = page.path.split("/").filter(Boolean);
  const crumbs = segments.map((_, index) => {
    const path = `/${segments.slice(0, index + 1).join("/")}`;
    return { path, label: index === segments.length - 1 ? page.title : getGrowthPage(path)?.title };
  }).filter((item) => item.label);
  return <nav className="growth-page__breadcrumb" aria-label="Breadcrumb"><ol>
    <li><a href="/">Meta Clinic</a></li>
    {crumbs.map((item, index) => <li key={item.path}>{index === crumbs.length - 1 ? <span aria-current="page">{item.label}</span> : <a href={item.path}>{item.label}</a>}</li>)}
  </ol></nav>;
}

function Related({ page }: { page: GrowthPage }) {
  return (
    <section className="growth-page__related" aria-labelledby="related-title">
      <div className="growth-page__wrap"><p className="growth-page__kicker">Keep exploring</p><h2 id="related-title">Follow the connected workflow.</h2>
        <div className="growth-page__related-grid">
          {page.links.map((link) => <a href={link.path} key={link.path}><span>{link.label}</span><ArrowForwardRoundedIcon aria-hidden="true" /></a>)}
        </div>
      </div>
    </section>
  );
}

function Directory({ page }: { page: GrowthPage }) {
  if (page.path === "/site-map") {
    const groups = new Map<string, { path: string; label: string; phase: string }[]>();
    for (const item of marketingPaths) {
      if (item.path.includes("[")) continue;
      const current = groups.get(item.group) ?? [];
      current.push({ path: item.path, label: item.path, phase: item.phase });
      groups.set(item.group, current);
    }
    return <section id="directory" className="growth-page__directory growth-page__wrap" aria-label="Marketing page directory">
      <h2>Launch candidate pages</h2>
      <p>These pages are the first publishing candidates after product, claim, and legal review.</p>
      <ul>{marketingPaths.filter((item) => item.phase === "launch" && !item.path.includes("[")).map((item) => <li key={item.path}><a href={item.path}>{item.path}</a></li>)}</ul>
      <details className="growth-page__planned-directory"><summary>Browse all planned page drafts</summary>
        <p>These routes are available for review. Later, legal, proof, and integration pages should be published only when their content and claims are verified.</p>
        {[...groups].map(([group, items]) => {
          const planned = items.filter((item) => item.phase !== "launch");
          return planned.length ? <div key={group}><h3>{group}</h3><ul>{planned.map((item) => <li key={item.path}><a href={item.path}>{item.label}</a></li>)}</ul></div> : null;
        })}
      </details>
    </section>;
  }
  if (!page.children.length) return null;
  return <section id="directory" className="growth-page__directory growth-page__wrap" aria-labelledby="directory-title"><p className="growth-page__kicker">Explore this area</p><h2 id="directory-title">Find the specific workflow.</h2><ul>{page.children.filter((item) => !item.path.includes("[")).map((item) => <li key={item.path}><a href={item.path}>{item.label}<ArrowForwardRoundedIcon aria-hidden="true" /></a></li>)}</ul></section>;
}

function PageBody({ page }: { page: GrowthPage }) {
  const conversion = conversionPaths.has(page.path);
  const phase = marketingPaths.find((item) => item.path === page.path)?.phase;
  const resource = page.path.startsWith("/resources");
  const company = page.group === "Company";
  const legal = page.group === "Legal" || page.group === "Security / Compliance";
  const integration = page.group === "Integrations";
  const proofOrComparison = page.group === "Customer proof" || page.group === "Comparison / alternative pages";
  const legalOrProof = legal || proofOrComparison;
  const evidenceTitle = legalOrProof
    ? "Review the evidence before relying on a claim."
    : integration
      ? "Confirm the exact connection."
      : resource
        ? "Put the guide into a working context."
        : company
          ? (page.path === "/careers" ? "Confirm current opportunities and application details." : "Understand the current product and company scope.")
          : "Inspect the current product workflow.";
  const evidenceAction = legalOrProof || integration || company
    ? { label: "Ask for details", path: "/contact" }
    : { label: "Open the guided demo", path: "/demo" };
  const detailsTitle = legal ? "Details to review with the responsible owner."
    : proofOrComparison ? "Evidence and criteria for a fair evaluation."
      : resource ? "Use this guide with your clinic team."
        : company ? "What to know about Meta Clinic."
          : "What to examine in this workflow.";
  const faqTitle = legal ? "Questions to resolve before relying on a claim."
    : proofOrComparison ? "Questions to ask about the evidence."
      : company ? "Questions about the organization and product."
        : "Evaluate with your own clinic in mind.";
  const proofPanelText = legal ? "Ask for the current approved scope, owner, date, and source before relying on a representation."
    : proofOrComparison ? "Request dated sources, permission, and comparable criteria before relying on a story or comparison."
      : integration ? "Bring the systems, data flow, responsible owners, and failure path your clinic needs to verify."
        : company ? "Ask about current company details, opportunities, or program status relevant to your inquiry."
          : "Bring your clinic’s requirements, staff roles, and exception cases to a focused conversation.";
  let close = { title: "See how this could work for your clinic.", body: "Explore the synthetic demo, then talk through your real requirements with the team.", primary: { label: "Explore the demo", path: "/demo" }, secondary: { label: "Book a demo", path: "/book-demo" } };
  if (legal) {
    close = { title: "Request current, approved details.", body: "Ask which reviewed policy, control, or agreement applies to your clinic and the service you are evaluating.", primary: { label: "Contact the team", path: "/contact" }, secondary: { label: "Explore the platform", path: "/platform" } };
  } else if (integration) {
    close = { title: "Confirm the connection in your environment.", body: "Bring the systems, data flows, and exception cases your clinic needs to a focused conversation.", primary: { label: "Ask about integrations", path: "/contact" }, secondary: { label: "Explore the platform", path: "/platform" } };
  } else if (proofOrComparison) {
    close = { title: "Evaluate fit with current evidence.", body: "Use your clinic's workflow and dated sources to compare options, then inspect the current product in the synthetic demo.", primary: { label: "Explore the demo", path: "/demo" }, secondary: { label: "Ask a question", path: "/contact" } };
  } else if (["/resources/videos", "/resources/webinars", "/resources/api-docs", "/resources/help"].includes(page.path)) {
    close = { title: "Ask what is available now.", body: "Request current access details, documentation, or support information before relying on this planned resource.", primary: { label: "Contact Meta Clinic", path: "/contact" }, secondary: { label: "Explore the platform", path: "/platform" } };
  } else if (page.path === "/careers") {
    close = { title: "Ask about current opportunities.", body: "Confirm whether a role is open and request the approved application path before sharing candidate information.", primary: { label: "Contact Meta Clinic", path: "/contact" }, secondary: { label: "About the company", path: "/about" } };
  } else if (["/partners", "/partner-program", "/affiliate-program"].includes(page.path)) {
    close = { title: "Confirm program status and terms.", body: "Ask whether a relationship or program is active and request current written details from the responsible owner.", primary: { label: "Contact Meta Clinic", path: "/contact" }, secondary: { label: "About the company", path: "/about" } };
  } else if (company) {
    close = { title: "Talk about your clinic's workflow.", body: "Share the operating question you want to explore and ask for current product and company details.", primary: { label: "Contact Meta Clinic", path: "/contact" }, secondary: { label: "Explore the demo", path: "/demo" } };
  }
  const heroImage = page.image && !conversion && !legalOrProof;
  return (
    <>
      <main id="main">
        <section className="growth-page__hero growth-page__wrap">
          <div className="growth-page__hero-copy">
            <Breadcrumbs page={page} />
            <p className="growth-page__kicker">{page.eyebrow}</p>
            <h1>{page.headline}</h1>
            <p className="growth-page__lead">{page.lead}</p>
            <p className="growth-page__audience"><span>For</span> {page.audience}</p>
            {phase === "later" && <Alert severity="info">This page is a planning preview. Confirm the current feature scope during evaluation.</Alert>}
            {phase === "review" && <Alert severity="info">This content is awaiting legal and security review. Ask for current, approved details before relying on a claim.</Alert>}
            {phase === "evidence" && <Alert severity="info">This page is reserved until the underlying evidence and publication permission are verified.</Alert>}
            {page.group === "Legal" && phase !== "review" && <Alert severity="info">This is a review outline. It is not a published policy or agreement.</Alert>}
            {page.group === "Customer proof" && phase !== "evidence" && <Alert severity="info">Customer stories and results will appear here only with verified evidence and permission.</Alert>}
            {page.group === "Comparison / alternative pages" && phase !== "evidence" && <Alert severity="info">Comparisons will be published only when criteria and sources are verified.</Alert>}
            <div className="growth-page__actions">
              <Button href={page.primaryCta.path} variant="contained" endIcon={<ArrowForwardRoundedIcon />}>{page.primaryCta.label}</Button>
              <Button href={page.secondaryCta.path} variant="outlined">{page.secondaryCta.label}</Button>
            </div>
          </div>
          {heroImage ? <figure className="growth-page__hero-image"><img src={page.image} alt={page.imageAlt ?? "Meta Clinic demonstration screen"} /><figcaption>{page.imageCaption}</figcaption></figure> : <div className="growth-page__hero-diagram" aria-label="Key steps in this workflow">{page.steps.slice(0, 3).map((step, index) => <span key={step}>0{index + 1} / {step}</span>)}</div>}
        </section>

        {page.gallery?.length ? <section className="growth-page__gallery" aria-labelledby="gallery-title"><div className="growth-page__wrap">
          <p className="growth-page__kicker">Real product screens</p>
          <h2 id="gallery-title">See the shared tools behind the journey.</h2>
          <p>These are separate screens from synthetic demo clinics. The specialty workflow and current feature scope should be confirmed in a walkthrough.</p>
          <div className="growth-page__gallery-grid">{page.gallery.map((visual) => <figure key={visual.image}>
            <img src={visual.image} alt={visual.imageAlt} loading="lazy" />
            <figcaption>{visual.imageCaption}</figcaption>
          </figure>)}</div>
        </div></section> : null}

        {conversion ? (
          <section id="request" className="growth-page__request growth-page__wrap"><div><p className="growth-page__kicker">A focused conversation</p><h2>Tell us about your clinic.</h2><p>Share the workflow you want to evaluate. We can use the demo to walk through that specific journey and discuss whether a pilot makes sense.</p></div><ContactForm path={page.path} /></section>
        ) : (
          <>
            <section className="growth-page__sequence" aria-labelledby="sequence-title"><div className="growth-page__wrap"><p className="growth-page__kicker">The working sequence</p><h2 id="sequence-title">See the steps in context.</h2><div className="growth-page__steps">{page.steps.map((step, index) => <article key={step}><span>0{index + 1}</span><h3>{step}</h3></article>)}</div></div></section>
            <section className="growth-page__proof growth-page__wrap"><div><p className="growth-page__kicker">Evaluation detail</p><h2>{evidenceTitle}</h2><p>{page.note}</p><Button href={evidenceAction.path} endIcon={<ArrowForwardRoundedIcon />}>{evidenceAction.label}</Button></div><div className="growth-page__proof-panel"><span>Explore this topic</span><strong>{page.title}</strong><p>{proofPanelText}</p><a href={legalOrProof || integration || company ? "/contact" : "/book-demo"}>{legalOrProof || integration || company ? "Ask for current details" : "Discuss your clinic"} <ArrowForwardRoundedIcon aria-hidden="true" /></a></div></section>
            <Related page={page} />
          </>
        )}
        <section id="details" className="growth-page__editorial growth-page__wrap" aria-labelledby="details-title">
          <p className="growth-page__kicker">A closer look</p>
          <h2 id="details-title">{detailsTitle}</h2>
          <div className="growth-page__editorial-grid">
            {page.sections.map((section) => <article key={section.heading}><h3>{section.heading}</h3><p>{section.body}</p></article>)}
          </div>
        </section>
        <Directory page={page} />
        <section className="growth-page__faq" aria-labelledby="faq-title"><div className="growth-page__wrap"><p className="growth-page__kicker">Questions to ask</p><h2 id="faq-title">{faqTitle}</h2><div className="growth-page__faq-list">{page.questions.map((item) => <article key={item.question}><h3>{item.question}</h3><p>{item.answer}</p></article>)}</div></div></section>
        <section className="growth-page__close"><div className="growth-page__wrap"><p className="growth-page__kicker">The next step</p><h2>{close.title}</h2><p>{close.body}</p><div className="growth-page__actions"><Button href={close.primary.path} variant="contained">{close.primary.label}</Button><Button href={close.secondary.path} variant="outlined">{close.secondary.label}</Button></div></div></section>
      </main>
      <Footer />
    </>
  );
}

export function GrowthMarketingPage({ path }: { path: string }) {
  const page = getGrowthPage(path);
  useEffect(() => {
    if (!page) return;
    const previousTitle = document.title;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]') ?? document.head.appendChild(document.createElement("meta"));
    const previousDescription = description.getAttribute("content");
    description.setAttribute("name", "description");
    description.setAttribute("content", page.lead);
    const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]') ?? document.head.appendChild(document.createElement("meta"));
    const previousRobots = robots.getAttribute("content");
    robots.setAttribute("name", "robots");
    robots.setAttribute("content", "noindex,follow");
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]') ?? document.head.appendChild(document.createElement("link"));
    const previousCanonical = canonical.getAttribute("href");
    canonical.setAttribute("rel", "canonical");
    canonical.setAttribute("href", new URL(page.canonicalPath, window.location.origin).toString());
    document.title = `${page.title} | ${page.eyebrow} | Meta Clinic`;
    return () => { document.title = previousTitle; if (previousDescription === null) description.remove(); else description.setAttribute("content", previousDescription); if (previousRobots === null) robots.remove(); else robots.setAttribute("content", previousRobots); if (previousCanonical === null) canonical.remove(); else canonical.setAttribute("href", previousCanonical); };
  }, [page]);
  if (!page) return null;
  return <div className="growth-page"><a className="growth-page__skip" href="#main">Skip to content</a><Header /><PageBody page={page} /></div>;
}
