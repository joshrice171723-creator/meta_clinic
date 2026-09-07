import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from "@mui/material";
import { useRef, useState } from "react";
import type { Encounter, Pagination, Patient } from "../../api/contracts";
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
import { PatientClinicalHistory } from "./PatientClinicalHistory";
import { useClinic } from "./Workspace";
import { patientReferenceLabel } from "./patientReference";
import { PatientLabReports } from "./PatientLabReports";

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
  const { data, error, refresh } = useResource<{
    patients?: Patient[];
    patient?: Patient;
    notes?: LegacyNote[];
    pagination?: Pagination;
  }>(`/api/clinic/patients${id ? `/${id}` : `?page=${page}`}`);
  if (!data) return <LoadState error={error} />;
  if (data.patient)
    return (
      <PatientRecord
        key={data.patient.id}
        canEditRegistration={clinic.capabilities.patients_write}
        notes={data.notes}
        onRegistrationSaved={refresh}
        patient={data.patient}
      />
    );
  return (
    <>
      <p className="eyebrow">PATIENTS</p>
      <h1>Patient directory</h1>
      <a className="text-link" href="/clinic">
        Return to tracking board →
      </a>
      <Card title="Patient directory">
        {data.patients?.length === 0 ? (
          <p>No patients are registered at this location yet.</p>
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
                    <td>
                      {patientReferenceLabel(p.reference) ?? "Not recorded"}
                    </td>
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
          <PatientRegistrationForm
            onSuccess={createdPath("/clinic/patients")}
          />
        </Card>
      )}
    </>
  );
}

function PatientRecord({
  canEditRegistration,
  notes,
  onRegistrationSaved,
  patient,
}: {
  canEditRegistration: boolean;
  notes?: LegacyNote[];
  onRegistrationSaved: () => void;
  patient: Patient;
}) {
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [registrationDirty, setRegistrationDirty] = useState(false);
  const [discardPending, setDiscardPending] = useState(false);
  const registrationDialogRef = useRef<HTMLDivElement>(null);
  const closeRegistration = () => {
    if (registrationDialogRef.current?.querySelector("fieldset[disabled]"))
      return;
    if (registrationDirty) setDiscardPending(true);
    else setRegistrationOpen(false);
  };
  const reference = patientReferenceLabel(patient.reference);
  return (
    <>
      <a href="/clinic/patients">← Patients</a>
      <h1>{patient.display_name}</h1>
      {reference && <p>Reference: {reference}</p>}
      <ActiveEncounterAction patientId={patient.id} />
      {canEditRegistration && (
        <>
          <Button onClick={() => setRegistrationOpen(true)} variant="outlined">
            Edit registration
          </Button>
          <Dialog
            fullWidth
            maxWidth="md"
            onClose={closeRegistration}
            open={registrationOpen}
          >
            <DialogTitle>Edit registration details</DialogTitle>
            <DialogContent ref={registrationDialogRef}>
              <div
                onChange={() => {
                  if (!registrationDirty) setRegistrationDirty(true);
                }}
              >
                <PatientRegistrationForm
                  patient={patient}
                  onSuccess={() => {
                    setRegistrationDirty(false);
                    setDiscardPending(false);
                    setRegistrationOpen(false);
                    onRegistrationSaved();
                  }}
                />
              </div>
              {discardPending && (
                <Alert
                  action={
                    <>
                      <Button
                        color="inherit"
                        onClick={() => setDiscardPending(false)}
                        size="small"
                      >
                        Keep editing
                      </Button>
                      <Button
                        color="inherit"
                        onClick={() => {
                          if (
                            registrationDialogRef.current?.querySelector(
                              "fieldset[disabled]",
                            )
                          )
                            return;
                          setDiscardPending(false);
                          setRegistrationDirty(false);
                          setRegistrationOpen(false);
                        }}
                        size="small"
                      >
                        Discard changes
                      </Button>
                    </>
                  }
                  severity="warning"
                  sx={{ mt: 2 }}
                >
                  You have unsaved registration changes.
                </Alert>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={closeRegistration}>Cancel</Button>
            </DialogActions>
          </Dialog>
        </>
      )}
      <PatientDetails patient={patient} />
      <PatientSupport patientId={patient.id} />
      <Card title="Legacy unsigned drafts">
        <p>These drafts are not encounter notes and cannot be signed.</p>
        {notes?.map((n) => (
          <article className="care-legacy-note" key={n.id}>
            <p className="preserve-lines">{n.body}</p>
            <small>
              Account {n.author_id} · {n.created_at} (UTC) · Unsigned draft
            </small>
          </article>
        ))}
        {notes?.length === 0 && <p>No draft entries.</p>}
      </Card>
    </>
  );
}

function ActiveEncounterAction({ patientId }: { patientId: number }) {
  const { data, error } = useResource<{
    encounters: Encounter[];
  }>(`/api/clinic/patients/${patientId}/encounters?status=open&per_page=1`);
  if (!data && !error)
    return (
      <Card title="Active visit">
        <p>Checking for an open visit…</p>
      </Card>
    );
  if (error)
    return (
      <Card title="Active visit">
        <p>Unable to check for an open visit.</p>
      </Card>
    );
  const encounter = data?.encounters[0];
  if (!encounter)
    return (
      <Card title="Active visit">
        <p>No open visit is recorded.</p>
      </Card>
    );
  return (
    <Card title="Active visit">
      <p>
        An open visit started {new Date(encounter.started_at).toLocaleString()}.
      </p>
      <Button
        component="a"
        href={`/clinic/patients/${patientId}/encounters/${encounter.id}`}
        variant="contained"
      >
        Open visit
      </Button>
    </Card>
  );
}

function PatientFields({ patient }: { patient?: Patient }) {
  const d = patient?.demographics;
  const c = patient?.contacts?.[0];
  const e = patient?.emergency_contacts?.[0];
  const p = patient?.communication_preference;
  const s = patient?.social_histories?.[0];
  return (
    <>
      <Field
        name="clinic_patient[date_of_birth]"
        label="Date of birth"
        type="date"
        required={false}
        value={d?.date_of_birth ?? undefined}
      />
      <Field
        name="clinic_patient[sex]"
        label="Sex"
        required={false}
        value={d?.sex}
        options={[
          ["not_recorded", "Not recorded"],
          ["female", "Female"],
          ["male", "Male"],
          ["intersex", "Intersex"],
          ["unknown", "Unknown"],
        ]}
      />
      <Field
        name="clinic_patient[primary_language]"
        label="Primary language"
        required={false}
        value={d?.primary_language}
        maxLength={80}
      />
      <Field
        name="clinic_patient[interpreter_required]"
        label="Interpreter required"
        required={false}
        value={d?.interpreter_required ? "true" : "false"}
        options={[
          ["false", "No"],
          ["true", "Yes"],
        ]}
      />
      <Field
        name="clinic_patient[contact_type]"
        label="Contact type"
        required={false}
        value={c?.contact_type}
        options={["phone", "email"]}
      />
      <Field
        name="clinic_patient[contact_value]"
        label="Phone or email"
        required={false}
        value={c?.contact_value}
        maxLength={320}
      />
      <Field
        name="clinic_patient[preferred_contact_method]"
        label="Preferred contact method"
        required={false}
        value={p?.preferred_contact_method}
        options={["portal", "text", "phone", "email"]}
      />
      <Field
        name="clinic_patient[appointment_reminders_consent]"
        label="Appointment reminders consent"
        required={false}
        value={p?.appointment_reminders_consent ? "true" : "false"}
        options={[
          ["false", "No"],
          ["true", "Yes"],
        ]}
      />
      <Field
        name="clinic_patient[general_communications_consent]"
        label="General communications consent"
        required={false}
        value={p?.general_communications_consent ? "true" : "false"}
        options={[
          ["false", "No"],
          ["true", "Yes"],
        ]}
      />
      <Field
        name="clinic_patient[emergency_name]"
        label="Emergency contact name"
        required={false}
        value={e?.name}
        maxLength={320}
      />
      <Field
        name="clinic_patient[emergency_relationship]"
        label="Emergency contact relationship"
        required={false}
        value={e?.relationship}
        maxLength={320}
      />
      <Field
        name="clinic_patient[emergency_phone]"
        label="Emergency contact phone"
        required={false}
        value={e?.phone}
        maxLength={320}
      />
      <Field
        name="clinic_patient[permission_to_contact]"
        label="Permission to contact"
        required={false}
        value={e?.permission_to_contact ? "true" : "false"}
        options={[
          ["false", "No"],
          ["true", "Yes"],
        ]}
      />
      {(
        [
          "tobacco_use",
          "alcohol_use",
          "exercise_habits",
          "diet",
          "occupation",
          "living_situation",
          "relevant_social_factors",
        ] as const
      ).map((name) => (
        <Field
          key={name}
          name={`clinic_patient[${name}]`}
          label={name.replaceAll("_", " ")}
          type="textarea"
          required={false}
          value={s?.[name] ?? undefined}
          maxLength={2000}
        />
      ))}
    </>
  );
}

export function PatientRegistrationForm({
  patient,
  onSuccess,
}: {
  patient?: Patient;
  onSuccess?: (result: Record<string, unknown> | undefined) => void;
}) {
  return (
    <Form
      endpoint={
        patient ? `/api/clinic/patients/${patient.id}` : "/api/clinic/patients"
      }
      method={patient ? "PATCH" : "POST"}
      submit={patient ? "Save registration details" : "Register patient"}
      onSuccess={onSuccess}
      className="pharmacy-form-grid"
    >
      <Field
        name="clinic_patient[display_name]"
        label="Patient display name"
        value={patient?.display_name}
        maxLength={120}
      />
      {(!patient?.reference || patientReferenceLabel(patient.reference)) && (
        <Field
          name="clinic_patient[reference]"
          label="Clinic reference"
          value={patient?.reference}
          maxLength={32}
        />
      )}
      <PatientFields patient={patient} />
    </Form>
  );
}

function PatientDetails({ patient }: { patient: Patient }) {
  const d = patient.demographics;
  return (
    <div className="care-grid">
      <Card title="Demographics">
        <dl className="care-observations">
          <div>
            <dt>Date of birth</dt>
            <dd>{d?.date_of_birth || "Not recorded"}</dd>
          </div>
          <div>
            <dt>Sex</dt>
            <dd>{d?.sex || "Not recorded"}</dd>
          </div>
          <div>
            <dt>Language</dt>
            <dd>
              {d?.primary_language || "Not recorded"}
              {d?.interpreter_required ? " · Interpreter required" : ""}
            </dd>
          </div>
        </dl>
      </Card>
      <Card title="Contacts">
        <p>
          {patient.contacts
            ?.map((c) => `${c.contact_type}: ${c.contact_value}`)
            .join(" · ") || "No contact recorded."}
        </p>
        <p>
          {patient.emergency_contacts?.[0]
            ? `Emergency: ${patient.emergency_contacts[0].name} (${patient.emergency_contacts[0].relationship})`
            : "No emergency contact recorded."}
        </p>
      </Card>
      <Card title="Communication preferences">
        <p>
          {patient.communication_preference?.preferred_contact_method ||
            "Not recorded"}
        </p>
        <p>
          Reminders:{" "}
          {patient.communication_preference?.appointment_reminders_consent
            ? "Consented"
            : "Not consented"}{" "}
          · General:{" "}
          {patient.communication_preference?.general_communications_consent
            ? "Consented"
            : "Not consented"}
        </p>
      </Card>
      <Card title="Lifestyle and social history">
        <p>
          {patient.social_histories?.[0]
            ? "Current social history recorded."
            : "Not recorded."}
        </p>
      </Card>
      <Card title="Vital-sign history">
        <p>
          {patient.vital_signs?.length
            ? patient.vital_signs
                .map((v) => `${v.code}: ${v.numeric_value} ${v.unit_code}`)
                .join(" · ")
            : "No vital-sign observations recorded."}
        </p>
      </Card>
      <PatientClinicalHistory patientId={patient.id} />
      <PatientLabReports
        patientId={patient.id}
        patientName={patient.display_name}
      />
    </div>
  );
}
