import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClinicScopeSelector } from "../src/features/clinic/ClinicScopeSelector";
import { LocationSetupNotice } from "../src/features/clinic/Workspace";
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

  it("links setup administrators to their only unfinalized location", () => {
    const context = {
      practice: { id: 2, name: "Independent clinic" },
      sites: [],
      setup_incomplete_sites: [
        { id: 7, name: "North clinic", code: "NORTH", finalized: false },
      ],
      current_site: null,
      capabilities: { clinic_setup_write: true },
    } as unknown as ClinicWorkspaceContext;
    const html = renderToStaticMarkup(
      <ClinicScopeSelector
        context={context}
        onPracticeChange={() => {}}
        onLocationChange={() => {}}
      />,
    );
    const text = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/g, "")
      .replace(/<[^>]+>/g, "");
    expect(text).toContain("North clinic");
    expect(text).toContain("finalized yet");
    expect(text).toContain("complete clinic setup to open");
    expect(html).toContain('href="/clinic/setup"');
  });

  it("keeps the selector fields and option lists readable in every clinic theme", () => {
    const source = renderToStaticMarkup(
      <ClinicScopeSelector
        context={
          {
            practice: { id: 2, name: "North clinic" },
            sites: [],
            current_site: null,
          } as unknown as ClinicWorkspaceContext
        }
        onPracticeChange={() => {}}
      />,
    );
    expect(source).toContain("#f3f4f6");
    expect(source).toContain("#111827");
  });
});

describe("incomplete location recovery", () => {
  const sites = [
    { id: 7, name: "North location", code: "NORTH", finalized: false },
  ] as ClinicWorkspaceContext["sites"];

  it("names the blocked location and links administrators to setup", () => {
    const html = renderToStaticMarkup(
      <LocationSetupNotice sites={sites} canSetup />,
    );
    expect(html).toContain("North location");
    expect(html).toContain("isn&#x27;t finalized yet");
    expect(html).toContain('href="/clinic/setup"');
  });

  it("does not offer a setup link to staff without permission", () => {
    const html = renderToStaticMarkup(
      <LocationSetupNotice sites={sites} canSetup={false} />,
    );
    expect(html).toContain("Ask a clinic administrator");
    expect(html).not.toContain('href="/clinic/setup"');
  });

  it("selects a location before opening setup when a location choice is required", () => {
    const html = renderToStaticMarkup(
      <LocationSetupNotice sites={sites} canSetup onSelect={() => {}} />,
    );
    expect(html).toContain("Complete clinic setup");
    expect(html).not.toContain('href="/clinic/setup"');
  });
});
