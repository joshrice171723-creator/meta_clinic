import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkInbox } from "../src/features/clinic/WorkInbox";
vi.mock("@mui/material", async (original) => {
  const mui = await original<typeof import("@mui/material")>();
  return {
    ...mui,
    Accordion: (props: import("@mui/material").AccordionProps) => (
      <mui.Accordion {...props} defaultExpanded />
    ),
  };
});

const fixture = vi.hoisted(() => ({
  assignment: "all" as "all" | "overdue",
  page: 1,
  failed: false,
  paths: [] as string[],
}));

vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  return {
    ...react,
    useState<T>(initial: T | (() => T)) {
      let value =
        typeof initial === "function" ? (initial as () => T)() : initial;
      if (typeof initial === "function" && value === "all")
        value = fixture.assignment as T;
      if (
        value &&
        typeof value === "object" &&
        "scope" in value &&
        "labFollowUp" in value
      )
        value = { ...value, labFollowUp: fixture.page };
      if (
        value &&
        typeof value === "object" &&
        Object.keys(value).join() === "loading"
      )
        value = { loading: false } as T;
      return react.useState(value);
    },
  };
});

vi.mock("../src/features/clinic/Workspace", () => ({
  useClinic: () => ({
    capabilities: { patients: true, notes_read: true },
    current_site: null,
    practice: { id: 11 },
    user_id: 22,
  }),
}));
vi.mock("../src/features/clinic/ClinicRealtime", () => ({
  useClinicRealtimeTopic: () => undefined,
}));
vi.mock("../src/features/clinic/PrescriptionReconciliationWorklist", () => ({
  PrescriptionReconciliationWorklist: () => null,
}));
vi.mock("../src/features/clinic/workInboxPaging", async (original) => {
  const paging =
    await original<typeof import("../src/features/clinic/workInboxPaging")>();
  return {
    ...paging,
    usePagedInboxSource(path: string, enabled: boolean) {
      if (!enabled) return { loading: false };
      fixture.paths.push(path);
      if (!path.includes("follow_up_queue"))
        return {
          loading: false,
          data: {
            items: [],
            pagination: { page: 1, per_page: 50, total: 0 },
            can_review: false,
          },
        };
      if (fixture.failed)
        return { loading: false, error: "Synthetic page unavailable" };
      const page = Number(
        new URL(path, "http://localhost").searchParams.get("page"),
      );
      const rows = Array.from({ length: 51 }, (_, index) => {
        const overdue = index === 50;
        const priority = overdue ? "routine" : "critical";
        return {
          patient: {
            id: index + 1,
            display_name: overdue
              ? "Synthetic overdue patient at row 51"
              : `Synthetic future patient ${index + 1}`,
            reference: null,
          },
          report_id: index + 101,
          version: {
            id: index + 201,
            title: "Synthetic result contact follow-up",
            issued_at: "2026-09-01T00:00:00Z",
            result_priority: priority,
          },
          follow_up: {
            id: index + 301,
            state: "open",
            instructions: "Synthetic contact task",
            priority,
            due_at: overdue ? "2026-09-29T00:00:00Z" : "2026-10-10T00:00:00Z",
          },
        };
      });
      return {
        loading: false,
        data: {
          items: rows.slice((page - 1) * 50, page * 50),
          pagination: { page, per_page: 50, total: rows.length },
          can_complete: false,
        },
      };
    },
  };
});

describe("Work Inbox overdue lab page coverage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T20:00:00Z"));
    vi.stubGlobal("window", {
      location: { href: "http://localhost/clinic/work-inbox", search: "" },
    });
    fixture.assignment = "all";
    fixture.page = 1;
    fixture.failed = false;
    fixture.paths = [];
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reaches a routine overdue item beyond fifty future critical items under the Overdue filter", () => {
    fixture.assignment = "overdue";
    const firstPage = renderToStaticMarkup(<WorkInbox />);
    expect(firstPage).toContain("No matching work on the loaded pages");
    expect(firstPage).toContain(
      "Open More queue pages to check the remaining work",
    );
    expect(firstPage).toContain('aria-label="Next Lab follow-up page"');
    expect(firstPage).toContain("51 source items");
    expect(firstPage).not.toContain("Synthetic overdue patient at row 51");

    fixture.page = 2;
    const secondPage = renderToStaticMarkup(<WorkInbox />);
    expect(fixture.paths).toContain(
      "/api/clinic/lab_reports/follow_up_queue?page=2&per_page=50",
    );
    expect(secondPage).toContain("Synthetic overdue patient at row 51");
    expect(secondPage).toContain(
      'href="/clinic/patients/51?lab_report_id=151&amp;lab_version_id=251"',
    );
    expect(secondPage).not.toContain("No matching work");
  });

  it("retains failed-page retry in Overdue and does not report a clear queue", () => {
    fixture.assignment = "overdue";
    fixture.page = 2;
    fixture.failed = true;
    const html = renderToStaticMarkup(<WorkInbox />);
    expect(fixture.paths).toContain(
      "/api/clinic/lab_reports/follow_up_queue?page=2&per_page=50",
    );
    expect(html).toContain('aria-label="Retry Lab follow-up page"');
    expect(html).toContain("Page 2 unavailable");
    expect(html).toContain(
      "Retry the unavailable sources before treating this view as clear",
    );
    expect(html).not.toContain("No matching work");
  });
});
