import type { Pagination, Patient } from "../../api/contracts";
import { Card, LoadState, Pager, useResource } from "../../shared/ui";
import { PatientSupport } from "./CareFlow";

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
        {data.patients?.length === 0 && <p>No fictional patients yet.</p>}
        <ul>
          {data.patients?.map((p) => (
            <li key={p.id}>
              <a href={"/clinic/patients/" + p.id}>{p.display_name}</a> ·{" "}
              {p.reference}
            </li>
          ))}
        </ul>
        {data.pagination && (
          <Pager
            page={data.pagination.page}
            total={data.pagination.total}
            size={data.pagination.per_page}
            path="/clinic/patients"
          />
        )}
      </Card>
      <Card title="Registration boundary">
        <p>
          Patient registration is not exposed in this minimum pass because the
          current context does not distinguish patient read from patient write.
        </p>
      </Card>
    </>
  );
}
