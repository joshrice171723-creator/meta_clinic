import { useState } from "react";
import type { NdcResult } from "../../api/contracts";
import { api } from "../../api/client";
import { Card, Field, Form, createdPath, ErrorMessage } from "../../shared/ui";
import { useClinic } from "../clinic/Workspace";

export function NewProduct() {
  const [results, setResults] = useState<NdcResult[] | undefined>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const actions = useClinic().inventory_actions;
  if (!actions.catalog)
    return (
      <ErrorMessage message="Your clinic account cannot create inventory catalog items." />
    );
  return (
    <>
      <a href="/clinic/pharmacy">← Pharmacy inventory</a>
      <h1>Add a product.</h1>
      <Card title="Find an FDA-listed package">
        <p>
          Search sends only the public name or NDC to api.fda.gov. Never enter
          patient details or private notes.
        </p>
        <form
          className="pharmacy-search"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            const form = e.currentTarget;
            setBusy(true);
            setError("");
            try {
              const result = await api<{ results: NdcResult[] }>(
                "/api/clinic/pharmacy/lookup",
                {
                  method: "POST",
                  body: { ndc_query: new FormData(form).get("ndc_query") },
                },
              );
              setResults(result.results);
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Directory unavailable.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field
            name="ndc_query"
            label="Search brand, generic or NDC"
            maxLength={80}
          />
          <button className="primary-link" disabled={busy}>
            {busy ? "Searching…" : "Search FDA directory"}
          </button>
        </form>
        {error && <ErrorMessage message={error} />}
        {results?.length === 0 && (
          <p role="status">
            No matching packages found. Try the printed NDC or manual entry
            below.
          </p>
        )}
        {results?.map((r) => (
          <article className="ndc-result" key={r.reference_token}>
            <div>
              <h3>{r.name}</h3>
              <p>
                {r.ingredients} · {r.dosage_form}
              </p>
              <p>{r.package_description}</p>
              <small>
                NDC {r.ndc} · Labeler: {r.labeler}
              </small>
            </div>
            <Form
              endpoint="/api/clinic/pharmacy/import"
              values={{ reference_token: r.reference_token }}
              submit="Import this package"
              onSuccess={createdPath("/clinic/pharmacy")}
            />
          </article>
        ))}
        <p>
          <a
            href="https://open.fda.gov/apis/drug/ndc/"
            target="_blank"
            rel="noopener noreferrer"
          >
            openFDA reference information
          </a>{" "}
          is submitted by labelers. NDC listing does not establish FDA approval.
          Verify the physical package; do not use this lookup to make
          medical-care decisions.
        </p>
      </Card>
      <Card title="Manual product details">
        <p>
          For fictional products without a directory match. Starts at zero
          stock.
        </p>
        <Form
          endpoint="/api/clinic/pharmacy"
          submit="Create catalog product"
          onSuccess={createdPath("/clinic/pharmacy")}
        >
          <Field
            name="clinic_pharmacy_product[name]"
            label="Fictional product name"
            maxLength={160}
          />
          <Field
            name="clinic_pharmacy_product[sku]"
            label="Internal SKU"
            maxLength={160}
          />
          <Field
            name="clinic_pharmacy_product[generic_name]"
            label="Generic name (optional)"
            required={false}
            maxLength={500}
          />
          <Field
            name="clinic_pharmacy_product[dosage_form]"
            label="Dosage form (optional)"
            required={false}
            maxLength={500}
          />
          <Field
            name="clinic_pharmacy_product[ingredients]"
            label="Ingredients / strength (optional)"
            required={false}
            maxLength={4000}
          />
          <Field
            name="clinic_pharmacy_product[package_description]"
            label="Fictional package description"
            required={false}
            maxLength={4000}
          />
          <Field
            name="clinic_pharmacy_product[reorder_point]"
            label="Reorder point (base units)"
            type="number"
            min={0}
            max={1000000}
            step={1}
            value={0}
          />
          <Field
            name="clinic_pharmacy_product[stock_unit]"
            label="Base stock unit"
            options={[
              "package",
              "each",
              "tablet",
              "capsule",
              "vial",
              "mL",
              "g",
            ]}
          />
          <Field
            name="clinic_pharmacy_product[quantity_scale]"
            label="Decimal places (mL/g only)"
            type="number"
            min={0}
            max={6}
            step={1}
            value={0}
          />
          <Field
            name="clinic_pharmacy_product[package_size]"
            label="Base units per package"
            type="number"
            min={0.000001}
            max={1000000}
            step={0.000001}
            value={1}
          />
          <Field
            name="clinic_pharmacy_product[unit_reference]"
            label="Verified package/conversion reference"
            required={false}
            maxLength={160}
          />
          <p>
            Unit definitions are fixed for this catalog variant. Never infer a
            dose or mass-to-volume conversion. FDA imports retain whole-package
            units.
          </p>
        </Form>
      </Card>
    </>
  );
}
