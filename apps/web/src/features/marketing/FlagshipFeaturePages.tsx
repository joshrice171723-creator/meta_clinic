import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import { Button } from "@mui/material";
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
    <a className="meta-flagship__crumb" href="/meta-clinic#tools">
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
            <Button
              className="meta-flagship__hero-link"
              href="#inventory-workflow"
              endIcon={<ArrowForwardRoundedIcon />}
            >
              See the inventory flow
            </Button>
          </div>
          <div className="meta-flagship__inventory-photo">
            <span className="meta-flagship__photo-index">THE PRODUCT / 01</span>
            <Screen
              src="/marketing/inventory-app.png"
              alt="Meta Clinic inventory workspace showing a synthetic product catalog, on-hand quantities, reorder points, and actions."
              label="Inventory overview"
              caption="Captured from the populated demo clinic"
            />
            <span
              className="meta-flagship__inventory-orbit"
              aria-hidden="true"
            />
          </div>
        </div>
      </section>

      <section
        className="meta-flagship__container meta-flagship__inventory-work"
        id="inventory-workflow"
      >
        <div className="meta-flagship__section-intro">
          <span>What the screen helps you answer</span>
          <h2>What is here, and what needs attention?</h2>
        </div>
        <div className="meta-flagship__inventory-cards">
          <article>
            <strong>01</strong>
            <h3>Stock you can read at a glance</h3>
            <p>
              The catalog puts available and on-hand quantities beside each
              item&apos;s reorder point, so a stock question starts with a clear
              record.
            </p>
          </article>
          <article>
            <strong>02</strong>
            <h3>A visible route to replenishment</h3>
            <p>
              Items needing attention show their status alongside actions for
              lots, purchase orders, and replenishment work.
            </p>
          </article>
        </div>
      </section>

      <section className="meta-flagship__inventory-people">
        <div className="meta-flagship__container">
          <div className="meta-flagship__inventory-people-heading">
            <p className="meta-flagship__overline">
              The team behind the stockroom
            </p>
            <h2>Make supply decisions together.</h2>
            <p>
              From checking what is on the shelf to deciding what to order next,
              give the clinical and operations teams a shared starting point.
            </p>
          </div>
          <div className="meta-flagship__inventory-people-grid">
            <figure>
              <img
                src="/marketing/inventory-supplies.png"
                alt="Clinic teammates checking organized medical supplies together in a bright stockroom."
                loading="lazy"
              />
              <figcaption>
                Check the shelf before the next clinic day.
              </figcaption>
            </figure>
            <figure>
              <img
                src="/marketing/inventory-review.png"
                alt="A nurse and operations lead reviewing supply needs at a clinic workroom desk."
                loading="lazy"
              />
              <figcaption>
                Turn a stock question into a replenishment plan.
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

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
              Bring in-person appointments, rooms, and virtual visits into a
              schedule your team can read at a glance.
            </p>
            <div className="meta-flagship__schedule-actions">
              <a
                className="meta-flagship__schedule-primary"
                href="#schedule-preview"
              >
                Explore the calendar{" "}
                <ArrowForwardRoundedIcon aria-hidden="true" />
              </a>
              <a
                className="meta-flagship__schedule-text-link"
                href="#schedule-telehealth"
              >
                See virtual visits
              </a>
            </div>
            <p className="meta-flagship__schedule-hero-footnote">
              Built for the people who keep a clinic day moving.
            </p>
          </div>
          <figure className="meta-flagship__schedule-hero-photo">
            <img
              src="/marketing/scheduling-team.png"
              alt="Illustration of two clinic staff members reviewing a scheduling app together at a front desk."
              loading="eager"
            />
            <figcaption>Front desk, in sync.</figcaption>
          </figure>
        </div>
      </section>

      <section
        className="meta-flagship__schedule-product"
        id="schedule-preview"
      >
        <div className="meta-flagship__container">
          <div className="meta-flagship__schedule-product-heading">
            <div>
              <p className="meta-flagship__overline">
                See the work, not just the time
              </p>
              <h2>A calendar with the whole clinic in view.</h2>
            </div>
            <p>
              See how appointments occupy a room and a time. Virtual visits have
              their own place beside on-site care.
            </p>
          </div>
          <div
            className="meta-flagship__calendar-switch"
            role="group"
            aria-label="Calendar preview view"
          >
            <button
              type="button"
              aria-pressed={calendarView === "day"}
              onClick={() => setCalendarView("day")}
            >
              Day view
            </button>
            <button
              type="button"
              aria-pressed={calendarView === "month"}
              onClick={() => setCalendarView("month")}
            >
              Month view
            </button>
          </div>
          {calendarView === "day" ? (
            <Screen
              src="/marketing/scheduling-showcase-telehealth.png"
              alt="Illustrative Meta Clinic day calendar with fictional appointments of different lengths across clinic and telehealth rooms, including video room actions."
              label="Day view · room and telehealth calendar"
              caption="Illustrative preview with fictional appointments"
              className="meta-flagship__schedule-screen"
            />
          ) : (
            <Screen
              src="/marketing/scheduling-month.png"
              alt="Illustrative September 2026 month calendar with fictional clinic and telehealth appointments."
              label="Month view · clinic calendar"
              caption="Illustrative preview with fictional appointments"
              className="meta-flagship__schedule-screen"
            />
          )}
          <div className="meta-flagship__schedule-product-points">
            <span>Room-based planning</span>
            <span>Different visit lengths</span>
            <span>Virtual visit entry</span>
          </div>
        </div>
      </section>

      <section className="meta-flagship__schedule-perspective">
        <div className="meta-flagship__container meta-flagship__schedule-perspective-layout">
          <div className="meta-flagship__schedule-perspective-copy">
            <p className="meta-flagship__overline">Two ways to see the day</p>
            <h2>Zoom out without losing the details.</h2>
            <p>
              Use the month view to scan what is coming, then return to the day
              view to see room assignments, visit lengths, and virtual
              appointments.
            </p>
            <button
              type="button"
              onClick={() => {
                setCalendarView("month");
                document
                  .getElementById("schedule-preview")
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Show month view <ArrowForwardRoundedIcon aria-hidden="true" />
            </button>
          </div>
          <figure>
            <img
              src="/marketing/scheduling-front-desk.png"
              alt="Illustration of a front desk coordinator working with a clinic calendar in a bright reception area."
              loading="lazy"
            />
            <figcaption>
              A clear view for the people at the front desk.
            </figcaption>
          </figure>
        </div>
      </section>

      <section
        className="meta-flagship__schedule-booking"
        id="schedule-booking"
      >
        <div className="meta-flagship__container">
          <div className="meta-flagship__schedule-booking-heading">
            <p className="meta-flagship__overline">
              From an open time to a booked visit
            </p>
            <h2>Schedule the visit in context.</h2>
            <p>
              The synthetic appointment form shows the patient, time, room,
              clinician, visit type, and visit reason together.
            </p>
          </div>
          <div className="meta-flagship__schedule-booking-layout">
            <Screen
              src="/marketing/captures/schedule-booking-omni-adapted.png"
              alt="Meta Clinic synthetic appointment form with patient, time, room, clinician, visit type, and visit reason."
              label="Schedule an appointment"
              caption="Real app view with synthetic appointment details"
              className="meta-flagship__schedule-screen"
            />
            <figure>
              <img
                src="/marketing/scheduling-planning-team.png"
                alt="Illustration of a clinician and coordinator reviewing the clinic calendar together at a desk."
                loading="lazy"
              />
              <figcaption>Planning together, in the same workspace.</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section
        className="meta-flagship__schedule-telehealth"
        id="schedule-telehealth"
      >
        <div className="meta-flagship__container meta-flagship__schedule-telehealth-layout">
          <figure>
            <img
              src="/marketing/scheduling-telehealth.png"
              alt="Illustration of a clinician and team member at a clinic desk preparing a virtual appointment using scheduling software."
              loading="lazy"
            />
            <figcaption>Care can begin from the same schedule.</figcaption>
          </figure>
          <div className="meta-flagship__schedule-telehealth-copy">
            <p className="meta-flagship__overline">
              For visits beyond the room
            </p>
            <h2>Make space for virtual care.</h2>
            <p>
              A video visit belongs in the day&apos;s plan alongside the rooms
              and people needed for on-site care. Keep its time visible and its
              entry point close to the appointment.
            </p>
            <div className="meta-flagship__schedule-telehealth-detail">
              <VideocamOutlinedIcon aria-hidden="true" />
              <div>
                <strong>Telehealth room on the calendar</strong>
                <small>
                  See the video visit in context with the rest of the day.
                </small>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="meta-flagship__schedule-flow" id="schedule-workflow">
        <div className="meta-flagship__container">
          <div className="meta-flagship__schedule-flow-heading">
            <p className="meta-flagship__overline">From booking to visit</p>
            <h2>Help every handoff feel closer.</h2>
          </div>
          <div className="meta-flagship__schedule-flow-cards">
            <article>
              <span>01</span>
              <h3>Plan around the day</h3>
              <p>
                Move between calendar views and locations to find the
                appointment in the right context.
              </p>
            </article>
            <article>
              <span>02</span>
              <h3>Book from the schedule</h3>
              <p>
                Start a new appointment while keeping the clinic schedule in
                view.
              </p>
            </article>
            <article>
              <span>03</span>
              <h3>Carry the visit forward</h3>
              <p>
                Move from the schedule to the tracking board as arrival and
                encounter work begins.
              </p>
            </article>
          </div>
        </div>
      </section>
      <div className="meta-flagship__container">
        <NextFeature
          label="Clinical notes"
          href="/meta-clinic/features/clinical-notes"
          heading="When the appointment becomes a visit."
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
            <a className="meta-flagship__notes-link" href="#notes-workflow">
              See how documentation fits{" "}
              <ArrowForwardRoundedIcon aria-hidden="true" />
            </a>
          </div>
          <Screen
            src="/marketing/clinical-notes-concept.png"
            alt="Illustrative Meta Clinic clinical notes workspace for a fictional encounter, with structured note sections and a save draft action."
            label="Encounter workspace"
            caption="Illustrative concept with fictional details"
            className="meta-flagship__notes-screen"
          />
        </div>
      </section>

      <section
        className="meta-flagship__container meta-flagship__notes-work"
        id="notes-workflow"
      >
        <div className="meta-flagship__notes-statement">
          <span>Documentation in context</span>
          <h2>A note belongs to a visit, not a loose document.</h2>
        </div>
        <div className="meta-flagship__notes-details">
          <article>
            <span>01 / The right encounter</span>
            <h3>Start from the visit</h3>
            <p>
              Open documentation inside the patient encounter, with its
              surrounding sections and next steps visible.
            </p>
          </article>
          <article>
            <span>02 / A deliberate handoff</span>
            <h3>See what is still in progress</h3>
            <p>
              Keep draft work and review state explicit so the care team can
              tell what is ready and what still needs attention.
            </p>
          </article>
        </div>
      </section>
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
