import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { Button } from "@mui/material";
import "./clinicTypePages.css";

export type ClinicTypeSlug =
  | "primary-care"
  | "membership-care"
  | "urgent-care"
  | "weight-management"
  | "infusion";

export function isClinicTypeSlug(value: string): value is ClinicTypeSlug {
  return (
    value === "primary-care" ||
    value === "membership-care" ||
    value === "urgent-care" ||
    value === "weight-management" ||
    value === "infusion"
  );
}

function ProductImage({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption: string;
}) {
  return (
    <figure className="meta-type__product">
      <img src={src} alt={alt} loading="lazy" />
      <figcaption>
        <span>{caption}</span>
        <a href={src} target="_blank" rel="noreferrer">
          Open full-size image
        </a>
      </figcaption>
    </figure>
  );
}

function PrimaryCarePage() {
  return (
    <main id="main" className="meta-type meta-type--primary">
      <section className="meta-type__primary-hero meta-type__wrap">
        <div className="meta-type__primary-intro">
          <a className="meta-type__crumb" href="/meta-clinic#clinic-types">
            Clinic types / Primary care
          </a>
          <p className="meta-type__eyebrow">For independent primary care</p>
          <h1>Know the person. Keep the day moving.</h1>
          <p>
            Primary care brings new concerns, ongoing relationships, and
            follow-up into the same day. Meta Clinic keeps patient context,
            visits, and the work around them close together.
          </p>
          <Button
            href="#primary-workflow"
            variant="contained"
            endIcon={<ArrowForwardRoundedIcon />}
          >
            See the clinic flow
          </Button>
        </div>
        <figure className="meta-type__primary-photo">
          <img
            src="/marketing/primary-care-visit.png"
            alt="Fictional primary care clinician speaking with an adult patient in a bright exam room."
          />
          <figcaption>Space for the conversation that matters.</figcaption>
        </figure>
      </section>

      <section
        id="primary-workflow"
        className="meta-type__primary-steps meta-type__wrap"
      >
        <div className="meta-type__section-heading">
          <p className="meta-type__eyebrow">One day, connected</p>
          <h2>From the first visit to the next question.</h2>
        </div>
        <div className="meta-type__steps">
          <article>
            <span>01</span>
            <h3>Welcome with context</h3>
            <p>
              Find the patient record and the scheduled visit without rebuilding
              the story at the front desk.
            </p>
          </article>
          <article>
            <span>02</span>
            <h3>Carry the visit forward</h3>
            <p>
              Keep room, team, visit reason, and recorded work visible as the
              patient moves through care.
            </p>
          </article>
          <article>
            <span>03</span>
            <h3>Make follow-up findable</h3>
            <p>
              Connect the next appointment and financial record to the work that
              happened today.
            </p>
          </article>
        </div>
      </section>

      <section className="meta-type__primary-proof meta-type__wrap">
        <div className="meta-type__primary-proof-copy">
          <p className="meta-type__eyebrow">Inside Meta Clinic</p>
          <h2>A patient list the team can work from.</h2>
          <p>
            Search and open patient records from the clinic workspace. This view
            shows the populated patient directory in the default app theme.
          </p>
          <a href="/meta-clinic/features/tracking-board">
            Explore the Tracking Board{" "}
            <ArrowForwardRoundedIcon aria-hidden="true" />
          </a>
        </div>
        <ProductImage
          src="/marketing/primary-care-patients-app.png"
          alt="Actual Meta Clinic patient directory in the demo sandbox with eight fictional patient records and open-record actions."
          caption="Patient directory · captured from the populated demo clinic"
        />
      </section>

      <section className="meta-type__primary-close">
        <div className="meta-type__wrap meta-type__primary-close-grid">
          <figure>
            <img
              src="/marketing/primary-care-front-desk.png"
              alt="Fictional primary care coordinator welcoming an adult patient at reception."
            />
          </figure>
          <div>
            <p className="meta-type__eyebrow">Built around the relationship</p>
            <h2>A calmer handoff starts at the front desk.</h2>
            <p>
              Explore the parts of the workspace that support a connected
              primary care day.
            </p>
            <div className="meta-type__links">
              <a href="/meta-clinic/features/scheduling">
                Scheduling <ArrowForwardRoundedIcon aria-hidden="true" />
              </a>
              <a href="/meta-clinic/features/clinical-notes">
                Clinical Notes <ArrowForwardRoundedIcon aria-hidden="true" />
              </a>
              <a href="/meta-clinic/features/invoices">
                Invoices <ArrowForwardRoundedIcon aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function InfusionPage() {
  return (
    <main id="main" className="meta-type meta-type--infusion">
      <section className="meta-type__infusion-hero">
        <div className="meta-type__wrap meta-type__infusion-hero-grid">
          <div>
            <a className="meta-type__crumb" href="/meta-clinic#clinic-types">
              Clinic types / Infusion
            </a>
            <p className="meta-type__eyebrow">For outpatient infusion teams</p>
            <h1>Give every treatment day room to breathe.</h1>
            <p>
              Appointments, supplies, and follow-through all shape the patient
              experience. Meta Clinic brings the shared clinic work into view
              while your team cares for the person in the chair.
            </p>
            <Button
              href="#infusion-foundation"
              variant="contained"
              endIcon={<ArrowForwardRoundedIcon />}
            >
              Explore the foundation
            </Button>
          </div>
          <figure>
            <img
              src="/marketing/infusion-care.png"
              alt="Fictional nurse checking in with an adult patient in a calm outpatient infusion suite."
            />
            <figcaption>
              The setting is specific. The care is personal.
            </figcaption>
          </figure>
        </div>
      </section>

      <section
        id="infusion-foundation"
        className="meta-type__infusion-foundation meta-type__wrap"
      >
        <div className="meta-type__section-heading">
          <p className="meta-type__eyebrow">The shared clinic work</p>
          <h2>Keep the operational pieces in reach.</h2>
          <p>
            Meta Clinic already has tools for scheduling, inventory, and
            billing. The product image below is the real inventory catalog,
            shown with populated demo supplies.
          </p>
        </div>
        <div className="meta-type__infusion-proof">
          <ProductImage
            src="/marketing/inventory-app.png"
            alt="Actual Meta Clinic inventory catalog with five fictional clinical supply products, quantities, reorder points, and lot actions."
            caption="Inventory catalog · captured from the populated demo clinic"
          />
          <div className="meta-type__infusion-points">
            <article>
              <span>01 / Plan</span>
              <h3>Put visits on the clinic calendar.</h3>
              <p>Use the shared schedule for appointments and room context.</p>
            </article>
            <article>
              <span>02 / Prepare</span>
              <h3>Know what is on hand.</h3>
              <p>
                Review supply quantities, reorder points, and lot actions in
                inventory.
              </p>
            </article>
            <article>
              <span>03 / Follow through</span>
              <h3>Keep the financial record legible.</h3>
              <p>
                Move from a visit to its invoice and recorded payment state.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="meta-type__infusion-close">
        <div className="meta-type__wrap meta-type__infusion-close-grid">
          <div>
            <p className="meta-type__eyebrow">Shape the next layer</p>
            <h2>Build around how your infusion clinic actually works.</h2>
            <p>
              Infusion-specific chair utilization and administration
              documentation are not shown as working features here. The current
              scheduling and inventory tools are a starting point for those
              conversations.
            </p>
            <div className="meta-type__links">
              <a href="/meta-clinic/features/scheduling">
                Scheduling <ArrowForwardRoundedIcon aria-hidden="true" />
              </a>
              <a href="/meta-clinic/features/inventory">
                Inventory <ArrowForwardRoundedIcon aria-hidden="true" />
              </a>
              <a href="/meta-clinic/features/invoices">
                Invoices <ArrowForwardRoundedIcon aria-hidden="true" />
              </a>
            </div>
          </div>
          <figure>
            <img
              src="/marketing/infusion-team.png"
              alt="Two fictional infusion clinic nurses coordinating their day beside a treatment area."
            />
          </figure>
        </div>
      </section>
    </main>
  );
}

function UrgentCarePage() {
  return (
    <main id="main" className="meta-type meta-type--urgent">
      <section className="meta-type__urgent-hero">
        <div className="meta-type__wrap meta-type__urgent-hero-grid">
          <div>
            <a className="meta-type__crumb" href="/meta-clinic#clinic-types">
              Clinic types / Urgent care
            </a>
            <p className="meta-type__eyebrow">
              For fast-moving outpatient teams
            </p>
            <h1>Make the next patient visible.</h1>
            <p>
              A walk-in day changes by the minute. Keep arrival, room, care
              stage, and provider assignment together so the team can see what
              needs to happen next.
            </p>
            <Button
              href="#urgent-board"
              variant="contained"
              endIcon={<ArrowForwardRoundedIcon />}
            >
              See the patient flow
            </Button>
          </div>
          <figure>
            <img
              src="/marketing/urgent-care-visit.png"
              alt="Fictional urgent care clinician speaking with a patient in a bright exam room."
            />
            <figcaption>Care starts with a clear handoff.</figcaption>
          </figure>
        </div>
      </section>

      <section
        id="urgent-board"
        className="meta-type__urgent-board meta-type__wrap"
      >
        <div className="meta-type__urgent-board-heading">
          <p className="meta-type__eyebrow">Inside Meta Clinic</p>
          <h2>Know where the clinic day stands.</h2>
          <p>
            The real Tracking Board below shows a populated synthetic clinic
            day, with visits at different stages, room assignments, providers,
            care tasks, and timing in one view.
          </p>
        </div>
        <ProductImage
          src="/marketing/tracking-board-app.png"
          alt="Actual Meta Clinic Tracking Board with fictional patients across multiple visit stages, room assignments, vitals, care tasks, providers, and timing."
          caption="Tracking Board · captured from a populated demo clinic"
        />
        <div className="meta-type__urgent-moves">
          <article>
            <span>01 / Arrive</span>
            <h3>See the visit enter the day.</h3>
            <p>
              Review the patient, room, and visit reason as the team receives
              them.
            </p>
          </article>
          <article>
            <span>02 / Move</span>
            <h3>Follow the care stage.</h3>
            <p>
              Keep intake, ready, and assigned work visible during a busy shift.
            </p>
          </article>
          <article>
            <span>03 / Finish</span>
            <h3>Carry the next step forward.</h3>
            <p>
              Connect the operational handoff to follow-up and checkout work.
            </p>
          </article>
        </div>
      </section>

      <section className="meta-type__urgent-close">
        <div className="meta-type__wrap meta-type__urgent-close-grid">
          <figure>
            <img
              src="/marketing/urgent-care-handoff.png"
              alt="Fictional urgent care team coordinating at a front desk with patients seated nearby."
              loading="lazy"
            />
          </figure>
          <div>
            <p className="meta-type__eyebrow">
              A handoff the whole team can read
            </p>
            <h2>Stay aligned when the pace changes.</h2>
            <p>
              Pair the board with scheduling and patient records to give each
              role the context it needs for the next visit.
            </p>
            <div className="meta-type__links">
              <a href="/meta-clinic/features/tracking-board">
                Tracking Board <ArrowForwardRoundedIcon aria-hidden="true" />
              </a>
              <a href="/meta-clinic/features/scheduling">
                Scheduling <ArrowForwardRoundedIcon aria-hidden="true" />
              </a>
              <a href="/meta-clinic/features/intake-forms">
                Intake &amp; Forms{" "}
                <ArrowForwardRoundedIcon aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function MembershipCarePage() {
  return (
    <main id="main" className="meta-type meta-type--membership">
      <section className="meta-type__membership-hero">
        <div className="meta-type__wrap meta-type__membership-hero-grid">
          <div>
            <a className="meta-type__crumb" href="/meta-clinic#clinic-types">
              Clinic types / Membership care
            </a>
            <p className="meta-type__eyebrow">
              For clinics built around continuity
            </p>
            <h1>Give ongoing care a clear shape.</h1>
            <p>
              Every clinic has its own way of staying close to patients between
              visits. Build a program that explains the services, rhythm, and
              terms behind that relationship.
            </p>
            <Button
              href="#membership-program"
              variant="contained"
              endIcon={<ArrowForwardRoundedIcon />}
            >
              See the program workspace
            </Button>
          </div>
          <figure>
            <img
              src="/marketing/memberships-team.png"
              alt="Fictional clinician and care coordinator planning an ongoing-care program together at a laptop."
            />
            <figcaption>
              Start with the care model your team believes in.
            </figcaption>
          </figure>
        </div>
      </section>

      <section
        id="membership-program"
        className="meta-type__membership-program meta-type__wrap"
      >
        <div className="meta-type__section-heading">
          <p className="meta-type__eyebrow">Inside Meta Clinic</p>
          <h2>Programs, services, and tiers in one place.</h2>
          <p>
            The actual Meta Clinic catalog below shows several synthetic
            programs with their own descriptions. Build reusable services,
            assemble tiers, then preview and publish the terms patients can see.
          </p>
        </div>
        <ProductImage
          src="/marketing/memberships-app.png"
          alt="Actual Meta Clinic membership catalog showing five fictional published programs, six reusable services, and four tiers."
          caption="Membership catalog · captured from the populated demo clinic"
        />
        <div className="meta-type__membership-details">
          <article>
            <span>01</span>
            <h3>Describe the promise.</h3>
            <p>
              Name the program and explain which kind of ongoing care it
              supports.
            </p>
          </article>
          <article>
            <span>02</span>
            <h3>Build the tier.</h3>
            <p>
              Reuse services and set clear terms before a patient sees the
              offer.
            </p>
          </article>
          <article>
            <span>03</span>
            <h3>Publish deliberately.</h3>
            <p>
              Preview the patient card and keep the published version tied to
              its terms.
            </p>
          </article>
        </div>
      </section>

      <section className="meta-type__membership-close">
        <div className="meta-type__wrap meta-type__membership-close-grid">
          <figure>
            <img
              src="/marketing/memberships-front-desk.png"
              alt="Fictional clinic coordinator discussing program options with a patient at reception."
            />
          </figure>
          <div>
            <p className="meta-type__eyebrow">
              A conversation patients can follow
            </p>
            <h2>Make the offer understandable at every handoff.</h2>
            <p>
              Connect the program conversation to scheduling and the clinic's
              financial record, with clear next steps for the team.
            </p>
            <div className="meta-type__links">
              <a href="/meta-clinic/features/memberships-packages">
                Explore Memberships{" "}
                <ArrowForwardRoundedIcon aria-hidden="true" />
              </a>
              <a href="/meta-clinic/features/scheduling">
                Explore Scheduling{" "}
                <ArrowForwardRoundedIcon aria-hidden="true" />
              </a>
              <a href="/meta-clinic/features/invoices">
                Explore Invoices <ArrowForwardRoundedIcon aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function WeightManagementPage() {
  return (
    <main id="main" className="meta-type meta-type--weight">
      <section className="meta-type__weight-hero">
        <div className="meta-type__wrap meta-type__weight-hero-grid">
          <div>
            <a className="meta-type__crumb" href="/meta-clinic#clinic-types">
              Clinic types / Weight management
            </a>
            <p className="meta-type__eyebrow">
              For ongoing metabolic health care
            </p>
            <h1>Make room for steady progress.</h1>
            <p>
              Weight management is a continuing conversation. Give the program
              structure, schedule the next visit, and keep the patient&apos;s
              goals central to each follow-up.
            </p>
            <Button
              href="#weight-program"
              variant="contained"
              endIcon={<ArrowForwardRoundedIcon />}
            >
              See the program view
            </Button>
          </div>
          <figure>
            <img
              src="/marketing/weight-management-visit.png"
              alt="Fictional clinician and adult patient discussing a personal care plan in a bright consultation room."
            />
            <figcaption>
              Start with the person, then plan the next step.
            </figcaption>
          </figure>
        </div>
      </section>

      <section
        id="weight-program"
        className="meta-type__weight-program meta-type__wrap"
      >
        <div className="meta-type__weight-program-intro">
          <div>
            <p className="meta-type__eyebrow">Inside Meta Clinic</p>
            <h2>Put the program behind the promise.</h2>
          </div>
          <p>
            The real membership catalog below includes a Metabolic Health
            program for measurement review, coaching visits, and follow-through.
            The screenshot shows the clinic&apos;s program setup, not a patient
            outcome or a dedicated weight chart.
          </p>
        </div>
        <ProductImage
          src="/marketing/memberships-app.png"
          alt="Actual Meta Clinic membership catalog from a demo clinic, including a Metabolic Health program with measurement review and coaching visits."
          caption="Program catalog · captured from the populated demo clinic"
        />
        <div className="meta-type__weight-steps">
          <article>
            <span>01</span>
            <h3>Explain the program.</h3>
            <p>Describe the services and cadence the clinic actually offers.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Keep visits connected.</h3>
            <p>
              Use scheduling for follow-ups and the shared workspace for care
              work.
            </p>
          </article>
          <article>
            <span>03</span>
            <h3>Review the next step.</h3>
            <p>
              Make room for patient goals and the next conversation over time.
            </p>
          </article>
        </div>
      </section>

      <section className="meta-type__weight-close">
        <div className="meta-type__wrap meta-type__weight-close-grid">
          <div>
            <p className="meta-type__eyebrow">A care model with continuity</p>
            <h2>Let the team work from the same plan.</h2>
            <p>
              Pair a clear program with consistent visit scheduling and a
              financial record patients can understand.
            </p>
            <div className="meta-type__links">
              <a href="/meta-clinic/features/memberships-packages">
                Memberships &amp; Packages{" "}
                <ArrowForwardRoundedIcon aria-hidden="true" />
              </a>
              <a href="/meta-clinic/features/scheduling">
                Scheduling <ArrowForwardRoundedIcon aria-hidden="true" />
              </a>
            </div>
          </div>
          <figure>
            <img
              src="/marketing/weight-management-team.png"
              alt="Fictional clinician and health coach planning an ongoing-care program together."
              loading="lazy"
            />
          </figure>
        </div>
      </section>
    </main>
  );
}

export function ClinicTypePage({ slug }: { slug: ClinicTypeSlug }) {
  if (slug === "primary-care") return <PrimaryCarePage />;
  if (slug === "membership-care") return <MembershipCarePage />;
  if (slug === "urgent-care") return <UrgentCarePage />;
  if (slug === "weight-management") return <WeightManagementPage />;
  return <InfusionPage />;
}
