import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Effect = {
  deps?: readonly unknown[];
  next?: () => void | (() => void);
  cleanup?: () => void;
};
const hooks = vi.hoisted(() => ({
  cursor: 0,
  refCursor: 0,
  memoCursor: 0,
  effectCursor: 0,
  states: [] as { value: any }[],
  refs: [] as { current: any }[],
  memos: [] as { deps: readonly unknown[]; value: any }[],
  effects: [] as Effect[],
  api: vi.fn(),
}));
const sameDeps = (before?: readonly unknown[], after?: readonly unknown[]) =>
  before?.length === after?.length &&
  before?.every((value, index) => Object.is(value, after?.[index]));
vi.mock("react", () => ({
  useState: (initial: any) => {
    const slot = (hooks.states[hooks.cursor++] ??= {
      value: typeof initial === "function" ? initial() : initial,
    });
    return [
      slot.value,
      (value: any) => {
        slot.value = typeof value === "function" ? value(slot.value) : value;
      },
    ];
  },
  useRef: (initial: any) =>
    (hooks.refs[hooks.refCursor++] ??= { current: initial }),
  useCallback: (callback: any, deps: readonly unknown[]) => {
    const index = hooks.memoCursor++;
    if (!sameDeps(hooks.memos[index]?.deps, deps))
      hooks.memos[index] = { deps, value: callback };
    return hooks.memos[index].value;
  },
  useEffect: (effect: () => void | (() => void), deps: readonly unknown[]) => {
    const slot = (hooks.effects[hooks.effectCursor++] ??= {});
    if (!sameDeps(slot.deps, deps)) {
      slot.deps = deps;
      slot.next = effect;
    }
  },
}));
vi.mock("../src/api/client", async (original) => ({
  ...(await original<typeof import("../src/api/client")>()),
  api: (...args: any[]) => hooks.api(...args),
}));
import { ApiError } from "../src/api/client";
import { useWorkingDraft } from "../src/features/clinic/useWorkingDraft";

function render(siteId: number) {
  hooks.cursor = hooks.refCursor = hooks.memoCursor = hooks.effectCursor = 0;
  const result = useWorkingDraft<{ text: string }>({
    kind: "appointment",
    siteId,
  });
  for (const effect of hooks.effects) {
    if (!effect.next) continue;
    effect.cleanup?.();
    const execute = effect.next;
    effect.next = undefined;
    effect.cleanup = execute() || undefined;
  }
  return result;
}
function response(
  siteId: number,
  payload: { text: string } | null,
  version = 0,
) {
  return {
    kind: "appointment",
    patient_id: null,
    encounter_id: null,
    record_id: null,
    site_id: siteId,
    scope: "main",
    payload,
    version,
    updated_at: null,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}
beforeEach(() => {
  hooks.states = [];
  hooks.refs = [];
  hooks.memos = [];
  hooks.effects = [];
  hooks.api.mockReset();
});
afterEach(() => {
  for (const effect of hooks.effects) effect.cleanup?.();
});

describe("site-owned appointment working copies", () => {
  it("ignores a delayed W draft after B renders and rejects old draft callbacks", async () => {
    const old = deferred<unknown>();
    hooks.api
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(response(102, { text: "B draft" }, 3));
    const oldDraft = render(101);
    const switched = render(102);
    expect(switched.restored).toBeNull();
    expect(switched.ready).toBe(false);
    await vi.waitFor(() =>
      expect(render(102).restored).toEqual({ text: "B draft" }),
    );
    old.resolve(response(101, { text: "W delayed" }, 9));
    await Promise.resolve();
    expect(render(102).version).toBe(3);
    expect(await oldDraft.save({ text: "do not cross sites" })).toBe(false);
    expect(hooks.api.mock.calls.map(([path]) => path)).toEqual([
      "/api/clinic/working_drafts/appointment?site_id=101",
      "/api/clinic/working_drafts/appointment?site_id=102",
    ]);
  });

  it("preserves independent saved W and B copies through W to B to W", async () => {
    const copies = new Map<number, ReturnType<typeof response>>([
      [101, response(101, { text: "W original" }, 2)],
      [102, response(102, { text: "B original" }, 5)],
    ]);
    hooks.api.mockImplementation(async (path: string, options?: any) => {
      const site = Number(
        new URL(path, "https://apply.test").searchParams.get("site_id"),
      );
      const stored = copies.get(site)!;
      if (options?.method === "PUT") {
        expect(options.body.expected_version).toBe(stored.version);
        copies.set(
          site,
          response(site, options.body.payload, stored.version + 1),
        );
      }
      return copies.get(site);
    });
    render(101);
    await vi.waitFor(() => expect(render(101).ready).toBe(true));
    expect(await render(101).save({ text: "W edited" })).toBe(true);
    render(102);
    await vi.waitFor(() =>
      expect(render(102).restored).toEqual({ text: "B original" }),
    );
    expect(await render(102).save({ text: "B edited" })).toBe(true);
    render(101);
    await vi.waitFor(() =>
      expect(render(101).restored).toEqual({ text: "W edited" }),
    );
    expect(copies.get(102)?.payload).toEqual({ text: "B edited" });
  });

  it("does not accept an old save completion into the new site's version or state", async () => {
    const save = deferred<unknown>();
    hooks.api
      .mockResolvedValueOnce(response(101, null, 2))
      .mockReturnValueOnce(save.promise)
      .mockResolvedValueOnce(response(102, { text: "B own" }, 8));
    render(101);
    await vi.waitFor(() => expect(render(101).ready).toBe(true));
    const pending = render(101).save({ text: "W saved" });
    await vi.waitFor(() => expect(hooks.api).toHaveBeenCalledTimes(2));
    render(102);
    await vi.waitFor(() => expect(render(102).ready).toBe(true));
    save.resolve(response(101, { text: "W saved" }, 3));
    expect(await pending).toBe(false);
    expect(render(102)).toMatchObject({
      version: 8,
      restored: { text: "B own" },
    });
  });

  it("rejects a recovery payload whose saved site differs from its explicit query scope", async () => {
    hooks.api.mockResolvedValue(response(102, { text: "wrong site" }, 2));
    render(101);
    await vi.waitFor(() => expect(render(101).status).toBe("error"));
    expect(render(101).restored).toBeNull();
    expect(await render(101).save({ text: "do not overwrite" })).toBe(false);
    expect(hooks.api).toHaveBeenCalledOnce();
  });

  it("reconciles a committed lost-response copy before replacing it and blocks a concurrent revision", async () => {
    hooks.api
      .mockResolvedValueOnce(response(101, null, 4))
      .mockRejectedValueOnce(
        new ApiError(504, "Unconfirmed", "outcome_unconfirmed"),
      )
      .mockResolvedValueOnce(response(101, { text: "older snapshot" }, 5))
      .mockResolvedValueOnce(response(101, { text: "replacement" }, 6));
    render(101);
    await vi.waitFor(() => expect(render(101).ready).toBe(true));
    expect(await render(101).save({ text: "older snapshot" })).toBe(false);
    expect(await render(101).save({ text: "replacement" })).toBe(true);
    expect(hooks.api.mock.calls[3][1].body).toEqual({
      expected_version: 5,
      payload: { text: "replacement" },
    });
    hooks.api.mockRejectedValueOnce(
      new ApiError(409, "Another window changed this copy", "draft_conflict"),
    );
    expect(await render(101).save({ text: "conflicting edit" })).toBe(false);
    const count = hooks.api.mock.calls.length;
    expect(render(101).status).toBe("conflict");
    expect(await render(101).clear()).toBe(false);
    expect(hooks.api).toHaveBeenCalledTimes(count);
  });
});
