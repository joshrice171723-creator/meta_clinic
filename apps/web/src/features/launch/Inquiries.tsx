import { LoadState, useResource } from "../../shared/ui";

export function Inquiries() {
  const query = new URLSearchParams(window.location.search).get("before");
  const { data, error } = useResource<{
    inquiries: {
      id: number;
      name: string;
      email: string;
      message: string;
      created_at: string;
    }[];
    next_cursor: number | null;
  }>("/api/inquiries" + (query ? "?before=" + encodeURIComponent(query) : ""));
  return (
    <>
      <h1>Inquiry inbox.</h1>
      <p>Administrator access only. No email notifications are sent.</p>
      {!data ? (
        <LoadState error={error} />
      ) : (
        <>
          {data.inquiries.length === 0 && <p>No inquiries.</p>}
          {data.inquiries.map((i) => (
            <article className="clinic-card" key={i.id}>
              <h2>{i.name}</h2>
              <p>
                {i.email} · {i.created_at} (UTC)
              </p>
              <p className="preserve-lines">{i.message}</p>
            </article>
          ))}
          {data.next_cursor && (
            <a href={"/inquiries?before=" + data.next_cursor}>
              Older inquiries →
            </a>
          )}
        </>
      )}
    </>
  );
}
