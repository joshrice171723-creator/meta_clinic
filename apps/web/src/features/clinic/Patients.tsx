import type { Pagination, Patient } from "../../api/contracts";
import {
  Card,
  createdPath,
  Field,
  Form,
  LoadState,
  Pager,
  useResource,
} from "../../shared/ui";
import { PatientSupport } from "./CareFlow";
import { useClinic } from "./Workspace";

type LegacyNote = {
  id: number;
  body: string;
  author_id: number;
  created_at: string;
};

function currentPage() {
  if (typeof window === "undefined") return 1;
  const page = Number(new URLSearchParams(window.location.search).get("page"));
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function Patients({ id }: { id?: string }) {
  const clinic = useClinic();
  const page = currentPage();
  const { data, error } = useResource<{
    patients?: Patient[];
    patient?: Patient;
    notes?: LegacyNote[];
    pagination?: Pagination;
  }>(`/api/clinic/patients${id ? `/${id}` : `?page=${page}`}`);
  if (!data) return <LoadState error={error} />;
  if (data.patient)
    return (
      <>
        <a href="/clinic/patients">← Patients</a>
        <h1>{data.patient.display_name}</h1>
        <p>Fictional reference: {data.patient.reference}</p>
        <p className="clinic-lead care-boundary">
          Read-only patient context backed by the current clinic APIs. Protected
          note entry, prescribing and external actions remain unavailable.
        </p>
        <PatientSupport patientId={Number(id)} />
        <Card title="Legacy unsigned drafts">
          <p>
            Preserved synthetic entries from the earlier patient-note mapping.
            They are not encounter notes and cannot be signed here.
          </p>
          {data.notes?.map((n) => (
            <article className="care-legacy-note" key={n.id}>
              <p className="preserve-lines">{n.body}</p>
              <small>
                Account {n.author_id} · {n.created_at} (UTC) · Unsigned draft
              </small>
            </article>
          ))}
          {data.notes?.length === 0 && <p>No draft entries.</p>}
        </Card>
      </>
    );
  return (
    <>
      <p className="eyebrow">PATIENTS</p>
      <h1>Patient directory</h1>
      <p className="clinic-lead">
        Fictional records, separate from active visits.{" "}
        <a className="text-link" href="/clinic">
          Return to tracking board →
        </a>
      </p>
      <Card title="Patient directory">
        {data.patients?.length === 0 ? (
          <p>No fictional patients are registered at this location yet.</p>
        ) : (
          <div className="clinic-table-wrap">
            <table className="care-table">
              <caption className="sr-only">
                Patients registered at this location
              </caption>
              <thead>
                <tr>
                  <th scope="col">Patient</th>
                  <th scope="col">Clinic reference</th>
                  <th scope="col">Record</th>
                </tr>
              </thead>
              <tbody>
                {data.patients?.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.display_name}</strong>
                    </td>
                    <td>{p.reference}</td>
                    <td>
                      <a href={`/clinic/patients/${p.id}`}>Open patient</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.pagination && (
          <Pager
            page={data.pagination.page}
            total={data.pagination.total}
            size={data.pagination.per_page}
            path="/clinic/patients"
          />
        )}
      </Card>
      {clinic.capabilities.patients_write && (
        <Card title="Register a patient">
          <p>
            Add a fictional patient to this clinic directory. Use a local
            reference that staff can recognize; do not enter real patient
            information in this development workspace.
          </p>
          <Form
            endpoint="/api/clinic/patients"
            submit="Register patient"
            onSuccess={createdPath("/clinic/patients")}
          >
            <Field
              name="clinic_patient[display_name]"
              label="Patient display name"
              maxLength={120}
              autoComplete="name"
            />
            <Field
              name="clinic_patient[reference]"
              label="Clinic reference"
              maxLength={32}
              autoComplete="off"
            />
          </Form>
        </Card>
      )}
    </>
  );
}
