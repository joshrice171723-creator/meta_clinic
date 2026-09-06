import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Login } from "../src/features/identity/Login";

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
            email_address: "clinician1@test.com",
            destination: "/clinic",
          },
          {
            id: "customer-client-a",
            label: "Customer A",
            account_type: "customer",
            email_address: "test-client-a@example.invalid",
            destination: "/portal",
          },
        ]}
      />,
    );
    expect(html).toContain("Development environment");
    expect(html).toContain("Employee portal");
    expect(html).toContain("Customer portal");
    expect(html).toContain("Active account");
    expect(html).toContain("2032-04-15");
    expect(html).toContain("Uses the real current time with this date.");
    expect(html.toLowerCase()).not.toContain("omni");
  });

  it("keeps account and date controls out of the production login", () => {
    const html = renderToStaticMarkup(
      <Login developmentLogin={false} environment="production" />,
    );
    expect(html).toContain("Production");
    expect(html).not.toContain("Development account preview");
    expect(html).not.toContain("App date");
    expect(html).toContain("Email address");
  });
});
