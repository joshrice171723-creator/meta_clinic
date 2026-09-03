import { useState } from "react";
import type { Patient } from "../../api/contracts";
import { Card, LoadState, useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";
import { bookingAvailability } from "./CareFlow";
import "./staffWorkflow.css";

function allowed(capability: boolean | undefined) {
  return capability === true;
}

export function FrontDesk() {
  const { capabilities } = useClinic();
  const canPatients = capabilities.patients === true;
  const canIdentityLookup = allowed(capabilities.patient_identity_read);
  const canSchedule = allowed(capabilities.appointments_read);
  const canBilling = allowed(capabilities.billing_read);
  const booking = bookingAvailability(capabilities);
  return (
    <>
      <h1>Front desk</h1>
      <p className="clinic-lead">
        Find the correct record, review scheduled work, and open billing from a
        selected patient. Registration is available only to authorized users.
      </p>
      <Card title="Start with the recorded work">
        <div className="clinic-workflow-list">
          {canSchedule ? (
            <a href="/clinic/schedule">
              <strong>Review scheduled work</strong>
              <span>Read the appointment list and its recorded status.</span>
            </a>
          ) : (
            <Unavailable label="Scheduled work" />
          )}
          {canPatients ? (
            <a href="/clinic/patients">
              <strong>Find or register a patient</strong>
              <span>
                Use the existing patient directory and registration form.
              </span>
            </a>
          ) : canIdentityLookup ? (
            <IdentityLookup />
          ) : (
            <Unavailable label="Patient identity and registration" />
          )}
          {booking.visible ? (
            <a href="/clinic/schedule">
              <strong>Schedule a visit</strong>
              <span>Use the existing appointment workflow.</span>
            </a>
          ) : (
            <Unavailable label="Scheduling a visit" />
          )}
          {canBilling ? (
            <a href="/clinic/billing">
              <strong>Open billing</strong>
              <span>Review invoices and balances.</span>
            </a>
          ) : (
            <Unavailable label="Billing" />
          )}
        </div>
      </Card>
      <Card title="Arrival status">
        <p>
          Arrival and check-in actions are unavailable here because no supported
          check-in capability is recorded.
        </p>
      </Card>
    </>
  );
}

function IdentityLookup() {
  const [query, setQuery] = useState("");
  const patients = useResource<{ patients?: Patient[] }>(
    `/api/clinic/patients/lookup${query ? `?q=${encodeURIComponent(query)}` : ""}`,
  );
  return (
    <div className="clinic-workflow-lookup">
      <strong>Find a patient</strong>
      <span>
        Search by clinic reference. Full patient registration is unavailable.
      </span>
      <input
        aria-label="Search clinic reference"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {!patients.data && <LoadState error={patients.error} />}
      {patients.data && patients.data.patients?.length === 0 && (
        <span>No matching clinic references were returned.</span>
      )}
      {patients.data &&
        patients.data.patients &&
        patients.data.patients.length > 0 && (
          <ul className="clinic-selection-list">
            {patients.data.patients.map((patient) => (
              <li key={patient.id}>
                <span>
                  {patient.display_name} · {patient.reference}
                </span>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}

function Unavailable({ label }: { label: string }) {
  return (
    <div className="clinic-workflow-unavailable">
      <strong>{label}</strong>
      <span>Unavailable for this account.</span>
    </div>
  );
}
