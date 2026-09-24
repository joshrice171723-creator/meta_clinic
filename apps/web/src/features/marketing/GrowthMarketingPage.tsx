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
        <a href="/platform">Platform</a>
        <a href="/weight-loss">Weight loss</a>
        <a href="/behavioral-health">Behavioral health</a>
        <a href="/primary-care/cash-pay">Cash-pay care</a>
        <a href="/ai">AI</a>
        <a href="/security">Security</a>
        <a href="/pricing">Pricing</a>
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
      <div><span>Explore</span><a href="/platform">Platform</a><a href="/demo">Demo</a><a href="/resources">Resources</a></div>
      <div><span>Specialties</span>{priority.map((item) => <a href={item.path} key={item.path}>{item.label}</a>)}</div>
      <div><span>Company</span><a href="/about">About</a><a href="/contact">Contact</a><a href="/site-map">Site map</a><a href="/legal/privacy">Privacy</a><a href="/legal/terms">Terms</a></div>
    </footer>
  );
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
    const groups = new Map<string, { path: string; label: string }[]>();
    for (const item of marketingPaths) {
      if (item.path.includes("[")) continue;
      const current = groups.get(item.group) ?? [];
      current.push({ path: item.path, label: item.path });
      groups.set(item.group, current);
    }
    return <section id="directory" className="growth-page__directory growth-page__wrap" aria-label="All marketing topics">{[...groups].map(([group, items]) => <div key={group}><h2>{group}</h2><ul>{items.map((item) => <li key={item.path}><a href={item.path}>{item.label}</a></li>)}</ul></div>)}</section>;
  }
  if (!page.children.length) return null;
  return <section id="directory" className="growth-page__directory growth-page__wrap" aria-labelledby="directory-title"><p className="growth-page__kicker">Explore this area</p><h2 id="directory-title">Find the specific workflow.</h2><ul>{page.children.filter((item) => !item.path.includes("[")).map((item) => <li key={item.path}><a href={item.path}>{item.label}<ArrowForwardRoundedIcon aria-hidden="true" /></a></li>)}</ul></section>;
}

function PageBody({ page }: { page: GrowthPage }) {
  const conversion = conversionPaths.has(page.path);
  const legalOrProof = page.group === "Legal" || page.group === "Security / Compliance" || page.group === "Customer proof" || page.group === "Comparison / alternative pages";
  const evidenceTitle = legalOrProof
    ? "Review the evidence before relying on a claim."
    : page.group === "Integrations"
      ? "Confirm the exact connection."
      : page.path.startsWith("/resources")
        ? "Put the guide into a working context."
        : "Inspect the current product workflow.";
  const evidenceAction = legalOrProof || page.group === "Integrations"
    ? { label: "Ask for details", path: "/contact" }
    : { label: "Open the guided demo", path: "/demo" };
  const heroImage = page.image && !conversion && !legalOrProof;
  return (
    <>
      <main id="main">
        <section className="growth-page__hero growth-page__wrap">
          <div className="growth-page__hero-copy">
            <a className="growth-page__breadcrumb" href="/">Meta Clinic <span aria-hidden="true">/</span> {page.title}</a>
            <p className="growth-page__kicker">{page.eyebrow}</p>
            <h1>{page.headline}</h1>
            <p className="growth-page__lead">{page.lead}</p>
            {page.group === "Legal" && <Alert severity="info">This is a review outline. It is not a published policy or agreement.</Alert>}
            {page.group === "Customer proof" && <Alert severity="info">Customer stories and results will appear here only with verified evidence and permission.</Alert>}
            {page.group === "Comparison / alternative pages" && <Alert severity="info">Comparisons will be published only when criteria and sources are verified.</Alert>}
            <div className="growth-page__actions">
              <Button href={page.primaryCta.path} variant="contained" endIcon={<ArrowForwardRoundedIcon />}>{page.primaryCta.label}</Button>
              <Button href={page.secondaryCta.path} variant="outlined">{page.secondaryCta.label}</Button>
            </div>
          </div>
          {heroImage ? <figure className="growth-page__hero-image"><img src={page.image} alt={page.imageAlt ?? "Meta Clinic demonstration screen"} /><figcaption>{page.imageCaption}</figcaption></figure> : <div className="growth-page__hero-diagram" aria-label="Key steps in this workflow">{page.steps.map((step, index) => <span key={step}>0{index + 1} / {step}</span>)}</div>}
        </section>

        {conversion ? (
          <section id="request" className="growth-page__request growth-page__wrap"><div><p className="growth-page__kicker">A focused conversation</p><h2>Tell us about your clinic.</h2><p>Share the workflow you want to evaluate. We can use the demo to walk through that specific journey and discuss whether a pilot makes sense.</p></div><ContactForm path={page.path} /></section>
        ) : (
          <>
            <section className="growth-page__sequence" aria-labelledby="sequence-title"><div className="growth-page__wrap"><p className="growth-page__kicker">The working sequence</p><h2 id="sequence-title">See the steps in context.</h2><div className="growth-page__steps">{page.steps.map((step, index) => <article key={step}><span>0{index + 1}</span><h3>{step}</h3></article>)}</div></div></section>
            <section className="growth-page__proof growth-page__wrap"><div><p className="growth-page__kicker">Evaluation detail</p><h2>{evidenceTitle}</h2><p>{page.note}</p><Button href={evidenceAction.path} endIcon={<ArrowForwardRoundedIcon />}>{evidenceAction.label}</Button></div><div className="growth-page__proof-panel"><span>Explore this topic</span><strong>{page.title}</strong><p>Bring your clinic’s requirements, staff roles, and exception cases to a focused conversation.</p><a href="/book-demo">Discuss your clinic <ArrowForwardRoundedIcon aria-hidden="true" /></a></div></section>
            <Related page={page} />
          </>
        )}
        <section id="details" className="growth-page__editorial growth-page__wrap" aria-labelledby="details-title">
          <p className="growth-page__kicker">A closer look</p>
          <h2 id="details-title">What to examine in this workflow.</h2>
          <div className="growth-page__editorial-grid">
            {page.sections.map((section) => <article key={section.heading}><h3>{section.heading}</h3><p>{section.body}</p></article>)}
          </div>
        </section>
        <Directory page={page} />
        <section className="growth-page__faq" aria-labelledby="faq-title"><div className="growth-page__wrap"><p className="growth-page__kicker">Questions to ask</p><h2 id="faq-title">Evaluate with your own clinic in mind.</h2><div className="growth-page__faq-list">{page.questions.map((item) => <article key={item.question}><h3>{item.question}</h3><p>{item.answer}</p></article>)}</div></div></section>
        <section className="growth-page__close"><div className="growth-page__wrap"><p className="growth-page__kicker">The next step</p><h2>See how this could work for your clinic.</h2><p>Explore the synthetic demo, then talk through your real requirements with the team.</p><div className="growth-page__actions"><Button href="/demo" variant="contained">Explore the demo</Button><Button href="/book-demo" variant="outlined">Book a demo</Button></div></div></section>
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
