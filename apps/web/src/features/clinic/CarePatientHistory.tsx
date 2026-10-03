import type { Encounter, Pagination as PageInfo } from "../../api/contracts";
import { Card, LoadState, useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";
import { clinicDateTime } from "./careFlowState";

function EncounterHistory({ patientId }: { patientId: number }) {
  const timezone = useClinic().practice.timezone;
  const { data, error } = useResource<{
    encounters: Encounter[];
    pagination: PageInfo;
  }>(`/api/clinic/patients/${patientId}/encounters`);
  if (!data) return <LoadState error={error} />;
  return (
    <Card title="Encounter history">
      {data.encounters.length === 0 ? (
        <p>No encounters are recorded for this patient.</p>
      ) : (
        <ul className="care-record-list">
          {data.encounters.map((encounter) => (
            <li key={encounter.id}>
              <div>
                <strong>Encounter #{encounter.id}</strong>
                <span>{clinicDateTime(encounter.started_at, timezone)}</span>
              </div>
              <span className="care-status">
                {encounter.status === "open" ? "In progress" : "Completed"}
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
