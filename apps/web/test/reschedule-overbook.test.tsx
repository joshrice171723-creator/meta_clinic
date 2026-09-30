import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { isValidElement, type ReactNode } from "react";
import {
  rescheduleOverbookIssue,
  rescheduleOverbookRequest,
  type RescheduleOverbookPolicy,
} from "../src/features/clinic/rescheduleOverbook";
import {
  RescheduleDialog,
  type RescheduleDraft,
} from "../src/features/clinic/FrontDesk";
import type { FrontDeskAppointment } from "../src/features/clinic/frontDeskModel";

const policy: RescheduleOverbookPolicy = {
  can_overbook: true,
  policy: { revision: 3, overbook_enabled: true, eligible_visit_type_ids: [7] },
};
const draft: RescheduleDraft = {
  appointment: {
    id: 11,
    patient_id: 21,
    site_id: 4,
    booked_clinician_id: 5,
    visit_type_id: 7,
    visit_modality: "in_person",
  } as FrontDeskAppointment,
  startsAt: "2026-11-04T09:00",
  endsAt: "2026-11-04T09:30",
  siteId: "4",
  roomId: "6",
  clinicianId: "5",
  visitTypeId: "7",
  serviceOfferingId: "",
  requestKey: "synthetic-reschedule",
  error: "",
  busy: false,
  outcomeUnconfirmed: false,
  overbookRequested: true,
  overbookReason: " Synthetic overlap reason ",
  expectedPolicyRevision: 3,
};

function dialogView(
  current: RescheduleDraft,
  currentPolicy?: RescheduleOverbookPolicy,
  onChange: (next: RescheduleDraft | undefined) => void = vi.fn(),
) {
  return RescheduleDialog({
    draft: current,
    clinicTimezone: "UTC",
    sites: [],
    clinicians: [],
    visitTypes: [],
    rooms: [],
    offerings: [],
    overbookPolicy: currentPolicy,
    onRefreshPolicy: vi.fn(),
    onChange,
    onClose: vi.fn(),
    onSave: vi.fn(),
    onRefresh: vi.fn(),
  });
}

function dialog(
  current: RescheduleDraft,
  currentPolicy?: RescheduleOverbookPolicy,
) {
  const view = dialogView(current, currentPolicy);
  // MUI's Dialog portal needs a browser. Render its actual title/body/actions
  // directly for this focused node check; dialog focus behavior is not claimed.
  return renderToStaticMarkup(<>{view.props.children}</>);
}

function field(
  node: ReactNode,
  label: string,
): Record<string, unknown> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = field(child, label);
      if (match) return match;
    }
  }
  if (!isValidElement<Record<string, unknown>>(node)) return undefined;
  if (node.props.label === label) return node.props;
  return field(node.props.children as ReactNode, label);
}

describe("reasoned rescheduling exceptions", () => {
  it("sends the explicit reason and captured policy revision", () => {
    expect(rescheduleOverbookIssue(draft, policy)).toBe("");
    expect(rescheduleOverbookRequest(draft)).toEqual({
      overbook_reason: "Synthetic overlap reason",
      expected_policy_revision: 3,
    });
  });
  it("keeps ordinary changes independent of policy and discards dormant exception fields", () => {
    const ordinary = { ...draft, overbookRequested: false };
    expect(rescheduleOverbookIssue(ordinary)).toBe("");
    expect(rescheduleOverbookRequest(ordinary)).toEqual({});
  });
  it("rejects absent permission, unavailable policy and an ineligible type", () => {
    expect(rescheduleOverbookIssue(draft)).toMatch(/unavailable/);
    expect(
      rescheduleOverbookIssue(draft, { ...policy, can_overbook: false }),
    ).toMatch(/unavailable/);
    expect(
      rescheduleOverbookIssue(draft, {
        ...policy,
        policy: { ...policy.policy, overbook_enabled: false },
      }),
    ).toMatch(/unavailable/);
    expect(
      rescheduleOverbookIssue({ ...draft, visitTypeId: "8" }, policy),
    ).toMatch(/eligible/);
  });
  it("requires a bounded nonempty reason", () => {
    expect(
      rescheduleOverbookIssue({ ...draft, overbookReason: " " }, policy),
    ).toMatch(/reason/);
    expect(
      rescheduleOverbookIssue(
        { ...draft, overbookReason: "x".repeat(501) },
        policy,
      ),
    ).toMatch(/reason/);
  });
  it("requires renewed selection after a policy change and never silently rewrites a retry", () => {
    const original = rescheduleOverbookRequest(draft);
    expect(
      rescheduleOverbookIssue(draft, {
        ...policy,
        policy: { ...policy.policy, revision: 4 },
      }),
    ).toMatch(/changed/);
    const uncertain = { ...draft, outcomeUnconfirmed: true };
    expect(rescheduleOverbookRequest(uncertain)).toEqual(original);
    expect(draft.expectedPolicyRevision).toBe(3);
  });
  it("shows the opted-in reason control and explicit hard capacity boundaries", () => {
    const html = dialog(draft, policy);
    expect(html).toContain("Overbook reason");
    expect(html).toContain("overlap exactly one clinician appointment");
    expect(html).toContain("separate physical room");
    expect(html).toContain("Refresh scheduling policy");
  });
  it("captures the selected policy in the actual exception checkbox handler", () => {
    const onChange = vi.fn();
    const view = dialogView(
      { ...draft, overbookRequested: false },
      policy,
      onChange,
    );
    const checkbox = field(
      view,
      "Request a clinician overbook exception for this change",
    )?.control;
    if (
      !isValidElement<{ onChange: (event: unknown, checked: boolean) => void }>(
        checkbox,
      )
    )
      throw new Error("Missing exception control");
    checkbox.props.onChange(null, true);
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({
      overbookRequested: true,
      expectedPolicyRevision: 3,
    });
    expect(onChange.mock.calls[0]?.[0].requestKey).not.toBe(draft.requestKey);
  });
  it("clears site-bound exception selection without discarding the reason when location changes", () => {
    const onChange = vi.fn();
    const view = dialogView(draft, policy, onChange);
    const site = field(view, "Site");
    (site?.onChange as (event: unknown) => void)({ target: { value: "8" } });
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({
      siteId: "8",
      roomId: "",
      overbookRequested: false,
      expectedPolicyRevision: undefined,
      overbookReason: draft.overbookReason,
    });
  });
  it("freezes the reason and exception toggle during uncertain outcomes", () => {
    const view = dialogView({ ...draft, outcomeUnconfirmed: true }, policy);
    const checkbox = field(
      view,
      "Request a clinician overbook exception for this change",
    )?.control;
    if (!isValidElement<{ disabled: boolean }>(checkbox))
      throw new Error("Missing exception control");
    expect(checkbox.props.disabled).toBe(true);
    expect(field(view, "Overbook reason")?.disabled).toBe(true);
  });
  it("offers no exception selection when site policy or permission is absent", () => {
    const ordinary = { ...draft, overbookRequested: false };
    expect(
      field(
        dialogView(ordinary),
        "Request a clinician overbook exception for this change",
      ),
    ).toBeUndefined();
    expect(
      field(
        dialogView(ordinary, { ...policy, can_overbook: false }),
        "Request a clinician overbook exception for this change",
      ),
    ).toBeUndefined();
  });
});
