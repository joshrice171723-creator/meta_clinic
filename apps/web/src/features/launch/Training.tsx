import type { Material } from "../../api/contracts";
import { Form, LoadState, useResource } from "../../shared/ui";

export function Training({ id }: { id?: string }) {
  const { data, error, refresh } = useResource<{
    material?: Material;
    materials?: Material[];
  }>("/api/materials" + (id ? "/" + id : ""));
  if (!data) return <LoadState error={error} />;
  const m = data.material;
  if (m)
    return (
      <>
        <a href="/training">← Training</a>
        <h1>{m.title}</h1>
        {m.sample && (
          <p className="demo-notice">
            Sample guide · not reviewed clinical or legal instruction.
          </p>
        )}
        <p>{m.summary}</p>
        <article className="document-body preserve-lines">{m.body}</article>
        <p>Status: {m.status.replaceAll("_", " ")}</p>
        {m.status !== "completed" && (
          <Form
            endpoint={
              "/api/materials/" +
              id +
              (m.status === "not_started" ? "/start" : "/complete")
            }
            submit={
              m.status === "not_started" ? "Start guide" : "Mark completed"
            }
            onSuccess={refresh}
          />
        )}
      </>
    );
  return (
    <>
      <h1>Onboarding &amp; training.</h1>
      {data.materials?.length === 0 && <p>No guides are available yet.</p>}
      {data.materials?.map((g) => (
        <article className="clinic-card" key={g.id}>
          <h2>
            <a href={"/training/" + g.id}>{g.title}</a>
          </h2>
          <p>{g.summary}</p>
          <span className="status-badge">{g.status.replaceAll("_", " ")}</span>
          {g.sample && <p>Sample guide</p>}
        </article>
      ))}
    </>
  );
}
