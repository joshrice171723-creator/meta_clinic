import { ProductWalkthrough } from "./ProductWalkthrough";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { Button, ToggleButton, ToggleButtonGroup } from "@mui/material";
import { useState } from "react";
import "./flagshipFeaturePages.css";

export type FlagshipSlug = "inventory" | "scheduling" | "clinical-notes";

export function isFlagshipSlug(value: string): value is FlagshipSlug {
  return (
    value === "inventory" ||
    value === "scheduling" ||
    value === "clinical-notes"
  );
}

function Crumb({ current }: { current: string }) {
  return (
    <a className="meta-flagship__crumb" href="/meta-clinic/resources">
      All features <span aria-hidden="true">/</span> {current}
    </a>
  );
}

function Screen({
  src,
  alt,
  label,
  caption = "Synthetic app preview",
  className = "",
}: {
  src: string;
  alt: string;
  label: string;
  caption?: string;
  className?: string;
}) {
  return (
    <figure className={`meta-flagship__screen ${className}`}>
      <div className="meta-flagship__screen-top">
        <span className="meta-flagship__screen-lights" aria-hidden="true">
          <i /> <i /> <i />
        </span>
        <span>Meta Clinic / clinic workspace</span>
      </div>
      <img src={src} alt={alt} loading="eager" decoding="async" />
      <figcaption>
        {label} · {caption}
      </figcaption>
    </figure>
  );
}

function NextFeature({
  label,
  href,
  heading,
}: {
  label: string;
  href: string;
  heading: string;
}) {
  return (
    <aside className="meta-flagship__next">
      <div>
        <span>Next in the clinic day</span>
        <h2>{heading}</h2>
      </div>
      <a href={href}>
        Explore {label} <ArrowForwardRoundedIcon aria-hidden="true" />
      </a>
    </aside>
  );
}

function InventoryPage() {
  return (
    <main id="main" className="meta-flagship meta-flagship--inventory">
      <section className="meta-flagship__inventory-hero">
        <div className="meta-flagship__container meta-flagship__inventory-grid">
          <div className="meta-flagship__inventory-copy">
            <Crumb current="Inventory" />
            <p className="meta-flagship__overline">01 / Clinic operations</p>
            <h1>Every item has a story. Know where it stands.</h1>
            <p className="meta-flagship__lead">
              See recorded stock, spot a low quantity, and move into the work of
              replenishing it from the same clinic workspace.
            </p>
            <div className="meta-flagship__hero-actions">
              <Button
                href="/demo"
                variant="contained"
                disableElevation
                endIcon={<ArrowForwardRoundedIcon />}
              >
                Try the demo
              </Button>
              <Button href="#inventory-workflow" variant="outlined">
                Explore the steps
              </Button>
            </div>
          </div>
          <div className="meta-flagship__inventory-photo">
            <span className="meta-flagship__photo-index">THE PRODUCT / 01</span>
            <Screen
              src="/marketing/captures/inventory-catalog-100-products.png"
              alt="Actual Meta Clinic inventory catalog showing fictional products, on-hand quantities, reorder points, and actions."
              label="Inventory overview"
              caption="Direct synthetic app capture"
            />
            <span
              className="meta-flagship__inventory-orbit"
              aria-hidden="true"
            />
          </div>
        </div>
      </section>

      <ProductWalkthrough tour="inventory" id="inventory-workflow" />

      <div className="meta-flagship__container">
        <NextFeature
          label="Scheduling"
          href="/meta-clinic/features/scheduling"
          heading="Keep the supplies and the day in view."
        />
      </div>
    </main>
  );
}

function SchedulingPage() {
  const [calendarView, setCalendarView] = useState<"day" | "month">("day");

  return (
    <main id="main" className="meta-flagship meta-flagship--scheduling">
      <section className="meta-flagship__schedule-hero-v2">
        <div className="meta-flagship__container meta-flagship__schedule-hero-layout">
          <div className="meta-flagship__schedule-hero-copy">
            <Crumb current="Scheduling" />
            <p className="meta-flagship__overline">
              Calendar software for clinics
            </p>
            <h1>One clinic day. Every kind of visit.</h1>
            <p className="meta-flagship__lead">
              See appointments by room, time, and clinician. Book the visit with
              its purpose in view, then carry it into the front-desk queue.
            </p>
            <div className="meta-flagship__hero-actions">
              <Button
                href="/demo"
                variant="contained"
                disableElevation
                endIcon={<ArrowForwardRoundedIcon />}
              >
                Try the demo
              </Button>
              <Button href="#schedule-workflow" variant="outlined">
                Explore the steps
              </Button>
            </div>
          </div>
          <div
            className="meta-flagship__schedule-hero-proof"
            id="schedule-preview"
          >
            <ToggleButtonGroup
              value={calendarView}
              exclusive
              onChange={(_, value: "day" | "month" | null) => {
                if (value) setCalendarView(value);
              }}
              aria-label="Calendar preview view"
              size="small"
              className="meta-flagship__calendar-preview-switch"
            >
              <ToggleButton value="day">Day view</ToggleButton>
              <ToggleButton value="month">Month view</ToggleButton>
            </ToggleButtonGroup>
            <Screen
              src={
                calendarView === "day"
                  ? "/marketing/captures/schedule-day-omni-morning.png"
                  : "/marketing/captures/schedule-month-omni-october.png"
              }
              alt={
                calendarView === "day"
                  ? "Actual clinic day calendar with sample visits across rooms, clinicians, and appointment times."
                  : "Actual clinic month calendar showing appointment counts and scheduled time."
              }
              label={calendarView === "day" ? "Day calendar" : "Month calendar"}
              caption="Actual app with sample appointments"
              className="meta-flagship__schedule-screen"
            />
          </div>
        </div>
      </section>
      <ProductWalkthrough tour="scheduling" id="schedule-workflow" />
      <div className="meta-flagship__container" id="schedule-telehealth">
        <NextFeature
          label="Telehealth setup"
          href="/meta-clinic/features/telehealth"
          heading="Planning video visits? Check readiness first."
        />
      </div>
    </main>
  );
}

function ClinicalNotesPage() {
  return (
    <main id="main" className="meta-flagship meta-flagship--notes">
      <section className="meta-flagship__notes-hero">
        <div className="meta-flagship__container meta-flagship__notes-layout">
          <div className="meta-flagship__notes-copy">
            <Crumb current="Clinical notes" />
            <p className="meta-flagship__overline">03 / Inside the visit</p>
            <h1>Write with the visit in view.</h1>
            <p className="meta-flagship__lead">
              The encounter workspace keeps documentation beside the visit
              context and the work that surrounds it.
            </p>
            <div className="meta-flagship__hero-actions">
              <Button
                href="/demo"
                variant="contained"
                disableElevation
                endIcon={<ArrowForwardRoundedIcon />}
              >
                Try the demo
              </Button>
              <Button href="#notes-workflow" variant="outlined">
                Explore the steps
              </Button>
            </div>
          </div>
          <Screen
            src="/marketing/captures/tutorial-note-history.png"
            alt="History of Present Illness in the Meta Clinic note workspace."
            label="Clinical documentation"
            caption="Recorded history in a signed chart"
            className="meta-flagship__notes-screen"
          />
        </div>
      </section>

      <ProductWalkthrough tour="notes" id="notes-workflow" />

      <div className="meta-flagship__container">
        <NextFeature
          label="Inventory"
          href="/meta-clinic/features/inventory"
          heading="See the operational work behind the visit."
        />
      </div>
    </main>
  );
}

export function FlagshipFeaturePage({ slug }: { slug: FlagshipSlug }) {
  if (slug === "inventory") return <InventoryPage />;
  if (slug === "scheduling") return <SchedulingPage />;
  return <ClinicalNotesPage />;
}
