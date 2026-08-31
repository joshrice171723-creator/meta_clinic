import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Login } from "../src/features/identity/Login";

describe("local named test logins", () => {
  it("offers distinct persistent identities only when local access is enabled", () => {
    const html = renderToStaticMarkup(<Login developmentLogin />);
    for (const label of [
      "Test Client A",
      "Test Client B",
      "Test Admin",
      "Test Disabled",
    ])
      expect(html).toContain(label);
    expect(html).toContain('name="profile"');
    expect(html).toContain("Sessions end 12 hours after login");
    expect(html).toContain("Continue as demo client");
  });

  it("keeps test identities out of the normal hosted login", () => {
    const html = renderToStaticMarkup(<Login developmentLogin={false} />);
    expect(html).not.toContain('name="profile"');
    expect(html).not.toContain("Test Admin");
    expect(html).not.toContain("Use test login");
    expect(html).toContain("Email address");
  });
});
