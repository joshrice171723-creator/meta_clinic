import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appointmentDraftRecoveryMessage,
  Schedule,
} from "../src/features/clinic/CareFlow";
import { ApiError } from "../src/api/client";

const mock = vi.hoisted(() => ({
  cursor: 0,
  refCursor: 0,
  states: [] as { value: any; set: (value: any) => void }[],
  refs: [] as { current: any }[],
  restored: null as any,
  scheduled: [] as any[],
  clear: vi.fn(async () => true),
  save: vi.fn(async (_value: any) => true),
  workingDraft: vi.fn(),
  api: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: () => {},
  useMemo: (factory: () => any) => factory(),
  useDeferredValue: (value: any) => value,
  useRef: (value: any) => (mock.refs[mock.refCursor++] ??= { current: value }),
  useState: (initial: any) => {
    const index = mock.cursor++;
    if (!mock.states[index]) {
      const state = {
        value: typeof initial === "function" ? initial() : initial,
        set: (next: any) => {
          state.value = typeof next === "function" ? next(state.value) : next;
        },
      };
      mock.states[index] = state;
    }
    return [mock.states[index].value, mock.states[index].set];
  },
}));
vi.mock("@mui/material", async (original) => ({
  ...(await original<typeof import("@mui/material")>()),
  ...Object.fromEntries(
    ["Box", "Button", "Alert", "TextField", "Stack", "MenuItem"].map((name) => [
      name,
      name,
    ]),
  ),
}));
vi.mock("../src/api/client", async (original) => ({
  ...(await original<typeof import("../src/api/client")>()),
  api: (...args: any[]) => mock.api(...args),
}));
vi.mock("../src/features/clinic/Workspace", () => ({
  useClinic: () => ({
    practice: { timezone: "UTC" },
    capabilities: {
      appointments: true,
      patients: true,
      clinic_setup_write: true,
    },
  }),
}));
vi.mock("../src/features/clinic/clinicNavigation", () => ({
  useClinicNavigation: () => ({ registerBlocker: vi.fn() }),
}));
vi.mock("../src/features/clinic/useWorkingDraft", () => ({
  useWorkingDraft: (input: any) => {
    mock.workingDraft(input);
    return {
      ready: true,
      restored: mock.restored,
      clear: mock.clear,
      save: mock.save,
      reload: vi.fn(),
    };
  },
}));
vi.mock("../src/shared/ui", async (original) => ({
  ...(await original<typeof import("../src/shared/ui")>()),
  useResource: (path: string) => ({
    data: path.includes("type=sites")
      ? { sites: [{ id: 4, code: "SYN", timezone_override: "UTC" }] }
      : path.includes("type=rooms")
        ? { rooms: [{ id: 6, site_id: 4, code: "Room 1", kind: "physical" }] }
        : path.includes("type=visit_types")
          ? { visit_types: [{ id: 2, code: "Synthetic visit" }] }
          : path.includes("/clinicians")
            ? { clinicians: [{ id: 9, display_name: "Synthetic clinician" }] }
            : path.startsWith("/api/clinic/appointments?")
              ? { appointments: mock.scheduled }
              : undefined,
    refresh: vi.fn(),
  }),
}));
const slot = {
  site_id: 4,
  clinician_id: 9,
  room_id: 6,
  starts_at: "2099-10-06T09:30:00Z",
  ends_at: "2099-10-06T10:00:00Z",
};
const patient = {
  id: 801,
  display_name: "Synthetic booking patient",
  reference: "RECOVERY-801",
};
function editableDraft() {
  return {
    draft: {
      patientId: "",
      siteId: "4",
      clinicianId: "9",
      roomId: "",
      visitTypeId: "2",
      startsAt: "2099-10-05T10:00",
      endsAt: "2099-10-05T10:30",
      reason: "",
    },
    attempt: null,
    outcomeUnconfirmed: false,
  };
}
type Element = { type: any; props: any };
function elements(node: any): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  return [
    node,
    ...elements(node.props.children),
    ...elements(node.props.action),
  ];
}
function find(tree: any, predicate: (element: Element) => boolean) {
  const result = elements(tree).find(predicate);
  if (!result) throw new Error("Synthetic booking control was not found");
  return result;
}
const onCreated = vi.fn();
const onClose = vi.fn();
function render(initialSlot: any = slot) {
  mock.cursor = 0;
  mock.refCursor = 0;
  const calendar = Schedule({ search: "" });
  const wrapper = calendar.props.renderBooking(
    initialSlot,
    onCreated,
    vi.fn(),
    vi.fn(),
    onClose,
  );
  const editor = wrapper.type(wrapper.props).props.children[1];
  return editor.type(editor.props);
}
function button(tree: any, text: string) {
  return find(
    tree,
    (element) => element.type === "Button" && element.props.children === text,
  );
}
function field(tree: any, label: string) {
  return find(tree, (element) => element.props.label === label);
}
function form(tree: any) {
  return find(tree, (element) => element.props.component === "form");
}
function choosePatient(tree: any) {
  find(
    tree,
    (element) =>
      typeof element.props.onSelect === "function" && "query" in element.props,
  ).props.onSelect(patient);
}
beforeEach(() => {
  mock.states = [];
  mock.refs = [];
  mock.restored = editableDraft();
  mock.scheduled = [];
  mock.clear.mockReset().mockResolvedValue(true);
  mock.save.mockReset().mockResolvedValue(true);
  mock.api.mockReset();
  mock.workingDraft.mockClear();
  onCreated.mockClear();
  onClose.mockClear();
});

describe("booking recovery and definite rejection controls", () => {
  it("recovers the selected duration after saving and closing with Starts blank", async () => {
    mock.restored = null;
    let tree = render();
    find(
      tree,
      (element) =>
        element.type === "Button" && element.props.children?.[0] === 45,
    ).props.onClick();
    tree = render();
    field(tree, "Starts").props.onChange({ target: { value: "" } });
    tree = render();
    button(tree, "Save as draft").props.onClick();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    const saved = JSON.parse(JSON.stringify(mock.save.mock.calls.at(-1)![0]));
    expect(saved.draft).toMatchObject({
      startsAt: "",
      durationMinutes: 45,
      endTimeEdited: false,
    });

    mock.states = [];
    mock.refs = [];
    mock.restored = saved;
    tree = render();
    field(tree, "Starts").props.onChange({
      target: { value: "2099-10-06T13:00" },
    });
    tree = render();
    expect(field(tree, "Ends").props.value).toBe("2099-10-06T13:45");
    expect(mock.api).not.toHaveBeenCalled();
  });

  it("derives duration from a legacy draft without saved duration metadata", () => {
    mock.restored.draft.endTimeEdited = false;
    mock.restored.draft.endsAt = "2099-10-05T10:45";
    let tree = render();
    field(tree, "Starts").props.onChange({
      target: { value: "2099-10-05T11:00" },
    });
    tree = render();
    expect(field(tree, "Ends").props.value).toBe("2099-10-05T11:45");
  });

  it.runIf(
    Intl.DateTimeFormat().resolvedOptions().timeZone === "America/Chicago",
  )(
    "rejects the pre-existing Chicago fall-back input round trip before submitting",
    async () => {
      mock.restored.draft.startsAt = "2026-11-01T01:45";
      mock.restored.draft.endsAt = "2026-11-01T02:15";
      mock.restored.draft.endTimeEdited = false;
      choosePatient(render());
      let tree = render();
      find(
        tree,
        (element) =>
          element.type === "Button" && element.props.children?.[0] === 45,
      ).props.onClick();
      tree = render();
      const start = field(tree, "Starts").props.value;
      const end = field(tree, "Ends").props.value;
      expect(new Date(start).toISOString()).toBe("2026-11-01T06:45:00.000Z");
      expect(end).toBe("2026-11-01T01:30");
      // The desired elapsed end is 07:30Z (second 01:30). Re-parsing the
      // offset-free native input selects the first 01:30, or 06:30Z.
      expect(new Date(end).toISOString()).toBe("2026-11-01T06:30:00.000Z");
      expect(field(tree, "Ends").props.helperText).toBe(
        "End time must be after the start time.",
      );
      await form(tree).props.onSubmit({ preventDefault: vi.fn() });
      expect(mock.api).not.toHaveBeenCalled();
      expect(mock.save).not.toHaveBeenCalled();
      expect(onCreated).not.toHaveBeenCalled();
    },
  );

  it.each([45, 60])(
    "keeps a chosen %i-minute duration when Starts changes",
    (minutes) => {
      mock.restored = null;
      let tree = render();
      expect(field(tree, "Starts").props.type).toBe("datetime-local");
      expect(field(tree, "Ends").props.type).toBe("datetime-local");
      find(
        tree,
        (element) =>
          element.type === "Button" && element.props.children?.[0] === minutes,
      ).props.onClick();
      tree = render();
      field(tree, "Starts").props.onChange({
        target: { value: "2099-10-06T11:00" },
      });
      tree = render();
      expect(field(tree, "Ends").props.value).toBe(
        `2099-10-06T${minutes === 60 ? "12:00" : "11:45"}`,
      );
      expect(mock.api).not.toHaveBeenCalled();
    },
  );

  it("keeps an explicitly edited end until a duration is chosen again", () => {
    mock.restored = null;
    let tree = render();
    field(tree, "Ends").props.onChange({
      target: { value: "2099-10-06T12:15" },
    });
    tree = render();
    field(tree, "Starts").props.onChange({
      target: { value: "2099-10-06T11:00" },
    });
    tree = render();
    expect(field(tree, "Ends").props.value).toBe("2099-10-06T12:15");
    expect(field(tree, "Ends").props.helperText).toContain(
      "Edited end stays fixed",
    );
    find(
      tree,
      (element) =>
        element.type === "Button" && element.props.children?.[0] === 45,
    ).props.onClick();
    tree = render();
    expect(field(tree, "Ends").props.value).toBe("2099-10-06T11:45");
    field(tree, "Starts").props.onChange({ target: { value: "" } });
    tree = render();
    field(tree, "Starts").props.onChange({
      target: { value: "2099-10-06T13:00" },
    });
    tree = render();
    expect(field(tree, "Ends").props.value).toBe("2099-10-06T13:45");
    expect(mock.api).not.toHaveBeenCalled();
  });

  it("preserves a recovered explicit end when Starts changes", () => {
    mock.restored.draft.endTimeEdited = true;
    let tree = render();
    field(tree, "Starts").props.onChange({
      target: { value: "2099-10-05T10:10" },
    });
    tree = render();
    expect(field(tree, "Ends").props.value).toBe("2099-10-05T10:30");
  });

  it("#223 clears the recovered banner permanently after Start new appointment", async () => {
    let tree = render();
    expect(appointmentDraftRecoveryMessage(mock.restored)).not.toContain(
      "earlier session",
    );
    expect(field(tree, "Starts").props.value).toBe("2099-10-05T10:00");
    await button(tree, "Start new appointment").props.onClick();
    await Promise.resolve();
    tree = render();
    expect(mock.clear).toHaveBeenCalledOnce();
    expect(
      elements(tree).some((e) => e.props.children === "Start new appointment"),
    ).toBe(false);
    expect(new Date(field(tree, "Starts").props.value).toISOString()).toBe(
      slot.starts_at.replace("Z", ".000Z"),
    );
    expect(field(tree, "Room").props.value).toBe("6");
    field(tree, "Starts").props.onChange({
      target: { value: "2099-10-06T11:00" },
    });
    tree = render();
    expect(
      elements(tree).some((e) => e.props.children === "Start new appointment"),
    ).toBe(false);
    expect(mock.api).not.toHaveBeenCalled();
  });

  it("#153 keeps recovered values if clearing the working copy fails", async () => {
    mock.clear.mockResolvedValue(false);
    await button(render(), "Start new appointment").props.onClick();
    await Promise.resolve();
    const tree = render();
    expect(field(tree, "Starts").props.value).toBe("2099-10-05T10:00");
    expect(button(tree, "Start new appointment")).toBeDefined();
    expect(mock.api).not.toHaveBeenCalled();
  });

  it("#196 uses the same draft scope from generic and clicked-slot entry points", () => {
    render({ site_id: 4 });
    const generic = mock.workingDraft.mock.calls.at(-1)?.[0];
    const tree = render(slot);
    expect(mock.workingDraft.mock.calls.at(-1)?.[0]).toEqual(generic);
    expect(generic).toEqual({ kind: "appointment", patientId: undefined });
    expect(field(tree, "Starts").props.value).toBe("2099-10-05T10:00");
  });

  it.each([
    "This time is outside the site's operating hours.",
    "This time is outside the clinician's capacity template for this site.",
  ])(
    "#181 blocks another submit after definite rejection: %s",
    async (message) => {
      choosePatient(render());
      mock.api.mockRejectedValue(new ApiError(422, message));
      await form(render()).props.onSubmit({ preventDefault: vi.fn() });
      const tree = render();
      expect(button(tree, "Schedule appointment").props.disabled).toBe(true);
      expect(elements(tree).some((e) => e.props.children === message)).toBe(
        true,
      );
      expect(mock.api).toHaveBeenCalledOnce();
      expect(mock.api.mock.calls[0][0]).toBe("/api/clinic/appointments");
      expect(mock.api.mock.calls[0][1].body.appointment.starts_at).toBe(
        new Date("2099-10-05T10:00").toISOString(),
      );
      expect(onCreated).not.toHaveBeenCalled();
      form(tree).props.onChange();
      expect(button(render(), "Schedule appointment").props.disabled).toBe(
        false,
      );
    },
  );

  it("#216 clears a rejected recovered draft's validation when starting the clicked slot", async () => {
    choosePatient(render());
    mock.api.mockRejectedValue(
      new ApiError(
        422,
        "Choose an active site before scheduling this appointment.",
      ),
    );
    await form(render()).props.onSubmit({ preventDefault: vi.fn() });
    expect(
      elements(render()).some(
        (e) =>
          e.props.children ===
          "Choose an active site before scheduling this appointment.",
      ),
    ).toBe(true);
    await button(render(), "Start new appointment").props.onClick();
    await Promise.resolve();
    const tree = render();
    expect(
      elements(tree).some(
        (e) =>
          e.props.children ===
          "Choose an active site before scheduling this appointment.",
      ),
    ).toBe(false);
    expect(field(tree, "Room").props.value).toBe("6");
  });
  it("#153 preserves an uncertain request body and key when the clicked slot differs", async () => {
    const requested = {
      patient_id: "801",
      site_id: "4",
      room_id: "",
      booked_clinician_id: "9",
      visit_type_id: "2",
      starts_at: "2099-10-05T10:00:00Z",
      ends_at: "2099-10-05T10:30:00Z",
      request_key: "saved-uncertain-153",
    };
    mock.restored.attempt = { body: { appointment: requested } };
    mock.restored.outcomeUnconfirmed = true;
    let tree = render();
    expect(field(tree, "Starts").props.disabled).toBe(true);
    expect(
      elements(tree).some((e) => e.props.children === "Start new appointment"),
    ).toBe(false);
    expect(button(tree, "Retry same request").props.disabled).toBe(false);
    mock.api.mockRejectedValueOnce(
      new ApiError(500, "Synthetic response unavailable"),
    );
    await form(tree).props.onSubmit({ preventDefault: vi.fn() });
    tree = render();
    expect(button(tree, "Retry same request").props.disabled).toBe(false);
    expect(mock.clear).not.toHaveBeenCalled();
    const saved = {
      id: 901,
      patient_id: 801,
      site_id: 4,
      starts_at: requested.starts_at,
      ends_at: requested.ends_at,
      status: "scheduled",
    };
    mock.api.mockResolvedValueOnce({ appointment: saved });
    await form(tree).props.onSubmit({ preventDefault: vi.fn() });
    expect(mock.api).toHaveBeenCalledTimes(2);
    for (const call of mock.api.mock.calls)
      expect(call[1].body).toEqual({ appointment: requested });
    expect(onCreated).toHaveBeenCalledExactlyOnceWith(saved);
    expect(mock.clear).toHaveBeenCalledOnce();
  });
  it("does not accept a returned appointment with a different time as the submitted booking", async () => {
    choosePatient(render());
    mock.api.mockResolvedValueOnce({
      appointment: {
        id: 902,
        patient_id: 801,
        site_id: 4,
        status: "completed",
        starts_at: "2099-10-03T09:00:00Z",
        ends_at: "2099-10-03T09:30:00Z",
      },
    });
    await form(render()).props.onSubmit({ preventDefault: vi.fn() });
    const submitted = mock.api.mock.calls[0][1].body;
    expect(onCreated).not.toHaveBeenCalled();
    expect(mock.clear).not.toHaveBeenCalled();
    expect(mock.save.mock.calls.at(-1)?.[0]).toMatchObject({
      attempt: { body: submitted },
      outcomeUnconfirmed: true,
    });
    expect(button(render(), "Retry same request").props.disabled).toBe(false);
  });
});

function textContent(node: any): string {
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  return node?.props ? textContent(node.props.children) : "";
}
function activity(
  id: number,
  status: string,
  starts_at = "2099-10-05T09:00:00Z",
) {
  return {
    id,
    status,
    starts_at,
    ends_at: "2099-10-05T09:30:00Z",
    booked_clinician_id: 9,
    room_id: 6,
  };
}

describe("booking capacity and appointment activity", () => {
  it("#184 presents an empty activity list as information and explains the remaining gates", () => {
    const notice = find(
      render(),
      (element) =>
        element.type === "Alert" &&
        textContent(element).includes("No scheduled appointments"),
    );
    expect(notice.props.severity).toBe("info");
    expect(textContent(notice)).toContain(
      "Clinician assignment, capacity templates, and site hours are checked when you schedule.",
    );
  });

  it("#224 omits cancelled and other inactive appointments from scheduled resource activity", () => {
    mock.scheduled = [
      activity(1, "cancelled"),
      activity(2, "completed"),
      activity(3, "no_show"),
    ];
    expect(
      elements(render()).filter((element) => element.props.component === "li"),
    ).toHaveLength(0);
    mock.scheduled.push(activity(4, "scheduled"), activity(5, "confirmed"));
    expect(
      elements(render()).filter((element) => element.props.component === "li"),
    ).toHaveLength(2);
  });

  it("#151 cancelled and non-overlapping same-day activity does not disable or suppress booking submission", async () => {
    mock.scheduled = [activity(1, "cancelled"), activity(2, "scheduled")];
    choosePatient(render());
    expect(button(render(), "Schedule appointment").props.disabled).toBe(false);
    mock.api.mockImplementationOnce(async (_path, options) => ({
      appointment: {
        id: 950,
        patient_id: 801,
        site_id: 4,
        status: "scheduled",
        starts_at: options.body.appointment.starts_at,
        ends_at: options.body.appointment.ends_at,
      },
    }));
    await form(render()).props.onSubmit({ preventDefault: vi.fn() });
    expect(mock.api).toHaveBeenCalledOnce();
    expect(onCreated).toHaveBeenCalledOnce();
  });

  it("#222 assigning a slot preserves the capacity gate on the booking retry", async () => {
    choosePatient(render());
    mock.api.mockRejectedValueOnce(
      new ApiError(
        422,
        "The clinician is not assigned to this site for the selected time.",
      ),
    );
    await form(render()).props.onSubmit({ preventDefault: vi.fn() });
    const assign = button(
      render(),
      "Assign Synthetic clinician to SYN for this slot",
    );
    mock.api.mockResolvedValueOnce({ assignment: { id: 77 } });
    await assign.props.onClick();
    await Promise.resolve();
    let tree = render();
    expect(textContent(tree)).toContain(
      "Capacity templates and site hours still apply.",
    );
    mock.api.mockRejectedValueOnce(
      new ApiError(
        422,
        "The clinician has no capacity configured for this site.",
      ),
    );
    await form(tree).props.onSubmit({ preventDefault: vi.fn() });
    tree = render();
    expect(textContent(tree)).toContain(
      "The clinician has no capacity configured for this site.",
    );
    expect(button(tree, "Schedule appointment").props.disabled).toBe(true);
    expect(mock.api.mock.calls.map((call) => call[0])).toEqual([
      "/api/clinic/appointments",
      "/api/clinic/clinicians/9/assign_site",
      "/api/clinic/appointments",
    ]);
    expect(mock.api.mock.calls[1][1].body.assignment).toEqual({
      site_id: "4",
      starts_at: new Date("2099-10-05T10:00").toISOString(),
      ends_at: new Date("2099-10-05T10:30").toISOString(),
    });
    expect(mock.api.mock.calls[2][1].body.appointment).not.toHaveProperty(
      "capacity_override_reason",
    );
    expect(onCreated).not.toHaveBeenCalled();
  });
});

describe("Muse 133 protected close paths", () => {
  it.each(["appointment", "series", "hold"])(
    "Escape and Close preserve an uncertain %s request",
    async (kind) => {
      const intent = {
        patient_id: "801",
        site_id: "4",
        booked_clinician_id: "9",
        clinician_id: "9",
        visit_type_id: "2",
        starts_at: "2099-10-05T10:00:00Z",
        ends_at: "2099-10-05T10:30:00Z",
        request_key: "protected-close",
      };
      if (kind === "appointment") {
        mock.restored.attempt = { body: { appointment: intent } };
        mock.restored.outcomeUnconfirmed = true;
      } else if (kind === "series") {
        mock.restored.seriesAttempt = { body: { series: intent } };
        mock.restored.seriesOutcomeUnconfirmed = true;
        mock.restored.draft.repeat = "weekly";
      } else {
        mock.restored.holdAttempt = { body: { hold: intent } };
        mock.restored.holdOutcomeUnconfirmed = true;
      }
      const tree = render();
      const close = button(tree, "Close");
      expect(close.props.disabled).toBe(true);
      await close.props.onClick();
      find(
        tree,
        (element) => typeof element.props.onKeyDown === "function",
      ).props.onKeyDown({
        key: "Escape",
        defaultPrevented: false,
        stopPropagation: vi.fn(),
      });
      await Promise.resolve();
      expect(onClose).not.toHaveBeenCalled();
      expect(mock.clear).not.toHaveBeenCalled();
      expect(mock.save).not.toHaveBeenCalled();
      expect(mock.api).not.toHaveBeenCalled();
    },
  );
});

it("#133 Escape and Close cannot dismiss an in-flight appointment request", async () => {
  choosePatient(render());
  let rejectRequest: (error: unknown) => void = () => {};
  mock.api.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectRequest = reject;
      }),
  );
  const submitting = form(render()).props.onSubmit({ preventDefault: vi.fn() });
  await Promise.resolve();
  const tree = render();
  expect(button(tree, "Close").props.disabled).toBe(true);
  await button(tree, "Close").props.onClick();
  find(
    tree,
    (element) => typeof element.props.onKeyDown === "function",
  ).props.onKeyDown({
    key: "Escape",
    defaultPrevented: false,
    stopPropagation: vi.fn(),
  });
  expect(onClose).not.toHaveBeenCalled();
  expect(mock.clear).not.toHaveBeenCalled();
  rejectRequest(new ApiError(422, "Synthetic rejection"));
  await submitting;
});
it("#133 a child-handled Escape does not trigger a draft save or close", () => {
  find(
    render(),
    (element) => typeof element.props.onKeyDown === "function",
  ).props.onKeyDown({
    key: "Escape",
    defaultPrevented: true,
    stopPropagation: vi.fn(),
  });
  expect(onClose).not.toHaveBeenCalled();
  expect(mock.save).not.toHaveBeenCalled();
});
it("#72 an uncertain series retries its saved clinician and request despite a changed draft selection", async () => {
  const series = {
    patient_id: "801",
    site_id: "4",
    booked_clinician_id: "9",
    visit_type_id: "2",
    starts_at: "2099-10-05T10:00:00Z",
    ends_at: "2099-10-05T10:30:00Z",
    request_key: "protected-series",
    occurrence_count: 2,
  };
  mock.restored.seriesAttempt = { body: { series } };
  mock.restored.seriesOutcomeUnconfirmed = true;
  mock.restored.draft.repeat = "weekly";
  mock.restored.draft.clinicianId = "first_available";
  mock.api.mockRejectedValueOnce(
    new ApiError(500, "Synthetic uncertain response"),
  );
  await button(render(), "Retry same request").props.onClick();
  await vi.waitFor(() => expect(mock.api).toHaveBeenCalledOnce());
  expect(mock.api.mock.calls[0]).toEqual([
    "/api/clinic/appointment_series",
    { method: "POST", body: { series } },
  ]);
  expect(mock.clear).not.toHaveBeenCalled();
});
