import type { Item } from "../../api/contracts";
import { Card, Field, Form, LoadState, useResource } from "../../shared/ui";
import { useClinicOverview } from "../clinic/Workspace";

export function Office() {
  const { data, error, refresh } = useResource<{ items: Item[] }>(
    "/api/clinic/inventory",
  );
  const actions = useClinicOverview().inventory_actions;
  if (!data) return <LoadState error={error} />;
  return (
    <>
      <h1>Office inventory.</h1>
      <p>
        Synthetic office supplies. No purchases are placed. Earlier stock
        history is preserved.
      </p>
      <Card title="Stock on hand">
        {data.items.length === 0 && <p>No office items yet.</p>}
        {data.items.map((i) => (
          <article key={i.id} className="clinic-card">
            <h3>
              {i.name} · {i.sku}
            </h3>
            <p>
              {i.quantity} on hand · reorder at {i.reorder_level}
            </p>
            {actions.adjust && (
              <details>
                <summary>Record adjustment</summary>
                <Form
                  endpoint={"/api/clinic/inventory/" + i.id + "/adjust"}
                  submit="Record adjustment"
                  onSuccess={refresh}
                  retryKey
                >
                  <Field
                    name="delta"
                    label="Whole-number change (+ or −)"
                    type="number"
                    step={1}
                  />
                  <Field name="reason" label="Reason — no patient references" />
                </Form>
              </details>
            )}
          </article>
        ))}
      </Card>
      {actions.catalog && (
        <Card title="Add an office item">
          <Form
            endpoint="/api/clinic/inventory"
            submit="Add item"
            onSuccess={refresh}
          >
            <Field
              name="clinic_item[name]"
              label="Fictional item name"
              maxLength={160}
            />
            <Field name="clinic_item[sku]" label="SKU" maxLength={160} />
            <Field
              name="clinic_item[reorder_level]"
              label="Reorder level"
              type="number"
              min={0}
              max={1000000}
              step={1}
              value={0}
            />
          </Form>
          <p>Starts at zero. Record initial stock with an adjustment.</p>
        </Card>
      )}
    </>
  );
}
