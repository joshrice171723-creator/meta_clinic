import { isValidElement, type ReactNode } from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  Patients,
  PatientRegistrationForm,
  registrationIdentitySignature,
} from "../src/features/clinic/Patients";
import { ApiError } from "../src/api/client";
import { createdPath } from "../src/shared/ui";

// Execute real form/dialog handlers with synthetic hook state and in-memory APIs.
// No browser, clinical record, server, or network request is used.
const harness = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as any[],
  api: vi.fn(),
  save: vi.fn(),
  clear: vi.fn(),
  restored: null as any,
  success: vi.fn(),
  creating: false,
  reviewedIdentity: null as string | null,
  reviewIdentity: vi.fn(),
  resourceData: null as any,
  canEdit: true,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: any) {
    const index = harness.cursor++;
    if (!(index in harness.slots))
      harness.slots[index] =
        typeof initial === "function" ? initial() : initial;
    return [
      harness.slots[index],
      (value: any) => {
        harness.slots[index] =
          typeof value === "function" ? value(harness.slots[index]) : value;
      },
    ];
  },
  useRef(initial: any) {
    const index = harness.cursor++;
    return (harness.slots[index] ??= { current: initial });
  },
  useMemo: (factory: () => unknown) => factory(),
  useEffect: () => undefined,
}));
vi.mock("react-dom", async (original) => ({
  ...(await original<typeof import("react-dom")>()),
  flushSync: (callback: () => void) => callback(),
}));
vi.mock("../src/api/client", async (original) => ({
  ...(await original<typeof import("../src/api/client")>()),
  api: harness.api,
}));
vi.mock("../src/features/clinic/useWorkingDraft", () => ({
  useWorkingDraft: () => ({
    ready: true,
    restored: harness.restored,
    status: "idle",
    error: "",
    save: harness.save,
    clear: harness.clear,
    reload: vi.fn(),
  }),
}));
vi.mock("../src/features/clinic/clinicNavigation", () => ({
  useClinicNavigation: () => ({ registerBlocker: () => () => undefined }),
}));
vi.mock("../src/features/clinic/Workspace", () => ({
  useClinic: () => ({
    sites: [],
    capabilities: { patients_write: harness.canEdit },
  }),
}));
vi.mock("../src/shared/ui", async (original) => ({
  ...(await original<typeof import("../src/shared/ui")>()),
  useResource: () => ({
    data: harness.resourceData ?? {
      patient: {
        id: 701,
        display_name: "Synthetic Patient",
        reference: "SYN-701",
      },
    },
    refresh: vi.fn(),
  }),
}));

const patient = {
  id: 701,
  display_name: "Synthetic Patient",
  reference: "SYN-701",
  updated_at: "2026-09-30T12:00:00Z",
} as any;
const values = {
  display_name: "Synthetic Patient",
  legal_name: "Synthetic Patient",
  contact_type: "phone",
  reference: "SYN-701",
  primary_address_original: "Old synthetic address",
  address_line1: "",
  sex: "unknown",
};
function nodes(node: ReactNode): any[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<any>(node)) return [];
  const props = node.props as Record<string, any>;
  return [props, ...nodes(props.children)];
}
function editor() {
  harness.cursor = 0;
  const element = PatientRegistrationForm({
    patient: harness.creating ? undefined : patient,
    onSuccess: harness.success,
    reviewedIdentity: harness.reviewedIdentity,
    onIdentityReviewRequired: harness.creating
      ? harness.reviewIdentity
      : undefined,
  }) as any;
  return nodes(element.type(element.props));
}
function form() {
  return editor().find(
    (props) => props.component === "form" && props.onSubmit,
  )!;
}
const fakeForm = { reset: vi.fn(), querySelector: () => null };
function submit() {
  return form().onSubmit({ preventDefault() {}, currentTarget: fakeForm });
}
function record() {
  harness.cursor = 0;
  const element = Patients({ id: "701" }) as any;
  return nodes(element.type(element.props));
}
beforeEach(() => {
  harness.cursor = 0;
  harness.slots = [];
  harness.restored = null;
  harness.creating = false;
  harness.reviewedIdentity = null;
  harness.reviewIdentity.mockReset();
  harness.resourceData = null;
  harness.canEdit = true;
  harness.api.mockReset();
  harness.save.mockReset().mockResolvedValue(true);
  harness.clear.mockReset().mockResolvedValue(true);
  harness.success.mockReset();
  vi.stubGlobal("window", {
    location: { search: "", assign: vi.fn() },
    clearTimeout: vi.fn(),
    setTimeout: vi.fn(),
  });
  vi.stubGlobal(
    "FormData",
    class {
      *[Symbol.iterator]() {
        yield* Object.entries(values).map(([key, value]) => [
          `clinic_patient[${key}]`,
          value,
        ]);
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("218 registration uncertain outcome", () => {
  it("preserves the exact frozen request across loss, denial, retry and success", async () => {
    harness.api
      .mockRejectedValueOnce(new ApiError(0, "Lost", "outcome_unconfirmed"))
      .mockRejectedValueOnce(new ApiError(403, "Denied"))
      .mockResolvedValueOnce({ patient, request_key: "owned" });
    await submit();
    expect(
      editor().some((props) => props.children === "Retry same request"),
    ).toBe(true);
    await submit();
    expect(
      editor().find((props) => props.component === "fieldset").disabled,
    ).toBe(true);
    expect(
      editor().some((props) => props.children === "Retry same request"),
    ).toBe(true);
    await submit();
    const bodies = harness.api.mock.calls.map((call) => call[1].body);
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
    expect(harness.clear).toHaveBeenCalledTimes(1);
    expect(harness.success).toHaveBeenCalledTimes(1);
  });
  it("keeps a restored pending working copy frozen after denial", async () => {
    harness.restored = {
      body: {
        clinic_patient: { ...values, request_key: "synthetic-restored" },
      },
      requestKey: "synthetic-restored",
      pending: true,
      outcomeUnconfirmed: true,
    };
    harness.api.mockRejectedValueOnce(new ApiError(403, "Denied"));
    await submit();
    expect(
      editor().find((props) => props.component === "fieldset").disabled,
    ).toBe(true);
    expect(harness.save.mock.calls.at(-1)?.[0].requestKey).toBe(
      "synthetic-restored",
    );
    expect(harness.clear).not.toHaveBeenCalled();
  });
  it("keeps fresh deterministic denial editable", async () => {
    harness.api.mockRejectedValueOnce(new ApiError(403, "Denied"));
    await submit();
    expect(
      editor().find((props) => props.component === "fieldset").disabled,
    ).toBe(false);
  });
});

describe("219 registration dialog dismissal", () => {
  function openWith(saving: boolean, pending: boolean) {
    record()
      .find((props) => props.children === "Edit registration")
      .onClick();
    const container = record().find((props) => props.ref && props.dividers);
    container.ref.current = {
      querySelector: (selector: string) =>
        (selector === "fieldset[disabled]" && (saving || pending)) ||
        (selector.includes("saving") && saving) ||
        (selector.includes("pending") && pending)
          ? {}
          : null,
    };
    return record().find((props) => props.onClose && props.maxWidth === "md");
  }
  it.each(["escape", "cancel"])(
    "%s closes an unresolved dialog without clearing its working copy",
    (action) => {
      const dialog = openWith(false, true);
      if (action === "escape") dialog.onClose();
      else
        nodes(dialog.children)
          .find((props) => props.children === "Cancel")
          .onClick();
      expect(
        record().find((props) => props.onClose && props.maxWidth === "md").open,
      ).toBe(false);
      expect(harness.clear).not.toHaveBeenCalled();
      expect(harness.api).not.toHaveBeenCalled();
      record()
        .find((props) => props.children === "Edit registration")
        .onClick();
      expect(
        record().find((props) => props.onClose && props.maxWidth === "md").open,
      ).toBe(true);
    },
  );
  it("keeps a genuinely in-flight save protected", () => {
    openWith(true, true).onClose();
    expect(
      record().find((props) => props.onClose && props.maxWidth === "md").open,
    ).toBe(true);
  });
});

describe("131 retained clearing fix", () => {
  it("submits a cleared address instead of resurrecting its original value", async () => {
    harness.api.mockResolvedValueOnce({ patient });
    await submit();
    expect(
      harness.api.mock.calls[0][1].body.clinic_patient.primary_address,
    ).toBe("");
    expect(harness.api.mock.calls[0][1].body.clinic_patient).not.toHaveProperty(
      "primary_address_original",
    );
  });
});

describe("245 current patient directory", () => {
  it("uses Open patient for both ordinary and QAGT-shaped synthetic names", () => {
    harness.resourceData = {
      patients: [
        { id: 801, display_name: "QAGT, QAGT", reference: "SYN-801" },
        { id: 802, display_name: "Synthetic Ordinary", reference: "SYN-802" },
      ],
    };
    const links = nodes(Patients({})).filter(
      (props) =>
        props.href?.startsWith("/clinic/patients/") &&
        props.children === "Open patient",
    );
    expect(links.map((props) => props.href)).toEqual([
      "/clinic/patients/801",
      "/clinic/patients/802",
    ]);
    expect(
      nodes(Patients({})).some((props) => props.children === "Open QAGT"),
    ).toBe(false);
  });
});

describe("84 existing duplicate merge controls", () => {
  it("opens the existing merge dialog without executing a merge", () => {
    record()
      .find((props) => props.children === "Merge duplicate")
      .onClick();
    expect(
      record().find((props) => props.onClose && props.maxWidth === "sm").open,
    ).toBe(true);
    expect(harness.api).not.toHaveBeenCalled();
  });
  it("withholds merge controls when the server-projected write capability is absent", () => {
    harness.canEdit = false;
    expect(record().some((props) => props.children === "Merge duplicate")).toBe(
      false,
    );
  });
});

describe("41 current new-registration completion", () => {
  it("reviews identity before POST and redirects only after successful creation", async () => {
    harness.creating = true;
    harness.success.mockImplementation(createdPath("/clinic/patients"));
    await submit();
    expect(harness.reviewIdentity).toHaveBeenCalledTimes(1);
    expect(harness.api).not.toHaveBeenCalled();
    expect(window.location.assign).not.toHaveBeenCalled();
    harness.reviewedIdentity = registrationIdentitySignature(
      harness.reviewIdentity.mock.calls[0][0],
    );
    harness.api.mockResolvedValueOnce({ id: 841, patient: { id: 841 } });
    await submit();
    expect(harness.api).toHaveBeenCalledWith(
      "/api/clinic/patients",
      expect.objectContaining({ method: "POST" }),
    );
    expect(harness.clear).toHaveBeenCalledTimes(1);
    expect(window.location.assign).toHaveBeenCalledWith("/clinic/patients/841");
  });
  it("shows a deterministic creation failure instead of silently completing or redirecting", async () => {
    harness.creating = true;
    harness.success.mockImplementation(createdPath("/clinic/patients"));
    await submit();
    harness.reviewedIdentity = registrationIdentitySignature(
      harness.reviewIdentity.mock.calls[0][0],
    );
    harness.api.mockRejectedValueOnce(
      new ApiError(422, "Synthetic registration rejected"),
    );
    await submit();
    expect(
      editor().some(
        (props) => props.children === "Synthetic registration rejected",
      ),
    ).toBe(true);
    expect(harness.clear).not.toHaveBeenCalled();
    expect(window.location.assign).not.toHaveBeenCalled();
  });
});
