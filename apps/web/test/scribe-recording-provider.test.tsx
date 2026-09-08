import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScribeRecordingSessionInput } from "../src/features/scribe/ScribeRecordingProvider";

type StateSlot = {
  value: unknown;
  setter: ReturnType<typeof vi.fn>;
};

const hooks = vi.hoisted(() => ({
  stateCursor: 0,
  refCursor: 0,
  states: [] as StateSlot[],
  refs: [] as { current: unknown }[],
}));

const apiMock = vi.hoisted(() => vi.fn());

vi.mock("react", () => ({
  createContext: (initial: unknown) => ({ initial }),
  useCallback: <T,>(callback: T) => callback,
  useContext: () => null,
  useEffect: () => undefined,
  useMemo: <T,>(factory: () => T) => factory(),
  useRef: <T,>(initial: T) => {
    const index = hooks.refCursor++;
    hooks.refs[index] ??= { current: initial };
    return hooks.refs[index] as { current: T };
  },
  useState: <T,>(initial: T | (() => T)) => {
    const index = hooks.stateCursor++;
    if (!hooks.states[index]) {
      const slot: StateSlot = {
        value: typeof initial === "function" ? (initial as () => T)() : initial,
        setter: vi.fn((next: T | ((current: T) => T)) => {
          slot.value =
            typeof next === "function"
              ? (next as (current: T) => T)(slot.value as T)
              : next;
        }),
      };
      hooks.states[index] = slot;
    }
    const slot = hooks.states[index];
    return [slot.value as T, slot.setter] as const;
  },
}));

vi.mock("react/jsx-runtime", () => ({
  Fragment: Symbol("Fragment"),
  jsx: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
  jsxs: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
}));

vi.mock("../src/api/client", () => ({ api: apiMock }));
vi.mock("../src/features/clinic/clinicNavigation", () => ({
  useClinicNavigation: () => ({ navigate: vi.fn(() => true) }),
}));
vi.mock("../src/features/scribe/ScribeRecordingControls", () => ({
  ScribeRecordingControls: () => null,
}));

import {
  ScribeRecordingProvider,
  type PersistentScribeValue,
} from "../src/features/scribe/ScribeRecordingProvider";

function renderProvider() {
  hooks.stateCursor = 0;
  hooks.refCursor = 0;
  const element = ScribeRecordingProvider({ children: null }) as unknown as {
    props: { value: PersistentScribeValue };
  };
  return element.props.value;
}

function session(
  overrides: Partial<ScribeRecordingSessionInput> = {},
): ScribeRecordingSessionInput {
  return {
    encounterId: 73,
    encounterVersion: 4,
    processingAllowed: true,
    scopeKey: "telehealth:visit-1:2:0",
    patientLabel: "Telehealth encounter",
    contextContent: "Saved baseline",
    presentation: "in_call",
    telehealthVisitPublicId: "visit-1",
    deferProcessing: true,
    ...overrides,
  };
}

async function establishConflict() {
  let provider = renderProvider();
  expect(provider.begin(session(), { startRecording: false })).toBe(true);
  provider = renderProvider();
  provider.setContextValue("My typed context");
  provider = renderProvider();

  apiMock
    .mockRejectedValueOnce(new Error("version conflict"))
    .mockResolvedValueOnce({
      encounter: { version: 9, context_content: "Latest saved context" },
    });

  await expect(provider.saveContext()).resolves.toBe(false);
  return renderProvider();
}

beforeEach(() => {
  hooks.stateCursor = 0;
  hooks.refCursor = 0;
  hooks.states = [];
  hooks.refs = [];
  vi.clearAllMocks();
});

describe("persistent Scribe context and remount recovery", () => {
  it("uses the latest saved context and its authoritative encounter version", async () => {
    let provider = await establishConflict();
    expect(provider.contextValue).toBe("My typed context");
    expect(provider.latestSavedContext).toBe("Latest saved context");
    expect(provider.contextError).toContain("changed elsewhere");

    provider.useLatestSavedContext();
    provider = renderProvider();
    expect(provider.contextValue).toBe("Latest saved context");
    expect(provider.contextDirty).toBe(false);
    expect(provider.latestSavedContext).toBeNull();
    expect(provider.contextError).toBeNull();

    provider.setContextValue("Edited after adopting latest");
    provider = renderProvider();
    apiMock.mockResolvedValueOnce({
      encounter: {
        version: 10,
        context_content: "Edited after adopting latest",
      },
    });
    await expect(provider.saveContext()).resolves.toBe(true);

    expect(apiMock).toHaveBeenLastCalledWith(
      "/api/clinic/scribe/encounters/73/context",
      expect.objectContaining({
        method: "PATCH",
        body: {
          context: expect.objectContaining({
            content: "Edited after adopting latest",
            expected_version: 9,
          }),
        },
      }),
    );
  });

  it("keeps typed context while rebasing its next save on the latest version", async () => {
    let provider = await establishConflict();
    provider.keepTypedContext();
    provider = renderProvider();

    expect(provider.contextValue).toBe("My typed context");
    expect(provider.contextDirty).toBe(true);
    expect(provider.latestSavedContext).toBeNull();
    expect(provider.contextError).toBeNull();

    apiMock.mockResolvedValueOnce({
      encounter: { version: 10, context_content: "My typed context" },
    });
    await expect(provider.saveContext()).resolves.toBe(true);
    expect(apiMock).toHaveBeenLastCalledWith(
      "/api/clinic/scribe/encounters/73/context",
      expect.objectContaining({
        body: {
          context: expect.objectContaining({ expected_version: 9 }),
        },
      }),
    );
  });

  it("preserves the finalized callback when an in-call remount re-registers the encounter", () => {
    const finalized = vi.fn();
    let provider = renderProvider();
    provider.begin(session({ onSegmentFinalized: finalized }), {
      startRecording: true,
    });
    provider = renderProvider();

    const remountInput = session({ encounterVersion: 5 });
    expect(Object.hasOwn(remountInput, "onSegmentFinalized")).toBe(false);
    expect(provider.begin(remountInput, { startRecording: false })).toBe(true);
    provider = renderProvider();

    expect(provider.session?.encounterVersion).toBe(5);
    expect(provider.session?.onSegmentFinalized).toBe(finalized);
  });
});
