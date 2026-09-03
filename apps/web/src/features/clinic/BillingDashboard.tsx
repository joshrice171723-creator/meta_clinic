import { useResource } from "../../shared/ui";
import type { BillingDashboard as BillingDashboardData } from "../../api/contracts";
import { Card, LoadState } from "../../shared/ui";
import { useClinic } from "./Workspace";

function money(value: string, currency: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${currency} ${value}`;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(amount);
}

function date(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );
}

export function BillingDashboard() {
  const context = useClinic();
  const { data, error } = useResource<BillingDashboardData>(
    "/api/clinic/billing",
  );

  if (!context.capabilities.billing)
    return (
      <>
        <p className="eyebrow">PRACTICE OPERATIONS</p>
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
          <p className="eyebrow">PRACTICE OPERATIONS</p>
          <h1>Billing</h1>
          <p className="clinic-lead">
            A tenant-scoped view of the existing invoice ledger for{" "}
            {data.practice.name}.
          </p>
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
          <small>
            {new Date(data.period.start).toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </small>
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
          <p className="billing-fine-print">
            Totals are kept separate by currency. No platform fee or
            inventory-value rate is configured here.
          </p>
        </Card>
        <Card title="External payment connection">
          <p>
            A payment provider connection is not enabled in this synthetic
            workspace. Provider onboarding, webhooks and payment execution
            remain unavailable.
          </p>
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
                    <td>{date(invoice.created_at)}</td>
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
