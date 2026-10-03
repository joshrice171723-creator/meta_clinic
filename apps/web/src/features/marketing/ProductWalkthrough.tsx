import { useEffect } from "react";
import { Button } from "@mui/material";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import { productTours, type ProductTourKey } from "./productWalkthroughs";
import "./productWalkthrough.css";

export function ProductWalkthrough({
  tour,
  id = "product-walkthrough",
  context,
}: {
  tour: ProductTourKey;
  id?: string;
  context?: string;
}) {
  const content = productTours[tour];
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (
      hash !== id &&
      !content.steps.some((_, index) => hash === `${id}-${index + 1}`)
    )
      return;
    const frame = requestAnimationFrame(() =>
      document.getElementById(hash)?.scrollIntoView(),
    );
    return () => cancelAnimationFrame(frame);
  }, [id, content]);

  return (
    <section
      className="product-walkthrough"
      id={id}
      aria-labelledby={`${id}-title`}
    >
      <div className="product-walkthrough__wrap">
        <header className="product-walkthrough__intro">
          <h2 id={`${id}-title`}>{content.title}</h2>
          <p>{content.introduction}</p>
          {context && <p className="product-walkthrough__context">{context}</p>}
          <nav
            aria-label="Walkthrough steps"
            className="product-walkthrough__rail"
          >
            {content.steps.map((step, index) => (
              <a href={`#${id}-${index + 1}`} key={step.label}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {step.label}
              </a>
            ))}
          </nav>
        </header>
        {content.steps.map((step, index) => (
          <article
            className="product-walkthrough__step"
            id={`${id}-${index + 1}`}
            key={step.label}
          >
            <div className="product-walkthrough__copy">
              <span className="product-walkthrough__number">
                Step {index + 1} / {step.label}
              </span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              <p className="product-walkthrough__detail">{step.detail}</p>
              {tour === "day" && (
                <Button
                  href={step.href}
                  endIcon={<ArrowForwardRoundedIcon />}
                  className="product-walkthrough__feature-link"
                >
                  Explore this feature
                </Button>
              )}
            </div>
            <figure className="product-walkthrough__screen">
              <a
                href={step.image}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open full-size image in a new tab: ${step.caption}`}
              >
                <img
                  src={step.image}
                  alt={step.caption}
                  width={step.width}
                  height={step.height}
                  loading="lazy"
                  decoding="async"
                />
                <span className="product-walkthrough__enlarge">
                  View full screen <OpenInNewRoundedIcon aria-hidden="true" />
                </span>
              </a>
              <figcaption>{step.caption}</figcaption>
            </figure>
          </article>
        ))}
        <footer className="product-walkthrough__close">
          <div>
            <h3>Now see it for yourself.</h3>
            <p>
              Actual app screens with sample clinic records. Explore the demo,
              or walk through your clinic's needs with us.
            </p>
          </div>
          <div className="product-walkthrough__actions">
            <Button
              href="/demo"
              variant="contained"
              endIcon={<ArrowForwardRoundedIcon />}
            >
              Try the demo
            </Button>
            <Button href="/meta-clinic/book-demo" variant="outlined">
              Book a walkthrough
            </Button>
          </div>
        </footer>
      </div>
    </section>
  );
}
