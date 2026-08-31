import type {
  Appointment,
  ClinicWorkspaceContext,
  Encounter,
  EncounterDetail,
  Observation,
  Pagination,
  Patient,
} from "../../api/contracts";
import {
  Card,
  ErrorMessage,
  LoadState,
  Pager,
  useResource,
} from "../../shared/ui";
import { useClinic } from "./Workspace";

function currentPage() {
  if (typeof window === "undefined") return 1;
  const page = Number(new URLSearchParams(window.location.search).get("page"));
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function clinicDateTime(value: string | null, timezone: string) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return "Not recorded";
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(date);
  } catch {
    return "Not recorded";
  }
}

function siteLabel(context: ClinicWorkspaceContext, siteId: number | null) {
  if (siteId === null) return "Site not assigned";
  return (
    context.sites.find((site) => site.id === siteId)?.code ?? "Assigned site"
  );
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

export function ScheduleView({
  context,
  appointments,
  pagination,
}: {
  context: ClinicWorkspaceContext;
  appointments: Appointment[];
  pagination: Pagination;
}) {
  return (
    <>
      <div className="care-heading">
        <div>
          <p className="eyebrow">PATIENT FLOW · SCHEDULED</p>
          <h1>Schedule</h1>
        </div>
        <a className="text-link" href="/clinic">
          Tracking-board example ↗
        </a>
      </div>
      <p className="clinic-lead care-boundary">
        Read-only scheduled visits from the clinic API. A scheduled time is not
        an arrival or a place in the tracking-board queue.
      </p>
      <Card title="Scheduled visits">
        {appointments.length === 0 ? (
          <div className="care-empty">
            <strong>No scheduled visits were returned.</strong>
            <span>
              This is not evidence that the clinic has no active visits.
            </span>
          </div>
        ) : (
          <div className="clinic-table-wrap">
            <table className="care-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Patient</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Record</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((appointment) => (
                  <tr key={appointment.id}>
                    <td>
                      <strong>
                        {clinicDateTime(
                          appointment.starts_at,
                          context.practice.timezone,
                        )}
                      </strong>
                      <small>
                        Ends{" "}
                        {clinicDateTime(
                          appointment.ends_at,
                          context.practice.timezone,
                        )}
                      </small>
                    </td>
                    <td>
                      <a href={`/clinic/patients/${appointment.patient_id}`}>
                        Patient record #{appointment.patient_id}
                      </a>
                    </td>
                    <td>
                      {siteLabel(context, appointment.site_id)}
                      <small>
                        {appointment.room_id === null
                          ? "Room not assigned"
                          : `Room record #${appointment.room_id}`}
                      </small>
                    </td>
                    <td>
                      <span className="care-status">
                        {statusLabel(appointment.status)}
                      </span>
                    </td>
                    <td>
                      {appointment.encounter_id === null ? (
                        <span className="care-muted">No encounter yet</span>
                      ) : (
                        <a
                          href={`/clinic/patients/${appointment.patient_id}/encounters/${appointment.encounter_id}`}
                        >
                          Open encounter →
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager
          page={pagination.page}
          total={pagination.total}
          size={pagination.per_page}
          path="/clinic/schedule"
        />
      </Card>
    </>
  );
}

export function Schedule() {
  const context = useClinic();
  const page = currentPage();
  const { data, error } = useResource<{
    appointments: Appointment[];
    pagination: Pagination;
  }>(`/api/clinic/appointments?page=${page}`);
  if (!data) return <LoadState error={error} />;
  return <ScheduleView context={context} {...data} />;
}

function EncounterHistory({ patientId }: { patientId: number }) {
  const timezone = useClinic().practice.timezone;
  const { data, error } = useResource<{
    encounters: Encounter[];
    pagination: Pagination;
  }>(`/api/clinic/patients/${patientId}/encounters`);
  if (!data) return <LoadState error={error} />;
  return (
    <Card title="Encounter history">
      {data.encounters.length === 0 ? (
        <p>No encounters are recorded for this synthetic patient.</p>
      ) : (
        <ul className="care-record-list">
          {data.encounters.map((encounter) => (
            <li key={encounter.id}>
              <div>
                <strong>Encounter #{encounter.id}</strong>
                <span>{clinicDateTime(encounter.started_at, timezone)}</span>
              </div>
              <span className="care-status">
                {statusLabel(encounter.status)}
              </span>
              <a
                href={`/clinic/patients/${patientId}/encounters/${encounter.id}`}
              >
                Open →
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function PatientSupport({ patientId }: { patientId: number }) {
  return <EncounterHistory patientId={patientId} />;
}

function observationValue(observation: Observation) {
  switch (observation.value_kind) {
    case "numeric":
      return [observation.numeric_value, observation.unit_code]
        .filter(Boolean)
        .join(" ");
    case "text":
      return observation.text_value || "Not recorded";
    case "coded":
      return observation.coded_value || "Not recorded";
    case "missing":
      return observation.missing_reason
        ? `Missing: ${observation.missing_reason}`
        : "Missing value";
    case "group":
      return "Grouped observation";
  }
}

export function EncounterView({
  patient,
  encounter,
  observations,
  timezone,
}: {
  patient: Patient;
  encounter: EncounterDetail;
  observations: Observation[];
  timezone: string;
}) {
  return (
    <>
      <a href={`/clinic/patients/${patient.id}`}>← {patient.display_name}</a>
      <div className="care-heading">
        <div>
          <p className="eyebrow">ENCOUNTER #{encounter.id}</p>
          <h1>{patient.display_name}</h1>
          <p className="clinic-lead">
            Fictional reference: {patient.reference}
          </p>
        </div>
        <span className="care-status care-status-large">
          {statusLabel(encounter.status)}
        </span>
      </div>
      <p className="care-boundary">
        This is the encounter’s open/completed API status—not an intake, handoff
        or tracking-board stage.
      </p>
      <div className="care-summary">
        <div>
          <span>Started</span>
          <strong>{clinicDateTime(encounter.started_at, timezone)}</strong>
        </div>
        <div>
          <span>Ended</span>
          <strong>{clinicDateTime(encounter.ended_at, timezone)}</strong>
        </div>
        <div>
          <span>Participants</span>
          <strong>{encounter.participants.length}</strong>
        </div>
        <div>
          <span>Documents</span>
          <strong>{encounter.document_count}</strong>
        </div>
      </div>
      <div className="care-grid">
        <Card title="Recorded observations">
          {observations.length === 0 ? (
            <p>No observations are associated with this encounter.</p>
          ) : (
            <dl className="care-observations">
              {observations.map((observation) => (
                <div key={observation.id}>
                  <dt>{observation.code}</dt>
                  <dd>
                    <strong>{observationValue(observation)}</strong>
                    <span>
                      {clinicDateTime(observation.observed_at, timezone)} ·{" "}
                      {observation.code_system}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <p className="clinic-fine-print">
            Values are displayed as recorded. This interface does not infer
            normal ranges, readiness or clinical priority.
          </p>
        </Card>
        <Card title="Clinical note">
          <p>
            {encounter.note_ids.length === 0
              ? "No encounter-note metadata is recorded."
              : `${encounter.note_ids.length} encounter-note record${encounter.note_ids.length === 1 ? " is" : "s are"} present.`}
          </p>
          <div className="care-blocked">
            <strong>Editor and signing unavailable</strong>
            <span>
              The current read contract does not return the protected note body
              required for exact-revision review.
            </span>
          </div>
          <p className="clinic-fine-print">
            Prescriptions are a separate unsupported workflow; closing or
            signing a note must never imply transmission.
          </p>
        </Card>
      </div>
    </>
  );
}

export function EncounterPage({
  patientId,
  encounterId,
}: {
  patientId: string;
  encounterId: string;
}) {
  const context = useClinic();
  const patient = useResource<{ patient: Patient }>(
    `/api/clinic/patients/${patientId}`,
  );
  const encounter = useResource<{ encounter: EncounterDetail }>(
    `/api/clinic/encounters/${encounterId}`,
  );
  const observations = useResource<{
    observations: Observation[];
    pagination: Pagination;
  }>(
    `/api/clinic/patients/${patientId}/observations?encounter_id=${encounterId}`,
  );
  const error = patient.error || encounter.error || observations.error;
  if (!patient.data || !encounter.data || !observations.data)
    return <LoadState error={error} />;
  if (encounter.data.encounter.patient_id !== patient.data.patient.id)
    return (
      <ErrorMessage message="This encounter does not belong to the selected patient." />
    );
  return (
    <EncounterView
      patient={patient.data.patient}
      encounter={encounter.data.encounter}
      observations={observations.data.observations}
      timezone={context.practice.timezone}
    />
  );
}
