import { describe, expect, it } from "vitest";
import {
  freshInboxPages,
  inboxPageCount,
  visibleInboxSource,
} from "../src/features/clinic/workInboxPaging";

describe("work inbox scoped paging", () => {
  it("resets each independent queue on filter changes instead of restoring an old page", () => {
    const original = {
      ...freshInboxPages("all:all"),
      staff: 3,
      encounters: 2,
      renewals: 5,
      labReview: 4,
    };
    expect(original.labFollowUp).toBe(1);
    const filtered = freshInboxPages("mine:staff");
    expect(Object.values(filtered).slice(1)).toEqual([1, 1, 1, 1, 1]);
    expect(freshInboxPages("all:all")).not.toEqual(original);
    expect(freshInboxPages("all:all").staff).toBe(1);
  });
  it("makes every partial page navigable, including the last row after fifty", () => {
    expect(inboxPageCount({ page: 1, per_page: 50, total: 51 })).toBe(2);
    expect(inboxPageCount({ page: 1, per_page: 50, total: 100 })).toBe(2);
    expect(inboxPageCount({ page: 1, per_page: 50, total: 101 })).toBe(3);
    expect(inboxPageCount({ page: 1, per_page: 50, total: 0 })).toBe(1);
  });

  it.each([
    "page-2",
    "practice-B",
    "patient-owner-B",
    "site-B",
    "role-B",
    "filter-mine",
  ])(
    "suppresses previous rows immediately when scope becomes %s",
    (nextScope) => {
      expect(
        visibleInboxSource(nextScope, true, {
          key: "original-scope",
          loading: false,
          data: { items: ["Synthetic old-scope work"] },
        }),
      ).toEqual({ loading: true });
    },
  );

  it("does not expose stale errors or data when a source is disabled", () => {
    expect(
      visibleInboxSource("scope", false, {
        key: "scope",
        loading: false,
        data: ["Synthetic work"],
        error: "Synthetic error",
      }),
    ).toEqual({ loading: false });
  });

  it("shows only the current failed page until that same page is acknowledged", () => {
    const failed = {
      key: "page-2",
      loading: false,
      error: "Synthetic failed page",
    };
    expect(visibleInboxSource("page-2", true, failed)).toEqual(failed);
    expect(
      visibleInboxSource("page-2", true, { key: "page-2", loading: true }),
    ).toEqual({
      key: "page-2",
      loading: true,
    });
    const acknowledged = {
      key: "page-2",
      loading: false,
      data: ["Synthetic row 51"],
    };
    expect(visibleInboxSource("page-2", true, acknowledged)).toEqual(
      acknowledged,
    );
    expect(visibleInboxSource("page-3", true, acknowledged)).toEqual({
      loading: true,
    });
  });
  it("retains same-page rows during refresh while exposing their loading or failed state", () => {
    const refreshing = {
      key: "page-2",
      loading: true,
      data: ["Synthetic row 51"],
    };
    expect(visibleInboxSource("page-2", true, refreshing)).toEqual(refreshing);
    const failed = {
      ...refreshing,
      loading: false,
      error: "Synthetic refresh failed",
    };
    expect(visibleInboxSource("page-2", true, failed)).toEqual(failed);
    expect(visibleInboxSource("page-3", true, failed)).toEqual({
      loading: true,
    });
  });
});
