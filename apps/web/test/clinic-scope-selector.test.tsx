import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClinicScopeSelector } from "../src/features/clinic/ClinicScopeSelector";
import type { ClinicWorkspaceContext } from "../src/api/contracts";

describe("clinic scope selector", () => {
  it("renders the current organization, clinic and location with explicit labels", () => {
    const context = {
      practice: { id: 2, name: "North clinic", timezone: "America/Chicago" },
      practices: [
        {
          id: 2,
          name: "North clinic",
          organization: { id: 1, name: "Example group" },
        },
        {
          id: 3,
          name: "South clinic",
          organization: { id: 1, name: "Example group" },
        },
        { id: 4, name: "Independent clinic", organization: null },
      ],
      current_site: { id: 5, name: "Main street", code: "MAIN" },
      sites: [{ id: 5, name: "Main street", code: "MAIN" }],
    } as ClinicWorkspaceContext;
    const html = renderToStaticMarkup(
      <ClinicScopeSelector
        context={context}
        onPracticeChange={() => {}}
        onLocationChange={() => {}}
      />,
    );
    for (const text of [
      "Organization",
      "Clinic",
      "Location",
      "Example group",
      "North clinic",
      "Main street",
    ])
      expect(html).toContain(text);
    expect(html.match(/role="combobox"/g)).toHaveLength(3);
  });

  it("handles independent clinics with no accessible locations", () => {
    const context = {
      practice: { id: 2, name: "Independent clinic" },
      sites: [],
      current_site: null,
    } as unknown as ClinicWorkspaceContext;
    const html = renderToStaticMarkup(
      <ClinicScopeSelector
        context={context}
        onPracticeChange={() => {}}
        onLocationChange={() => {}}
      />,
    );
    expect(html).toContain("Independent clinics");
    expect(html).toContain("No accessible locations");
  });
});
