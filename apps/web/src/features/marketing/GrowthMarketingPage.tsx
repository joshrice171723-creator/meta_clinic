import { useEffect, useState, type FormEvent } from "react";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { Alert, Button, TextField } from "@mui/material";
import { api } from "../../api/client";
import { getGrowthPage, type GrowthPage } from "./growthPageContent";
import {
  marketingInternalPath,
  marketingPaths,
  marketingUrl,
} from "./marketingPaths";
import { CoreEvaluationPage, isCoreEvaluationPath } from "./CoreEvaluationPage";
import { MembershipWalkthrough } from "./MembershipWalkthrough";
import { TutorialLibrary } from "./TutorialLibrary";
import { MarketingHeader } from "./MarketingHeader";
import { ProductWalkthrough } from "./ProductWalkthrough";
import { growthTour, productTours } from "./productWalkthroughs";
import "./growthMarketingPage.css";

const priority = [
  { label: "Weight loss", path: "/weight-loss" },
  { label: "Behavioral health", path: "/behavioral-health" },
  { label: "Cash-pay care", path: "/primary-care/cash-pay" },
];

function WeightLossHeroImage({ src, alt }: { src: string; alt: string }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  return (
    <div className="growth-page__photo-loading" data-image-state={state}>
      <img
        src={src}
        alt={alt}
        width={1536}
        height={1024}
        onLoad={() => setState("ready")}
        onError={() => setState("error")}
      />
      {state !== "ready" && (
        <span className="growth-page__photo-status" role="status">
          {state === "loading"
            ? "Loading clinic image…"
            : "Clinic image unavailable."}
        </span>
      )}
    </div>
  );
}

const conversionPaths = new Set([
  "/book-demo",
  "/request-demo",
  "/contact",
  "/pilot",
  "/get-started",
  "/signup",
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
        body: {
          contact_message: {
            name,
            email,
            message: `${path}: ${message}`,
            website,
          },
        },
      });
      setSuccess(true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The request could not be confirmed. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }
  if (success)
    return (
      <Alert severity="success">
        Your request was received. We will use the contact details you provided
        to follow up.
      </Alert>
    );
  return (
    <form className="growth-page__form" onSubmit={submit}>
      <TextField
        label="Your name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
        slotProps={{ htmlInput: { maxLength: 120 } }}
      />
      <TextField
        label="Work email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
        slotProps={{ htmlInput: { maxLength: 254 } }}
      />
      <TextField
        label="Your clinic and what you would like to see"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        required
        multiline
        minRows={4}
        slotProps={{ htmlInput: { maxLength: 3000 } }}
      />
      <div className="growth-page__honeypot" aria-hidden="true">
        <label htmlFor="growth-website">Website</label>
        <input
          id="growth-website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </div>
      <p>Business inquiries only. Do not include patient information.</p>
      {error && <Alert severity="error">{error}</Alert>}
      <Button type="submit" variant="contained" disabled={pending}>
        {pending ? "Sending request…" : "Request a conversation"}
      </Button>
    </form>
  );
}

function Footer() {
  return (
    <footer className="growth-page__footer">
      <div>
        <strong>Meta Clinic</strong>
        <p>Connected software for independent clinics.</p>
      </div>
      <div>
        <span>Product</span>
        <a href="/meta-clinic/platform">Platform</a>
        <a href="/meta-clinic/ai">AI</a>
        <a href="/meta-clinic/demo">Demo</a>
        <a href="/meta-clinic/pricing">Pricing</a>
      </div>
      <div>
        <span>Specialties</span>
        {priority.map((item) => (
          <a href={marketingUrl(item.path)} key={item.path}>
            {item.label}
          </a>
        ))}
      </div>
      <div>
        <span>Resources</span>
        <a href="/meta-clinic/resources">Guides and templates</a>
        <a href="/meta-clinic/sandbox">Sandbox</a>
        <a href="/meta-clinic/site-map">Site map</a>
      </div>
      <div>
        <span>Company</span>
        <a href="/meta-clinic/about">About</a>
        <a href="/meta-clinic/security">Security</a>
        <a href="/meta-clinic/contact">Contact</a>
        <a href="/login">Sign in</a>
      </div>
    </footer>
  );
}

function Breadcrumbs({ page }: { page: GrowthPage }) {
  const segments = (marketingInternalPath(page.path) ?? page.path)
    .split("/")
    .filter(Boolean);
  const crumbs = segments
    .map((_, index) => {
      const path = marketingUrl(`/${segments.slice(0, index + 1).join("/")}`);
      return {
        path,
        label:
          index === segments.length - 1
            ? page.title
            : getGrowthPage(path)?.title,
      };
    })
    .filter((item) => item.label);
  return (
    <nav className="growth-page__breadcrumb" aria-label="Breadcrumb">
      <ol>
        <li>
          <a href="/meta-clinic">Meta Clinic</a>
        </li>
        {crumbs.map((item, index) => (
          <li key={item.path}>
            {index === crumbs.length - 1 ? (
              <span aria-current="page">{item.label}</span>
            ) : (
              <a href={marketingUrl(item.path)}>{item.label}</a>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Related({ page }: { page: GrowthPage }) {
  return (
    <section className="growth-page__related" aria-labelledby="related-title">
      <div className="growth-page__wrap">
        <p className="growth-page__kicker">Keep exploring</p>
        <h2 id="related-title">Follow the connected workflow.</h2>
        <div className="growth-page__related-grid">
          {page.links.map((link) => (
            <a href={link.path} key={link.path}>
              <span>{link.label}</span>
              <ArrowForwardRoundedIcon aria-hidden="true" />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function Directory({ page }: { page: GrowthPage }) {
  if (page.path === marketingUrl("/site-map")) {
    const groups = new Map<
      string,
      { path: string; label: string; phase: string }[]
    >();
    for (const item of marketingPaths) {
      if (item.path.includes("[")) continue;
      const current = groups.get(item.group) ?? [];
      current.push({
        path: marketingUrl(item.path),
        label: marketingUrl(item.path),
        phase: item.phase,
      });
      groups.set(item.group, current);
    }
    return (
      <section
        id="directory"
        className="growth-page__directory growth-page__wrap"
        aria-label="Marketing page directory"
      >
        <h2>Launch candidate pages</h2>
        <p>
          These pages are the first publishing candidates after product, claim,
          and legal review.
        </p>
        <ul>
          {marketingPaths
            .filter(
              (item) => item.phase === "launch" && !item.path.includes("["),
            )
            .map((item) => (
              <li key={item.path}>
                <a href={marketingUrl(item.path)}>{marketingUrl(item.path)}</a>
              </li>
            ))}
        </ul>
        <details className="growth-page__planned-directory">
          <summary>Browse all planned page drafts</summary>
          <p>
            These routes are available for review. Later, legal, proof, and
            integration pages should be published only when their content and
            claims are verified.
          </p>
          {[...groups].map(([group, items]) => {
            const planned = items.filter((item) => item.phase !== "launch");
            return planned.length ? (
              <div key={group}>
                <h3>{group}</h3>
                <ul>
                  {planned.map((item) => (
                    <li key={item.path}>
                      <a href={marketingUrl(item.path)}>{item.label}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null;
          })}
        </details>
      </section>
    );
  }
  if (!page.children.length) return null;
  return (
    <section
      id="directory"
      className="growth-page__directory growth-page__wrap"
      aria-labelledby="directory-title"
    >
      <p className="growth-page__kicker">Explore this area</p>
      <h2 id="directory-title">Find the specific workflow.</h2>
      <ul>
        {page.children
          .filter((item) => !item.path.includes("["))
          .map((item) => (
            <li key={item.path}>
              <a href={marketingUrl(item.path)}>
                {item.label}
                <ArrowForwardRoundedIcon aria-hidden="true" />
              </a>
            </li>
          ))}
      </ul>
    </section>
  );
}

function PageBody({ page }: { page: GrowthPage }) {
  const internalPath = marketingInternalPath(page.path) ?? page.path;
  const tour = growthTour(internalPath);
  const conversion = conversionPaths.has(internalPath);
  const resource = internalPath.startsWith("/resources");
  const company = page.group === "Company";
  const legal =
    page.group === "Legal" || page.group === "Security / Compliance";
  const integration = page.group === "Integrations";
  const proofOrComparison =
    page.group === "Customer proof" ||
    page.group === "Comparison / alternative pages";
  const legalOrProof = legal || proofOrComparison;
  const evidenceTitle = legalOrProof
    ? "Review the evidence before relying on a claim."
    : integration
      ? "Confirm the exact connection."
      : resource
        ? "Put the guide into a working context."
        : company
          ? internalPath === "/careers"
            ? "Confirm current opportunities and application details."
            : "Understand the current product and company scope."
          : "Inspect the current product workflow.";
  const evidenceAction =
    legalOrProof || integration || company
      ? { label: "Ask for details", path: "/contact" }
      : { label: "Open the guided demo", path: "/demo" };
  const detailsTitle = legal
    ? "Details to review with the responsible owner."
    : proofOrComparison
      ? "Evidence and criteria for a fair evaluation."
      : resource
        ? "Use this guide with your clinic team."
        : company
          ? "What to know about Meta Clinic."
          : `${page.title} in practice.`;
  const faqTitle = legal
    ? "Questions to resolve before relying on a claim."
    : proofOrComparison
      ? "Questions to ask about the evidence."
      : company
        ? "Questions about the organization and product."
        : "Evaluate with your own clinic in mind.";
  const proofPanelText = legal
    ? "Ask for the current approved scope, owner, date, and source before relying on a representation."
    : proofOrComparison
      ? "Request dated sources, permission, and comparable criteria before relying on a story or comparison."
      : integration
        ? "Bring the systems, data flow, responsible owners, and failure path your clinic needs to verify."
        : company
          ? "Ask about current company details, opportunities, or program status relevant to your inquiry."
          : "Bring your clinic’s requirements, staff roles, and exception cases to a focused conversation.";
  let close = {
    title: "See how this could work for your clinic.",
    body: "Explore the synthetic demo, then talk through your real requirements with the team.",
    primary: { label: "Explore the demo", path: "/demo" },
    secondary: { label: "Book a demo", path: "/book-demo" },
  };
  if (legal) {
    close = {
      title: "Request current, approved details.",
      body: "Ask which reviewed policy, control, or agreement applies to your clinic and the service you are evaluating.",
      primary: { label: "Contact the team", path: "/contact" },
      secondary: { label: "Explore the platform", path: "/platform" },
    };
  } else if (integration) {
    close = {
      title: "Confirm the connection in your environment.",
      body: "Bring the systems, data flows, and exception cases your clinic needs to a focused conversation.",
      primary: { label: "Ask about integrations", path: "/contact" },
      secondary: { label: "Explore the platform", path: "/platform" },
    };
  } else if (proofOrComparison) {
    close = {
      title: "Evaluate fit with current evidence.",
      body: "Use your clinic's workflow and dated sources to compare options, then inspect the current product in the synthetic demo.",
      primary: { label: "Explore the demo", path: "/demo" },
      secondary: { label: "Ask a question", path: "/contact" },
    };
  } else if (
    [
      "/resources/videos",
      "/resources/webinars",
      "/resources/api-docs",
      "/resources/help",
    ].includes(internalPath)
  ) {
    close = {
      title: "Ask what is available now.",
      body: "Request current access details, documentation, or support information before relying on this planned resource.",
      primary: { label: "Contact Meta Clinic", path: "/contact" },
      secondary: { label: "Explore the platform", path: "/platform" },
    };
  } else if (internalPath === "/careers") {
    close = {
      title: "Ask about current opportunities.",
      body: "Confirm whether a role is open and request the approved application path before sharing candidate information.",
      primary: { label: "Contact Meta Clinic", path: "/contact" },
      secondary: { label: "About the company", path: "/about" },
    };
  } else if (
    ["/partners", "/partner-program", "/affiliate-program"].includes(
      internalPath,
    )
  ) {
    close = {
      title: "Confirm program status and terms.",
      body: "Ask whether a relationship or program is active and request current written details from the responsible owner.",
      primary: { label: "Contact Meta Clinic", path: "/contact" },
      secondary: { label: "About the company", path: "/about" },
    };
  } else if (company) {
    close = {
      title: "Talk about your clinic's workflow.",
      body: "Share the operating question you want to explore and ask for current product and company details.",
      primary: { label: "Contact Meta Clinic", path: "/contact" },
      secondary: { label: "Explore the demo", path: "/demo" },
    };
  }
  const heroScreen = tour ? productTours[tour].steps[0] : undefined;
  const heroImage = Boolean(page.image || heroScreen);
  const inlineProduct = page.gallery?.length ? undefined : page.productVisual;
  return (
    <>
      <main id="main">
        <section className="growth-page__hero growth-page__wrap">
          <div className="growth-page__hero-copy">
            <Breadcrumbs page={page} />
            <h1>{page.headline}</h1>
            <p className="growth-page__lead">{page.lead}</p>
            <div className="growth-page__actions">
              <Button
                href={page.primaryCta.path}
                variant="contained"
                endIcon={<ArrowForwardRoundedIcon />}
              >
                {page.primaryCta.label}
              </Button>
              <Button
                href={page.secondaryCta.path}
                variant={internalPath === "/weight-loss" ? "text" : "outlined"}
                className={
                  internalPath === "/weight-loss"
                    ? "growth-page__hero-secondary"
                    : undefined
                }
              >
                {page.secondaryCta.label}
              </Button>
            </div>
          </div>
          {heroImage ? (
            <figure
              className={`growth-page__hero-image growth-page__hero-image--${heroScreen ? "product" : (page.imageKind ?? "product")}`}
            >
              {heroScreen ? (
                <a href="#product-walkthrough" aria-label="See the product walkthrough"><img src={heroScreen.image} alt={heroScreen.caption} /></a>
              ) : internalPath === "/weight-loss" ? (
                <WeightLossHeroImage
                  key={page.image}
                  src={page.image!}
                  alt={page.imageAlt ?? "Meta Clinic clinic workspace"}
                />
              ) : (
                <img
                  src={page.image}
                  alt={page.imageAlt ?? "Meta Clinic clinic workspace"}
                />
              )}
              {(heroScreen || page.imageCaption) && (
                <figcaption>{heroScreen?.caption ?? page.imageCaption}</figcaption>
              )}
            </figure>
          ) : null}
        </section>

        {tour && <ProductWalkthrough tour={tour} context="Explore the shared app screens behind this workflow. These examples use sample clinic records; confirm specialty-specific features and setup in a walkthrough." />}

        {!tour && page.gallery?.length ? (
          <section
            className="growth-page__gallery"
            aria-labelledby="gallery-title"
          >
            <div className="growth-page__wrap">
              <p className="growth-page__kicker">Real product screens</p>
              <h2 id="gallery-title">
                See the shared tools behind the journey.
              </h2>
              <p>
                These are separate screens from synthetic demo clinics. The
                specialty workflow and current feature scope should be confirmed
                in a walkthrough.
              </p>
              <div className="growth-page__gallery-grid">
                {page.gallery.map((visual) => (
                  <figure key={visual.image}>
                    <a
                      href={visual.image}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open full-size product screen: ${visual.imageCaption}`}
                    >
                      <img
                        src={visual.image}
                        alt={visual.imageAlt}
                        loading="lazy"
                      />
                      <span className="growth-page__gallery-open">
                        View full screen ↗
                      </span>
                    </a>
                    <figcaption>{visual.imageCaption}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {internalPath !== "/platform/memberships" &&
          /\/(memberships|subscriptions)$/.test(internalPath) && (
            <aside className="growth-page__membership-path growth-page__wrap">
              <div>
                <span>See the complete membership journey</span>
                <strong>
                  From program setup to the patient purchase view.
                </strong>
              </div>
              <a href="/meta-clinic/platform/memberships#build-a-membership">
                Follow the five steps{" "}
                <ArrowForwardRoundedIcon aria-hidden="true" />
              </a>
            </aside>
          )}

        {internalPath === "/platform/memberships" && <MembershipWalkthrough />}
        {conversion ? (
          <section
            id="request"
            className="growth-page__request growth-page__wrap"
          >
            <div>
              <p className="growth-page__kicker">A focused conversation</p>
              <h2>Tell us about your clinic.</h2>
              <p>
                Share the workflow you want to evaluate. We can use the demo to
                walk through that specific journey and discuss whether a pilot
                makes sense.
              </p>
            </div>
            <ContactForm path={page.path} />
          </section>
        ) : (
          <>
            {!tour && internalPath !== "/platform/memberships" && (
              <>
                <section
                  className="growth-page__sequence"
                  aria-labelledby="sequence-title"
                >
                  <div className="growth-page__wrap">
                    <p className="growth-page__kicker">The working sequence</p>
                    <h2 id="sequence-title">See the steps in context.</h2>
                    <div className="growth-page__steps">
                      {page.steps.map((step, index) => (
                        <article key={step}>
                          <span>0{index + 1}</span>
                          <h3>{step}</h3>
                        </article>
                      ))}
                    </div>
                  </div>
                </section>
                <section className="growth-page__proof growth-page__wrap">
                  <div>
                    <p className="growth-page__kicker">
                      {inlineProduct ? "Inside Meta Clinic" : "A closer look"}
                    </p>
                    <h2>{page.visualHeadline ?? evidenceTitle}</h2>
                    {page.note && <p>{page.note}</p>}
                    <Button
                      href={marketingUrl(evidenceAction.path)}
                      endIcon={<ArrowForwardRoundedIcon />}
                    >
                      {evidenceAction.label}
                    </Button>
                  </div>
                  {inlineProduct ? (
                    <figure className="growth-page__product-visual">
                      <img
                        src={inlineProduct.image}
                        alt={inlineProduct.alt}
                        loading="lazy"
                      />
                      <figcaption>{inlineProduct.caption}</figcaption>
                    </figure>
                  ) : (
                    <div className="growth-page__proof-panel">
                      <span>Explore this topic</span>
                      <strong>{page.title}</strong>
                      <p>{proofPanelText}</p>
                      <a
                        href={marketingUrl(
                          legalOrProof || integration || company
                            ? "/contact"
                            : "/book-demo",
                        )}
                      >
                        {legalOrProof || integration || company
                          ? "Ask for current details"
                          : "Discuss your clinic"}{" "}
                        <ArrowForwardRoundedIcon aria-hidden="true" />
                      </a>
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}
        <section
          id="details"
          className="growth-page__editorial growth-page__wrap"
          aria-labelledby="details-title"
        >
          <p className="growth-page__kicker">A closer look</p>
          <h2 id="details-title">{detailsTitle}</h2>
          <div className="growth-page__editorial-grid">
            {page.sections.map((section) => (
              <article key={section.heading}>
                <h3>{section.heading}</h3>
                <p>{section.body}</p>
              </article>
            ))}
          </div>
        </section>
        <Directory page={page} />
        <section className="growth-page__faq" aria-labelledby="faq-title">
          <div className="growth-page__wrap">
            <p className="growth-page__kicker">Questions to ask</p>
            <h2 id="faq-title">{faqTitle}</h2>
            <div className="growth-page__faq-list">
              {page.questions.map((item) => (
                <article key={item.question}>
                  <h3>{item.question}</h3>
                  <p>{item.answer}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <Related page={page} />
        <section className="growth-page__close">
          <div className="growth-page__wrap">
            <p className="growth-page__kicker">The next step</p>
            <h2>{close.title}</h2>
            <p>{close.body}</p>
            <div className="growth-page__actions">
              <Button
                href={marketingUrl(close.primary.path)}
                variant="contained"
              >
                {close.primary.label}
              </Button>
              <Button
                href={marketingUrl(close.secondary.path)}
                variant="outlined"
              >
                {close.secondary.label}
              </Button>
            </div>
          </div>
        </section>
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
    const description =
      document.querySelector<HTMLMetaElement>('meta[name="description"]') ??
      document.head.appendChild(document.createElement("meta"));
    const previousDescription = description.getAttribute("content");
    description.setAttribute("name", "description");
    description.setAttribute("content", page.lead);
    const robots =
      document.querySelector<HTMLMetaElement>('meta[name="robots"]') ??
      document.head.appendChild(document.createElement("meta"));
    const previousRobots = robots.getAttribute("content");
    robots.setAttribute("name", "robots");
    robots.setAttribute("content", "noindex,follow");
    const canonical =
      document.querySelector<HTMLLinkElement>('link[rel="canonical"]') ??
      document.head.appendChild(document.createElement("link"));
    const previousCanonical = canonical.getAttribute("href");
    canonical.setAttribute("rel", "canonical");
    canonical.setAttribute(
      "href",
      new URL(page.canonicalPath, window.location.origin).toString(),
    );
    document.title = `${page.title} | ${page.eyebrow} | Meta Clinic`;
    return () => {
      document.title = previousTitle;
      if (previousDescription === null) description.remove();
      else description.setAttribute("content", previousDescription);
      if (previousRobots === null) robots.remove();
      else robots.setAttribute("content", previousRobots);
      if (previousCanonical === null) canonical.remove();
      else canonical.setAttribute("href", previousCanonical);
    };
  }, [page]);
  if (!page) return null;
  const internalPath = marketingInternalPath(path);
  return (
    <div className="growth-page">
      <a className="growth-page__skip" href="#main">
        Skip to content
      </a>
      <MarketingHeader />
      {internalPath === "/resources" ? (<><TutorialLibrary /><Footer /></>) : internalPath && isCoreEvaluationPath(internalPath) ? (
        <>
          <CoreEvaluationPage
            page={page}
            path={internalPath}
            form={
              internalPath === "/book-demo" || internalPath === "/contact" ? (
                <ContactForm path={page.path} />
              ) : undefined
            }
          />
          <Footer />
        </>
      ) : (
        <PageBody page={page} />
      )}
    </div>
  );
}
