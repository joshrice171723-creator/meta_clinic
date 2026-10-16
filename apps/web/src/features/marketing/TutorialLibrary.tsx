import { Button } from "@mui/material";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { featureGroups, featureHref, type MarketingFeature } from "./features";
import { featureTour, productTours } from "./productWalkthroughs";
import "./tutorialLibrary.css";

function tutorialScreen(feature: MarketingFeature) {
  if (feature.slug === "memberships-packages") {
    return {
      image:
        "/marketing/captures/membership-programs-populated-northside-clinic-2026-09-24-synthetic-direct.png",
      caption: "Membership catalog showing published and draft programs.",
    };
  }
  const tour = featureTour(feature.slug);
  return tour ? productTours[tour]?.steps[0] : undefined;
}

function tutorialSummary(feature: MarketingFeature) {
  if (feature.slug === "reminders")
    return "Review upcoming visits, contact readiness, and message-history states. The demo uses sandbox delivery.";
  if (feature.slug === "telehealth")
    return "Review preparation, consent policy, and waiting-room readiness. Video is not connected in the captured demo.";
  return feature.summary;
}

const groupId = (heading: string) =>
  `tutorials-${heading.toLowerCase().replaceAll(" ", "-")}`;

export function TutorialLibrary() {
  return (
    <main id="main" className="tutorial-library">
      <div className="tutorial-library__wrap">
        <nav className="tutorial-library__breadcrumb" aria-label="Breadcrumb">
          <Button href="/meta-clinic">Meta Clinic</Button>
          <span aria-hidden="true">/</span>
          <span aria-current="page">Tutorial library</span>
        </nav>
        <header className="tutorial-library__intro">
          <p className="tutorial-library__eyebrow">The tutorial library</p>
          <h1>Learn the workflow, one screen at a time.</h1>
          <p className="tutorial-library__lead">
            Start with the work you want to understand. Each tutorial follows
            the actual app screens, explains what to look for, and connects each
            step to the next.
          </p>
          <Button
            href="/demo"
            variant="contained"
            disableElevation
            sx={{
              "&&&&&": {
                backgroundColor: "#6d28d9",
                borderColor: "#6d28d9",
                color: "#fff",
              },
              "&&&&&:hover": {
                backgroundColor: "#5b21b6",
                borderColor: "#5b21b6",
              },
            }}
            endIcon={<ArrowForwardRoundedIcon />}
          >
            Try Our Sandbox
          </Button>
          <nav
            className="tutorial-library__jump"
            aria-label="Tutorial categories"
          >
            {featureGroups.map((group, index) => (
              <Button key={group.heading} href={`#${groupId(group.heading)}`}>
                <span className="tutorial-library__jump-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {group.heading}
              </Button>
            ))}
          </nav>
        </header>
        {featureGroups.map((group, groupIndex) => {
          const offset = featureGroups
            .slice(0, groupIndex)
            .reduce((count, previous) => count + previous.features.length, 0);
          return (
            <section
              className="tutorial-library__group"
              id={groupId(group.heading)}
              key={group.heading}
              aria-labelledby={`${groupId(group.heading)}-title`}
            >
              <div className="tutorial-library__group-heading">
                <span>{String(groupIndex + 1).padStart(2, "0")}</span>
                <h2 id={`${groupId(group.heading)}-title`}>{group.heading}</h2>
                <p>{group.features.length} tutorials</p>
              </div>
              <div className="tutorial-library__grid">
                {group.features.map((feature, index) => {
                  const screen = tutorialScreen(feature);
                  return (
                    <article
                      className="tutorial-library__card"
                      key={feature.slug}
                    >
                      {screen && (
                        <a
                          className="tutorial-library__screen"
                          href={featureHref(feature)}
                          aria-label={`Read the ${feature.label.toLowerCase()} tutorial`}
                        >
                          <img
                            src={screen.image}
                            alt={screen.caption}
                            loading="lazy"
                            decoding="async"
                          />
                        </a>
                      )}
                      <div className="tutorial-library__copy">
                        <span className="tutorial-library__number">
                          Tutorial {String(offset + index + 1).padStart(2, "0")}
                        </span>
                        <h3>{feature.label}</h3>
                        <p>{tutorialSummary(feature)}</p>
                        <Button
                          href={featureHref(feature)}
                          endIcon={<ArrowForwardRoundedIcon />}
                          className="tutorial-library__read"
                          aria-label={`Read the ${feature.label.toLowerCase()} tutorial`}
                        >
                          Read the tutorial
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
        <section
          className="tutorial-library__close"
          aria-labelledby="tutorial-library-demo-title"
        >
          <div>
            <h2 id="tutorial-library-demo-title">See the steps together.</h2>
            <p>
              Bring your clinic’s questions to a guided product conversation.
            </p>
          </div>
          <Button href="/demo" variant="contained" disableElevation>
            Try Our Sandbox
          </Button>
        </section>
      </div>
    </main>
  );
}
