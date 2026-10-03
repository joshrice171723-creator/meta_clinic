import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  announceClinicLocationChange,
  api,
  clearCsrf,
  CLINIC_LOCATION_CHANGED_EVENT,
  clinicRealtimeSession,
  SESSION_CHANGED_EVENT,
  setApiActor,
  setClinicPractice,
  setClinicSite,
  watchClinicLocationChanges,
} from "../src/api/client";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
let events: EventTarget;
let stopWatching: (() => void) | undefined;
class Channel {
  static current: Channel;
  onmessage?: (event: { data: unknown }) => void;
  postMessage = vi.fn();
  close = vi.fn();
  constructor(public name: string) {
    Channel.current = this;
  }
}
beforeEach(() => {
  setApiActor(undefined);
  clearCsrf();
  setApiActor(71);
  setClinicPractice(81);
  setClinicSite(101);
  events = Object.assign(new EventTarget(), {
    location: { pathname: "/clinic" },
  });
  vi.stubGlobal("window", events);
  vi.stubGlobal("BroadcastChannel", Channel);
});
afterEach(() => {
  stopWatching?.();
  stopWatching = undefined;
  vi.unstubAllGlobals();
});

describe("clinic location transport ownership", () => {
  it("captures the site fence and rejects a W response after switching to B", async () => {
    const response = deferred<Response>();
    const read = vi.fn().mockResolvedValue({ source: "W" });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ csrf_token: "test" }))
      .mockReturnValueOnce(response.promise);
    vi.stubGlobal("fetch", fetch);
    const pending = api("/api/clinic/patients/7");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch.mock.calls[1][1].headers).toMatchObject({
      "X-Clinic-Actor": "71",
      "X-Clinic-Practice": "81",
      "X-Clinic-Site": "101",
    });
    setClinicSite(102);
    response.resolve({
      ok: true,
      status: 200,
      json: read,
    } as unknown as Response);
    await expect(pending).rejects.toMatchObject({ code: "session_changed" });
    expect(read).not.toHaveBeenCalled();
    expect(clinicRealtimeSession().headers["X-Clinic-Site"]).toBe("102");
  });

  it("rejects an old save even if the location changes during response-body parsing", async () => {
    const body = deferred<unknown>();
    const read = vi.fn(() => body.promise);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ csrf_token: "test" }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: read });
    vi.stubGlobal("fetch", fetch);
    const pending = api("/api/clinic/encounters/7/notes", {
      method: "POST",
      body: { request_key: "original" },
    });
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
    setClinicSite(102);
    setClinicSite(101);
    body.resolve({ saved: true });
    await expect(pending).rejects.toMatchObject({ code: "session_changed" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("separates a location denial from account invalidation, blocks later writes, and never replays", async () => {
    const locationChanged = vi.fn();
    const sessionChanged = vi.fn();
    events.addEventListener(CLINIC_LOCATION_CHANGED_EVENT, locationChanged);
    events.addEventListener(SESSION_CHANGED_EVENT, sessionChanged);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ csrf_token: "test" }))
      .mockResolvedValueOnce(
        json({ code: "clinic_site_changed", error: "Location changed" }, 409),
      )
      .mockResolvedValueOnce(json({ current_site: { id: 102 } }));
    vi.stubGlobal("fetch", fetch);
    await expect(
      api("/api/clinic/encounters/7/notes", {
        method: "POST",
        body: { request_key: "original", text: "retained in editor" },
      }),
    ).rejects.toMatchObject({ code: "clinic_site_changed" });
    await expect(
      api("/api/clinic/encounters/7/notes", {
        method: "POST",
        body: { request_key: "different" },
      }),
    ).rejects.toMatchObject({ code: "clinic_site_changed" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(locationChanged).toHaveBeenCalledOnce();
    expect(sessionChanged).not.toHaveBeenCalled();
    expect(clinicRealtimeSession().enabled).toBe(false);
    await expect(api("/api/clinic/context")).resolves.toEqual({
      current_site: { id: 102 },
    });
    setClinicSite(102);
    expect(clinicRealtimeSession().enabled).toBe(true);
    fetch.mockResolvedValueOnce(json({ saved: true }));
    await api("/api/clinic/encounters/7/notes", {
      method: "POST",
      body: { request_key: "original" },
    });
    expect(fetch.mock.calls[3][1].headers["X-Clinic-Site"]).toBe("102");
  });

  it("does not invalidate a request when rebinding its unchanged site", async () => {
    const body = deferred<unknown>();
    const read = vi.fn(() => body.promise);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json({ csrf_token: "test" }))
        .mockResolvedValueOnce({ ok: true, status: 200, json: read }),
    );
    const pending = api("/api/clinic/patients/7");
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
    setClinicSite(101);
    body.resolve({ id: 7 });
    await expect(pending).resolves.toEqual({ id: 7 });
  });
});

describe("cross-window location invalidation", () => {
  it("permits only the exact saved encounter recovery read and keeps all writes fenced", async () => {
    stopWatching = watchClinicLocationChanges();
    Channel.current.onmessage?.({
      data: { type: "location_changed", actor_id: 71, practice_id: 81 },
    });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ csrf_token: "test" }))
      .mockResolvedValueOnce(json({ encounter: { id: 8, patient_id: 7 } }));
    vi.stubGlobal("fetch", fetch);
    await expect(
      api("/api/clinic/encounters/8?patient_id=7", {
        locationRecoverySiteId: 102,
      }),
    ).resolves.toEqual({ encounter: { id: 8, patient_id: 7 } });
    expect(fetch.mock.calls[1][1].headers["X-Clinic-Site"]).toBe("102");
    expect(clinicRealtimeSession().enabled).toBe(false);
    await expect(
      api("/api/clinic/encounters/8/notes", {
        method: "POST",
        locationRecoverySiteId: 102,
      }),
    ).rejects.toThrow("only supports a saved encounter read");
    await expect(
      api("/api/clinic/patients/7", { locationRecoverySiteId: 102 }),
    ).rejects.toThrow("only supports a saved encounter read");
    await expect(
      api("/api/clinic/encounters/8?patient_id=7", {
        locationRecoverySiteId: -1,
      }),
    ).rejects.toThrow("only supports a saved encounter read");
    await expect(
      api("/api/clinic/encounters/8/notes", { method: "POST" }),
    ).rejects.toMatchObject({ code: "clinic_site_changed" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("rejects delayed reconciliation when another location changes while already fenced", async () => {
    stopWatching = watchClinicLocationChanges();
    const change = () =>
      Channel.current.onmessage?.({
        data: { type: "location_changed", actor_id: 71, practice_id: 81 },
      });
    change();
    const body = deferred<unknown>();
    const read = vi.fn(() => body.promise);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ csrf_token: "test" }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: read });
    vi.stubGlobal("fetch", fetch);
    const pending = api("/api/clinic/encounters/8?patient_id=7", {
      locationRecoverySiteId: 102,
    });
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
    change();
    body.resolve({ encounter: { id: 8, patient_id: 7 } });
    await expect(pending).rejects.toMatchObject({ code: "session_changed" });
    await expect(
      api("/api/clinic/encounters/8/notes", { method: "POST" }),
    ).rejects.toMatchObject({ code: "clinic_site_changed" });
  });
  it("retains the fence after the server denies a saved source location recovery read", async () => {
    stopWatching = watchClinicLocationChanges();
    Channel.current.onmessage?.({
      data: { type: "location_changed", actor_id: 71, practice_id: 81 },
    });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ csrf_token: "test" }))
      .mockResolvedValueOnce(json({ error: "Source location denied" }, 403));
    vi.stubGlobal("fetch", fetch);
    await expect(
      api("/api/clinic/encounters/8?patient_id=7", {
        locationRecoverySiteId: 102,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      api("/api/clinic/encounters/8/notes", { method: "POST" }),
    ).rejects.toMatchObject({ code: "clinic_site_changed" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("publishes context metadata only and closes its listener with the workspace", () => {
    stopWatching = watchClinicLocationChanges();
    announceClinicLocationChange();
    expect(Channel.current.postMessage).toHaveBeenCalledWith({
      type: "location_changed",
      actor_id: 71,
      practice_id: 81,
    });
    stopWatching?.();
    stopWatching = undefined;
    expect(Channel.current.close).toHaveBeenCalledOnce();
  });
  it("ignores other actors/practices and invalidates delayed reads for the same context", async () => {
    const body = deferred<unknown>();
    const read = vi.fn(() => body.promise);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json({ csrf_token: "test" }))
        .mockResolvedValueOnce({ ok: true, status: 200, json: read }),
    );
    stopWatching = watchClinicLocationChanges();
    const changed = vi.fn();
    events.addEventListener(CLINIC_LOCATION_CHANGED_EVENT, changed);
    Channel.current.onmessage?.({
      data: { type: "location_changed", actor_id: 72, practice_id: 81 },
    });
    Channel.current.onmessage?.({
      data: { type: "location_changed", actor_id: 71, practice_id: 82 },
    });
    Channel.current.onmessage?.({ data: null });
    expect(changed).not.toHaveBeenCalled();
    const pending = api("/api/clinic/patients/7");
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
    Channel.current.onmessage?.({
      data: { type: "location_changed", actor_id: 71, practice_id: 81 },
    });
    expect(changed).toHaveBeenCalledOnce();
    body.resolve({ stale: true });
    await expect(pending).rejects.toMatchObject({ code: "session_changed" });
    await expect(
      api("/api/clinic/appointments", { method: "POST" }),
    ).rejects.toMatchObject({ code: "clinic_site_changed" });
  });
});
