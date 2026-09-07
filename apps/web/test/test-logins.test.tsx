import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Login } from "../src/features/identity/Login";
import { DevelopmentToolbar } from "../src/features/identity/DevelopmentAccountSwitcher";

describe("development account preview", () => {
  it("shows distinct backend-owned account groups and a business date", () => {
    const html = renderToStaticMarkup(
      <Login
        developmentLogin
        environment="development"
        businessDate="2032-04-15"
        developmentAccounts={[
          {
            id: "employee-clinician",
            label: "Clinician",
            account_type: "employee",
            destination: "/clinic",
          },
          {
            id: "patient-14",
            label: "Alex Patient",
            account_type: "patient",
            destination: "/patient-portal",
          },
        ]}
      />,
    );
    expect(html).toContain("Omni");
    expect(html).toContain("Patient portal");
    expect(html).toContain("Employee portal");
    expect(html).toContain("Omni");
    expect(html).toContain("Select patient account");
    expect(html).toContain("Log in");
    expect(html).toContain("Choose a portal and account, then log in");
    expect(html).toContain("2032-04-15");
    expect(html).toContain("Uses the real current time with this date.");
    expect(html).not.toContain("Email address");
    expect(html).not.toContain("Password");
    expect(html).not.toContain(">Sign in<");
    expect(html).not.toContain("clinician1@test.com");
  });

  it("keeps account and date controls out of the production login", () => {
    const html = renderToStaticMarkup(
      <Login developmentLogin={false} environment="production" />,
    );
    expect(html).toContain("Production");
    expect(html).not.toContain("Account access");
    expect(html).not.toContain("App date");
    expect(html).toContain("Email address");
  });

  it("presents in-app controls as a separate developer utility region", () => {
    const html = renderToStaticMarkup(
      <DevelopmentToolbar
        environment="development"
        businessDate="2032-04-15"
        accounts={[
          {
            id: "patient-14",
            label: "Alex Patient",
            account_type: "patient",
            destination: "/patient-portal",
          },
        ]}
      />,
    );
    expect(html).toContain("<aside");
    expect(html).toContain("development-toolbar");
    expect(html).toContain('aria-label="Workspace tools"');
    expect(html).toContain("Workspace tools");
  });
});
