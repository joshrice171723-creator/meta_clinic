import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  api,
  ApiError,
  clearCsrf,
  csrf,
  formBody,
  loginDestination,
} from "../src/api/client";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
beforeEach(() => clearCsrf());
afterEach(() => vi.unstubAllGlobals());

describe("same-origin API boundary", () => {
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
    for (const path of [
      "//example.invalid",
      "https://example.invalid",
      "/signup",
      null,
    ])
      expect(loginDestination(path)).toBe("/portal");
  });
});
