import { useEffect, useState } from "react";
import type { ClinicInvoice, Patient } from "../../api/contracts";
import { api } from "../../api/client";
import { Card, LoadState, useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";
import "./staffWorkflow.css";

export function Billing() {
  const { capabilities } = useClinic();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const patients = useResource<{ patients?: Patient[] }>(
    `/api/clinic/patients/lookup${query ? `?q=${encodeURIComponent(query)}` : ""}`,
  );
  const [invoiceState, setInvoiceState] = useState<{
    data?: { invoices: ClinicInvoice[] };
    error?: string;
  }>({});
  useEffect(() => {
    if (!selected) {
      setInvoiceState({});
      return;
    }
    let active = true;
    setInvoiceState({});
    api<{ invoices: ClinicInvoice[] }>(
      `/api/clinic/patients/${selected}/invoices`,
    )
      .then((data) => {
        if (active) setInvoiceState({ data });
      })
      .catch((error: unknown) => {
        if (active)
          setInvoiceState({
            error:
              error instanceof Error
                ? error.message
                : "Unable to load balances.",
          });
      });
    return () => {
      active = false;
    };
  }, [selected]);
  if (capabilities.billing_read !== true)
    return <LoadState error="Billing is unavailable for this account." />;
  if (!patients.data) return <LoadState error={patients.error} />;
  const matches = (patients.data.patients ?? []).filter((patient) =>
    `${patient.display_name} ${patient.reference}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const patient = patients.data.patients?.find((item) => item.id === selected);
  return (
    <>
      <h1>Billing</h1>
      <p className="clinic-lead">
        Select a patient to open their recorded balances. Invoice creation,
        posting, and payment recording are not available from this foundation.
      </p>
      <Card title="Find a patient">
        <label className="form-field">
          <span>Search clinic reference</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {matches.length === 0 ? (
          <p>No matching patients were returned.</p>
        ) : (
          <ul className="clinic-selection-list">
            {matches.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSelected(item.id)}
                  aria-pressed={selected === item.id}
                >
                  {item.display_name}
                  <span>{item.reference}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {patient && (
        <Card title={`Recorded balances · ${patient.display_name}`}>
          {!invoiceState.data && <LoadState error={invoiceState.error} />}
          {invoiceState.data && invoiceState.data.invoices.length === 0 && (
            <p>No invoices were returned for this patient.</p>
          )}
          {invoiceState.data && invoiceState.data.invoices.length > 0 && (
            <ul className="clinic-feature-list">
              {invoiceState.data.invoices.map((invoice) => (
                <li key={invoice.id}>
                  <strong>Invoice #{invoice.id}</strong>
                  <span>
                    {" "}
                    {invoice.status} · {invoice.currency} ·{" "}
                    <span className="clinic-tabular">
                      Balance {invoice.balance_amount ?? "Not provided"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
