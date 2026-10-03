import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, clearCsrf, setApiActor } from "../src/api/client";

beforeEach(() => {
  setApiActor(undefined);
  clearCsrf();
});
afterEach(() => {
  clearCsrf();
  vi.unstubAllGlobals();
});

function terminal(pathname: string, search = "") {
  const scope = {
    location: { pathname, search },
    name: "",
    parent: undefined as unknown,
  };
  scope.parent = scope;
  vi.stubGlobal("window", scope);
}

function responses() {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ csrf_token: "synthetic-only" })),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify({ enrolled: true })));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("standalone demo kiosk transport isolation", () => {
  it("keeps enrollment and CSRF in the isolated demo namespace after opening a new tab", async () => {
    terminal("/workforce/kiosk", "?workspace=demo");
    const fetch = responses();
    await api("/api/workforce/kiosk/enroll", {
      method: "POST",
      body: { enrollment_token: "synthetic-nonfunctional" },
    });
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      "/api/demo-workspace/csrf",
      "/api/demo-workspace/workforce/kiosk/enroll",
    ]);
    expect(fetch.mock.calls[1][1].headers).toMatchObject({
      "X-Clinic-Demo": "1",
      "X-CSRF-Token": "synthetic-only",
    });
    expect(fetch.mock.calls[1][1].credentials).toBe("same-origin");
  });

  it.each([
    ["/workforce/kiosk", ""],
    ["/workforce/kiosk", "?workspace=ordinary"],
    ["/clinic", "?workspace=demo"],
  ])("keeps ordinary routing for %s%s", async (pathname, search) => {
    terminal(pathname, search);
    const fetch = responses();
    await api("/api/workforce/kiosk");
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      "/api/csrf",
      "/api/workforce/kiosk",
    ]);
    expect(fetch.mock.calls[1][1].headers["X-Clinic-Demo"]).toBeUndefined();
  });
});
