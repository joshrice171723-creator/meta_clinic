import type { Patient } from "../../api/contracts";
import {
  Card,
  Field,
  Form,
  LoadState,
  createdPath,
  useResource,
} from "../../shared/ui";

export function Patients({ id }: { id?: string }) {
  const { data, error, refresh } = useResource<{
    patients?: Patient[];
    patient?: Patient;
    notes?: {
      id: number;
      body: string;
      author_id: number;
      created_at: string;
    }[];
  }>("/api/clinic/patients" + (id ? "/" + id : ""));
  if (!data) return <LoadState error={error} />;
  if (data.patient)
    return (
      <>
        <a href="/clinic/patients">← Patients</a>
        <h1>{data.patient.display_name}</h1>
        <p>Fictional reference: {data.patient.reference}</p>
        <Card title="Synthetic draft entry">
          <p>
            Append-only draft. Not a signed clinical note. Do not enter real or
            real-derived patient details.
          </p>
          <Form
            endpoint={"/api/clinic/patients/" + id + "/note"}
            submit="Save synthetic draft"
            onSuccess={refresh}
          >
            <Field
              name="body"
              label="Fictional draft text"
              type="textarea"
              maxLength={8000}
            />
          </Form>
        </Card>
        <Card title="Draft history">
          {data.notes?.map((n) => (
            <article key={n.id}>
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
      </Card>
      <Card title="Add a fictional patient">
        <Form
          endpoint="/api/clinic/patients"
          submit="Add fictional patient"
          onSuccess={createdPath("/clinic/patients")}
        >
          <Field
            name="clinic_patient[display_name]"
            label="Fictional name"
            maxLength={120}
          />
          <Field
            name="clinic_patient[reference]"
            label="Fictional reference"
            maxLength={32}
          />
        </Form>
      </Card>
    </>
  );
}
