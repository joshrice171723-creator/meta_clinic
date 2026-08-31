import { useState } from "react";
import { useClinic } from "./Workspace";
import {
  EXAMPLE_CLOCK,
  EXAMPLE_VISITS,
  VISIT_STAGES,
  durationLabel,
  elapsedMinutes,
  filterVisits,
  patientLabel,
  waitingMinutes,
  type BoardVisit,
} from "./trackingBoardData";

const membershipLabels = {
  member: "Member",
  nonmember: "Non-member",
  unknown: "Not verified",
};
function ExampleVisit({ visit, now }: { visit: BoardVisit; now: string }) {
  const [expanded, setExpanded] = useState(false);
  const stage = VISIT_STAGES.find((s) => s.id === visit.stage)!;
  const label = patientLabel(visit.firstName, visit.lastName);
  return (
    <li className="tracking-visit" data-stage={visit.stage}>
      <dl className="tracking-row">
        <div className="tracking-identity">
          <dt>Patient / visit</dt>
          <dd>
            <button
              type="button"
              className="tracking-patient"
              aria-expanded={expanded}
              aria-controls={expanded ? `visit-${visit.id}` : undefined}
              onClick={() => setExpanded(!expanded)}
              aria-label={`${expanded ? "Hide" : "Show"} example visit ${visit.id} for ${label}`}
            >
              {label}
              <span aria-hidden="true">{expanded ? "−" : "+"}</span>
            </button>
            <small>
              {visit.id} ·{" "}
              {visit.age === null ? "Age not recorded" : `${visit.age} yr`}
            </small>
          </dd>
        </div>
        <div>
          <dt>Stage / location</dt>
          <dd>
            <span className="tracking-stage">{stage.label}</span>
            <small>{visit.room ?? "Room unassigned"}</small>
          </dd>
        </div>
        <div>
          <dt>Visit reason</dt>
          <dd>
            {visit.reason}
            <small>{visit.visitType}</small>
          </dd>
        </div>
        <div>
          <dt>Triage</dt>
          <dd>
            {visit.triage?.summary ?? "Not recorded"}
            <small>
              {visit.triage
                ? visit.triage.vitals
                  ? "Vitals available ↓"
                  : "Vitals not recorded"
                : "Awaiting staff assessment"}
            </small>
          </dd>
        </div>
        <div>
          <dt>Membership</dt>
          <dd>
            <span
              className={`tracking-membership membership-${visit.membership}`}
            >
              {membershipLabels[visit.membership]}
            </span>
          </dd>
        </div>
        <div>
          <dt>Current wait</dt>
          <dd className="tracking-time">
            <strong>
              {stage.waiting
                ? durationLabel(waitingMinutes(visit, now))
                : "In care"}
            </strong>
            <small>
              {durationLabel(elapsedMinutes(visit.arrivedAt, now))} in clinic
            </small>
          </dd>
        </div>
        <div>
          <dt>Next action / owner</dt>
          <dd>
            {stage.action}
            <small className={!visit.owner ? "tracking-unassigned" : undefined}>
              {visit.owner ?? "Owner unassigned"}
            </small>
          </dd>
        </div>
      </dl>
      {expanded && (
        <section
          id={`visit-${visit.id}`}
          className="tracking-detail"
          aria-label={`Example details for ${label}, ${visit.id}`}
        >
          <div>
            <h2>Triage snapshot</h2>
            <p>
              {visit.triage?.vitals ?? "Vital signs have not been recorded."}
            </p>
            <p>
              {visit.triage?.review ??
                "Medication and allergy review not recorded."}
            </p>
            {visit.triage && (
              <small>
                Example entry · {visit.triage.recordedBy} ·{" "}
                {new Intl.DateTimeFormat("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  timeZone: "America/Chicago",
                }).format(new Date(visit.triage.recordedAt))}
              </small>
            )}
          </div>
          <div>
            <h2>Next handoff</h2>
            <p>
              {stage.action} · {visit.owner ?? "Assign an owner"}
            </p>
            <p>
              Example only. Opening this row does not accept a handoff, change a
              visit, sign a note or send a prescription.
            </p>
          </div>
        </section>
      )}
    </li>
  );
}
export function TrackingBoardView({
  visits = EXAMPLE_VISITS,
  now = EXAMPLE_CLOCK,
}: {
  visits?: readonly BoardVisit[];
  now?: string;
}) {
  const [stage, setStage] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("arrival");
  const filtered = filterVisits(visits, stage, query, sort, now);
  return (
    <section className="tracking-board" aria-labelledby="tracking-title">
      <div className="tracking-heading">
        <div>
          <p className="eyebrow">OVERVIEW · PATIENT FLOW</p>
          <h1 id="tracking-title">Tracking board</h1>
        </div>
        <a href="/clinic/patients" className="text-link">
          Patient directory ↗
        </a>
      </div>
      <details className="tracking-demo">
        <summary>
          <strong>Example shift · 10:20 AM · Not live</strong>
        </summary>
        <p>
          Illustrative visits, not your clinic’s current arrivals. Check-in,
          triage and membership data are not connected yet. Times are fixed for
          this preview.
        </p>
      </details>
      <div
        className="tracking-stage-filters"
        aria-label="Filter example visits by stage"
      >
        {[{ id: "all", label: "All visits" }, ...VISIT_STAGES].map((s) => (
          <button
            type="button"
            key={s.id}
            aria-pressed={stage === s.id}
            onClick={() => setStage(s.id)}
          >
            <span>{s.label}</span>
            <strong>
              {s.id === "all"
                ? visits.length
                : visits.filter((v) => v.stage === s.id).length}
            </strong>
          </button>
        ))}
      </div>
      <div className="tracking-tools">
        <div className="tracking-stage-select">
          <label htmlFor="board-stage">Visit stage</label>
          <select
            id="board-stage"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
          >
            {[{ id: "all", label: "All visits" }, ...VISIT_STAGES].map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} (
                {s.id === "all"
                  ? visits.length
                  : visits.filter((v) => v.stage === s.id).length}
                )
              </option>
            ))}
          </select>
        </div>
        <div className="tracking-search">
          <label htmlFor="board-search">Find on board</label>
          <input
            id="board-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Patient label, visit ID, room or owner"
          />
        </div>
        <div>
          <label htmlFor="board-sort">Sort visits</label>
          <select
            id="board-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="arrival">Arrival · oldest first</option>
            <option value="wait">Current wait · longest first</option>
          </select>
        </div>
        <p role="status" aria-live="polite">
          {filtered.length} of {visits.length} example visits
        </p>
      </div>
      <div className="tracking-columns" aria-hidden="true">
        {[
          "Patient / visit",
          "Stage / location",
          "Visit reason",
          "Triage",
          "Membership",
          "Current wait",
          "Next action / owner",
        ].map((text) => (
          <span key={text}>{text}</span>
        ))}
      </div>
      <ul className="tracking-list" aria-label="Example clinic visits">
        {filtered.map((visit) => (
          <ExampleVisit key={visit.id} visit={visit} now={now} />
        ))}
      </ul>
      {filtered.length === 0 && (
        <div className="tracking-empty">
          <h2>
            {visits.length
              ? "No visits match these filters"
              : "No example visits"}
          </h2>
          <p>
            {visits.length
              ? "Try another stage or clear your search."
              : "An empty example is not evidence that the clinic has no waiting patients."}
          </p>
          {visits.length > 0 && (
            <button
              className="button"
              type="button"
              onClick={() => {
                setQuery("");
                setStage("all");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}
      <p className="tracking-caption">
        Wait = time in the current waiting stage; “in clinic” = time since
        arrival. Queue order is not clinical priority. Membership does not
        change priority. Abbreviated labels can match; always confirm identity
        in the record before care.
      </p>
    </section>
  );
}
export function OverviewView({ patientAccess }: { patientAccess: boolean }) {
  if (!patientAccess)
    return (
      <section>
        <h1>Clinic overview</h1>
        <p>
          Patient tracking is available to assigned patient-workspace users.
        </p>
        <a href="/clinic/operations" className="text-link">
          Open Operations →
        </a>
      </section>
    );
  return <TrackingBoardView />;
}
export function Overview() {
  return <OverviewView patientAccess={useClinic().capabilities.patients} />;
}
