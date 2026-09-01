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
          Synthetic registration details backed by the clinic API. Protected note
          entry, prescribing and external actions remain unavailable.
        </p>
        {clinic.capabilities.patients_write && (
          <Card title="Edit registration details">
            <PatientRegistrationForm patient={data.patient} />
          </Card>
        )}
        <PatientDetails patient={data.patient} />
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
            <PatientFields />
          </Form>
        </Card>
      )}
    </>
  );
}

function PatientFields({ patient }: { patient?: Patient }) {
  const d = patient?.demographics;
  const c = patient?.contacts?.[0];
  const e = patient?.emergency_contacts?.[0];
  const p = patient?.communication_preference;
  const s = patient?.social_histories?.[0];
  return <>
    <Field name="clinic_patient[date_of_birth]" label="Date of birth" type="date" required={false} value={d?.date_of_birth ?? undefined} />
    <Field name="clinic_patient[sex]" label="Sex" required={false} value={d?.sex} options={[["not_recorded", "Not recorded"], ["female", "Female"], ["male", "Male"], ["intersex", "Intersex"], ["unknown", "Unknown"]]} />
    <Field name="clinic_patient[primary_language]" label="Primary language" required={false} value={d?.primary_language} maxLength={80} />
    <Field name="clinic_patient[interpreter_required]" label="Interpreter required" required={false} value={d?.interpreter_required ? "true" : "false"} options={[["false", "No"], ["true", "Yes"]]} />
    <Field name="clinic_patient[contact_type]" label="Contact type" required={false} value={c?.contact_type} options={["phone", "email"]} />
    <Field name="clinic_patient[contact_value]" label="Phone or email" required={false} value={c?.contact_value} maxLength={320} />
    <Field name="clinic_patient[preferred_contact_method]" label="Preferred contact method" required={false} value={p?.preferred_contact_method} options={["portal", "text", "phone", "email"]} />
    <Field name="clinic_patient[appointment_reminders_consent]" label="Appointment reminders consent" required={false} value={p?.appointment_reminders_consent ? "true" : "false"} options={[["false", "No"], ["true", "Yes"]]} />
    <Field name="clinic_patient[general_communications_consent]" label="General communications consent" required={false} value={p?.general_communications_consent ? "true" : "false"} options={[["false", "No"], ["true", "Yes"]]} />
    <Field name="clinic_patient[emergency_name]" label="Emergency contact name" required={false} value={e?.name} maxLength={320} />
    <Field name="clinic_patient[emergency_relationship]" label="Emergency contact relationship" required={false} value={e?.relationship} maxLength={320} />
    <Field name="clinic_patient[emergency_phone]" label="Emergency contact phone" required={false} value={e?.phone} maxLength={320} />
    <Field name="clinic_patient[permission_to_contact]" label="Permission to contact" required={false} value={e?.permission_to_contact ? "true" : "false"} options={[["false", "No"], ["true", "Yes"]]} />
    {(["tobacco_use", "alcohol_use", "exercise_habits", "diet", "occupation", "living_situation", "relevant_social_factors"] as const).map((name) => <Field key={name} name={`clinic_patient[${name}]`} label={name.replaceAll("_", " ")} type="textarea" required={false} value={s?.[name] ?? undefined} maxLength={2000} />)}
  </>;
}

function PatientRegistrationForm({ patient }: { patient: Patient }) {
  return <Form endpoint={`/api/clinic/patients/${patient.id}`} method="PATCH" submit="Save registration details" className="pharmacy-form-grid"><Field name="clinic_patient[display_name]" label="Patient display name" value={patient.display_name} maxLength={120} /><Field name="clinic_patient[reference]" label="Clinic reference" value={patient.reference} maxLength={32} /><PatientFields patient={patient} /></Form>;
}

function PatientDetails({ patient }: { patient: Patient }) {
  const d = patient.demographics;
  return <div className="care-grid"><Card title="Demographics"><dl className="care-observations"><div><dt>Date of birth</dt><dd>{d?.date_of_birth || "Not recorded"}</dd></div><div><dt>Sex</dt><dd>{d?.sex || "Not recorded"}</dd></div><div><dt>Language</dt><dd>{d?.primary_language || "Not recorded"}{d?.interpreter_required ? " · Interpreter required" : ""}</dd></div></dl></Card><Card title="Contacts"><p>{patient.contacts?.map((c) => `${c.contact_type}: ${c.contact_value}`).join(" · ") || "No contact recorded."}</p><p>{patient.emergency_contacts?.[0] ? `Emergency: ${patient.emergency_contacts[0].name} (${patient.emergency_contacts[0].relationship})` : "No emergency contact recorded."}</p></Card><Card title="Communication preferences"><p>{patient.communication_preference?.preferred_contact_method || "Not recorded"}</p><p>Reminders: {patient.communication_preference?.appointment_reminders_consent ? "Consented" : "Not consented"} · General: {patient.communication_preference?.general_communications_consent ? "Consented" : "Not consented"}</p></Card><Card title="Lifestyle and social history"><p>{patient.social_histories?.[0] ? "Current synthetic social history recorded." : "Not recorded."}</p></Card><Card title="Vital-sign history"><p>{patient.vital_signs?.length ? patient.vital_signs.map((v) => `${v.code}: ${v.numeric_value} ${v.unit_code}`).join(" · ") : "No vital-sign observations recorded."}</p></Card><Card title="Clinical modules"><p>Allergies, medications, and conditions are not yet modeled with clinical attributes in this prototype.</p></Card></div>;
}
