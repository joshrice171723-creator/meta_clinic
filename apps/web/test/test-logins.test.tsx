import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Login } from "../src/features/identity/Login";

describe("local named test logins", () => {
  it("offers backend-owned Omni access only when local access is enabled", () => {
    const html = renderToStaticMarkup(<Login developmentLogin />);
    expect(html).toContain("Open Omni patient portal");
    expect(html).toContain("OmniLogin");
    expect(html).toContain(
      "loads patient and billing records from the backend",
    );
    expect(html).toContain("Test Client A");
    expect(html).toContain("Test Client B");
    expect(html).toContain("Test Admin");
    expect(html).toContain('name="profile"');
    expect(html).toContain("Use test login");
    expect(html).toContain("Continue as demo client");
    expect(html).not.toContain("Open synthetic patient portal");
    expect(html).toContain("Settings → Development view");
  });

  it("keeps test identities out of the normal hosted login", () => {
    const html = renderToStaticMarkup(<Login developmentLogin={false} />);
    expect(html).not.toContain('name="profile"');
    expect(html).not.toContain("Test Admin");
    expect(html).not.toContain("Use test login");
    expect(html).not.toContain("OmniLogin");
    expect(html).toContain("Email address");
  });
});
