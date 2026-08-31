import type { Paperwork, User } from "../../api/contracts";
import { Field, Form, LoadState, useResource } from "../../shared/ui";

export function Paperworks() {
  const { data, error } = useResource<{ paperworks: Paperwork[] }>(
    "/api/paperworks",
  );
  return (
    <>
      <h1>Paperwork.</h1>
      <p>
        Assigned launch documents. Demonstration signing is not a legal or
        institutional submission.
      </p>
      {!data ? (
        <LoadState error={error} />
      ) : data.paperworks.length === 0 ? (
        <p>No paperwork has been assigned yet.</p>
      ) : (
        data.paperworks.map((d) => (
          <article className="clinic-card" key={d.id}>
            <h2>
              <a href={"/paperwork/" + d.id}>{d.title}</a>
            </h2>
            <p>
              {d.document_version} · {d.status.replaceAll("_", " ")}
              {d.demo && " · Demonstration only"}
            </p>
          </article>
        ))
      )}
    </>
  );
}
export function PaperworkPage({ id, user }: { id: string; user: User }) {
  const { data, error, refresh } = useResource<{ paperwork: Paperwork }>(
    "/api/paperworks/" + id,
  );
  if (!data) return <LoadState error={error} />;
  const d = data.paperwork;
  return (
    <>
      <a href="/paperwork">← Paperwork</a>
      <h1>{d.title}</h1>
      <p>
        {d.document_version} · {d.status.replaceAll("_", " ")}
      </p>
      {d.demo && (
        <p className="demo-notice">
          Demonstration only. Nothing is filed or submitted. Use a fictional
          signature.
        </p>
      )}
      <article className="document-body preserve-lines">{d.body}</article>
      {d.status === "not_started" && (
        <Form
          endpoint={"/api/paperworks/" + id + "/start"}
          submit="Begin review"
          onSuccess={refresh}
        />
      )}
      {d.status === "started" && d.signing_available && (
        <Form
          endpoint={"/api/paperworks/" + id + "/sign"}
          submit="Sign demonstration"
          onSuccess={refresh}
          values={{ content_digest: d.content_digest }}
        >
          <Field
            name="signature_name"
            label="Fictional signature name"
            maxLength={120}
          />
          {!user.development_demo && (
            <Field
              name="password"
              label="Confirm your password"
              type="password"
              autoComplete="current-password"
            />
          )}
          <label>
            <input name="consent" type="checkbox" required /> I intend to sign
            this demonstration document. Nothing is submitted to an institution.
          </label>
        </Form>
      )}
      {d.status === "started" && !d.signing_available && (
        <p>
          Signing is not enabled for this document. Nothing will be filed or
          submitted.
        </p>
      )}
      {d.status === "completed" && (
        <section className="clinic-card">
          <h2>Demonstration completed</h2>
          <p>
            Signed by {d.signature_name} · {d.signed_at} (UTC)
          </p>
          <p>
            Evidence digest: <code>{d.signature_digest}</code>
          </p>
          <a href={"/api/paperworks/" + id + "/receipt"}>
            Download demonstration record
          </a>
        </section>
      )}
    </>
  );
}
