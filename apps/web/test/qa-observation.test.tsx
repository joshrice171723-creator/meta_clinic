import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@mui/material", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mui/material")>();
  return {
    ...actual,
    Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <section role="dialog">{children}</section> : null,
  };
});

import { QaObservationDialog } from "../src/features/qa/QaObservationDialog";

describe("QA text observation form", () => {
  const revision = "a".repeat(40);
  const render = (open = true) =>
    renderToStaticMarkup(
      <QaObservationDialog
        open={open}
        revision={revision}
        tasks={[]}
        onClose={() => {}}
        onSaved={async () => {}}
      />,
    );

  it("offers a build-attributed text receipt without a required screenshot", () => {
    const html = render();
    expect(html).toContain("Record observation");
    expect(html).toContain(revision);
    expect(html).toContain("Summary");
    expect(html).toContain("Details and source");
    expect(html).toContain('name="summary"');
    expect(html).toContain('name="details"');
    expect(html).not.toContain('type="file"');
  });

  it("requires explicit provenance and keeps task completion separate", () => {
    const html = render();
    expect(html).toContain("Source of this note");
    expect(html).toContain("Tasks and defect verdicts remain unchanged.");
    expect(html).toContain("Related task (optional)");
    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*>Save observation<\/button>/,
    );
  });

  it("shows unknown metadata without requiring a pin or screenshot", () => {
    const html = renderToStaticMarkup(
      <QaObservationDialog
        open
        revision="unobserved"
        tasks={[]}
        onClose={() => {}}
        onSaved={async () => {}}
      />,
    );
    expect(html).toContain("unobserved");
    expect(html).toContain("automatic build observations");
    expect(html).not.toContain("Confirm pin");
    expect(html).not.toContain('type="file"');
  });

  it("does not render receipt fields when closed", () => {
    expect(render(false)).not.toContain('name="summary"');
  });
});
