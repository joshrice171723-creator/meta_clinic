import type { BillingDashboard as BillingDashboardData } from "../../api/contracts";
import { Card, LoadState, useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";

function money(value: string, currency: string) {
  const [whole, fraction = ""] = value.split(".");
  const sign = whole.startsWith("-") ? "−" : "";
  const digits = (sign ? whole.slice(1) : whole).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ",",
  );
  return `${currency} ${sign}${digits}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}

function date(value: string, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeZone,
  }).format(new Date(value));
}

function month(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const instant = match
    ? new Date(
        Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
      )
    : new Date(value);
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(instant);
}

export function BillingDashboard() {
  const context = useClinic();
  const { data, error } = useResource<BillingDashboardData>(
    "/api/clinic/billing",
  );

  if (context.capabilities.billing_read !== true)
    return (
      <>
        <h1>Billing</h1>
        <p role="alert">Billing access is not enabled for this account.</p>
      </>
    );
  if (!data) return <LoadState error={error} />;
  if (data.schema_version !== "clinic-billing-v1")
    return (
      <LoadState error="Unable to verify the billing response. Reload and try again." />
    );

  const [primaryCurrency] = data.metrics.currencies;
  return (
    <>
      <div className="billing-heading">
        <div>
          <h1>Billing</h1>
          <a href="/clinic/billing/patients">Patient balances</a>
        </div>
        <span className="billing-status">
          External payment provider not connected
        </span>
      </div>

      <div className="clinic-stats billing-stats">
        <div className="clinic-stat">
          <span>Monthly posted invoices</span>
          <strong>
            {primaryCurrency
              ? money(
                  primaryCurrency.monthly_invoiced,
                  primaryCurrency.currency,
                )
              : "—"}
          </strong>
          <small>{month(data.period.start)}</small>
        </div>
        <div className="clinic-stat">
          <span>Collected in ledger</span>
          <strong>
            {primaryCurrency
              ? money(primaryCurrency.collected, primaryCurrency.currency)
              : "—"}
          </strong>
          <small>{data.metrics.posted_count} posted invoices</small>
        </div>
        <div className="clinic-stat">
          <span>Open invoice balance</span>
          <strong>
            {primaryCurrency
              ? money(primaryCurrency.outstanding, primaryCurrency.currency)
              : "—"}
          </strong>
          <small>
            {data.metrics.draft_count} drafts · {data.metrics.void_count} void
          </small>
        </div>
      </div>

      <div className="clinic-grid billing-grid">
        <Card title="Currency-aware totals">
          {data.metrics.currencies.length === 0 ? (
            <p>No invoice activity has been recorded.</p>
          ) : (
            <div className="billing-currency-list">
              {data.metrics.currencies.map((item) => (
                <div className="billing-currency" key={item.currency}>
                  <strong>{item.currency}</strong>
                  <span>
                    Monthly posted {money(item.monthly_invoiced, item.currency)}
                  </span>
                  <span>
                    Outstanding {money(item.outstanding, item.currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="External payment connection">
          <p>No payment provider is connected.</p>
          <span className="billing-unavailable">
            Configuration required before activation
          </span>
        </Card>
      </div>

      <Card title="Recent invoice ledger">
        {data.recent_invoices.length === 0 ? (
          <p>No invoices have been recorded.</p>
        ) : (
          <div className="billing-table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Invoice</th>
                  <th scope="col">Status</th>
                  <th scope="col">Created</th>
                  <th scope="col">Total</th>
                  <th scope="col">Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <th scope="row">#{invoice.id}</th>
                    <td>
                      <span
                        className={`billing-badge billing-${invoice.status}`}
                      >
                        {invoice.status}
                      </span>
                    </td>
                    <td>{date(invoice.created_at, data.practice.timezone)}</td>
                    <td>{money(invoice.total, invoice.currency)}</td>
                    <td>{money(invoice.balance, invoice.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
