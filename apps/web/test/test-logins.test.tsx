import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Login } from "../src/features/identity/Login";
import {
  DevelopmentControls,
  DevelopmentToolbar,
  EnvironmentLabel,
} from "../src/features/identity/DevelopmentAccountSwitcher";

describe("login environment before the server responds", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(["localhost", "127.0.0.1", "127.0.0.2", "[::1]"])(
    "identifies %s immediately without granting development access",
    (hostname) => {
      vi.stubGlobal("window", { location: { hostname, search: "" } });
      const html = renderToStaticMarkup(<Login developmentLogin={false} />);
      expect(html).toContain("Local development");
      expect(html).not.toContain("Checking");
      expect(html).not.toContain("Development tools");
      expect(html).toContain("Password");
    },
  );

  it.each([
    "aimetaclinic.com",
    "127.0.0.1.example.com",
    "localhost.example.com",
  ])(
    "does not infer development access or production status for %s",
    (hostname) => {
      vi.stubGlobal("window", { location: { hostname } });
      expect(
        renderToStaticMarkup(<EnvironmentLabel environment="unknown" />),
      ).toBe("");
    },
  );

  it("honors a production server reached through loopback", () => {
    vi.stubGlobal("window", { location: { hostname: "127.0.0.1" } });
    const html = renderToStaticMarkup(
      <EnvironmentLabel environment="production" />,
    );
    expect(html).toContain("Production");
    expect(html).not.toContain("Local development");
  });

  it("shows a recoverable configuration failure instead of Checking", () => {
    const html = renderToStaticMarkup(
      <Login developmentLogin={false} configurationError />,
    );
    expect(html).toContain("Unable to load login options");
    expect(html).toContain("Retry");
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("Checking");
  });
});

describe("development account preview", () => {
  afterEach(() => vi.unstubAllGlobals());
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
            organization: { id: 1, name: "Weight care group" },
            clinic: { id: 5, name: "Weight management" },
            locations: [{ id: 4, name: "Main location", code: "MAIN" }],
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
    expect(html).toContain("Omni");
    expect(html).toContain("Select clinic team account");
    expect(html).toContain("Streamline your practice.");
    expect(html).toContain("Scale your organization.");
    expect(html).toContain(">Owner<");
    expect(html).toContain(">Launch<");
    expect(html).toContain(">Patient<");
    expect(html).toContain(">Clinic<");
    expect(html).toContain("Log in");
    expect(html).toContain("Development tools");
    expect(html).toContain(
      "Choose an organization and account, or create a new organization.",
    );
    expect(html).toContain("2032-04-15");
    expect(html).toContain("Apply date");
    expect(html).toContain('min="2000-01-01"');
    expect(html).toContain('max="2100-12-31"');
    expect(html).toContain("Login and permissions use real time.");
    expect(html).not.toContain("Email address");
    expect(html).not.toContain("Password");
    expect(html).not.toContain(">Sign in<");
    expect(html).toContain('href="/workforce/activate"');
    expect(html).toContain("Activate with invitation code");
    expect(html).not.toContain("clinician1@test.com");
  });

  it("asks for a PIN only on the public demo Owner choice", () => {
    vi.stubGlobal("window", {
      location: { hostname: "aimetaclinic.com", search: "?next=%2Fowner" },
    });
    const html = renderToStaticMarkup(
      <Login
        developmentLogin
        ownerPinRequired
        environment="test"
        developmentAccounts={[]}
      />,
    );
    expect(html).toContain("Development tools");
    expect(html).toContain("Owner demo PIN");
    expect(html).toContain("Enter the four-digit Owner demo PIN.");
    expect(html).toContain('href="/login?credentials=1&amp;next=%2Fowner"');
    expect(html).toContain('href="/login?credentials=1&amp;next=%2Fclinic"');
    expect(html).not.toContain("Email address");
    expect(html).not.toContain("Password");
  });

  it("keeps the existing owner credential form available separately", () => {
    vi.stubGlobal("window", {
      location: {
        hostname: "aimetaclinic.com",
        search: "?credentials=1&next=%2Fowner",
      },
    });
    const html = renderToStaticMarkup(
      <Login
        developmentLogin
        ownerPinRequired
        environment="test"
        developmentAccounts={[]}
      />,
    );
    expect(html).toContain("Email address");
    expect(html).toContain("Password");
    expect(html).not.toContain("Development tools");
  });

  it("gates unique clinic scope choices and includes their row IDs", () => {
    const html = renderToStaticMarkup(
      <DevelopmentControls
        businessDate="2032-04-15"
        initialPortal="clinic"
        accounts={[
          {
            id: "employee-clinician",
            label: "Clinician",
            account_type: "employee",
            destination: "/clinic",
            organization: { id: 1, name: "Weight care group" },
            clinic: { id: 5, name: "Weight management" },
            locations: [{ id: 4, name: "Main location", code: "MAIN" }],
          },
          {
            id: "employee-staff",
            label: "Clinic staff",
            account_type: "employee",
            destination: "/clinic",
            organization: { id: 1, name: "Weight care group" },
            clinic: { id: 5, name: "Weight management" },
            locations: [{ id: 4, name: "Main location", code: "MAIN" }],
          },
        ]}
      />,
    );
    for (const text of ["Organization", "Clinic", "Location"])
      expect(html).toContain(text);
  });

  it("keeps account and date controls out of the production login", () => {
    const html = renderToStaticMarkup(
      <Login developmentLogin={false} environment="production" />,
    );
    expect(html).toContain("Production");
    expect(html).not.toContain("Account access");
    expect(html).not.toContain("App date");
    expect(html).not.toContain('href="/workforce/activate"');
    expect(html).toContain("Email address");
    expect(html).toContain("New to a clinic?");
    expect(html).toContain('href="/memberships"');
    expect(html).toContain("without an account");
  });

  it.each(["development", "production"] as const)(
    "starts workspace tools collapsed in %s",
    (environment) => {
      const html = renderToStaticMarkup(
        <DevelopmentToolbar
          environment={environment}
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
      expect(html).toContain('aria-expanded="false"');
      expect(html).toContain("aria-controls=");
    },
  );
});
