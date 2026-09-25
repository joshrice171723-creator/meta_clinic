import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  api,
  ApiError,
  clearCsrf,
  csrf,
  formBody,
  loginDestination,
  setApiActor,
} from "../src/api/client";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
beforeEach(() => {
  setApiActor(undefined);
  clearCsrf();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("same-origin API boundary", () => {
  it.each(["/login", "/clinic", "/owner", "/portal"])(
    "routes hosted demo %s to the isolated database",
    async (pathname) => {
      vi.stubGlobal("window", {
        location: { hostname: "aimetaclinic.com", pathname },
        parent: null,
      });
      const fetch = vi.fn().mockResolvedValue(json({ csrf_token: "demo" }));
      vi.stubGlobal("fetch", fetch);
      await csrf();
      expect(fetch.mock.calls[0][0]).toBe("/api/demo-workspace/csrf");
    },
  );
  it.each(["aimetaclinic.com.example.org", "localhost"])(
    "keeps %s on its ordinary API",
    async (hostname) => {
      vi.stubGlobal("window", {
        location: { hostname, pathname: "/login" },
        parent: null,
      });
      const fetch = vi.fn().mockResolvedValue(json({ csrf_token: "ordinary" }));
      vi.stubGlobal("fetch", fetch);
      await csrf();
      expect(fetch.mock.calls[0][0]).toBe("/api/csrf");
    },
  );
  it("shares bootstrap and holds parallel reads until the CSRF cookie is initialized", async () => {
    let release!: (response: Response) => void;
    const fetch = vi.fn().mockImplementation((path: string) =>
      path === "/api/csrf"
        ? new Promise<Response>((resolve) => {
            release = resolve;
          })
        : Promise.resolve(json({ ok: true })),
    );
    vi.stubGlobal("fetch", fetch);
    const boot = csrf();
    const session = api("/api/session");
    const settings = api("/api/settings");
    expect(fetch.mock.calls.map((call) => call[0])).toEqual(["/api/csrf"]);
    release(json({ csrf_token: "initialized" }));
    await Promise.all([boot, session, settings]);
    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      "/api/csrf",
      "/api/session",
      "/api/settings",
    ]);
  });
  it("rejects an old bootstrap response after session rotation without caching its token", async () => {
    let release!: (response: Response) => void;
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValueOnce(json({ csrf_token: "current" }))
      .mockResolvedValueOnce(json({ saved: true }));
    vi.stubGlobal("fetch", fetch);
    const stale = csrf();
    clearCsrf();
    release(json({ csrf_token: "stale" }));
    await expect(stale).rejects.toThrow("Your session changed");
    await api("/api/settings", { method: "PATCH", body: {} });
    expect(fetch.mock.calls[2][1].headers["X-CSRF-Token"]).toBe("current");
  });
  it("gets CSRF before mutation, sends cookies and never persists a bearer token", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json({ csrf_token: "synthetic-csrf", development_login: false }),
      )
      .mockResolvedValueOnce(json({ id: 7 }, 201));
    vi.stubGlobal("fetch", fetch);
    expect(
      await api("/api/clinic/pharmacy", {
        method: "POST",
        body: { amount: "0.000001" },
      }),
    ).toEqual({ id: 7 });
    expect(fetch.mock.calls[0][0]).toBe("/api/csrf");
    expect(fetch.mock.calls[1][1]).toMatchObject({
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: { "X-CSRF-Token": "synthetic-csrf" },
      body: '{"amount":"0.000001"}',
    });
  });
  it("does not retry a failed or uncertain stock write", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ csrf_token: "synthetic-csrf" }))
      .mockRejectedValueOnce(new TypeError("Network unavailable"));
    vi.stubGlobal("fetch", fetch);
    await expect(
      api("/api/clinic/pharmacy/1/receive", {
        method: "POST",
        body: { request_key: "synthetic" },
      }),
    ).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("aborts a hung CSRF bootstrap at the request deadline", async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const fetch = vi.fn().mockImplementation(
      (_path: string, options: RequestInit) =>
        new Promise<Response>(() => {
          requestSignal = options.signal as AbortSignal;
        }),
    );
    vi.stubGlobal("fetch", fetch);

    const pending = csrf();
    const rejected = expect(pending).rejects.toMatchObject({
      status: 504,
      code: "request_timeout",
    });
    await vi.advanceTimersByTimeAsync(30_000);

    await rejected;
    expect(requestSignal?.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("deadlines a hung mutation response body as an uncertain outcome", async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ csrf_token: "synthetic-csrf" }))
      .mockImplementationOnce((_path: string, options: RequestInit) =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => new Promise<never>(() => {}),
          get bodyUsed() {
            return false;
          },
          signal: (requestSignal = options.signal as AbortSignal),
        } as unknown as Response),
      );
    vi.stubGlobal("fetch", fetch);

    const pending = api("/api/clinic/observations", {
      method: "POST",
      body: { request_key: "synthetic" },
    });
    const rejected = expect(pending).rejects.toMatchObject({
      status: 504,
      code: "outcome_unconfirmed",
    });
    await vi.advanceTimersByTimeAsync(30_000);

    await rejected;
    expect(requestSignal?.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("treats a malformed successful mutation response as uncertain without replay", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ csrf_token: "synthetic-csrf" }))
      .mockResolvedValueOnce(
        new Response("{not-json", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetch);

    await expect(
      api("/api/clinic/observations", {
        method: "POST",
        body: { request_key: "synthetic" },
      }),
    ).rejects.toMatchObject({ status: 502, code: "outcome_unconfirmed" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("rejects an old actor response before reading its body", async () => {
    setApiActor(41);
    let release!: (response: Response) => void;
    const readBody = vi.fn().mockResolvedValue({ id: 7 });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ csrf_token: "synthetic-csrf" }))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            release = resolve;
          }),
      );
    vi.stubGlobal("fetch", fetch);

    const pending = api("/api/clinic/patients/7");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    setApiActor(84);
    release({ ok: true, status: 200, json: readBody } as unknown as Response);

    await expect(pending).rejects.toMatchObject({
      status: 409,
      code: "session_changed",
    });
    expect(readBody).not.toHaveBeenCalled();
    expect(fetch.mock.calls[1][1].headers["X-Clinic-Actor"]).toBe("41");
  });
  it("reuses the initial CSRF bootstrap when binding the current session actor", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ csrf_token: "initial" }))
      .mockResolvedValueOnce(json({ id: 7 }));
    vi.stubGlobal("fetch", fetch);

    await csrf();
    setApiActor(41);
    await api("/api/clinic/patients/7");

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1].headers).toMatchObject({
      "X-Clinic-Actor": "41",
    });
  });
  it("uses a new CSRF token after account/session rotation or logout", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ csrf_token: "before" }))
      .mockResolvedValueOnce(json({ user: { id: 1 } }))
      .mockResolvedValueOnce(json({ csrf_token: "after" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json({ csrf_token: "signed-out" }))
      .mockResolvedValueOnce(json({ received: true }));
    vi.stubGlobal("fetch", fetch);
    await api("/api/session", { method: "POST", body: {} });
    await api("/api/session", { method: "DELETE" });
    await api("/api/contact_messages", { method: "POST", body: {} });
    expect(fetch.mock.calls.filter((c) => c[0] === "/api/csrf")).toHaveLength(
      3,
    );
  });
  it("uses a new CSRF token after a demo lesson rotates its session", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ csrf_token: "before" }))
      .mockResolvedValueOnce(json({ run: { id: 1 } }, 201))
      .mockResolvedValueOnce(json({ csrf_token: "after" }))
      .mockResolvedValueOnce(json({ run: { id: 1 } }));
    vi.stubGlobal("fetch", fetch);

    await api("/api/demo/lesson", {
      method: "POST",
      body: { lesson_key: "navigation_tour" },
    });
    await api("/api/demo/lesson/complete", { method: "POST", body: {} });

    expect(fetch.mock.calls[3][1].headers["X-CSRF-Token"]).toBe("after");
  });
  it("returns safe API failures and rejects off-origin targets", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ csrf_token: "initialized" }))
      .mockResolvedValueOnce(json({ error: "Please sign in." }, 401));
    vi.stubGlobal("fetch", fetch);
    await expect(api("/api/clinic")).rejects.toEqual(
      new ApiError(401, "Please sign in."),
    );
    await expect(api("https://example.invalid/api/session")).rejects.toThrow(
      "same-origin",
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
describe("form contracts", () => {
  it("keeps exact quantities as strings, nested Rails scopes and explicit consent", () => {
    const form = new FormData();
    form.set("clinic_pharmacy_product[name]", "Fictional product");
    form.set("batch[lot_number]", "EXAMPLE");
    form.set("amount", "0.000001");
    form.set("consent", "on");
    expect(formBody(form)).toEqual({
      clinic_pharmacy_product: { name: "Fictional product" },
      batch: { lot_number: "EXAMPLE" },
      amount: "0.000001",
      consent: true,
    });
  });
  it("does not treat an absent consent checkbox as agreement", () => {
    expect(formBody(new FormData())).not.toHaveProperty("consent");
  });
  it("only resumes known local destinations", () => {
    expect(loginDestination("/clinic/pharmacy")).toBe("/portal");
    expect(loginDestination("/clinic")).toBe("/clinic");
    expect(loginDestination("/clinic/setup")).toBe("/clinic/setup");
    for (const path of [
      "//example.invalid",
      "https://example.invalid",
      "/signup",
      null,
    ])
      expect(loginDestination(path)).toBe("/portal");
  });
  it("keeps only supported values in a login return query", () => {
    expect(
      loginDestination(
        "/clinic/patients/7/encounters/9?patient_id=7&encounter_id=9&page=2&visit_modality=video&mode=current&next=https%3A%2F%2Fexample.invalid&patient_id_override=8",
      ),
    ).toBe(
      "/clinic/patients/7/encounters/9?patient_id=7&encounter_id=9&page=2&visit_modality=video&mode=current",
    );
    expect(
      loginDestination(
        "/clinic?patient_id=0&encounter_id=9007199254740992&invoice_payment=other&mode=future&next=%2F%2Fexample.invalid",
      ),
    ).toBe("/clinic");
    expect(
      loginDestination(
        "//example.invalid/clinic?patient_id=7&visit_modality=video",
      ),
    ).toBe("/portal");
  });
});
