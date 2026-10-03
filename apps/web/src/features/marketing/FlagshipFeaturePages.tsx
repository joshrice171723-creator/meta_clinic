import { ProductWalkthrough } from "./ProductWalkthrough";
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
              alt="Two clinic staff members reviewing a scheduling app together at a front desk."
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
              See how appointments occupy a room and a time. Scan visit types
              and providers before opening the detail.
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
            <div className="meta-flagship__schedule-day-gallery">
              <Screen
                src="/marketing/captures/schedule-day-omni-morning.png"
                alt="Actual Meta Clinic day schedule showing three fictional morning visits across rooms, providers, and appointment times."
                label="Day view · morning"
                caption="Adapted direct app capture"
                className="meta-flagship__schedule-screen"
              />
              <Screen
                src="/marketing/captures/schedule-day-omni-afternoon.png"
                alt="Actual Meta Clinic day schedule showing four fictional afternoon visits with different appointment lengths."
                label="Day view · afternoon"
                caption="Adapted direct app capture"
                className="meta-flagship__schedule-screen"
              />
            </div>
          ) : (
            <Screen
              src="/marketing/captures/schedule-month-omni-october.png"
              alt="Meta Clinic October month calendar showing synthetic scheduled appointments across weekdays."
              label="Month view · clinic calendar"
              caption="Direct synthetic app capture"
              className="meta-flagship__schedule-screen"
            />
          )}
          <div className="meta-flagship__schedule-product-points">
            <span>Room-based planning</span>
            <span>Different visit lengths</span>
            <span>Provider visibility</span>
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
              view to see room assignments, visit lengths, and visit types.
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
              alt="A front desk coordinator working with a clinic calendar in a bright reception area."
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
                src="/marketing/scheduling-team.png"
                alt="A clinician and coordinator reviewing the clinic calendar together at a desk."
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
              alt="A clinician and team member at a clinic desk preparing a virtual appointment using scheduling software."
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

      <ProductWalkthrough tour="scheduling" id="schedule-workflow" />
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
            src="/marketing/captures/patient-directory-21-natural-records.png"
            alt="Meta Clinic patient directory with sample records."
            label="Patient workspace"
            caption="Patient directory"
            className="meta-flagship__notes-screen"
          />
        </div>
      </section>

      <ProductWalkthrough tour="visits" context="These screens show the patient and visit context around documentation. Explore the demo to see the encounter and note editor itself." />

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
