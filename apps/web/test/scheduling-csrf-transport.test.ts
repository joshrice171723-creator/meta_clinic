import { afterEach, expect, it, vi } from "vitest";
import { api, ApiError, clearCsrf, setApiActor } from "../src/api/client";
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
afterEach(() => {
  setApiActor(undefined);
  clearCsrf();
  vi.unstubAllGlobals();
});
it("CSRF422 does not replay a write or declare actor expiry; explicit retry obtains fresh CSRF", async () => {
  setApiActor(undefined);
  clearCsrf();
  const events: string[] = [];
  vi.stubGlobal("window", {
    location: { hostname: "localhost", pathname: "/clinic" },
    parent: null,
    dispatchEvent: (event: Event) => {
      events.push(event.type);
    },
  });
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(json({ csrf_token: "synthetic-old" }))
    .mockResolvedValueOnce(
      json({ error: "Your session expired. Please try again." }, 422),
    )
    .mockResolvedValueOnce(json({ csrf_token: "synthetic-fresh" }))
    .mockResolvedValueOnce(json({ saved: true }));
  vi.stubGlobal("fetch", fetch);
  const options = {
    method: "POST",
    body: { appointment: { patient_id: "71", request_key: "synthetic-exact" } },
  };
  await expect(api("/api/clinic/appointments", options)).rejects.toEqual(
    new ApiError(422, "Your session expired. Please try again."),
  );
  expect(fetch.mock.calls).toHaveLength(2);
  expect(events).toEqual([]);
  await api("/api/clinic/appointments", options);
  expect(fetch.mock.calls.map((call) => call[0])).toEqual([
    "/api/csrf",
    "/api/clinic/appointments",
    "/api/csrf",
    "/api/clinic/appointments",
  ]);
  expect(fetch.mock.calls[3][1].headers["X-CSRF-Token"]).toBe(
    "synthetic-fresh",
  );
  expect(fetch.mock.calls[3][1].body).toEqual(fetch.mock.calls[1][1].body);
});
